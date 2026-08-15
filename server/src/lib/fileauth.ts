import { Role } from "@prisma/client";
import { prisma } from "./prisma";
import { verifyAccessToken } from "./jwt";

// Per-file authorization. A file is readable only by someone in the SAME company
// who is allowed to reach the file's hostel — reusing the exact RBAC rules the
// rest of the app enforces (OWNER sees every hostel in the company; other staff
// see only their assigned hostels; a portal RESIDENT sees only their own files).

export interface FileViewer {
  userId: string;
  companyId: string;
  role: Role;
  hostelIds: string[]; // hostels this viewer may access (all company hostels for OWNER)
  residentId: string | null;
}

export interface FileAuthzSubject {
  companyId: string;
  hostelId: string | null;
  residentId: string | null;
}

// Resolve the viewer from a JWT access token, loading their live hostel access
// so a revoked/disabled account or removed hostel assignment takes effect. A
// tiny in-memory cache absorbs the burst of image requests a single page load
// makes, without letting a stale grant linger for more than a few seconds.
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { viewer: FileViewer | null; at: number }>();

export async function resolveViewer(token: string | undefined | null): Promise<FileViewer | null> {
  if (!token) return null;

  const hit = cache.get(token);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.viewer;

  let viewer: FileViewer | null = null;
  try {
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { hostelAccess: { select: { hostelId: true } }, resident: { select: { id: true } } },
    });
    if (user && user.isActive) {
      let hostelIds: string[];
      if (user.role === "OWNER") {
        const hostels = await prisma.hostel.findMany({ where: { companyId: user.companyId }, select: { id: true } });
        hostelIds = hostels.map((h) => h.id);
      } else {
        hostelIds = user.hostelAccess.map((a) => a.hostelId);
      }
      viewer = {
        userId: user.id,
        companyId: user.companyId,
        role: user.role,
        hostelIds,
        residentId: user.resident?.id ?? null,
      };
    }
  } catch {
    viewer = null;
  }

  cache.set(token, { viewer, at: Date.now() });
  return viewer;
}

export function canViewFile(viewer: FileViewer, file: FileAuthzSubject): boolean {
  // Never cross a company boundary.
  if (file.companyId !== viewer.companyId) return false;

  // A portal resident may only ever see files tied to their own resident record.
  if (viewer.role === "RESIDENT") {
    return !!file.residentId && file.residentId === viewer.residentId;
  }

  // Staff/owner: company-level assets (no hostel) are fine within the company;
  // hostel-scoped files require access to that specific hostel.
  if (!file.hostelId) return true;
  return viewer.hostelIds.includes(file.hostelId);
}
