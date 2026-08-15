import { Request } from "express";
import { accessibleHostelIds } from "../middleware/rbac";
import { badRequest } from "./http";
import { prisma } from "./prisma";

// Given a list of file references, returns a map of ref → mime type so the
// client knows how to render each stored file (image vs PDF). Handles both R2
// references ("/files/r2/<key>", from FileObject) and the database fallback
// ("/files/<id>", from StoredFile).
export async function fileMimes(urls: (string | null | undefined)[]): Promise<Record<string, string>> {
  const refs = urls.filter((u): u is string => !!u);
  const r2Keys = refs.filter((u) => u.startsWith("/files/r2/")).map((u) => u.slice("/files/r2/".length));
  const dbIds = refs
    .filter((u) => u.startsWith("/files/") && !u.startsWith("/files/r2/"))
    .map((u) => u.slice("/files/".length));

  const map: Record<string, string> = {};
  if (r2Keys.length > 0) {
    const objs = await prisma.fileObject.findMany({ where: { key: { in: r2Keys } }, select: { key: true, mimeType: true } });
    for (const o of objs) map[`/files/r2/${o.key}`] = o.mimeType;
  }
  if (dbIds.length > 0) {
    const files = await prisma.storedFile.findMany({ where: { id: { in: dbIds } }, select: { id: true, mimeType: true } });
    for (const f of files) map[`/files/${f.id}`] = f.mimeType;
  }
  return map;
}

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
