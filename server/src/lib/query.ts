import { Request } from "express";
import { accessibleHostelIds } from "../middleware/rbac";
import { badRequest } from "./http";

// Builds a Prisma `where.hostelId` filter constrained to the hostels the user
// can access. An optional `hostelId` query param narrows to a single hostel
// (validated against access).
export async function hostelScope(req: Request): Promise<{ hostelId: { in: string[] } }> {
  const ids = await accessibleHostelIds(req);
  const requested = req.query.hostelId as string | undefined;
  if (requested) {
    if (!ids.includes(requested)) throw badRequest("Invalid or inaccessible hostel");
    return { hostelId: { in: [requested] } };
  }
  return { hostelId: { in: ids } };
}

export function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Prisma Decimal → number for JSON responses.
export function dec(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}
