import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, notFound } from "../lib/http";
import { validateBody } from "../middleware/validate";
import { requirePermission, accessibleHostelIds, assertHostelAccess } from "../middleware/rbac";
import { audit } from "../lib/audit";

const router = Router();

const hostelSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  address: z.string().optional(),
  city: z.string().optional(),
  contactNumber: z.string().optional(),
  mapsUrl: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  propertyRent: z.coerce.number().min(0).default(0),
  propertyDeposit: z.coerce.number().min(0).default(0),
  noticePeriodDays: z.coerce.number().int().min(0).default(30),
});

// GET /api/hostels — list accessible hostels with live occupancy stats.
router.get(
  "/",
  requirePermission("hostels.view"),
  asyncHandler(async (req, res) => {
    const ids = await accessibleHostelIds(req);
    const hostels = await prisma.hostel.findMany({
      where: { id: { in: ids } },
      orderBy: { name: "asc" },
      include: { _count: { select: { beds: true, residents: true } } },
    });

    const withStats = await Promise.all(
      hostels.map(async (h) => {
        const occupied = await prisma.bed.count({ where: { hostelId: h.id, status: "OCCUPIED" } });
        const available = await prisma.bed.count({ where: { hostelId: h.id, status: "AVAILABLE" } });
        const activeResidents = await prisma.resident.count({ where: { hostelId: h.id, status: "ACTIVE" } });
        return {
          ...h,
          propertyRent: Number(h.propertyRent),
          propertyDeposit: Number(h.propertyDeposit),
          stats: {
            totalBeds: h._count.beds,
            occupiedBeds: occupied,
            availableBeds: available,
            activeResidents,
            occupancyRate: h._count.beds ? Math.round((occupied / h._count.beds) * 100) : 0,
          },
        };
      })
    );
    res.json(withStats);
  })
);

// GET /api/hostels/:id
router.get(
  "/:id",
  requirePermission("hostels.view"),
  asyncHandler(async (req, res) => {
    await assertHostelAccess(req, req.params.id);
    const hostel = await prisma.hostel.findUnique({
      where: { id: req.params.id },
      include: { floors: { orderBy: { level: "asc" } } },
    });
    if (!hostel) throw notFound("Hostel not found");
    res.json({ ...hostel, propertyRent: Number(hostel.propertyRent), propertyDeposit: Number(hostel.propertyDeposit) });
  })
);

// POST /api/hostels
router.post(
  "/",
  requirePermission("hostels.manage"),
  validateBody(hostelSchema),
  asyncHandler(async (req, res) => {
    const data = req.body as z.infer<typeof hostelSchema>;
    const hostel = await prisma.hostel.create({
      data: { ...data, companyId: req.auth!.companyId },
    });
    await audit({ userId: req.auth!.id, action: "hostel.create", entity: "Hostel", entityId: hostel.id, hostelId: hostel.id, newValue: data });
    res.status(201).json(hostel);
  })
);

// PUT /api/hostels/:id
router.put(
  "/:id",
  requirePermission("hostels.manage"),
  validateBody(hostelSchema.partial()),
  asyncHandler(async (req, res) => {
    await assertHostelAccess(req, req.params.id);
    const before = await prisma.hostel.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound("Hostel not found");
    const hostel = await prisma.hostel.update({ where: { id: req.params.id }, data: req.body });
    await audit({ userId: req.auth!.id, action: "hostel.update", entity: "Hostel", entityId: hostel.id, hostelId: hostel.id, oldValue: before, newValue: req.body });
    res.json(hostel);
  })
);

export default router;
