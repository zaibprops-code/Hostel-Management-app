import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, notFound } from "../lib/http";
import { validateBody } from "../middleware/validate";

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

const intakeSchema = z.object({
  fullName: z.string().min(1),
  guardianName: z.string().optional(),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  cnic: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  permanentAddress: z.string().optional(),
  currentAddress: z.string().optional(),
  city: z.string().optional(),
  emergencyName: z.string().optional(),
  emergencyPhone: z.string().optional(),
  emergencyRelation: z.string().optional(),
  occupantType: z.enum(["STUDENT", "PROFESSIONAL", "DAILY"]).optional(),
  university: z.string().optional(),
  program: z.string().optional(),
  company: z.string().optional(),
  occupation: z.string().optional(),
  studentId: z.string().optional(),
});

// POST /api/public/intake/:token — a prospective resident submits their own
// details. Never assigns a bed or touches money; the owner reviews and admits.
router.post(
  "/intake/:token",
  validateBody(intakeSchema),
  asyncHandler(async (req, res) => {
    const hostel = await prisma.hostel.findUnique({ where: { intakeToken: req.params.token }, select: { id: true } });
    if (!hostel) throw notFound("This link is invalid or has been turned off.");
    const data = { ...req.body } as Record<string, unknown>;
    if (data.email === "") delete data.email;
    await prisma.resident.create({ data: { ...data, hostelId: hostel.id, status: "RESERVED", pendingReview: true } as any });
    res.status(201).json({ success: true });
  })
);

export default router;
