import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, conflict, notFound } from "../lib/http";
import { validateBody } from "../middleware/validate";
import { requirePermission, assertHostelAccess } from "../middleware/rbac";
import { audit } from "../lib/audit";
import { ensureRentCharge } from "../lib/rent";
import { dec } from "../lib/query";

const router = Router();

// Personal details for a brand-new resident, entered right in the admission
// form (the separate "Residents" screen has been merged into Admissions).
const residentDetails = z.object({
  fullName: z.string().min(1),
  guardianName: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  cnic: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  city: z.string().optional(),
  occupantType: z.enum(["STUDENT", "PROFESSIONAL", "DAILY"]).default("STUDENT"),
  university: z.string().optional(), // students
  program: z.string().optional(), // students
  company: z.string().optional(), // professionals
  occupation: z.string().optional(), // professionals
});

const admissionSchema = z
  .object({
    // Either admit an existing resident (residentId) or create one inline (resident).
    residentId: z.string().optional(),
    resident: residentDetails.optional(),
    hostelId: z.string().optional(), // used when no bed is assigned yet
    bedId: z.string().optional(), // optional: leave empty to just register the resident
    admissionDate: z.coerce.date(),
    monthlyRent: z.coerce.number().min(0).default(0),
    // Daily / short-stay billing
    dailyRate: z.coerce.number().min(0).default(0),
    nights: z.coerce.number().int().min(1).default(1),
    depositAmount: z.coerce.number().min(0).default(0),
    rentDueDay: z.coerce.number().int().min(1).max(28).default(1),
    contractMonths: z.coerce.number().int().min(0).optional(),
    foodPlanId: z.string().optional(),
    initialPayment: z.coerce.number().min(0).default(0),
    paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CARD", "OTHER"]).default("CASH"),
    notes: z.string().optional(),
  })
  .refine((d) => d.residentId || d.resident, { message: "Provide resident details" });

// POST /api/admissions — the full check-in workflow, atomic.
router.post(
  "/",
  requirePermission("admissions.manage"),
  validateBody(admissionSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof admissionSchema>;

    // Load the bed (if one is being assigned) and validate it can take a resident.
    let bed: Awaited<ReturnType<typeof prisma.bed.findUnique>> & { resident?: unknown } | null = null;
    if (body.bedId) {
      bed = await prisma.bed.findUnique({ where: { id: body.bedId }, include: { resident: true } });
      if (!bed) throw notFound("Bed not found");
      if (bed.status === "OCCUPIED" || (bed as any).resident) {
        throw conflict("That bed is already occupied");
      }
      if (bed.status === "MAINTENANCE" || bed.status === "BLOCKED") {
        throw conflict(`That bed is ${bed.status.toLowerCase()} and cannot be assigned`);
      }
    }

    // The hostel comes from the bed when one is assigned; otherwise it must be
    // supplied so the new resident belongs somewhere.
    const hostelId = bed ? bed.hostelId : body.hostelId;
    if (!hostelId) throw badRequest("Select a hostel or a bed");
    await assertHostelAccess(req, hostelId);

    // When admitting an existing resident, make sure they're free.
    let existing = null;
    if (body.residentId) {
      existing = await prisma.resident.findUnique({ where: { id: body.residentId } });
      if (!existing) throw notFound("Resident not found");
      if (bed && existing.bedId) throw conflict("This resident is already assigned to a bed");
    }

    // Billing basis. Students & professionals pay monthly rent; daily guests pay
    // (daily rate × nights) as a single stay charge and get an expected checkout.
    const occupantType = body.resident?.occupantType ?? (existing as any)?.occupantType ?? "STUDENT";
    const isDaily = occupantType === "DAILY";
    const nights = Math.max(1, body.nights || 1);
    const stayTotal = (body.dailyRate || 0) * nights;
    const chargeAmount = isDaily ? stayTotal : body.monthlyRent;
    const expectedCheckout = isDaily ? new Date(body.admissionDate.getTime() + nights * 86400000) : null;

    const result = await prisma.$transaction(async (tx) => {
      // 0. Create the resident inline if we weren't given an existing one.
      let residentId = body.residentId ?? "";
      if (!residentId) {
        const rd = { ...(body.resident as Record<string, unknown>) };
        if (rd.email === "") delete rd.email;
        const created = await tx.resident.create({ data: { ...rd, hostelId, status: "RESERVED" } as any });
        residentId = created.id;
      }

      // No bed assigned → the person is registered as Reserved; stop here.
      if (!bed) {
        return { admission: null as any, residentId };
      }

      // 1. Assign bed + activate resident
      await tx.resident.update({
        where: { id: residentId },
        data: {
          bedId: bed.id,
          hostelId: bed.hostelId,
          status: "ACTIVE",
          admissionDate: body.admissionDate,
          checkInDate: body.admissionDate,
          monthlyRent: isDaily ? 0 : body.monthlyRent,
          dailyRate: isDaily ? body.dailyRate : null,
          expectedCheckout,
          contractMonths: isDaily ? null : body.contractMonths,
          foodPlanId: body.foodPlanId,
        },
      });

      // 2. Mark bed occupied
      await tx.bed.update({ where: { id: bed.id }, data: { status: "OCCUPIED" } });

      // 3. Record the admission
      const admission = await tx.admission.create({
        data: {
          hostelId: bed.hostelId,
          residentId,
          bedId: bed.id,
          admissionDate: body.admissionDate,
          monthlyRent: chargeAmount, // for daily this is the total stay cost
          depositAmount: body.depositAmount,
          rentDueDay: isDaily ? body.admissionDate.getDate() : body.rentDueDay,
          contractMonths: isDaily ? null : body.contractMonths,
          notes: body.notes,
        },
      });

      // 4. Rent charge — one month for long-term, one stay total for daily guests
      const charge = await ensureRentCharge(tx, {
        hostelId: bed.hostelId,
        residentId,
        year: body.admissionDate.getFullYear(),
        month: body.admissionDate.getMonth() + 1,
        amount: chargeAmount,
        dueDay: isDaily ? body.admissionDate.getDate() : body.rentDueDay,
      });

      // 5. Security deposit (kept separate from revenue)
      if (body.depositAmount > 0) {
        const deposit = await tx.securityDeposit.create({
          data: {
            hostelId: bed.hostelId,
            residentId,
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
            residentId,
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

      return { admission, residentId };
    });

    await audit({
      userId: req.auth!.id,
      action: result.admission ? "admission.create" : "resident.create",
      entity: result.admission ? "Admission" : "Resident",
      entityId: result.admission ? result.admission.id : result.residentId,
      hostelId,
      newValue: { residentId: result.residentId, bedId: body.bedId ?? null },
    });
    res.status(201).json(result.admission ?? { residentId: result.residentId });
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
