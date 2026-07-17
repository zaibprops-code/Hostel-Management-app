import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { conflict } from "./http";
import { audit } from "./audit";

export interface NewBusinessInput {
  companyName: string;
  name: string;
  email: string;
  password: string;
}

// Creates a brand-new, self-contained business: its own Company plus the OWNER
// user who runs it. Every record the owner later creates is tied to this
// company, so businesses are fully isolated from one another (multi-tenant).
//
// Email is globally unique (it's the login identity), so registering with an
// address that's already taken is rejected. Used by both first-run setup and
// public self-service sign-up.
export async function createBusinessAccount(input: NewBusinessInput) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw conflict("An account with this email already exists. Try signing in instead.");

  const passwordHash = await bcrypt.hash(input.password, 10);
  const owner = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({ data: { name: input.companyName, currency: "PKR" } });
    return tx.user.create({
      data: { companyId: company.id, name: input.name, email, passwordHash, role: "OWNER" },
    });
  });

  await audit({ userId: owner.id, action: "business.register", entity: "User", entityId: owner.id });
  return owner;
}
