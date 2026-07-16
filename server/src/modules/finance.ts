import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, notFound } from "../lib/http";
import { validateBody, parsePagination } from "../middleware/validate";
import { requirePermission, assertHostelAccess } from "../middleware/rbac";
import { hostelScope, dec } from "../lib/query";
import { audit } from "../lib/audit";

const methods = ["CASH", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CARD", "OTHER"] as const;

// =========================================================================
// Expenses
// =========================================================================
export const expensesRouter = Router();

const expenseCategories = [
  "PROPERTY_RENT", "ELECTRICITY", "GAS", "WATER", "INTERNET", "FOOD", "GROCERIES",
  "SALARIES", "REPAIRS", "MAINTENANCE", "CLEANING", "TRANSPORTATION", "MARKETING",
  "FURNITURE", "APPLIANCES", "SECURITY", "MISCELLANEOUS",
] as const;

expensesRouter.get(
  "/",
  requirePermission("expenses.view"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, search } = parsePagination(req.query);
    const scope = await hostelScope(req);
    const where: any = { ...scope, status: "ACTIVE" };
    if (req.query.category) where.category = req.query.category;
    if (search) where.OR = [{ vendor: { contains: search, mode: "insensitive" } }, { description: { contains: search, mode: "insensitive" } }];

    const [total, rows, agg] = await Promise.all([
      prisma.expense.count({ where }),
      prisma.expense.findMany({ where, orderBy: { date: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { hostel: { select: { name: true } } } }),
      prisma.expense.aggregate({ where, _sum: { amount: true } }),
    ]);
    res.json({ total, page, pageSize, totalAmount: dec(agg._sum.amount), data: rows.map((e) => ({ ...e, amount: dec(e.amount), hostel: e.hostel.name })) });
  })
);

expensesRouter.post(
  "/",
  requirePermission("expenses.manage"),
  validateBody(z.object({
    hostelId: z.string(),
    category: z.enum(expenseCategories),
    amount: z.coerce.number().positive(),
    date: z.coerce.date(),
    vendor: z.string().optional(),
    method: z.enum(methods).default("CASH"),
    description: z.string().optional(),
    isRecurring: z.boolean().default(false),
    recurringDay: z.coerce.number().int().min(1).max(28).optional(),
  })),
  asyncHandler(async (req, res) => {
    await assertHostelAccess(req, req.body.hostelId);
    const expense = await prisma.expense.create({ data: { ...req.body, addedById: req.auth!.id } });
    await audit({ userId: req.auth!.id, action: "expense.create", entity: "Expense", entityId: expense.id, hostelId: expense.hostelId, newValue: { category: expense.category, amount: dec(expense.amount) } });
    res.status(201).json({ ...expense, amount: dec(expense.amount) });
  })
);

expensesRouter.post(
  "/:id/void",
  requirePermission("expenses.manage"),
  validateBody(z.object({ reason: z.string().min(3) })),
  asyncHandler(async (req, res) => {
    const expense = await prisma.expense.findUnique({ where: { id: req.params.id } });
    if (!expense) throw notFound("Expense not found");
    await assertHostelAccess(req, expense.hostelId);
    if (expense.status === "VOIDED") throw badRequest("Already voided");
    await prisma.expense.update({ where: { id: expense.id }, data: { status: "VOIDED", voidReason: req.body.reason } });
    await audit({ userId: req.auth!.id, action: "expense.void", entity: "Expense", entityId: expense.id, hostelId: expense.hostelId, newValue: { reason: req.body.reason } });
    res.json({ success: true });
  })
);

expensesRouter.get(
  "/categories/summary",
  requirePermission("expenses.view"),
  asyncHandler(async (req, res) => {
    const scope = await hostelScope(req);
    const grouped = await prisma.expense.groupBy({ by: ["category"], where: { ...scope, status: "ACTIVE" }, _sum: { amount: true } });
    res.json(grouped.map((g) => ({ category: g.category, amount: dec(g._sum.amount) })).sort((a, b) => b.amount - a.amount));
  })
);

// =========================================================================
// Income (non-rent revenue)
// =========================================================================
export const incomeRouter = Router();

const incomeCategories = ["RENT", "LATE_FEE", "LAUNDRY", "ELECTRICITY", "EXTRA_FOOD", "DAMAGE_CHARGE", "OTHER"] as const;

incomeRouter.get(
  "/",
  requirePermission("income.view"),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = parsePagination(req.query);
    const scope = await hostelScope(req);
    const where: any = { ...scope, status: "ACTIVE" };
    if (req.query.category) where.category = req.query.category;
    const [total, rows, agg] = await Promise.all([
      prisma.income.count({ where }),
      prisma.income.findMany({ where, orderBy: { date: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { hostel: { select: { name: true } }, resident: { select: { fullName: true } } } }),
      prisma.income.aggregate({ where, _sum: { amount: true } }),
    ]);
    res.json({ total, page, pageSize, totalAmount: dec(agg._sum.amount), data: rows.map((i) => ({ ...i, amount: dec(i.amount), hostel: i.hostel.name, resident: i.resident?.fullName ?? null })) });
  })
);

