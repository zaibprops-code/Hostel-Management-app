import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, notFound } from "../lib/http";
import { requirePermission, assertHostelAccess } from "../middleware/rbac";
import { env } from "../lib/env";
import { audit } from "../lib/audit";

const router = Router();

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

// Files are kept in memory just long enough to write their bytes to the
// database (so they survive server restarts without a separate storage service).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) return cb(new Error("Unsupported file type"));
    cb(null, true);
  },
});

// Persist an uploaded file's bytes and return its public URL ("/files/<id>").
async function storeFile(file: Express.Multer.File): Promise<string> {
  const blob = await prisma.storedFile.create({
    data: { data: file.buffer, mimeType: file.mimetype, fileName: file.originalname },
  });
  return `/files/${blob.id}`;
}

// Delete the backing StoredFile for a "/files/<id>" url, if it is one.
async function removeStoredFile(url: string | null | undefined): Promise<void> {
  const m = url?.match(/^\/files\/([^/]+)$/);
  if (m) await prisma.storedFile.deleteMany({ where: { id: m[1] } });
}

// POST /api/uploads/resident/:id/document — secure document upload
router.post(
  "/resident/:id/document",
  requirePermission("residents.manage"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("No file uploaded");
    const parsed = z.object({ type: z.enum(["CNIC_FRONT", "CNIC_BACK", "PASSPORT", "STUDENT_CARD", "UNIVERSITY_CARD", "CONTRACT", "OTHER"]) }).safeParse(req.body);
    if (!parsed.success) throw badRequest("Invalid document type");
    const resident = await prisma.resident.findUnique({ where: { id: req.params.id } });
    if (!resident) throw notFound("Resident not found");
    await assertHostelAccess(req, resident.hostelId);

    const fileUrl = await storeFile(req.file);
    const doc = await prisma.residentDocument.create({
      data: {
        residentId: resident.id,
        type: parsed.data.type,
        fileName: req.file.originalname,
        fileUrl,
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
    if (!req.file.mimetype.startsWith("image/")) throw badRequest("Profile picture must be an image");
    const resident = await prisma.resident.findUnique({ where: { id: req.params.id } });
    if (!resident) throw notFound("Resident not found");
    await assertHostelAccess(req, resident.hostelId);

    await removeStoredFile(resident.photoUrl); // drop the previous picture
    const photoUrl = await storeFile(req.file);
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
    await removeStoredFile(doc.fileUrl);
    await prisma.residentDocument.delete({ where: { id: doc.id } });
    await audit({ userId: req.auth!.id, action: "document.delete", entity: "ResidentDocument", entityId: doc.id, hostelId: doc.resident.hostelId });
    res.status(204).end();
  })
);

// DELETE /api/uploads/resident/:id/photo — remove the profile picture
router.delete(
  "/resident/:id/photo",
  requirePermission("residents.manage"),
  asyncHandler(async (req, res) => {
    const resident = await prisma.resident.findUnique({ where: { id: req.params.id } });
    if (!resident) throw notFound("Resident not found");
    await assertHostelAccess(req, resident.hostelId);
    await removeStoredFile(resident.photoUrl);
    await prisma.resident.update({ where: { id: resident.id }, data: { photoUrl: null } });
    await audit({ userId: req.auth!.id, action: "resident.photo_delete", entity: "Resident", entityId: resident.id, hostelId: resident.hostelId });
    res.status(204).end();
  })
);

// DELETE /api/uploads/resident/:id/files — archive: remove the photo AND every
// document to free storage (after the owner has downloaded what they need).
router.delete(
  "/resident/:id/files",
  requirePermission("residents.manage"),
  asyncHandler(async (req, res) => {
    const resident = await prisma.resident.findUnique({ where: { id: req.params.id }, include: { documents: true } });
    if (!resident) throw notFound("Resident not found");
    await assertHostelAccess(req, resident.hostelId);

    await removeStoredFile(resident.photoUrl);
    for (const doc of resident.documents) await removeStoredFile(doc.fileUrl);
    await prisma.residentDocument.deleteMany({ where: { residentId: resident.id } });
    await prisma.resident.update({ where: { id: resident.id }, data: { photoUrl: null } });

    await audit({ userId: req.auth!.id, action: "resident.files_archive", entity: "Resident", entityId: resident.id, hostelId: resident.hostelId, newValue: { removed: resident.documents.length + (resident.photoUrl ? 1 : 0) } });
    res.json({ removed: resident.documents.length + (resident.photoUrl ? 1 : 0) });
  })
);

export default router;
