import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, notFound } from "../lib/http";
import { validateBody } from "../middleware/validate";
import { upload, resolveType, storeFile } from "../lib/files";

// Public, unauthenticated resident self-intake. A hostel owner shares the
// /intake/:token link; a prospective resident fills the form and their details
// land as a RESERVED, pendingReview resident for the owner to check and admit.
const router = Router();

// GET /api/public/intake/:token — resolve a link to its hostel so the form can
// greet the applicant with the right hostel name.
router.get(
  "/intake/:token",
  asyncHandler(async (req, res) => {
    const hostel = await prisma.hostel.findUnique({
      where: { intakeToken: req.params.token },
      select: { name: true, city: true, gender: true, company: { select: { name: true } } },
    });
    if (!hostel) throw notFound("This link is invalid or has been turned off.");
    res.json({ hostelName: hostel.name, city: hostel.city, gender: hostel.gender, companyName: hostel.company.name });
  })
);

// Turn "" into undefined so optional text fields never fail validation just
// because the box was left empty.
const optionalText = z.preprocess((v) => (v === "" ? undefined : v), z.string().optional());

const intakeSchema = z.object({
  fullName: z.string().trim().min(1, "Please enter your full name."),
  guardianName: optionalText,
  dateOfBirth: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.date({ errorMap: () => ({ message: "Please enter a valid date of birth (or leave it blank)." }) }).optional()
  ),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  cnic: optionalText,
  phone: optionalText,
  whatsapp: optionalText,
  email: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().email("Please enter a valid email address, or leave it blank.").optional()
  ),
  permanentAddress: z.string().optional(),
  currentAddress: z.string().optional(),
  city: z.string().optional(),
  emergencyName: z.string().optional(),
  emergencyPhone: z.string().optional(),
  emergencyRelation: z.string().optional(),
  guardianPhone: optionalText,
  nationality: optionalText,
  bloodGroup: optionalText,
  vehicle: optionalText,
  medicalNotes: z.string().optional(),
  howHeard: optionalText,
  expectedMoveIn: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.date().optional()
  ),
  expectedStayMonths: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().min(0).max(120).optional()
  ),
  occupantType: z.enum(["STUDENT", "PROFESSIONAL", "DAILY"]).optional(),
  university: z.string().optional(),
  program: z.string().optional(),
  company: z.string().optional(),
  occupation: z.string().optional(),
  studentId: z.string().optional(),
});

// Optional photo + ID documents the applicant may attach, submitted together
// with the text fields as one multipart request. Each is size/type-limited by
// the shared uploader.
const intakeFiles = upload.fields([
  { name: "photo", maxCount: 1 },
  { name: "cnicFront", maxCount: 1 },
  { name: "cnicBack", maxCount: 1 },
  { name: "studentCard", maxCount: 1 },
]);

const DOC_FIELDS: [string, "CNIC_FRONT" | "CNIC_BACK" | "STUDENT_CARD"][] = [
  ["cnicFront", "CNIC_FRONT"],
  ["cnicBack", "CNIC_BACK"],
  ["studentCard", "STUDENT_CARD"],
];

// POST /api/public/intake/:token — a prospective resident submits their own
// details (and, optionally, their photo + CNIC/ID images). Never assigns a bed
// or touches money; the owner reviews and admits. Multer parses the multipart
// body first so validateBody sees the text fields.
router.post(
  "/intake/:token",
  intakeFiles,
  validateBody(intakeSchema),
  asyncHandler(async (req, res) => {
    const hostel = await prisma.hostel.findUnique({ where: { intakeToken: req.params.token }, select: { id: true, companyId: true } });
    if (!hostel) throw notFound("This link is invalid or has been turned off.");
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;

    const data = { ...req.body } as Record<string, unknown>;
    if (data.email === "") delete data.email;

    const resident = await prisma.resident.create({
      data: { ...data, hostelId: hostel.id, status: "RESERVED", pendingReview: true } as any,
    });

    // Profile photo (images only).
    const photo = files?.photo?.[0];
    if (photo && resolveType(photo)?.startsWith("image/")) {
      const photoUrl = await storeFile(photo, {
        companyId: hostel.companyId, hostelId: hostel.id, residentId: resident.id, kind: "resident.photo",
      });
      await prisma.resident.update({ where: { id: resident.id }, data: { photoUrl } });
    }
    // ID documents.
    for (const [field, type] of DOC_FIELDS) {
      const f = files?.[field]?.[0];
      if (f && resolveType(f)) {
        const fileUrl = await storeFile(f, {
          companyId: hostel.companyId, hostelId: hostel.id, residentId: resident.id, kind: "resident.document",
        });
        await prisma.residentDocument.create({
          data: { residentId: resident.id, type, fileName: f.originalname, fileUrl, mimeType: resolveType(f) ?? f.mimetype },
        });
      }
    }

    res.status(201).json({ success: true });
  })
);

export default router;
