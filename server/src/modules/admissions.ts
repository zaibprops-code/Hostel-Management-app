import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, conflict, notFound } from "../lib/http";
import { validateBody } from "../middleware/validate";
import { requirePermission, assertHostelAccess } from "../middleware/rbac";
import { audit } from "../lib/audit";
import { ensureRentCharge } from "../lib/rent";
import { dec } from "../lib/query";

const router = Router();

const admissionSchema = z.object({
  residentId: z.string(),
  bedId: z.string(),
  admissionDate: z.coerce.date(),
  monthlyRent: z.coerce.number().min(0),
  depositAmount: z.coerce.number().min(0).default(0),
  rentDueDay: z.coerce.number().int().min(1).max(28).default(1),
  contractMonths: z.coerce.number().int().min(0).optional(),
  foodPlanId: z.string().optional(),
  initialPayment: z.coerce.number().min(0).default(0),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CARD", "OTHER"]).default("CASH"),
  notes: z.string().optional(),
});

// POST /api/admissions — the full check-in workflow, atomic.
router.post(
  "/",
  requirePermission("admissions.manage"),
  validateBody(admissionSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof admissionSchema>;

    const [resident, bed] = await Promise.all([
      prisma.resident.findUnique({ where: { id: body.residentId } }),
      prisma.bed.findUnique({ where: { id: body.bedId }, include: { resident: true } }),
    ]);
    if (!resident) throw notFound("Resident not found");
    if (!bed) throw notFound("Bed not found");
    await assertHostelAccess(req, bed.hostelId);

    // Business rule: a bed cannot be assigned to two active residents.
    if (bed.status === "OCCUPIED" || bed.resident) {
      throw conflict("That bed is already occupied");
    }
    if (bed.status === "MAINTENANCE" || bed.status === "BLOCKED") {
      throw conflict(`That bed is ${bed.status.toLowerCase()} and cannot be assigned`);
    }
    if (resident.bedId) {
      throw conflict("This resident is already assigned to a bed");
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Assign bed + activate resident
      const updatedResident = await tx.resident.update({
        where: { id: resident.id },
        data: {
          bedId: bed.id,
          hostelId: bed.hostelId,
          status: "ACTIVE",
          admissionDate: body.admissionDate,
          checkInDate: body.admissionDate,
          monthlyRent: body.monthlyRent,
          contractMonths: body.contractMonths,
          foodPlanId: body.foodPlanId,
        },
      });

      // 2. Mark bed occupied
      await tx.bed.update({ where: { id: bed.id }, data: { status: "OCCUPIED" } });

      // 3. Record the admission
      const admission = await tx.admission.create({
        data: {
          hostelId: bed.hostelId,
          residentId: resident.id,
          bedId: bed.id,
          admissionDate: body.admissionDate,
          monthlyRent: body.monthlyRent,
          depositAmount: body.depositAmount,
          rentDueDay: body.rentDueDay,
          contractMonths: body.contractMonths,
          notes: body.notes,
        },
      });

      // 4. First month's rent charge
      const charge = await ensureRentCharge(tx, {
        hostelId: bed.hostelId,
        residentId: resident.id,
        year: body.admissionDate.getFullYear(),
        month: body.admissionDate.getMonth() + 1,
        amount: body.monthlyRent,
        dueDay: body.rentDueDay,
      });

      // 5. Security deposit (kept separate from revenue)
      if (body.depositAmount > 0) {
        const deposit = await tx.securityDeposit.create({
          data: {
            hostelId: bed.hostelId,
            residentId: resident.id,
            amount: body.depositAmount,
            method: body.paymentMethod,
            status: "HELD",
          },
        });
        await tx.depositTransaction.create({
          data: { depositId: deposit.id, type: "DEPOSIT", amount: body.depositAmount, reason: "Initial security deposit" },
        });
      }

      // 6. Initial rent payment, allocated to the first charge
      if (body.initialPayment > 0) {
        const payment = await tx.payment.create({
          data: {
            hostelId: bed.hostelId,
            residentId: resident.id,
            amount: body.initialPayment,
            method: body.paymentMethod,
            receivedById: req.auth!.id,
            notes: "Initial payment at admission",
          },
        });
        const applied = Math.min(body.initialPayment, Number(charge.amount));
        await tx.paymentAllocation.create({
          data: { paymentId: payment.id, rentChargeId: charge.id, amount: applied },
        });
        const newPaid = Number(charge.amountPaid) + applied;
        await tx.rentCharge.update({
          where: { id: charge.id },
          data: {
            amountPaid: newPaid,
            status: newPaid >= Number(charge.amount) ? "PAID" : "PARTIALLY_PAID",
          },
        });
      }

      return { admission, resident: updatedResident };
    });

    await audit({ userId: req.auth!.id, action: "admission.create", entity: "Admission", entityId: result.admission.id, hostelId: bed.hostelId, newValue: { residentId: resident.id, bedId: bed.id } });
    res.status(201).json(result.admission);
  })
);

// GET /api/admissions — recent admissions
router.get(
  "/",
  requirePermission("residents.view"),
  asyncHandler(async (req, res) => {
    const admissions = await prisma.admission.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        resident: { select: { id: true, fullName: true } },
        bed: { include: { room: true } },
        hostel: { select: { id: true, name: true } },
      },
    });
    res.json(
      admissions.map((a) => ({
        id: a.id,
        admissionDate: a.admissionDate,
        monthlyRent: dec(a.monthlyRent),
        depositAmount: dec(a.depositAmount),
        resident: a.resident,
        room: a.bed.room.name,
        bed: a.bed.label,
        hostel: a.hostel,
      }))
    );
  })
);

export default router;
