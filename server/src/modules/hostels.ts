import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, notFound } from "../lib/http";
import { validateBody } from "../middleware/validate";
import { requirePermission, accessibleHostelIds, assertHostelAccess } from "../middleware/rbac";
import { audit } from "../lib/audit";
import { invalidateCompanyAuth } from "../middleware/auth";
import { redateOpenCharges, residentDueDay, switchToCalendar } from "../lib/rent";

const router = Router();

const hostelSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  address: z.string().optional(),
  city: z.string().optional(),
  contactNumber: z.string().optional(),
  mapsUrl: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  propertyRent: z.coerce.number().min(0).default(0),
  propertyDeposit: z.coerce.number().min(0).default(0),
  noticePeriodDays: z.coerce.number().int().min(0).default(30),
  rentDueDay: z.coerce.number().int().min(1).max(28).default(5),
});

// GET /api/hostels — list accessible hostels with live occupancy stats.
router.get(
  "/",
  requirePermission("hostels.view"),
  asyncHandler(async (req, res) => {
    const ids = await accessibleHostelIds(req);
    // Three queries for all hostels together (not three per hostel).
    const [hostels, bedGroups, residentGroups] = await Promise.all([
      prisma.hostel.findMany({
        where: { id: { in: ids } },
        orderBy: { name: "asc" },
        include: { _count: { select: { beds: true, residents: true } } },
      }),
      prisma.bed.groupBy({ by: ["hostelId", "status"], where: { hostelId: { in: ids } }, _count: { _all: true } }),
      prisma.resident.groupBy({ by: ["hostelId"], where: { hostelId: { in: ids }, status: "ACTIVE" }, _count: { _all: true } }),
    ]);
    const beds = (hostelId: string, status: string) => bedGroups.find((g) => g.hostelId === hostelId && g.status === status)?._count._all ?? 0;

    const withStats = hostels.map((h) => {
        const occupied = beds(h.id, "OCCUPIED");
        const available = beds(h.id, "AVAILABLE");
        const activeResidents = residentGroups.find((g) => g.hostelId === h.id)?._count._all ?? 0;
        return {
          ...h,
          propertyRent: Number(h.propertyRent),
          propertyDeposit: Number(h.propertyDeposit),
          stats: {
            totalBeds: h._count.beds,
            occupiedBeds: occupied,
            availableBeds: available,
            activeResidents,
            occupancyRate: h._count.beds ? Math.round((occupied / h._count.beds) * 100) : 0,
          },
        };
      });
    res.json(withStats);
  })
);

// GET /api/hostels/accessible — minimal list of hostels the user may work with.
// Available to ANY authenticated user (managers, accountants, kitchen, staff)
// so hostel dropdowns and the hostel switcher work regardless of hostels.view.
router.get(
  "/accessible",
  asyncHandler(async (req, res) => {
    const ids = await accessibleHostelIds(req);
    const hostels = await prisma.hostel.findMany({
      where: { id: { in: ids } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, city: true, rentDueDay: true },
    });
    res.json(hostels);
  })
);

// ---- Rent due dates ------------------------------------------------------
// Each hostel has one rent due date ("due 1st–5th"). Residents follow it
// unless they have their own due day or a join-day (anchored) cycle — those
// are listed as exceptions so they can be brought in line in one step.

const CURRENT = ["ACTIVE", "NOTICE_GIVEN"] as const;

// GET /api/hostels/rent-settings — every accessible hostel's due day, how many
// monthly residents follow it, and who doesn't.
router.get(
  "/rent-settings",
  requirePermission("hostels.view"),
  asyncHandler(async (req, res) => {
    const ids = await accessibleHostelIds(req);
    const [hostels, residents] = await Promise.all([
      prisma.hostel.findMany({ where: { id: { in: ids } }, orderBy: { name: "asc" }, select: { id: true, name: true, rentDueDay: true } }),
      prisma.resident.findMany({
        where: { hostelId: { in: ids }, status: { in: [...CURRENT] }, occupantType: { not: "DAILY" }, bedId: { not: null } },
        select: { id: true, fullName: true, hostelId: true, billingMode: true, billingDay: true, admissionDate: true },
        orderBy: { fullName: "asc" },
      }),
    ]);
    res.json(hostels.map((h) => {
      const mine = residents.filter((r) => r.hostelId === h.id);
      const exceptions = mine
        .filter((r) => r.billingMode === "ANCHORED" || r.billingDay != null)
        .map((r) => ({ id: r.id, fullName: r.fullName, billingMode: r.billingMode, dueDay: residentDueDay(r, h.rentDueDay) }));
      return { id: h.id, name: h.name, rentDueDay: h.rentDueDay, residents: mine.length, following: mine.length - exceptions.length, exceptions };
    }));
  })
);

