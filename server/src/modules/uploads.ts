import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, notFound } from "../lib/http";
import { requirePermission, assertHostelAccess } from "../middleware/rbac";
import { env } from "../lib/env";
import { audit } from "../lib/audit";

const router = Router();

// On serverless/read-only hosts (e.g. Vercel) the project directory is
// read-only and only /tmp is writable (and ephemeral), so fall back to it.
// Wrapped in try/catch so a read-only filesystem can never crash startup.
const uploadRoot = process.env.VERCEL
  ? path.join("/tmp", "hms-uploads")
  : path.join(process.cwd(), env.uploadDir);
try {
  fs.mkdirSync(uploadRoot, { recursive: true });
} catch {
  // Read-only filesystem (serverless) — uploads are best-effort only.
}

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 10);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: env.maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) return cb(new Error("Unsupported file type"));
    cb(null, true);
  },
});

// POST /api/uploads/resident/:id/document — secure document upload
router.post(
  "/resident/:id/document",
  requirePermission("residents.manage"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("No file uploaded");
    const parsed = z.object({ type: z.enum(["CNIC_FRONT", "CNIC_BACK", "PASSPORT", "STUDENT_CARD", "UNIVERSITY_CARD", "CONTRACT", "OTHER"]) }).safeParse(req.body);
    if (!parsed.success) {
      fs.unlink(path.join(uploadRoot, req.file.filename), () => {});
      throw badRequest("Invalid document type");
    }
    const resident = await prisma.resident.findUnique({ where: { id: req.params.id } });
    if (!resident) throw notFound("Resident not found");
    await assertHostelAccess(req, resident.hostelId);

    const doc = await prisma.residentDocument.create({
      data: {
        residentId: resident.id,
        type: parsed.data.type,
        fileName: req.file.originalname,
        fileUrl: `/uploads/${req.file.filename}`,
        mimeType: req.file.mimetype,
      },
    });
    await audit({ userId: req.auth!.id, action: "document.upload", entity: "ResidentDocument", entityId: doc.id, hostelId: resident.hostelId });
    res.status(201).json(doc);
  })
);

export default router;
