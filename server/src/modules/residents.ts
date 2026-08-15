import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, notFound } from "../lib/http";
import { validateBody, parsePagination } from "../middleware/validate";
import { requirePermission, assertHostelAccess } from "../middleware/rbac";
import { hostelScope, dec, fileMimes } from "../lib/query";
import { catchUpRent, rentCycle } from "../lib/rent";
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
            select: { periodYear: true, periodMonth: true, amount: true, discount: true, amountPaid: true },
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
          : rentCycle(r.rentCharges.map((c) => ({ periodYear: c.periodYear, periodMonth: c.periodMonth, amount: dec(c.amount), discount: dec(c.discount), amountPaid: dec(c.amountPaid) })), r.hostel.rentDueDay);
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
    const cycle = resident.occupantType === "DAILY"
      ? null
      : rentCycle(resident.rentCharges.map((c) => ({ periodYear: c.periodYear, periodMonth: c.periodMonth, amount: dec(c.amount), discount: dec(c.discount), amountPaid: dec(c.amountPaid) })), resident.hostel.rentDueDay);

    res.json({
      ...resident,
      monthlyRent: dec(resident.monthlyRent),
      dailyRate: dec(resident.dailyRate),
      outstanding: Math.max(0, outstanding),
      rentCycle: cycle,
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