// PUT /api/hostels/:id/rent-settings — set the hostel's rent due day. With
// applyToAll, residents with their own due day or a join-day cycle switch to
// the hostel's calendar due date too. Every unpaid month of the residents who
// follow it moves to the new day.
router.put(
  "/:id/rent-settings",
  requirePermission("hostels.manage"),
  validateBody(z.object({ rentDueDay: z.coerce.number().int().min(1).max(28), applyToAll: z.coerce.boolean().default(false) })),
  asyncHandler(async (req, res) => {
    await assertHostelAccess(req, req.params.id);
    const before = await prisma.hostel.findUnique({ where: { id: req.params.id }, select: { id: true, rentDueDay: true } });
    if (!before) throw notFound("Hostel not found");
    const { rentDueDay, applyToAll } = req.body as { rentDueDay: number; applyToAll: boolean };

    const result = await prisma.$transaction(async (tx) => {
      await tx.hostel.update({ where: { id: before.id }, data: { rentDueDay } });
      const current = { hostelId: before.id, status: { in: [...CURRENT] }, occupantType: { not: "DAILY" as const } };
      let aligned = 0;
      if (applyToAll) {
        // Calendar residents with their own day simply drop it.
        const r = await tx.resident.updateMany({ where: { ...current, billingMode: "CALENDAR", billingDay: { not: null } }, data: { billingDay: null } });
        aligned = r.count;
      }
      const moved = await redateOpenCharges(tx, { hostelId: before.id });
      if (applyToAll) {
        // Join-day cycle residents switch to calendar months: their current
        // cycle is cut at month end so no days are charged twice.
        const anchored = await tx.resident.findMany({ where: { ...current, billingMode: "ANCHORED" }, select: { id: true } });
        for (const a of anchored) await switchToCalendar(tx, a.id, null);
        aligned += anchored.length;
      }
      return { aligned, moved };
    }, { timeout: 30000 });

    await audit({ userId: req.auth!.id, action: "hostel.rentSettings", entity: "Hostel", entityId: before.id, hostelId: before.id, oldValue: { rentDueDay: before.rentDueDay }, newValue: { rentDueDay, applyToAll, ...result } });
    res.json({ rentDueDay, ...result });
  })
);

// GET /api/hostels/:id
router.get(
  "/:id",
  requirePermission("hostels.view"),
  asyncHandler(async (req, res) => {
    await assertHostelAccess(req, req.params.id);
    const hostel = await prisma.hostel.findUnique({
      where: { id: req.params.id },
      include: { floors: { orderBy: { level: "asc" } } },
    });
    if (!hostel) throw notFound("Hostel not found");
    res.json({ ...hostel, propertyRent: Number(hostel.propertyRent), propertyDeposit: Number(hostel.propertyDeposit) });
  })
);

// POST /api/hostels
router.post(
  "/",
  requirePermission("hostels.manage"),
  validateBody(hostelSchema),
  asyncHandler(async (req, res) => {
    const data = req.body as z.infer<typeof hostelSchema>;
    const hostel = await prisma.hostel.create({
      data: { ...data, companyId: req.auth!.companyId },
    });
    invalidateCompanyAuth(req.auth!.companyId);
    await audit({ userId: req.auth!.id, action: "hostel.create", entity: "Hostel", entityId: hostel.id, hostelId: hostel.id, newValue: data });
    res.status(201).json(hostel);
  })
);

// PUT /api/hostels/:id
router.put(
  "/:id",
  requirePermission("hostels.manage"),
  validateBody(hostelSchema.partial()),
  asyncHandler(async (req, res) => {
    await assertHostelAccess(req, req.params.id);
    const before = await prisma.hostel.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound("Hostel not found");
    const hostel = await prisma.hostel.update({ where: { id: req.params.id }, data: req.body });
    // New rent-due day → residents on the hostel's day get their unpaid
    // months re-dated to it (e.g. 10th → 5th).
    if (req.body.rentDueDay != null && req.body.rentDueDay !== before.rentDueDay) {
      await redateOpenCharges(prisma, { hostelId: hostel.id });
    }
    await audit({ userId: req.auth!.id, action: "hostel.update", entity: "Hostel", entityId: hostel.id, hostelId: hostel.id, oldValue: before, newValue: req.body });
    res.json(hostel);
  })
);

