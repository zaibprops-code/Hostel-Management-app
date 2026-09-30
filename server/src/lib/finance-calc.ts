import { prisma } from "./prisma";
import { dec } from "./query";

export interface DateRange {
  from?: Date;
  to?: Date;
}

// Profit & Loss for a set of hostels over a date range.
// IMPORTANT business rules:
//  - Security deposits are NOT revenue.
//  - Owner investment & partner capital are NOT revenue.
//  - Loans are NOT revenue.
// Revenue = rent collected (completed payments) + non-rent income.
// Expenses = active operational expenses.
export async function profitAndLoss(hostelIds: string[], range: DateRange = {}) {
  const dateFilter = (field: string) => {
    const f: any = {};
    if (range.from) f.gte = range.from;
    if (range.to) f.lte = range.to;
    return Object.keys(f).length ? { [field]: f } : {};
  };

  const [rentPaid, income, expenses] = await Promise.all([
    // Rent revenue = sum of completed payment allocations to rent charges.
    prisma.payment.aggregate({
      where: { hostelId: { in: hostelIds }, status: "COMPLETED", ...dateFilter("paidAt") },
      _sum: { amount: true },
    }),
    prisma.income.groupBy({
      by: ["category"],
      where: { hostelId: { in: hostelIds }, status: "ACTIVE", ...dateFilter("date") },
      _sum: { amount: true },
    }),
    prisma.expense.groupBy({
      by: ["category"],
      where: { hostelId: { in: hostelIds }, status: "ACTIVE", ...dateFilter("date") },
      _sum: { amount: true },
    }),
  ]);

  const rentRevenue = dec(rentPaid._sum.amount);
  const otherIncome = income.reduce((s, i) => s + dec(i._sum.amount), 0);
  const totalRevenue = rentRevenue + otherIncome;
  const totalExpenses = expenses.reduce((s, e) => s + dec(e._sum.amount), 0);

  return {
    rentRevenue,
    otherIncome,
    totalRevenue,
    totalExpenses,
    netProfit: totalRevenue - totalExpenses,
    profitMargin: totalRevenue ? Math.round(((totalRevenue - totalExpenses) / totalRevenue) * 100) : 0,
    incomeByCategory: income.map((i) => ({ category: i.category, amount: dec(i._sum.amount) })),
    expenseByCategory: expenses.map((e) => ({ category: e.category, amount: dec(e._sum.amount) })).sort((a, b) => b.amount - a.amount),
  };
}

// Monthly revenue vs expenses trend for the last N months.
// Three grouped queries for the whole range (not three per month), so the
// chart costs one database round trip. Same figures as profitAndLoss per month:
// revenue = completed payments + other income; profit = revenue − expenses.
export async function monthlyTrend(hostelIds: string[], months = 6) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  type Row = { m: Date; total: unknown };
  const [payments, income, expenses] = await Promise.all([
    prisma.$queryRaw<Row[]>`SELECT date_trunc('month', "paidAt") AS m, SUM("amount") AS total FROM "Payment"
      WHERE "hostelId" = ANY(${hostelIds}) AND "status" = 'COMPLETED' AND "paidAt" >= ${from} AND "paidAt" <= ${to} GROUP BY 1`,
    prisma.$queryRaw<Row[]>`SELECT date_trunc('month', "date") AS m, SUM("amount") AS total FROM "Income"
      WHERE "hostelId" = ANY(${hostelIds}) AND "status" = 'ACTIVE' AND "date" >= ${from} AND "date" <= ${to} GROUP BY 1`,
    prisma.$queryRaw<Row[]>`SELECT date_trunc('month', "date") AS m, SUM("amount") AS total FROM "Expense"
      WHERE "hostelId" = ANY(${hostelIds}) AND "status" = 'ACTIVE' AND "date" >= ${from} AND "date" <= ${to} GROUP BY 1`,
  ]);
  const sumFor = (rows: Row[], y: number, m: number) =>
    rows.filter((r) => r.m.getUTCFullYear() === y && r.m.getUTCMonth() === m).reduce((s, r) => s + Number(r.total ?? 0), 0);

  const result: { month: string; revenue: number; expenses: number; profit: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = start.getFullYear();
    const m = start.getMonth();
    const revenue = sumFor(payments, y, m) + sumFor(income, y, m);
    const spent = sumFor(expenses, y, m);
    result.push({
      month: start.toLocaleString("en-US", { month: "short", year: "2-digit" }),
      revenue,
      expenses: spent,
      profit: revenue - spent,
    });
  }
  return result;
}
