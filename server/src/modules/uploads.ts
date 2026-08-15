import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, forbidden, notFound } from "../lib/http";
import { requirePermission, assertHostelAccess } from "../middleware/rbac";
import { hasPermission } from "../lib/permissions";
import { audit } from "../lib/audit";
import {
  upload, resolveType, storeFile, removeStoredFile,
  r2Configured, makeKey, presignPut, headObject, refForKey, isAllowedMime,
} from "../lib/files";

const router = Router();

const DOC_TYPES = ["CNIC_FRONT", "CNIC_BACK", "PASSPORT", "STUDENT_CARD", "UNIVERSITY_CARD", "CONTRACT", "OTHER"] as const;
type DocType = (typeof DOC_TYPES)[number];

// ---------------------------------------------------------------------------
// Direct-to-R2 uploads (presign → browser PUTs to R2 → attach)
//
// The bytes go straight from the browser to the private R2 bucket, so large
// files never hit the API (and never touch Vercel's request-size limit). The
// server only (1) authorizes the upload and hands out a short-lived presigned
// PUT URL, then (2) confirms the object landed and wires the reference onto the
// resource. Both steps enforce the same RBAC + hostel-access checks as the rest
// of the app, and stamp the owning company/hostel/resident onto the FileObject
// so later reads can be authorized per file.
// ---------------------------------------------------------------------------

// Resolve the target resource for an upload and authorize the current user
// against it. Returns the ownership context stamped onto the FileObject.
async function resolveUploadContext(
  req: import("express").Request,
  scope: "resident.photo" | "resident.document" | "payment.proof",
  ids: { residentId?: string; paymentId?: string }
): Promise<{ companyId: string; hostelId: string; residentId: string | null; paymentId: string | null }> {
  if (scope === "payment.proof") {
    if (!ids.paymentId) throw badRequest("paymentId is required");
    const payment = await prisma.payment.findUnique({
      where: { id: ids.paymentId },
      include: { hostel: { select: { companyId: true } } },
    });
    if (!payment) throw notFound("Payment not found");
    if (!hasPermission(req.auth!.role, req.auth!.permissions, "payments.manage")) throw forbidden("Missing permission: payments.manage");
    await assertHostelAccess(req, payment.hostelId);
    return { companyId: payment.hostel.companyId, hostelId: payment.hostelId, residentId: payment.residentId, paymentId: payment.id };
  }
  // resident.photo | resident.document
  if (!ids.residentId) throw badRequest("residentId is required");
  const resident = await prisma.resident.findUnique({
    where: { id: ids.residentId },
    include: { hostel: { select: { companyId: true } } },
  });
  if (!resident) throw notFound("Resident not found");
  if (!hasPermission(req.auth!.role, req.auth!.permissions, "residents.manage")) throw forbidden("Missing permission: residents.manage");
  await assertHostelAccess(req, resident.hostelId);
  return { companyId: resident.hostel.companyId, hostelId: resident.hostelId, residentId: resident.id, paymentId: null };
}

// POST /api/uploads/presign — authorize an upload and return a presigned R2 PUT
// URL. Responds 501 { r2: false } when R2 is not configured, so the client can
// fall back to the legacy through-API upload (used in local dev).
router.post(
  "/presign",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        scope: z.enum(["resident.photo", "resident.document", "payment.proof"]),
        residentId: z.string().optional(),
        paymentId: z.string().optional(),
        fileName: z.string().min(1),
        mimeType: z.string().min(1),
      })
      .parse(req.body);

    if (!isAllowedMime(body.mimeType)) throw badRequest("Unsupported file type — please choose an image or a PDF");
    if (body.scope === "resident.photo" && !body.mimeType.startsWith("image/")) throw badRequest("Profile picture must be an image");

    const ctx = await resolveUploadContext(req, body.scope, { residentId: body.residentId, paymentId: body.paymentId });

    if (!r2Configured()) return res.status(501).json({ r2: false });

    const key = makeKey(body.fileName, body.mimeType);
    const fo = await prisma.fileObject.create({
      data: {
        key,
        companyId: ctx.companyId,
        hostelId: ctx.hostelId,
        residentId: ctx.residentId,
        paymentId: ctx.paymentId,
        kind: body.scope,
        mimeType: body.mimeType,
        fileName: body.fileName,
        status: "PENDING",
        uploadedById: req.auth!.id,
      },
    });
    const uploadUrl = await presignPut(key, body.mimeType);
    res.json({ r2: true, fileId: fo.id, key, ref: refForKey(key), uploadUrl });
  })
);