incomeRouter.post(
  "/",
  requirePermission("income.manage"),
  validateBody(z.object({
    hostelId: z.string(),
    category: z.enum(incomeCategories),
    amount: z.coerce.number().positive(),
    date: z.coerce.date(),
    residentId: z.string().optional(),
    method: z.enum(methods).default("CASH"),
    notes: z.string().optional(),
  })),
  asyncHandler(async (req, res) => {
    await assertHostelAccess(req, req.body.hostelId);
    const income = await prisma.income.create({ data: { ...req.body, addedById: req.auth!.id } });
    await audit({ userId: req.auth!.id, action: "income.create", entity: "Income", entityId: income.id, hostelId: income.hostelId, newValue: { category: income.category, amount: dec(income.amount) } });
    res.status(201).json({ ...income, amount: dec(income.amount) });
  })
);

// =========================================================================
// Security deposits
// =========================================================================
export const depositsRouter = Router();

depositsRouter.get(
  "/",
  requirePermission("deposits.view"),
  asyncHandler(async (req, res) => {
    const scope = await hostelScope(req);
    const deposits = await prisma.securityDeposit.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      include: { resident: { select: { id: true, fullName: true, status: true } }, transactions: true },
    });
    const totalHeld = deposits.filter((d) => d.status === "HELD" || d.status === "PARTIALLY_REFUNDED").reduce((s, d) => s + dec(d.amount), 0);
    res.json({
      totalHeld,
      data: deposits.map((d) => ({
        id: d.id,
        amount: dec(d.amount),
        status: d.status,
        method: d.method,
        receivedAt: d.receivedAt,
        refundedAt: d.refundedAt,
        resident: d.resident,
        deductions: d.transactions.filter((t) => t.type === "DEDUCTION").reduce((s, t) => s + dec(t.amount), 0),
        refunds: d.transactions.filter((t) => t.type === "REFUND").reduce((s, t) => s + dec(t.amount), 0),
      })),
    });
  })
);

// =========================================================================
// Capital: owner investment & loans (never counted as revenue/profit)
// =========================================================================
export const capitalRouter = Router();

capitalRouter.get(
  "/investments",
  requirePermission("capital.view"),
  asyncHandler(async (req, res) => {
    const scope = await hostelScope(req);
    const investments = await prisma.investment.findMany({
      where: { OR: [{ hostelId: null }, scope] },
      orderBy: { date: "desc" },
      include: { hostel: { select: { name: true } } },
    });
    const totalInvested = investments.filter((i) => i.type !== "CAPITAL_WITHDRAWAL").reduce((s, i) => s + dec(i.amount), 0);
    const totalWithdrawn = investments.filter((i) => i.type === "CAPITAL_WITHDRAWAL").reduce((s, i) => s + dec(i.amount), 0);
    res.json({ totalInvested, totalWithdrawn, netCapital: totalInvested - totalWithdrawn, data: investments.map((i) => ({ ...i, amount: dec(i.amount), hostel: i.hostel?.name ?? "Company" })) });
  })
);

capitalRouter.post(
  "/investments",
  requirePermission("capital.manage"),
  validateBody(z.object({
    hostelId: z.string().optional(),
    type: z.enum(["OWNER_INVESTMENT", "PARTNER_INVESTMENT", "CAPITAL_WITHDRAWAL", "OWNER_CONTRIBUTION"]),
    amount: z.coerce.number().positive(),
    date: z.coerce.date(),
    source: z.string().optional(),
    purpose: z.string().optional(),
    notes: z.string().optional(),
  })),
  asyncHandler(async (req, res) => {
    if (req.body.hostelId) await assertHostelAccess(req, req.body.hostelId);
    const investment = await prisma.investment.create({ data: req.body });
    await audit({ userId: req.auth!.id, action: "investment.create", entity: "Investment", entityId: investment.id, hostelId: investment.hostelId, newValue: { type: investment.type, amount: dec(investment.amount) } });
    res.status(201).json({ ...investment, amount: dec(investment.amount) });
  })
);

capitalRouter.get(
  "/loans",
  requirePermission("capital.view"),
  asyncHandler(async (req, res) => {
    const scope = await hostelScope(req);
    const loans = await prisma.loan.findMany({ where: { OR: [{ hostelId: null }, scope] }, orderBy: { date: "desc" }, include: { hostel: { select: { name: true } } } });
    const outstanding = loans.reduce((s, l) => s + (dec(l.principal) - dec(l.amountRepaid)), 0);
    res.json({ outstanding, data: loans.map((l) => ({ ...l, principal: dec(l.principal), amountRepaid: dec(l.amountRepaid), hostel: l.hostel?.name ?? "Company" })) });
  })
);

capitalRouter.post(
  "/loans",
  requirePermission("capital.manage"),
  validateBody(z.object({
    hostelId: z.string().optional(),
    lender: z.string().min(1),
    principal: z.coerce.number().positive(),
    interestRate: z.coerce.number().min(0).optional(),
    date: z.coerce.date(),
    notes: z.string().optional(),
  })),
  asyncHandler(async (req, res) => {
    if (req.body.hostelId) await assertHostelAccess(req, req.body.hostelId);
    const loan = await prisma.loan.create({ data: req.body });
    await audit({ userId: req.auth!.id, action: "loan.create", entity: "Loan", entityId: loan.id, hostelId: loan.hostelId });
    res.status(201).json({ ...loan, principal: dec(loan.principal) });
  })
);
