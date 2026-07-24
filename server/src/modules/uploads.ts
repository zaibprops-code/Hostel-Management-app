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

const uploadRoot = path.join(process.cwd(), env.uploadDir);
fs.mkdirSync(uploadRoot, { recursive: true });

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

// POST /api/uploads/resident/:id/photo — profile / passport-size picture
router.post(
  "/resident/:id/photo",
  requirePermission("residents.manage"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("No file uploaded");
    if (!req.file.mimetype.startsWith("image/")) {
      fs.unlink(path.join(uploadRoot, req.file.filename), () => {});
      throw badRequest("Profile picture must be an image");
    }
    const resident = await prisma.resident.findUnique({ where: { id: req.params.id } });
    if (!resident) {
      fs.unlink(path.join(uploadRoot, req.file.filename), () => {});
      throw notFound("Resident not found");
    }
    await assertHostelAccess(req, resident.hostelId);

    // Remove the previous photo file if it lived in our uploads folder.
    if (resident.photoUrl?.startsWith("/uploads/")) {
      fs.unlink(path.join(uploadRoot, path.basename(resident.photoUrl)), () => {});
    }

    const photoUrl = `/uploads/${req.file.filename}`;
    await prisma.resident.update({ where: { id: resident.id }, data: { photoUrl } });
    await audit({ userId: req.auth!.id, action: "resident.photo", entity: "Resident", entityId: resident.id, hostelId: resident.hostelId });
    res.status(201).json({ photoUrl });
  })
);

// DELETE /api/uploads/resident/document/:docId — remove a document
router.delete(
  "/resident/document/:docId",
  requirePermission("residents.manage"),
  asyncHandler(async (req, res) => {
    const doc = await prisma.residentDocument.findUnique({ where: { id: req.params.docId }, include: { resident: true } });
    if (!doc) throw notFound("Document not found");
    await assertHostelAccess(req, doc.resident.hostelId);
    if (doc.fileUrl.startsWith("/uploads/")) {
      fs.unlink(path.join(uploadRoot, path.basename(doc.fileUrl)), () => {});
    }
    await prisma.residentDocument.delete({ where: { id: doc.id } });
    await audit({ userId: req.auth!.id, action: "document.delete", entity: "ResidentDocument", entityId: doc.id, hostelId: doc.resident.hostelId });
    res.status(204).end();
  })
);

export default router;