// POST /api/uploads/attach — confirm a direct upload landed in R2 and wire its
// reference onto the resource (replacing any previous file).
router.post(
  "/attach",
  asyncHandler(async (req, res) => {
    const body = z.object({ fileId: z.string().min(1), documentType: z.enum(DOC_TYPES).optional() }).parse(req.body);

    const fo = await prisma.fileObject.findUnique({ where: { id: body.fileId } });
    if (!fo) throw notFound("Upload not found");
    if (!fo.hostelId) throw badRequest("Upload is missing its hostel");

    // Re-authorize: same permission + hostel access as at presign time.
    const perm = fo.kind === "payment.proof" ? "payments.manage" : "residents.manage";
    if (!hasPermission(req.auth!.role, req.auth!.permissions, perm)) throw forbidden(`Missing permission: ${perm}`);
    await assertHostelAccess(req, fo.hostelId);

    // Confirm the client actually uploaded the object.
    const head = await headObject(fo.key);
    if (!head) throw badRequest("Upload was not received — please try again");

    await prisma.fileObject.update({ where: { id: fo.id }, data: { status: "ACTIVE", size: head.size } });
    const ref = refForKey(fo.key);

    if (fo.kind === "resident.photo") {
      const resident = await prisma.resident.findUnique({ where: { id: fo.residentId! } });
      if (!resident) throw notFound("Resident not found");
      await removeStoredFile(resident.photoUrl);
      await prisma.resident.update({ where: { id: resident.id }, data: { photoUrl: ref } });
      await audit({ userId: req.auth!.id, action: "resident.photo", entity: "Resident", entityId: resident.id, hostelId: resident.hostelId });
      return res.status(201).json({ photoUrl: ref });
    }

    if (fo.kind === "resident.document") {
      if (!body.documentType) throw badRequest("documentType is required");
      const doc = await prisma.residentDocument.create({
        data: { residentId: fo.residentId!, type: body.documentType, fileName: fo.fileName || "document", fileUrl: ref, mimeType: fo.mimeType },
      });
      await audit({ userId: req.auth!.id, action: "document.upload", entity: "ResidentDocument", entityId: doc.id, hostelId: fo.hostelId });
      return res.status(201).json(doc);
    }

    if (fo.kind === "payment.proof") {
      const payment = await prisma.payment.findUnique({ where: { id: fo.paymentId! } });
      if (!payment) throw notFound("Payment not found");
      await removeStoredFile(payment.proofUrl);
      await prisma.payment.update({ where: { id: payment.id }, data: { proofUrl: ref } });
      await audit({ userId: req.auth!.id, action: "payment.proof", entity: "Payment", entityId: payment.id, hostelId: payment.hostelId });
      return res.status(201).json({ proofUrl: ref });
    }

    throw badRequest("Unknown upload kind");
  })
);

// ---------------------------------------------------------------------------
// Legacy through-API uploads (kept as a fallback when R2 is not configured, and
// for the local-dev database storage path). storeFile() routes to R2 or the DB.
// ---------------------------------------------------------------------------

// POST /api/uploads/resident/:id/document — secure document upload
router.post(
  "/resident/:id/document",
  requirePermission("residents.manage"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("No file uploaded");
    const parsed = z.object({ type: z.enum(DOC_TYPES) }).safeParse(req.body);
    if (!parsed.success) throw badRequest("Invalid document type");
    const resident = await prisma.resident.findUnique({ where: { id: req.params.id }, include: { hostel: { select: { companyId: true } } } });
    if (!resident) throw notFound("Resident not found");
    await assertHostelAccess(req, resident.hostelId);

    const fileUrl = await storeFile(req.file, {
      companyId: resident.hostel.companyId, hostelId: resident.hostelId, residentId: resident.id,
      kind: "resident.document", uploadedById: req.auth!.id,
    });
    const doc = await prisma.residentDocument.create({
      data: {
        residentId: resident.id,
        type: (parsed.data as { type: DocType }).type,
        fileName: req.file.originalname,
        fileUrl,
        mimeType: resolveType(req.file) ?? req.file.mimetype,
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
    if (!resolveType(req.file)?.startsWith("image/")) throw badRequest("Profile picture must be an image");
    const resident = await prisma.resident.findUnique({ where: { id: req.params.id }, include: { hostel: { select: { companyId: true } } } });
    if (!resident) throw notFound("Resident not found");
    await assertHostelAccess(req, resident.hostelId);

    await removeStoredFile(resident.photoUrl); // drop the previous picture
    const photoUrl = await storeFile(req.file, {
      companyId: resident.hostel.companyId, hostelId: resident.hostelId, residentId: resident.id,
      kind: "resident.photo", uploadedById: req.auth!.id,
    });
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

// POST /api/uploads/payment/:id/proof — attach a transfer receipt / screenshot
router.post(
  "/payment/:id/proof",
  requirePermission("payments.manage"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("No file uploaded");
    if (!resolveType(req.file)) throw badRequest("Please upload an image or a PDF");
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id }, include: { hostel: { select: { companyId: true } } } });
    if (!payment) throw notFound("Payment not found");
    await assertHostelAccess(req, payment.hostelId);

    await removeStoredFile(payment.proofUrl); // replace any previous proof
    const proofUrl = await storeFile(req.file, {
      companyId: payment.hostel.companyId, hostelId: payment.hostelId, residentId: payment.residentId,
      paymentId: payment.id, kind: "payment.proof", uploadedById: req.auth!.id,
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { proofUrl } });
    await audit({ userId: req.auth!.id, action: "payment.proof", entity: "Payment", entityId: payment.id, hostelId: payment.hostelId });
    res.status(201).json({ proofUrl });
  })
);

// DELETE /api/uploads/payment/:id/proof — remove a payment's proof
router.delete(
  "/payment/:id/proof",
  requirePermission("payments.manage"),
  asyncHandler(async (req, res) => {
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!payment) throw notFound("Payment not found");
    await assertHostelAccess(req, payment.hostelId);
    await removeStoredFile(payment.proofUrl);
    await prisma.payment.update({ where: { id: payment.id }, data: { proofUrl: null } });
    await audit({ userId: req.auth!.id, action: "payment.proof_delete", entity: "Payment", entityId: payment.id, hostelId: payment.hostelId });
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
