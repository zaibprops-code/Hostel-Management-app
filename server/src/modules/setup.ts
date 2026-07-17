import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, conflict } from "../lib/http";
import { validateBody } from "../middleware/validate";
import { createBusinessAccount } from "../lib/accounts";
import { env } from "../lib/env";

const router = Router();

// GET /api/setup/status — tells the app whether first-time setup is needed
// (the whole server has no accounts yet) and whether new owners may self-register.
router.get(
  "/status",
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.count();
    res.json({ needsSetup: users === 0, allowSignup: env.allowSignup });
  })
);

const setupSchema = z.object({
  companyName: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8),
});

// POST /api/setup — first-run: create the very first business + owner account.
// Only works when no users exist yet. Self-service sign-up for additional
// businesses goes through POST /api/auth/register instead.
router.post(
  "/",
  validateBody(setupSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.user.count();
    if (existing > 0) throw conflict("Setup has already been completed");

    const { companyName, name, email, password } = req.body as z.infer<typeof setupSchema>;
    await createBusinessAccount({ companyName, name, email, password });
    res.status(201).json({ success: true });
  })
);

export default router;
