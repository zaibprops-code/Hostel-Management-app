import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, conflict, notFound } from "../lib/http";
import { validateBody, parsePagination } from "../middleware/validate";
import { requirePermission, assertHostelAccess } from "../middleware/rbac";
import { hostelScope, dec, fileMimes } from "../lib/query";
import { catchUpRent, generateDueRent, redateOpenCharges, rentCycle, proRata, proRataNote, firstChargeDueDate, residentDueDay, ymd, resetCharge, switchToCalendar } from "../lib/rent";
import { audit } from "../lib/audit";

const router = Router();

const residentSchema = z.object({
  hostelId: z.string(),
  fullName: z.string().min(1),
  guardianName: z.string().optional(),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  cnic: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  permanentAddress: z.string().optional(),
  currentAddress: z.string().optional(),
  city: z.string().optional(),
  emergencyName: z.string().optional(),
  emergencyPhone: z.string().optional(),
  emergencyRelation: z.string().optional(),
  occupantType: z.enum(["STUDENT", "PROFESSIONAL", "DAILY"]).optional(),
  university: z.string().optional(),
  program: z.string().optional(),
  company: z.string().optional(),
  occupation: z.string().optional(),
  studentId: z.string().optional(),
});

// GET /api/residents — paginated, searchable, filterable list
router.get(
  "/",
  requirePermission("residents.view"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, search } = parsePagination(req.query);
    const scope = await hostelScope(req);
    await catchUpRent(prisma, scope.hostelId.in); // ensure this month's charges exist
    const status = req.query.status as string | undefined;

    const where: any = { ...scope };
    if (status) where.status = status;
    if (req.query.pendingReview === "true") where.pendingReview = true;
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
        { cnic: { contains: search } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const [total, residents, pendingCount] = await Promise.all([
      prisma.resident.count({ where }),
      prisma.resident.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          hostel: { select: { id: true, name: true, rentDueDay: true } },
          bed: { include: { room: true } },
          rentCharges: {
            where: { status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] } },
            select: { periodYear: true, periodMonth: true, amount: true, discount: true, amountPaid: true, dueDate: true },
          },
        },
      }),
      // How many self-intake submissions in scope still await review (any filter).
      prisma.resident.count({ where: { ...scope, pendingReview: true } }),
    ]);

    res.json({
      total,
      pendingCount,
      page,
      pageSize,
      data: residents.map((r) => {
        const cycle = r.occupantType === "DAILY"
          ? null
          : rentCycle(r.rentCharges.map((c) => ({ periodYear: c.periodYear, periodMonth: c.periodMonth, amount: dec(c.amount), discount: dec(c.discount), amountPaid: dec(c.amountPaid), dueDate: c.dueDate })), r.billingDay ?? r.hostel.rentDueDay);
        return {
        id: r.id,
        fullName: r.fullName,
        photoUrl: r.photoUrl,
        occupantType: r.occupantType,
        dailyRate: dec(r.dailyRate),
        guests: r.guests,
        phone: r.phone,
        cnic: r.cnic,
        status: r.status,
        pendingReview: r.pendingReview,
        monthlyRent: dec(r.monthlyRent),
        rentStatus: cycle?.status ?? null, // PAID | DUE | OVERDUE (monthly only)
        rentDueDate: cycle?.nextDueDate ?? null,
        hostel: r.hostel,
        room: r.bed?.room.name ?? null,
        bed: r.bed?.label ?? null,
        checkInDate: r.checkInDate,
      };
      }),
    });
  })
);

