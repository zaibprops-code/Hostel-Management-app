import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, conflict, notFound } from "../lib/http";
import { validateBody } from "../middleware/validate";
import { requirePermission, assertHostelAccess } from "../middleware/rbac";
import { hostelScope } from "../lib/query";
import { audit } from "../lib/audit";

const router = Router();

// ---- Floors -------------------------------------------------------------

router.post(
  "/floors",
  requirePermission("rooms.manage"),
  validateBody(z.object({ hostelId: z.string(), name: z.string().min(1), level: z.coerce.number().int() })),
  asyncHandler(async (req, res) => {
    await assertHostelAccess(req, req.body.hostelId);
    const floor = await prisma.floor.create({ data: req.body });
    await audit({ userId: req.auth!.id, action: "floor.create", entity: "Floor", entityId: floor.id, hostelId: floor.hostelId });
    res.status(201).json(floor);
  })
);

// ---- Rooms --------------------------------------------------------------

router.post(
  "/rooms",
  requirePermission("rooms.manage"),
  validateBody(
    z.object({
      hostelId: z.string(),
      floorId: z.string().optional(),
      name: z.string().min(1),
      capacity: z.coerce.number().int().min(1).default(1),
      notes: z.string().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    await assertHostelAccess(req, req.body.hostelId);
    const room = await prisma.room.create({ data: req.body });
    await audit({ userId: req.auth!.id, action: "room.create", entity: "Room", entityId: room.id, hostelId: room.hostelId });
    res.status(201).json(room);
  })
);

router.put(
  "/rooms/:id",
  requirePermission("rooms.manage"),
  validateBody(z.object({ name: z.string().optional(), floorId: z.string().nullable().optional(), capacity: z.coerce.number().int().min(1).optional(), notes: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const room = await prisma.room.findUnique({ where: { id: req.params.id } });
    if (!room) throw notFound("Room not found");
    await assertHostelAccess(req, room.hostelId);
    const updated = await prisma.room.update({ where: { id: room.id }, data: req.body });
    res.json(updated);
  })
);

// ---- Beds ---------------------------------------------------------------

const bedStatuses = ["AVAILABLE", "RESERVED", "OCCUPIED", "MAINTENANCE", "BLOCKED"] as const;

router.post(
  "/beds",
  requirePermission("rooms.manage"),
  validateBody(z.object({ roomId: z.string(), label: z.string().min(1), monthlyRent: z.coerce.number().min(0).default(0) })),
  asyncHandler(async (req, res) => {
    const room = await prisma.room.findUnique({ where: { id: req.body.roomId } });
    if (!room) throw notFound("Room not found");
    await assertHostelAccess(req, room.hostelId);
    const bed = await prisma.bed.create({
      data: { roomId: room.id, hostelId: room.hostelId, label: req.body.label, monthlyRent: req.body.monthlyRent },
    });
    await audit({ userId: req.auth!.id, action: "bed.create", entity: "Bed", entityId: bed.id, hostelId: bed.hostelId });
    res.status(201).json(bed);
  })
);

// PATCH /api/structure/beds/:id/status — change status (cannot free an occupied bed here)
router.patch(
  "/beds/:id/status",
  requirePermission("rooms.manage"),
  validateBody(z.object({ status: z.enum(bedStatuses) })),
  asyncHandler(async (req, res) => {
    const bed = await prisma.bed.findUnique({ where: { id: req.params.id }, include: { resident: true } });
    if (!bed) throw notFound("Bed not found");
    await assertHostelAccess(req, bed.hostelId);
    if (bed.resident && req.body.status !== "OCCUPIED") {
      throw conflict("This bed has an assigned resident. Check the resident out first.");
    }
    if (!bed.resident && req.body.status === "OCCUPIED") {
      throw badRequest("Assign a resident via admissions to occupy a bed.");
    }
    const updated = await prisma.bed.update({ where: { id: bed.id }, data: { status: req.body.status } });
    await audit({ userId: req.auth!.id, action: "bed.status", entity: "Bed", entityId: bed.id, hostelId: bed.hostelId, oldValue: { status: bed.status }, newValue: { status: req.body.status } });
    res.json(updated);
  })
);

// GET /api/structure/map?hostelId= — the visual occupancy map
router.get(
  "/map",
  requirePermission("rooms.view"),
  asyncHandler(async (req, res) => {
    const scope = await hostelScope(req);
    const rooms = await prisma.room.findMany({
      where: scope,
      orderBy: [{ floor: { level: "asc" } }, { name: "asc" }],
      include: {
        floor: true,
        hostel: { select: { id: true, name: true } },
        beds: {
          orderBy: { label: "asc" },
          include: { resident: { select: { id: true, fullName: true, status: true } } },
        },
      },
    });
    res.json(
      rooms.map((r) => ({
        id: r.id,
        name: r.name,
        capacity: r.capacity,
        floor: r.floor?.name ?? "Unassigned",
        floorLevel: r.floor?.level ?? 0,
        hostel: r.hostel,
        beds: r.beds.map((b) => ({
          id: b.id,
          label: b.label,
          status: b.status,
          monthlyRent: Number(b.monthlyRent),
          resident: b.resident,
        })),
      }))
    );
  })
);

// GET /api/structure/available-beds?hostelId= — for admission dropdowns
router.get(
  "/available-beds",
  requirePermission("rooms.view"),
  asyncHandler(async (req, res) => {
    const scope = await hostelScope(req);
    const beds = await prisma.bed.findMany({
      where: { ...scope, status: "AVAILABLE" },
      include: { room: { include: { floor: true } } },
      orderBy: { label: "asc" },
    });
    res.json(
      beds.map((b) => ({
        id: b.id,
        label: b.label,
        monthlyRent: Number(b.monthlyRent),
        roomName: b.room.name,
        floor: b.room.floor?.name ?? "",
        hostelId: b.hostelId,
      }))
    );
  })
);

export default router;
