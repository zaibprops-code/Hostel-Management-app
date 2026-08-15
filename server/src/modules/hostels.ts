import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, notFound } from "../lib/http";
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

// DELETE /api/hostels/:id — permanently remove a hostel branch. Refused while
// the branch still holds people or financial records, so history is never
// silently destroyed; the owner is told exactly what to clear (or to archive
// the hostel instead). An empty branch is removed together with its structure,
// menus, inventory and operational logs.
router.delete(
  "/:id",
  requirePermission("hostels.manage"),
  asyncHandler(async (req, res) => {
    await assertHostelAccess(req, req.params.id);
    const hostel = await prisma.hostel.findUnique({ where: { id: req.params.id } });
    if (!hostel) throw notFound("Hostel not found");

    const [residents, payments, expenses, incomes, staff, investments, loans] = await Promise.all([
      prisma.resident.count({ where: { hostelId: hostel.id } }),
      prisma.payment.count({ where: { hostelId: hostel.id } }),
      prisma.expense.count({ where: { hostelId: hostel.id } }),
      prisma.income.count({ where: { hostelId: hostel.id } }),
      prisma.staff.count({ where: { hostelId: hostel.id } }),
      prisma.investment.count({ where: { hostelId: hostel.id } }),
      prisma.loan.count({ where: { hostelId: hostel.id } }),
    ]);

    const blockers: string[] = [];
    if (residents) blockers.push(`${residents} resident(s)`);
    if (payments) blockers.push(`${payments} payment(s)`);
    if (expenses) blockers.push(`${expenses} expense record(s)`);
    if (incomes) blockers.push(`${incomes} income record(s)`);
    if (staff) blockers.push(`${staff} staff member(s)`);
    if (investments) blockers.push(`${investments} investment(s)`);
    if (loans) blockers.push(`${loans} loan(s)`);
    if (blockers.length) {
      throw badRequest(
        `This hostel still has ${blockers.join(", ")}. Check out or remove them first — deleting a hostel with records would erase that history.`
      );
    }

    // No people or money records remain. Clear the operational logs that do not
    // cascade, then delete the hostel — structure (floors/rooms/beds), menus,
    // suppliers, purchases, inventory and access grants cascade with it.
    await prisma.$transaction([
      prisma.maintenanceTicket.deleteMany({ where: { hostelId: hostel.id } }),
      prisma.complaint.deleteMany({ where: { hostelId: hostel.id } }),
      prisma.visitor.deleteMany({ where: { hostelId: hostel.id } }),
      prisma.notice.deleteMany({ where: { hostelId: hostel.id } }),
      prisma.hostel.delete({ where: { id: hostel.id } }),
    ]);

    await audit({ userId: req.auth!.id, action: "hostel.delete", entity: "Hostel", entityId: hostel.id, hostelId: hostel.id, oldValue: { name: hostel.name, code: hostel.code } });
    res.json({ success: true });
  })
);

export default router;
