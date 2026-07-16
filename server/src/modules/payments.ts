import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, forbidden, notFound } from "../lib/http";
import { validateBody, parsePagination } from "../middleware/validate";
import { requirePermission, assertHostelAccess } from "../middleware/rbac";
import { hostelScope, dec } from "../lib/query";
import { hasPermission } from "../lib/permissions";
import { computeStatus } from "../lib/rent";
import { audit } from "../lib/audit";

const router = Router();

// GET /api/payments — paginated list
router.get(
  "/",
  requirePermission("payments.view"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, search } = parsePagination(req.query);
    const scope = await hostelScope(req);
    const where: any = { ...scope };
    if (search) where.resident = { fullName: { contains: search, mode: "insensitive" } };

    const [total, payments, agg] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        orderBy: { paidAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { resident: { select: { id: true, fullName: true } }, hostel: { select: { name: true } } },
      }),
      prisma.payment.aggregate({ where: { ...where, status: "COMPLETED" }, _sum: { amount: true } }),
    ]);

    res.json({
      total,
      page,
      pageSize,
      totalCollected: dec(agg._sum.amount),
      data: payments.map((p) => ({
        id: p.id,
        amount: dec(p.amount),
        method: p.method,
        reference: p.reference,
        paidAt: p.paidAt,
        status: p.status,
        notes: p.notes,
        resident: p.resident,
        hostel: p.hostel.name,
      })),
    });
  })
);

const paymentSchema = z.object({
  residentId: z.string(),
  amount: z.coerce.number().positive(),
  method: z.enum(["CASH", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CARD", "OTHER"]),
  reference: z.string().optional(),
  paidAt: z.coerce.date().optional(),
  notes: z.string().optional(),
  // optional explicit allocation to specific rent charges
  chargeIds: z.array(z.string()).optional(),
});

// POST /api/payments — record a payment and auto-allocate to outstanding rent
router.post(
  "/",
  requirePermission("payments.manage"),
  validateBody(paymentSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof paymentSchema>;
    const resident = await prisma.resident.findUnique({ where: { id: body.residentId } });
    if (!resident) throw notFound("Resident not found");
    await assertHostelAccess(req, resident.hostelId);

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          hostelId: resident.hostelId,
          residentId: resident.id,
          amount: body.amount,
          method: body.method,
          reference: body.reference,
          paidAt: body.paidAt ?? new Date(),
          receivedById: req.auth!.id,
          notes: body.notes,
        },
      });

      // Allocate oldest-first across outstanding charges.
      const charges = await tx.rentCharge.findMany({
        where: {
          residentId: resident.id,
          status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
          ...(body.chargeIds && body.chargeIds.length ? { id: { in: body.chargeIds } } : {}),
        },
        orderBy: [{ periodYear: "asc" }, { periodMonth: "asc" }],
      });

      let remaining = body.amount;
      for (const charge of charges) {
        if (remaining <= 0) break;
        const balance = dec(charge.amount) - dec(charge.discount) - dec(charge.amountPaid);
        if (balance <= 0) continue;
        const applied = Math.min(remaining, balance);
        await tx.paymentAllocation.create({ data: { paymentId: created.id, rentChargeId: charge.id, amount: applied } });
        const newPaid = dec(charge.amountPaid) + applied;
        await tx.rentCharge.update({
          where: { id: charge.id },
          data: { amountPaid: newPaid, status: computeStatus(dec(charge.amount), dec(charge.discount), newPaid, charge.dueDate) },
        });
        remaining -= applied;
      }
      // Any unallocated remainder stays as an advance (unallocated payment).
      return created;
    });

    await audit({ userId: req.auth!.id, action: "payment.create", entity: "Payment", entityId: payment.id, hostelId: resident.hostelId, newValue: { amount: body.amount, method: body.method } });
    res.status(201).json({ id: payment.id, amount: dec(payment.amount) });
  })
);

// GET /api/payments/:id/receipt — receipt data (rendered as PDF/print on client)
router.get(
  "/:id/receipt",
  requirePermission("payments.view"),
  asyncHandler(async (req, res) => {
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: {
        resident: { include: { bed: { include: { room: true } } } },
        hostel: { include: { company: true } },
        allocations: { include: { rentCharge: true } },
      },
    });
    if (!payment) throw notFound("Payment not found");
    await assertHostelAccess(req, payment.hostelId);
    res.json({
      id: payment.id,
      company: payment.hostel.company.name,
      hostel: payment.hostel.name,
      resident: payment.resident.fullName,
      room: payment.resident.bed?.room.name,
      bed: payment.resident.bed?.label,
      amount: dec(payment.amount),
      method: payment.method,
      reference: payment.reference,
      paidAt: payment.paidAt,
      status: payment.status,
      allocations: payment.allocations.map((a) => ({
        amount: dec(a.amount),
        period: a.rentCharge ? `${a.rentCharge.periodMonth}/${a.rentCharge.periodYear}` : "Advance",
      })),
    });
  })
);

// POST /api/payments/:id/void — reverse a payment (financial records are never deleted)
router.post(
  "/:id/void",
  requirePermission("payments.manage"),
  validateBody(z.object({ reason: z.string().min(3) })),
  asyncHandler(async (req, res) => {
    if (!hasPermission(req.auth!.role, req.auth!.permissions, "payments.manage")) throw forbidden();
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id }, include: { allocations: true } });
    if (!payment) throw notFound("Payment not found");
    await assertHostelAccess(req, payment.hostelId);
    if (payment.status === "VOIDED") throw badRequest("Payment already voided");

    await prisma.$transaction(async (tx) => {
      // Reverse allocations from the affected charges
      for (const alloc of payment.allocations) {
        if (!alloc.rentChargeId) continue;
        const charge = await tx.rentCharge.findUnique({ where: { id: alloc.rentChargeId } });
        if (!charge) continue;
        const newPaid = Math.max(0, dec(charge.amountPaid) - dec(alloc.amount));
        await tx.rentCharge.update({
          where: { id: charge.id },
          data: { amountPaid: newPaid, status: computeStatus(dec(charge.amount), dec(charge.discount), newPaid, charge.dueDate) },
        });
      }
      await tx.payment.update({ where: { id: payment.id }, data: { status: "VOIDED", voidReason: req.body.reason } });
    });

    await audit({ userId: req.auth!.id, action: "payment.void", entity: "Payment", entityId: payment.id, hostelId: payment.hostelId, oldValue: { status: "COMPLETED" }, newValue: { status: "VOIDED", reason: req.body.reason } });
    res.json({ success: true });
  })
);

// GET /api/payments/outstanding — residents with balances
router.get(
  "/reports/outstanding",
  requirePermission("payments.view"),
  asyncHandler(async (req, res) => {
    const scope = await hostelScope(req);
    const charges = await prisma.rentCharge.findMany({
      where: { ...scope, status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] } },
      include: { resident: { select: { id: true, fullName: true, phone: true } } },
    });
    const byResident = new Map<string, { resident: any; outstanding: number; overdue: number }>();
    for (const c of charges) {
      const bal = dec(c.amount) - dec(c.discount) - dec(c.amountPaid);
      if (bal <= 0) continue;
      const entry = byResident.get(c.residentId) ?? { resident: c.resident, outstanding: 0, overdue: 0 };
      entry.outstanding += bal;
      if (c.status === "OVERDUE") entry.overdue += bal;
      byResident.set(c.residentId, entry);
    }
    res.json(Array.from(byResident.values()).sort((a, b) => b.outstanding - a.outstanding));
  })
);

export default router;
