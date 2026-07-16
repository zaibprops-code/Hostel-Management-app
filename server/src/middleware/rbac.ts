import { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { forbidden, unauthorized } from "../lib/http";
import { hasPermission, Permission } from "../lib/permissions";

// Guard a route by permission. Owner overrides are honoured via hasPermission.
export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    if (!hasPermission(req.auth.role, req.auth.permissions, permission)) {
      return next(forbidden(`Missing permission: ${permission}`));
    }
    next();
  };
}

// Returns the hostel ids the authenticated user may access. OWNER can access
// every hostel in the company; everyone else is limited to their assignments.
export async function accessibleHostelIds(req: Request): Promise<string[]> {
  if (!req.auth) return [];
  if (req.auth.role === "OWNER") {
    const hostels = await prisma.hostel.findMany({
      where: { companyId: req.auth.companyId },
      select: { id: true },
    });
    return hostels.map((h) => h.id);
  }
  return req.auth.hostelIds;
}

// Ensure the user may operate on a specific hostel; throws 403 otherwise.
export async function assertHostelAccess(req: Request, hostelId: string): Promise<void> {
  const ids = await accessibleHostelIds(req);
  if (!ids.includes(hostelId)) {
    throw forbidden("You do not have access to this hostel");
  }
}