// POST /api/hostels/:id/intake-link — mint a fresh SINGLE-USE registration
// link. Every call returns a brand-new unique token; the resulting /intake/:token
// link works exactly once (it's consumed on the first successful submission) and
// otherwise expires after 30 days. Share one link per prospective resident.
router.post(
  "/:id/intake-link",
  requirePermission("hostels.manage"),
  asyncHandler(async (req, res) => {
    await assertHostelAccess(req, req.params.id);
    const hostel = await prisma.hostel.findUnique({ where: { id: req.params.id } });
    if (!hostel) throw notFound("Hostel not found");

    const token = crypto.randomBytes(24).toString("hex"); // unique + unguessable
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    await prisma.intakeInvite.create({
      data: { token, hostelId: hostel.id, createdById: req.auth!.id, expiresAt },
    });
    await audit({ userId: req.auth!.id, action: "hostel.intake_link", entity: "Hostel", entityId: hostel.id, hostelId: hostel.id });
    res.json({ token, expiresAt });
  })
);

// DELETE /api/hostels/:id — permanently delete a hostel branch AND everything
// inside it: residents, rooms/beds, payments, deposits, expenses, income,
// staff, inventory, suppliers and every operational log. This is deliberately
// a full teardown (the client requires the owner to type the hostel name to
// confirm), so there is no need to empty the branch by hand first. Done in one
// transaction in FK-safe order; records that cascade (documents, allocations,
// deposit ledger, staff attendance/salary, purchase items, inventory
// transactions, structure) are removed automatically with their parent.
router.delete(
  "/:id",
  requirePermission("hostels.manage"),
  asyncHandler(async (req, res) => {
    await assertHostelAccess(req, req.params.id);
    const hostel = await prisma.hostel.findUnique({ where: { id: req.params.id } });
    if (!hostel) throw notFound("Hostel not found");
    const hostelId = hostel.id;

    // Resident portal logins to clean up after their residents are gone.
    const portalUserIds = (
      await prisma.resident.findMany({
        where: { hostelId, userId: { not: null } },
        select: { userId: true },
      })
    ).map((r) => r.userId!) as string[];

    await prisma.$transaction(async (tx) => {
      // 1. Records that reference residents (so residents can be deleted next).
      await tx.checkout.deleteMany({ where: { resident: { hostelId } } });
      await tx.maintenanceTicket.deleteMany({ where: { hostelId } });
      await tx.complaint.deleteMany({ where: { hostelId } });
      await tx.visitor.deleteMany({ where: { hostelId } });
      await tx.payment.deleteMany({ where: { hostelId } }); // cascades allocations
      await tx.rentCharge.deleteMany({ where: { hostelId } });
      await tx.securityDeposit.deleteMany({ where: { hostelId } }); // cascades ledger
      await tx.admission.deleteMany({ where: { hostelId } });
      await tx.income.deleteMany({ where: { hostelId } });
      // 2. Residents (cascades their documents & food attendance).
      await tx.resident.deleteMany({ where: { hostelId } });
      // 3. Remaining hostel-scoped records that do not cascade with the hostel.
      await tx.staff.deleteMany({ where: { hostelId } }); // cascades attendance/salary
      await tx.expense.deleteMany({ where: { hostelId } });
      await tx.investment.deleteMany({ where: { hostelId } });
      await tx.loan.deleteMany({ where: { hostelId } });
      await tx.notice.deleteMany({ where: { hostelId } });
      // 4. The hostel — structure (floors/rooms/beds), menus, suppliers,
      //    purchases, inventory and access grants cascade with it.
      await tx.hostel.delete({ where: { id: hostelId } });
      invalidateCompanyAuth(req.auth!.companyId);
      // 5. Orphaned resident-portal logins.
      if (portalUserIds.length) {
        await tx.user.deleteMany({ where: { id: { in: portalUserIds }, role: "RESIDENT" } });
      }
    });

    await audit({ userId: req.auth!.id, action: "hostel.delete", entity: "Hostel", entityId: hostelId, hostelId, oldValue: { name: hostel.name, code: hostel.code } });
    res.json({ success: true });
  })
);

export default router;
