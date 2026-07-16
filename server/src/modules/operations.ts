import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, notFound } from "../lib/http";
import { validateBody } from "../middleware/validate";
import { requirePermission, assertHostelAccess } from "../middleware/rbac";
import { hostelScope, dec } from "../lib/query";
import { audit } from "../lib/audit";

const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

// =========================================================================
// Maintenance tickets
// =========================================================================
export const maintenanceRouter = Router();

maintenanceRouter.get("/", requirePermission("maintenance.view"), asyncHandler(async (req, res) => {
  const scope = await hostelScope(req);
  const where: any = { ...scope };
  if (req.query.status) where.status = req.query.status;
  const tickets = await prisma.maintenanceTicket.findMany({ where, orderBy: { createdAt: "desc" }, include: { resident: { select: { fullName: true } }, hostel: { select: { name: true } } } });
  res.json(tickets.map((t) => ({ ...t, estimatedCost: t.estimatedCost ? dec(t.estimatedCost) : null, actualCost: t.actualCost ? dec(t.actualCost) : null, resident: t.resident?.fullName ?? null, hostel: t.hostel.name })));
}));

maintenanceRouter.post("/", requirePermission("maintenance.view"), validateBody(z.object({
  hostelId: z.string(), residentId: z.string().optional(), roomLabel: z.string().optional(),
  title: z.string().min(1), description: z.string().optional(), priority: z.enum(priorities).default("MEDIUM"),
  estimatedCost: z.coerce.number().min(0).optional(),
})), asyncHandler(async (req, res) => {
  await assertHostelAccess(req, req.body.hostelId);
  const ticket = await prisma.maintenanceTicket.create({ data: req.body });
  await audit({ userId: req.auth!.id, action: "maintenance.create", entity: "MaintenanceTicket", entityId: ticket.id, hostelId: ticket.hostelId });
  res.status(201).json(ticket);
}));

maintenanceRouter.patch("/:id", requirePermission("maintenance.manage"), validateBody(z.object({
  status: z.enum(["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING", "COMPLETED", "CANCELLED"]).optional(),
  assignedTo: z.string().optional(), priority: z.enum(priorities).optional(),
  actualCost: z.coerce.number().min(0).optional(),
})), asyncHandler(async (req, res) => {
  const before = await prisma.maintenanceTicket.findUnique({ where: { id: req.params.id } });
  if (!before) throw notFound("Ticket not found");
  await assertHostelAccess(req, before.hostelId);
  const ticket = await prisma.maintenanceTicket.update({ where: { id: before.id }, data: req.body });
  await audit({ userId: req.auth!.id, action: "maintenance.update", entity: "MaintenanceTicket", entityId: ticket.id, hostelId: ticket.hostelId, oldValue: { status: before.status }, newValue: req.body });
  res.json(ticket);
}));

// =========================================================================
// Complaints
// =========================================================================
export const complaintsRouter = Router();

complaintsRouter.get("/", requirePermission("complaints.view"), asyncHandler(async (req, res) => {
  const scope = await hostelScope(req);
  const where: any = { ...scope };
  if (req.query.status) where.status = req.query.status;
  const rows = await prisma.complaint.findMany({ where, orderBy: { createdAt: "desc" }, include: { resident: { select: { fullName: true } }, hostel: { select: { name: true } } } });
  res.json(rows.map((c) => ({ ...c, resident: c.resident?.fullName ?? null, hostel: c.hostel.name })));
}));

complaintsRouter.post("/", requirePermission("complaints.view"), validateBody(z.object({
  hostelId: z.string(), residentId: z.string().optional(),
  category: z.enum(["ROOMMATE", "NOISE", "FOOD", "CLEANLINESS", "STAFF_BEHAVIOR", "MAINTENANCE", "SECURITY", "OTHER"]),
  subject: z.string().min(1), description: z.string().optional(), priority: z.enum(priorities).default("MEDIUM"),
})), asyncHandler(async (req, res) => {
  await assertHostelAccess(req, req.body.hostelId);
  const complaint = await prisma.complaint.create({ data: req.body });
  await audit({ userId: req.auth!.id, action: "complaint.create", entity: "Complaint", entityId: complaint.id, hostelId: complaint.hostelId });
  res.status(201).json(complaint);
}));

