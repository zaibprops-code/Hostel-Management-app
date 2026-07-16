import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, forbidden, notFound } from "../lib/http";
import { validateBody } from "../middleware/validate";
import { requirePermission } from "../middleware/rbac";
import { dec } from "../lib/query";

const router = Router();

// All portal routes are scoped to the logged-in resident only.
function residentId(req: any): string {
  if (!req.auth?.residentId) throw forbidden("No resident profile linked to this account");
  return req.auth.residentId;
}

// GET /api/portal/me — resident's own profile, rent status, deposit, food plan
router.get("/me", requirePermission("portal.view"), asyncHandler(async (req, res) => {
  const id = residentId(req);
  const resident = await prisma.resident.findUnique({
    where: { id },
    include: {
      hostel: { select: { name: true, address: true, contactNumber: true } },
      bed: { include: { room: { include: { floor: true } } } },
      foodPlan: true,
      deposit: true,
      rentCharges: { orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }] },
      payments: { orderBy: { paidAt: "desc" }, take: 20 },
    },
  });
  if (!resident) throw notFound("Resident profile not found");

  const outstanding = resident.rentCharges.reduce((s, c) => s + Math.max(0, dec(c.amount) - dec(c.discount) - dec(c.amountPaid)), 0);
  res.json({
    fullName: resident.fullName, status: resident.status,
    hostel: resident.hostel, room: resident.bed?.room.name, bed: resident.bed?.label,
    floor: resident.bed?.room.floor?.name,
    monthlyRent: dec(resident.monthlyRent), outstanding,
    foodPlan: resident.foodPlan,
    deposit: resident.deposit ? { amount: dec(resident.deposit.amount), status: resident.deposit.status } : null,
    rentCharges: resident.rentCharges.map((c) => ({ period: `${c.periodMonth}/${c.periodYear}`, amount: dec(c.amount), paid: dec(c.amountPaid), balance: Math.max(0, dec(c.amount) - dec(c.discount) - dec(c.amountPaid)), status: c.status, dueDate: c.dueDate })),
    payments: resident.payments.map((p) => ({ amount: dec(p.amount), method: p.method, paidAt: p.paidAt })),
  });
}));

// GET /api/portal/notices
router.get("/notices", requirePermission("portal.view"), asyncHandler(async (req, res) => {
  const id = residentId(req);
  const resident = await prisma.resident.findUnique({ where: { id }, select: { hostelId: true } });
  const notices = await prisma.notice.findMany({
    where: { OR: [{ hostelId: null }, { hostelId: resident?.hostelId }] },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
  });
  res.json(notices);
}));

// POST /api/portal/complaints — resident raises a complaint about themselves
router.post("/complaints", requirePermission("portal.view"), validateBody(z.object({
  category: z.enum(["ROOMMATE", "NOISE", "FOOD", "CLEANLINESS", "STAFF_BEHAVIOR", "MAINTENANCE", "SECURITY", "OTHER"]),
  subject: z.string().min(1), description: z.string().optional(),
})), asyncHandler(async (req, res) => {
  const id = residentId(req);
  const resident = await prisma.resident.findUnique({ where: { id }, select: { hostelId: true } });
  const complaint = await prisma.complaint.create({ data: { hostelId: resident!.hostelId, residentId: id, ...req.body } });
  res.status(201).json(complaint);
}));

// POST /api/portal/maintenance — resident raises a maintenance request
router.post("/maintenance", requirePermission("portal.view"), validateBody(z.object({
  title: z.string().min(1), description: z.string().optional(), priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
})), asyncHandler(async (req, res) => {
  const id = residentId(req);
  const resident = await prisma.resident.findUnique({ where: { id }, include: { bed: { include: { room: true } } } });
  const ticket = await prisma.maintenanceTicket.create({ data: { hostelId: resident!.hostelId, residentId: id, roomLabel: resident?.bed?.room.name, ...req.body } });
  res.status(201).json(ticket);
}));

// GET /api/portal/requests — resident's own complaints & tickets
router.get("/requests", requirePermission("portal.view"), asyncHandler(async (req, res) => {
  const id = residentId(req);
  const [complaints, tickets] = await Promise.all([
    prisma.complaint.findMany({ where: { residentId: id }, orderBy: { createdAt: "desc" } }),
    prisma.maintenanceTicket.findMany({ where: { residentId: id }, orderBy: { createdAt: "desc" } }),
  ]);
  res.json({ complaints, tickets });
}));

export default router;
