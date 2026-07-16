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

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        hostelAccess: { select: { hostelId: true } },
        resident: { select: { id: true } },
      },
    });

    if (!user || !user.isActive) {
      throw unauthorized("Account not found or disabled");
    }

    req.auth = {
      id: user.id,
      companyId: user.companyId,
      role: user.role,
      permissions: (user.permissions as UserPermissions) ?? null,
      hostelIds: user.hostelAccess.map((a) => a.hostelId),
      residentId: user.resident?.id ?? null,
    };
    next();
  } catch (err) {
    if (err instanceof Error && (err.name === "TokenExpiredError" || err.name === "JsonWebTokenError")) {
      return next(unauthorized("Invalid or expired token"));
    }
    next(err);
  }
}
