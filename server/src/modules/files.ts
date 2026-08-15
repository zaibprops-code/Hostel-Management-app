import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, notFound, unauthorized, forbidden } from "../lib/http";
import { presignGet } from "../lib/files";
import { resolveViewer, canViewFile } from "../lib/fileauth";

const router = Router();

// GET /files/r2/<key> — securely serve a file stored in the private R2 bucket.
//
// This route is mounted OUTSIDE the /api authenticate middleware because <img>
// tags and the download/PDF fetches cannot send an Authorization header, so the
// access token is accepted from the `t` query param (a normal Bearer header also
// works). Access is then checked per file against the same RBAC as everywhere
// else: same company AND access to the file's hostel (or, for a portal resident,
// their own file). On success we 302-redirect to a short-lived presigned R2 URL
// so the (potentially large) bytes stream straight from R2, never through this
// serverless function — which also keeps us clear of Vercel's response limit.
//
// NOTE: registered before "/:id" so the "r2/..." path is not swallowed by it.
router.get(
  "/r2/*",
  asyncHandler(async (req, res) => {
    const key = (req.params as unknown as { 0: string })[0];
    if (!key) throw notFound("File not found");

    const headerToken = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined;
    const token = (req.query.t as string | undefined) || headerToken;

    const viewer = await resolveViewer(token);
    if (!viewer) throw unauthorized("Sign in to view this file");

    const file = await prisma.fileObject.findUnique({ where: { key } });
    if (!file) throw notFound("File not found");
    if (!canViewFile(viewer, file)) throw forbidden("You do not have access to this file");

    const url = await presignGet(key, { download: req.query.download === "1", fileName: file.fileName });
    // Presigned URLs are per-user and short-lived; keep them out of shared caches.
    res.setHeader("Cache-Control", "private, no-store");
    res.redirect(302, url);
  })
);

// GET /files/:id — serve a database-stored file's bytes. Public, like the old
// static /uploads folder; the cuid id is unguessable. This is the local-dev
// fallback used when R2 is not configured.
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const file = await prisma.storedFile.findUnique({ where: { id: req.params.id } });
    if (!file) throw notFound("File not found");
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Cache-Control", "private, max-age=86400");
    if (file.fileName) res.setHeader("Content-Disposition", `inline; filename="${file.fileName.replace(/["\r\n]/g, "")}"`);
    res.send(Buffer.from(file.data));
  })
);

export default router;
