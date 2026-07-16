import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, conflict, notFound } from "../lib/http";
import { validateBody } from "../middleware/validate";
import { requirePermission, assertHostelAccess } from "../middleware/rbac";
import { audit } from "../lib/audit";
import { dec } from "../lib/query";

const router = Router();

// GET /api/checkouts/:residentId/settlement — preview the final settlement
router.get(
  "/:residentId/settlement",
  requirePermission("residents.view"),
  asyncHandler(async (req, res) => {
    const resident = await prisma.resident.findUnique({
      where: { id: req.params.residentId },
      include: { rentCharges: true, deposit: true, bed: true },
    });
    if (!resident) throw notFound("Resident not found");
    await assertHostelAccess(req, resident.hostelId);

    const unpaidRent = resident.rentCharges.reduce(
      (sum, c) => sum + Math.max(0, dec(c.amount) - dec(c.discount) - dec(c.amountPaid)),
      0
    );
    const depositAmount = resident.deposit ? dec(resident.deposit.amount) : 0;

    res.json({
      residentId: resident.id,
      fullName: resident.fullName,
      unpaidRent,
      depositAmount,
      // refund preview assuming no damage/other charges yet
      previewRefund: Math.max(0, depositAmount - unpaidRent),
    });
  })
);

const checkoutSchema = z.object({
  noticeDate: z.coerce.date().optional(),
  checkoutDate: z.coerce.date(),
  damageCharges: z.coerce.number().min(0).default(0),
  otherCharges: z.coerce.number().min(0).default(0),
  inspectionNotes: z.string().optional(),
  // Managers without deposits.refund cannot finalise a refund; owner approval flows via permission.
});

// POST /api/checkouts/:residentId — finalise checkout & settlement
router.post(
  "/:residentId",
  requirePermission("residents.manage"),
  validateBody(checkoutSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof checkoutSchema>;
    const resident = await prisma.resident.findUnique({
      where: { id: req.params.residentId },
      include: { rentCharges: true, deposit: true, bed: true, checkout: true },
    });
    if (!resident) throw notFound("Resident not found");
    await assertHostelAccess(req, resident.hostelId);
    if (resident.status === "CHECKED_OUT" || resident.checkout) {
      throw conflict("Resident is already checked out");
    }

    const unpaidRent = resident.rentCharges.reduce(
      (sum, c) => sum + Math.max(0, dec(c.amount) - dec(c.discount) - dec(c.amountPaid)),
      0
    );
    const depositAmount = resident.deposit ? dec(resident.deposit.amount) : 0;
    const deductions = unpaidRent + body.damageCharges + body.otherCharges;
    const refundAmount = Math.max(0, depositAmount - deductions);

    const result = await prisma.$transaction(async (tx) => {
      const checkout = await tx.checkout.create({
        data: {
          residentId: resident.id,
          noticeDate: body.noticeDate ?? resident.noticeDate,
          checkoutDate: body.checkoutDate,
          unpaidRent,
          damageCharges: body.damageCharges,
          otherCharges: body.otherCharges,
          depositAmount,
          refundAmount,
          inspectionNotes: body.inspectionNotes,
          finalizedById: req.auth!.id,
        },
      });

      // Record deposit deductions & refund on the deposit ledger
      if (resident.deposit) {
        if (deductions > 0) {
          await tx.depositTransaction.create({
            data: {
              depositId: resident.deposit.id,
              type: "DEDUCTION",
              amount: Math.min(deductions, depositAmount),
              reason: `Checkout deductions: unpaid rent ${unpaidRent}, damage ${body.damageCharges}, other ${body.otherCharges}`,
            },
          });
        }
        if (refundAmount > 0) {
          await tx.depositTransaction.create({
            data: { depositId: resident.deposit.id, type: "REFUND", amount: refundAmount, reason: "Deposit refund at checkout" },
          });
        }
        // Damage / other charges are recorded as income (not the deposit itself).
        if (body.damageCharges > 0) {
          await tx.income.create({
            data: { hostelId: resident.hostelId, category: "DAMAGE_CHARGE", amount: body.damageCharges, date: body.checkoutDate, residentId: resident.id, notes: "Checkout damage charge", addedById: req.auth!.id },
          });
        }
        await tx.securityDeposit.update({
          where: { id: resident.deposit.id },
          data: { status: refundAmount >= depositAmount ? "REFUNDED" : refundAmount > 0 ? "PARTIALLY_REFUNDED" : "FORFEITED", refundedAt: body.checkoutDate },
        });
      }

      // Free the bed and mark resident checked out
      if (resident.bedId) {
        await tx.bed.update({ where: { id: resident.bedId }, data: { status: "AVAILABLE" } });
      }
      await tx.resident.update({
        where: { id: resident.id },
        data: { status: "CHECKED_OUT", bedId: null, expectedCheckout: body.checkoutDate },
      });

      return checkout;
    });

    await audit({ userId: req.auth!.id, action: "checkout.finalize", entity: "Checkout", entityId: result.id, hostelId: resident.hostelId, newValue: { unpaidRent, deductions, refundAmount } });
    res.status(201).json({ ...result, unpaidRent, depositAmount, refundAmount });
  })
);

// POST /api/checkouts/:residentId/notice — record notice given
router.post(
  "/:residentId/notice",
  requirePermission("residents.manage"),
  validateBody(z.object({ noticeDate: z.coerce.date(), expectedCheckout: z.coerce.date().optional() })),
  asyncHandler(async (req, res) => {
    const resident = await prisma.resident.findUnique({ where: { id: req.params.residentId }, include: { hostel: true } });
    if (!resident) throw notFound("Resident not found");
    await assertHostelAccess(req, resident.hostelId);
    if (resident.status === "CHECKED_OUT") throw badRequest("Resident already checked out");

    const expected =
      req.body.expectedCheckout ??
      new Date(new Date(req.body.noticeDate).getTime() + resident.hostel.noticePeriodDays * 86400000);

    const updated = await prisma.resident.update({
      where: { id: resident.id },
      data: { status: "NOTICE_GIVEN", noticeDate: req.body.noticeDate, expectedCheckout: expected },
    });
    await audit({ userId: req.auth!.id, action: "checkout.notice", entity: "Resident", entityId: resident.id, hostelId: resident.hostelId });
    res.json(updated);
  })
);

export default router;
