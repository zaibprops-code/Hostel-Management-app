import { Router } from "express";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, notFound } from "../lib/http";
import { validateBody } from "../middleware/validate";
import { requirePermission } from "../middleware/rbac";
import { PERMISSIONS, effectivePermissions } from "../lib/permissions";
import { audit } from "../lib/audit";

const router = Router();

// GET /api/users — list users in the company
router.get("/", requirePermission("users.manage"), asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({
    where: { companyId: req.auth!.companyId },
    orderBy: { createdAt: "desc" },
    include: { hostelAccess: { include: { hostel: { select: { id: true, name: true } } } } },
  });
  res.json(users.map((u) => ({
    id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
    hostels: u.hostelAccess.map((a) => a.hostel),
    permissions: effectivePermissions(u.role, u.permissions as Record<string, boolean> | null),
  })));
}));

// GET /api/users/permissions — the master permission list (for the UI matrix)
router.get("/permissions", requirePermission("users.manage"), asyncHandler(async (_req, res) => {
  res.json({ permissions: PERMISSIONS });
}));

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().toLowerCase(),
  phone: z.string().optional(),
  password: z.string().min(8),
  role: z.enum(["OWNER", "MANAGER", "ACCOUNTANT", "KITCHEN", "STAFF", "RESIDENT"]),
  hostelIds: z.array(z.string()).default([]),
  permissions: z.record(z.boolean()).optional(),
});

// POST /api/users
router.post("/", requirePermission("users.manage"), validateBody(createSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof createSchema>;
  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) throw badRequest("A user with this email already exists");
  const passwordHash = await bcrypt.hash(body.password, 10);
  const user = await prisma.user.create({
    data: {
      companyId: req.auth!.companyId,
      name: body.name, email: body.email, phone: body.phone, passwordHash, role: body.role,
      permissions: body.permissions ?? undefined,
      hostelAccess: { create: body.hostelIds.map((hostelId) => ({ hostelId })) },
    },
  });
  await audit({ userId: req.auth!.id, action: "user.create", entity: "User", entityId: user.id, newValue: { email: user.email, role: user.role } });
  res.status(201).json({ id: user.id });
}));

const updateSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  role: z.enum(["OWNER", "MANAGER", "ACCOUNTANT", "KITCHEN", "STAFF", "RESIDENT"]).optional(),
  isActive: z.boolean().optional(),
  hostelIds: z.array(z.string()).optional(),
  permissions: z.record(z.boolean()).nullable().optional(),
});

// PUT /api/users/:id — update role, permissions & hostel access
router.put("/:id", requirePermission("users.manage"), validateBody(updateSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof updateSchema>;
  const user = await prisma.user.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!user) throw notFound("User not found");

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        name: body.name ?? undefined,
        phone: body.phone ?? undefined,
        role: body.role ?? undefined,
        isActive: body.isActive ?? undefined,
        permissions:
          body.permissions === undefined
            ? undefined
            : body.permissions === null
            ? Prisma.DbNull
            : body.permissions,
      },
    });
    if (body.hostelIds) {
      await tx.userHostelAccess.deleteMany({ where: { userId: user.id } });
      await tx.userHostelAccess.createMany({ data: body.hostelIds.map((hostelId) => ({ userId: user.id, hostelId })) });
    }
  });
  await audit({ userId: req.auth!.id, action: "user.update", entity: "User", entityId: user.id, newValue: body });
  res.json({ success: true });
}));

// POST /api/users/:id/reset-password — admin sets a new password
router.post("/:id/reset-password", requirePermission("users.manage"), validateBody(z.object({ newPassword: z.string().min(8) })), asyncHandler(async (req, res) => {
  const user = await prisma.user.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!user) throw notFound("User not found");
  const passwordHash = await bcrypt.hash(req.body.newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await audit({ userId: req.auth!.id, action: "user.reset_password", entity: "User", entityId: user.id });
  res.json({ success: true });
}));

export default router;