// GET /api/residents/:id — full profile with financials
router.get(
  "/:id",
  requirePermission("residents.view"),
  asyncHandler(async (req, res) => {
    const head = await prisma.resident.findUnique({ where: { id: req.params.id }, select: { hostelId: true } });
    if (!head) throw notFound("Resident not found");
    await assertHostelAccess(req, head.hostelId);
    // Bring this resident's rent up to date: any month they now owe is
    // charged, and unpaid months past their due date read OVERDUE.
    await generateDueRent(prisma, undefined, [req.params.id]);
    await prisma.rentCharge.updateMany({ where: { residentId: req.params.id, status: "PENDING", dueDate: { lt: new Date() } }, data: { status: "OVERDUE" } });

    const resident = await prisma.resident.findUnique({
      where: { id: req.params.id },
      include: {
        hostel: { select: { id: true, name: true, rentDueDay: true } },
        bed: { include: { room: { include: { floor: true } } } },
        foodPlan: true,
        documents: true,
        deposit: { include: { transactions: true } },
        rentCharges: { orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }] },
        payments: { orderBy: { paidAt: "desc" }, take: 20 },
        complaints: { orderBy: { createdAt: "desc" }, take: 10 },
        tickets: { orderBy: { createdAt: "desc" }, take: 10 },
        visitors: { orderBy: { arrivalTime: "desc" }, take: 10 },
        checkout: true,
      },
    });
    if (!resident) throw notFound("Resident not found");
    await assertHostelAccess(req, resident.hostelId);

    const outstanding = resident.rentCharges.reduce(
      (sum, c) => sum + (dec(c.amount) - dec(c.discount) - dec(c.amountPaid)),
      0
    );
    const proofMimes = await fileMimes(resident.payments.map((p) => p.proofUrl));
    // Room changes, newest first (kept in the audit log).
    const moves = await prisma.auditLog.findMany({
      where: { entity: "Resident", entityId: resident.id, action: "resident.move" },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { select: { name: true } } },
    });

    // Advance credit = money paid but not yet tied to any charge (an overpayment
    // or the leftover from a pro-rated join month) — it will settle future rent.
    const [paidAgg, allocAgg] = await Promise.all([
      prisma.payment.aggregate({ where: { residentId: resident.id, status: "COMPLETED" }, _sum: { amount: true } }),
      prisma.paymentAllocation.aggregate({ where: { payment: { residentId: resident.id, status: "COMPLETED" } }, _sum: { amount: true } }),
    ]);
    const advanceCredit = Math.max(0, dec(paidAgg._sum.amount) - dec(allocAgg._sum.amount));

    const cycle = resident.occupantType === "DAILY"
      ? null
      : rentCycle(resident.rentCharges.map((c) => ({ periodYear: c.periodYear, periodMonth: c.periodMonth, amount: dec(c.amount), discount: dec(c.discount), amountPaid: dec(c.amountPaid), dueDate: c.dueDate })), resident.billingDay ?? resident.hostel.rentDueDay);

    // The join month, pro-rata: what the first month costs for only the days
    // stayed, and whether it was billed as a full month instead (so the page
    // can offer a one-tap fix).
    let firstMonth = null;
    if (resident.occupantType !== "DAILY" && resident.admissionDate) {
      const adm = resident.admissionDate;
      const rent = dec(resident.monthlyRent);
      const pr = proRata(adm, rent);
      const charge = resident.rentCharges.find((c) => c.periodYear === adm.getFullYear() && c.periodMonth === adm.getMonth() + 1);
      const charged = charge ? dec(charge.amount) : null;
      firstMonth = {
        chargeId: charge?.id ?? null,
        periodYear: adm.getFullYear(),
        periodMonth: adm.getMonth() + 1,
        ...pr,
        chargedAmount: charged,
        amountPaid: charge ? dec(charge.amountPaid) : 0,
        dueOn: ymd(firstChargeDueDate(resident.billingMode, adm, residentDueDay(resident, resident.hostel.rentDueDay))),
        // Billed as a full month although they joined mid-month — offered while
        // that month is still unsettled or they joined recently (older, settled
        // join months can still be pro-rated from the charge's Adjust).
        canProrate: resident.billingMode === "CALENDAR" && !!charge && charge.status !== "WAIVED"
          && pr.days < pr.daysInMonth && charged != null && Math.abs(charged - rent) < 0.5
          && (dec(charge.amountPaid) < charged - 0.5 || Date.now() - adm.getTime() < 60 * 86400000),
      };
    }

    res.json({
      ...resident,
      monthlyRent: dec(resident.monthlyRent),
      dailyRate: dec(resident.dailyRate),
      outstanding: Math.max(0, outstanding),
      advanceCredit,
      rentCycle: cycle,
      firstMonth,
      roomHistory: moves.map((m) => {
        const o = (m.oldValue ?? {}) as Record<string, any>;
        const n = (m.newValue ?? {}) as Record<string, any>;
        return {
          id: m.id,
          movedOn: n.moveDate ?? ymd(m.createdAt),
          crossBranch: !!n.crossBranch,
          from: [n.crossBranch ? o.hostelName : null, o.roomName, o.bedLabel].filter(Boolean).join(" · "),
          to: [n.crossBranch ? n.hostelName : null, n.roomName, n.bedLabel].filter(Boolean).join(" · "),
          oldRent: o.monthlyRent ?? null,
          newRent: n.monthlyRent ?? null,
          rentFrom: n.rentFrom ?? null,
          reason: n.reason ?? null,
          by: m.user?.name ?? null,
        };
      }),
      deposit: resident.deposit
        ? {
            ...resident.deposit,
            amount: dec(resident.deposit.amount),
            transactions: resident.deposit.transactions.map((t) => ({ ...t, amount: dec(t.amount) })),
          }
        : null,
      rentCharges: resident.rentCharges.map((c) => ({
        ...c,
        amount: dec(c.amount),
        discount: dec(c.discount),
        amountPaid: dec(c.amountPaid),
        balance: Math.max(0, dec(c.amount) - dec(c.discount) - dec(c.amountPaid)),
        dueOn: ymd(c.dueDate),
      })),
      payments: resident.payments.map((p) => ({ ...p, amount: dec(p.amount), proofMime: p.proofUrl ? proofMimes[p.proofUrl] ?? null : null })),
    });
  })
);

