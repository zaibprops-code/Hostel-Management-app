import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, notFound } from "../lib/http";

const router = Router();

// GET /files/:id — serve a stored file's bytes. Public, like the old static
// /uploads folder; the cuid id is unguessable. Used for resident photos and
// documents (referenced as "/files/<id>").
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
