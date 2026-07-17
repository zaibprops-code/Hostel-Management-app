import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, unauthorized } from "../lib/http";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt";
import { effectivePermissions } from "../lib/permissions";
import { validateBody } from "../middleware/validate";
import { authenticate } from "../middleware/auth";
import { audit } from "../lib/audit";
import { env } from "../lib/env";
import { mailConfigured, sendPasswordResetEmail } from "../lib/mailer";

const router = Router();

const loginSchema = z.object({
  email: z.string().trim().toLowerCase(),
  password: z.string().min(1),
});

async function buildSession(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      company: { select: { id: true, name: true, currency: true } },
      hostelAccess: { select: { hostelId: true } },
      resident: { select: { id: true, hostelId: true } },
    },
  });
  if (!user) throw unauthorized("User not found");

  const permissions = effectivePermissions(user.role, user.permissions as Record<string, boolean> | null);
  const payload = { sub: user.id, companyId: user.companyId, role: user.role };

  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatarUrl: user.avatarUrl,
      company: user.company,
      permissions,
      hostelIds: user.hostelAccess.map((a) => a.hostelId),
      residentId: user.resident?.id ?? null,
      residentHostelId: user.resident?.hostelId ?? null,
    },
  };
}

// POST /api/auth/login
router.post(
  "/login",
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) throw unauthorized("Invalid email or password");

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw unauthorized("Invalid email or password");

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit({ userId: user.id, action: "auth.login", entity: "User", entityId: user.id, ipAddress: req.ip });

    res.json(await buildSession(user.id));
  })
);

// POST /api/auth/refresh
router.post(
  "/refresh",
  validateBody(z.object({ refreshToken: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    try {
      const payload = verifyRefreshToken(req.body.refreshToken);
      res.json(await buildSession(payload.sub));
    } catch {
      throw unauthorized("Invalid refresh token");
    }
  })
);

// GET /api/auth/me
router.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const session = await buildSession(req.auth!.id);
    res.json({ user: session.user });
  })
);

// POST /api/auth/change-password
router.post(
  "/change-password",
  authenticate,
  validateBody(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) })),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.id } });
    if (!user) throw unauthorized();
    const ok = await bcrypt.compare(req.body.currentPassword, user.passwordHash);
    if (!ok) throw badRequest("Current password is incorrect");
    const passwordHash = await bcrypt.hash(req.body.newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    await audit({ userId: user.id, action: "auth.change_password", entity: "User", entityId: user.id });
    res.json({ success: true });
  })
);

// POST /api/auth/forgot-password — issues a reset token and emails a reset link.
// The response is intentionally generic so it never reveals whether an account
// exists. If SMTP is not configured, the token is still created; in development
// it is returned directly so the flow can be tested without an email provider.
router.post(
  "/forgot-password",
  validateBody(z.object({ email: z.string().trim().toLowerCase() })),
  asyncHandler(async (req, res) => {
    const generic = {
      success: true as const,
      message: "If an account exists for that email, we've sent a password reset link.",
    };
    const user = await prisma.user.findUnique({ where: { email: req.body.email } });
    if (!user || !user.isActive) return res.json(generic);

    const token = crypto.randomBytes(32).toString("hex");
    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000) },
    });

    const resetUrl = `${env.webAppUrl.replace(/\/$/, "")}/reset-password?token=${token}`;
    try {
      await sendPasswordResetEmail(user.email, resetUrl);
    } catch (err) {
      // A send failure must not reveal account existence or 500 the request; the
      // token stays valid so the user can retry. Log for the operator.
      console.error("[forgot-password] failed to send reset email:", err);
    }

    // In development (no email set up), hand back the token so the flow is testable.
    const devResetToken =
      env.nodeEnv === "development" && !mailConfigured() ? token : undefined;
    res.json({ ...generic, devResetToken });
  })
);

// POST /api/auth/reset-password
router.post(
  "/reset-password",
  validateBody(z.object({ token: z.string().min(1), newPassword: z.string().min(8) })),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findFirst({
      where: { resetToken: req.body.token, resetTokenExpiry: { gt: new Date() } },
    });
    if (!user) throw badRequest("Invalid or expired reset token");
    const passwordHash = await bcrypt.hash(req.body.newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetToken: null, resetTokenExpiry: null },
    });
    await audit({ userId: user.id, action: "auth.reset_password", entity: "User", entityId: user.id });
    res.json({ success: true });
  })
);

// POST /api/auth/logout — stateless JWT; client discards tokens. Logged for audit.
router.post(
  "/logout",
  authenticate,
  asyncHandler(async (req, res) => {
    await audit({ userId: req.auth!.id, action: "auth.logout", entity: "User", entityId: req.auth!.id });
    res.json({ success: true });
  })
);

export default router;