// POST /api/residents — create a profile (not yet admitted / no bed)
router.post(
  "/",
  requirePermission("residents.manage"),
  validateBody(residentSchema),
  asyncHandler(async (req, res) => {
    await assertHostelAccess(req, req.body.hostelId);
    const data = { ...req.body };
    if (data.email === "") delete data.email;
    const resident = await prisma.resident.create({ data: { ...data, status: "RESERVED" } });
    await audit({ userId: req.auth!.id, action: "resident.create", entity: "Resident", entityId: resident.id, hostelId: resident.hostelId, newValue: { fullName: resident.fullName } });
    res.status(201).json(resident);
  })
);

// PUT /api/residents/:id
router.put(
  "/:id",
  requirePermission("residents.manage"),
  validateBody(residentSchema.partial()),
  asyncHandler(async (req, res) => {
    const before = await prisma.resident.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound("Resident not found");
    await assertHostelAccess(req, before.hostelId);
    const data = { ...req.body };
    if (data.email === "") delete data.email;
    // Editing counts as reviewing a self-intake submission.
    const resident = await prisma.resident.update({ where: { id: before.id }, data: { ...data, pendingReview: false } });
    await audit({ userId: req.auth!.id, action: "resident.update", entity: "Resident", entityId: resident.id, hostelId: resident.hostelId });
    res.json(resident);
  })
);

const statusSchema = z.object({ status: z.enum(["ACTIVE", "RESERVED", "NOTICE_GIVEN", "CHECKED_OUT", "SUSPENDED", "BLACKLISTED"]) });

// PATCH /api/residents/:id/status
router.patch(
  "/:id/status",
  requirePermission("residents.manage"),
  validateBody(statusSchema),
  asyncHandler(async (req, res) => {
    const before = await prisma.resident.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound("Resident not found");
    await assertHostelAccess(req, before.hostelId);
    const resident = await prisma.resident.update({ where: { id: before.id }, data: { status: req.body.status } });
    await audit({ userId: req.auth!.id, action: "resident.status", entity: "Resident", entityId: resident.id, hostelId: resident.hostelId, oldValue: { status: before.status }, newValue: { status: req.body.status } });
    res.json(resident);
  })
);

// PATCH /api/residents/:id/billing — edit the agreed rent terms after admission
// (monthly rent, cycle mode, billing day). Existing charges are left as they
// are — adjust a specific month with the charge-adjust route if needed; only
// future months pick up the new rent.
router.patch(
  "/:id/billing",
  requirePermission("residents.manage"),
  validateBody(z.object({
    monthlyRent: z.coerce.number().min(0).optional(),
    billingMode: z.enum(["CALENDAR", "ANCHORED"]).optional(),
    billingDay: z.coerce.number().int().min(1).max(28).nullable().optional(),
  })),
  asyncHandler(async (req, res) => {
    const before = await prisma.resident.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound("Resident not found");
    await assertHostelAccess(req, before.hostelId);
    const data: Record<string, unknown> = {};
    if (req.body.monthlyRent != null) data.monthlyRent = req.body.monthlyRent;
    if (req.body.billingMode) data.billingMode = req.body.billingMode;
    if (req.body.billingDay !== undefined) data.billingDay = req.body.billingDay;
    // Join-day cycle → calendar months: cut the current cycle at month end so
    // no days are billed twice (handled by switchToCalendar).
    const toCalendar = before.billingMode === "ANCHORED" && req.body.billingMode === "CALENDAR";
    const resident = await prisma.$transaction(async (tx) => {
      const { billingMode: _m, billingDay: _d, ...rest } = data;
      const plain = toCalendar ? rest : data;
      if (Object.keys(plain).length) await tx.resident.update({ where: { id: before.id }, data: plain });
      if (toCalendar) {
        await switchToCalendar(tx, before.id, req.body.billingDay ?? null);
      } else if (data.billingMode || data.billingDay !== undefined) {
        // A new due day / cycle moves the months still unpaid to match.
        await redateOpenCharges(tx, { residentId: before.id });
      }
      return tx.resident.findUniqueOrThrow({ where: { id: before.id } });
    });
    await audit({ userId: req.auth!.id, action: "resident.billing", entity: "Resident", entityId: resident.id, hostelId: resident.hostelId, newValue: data });
    res.json({ id: resident.id, monthlyRent: dec(resident.monthlyRent), billingMode: resident.billingMode, billingDay: resident.billingDay });
  })
);

