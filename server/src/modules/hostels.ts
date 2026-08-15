import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, notFound } from "../lib/http";
import { validateBody } from "../middleware/validate";
import { requirePermission, accessibleHostelIds, assertHostelAccess } from "../middleware/rbac";
import { audit } from "../lib/audit";

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
  rentDueDay: z.coerce.number().int().min(1).max(28).default(10),
});

// GET /api/hostels — list accessible hostels with live occupancy stats.
router.get(
  "/",
  requirePermission("hostels.view"),
  asyncHandler(async (req, res) => {
    const ids = await accessibleHostelIds(req);
    const hostels = await prisma.hostel.findMany({
      where: { id: { in: ids } },
      orderBy: { name: "asc" },
      include: { _count: { select: { beds: true, residents: true } } },
    });

    const withStats = await Promise.all(
      hostels.map(async (h) => {
        const occupied = await prisma.bed.count({ where: { hostelId: h.id, status: "OCCUPIED" } });
        const available = await prisma.bed.count({ where: { hostelId: h.id, status: "AVAILABLE" } });
        const activeResidents = await prisma.resident.count({ where: { hostelId: h.id, status: "ACTIVE" } });
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
      })
    );
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
      select: { id: true, name: true, code: true, city: true },
    });
    res.json(hostels);
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
    await audit({ userId: req.auth!.id, action: "hostel.update", entity: "Hostel", entityId: hostel.id, hostelId: hostel.id, oldValue: before, newValue: req.body });
    res.json(hostel);
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
