import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/http";
import { requirePermission, accessibleHostelIds } from "../middleware/rbac";
import { hasPermission } from "../lib/permissions";
import { dec } from "../lib/query";
import { profitAndLoss, monthlyTrend } from "../lib/finance-calc";

const router = Router();

// GET /api/dashboard — role-aware KPIs, charts and recent activity
router.get(
  "/",
  requirePermission("dashboard.view"),
  asyncHandler(async (req, res) => {
    let ids = await accessibleHostelIds(req);
    const requested = req.query.hostelId as string | undefined;
    if (requested && ids.includes(requested)) ids = [requested];

    const canSeeProfit = hasPermission(req.auth!.role, req.auth!.permissions, "finance.viewProfit");

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59);
    const soon = new Date(Date.now() + 14 * 86400000);

    // Everything is fetched in ONE parallel batch (one database round trip):
    // the nine counts come back from a single SQL statement, and the profit
    // figures / chart are only queried for users allowed to see them.
    type Counts = { hostels: number; rooms: number; beds: number; occupied: number; available: number; active: number; leaving: number; maintenance: number; complaints: number };
    const [
      countRows, monthRevenuePayments, monthExpenses, depositsHeld, recentPayments, recentExpenses, outstandingCharges, profit,
    ] = await Promise.all([
      prisma.$queryRaw<Counts[]>`SELECT
        (SELECT count(*) FROM "Hostel" WHERE "id" = ANY(${ids}))::int AS hostels,
        (SELECT count(*) FROM "Room" WHERE "hostelId" = ANY(${ids}))::int AS rooms,
        (SELECT count(*) FROM "Bed" WHERE "hostelId" = ANY(${ids}))::int AS beds,
        (SELECT count(*) FROM "Bed" WHERE "hostelId" = ANY(${ids}) AND "status" = 'OCCUPIED')::int AS occupied,
        (SELECT count(*) FROM "Bed" WHERE "hostelId" = ANY(${ids}) AND "status" = 'AVAILABLE')::int AS available,
        (SELECT count(*) FROM "Resident" WHERE "hostelId" = ANY(${ids}) AND "status" = 'ACTIVE')::int AS active,
        (SELECT count(*) FROM "Resident" WHERE "hostelId" = ANY(${ids}) AND "status" = 'NOTICE_GIVEN' AND "expectedCheckout" <= ${soon})::int AS leaving,
        (SELECT count(*) FROM "MaintenanceTicket" WHERE "hostelId" = ANY(${ids}) AND "status" IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING'))::int AS maintenance,
        (SELECT count(*) FROM "Complaint" WHERE "hostelId" = ANY(${ids}) AND "status" IN ('OPEN', 'UNDER_REVIEW', 'IN_PROGRESS'))::int AS complaints`,
      prisma.payment.aggregate({ where: { hostelId: { in: ids }, status: "COMPLETED", paidAt: { gte: monthStart, lte: monthEnd } }, _sum: { amount: true } }),
      prisma.expense.aggregate({ where: { hostelId: { in: ids }, status: "ACTIVE", date: { gte: monthStart, lte: monthEnd } }, _sum: { amount: true } }),
      prisma.securityDeposit.aggregate({ where: { hostelId: { in: ids }, status: { in: ["HELD", "PARTIALLY_REFUNDED"] } }, _sum: { amount: true } }),
      prisma.payment.findMany({ where: { hostelId: { in: ids }, status: "COMPLETED" }, orderBy: { paidAt: "desc" }, take: 6, include: { resident: { select: { fullName: true } } } }),
      prisma.expense.findMany({ where: { hostelId: { in: ids }, status: "ACTIVE" }, orderBy: { date: "desc" }, take: 6 }),
      // Outstanding rent
      prisma.rentCharge.findMany({
        where: { hostelId: { in: ids }, status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] } },
        select: { amount: true, discount: true, amountPaid: true, status: true },
      }),
      canSeeProfit
        ? Promise.all([
            profitAndLoss(ids, { from: monthStart, to: monthEnd }),
            monthlyTrend(ids, 6),
            prisma.expense.groupBy({ by: ["category"], where: { hostelId: { in: ids }, status: "ACTIVE" }, _sum: { amount: true } }),
          ])
        : Promise.resolve(null),
    ]);
    const c = countRows[0];
    const totalHostels = c.hostels, totalRooms = c.rooms, totalBeds = c.beds, occupiedBeds = c.occupied, availableBeds = c.available;
    const activeResidents = c.active, leavingSoon = c.leaving, pendingMaintenance = c.maintenance, pendingComplaints = c.complaints;
    const outstandingRent = outstandingCharges.reduce((s, c) => s + Math.max(0, dec(c.amount) - dec(c.discount) - dec(c.amountPaid)), 0);
    const overdueRent = outstandingCharges.filter((c) => c.status === "OVERDUE").reduce((s, c) => s + Math.max(0, dec(c.amount) - dec(c.discount) - dec(c.amountPaid)), 0);

    const monthRevenue = dec(monthRevenuePayments._sum.amount);
    const monthExpenseTotal = dec(monthExpenses._sum.amount);

    const response: any = {
      kpis: {
        totalHostels, totalRooms, totalBeds, occupiedBeds, availableBeds,
        occupancyRate: totalBeds ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
        activeResidents, leavingSoon, pendingMaintenance, pendingComplaints,
        monthRevenue, monthExpenses: monthExpenseTotal,
        outstandingRent, overdueRent,
        depositsHeld: dec(depositsHeld._sum.amount),
        collectionRate: monthRevenue + outstandingRent > 0 ? Math.round((monthRevenue / (monthRevenue + outstandingRent)) * 100) : 0,
      },
      recentPayments: recentPayments.map((p) => ({ id: p.id, amount: dec(p.amount), resident: p.resident.fullName, method: p.method, paidAt: p.paidAt })),
      recentExpenses: recentExpenses.map((e) => ({ id: e.id, amount: dec(e.amount), category: e.category, vendor: e.vendor, date: e.date })),
    };

    // Sensitive: only include profit figures & charts when permitted.
    if (profit) {
      const [pl, trend, expenseCats] = profit;
      response.kpis.netProfit = pl.netProfit;
      response.kpis.profitMargin = pl.profitMargin;
      response.charts = {
        monthlyTrend: trend,
        expenseCategories: expenseCats.map((c) => ({ category: c.category, amount: dec(c._sum.amount) })).sort((a, b) => b.amount - a.amount),
        revenuePerBed: occupiedBeds ? Math.round(monthRevenue / occupiedBeds) : 0,
      };
    }

    res.json(response);
  })
);

export default router;
