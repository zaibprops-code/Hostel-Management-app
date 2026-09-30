import { NextFunction, Request, Response } from "express";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { verifyAccessToken } from "../lib/jwt";
import { unauthorized } from "../lib/http";
import { UserPermissions } from "../lib/permissions";

export interface AuthUser {
  id: string;
  companyId: string;
  role: Role;
  permissions: UserPermissions;
  hostelIds: string[]; // hostels this user may access ([] for OWNER = all)
  residentId?: string | null;
  // OWNER only: every hostel in the company (loaded with the user, one query).
  companyHostelIds?: string[];
}

// Short-lived cache of each signed-in user's access, per server instance.
// Every API call needs it; with the database in another region a lookup costs
// a full round trip, so a page that fires several calls reuses one result.
// Kept brief (20 s) so a disabled account or changed permissions apply almost
// immediately, and cleared in-process when users or hostels change. A hostel
// created moments ago on another instance is picked up by a fresh re-check in
// assertHostelAccess / hostelScope before any "no access" answer.
const AUTH_TTL_MS = 20_000;
const authCache = new Map<string, { at: number; auth: AuthUser }>();

export function invalidateAuth(userId?: string): void {
  if (userId) authCache.delete(userId);
  else authCache.clear();
}
export function invalidateCompanyAuth(companyId: string): void {
  for (const [id, hit] of authCache) if (hit.auth.companyId === companyId) authCache.delete(id);
}

// Load a user's access in ONE query (relation joins), or null if disabled.
export async function loadAuthUser(userId: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      hostelAccess: { select: { hostelId: true } },
      resident: { select: { id: true } },
      company: { select: { hostels: { select: { id: true } } } },
    },
  });
  if (!user || !user.isActive) {
    authCache.delete(userId);
    return null;
  }
  const auth: AuthUser = {
    id: user.id,
    companyId: user.companyId,
    role: user.role,
    permissions: (user.permissions as UserPermissions) ?? null,
    hostelIds: user.hostelAccess.map((a) => a.hostelId),
    residentId: user.resident?.id ?? null,
    companyHostelIds: user.role === "OWNER" ? user.company.hostels.map((h) => h.id) : undefined,
  };
  if (authCache.size > 2000) authCache.clear();
  authCache.set(user.id, { at: Date.now(), auth });
  return auth;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw unauthorized("Missing bearer token");
    }
    const token = header.slice(7);
    const payload = verifyAccessToken(token);

    const hit = authCache.get(payload.sub);
    const auth = hit && Date.now() - hit.at < AUTH_TTL_MS ? hit.auth : await loadAuthUser(payload.sub);
    if (!auth) {
      throw unauthorized("Account not found or disabled");
    }

    req.auth = auth;
    next();
  } catch (err) {
    if (err instanceof Error && (err.name === "TokenExpiredError" || err.name === "JsonWebTokenError")) {
      return next(unauthorized("Invalid or expired token"));
    }
    next(err);
  }
}