complaintsRouter.patch("/:id", requirePermission("complaints.manage"), validateBody(z.object({
  status: z.enum(["OPEN", "UNDER_REVIEW", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  response: z.string().optional(),
})), asyncHandler(async (req, res) => {
  const before = await prisma.complaint.findUnique({ where: { id: req.params.id } });
  if (!before) throw notFound("Complaint not found");
  await assertHostelAccess(req, before.hostelId);
  const complaint = await prisma.complaint.update({ where: { id: before.id }, data: req.body });
  await audit({ userId: req.auth!.id, action: "complaint.update", entity: "Complaint", entityId: complaint.id, hostelId: complaint.hostelId, newValue: req.body });
  res.json(complaint);
}));

// =========================================================================
// Visitors
// =========================================================================
export const visitorsRouter = Router();

visitorsRouter.get("/", requirePermission("visitors.view"), asyncHandler(async (req, res) => {
  const scope = await hostelScope(req);
  const rows = await prisma.visitor.findMany({ where: scope, orderBy: { arrivalTime: "desc" }, take: 100, include: { resident: { select: { fullName: true } }, hostel: { select: { name: true } } } });
  res.json(rows.map((v) => ({ ...v, resident: v.resident?.fullName ?? null, hostel: v.hostel.name })));
}));

visitorsRouter.post("/", requirePermission("visitors.manage"), validateBody(z.object({
  hostelId: z.string(), residentId: z.string().optional(), name: z.string().min(1),
  cnic: z.string().optional(), phone: z.string().optional(), purpose: z.string().optional(),
  arrivalTime: z.coerce.date().optional(), notes: z.string().optional(),
})), asyncHandler(async (req, res) => {
  await assertHostelAccess(req, req.body.hostelId);
  const visitor = await prisma.visitor.create({ data: req.body });
  await audit({ userId: req.auth!.id, action: "visitor.create", entity: "Visitor", entityId: visitor.id, hostelId: visitor.hostelId });
  res.status(201).json(visitor);
}));

visitorsRouter.patch("/:id/checkout", requirePermission("visitors.manage"), asyncHandler(async (req, res) => {
  const visitor = await prisma.visitor.findUnique({ where: { id: req.params.id } });
  if (!visitor) throw notFound("Visitor not found");
  await assertHostelAccess(req, visitor.hostelId);
  const updated = await prisma.visitor.update({ where: { id: visitor.id }, data: { departureTime: new Date() } });
  res.json(updated);
}));

// =========================================================================
// Notices
// =========================================================================
export const noticesRouter = Router();

noticesRouter.get("/", requirePermission("notices.view"), asyncHandler(async (req, res) => {
  const scope = await hostelScope(req);
  const notices = await prisma.notice.findMany({
    where: { OR: [{ hostelId: null }, scope] },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    include: { hostel: { select: { name: true } } },
  });
  res.json(notices.map((n) => ({ ...n, hostel: n.hostel?.name ?? "Company-wide" })));
}));

noticesRouter.post("/", requirePermission("notices.manage"), validateBody(z.object({
  hostelId: z.string().optional(),
  type: z.enum(["GENERAL", "FOOD", "MAINTENANCE", "EMERGENCY", "PAYMENT_REMINDER"]).default("GENERAL"),
  title: z.string().min(1), body: z.string().min(1), pinned: z.boolean().default(false),
})), asyncHandler(async (req, res) => {
  if (req.body.hostelId) await assertHostelAccess(req, req.body.hostelId);
  const notice = await prisma.notice.create({ data: req.body });
  await audit({ userId: req.auth!.id, action: "notice.create", entity: "Notice", entityId: notice.id, hostelId: notice.hostelId });
  res.status(201).json(notice);
}));