// POST /api/residents/:id/deposit — record (or top up) the security deposit a
// resident pays, possibly after admission. Upserts the single deposit record
// and logs a DEPOSIT transaction.
router.post(
  "/:id/deposit",
  requirePermission("payments.manage"),
  validateBody(z.object({
    amount: z.coerce.number().positive(),
    method: z.enum(["CASH", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CARD", "OTHER"]).default("CASH"),
    reason: z.string().optional(),
  })),
  asyncHandler(async (req, res) => {
    const resident = await prisma.resident.findUnique({ where: { id: req.params.id } });
    if (!resident) throw notFound("Resident not found");
    await assertHostelAccess(req, resident.hostelId);
    const { amount, method, reason } = req.body;

    const deposit = await prisma.$transaction(async (tx) => {
      const existing = await tx.securityDeposit.findUnique({ where: { residentId: resident.id } });
      const dep = existing
        ? await tx.securityDeposit.update({ where: { id: existing.id }, data: { amount: dec(existing.amount) + amount, status: "HELD", method } })
        : await tx.securityDeposit.create({ data: { hostelId: resident.hostelId, residentId: resident.id, amount, method, status: "HELD" } });
      await tx.depositTransaction.create({ data: { depositId: dep.id, type: "DEPOSIT", amount, reason: reason || "Security deposit received" } });
      return dep;
    });
    await audit({ userId: req.auth!.id, action: "deposit.record", entity: "SecurityDeposit", entityId: deposit.id, hostelId: resident.hostelId, newValue: { amount } });
    res.status(201).json({ id: deposit.id, amount: dec(deposit.amount) });
  })
);

// PUT /api/residents/:id/deposit — edit the security deposit held: set it to an
// exact amount (e.g. fix a wrong entry, or undo rent that was converted into
// deposit). The difference is logged on the deposit ledger as a signed DEPOSIT
// correction so the history stays traceable. A deposit already settled at
// checkout (refunded / forfeited) can't be edited.
router.put(
  "/:id/deposit",
  requirePermission("payments.manage"),
  validateBody(z.object({
    amount: z.coerce.number().min(0),
    method: z.enum(["CASH", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CARD", "OTHER"]).optional(),
    reason: z.string().optional(),
  })),
  asyncHandler(async (req, res) => {
    const resident = await prisma.resident.findUnique({ where: { id: req.params.id }, include: { deposit: true } });
    if (!resident) throw notFound("Resident not found");
    await assertHostelAccess(req, resident.hostelId);
    const existing = resident.deposit;
    if (existing && existing.status !== "HELD") throw badRequest("This deposit was already settled at checkout and can't be edited.");
    const { amount, method, reason } = req.body;
    const before = existing ? dec(existing.amount) : 0;
    const diff = amount - before;

    if (!existing && amount <= 0) return res.json({ id: null, amount: 0 });

    const deposit = await prisma.$transaction(async (tx) => {
      const dep = existing
        ? await tx.securityDeposit.update({ where: { id: existing.id }, data: { amount, ...(method ? { method } : {}) } })
        : await tx.securityDeposit.create({ data: { hostelId: resident.hostelId, residentId: resident.id, amount, method: method ?? "CASH", status: "HELD" } });
      if (Math.abs(diff) > 0.001) {
        await tx.depositTransaction.create({
          data: { depositId: dep.id, type: "DEPOSIT", amount: diff, reason: reason || `Deposit corrected: ${before} → ${amount}` },
        });
      }
      return dep;
    });
    await audit({ userId: req.auth!.id, action: "deposit.edit", entity: "SecurityDeposit", entityId: deposit.id, hostelId: resident.hostelId, oldValue: { amount: before }, newValue: { amount } });
    res.json({ id: deposit.id, amount: dec(deposit.amount) });
  })
);

// POST /api/residents/:id/charges/:chargeId/adjust — make a single month's rent
// flexible: change its amount (e.g. pro-rate the join month), apply a discount,
// or waive the balance. If a payment was already over-applied to this charge,
// the freed excess goes where `excessTo` says: to the SECURITY DEPOSIT (default)
// so next month is still billed in full, or kept as advance credit against the
// coming months.
router.post(
  "/:id/charges/:chargeId/adjust",
  requirePermission("payments.manage"),
  validateBody(z.object({
    amount: z.coerce.number().min(0).optional(),
    discount: z.coerce.number().min(0).optional(),
    waive: z.coerce.boolean().optional(),   // set discount so the net becomes 0
    prorate: z.coerce.boolean().optional(), // recompute amount pro-rata to join date
    excessTo: z.enum(["deposit", "credit"]).default("deposit"),
    note: z.string().optional(),
  })),
  asyncHandler(async (req, res) => {
    const resident = await prisma.resident.findUnique({ where: { id: req.params.id }, include: { hostel: { select: { rentDueDay: true } } } });
    if (!resident) throw notFound("Resident not found");
    await assertHostelAccess(req, resident.hostelId);
    const charge = await prisma.rentCharge.findUnique({ where: { id: req.params.chargeId }, include: { allocations: true } });
    if (!charge || charge.residentId !== resident.id) throw notFound("Charge not found");

    let amount = req.body.amount != null ? req.body.amount : dec(charge.amount);
    let dueDate = charge.dueDate;
    let notes = req.body.note ?? charge.notes;
    if (req.body.prorate) {
      // Only the join month can be pro-rated: bill just the days stayed, due on
      // the first rent day on/after joining, with the breakdown as its note.
      const adm = resident.admissionDate;
      if (!adm || charge.periodYear !== adm.getFullYear() || charge.periodMonth !== adm.getMonth() + 1) {
        throw badRequest("Only the month the resident joined can be pro-rated.");
      }
      const rent = dec(resident.monthlyRent);
      amount = proRata(adm, rent).amount;
      dueDate = firstChargeDueDate(resident.billingMode, adm, residentDueDay(resident, resident.hostel.rentDueDay));
      notes = req.body.note || proRataNote(adm, rent);
    }
    let discount = req.body.discount != null ? req.body.discount : dec(charge.discount);
    // Waive = forgive only the still-outstanding balance: discount down to what
    // has already been paid (so a part-paid month settles, a fully-unpaid month
    // becomes a zero-net waiver).
    if (req.body.waive) discount = Math.max(0, amount - dec(charge.amountPaid));

    await prisma.$transaction(async (tx) => {
      if (req.body.prorate && resident.billingMode === "CALENDAR") {
        await tx.resident.update({ where: { id: resident.id }, data: { proratedFirst: true } });
      }
      await resetCharge(tx, resident, charge, { amount, discount, dueDate, notes, excessTo: req.body.excessTo });
    });

    await audit({ userId: req.auth!.id, action: "rentcharge.adjust", entity: "RentCharge", entityId: charge.id, hostelId: resident.hostelId, oldValue: { amount: dec(charge.amount), discount: dec(charge.discount) }, newValue: { amount, discount } });
    res.json({ success: true });
  })
);

// POST /api/residents/:id/move — change a resident's room / bed, in the same
// hostel or another branch. The new bed must be free; the old bed becomes
// available (or goes to maintenance). Rent can stay, or change to a new amount
// starting either
//   • NEXT_MONTH — the move month is billed as before, later months at the new
//     rent; or
//   • MOVE_DATE — the move month is split by days (old rent before the move,
//     new rent from the move day), later months at the new rent.
// Any rent already paid above a reduced charge becomes advance credit.
//
// Moving to another branch (hostel):
//   • The month of the move stays with the branch it started in; later
//     months belong to the new branch.
//   • Unpaid rent up to the move month is old-branch money: record it first,
//     or pass carryBalance to hand it to the new branch to collect.
//   • The security deposit moves with the resident (the new branch holds and
//     refunds it). The rent-due day follows the new hostel.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const perDayLabel = (n: number) => `₨${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
router.post(
  "/:id/move",
  requirePermission("residents.manage"),
  validateBody(z.object({
    bedId: z.string(),
    moveDate: z.coerce.date(),
    monthlyRent: z.coerce.number().min(0).optional(),
    rentFrom: z.enum(["NEXT_MONTH", "MOVE_DATE"]).default("NEXT_MONTH"),
    oldBedStatus: z.enum(["AVAILABLE", "MAINTENANCE"]).default("AVAILABLE"),
    reason: z.string().max(300).optional(),
    carryBalance: z.coerce.boolean().default(false),
  })),
  asyncHandler(async (req, res) => {
    const body = req.body as { bedId: string; moveDate: Date; monthlyRent?: number; rentFrom: "NEXT_MONTH" | "MOVE_DATE"; oldBedStatus: "AVAILABLE" | "MAINTENANCE"; reason?: string; carryBalance: boolean };
    const resident = await prisma.resident.findUnique({ where: { id: req.params.id }, include: { bed: { include: { room: true } }, hostel: { select: { id: true, name: true } } } });
    if (!resident) throw notFound("Resident not found");
    await assertHostelAccess(req, resident.hostelId);
    if (resident.status !== "ACTIVE" && resident.status !== "NOTICE_GIVEN") throw badRequest("Only a current resident can change rooms.");
    if (resident.occupantType === "DAILY") throw badRequest("Daily guests book a whole room — check them out and book the new room instead.");
    if (!resident.bed || !resident.admissionDate) throw badRequest(`${resident.fullName} has no bed yet — use Assign instead.`);

    const target = await prisma.bed.findUnique({ where: { id: body.bedId }, include: { room: true, hostel: { select: { id: true, name: true } }, resident: { select: { id: true } } } });
    if (!target) throw notFound("Bed not found");
    if (target.id === resident.bed.id) throw badRequest("That is already their bed.");
    const crossBranch = target.hostelId !== resident.hostelId;
    if (crossBranch) await assertHostelAccess(req, target.hostelId);

    // Move date: not before they joined, not in the future (1 day slack for
    // time zones).
    const adm = resident.admissionDate;
    const move = body.moveDate;
    if (move < new Date(adm.getFullYear(), adm.getMonth(), adm.getDate())) throw badRequest("The move date can't be before the resident joined.");
    if (move.getTime() > Date.now() + 86400000) throw badRequest("The move date can't be in the future.");

    const oldRent = dec(resident.monthlyRent);
    const newRent = body.monthlyRent ?? oldRent;
    const rentChanges = Math.abs(newRent - oldRent) > 0.5;
    // A branch transfer is dated within the current month, so every earlier
    // month (and its payments) stays whole with the old branch.
    const now = new Date();
    if (crossBranch && move.getFullYear() * 12 + move.getMonth() < now.getFullYear() * 12 + now.getMonth()) {
      throw badRequest("A branch transfer can only be dated this month. Earlier months stay with the branch the resident was in.");
    }
    // A month can only be billed by one branch, so on a branch transfer the
    // move month stays with the old branch and a new rent starts next month.
    if (rentChanges && body.rentFrom === "MOVE_DATE" && crossBranch) {
      throw badRequest(`On a branch transfer the move month stays with ${resident.hostel.name}, so the new rent starts next month. Choose 'from next month'.`);
    }
    if (rentChanges && body.rentFrom === "MOVE_DATE" && resident.billingMode !== "CALENDAR") {
      throw badRequest("Splitting the month by days works for calendar-month rent. Choose 'from next month' instead.");
    }

    // Keep room history in order: a move can't be dated before the last one.
    const priorMoves = await prisma.auditLog.findMany({
      where: { entity: "Resident", entityId: resident.id, action: "resident.move" },
      orderBy: { createdAt: "desc" },
    });
    const moveDates = priorMoves.map((m) => (m.newValue as any)?.moveDate as string | undefined).filter(Boolean) as string[];
    const lastMove = moveDates.sort().pop();
    if (lastMove && ymd(move) < lastMove) throw badRequest(`The move date can't be before their last room change (${lastMove}).`);

    // Make sure every month owed so far exists at the old rent before changing it.
    await generateDueRent(prisma, undefined, [resident.id]);

    // Branch transfer: rent still unpaid up to the move month belongs to the
    // old branch — it must be recorded first, or explicitly carried over.
    const moveYm = move.getFullYear() * 12 + move.getMonth();
    if (crossBranch && !body.carryBalance) {
      const open = await prisma.rentCharge.findMany({ where: { residentId: resident.id, status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] } } });
      const arrears = open
        .filter((c) => c.periodYear * 12 + (c.periodMonth - 1) <= moveYm)
        .reduce((sum, c) => sum + Math.max(0, dec(c.amount) - dec(c.discount) - dec(c.amountPaid)), 0);
      if (arrears > 0.5) {
        throw badRequest(`${resident.fullName} owes ₨${Math.round(arrears).toLocaleString("en-US")} at ${resident.hostel.name}. Record that payment first, or choose to carry the balance to ${target.hostel.name}.`);
      }
    }

    const my = move.getFullYear();
    const mm = move.getMonth() + 1;
    const dim = new Date(my, mm, 0).getDate();
    const moveDay = move.getDate();
    const fromBed = resident.bed;
    // An earlier room change this month that already split the month by days:
    // its new rent is what the rest of this month is billed at now.
    const ymPrefix = `${my}-${String(mm).padStart(2, "0")}`;
    const earlierSplit = priorMoves
      .map((m) => m.newValue as any)
      .find((n) => n?.rentFrom === "MOVE_DATE" && typeof n?.moveDate === "string" && n.moveDate.startsWith(ymPrefix));

    try {
      await prisma.$transaction(async (tx) => {
        // Lock the target bed so it can't be taken at the same moment.
        await tx.$queryRaw`SELECT id FROM "Bed" WHERE id = ${target.id} FOR UPDATE`;
        const fresh = await tx.bed.findUnique({ where: { id: target.id }, include: { resident: { select: { id: true } } } });
        if (!fresh || fresh.resident || fresh.status === "OCCUPIED") {
          throw conflict(`${target.room.name} · ${target.label} is already taken. Pick another bed.`);
        }
        if (fresh.status !== "AVAILABLE") {
          throw conflict(`${target.room.name} · ${target.label} is marked ${fresh.status.toLowerCase()}, not free. Pick another bed or set it to Available first.`);
        }

        await tx.resident.update({
          where: { id: resident.id },
          data: { bedId: target.id, ...(crossBranch ? { hostelId: target.hostelId } : {}), ...(rentChanges ? { monthlyRent: newRent } : {}) },
        });
        await tx.bed.update({ where: { id: fromBed.id }, data: { status: body.oldBedStatus } });
        await tx.bed.update({ where: { id: target.id }, data: { status: "OCCUPIED" } });

        if (crossBranch) {
          // Months after the move month are the new branch's; so is any
          // unpaid balance the owner chose to carry over.
          const all = await tx.rentCharge.findMany({ where: { residentId: resident.id }, select: { id: true, periodYear: true, periodMonth: true, status: true } });
          const toNew = all.filter((c) => {
            const ym = c.periodYear * 12 + (c.periodMonth - 1);
            return ym > moveYm || (body.carryBalance && ["PENDING", "PARTIALLY_PAID", "OVERDUE"].includes(c.status));
          });
          if (toNew.length) await tx.rentCharge.updateMany({ where: { id: { in: toNew.map((c) => c.id) } }, data: { hostelId: target.hostelId } });
          // The deposit is held (and later refunded) by the branch they live in.
          await tx.securityDeposit.updateMany({ where: { residentId: resident.id }, data: { hostelId: target.hostelId } });
        }

        if (!rentChanges) return;
        const charges = await tx.rentCharge.findMany({
          where: { residentId: resident.id, status: { not: "WAIVED" } },
          include: { allocations: true },
        });
        for (const c of charges) {
          const after = c.periodYear > my || (c.periodYear === my && c.periodMonth > mm);
          const isMoveMonth = c.periodYear === my && c.periodMonth === mm;
          if (after) {
            // Later months: the new rent in full.
            await resetCharge(tx, resident, c, { amount: newRent, discount: dec(c.discount), dueDate: c.dueDate, notes: c.notes, excessTo: "credit" });
          } else if (isMoveMonth && body.rentFrom === "MOVE_DATE") {
            // Move month: the days before the move stay billed exactly as they
            // are; the days from the move day on are re-priced at the new rent.
            // A pro-rated join month starts on the join day.
            const isJoin = my === adm.getFullYear() && mm === adm.getMonth() + 1;
            const startDay = isJoin && resident.proratedFirst ? adm.getDate() : 1;
            const covered = dim - startDay + 1;
            const oldDays = Math.max(0, moveDay - startDay);
            const newDays = dim - moveDay + 1;
            const tailPerDay = earlierSplit ? Number(earlierSplit.monthlyRent) / dim : dec(c.amount) / covered;
            const amount = Math.max(0, Math.round(dec(c.amount) - tailPerDay * newDays + (newRent * newDays) / dim));
            const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
            const note = earlierSplit && c.notes
              ? `${c.notes}; then ${moveDay} ${MONTHS[mm - 1]}: ${days(newDays)} × ${perDayLabel(newRent / dim)}`
              : `Room change ${moveDay} ${MONTHS[mm - 1]}: ${days(oldDays)} × ${perDayLabel(tailPerDay)} + ${days(newDays)} × ${perDayLabel(newRent / dim)}`;
            await resetCharge(tx, resident, c, { amount, discount: dec(c.discount), dueDate: c.dueDate, notes: note, excessTo: "credit" });
          }
        }
      });
    } catch (e: any) {
      // Unique bed constraint — someone was given this bed at the same moment.
      if (e?.code === "P2002") throw conflict(`${target.room.name} · ${target.label} was just taken. Pick another bed.`);
      throw e;
    }

    const entry = {
      userId: req.auth!.id,
      action: "resident.move",
      entity: "Resident",
      entityId: resident.id,
      oldValue: { hostelId: resident.hostelId, hostelName: resident.hostel.name, bedId: fromBed.id, roomName: fromBed.room.name, bedLabel: fromBed.label, monthlyRent: oldRent },
      newValue: {
        hostelId: target.hostelId, hostelName: target.hostel.name,
        bedId: target.id, roomName: target.room.name, bedLabel: target.label, monthlyRent: newRent,
        moveDate: ymd(move), rentFrom: rentChanges ? body.rentFrom : null, oldBedStatus: body.oldBedStatus, reason: body.reason || null,
        crossBranch, carryBalance: crossBranch ? body.carryBalance : undefined,
      },
    };
    await audit({ ...entry, hostelId: resident.hostelId });
    // A branch transfer also shows in the new branch's audit trail.
    if (crossBranch) await audit({ ...entry, action: "resident.transfer.in", hostelId: target.hostelId });
    res.json({ success: true, hostel: target.hostel.name, room: target.room.name, bed: target.label, monthlyRent: newRent, crossBranch });
  })
);

// DELETE /api/residents/:id — permanently remove a resident and their own
// stay/financial records (payments, rent charges, deposit, admissions,
// checkout, documents). Hostel-level records (income such as damage charges,
// complaints, tickets, visitors) are kept but unlinked. The occupied bed, if
// any, is freed. For someone who simply left, prefer Checkout — it keeps the
// full history; deletion is for mistaken entries or a full purge.
router.delete(
  "/:id",
  requirePermission("residents.manage"),
  asyncHandler(async (req, res) => {
    const resident = await prisma.resident.findUnique({ where: { id: req.params.id } });
    if (!resident) throw notFound("Resident not found");
    await assertHostelAccess(req, resident.hostelId);

    await prisma.$transaction(async (tx) => {
      // Free the bed the resident currently holds.
      if (resident.bedId) {
        await tx.bed.update({ where: { id: resident.bedId }, data: { status: "AVAILABLE" } });
      }
      // Keep hostel-level records but detach them from the resident.
      await tx.income.updateMany({ where: { residentId: resident.id }, data: { residentId: null } });
      await tx.complaint.updateMany({ where: { residentId: resident.id }, data: { residentId: null } });
      await tx.maintenanceTicket.updateMany({ where: { residentId: resident.id }, data: { residentId: null } });
      await tx.visitor.updateMany({ where: { residentId: resident.id }, data: { residentId: null } });
      // Remove the resident's own records (payments cascade their allocations,
      // the deposit cascades its ledger; documents & food attendance cascade
      // with the resident row itself).
      await tx.payment.deleteMany({ where: { residentId: resident.id } });
      await tx.rentCharge.deleteMany({ where: { residentId: resident.id } });
      await tx.securityDeposit.deleteMany({ where: { residentId: resident.id } });
      await tx.checkout.deleteMany({ where: { residentId: resident.id } });
      await tx.admission.deleteMany({ where: { residentId: resident.id } });
      await tx.resident.delete({ where: { id: resident.id } });
      // Remove the linked resident-portal login, if one was created.
      if (resident.userId) {
        await tx.user.deleteMany({ where: { id: resident.userId, role: "RESIDENT" } });
      }
    });

    await audit({ userId: req.auth!.id, action: "resident.delete", entity: "Resident", entityId: resident.id, hostelId: resident.hostelId, oldValue: { fullName: resident.fullName } });
    res.json({ success: true });
  })
);

// POST /api/residents/:id/portal-access — give a resident their own login so
// they can use the resident self-service portal.
router.post(
  "/:id/portal-access",
  requirePermission("residents.manage"),
  validateBody(z.object({ email: z.string().email().toLowerCase().optional(), password: z.string().min(8) })),
  asyncHandler(async (req, res) => {
    const resident = await prisma.resident.findUnique({ where: { id: req.params.id } });
    if (!resident) throw notFound("Resident not found");
    await assertHostelAccess(req, resident.hostelId);
    if (resident.userId) throw badRequest("This resident already has a portal login");

    const email = (req.body.email as string | undefined) || resident.email || undefined;
    if (!email) throw badRequest("An email address is required to create a login");

    const clash = await prisma.user.findUnique({ where: { email } });
    if (clash) throw badRequest("A user with this email already exists");

    const passwordHash = await bcrypt.hash(req.body.password, 10);
    const user = await prisma.user.create({
      data: { companyId: req.auth!.companyId, name: resident.fullName, email, passwordHash, role: "RESIDENT" },
    });
    await prisma.resident.update({ where: { id: resident.id }, data: { userId: user.id, email } });
    await audit({ userId: req.auth!.id, action: "resident.portal_access", entity: "Resident", entityId: resident.id, hostelId: resident.hostelId });
    res.status(201).json({ email });
  })
);

export default router;
