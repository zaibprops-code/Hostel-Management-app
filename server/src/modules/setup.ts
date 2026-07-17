import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, conflict } from "../lib/http";
import { validateBody } from "../middleware/validate";
import { audit } from "../lib/audit";

const router = Router();

// GET /api/setup/status — tells the app whether first-time setup is needed.
router.get(
  "/status",
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.count();
    res.json({ needsSetup: users === 0 });
  })
);

const setupSchema = z.object({
  companyName: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8),
});

// POST /api/setup — first-run: create the business + the owner account.
// Only works when no users exist yet, so it can never be abused later.
router.post(
  "/",
  validateBody(setupSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.user.count();
    if (existing > 0) throw conflict("Setup has already been completed");

    const { companyName, name, email, password } = req.body as z.infer<typeof setupSchema>;
    const passwordHash = await bcrypt.hash(password, 10);

    const owner = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({ data: { name: companyName, currency: "PKR" } });
      return tx.user.create({
        data: { companyId: company.id, name, email, passwordHash, role: "OWNER" },
      });
    });

    await audit({ userId: owner.id, action: "setup.complete", entity: "User", entityId: owner.id });
    res.status(201).json({ success: true });
  })
);

export default router;
