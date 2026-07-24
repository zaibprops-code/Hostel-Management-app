import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/http";
import { requirePermission } from "../middleware/rbac";
import { env } from "../lib/env";

const router = Router();

// GET /api/storage — database + uploaded-file usage, so the owner can see how
// much room is left for photos & documents.
router.get(
  "/",
  requirePermission("dashboard.view"),
  asyncHandler(async (_req, res) => {
    const [{ size }] = await prisma.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`;
    const [{ count, bytes }] = await prisma.$queryRaw<{ count: bigint; bytes: bigint | null }[]>`
      SELECT COUNT(*)::bigint AS count, COALESCE(SUM(octet_length(data)), 0)::bigint AS bytes FROM "StoredFile"`;

    const limitBytes = env.storageLimitMb * 1024 * 1024;
    const dbBytes = Number(size);
    const fileCount = Number(count);
    const fileBytes = Number(bytes ?? 0);
    const freeBytes = Math.max(0, limitBytes - dbBytes);
    const avgFileBytes = fileCount > 0 ? Math.round(fileBytes / fileCount) : 0;

    res.json({
      limitBytes,
      dbBytes, // whole database (files + all other data)
      fileBytes, // just the uploaded files
      fileCount,
      freeBytes,
      avgFileBytes,
      // Rough number of extra files that still fit at the current average size.
      // Before anything is uploaded, assume ~600 KB per file (compressed photo /
      // high-quality document) so the estimate is realistic.
      estimatedFilesRemaining: Math.floor(freeBytes / (avgFileBytes || 600 * 1024)),
    });
  })
);

export default router;
