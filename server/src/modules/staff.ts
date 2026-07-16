import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, notFound } from "../lib/http";
import { validateBody } from "../middleware/validate";
import { requirePermission, assertHostelAccess } from "../middleware/rbac";
import { hostelScope, dec } from "../lib/query";
import { audit } from "../lib/audit";

const router = Router();

router.get("/", requirePermission("staff.view"), asyncHandler(async (req, res) => {
  const scope = await hostelScope(req);
  const staff = await prisma.staff.findMany({ where: scope, orderBy: { name: "asc" }, include: { hostel: { select: { name: true } } } });
  res.json(staff.map((s) => ({ ...s, monthlySalary: dec(s.monthlySalary), hostel: s.hostel.name })));
}));

router.post("/", requirePermission("staff.manage"), validateBody(z.object({
  hostelId: z.string(), name: z.string().min(1),
  type: z.enum(["MANAGER", "KITCHEN", "CLEANER", "SECURITY", "MAINTENANCE", "ACCOUNTANT", "OTHER"]),
  phone: z.string().optional(), cnic: z.string().optional(), joiningDate: z.coerce.date().optional(),
  monthlySalary: z.coerce.number().min(0).default(0),
})), asyncHandler(async (req, res) => {
  await assertHostelAccess(req, req.body.hostelId);
  const staff = await prisma.staff.create({ data: req.body });
  await audit({ userId: req.auth!.id, action: "staff.create", entity: "Staff", entityId: staff.id, hostelId: staff.hostelId });
  res.status(201).json({ ...staff, monthlySalary: dec(staff.monthlySalary) });
}));

// Record a salary payment for a period
router.post("/:id/salary", requirePermission("staff.manage"), validateBody(z.object({
  periodMonth: z.coerce.number().int().min(1).max(12), periodYear: z.coerce.number().int(),
  advance: z.coerce.number().min(0).default(0), deductions: z.coerce.number().min(0).default(0),
  netPaid: z.coerce.number().min(0), notes: z.string().optional(),
})), asyncHandler(async (req, res) => {
  const staff = await prisma.staff.findUnique({ where: { id: req.params.id } });
  if (!staff) throw notFound("Staff not found");
  await assertHostelAccess(req, staff.hostelId);
  const payment = await prisma.salaryPayment.upsert({
    where: { staffId_periodYear_periodMonth: { staffId: staff.id, periodYear: req.body.periodYear, periodMonth: req.body.periodMonth } },
    create: { staffId: staff.id, baseSalary: staff.monthlySalary, paidAt: new Date(), ...req.body },
    update: { ...req.body, paidAt: new Date() },
  });
  // Salaries also flow into expenses so they hit P&L.
  await prisma.expense.create({ data: { hostelId: staff.hostelId, category: "SALARIES", amount: req.body.netPaid, date: new Date(), vendor: staff.name, description: `Salary ${req.body.periodMonth}/${req.body.periodYear}`, addedById: req.auth!.id } });
  await audit({ userId: req.auth!.id, action: "salary.pay", entity: "SalaryPayment", entityId: payment.id, hostelId: staff.hostelId, newValue: { netPaid: req.body.netPaid } });
  res.status(201).json({ ...payment, baseSalary: dec(payment.baseSalary), netPaid: dec(payment.netPaid) });
}));

// Salary report
router.get("/salary/report", requirePermission("staff.view"), asyncHandler(async (req, res) => {
  const scope = await hostelScope(req);
  const staff = await prisma.staff.findMany({ where: scope, include: { salaries: true } });
  res.json(staff.map((s) => ({
    id: s.id, name: s.name, type: s.type, monthlySalary: dec(s.monthlySalary),
    totalPaid: s.salaries.reduce((sum, p) => sum + dec(p.netPaid), 0),
    totalAdvances: s.salaries.reduce((sum, p) => sum + dec(p.advance), 0),
    totalDeductions: s.salaries.reduce((sum, p) => sum + dec(p.deductions), 0),
  })));
}));

export default router;
