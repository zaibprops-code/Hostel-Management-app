import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/http";
import { requirePermission, accessibleHostelIds } from "../middleware/rbac";
import { hasPermission } from "../lib/permissions";
import { forbidden } from "../lib/http";
import { dec } from "../lib/query";
import { profitAndLoss } from "../lib/finance-calc";

const router = Router();

async function scopedIds(req: any): Promise<string[]> {
  let ids = await accessibleHostelIds(req);
  const requested = req.query.hostelId as string | undefined;
  if (requested && ids.includes(requested)) ids = [requested];
  return ids;
}

function range(req: any) {
  const from = req.query.from ? new Date(req.query.from) : undefined;
  const to = req.query.to ? new Date(req.query.to) : undefined;
  return { from, to };
}

// GET /api/reports/occupancy
router.get("/occupancy", requirePermission("reports.view"), asyncHandler(async (req, res) => {
  const ids = await scopedIds(req);
  const perHostel = await Promise.all(ids.map(async (id) => {
    const hostel = await prisma.hostel.findUnique({ where: { id }, select: { name: true } });
    const total = await prisma.bed.count({ where: { hostelId: id } });
    const occupied = await prisma.bed.count({ where: { hostelId: id, status: "OCCUPIED" } });
    const available = await prisma.bed.count({ where: { hostelId: id, status: "AVAILABLE" } });
    return { hostel: hostel?.name, totalBeds: total, occupiedBeds: occupied, availableBeds: available, occupancyRate: total ? Math.round((occupied / total) * 100) : 0 };
  }));
  res.json(perHostel);
}));

// GET /api/reports/rent-collection
router.get("/rent-collection", requirePermission("reports.view"), asyncHandler(async (req, res) => {
  const ids = await scopedIds(req);
  const charges = await prisma.rentCharge.findMany({ where: { hostelId: { in: ids } }, select: { amount: true, discount: true, amountPaid: true, status: true } });
  const expected = charges.reduce((s, c) => s + dec(c.amount) - dec(c.discount), 0);
  const collected = charges.reduce((s, c) => s + dec(c.amountPaid), 0);
  const overdue = charges.filter((c) => c.status === "OVERDUE").reduce((s, c) => s + Math.max(0, dec(c.amount) - dec(c.discount) - dec(c.amountPaid)), 0);
  res.json({ expected, collected, outstanding: Math.max(0, expected - collected), overdue, collectionRate: expected ? Math.round((collected / expected) * 100) : 0 });
}));

// GET /api/reports/income
router.get("/income", requirePermission("reports.view"), asyncHandler(async (req, res) => {
  const ids = await scopedIds(req);
  const { from, to } = range(req);
  const dateF: any = {};
  if (from) dateF.gte = from;
  if (to) dateF.lte = to;
  const grouped = await prisma.income.groupBy({ by: ["category"], where: { hostelId: { in: ids }, status: "ACTIVE", ...(from || to ? { date: dateF } : {}) }, _sum: { amount: true } });
  res.json(grouped.map((g) => ({ category: g.category, amount: dec(g._sum.amount) })));
}));

// GET /api/reports/expenses
router.get("/expenses", requirePermission("reports.view"), asyncHandler(async (req, res) => {
  const ids = await scopedIds(req);
  const { from, to } = range(req);
  const dateF: any = {};
  if (from) dateF.gte = from;
  if (to) dateF.lte = to;
  const grouped = await prisma.expense.groupBy({ by: ["category"], where: { hostelId: { in: ids }, status: "ACTIVE", ...(from || to ? { date: dateF } : {}) }, _sum: { amount: true } });
  res.json(grouped.map((g) => ({ category: g.category, amount: dec(g._sum.amount) })).sort((a, b) => b.amount - a.amount));
}));

// GET /api/reports/profit-loss (sensitive)
router.get("/profit-loss", requirePermission("reports.view"), asyncHandler(async (req, res) => {
  if (!hasPermission(req.auth!.role, req.auth!.permissions, "finance.viewProfit")) throw forbidden("You cannot view profit figures");
  const ids = await scopedIds(req);
  res.json(await profitAndLoss(ids, range(req)));
}));

// GET /api/reports/residents
router.get("/residents", requirePermission("reports.view"), asyncHandler(async (req, res) => {
  const ids = await scopedIds(req);
  const grouped = await prisma.resident.groupBy({ by: ["status"], where: { hostelId: { in: ids } }, _count: true });
  res.json(grouped.map((g) => ({ status: g.status, count: g._count })));
}));

// GET /api/reports/deposits
router.get("/deposits", requirePermission("reports.view"), asyncHandler(async (req, res) => {
  const ids = await scopedIds(req);
  const deposits = await prisma.securityDeposit.findMany({ where: { hostelId: { in: ids } }, include: { transactions: true } });
  const held = deposits.filter((d) => d.status === "HELD" || d.status === "PARTIALLY_REFUNDED").reduce((s, d) => s + dec(d.amount), 0);
  const refunds = deposits.flatMap((d) => d.transactions).filter((t) => t.type === "REFUND").reduce((s, t) => s + dec(t.amount), 0);
  const deductions = deposits.flatMap((d) => d.transactions).filter((t) => t.type === "DEDUCTION").reduce((s, t) => s + dec(t.amount), 0);
  res.json({ totalHeld: held, totalRefunds: refunds, totalDeductions: deductions });
}));

// GET /api/reports/hostel-comparison (owner overview)
router.get("/hostel-comparison", requirePermission("reports.view"), asyncHandler(async (req, res) => {
  if (!hasPermission(req.auth!.role, req.auth!.permissions, "finance.viewProfit")) throw forbidden();
  const ids = await accessibleHostelIds(req);
  const rows = await Promise.all(ids.map(async (id) => {
    const hostel = await prisma.hostel.findUnique({ where: { id }, select: { name: true } });
    const pl = await profitAndLoss([id], range(req));
    const total = await prisma.bed.count({ where: { hostelId: id } });
    const occupied = await prisma.bed.count({ where: { hostelId: id, status: "OCCUPIED" } });
    return { hostel: hostel?.name, revenue: pl.totalRevenue, expenses: pl.totalExpenses, profit: pl.netProfit, occupancyRate: total ? Math.round((occupied / total) * 100) : 0 };
  }));
  res.json(rows);
}));

export default router;
