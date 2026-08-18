import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, notFound } from "../lib/http";
import { validateBody } from "../middleware/validate";
import { requirePermission, assertHostelAccess } from "../middleware/rbac";
import { hostelScope, dec } from "../lib/query";
import { audit } from "../lib/audit";

// =========================================================================
// Asset register — durable physical things each hostel owns (furniture,
// appliances, kitchen utensils, bedding, electronics…). A counted, condition-
// tracked record per branch, distinct from consumable inventory stock.
// =========================================================================
export const assetsRouter = Router();

const CONDITIONS = ["NEW", "GOOD", "FAIR", "DAMAGED"] as const;

const assetSchema = z.object({
  hostelId: z.string().min(1),
  name: z.string().trim().min(1, "Please enter the item name."),
  category: z.string().trim().min(1, "Please choose a category."),
  quantity: z.coerce.number().int().min(0).default(1),
  condition: z.enum(CONDITIONS).default("GOOD"),
  location: z.string().trim().optional(),
  unitCost: z.coerce.number().min(0).default(0),
  purchaseDate: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.date().optional()),
  notes: z.string().trim().optional(),
});

// Updates may change any field except which hostel the asset belongs to.
const assetUpdateSchema = assetSchema.partial().omit({ hostelId: true });

function serialize(a: {
  id: string; hostelId: string; name: string; category: string; quantity: number;
  condition: string; location: string | null; unitCost: unknown; purchaseDate: Date | null;
  notes: string | null; hostel?: { name: string };
}) {
  const unitCost = dec(a.unitCost as never);
  return {
    id: a.id,
    hostelId: a.hostelId,
    name: a.name,
    category: a.category,
    quantity: a.quantity,
    condition: a.condition,
    location: a.location,
    unitCost,
    totalValue: unitCost * a.quantity,
    purchaseDate: a.purchaseDate,
    notes: a.notes,
    hostel: a.hostel?.name,
  };
}

// GET /api/assets — every asset in the caller's hostel scope, newest first.
// Optional ?category= and ?search= narrow the list; a summary block powers the
// totals shown at the top of the page.
assetsRouter.get(
  "/",
  requirePermission("assets.view"),
  asyncHandler(async (req, res) => {
    const scope = await hostelScope(req);
    const where: any = { ...scope };
    if (req.query.category) where.category = req.query.category;
    if (req.query.search) where.name = { contains: String(req.query.search), mode: "insensitive" };

    const assets = await prisma.asset.findMany({
      where,
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: { hostel: { select: { name: true } } },
    });
    const data = assets.map(serialize);

    const summary = {
      distinctItems: data.length,
      totalUnits: data.reduce((s, a) => s + a.quantity, 0),
      totalValue: data.reduce((s, a) => s + a.totalValue, 0),
      damagedUnits: data.filter((a) => a.condition === "DAMAGED").reduce((s, a) => s + a.quantity, 0),
      categories: Array.from(new Set(data.map((a) => a.category))).sort(),
    };
    res.json({ data, summary });
  })
);

// POST /api/assets — add an item to a hostel's register.
assetsRouter.post(
  "/",
  requirePermission("assets.manage"),
  validateBody(assetSchema),
  asyncHandler(async (req, res) => {
    await assertHostelAccess(req, req.body.hostelId);
    const asset = await prisma.asset.create({ data: req.body });
    await audit({ userId: req.auth!.id, action: "asset.create", entity: "Asset", entityId: asset.id, hostelId: asset.hostelId, newValue: { name: asset.name, quantity: asset.quantity } });
    res.status(201).json(serialize(asset));
  })
);

// PATCH /api/assets/:id — edit an item (name, count, condition, location, cost…).
assetsRouter.patch(
  "/:id",
  requirePermission("assets.manage"),
  validateBody(assetUpdateSchema),
  asyncHandler(async (req, res) => {
    const before = await prisma.asset.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound("Item not found");
    await assertHostelAccess(req, before.hostelId);
    const asset = await prisma.asset.update({ where: { id: before.id }, data: req.body });
    await audit({ userId: req.auth!.id, action: "asset.update", entity: "Asset", entityId: asset.id, hostelId: asset.hostelId, oldValue: { quantity: before.quantity, condition: before.condition }, newValue: { quantity: asset.quantity, condition: asset.condition } });
    res.json(serialize(asset));
  })
);

// DELETE /api/assets/:id — remove an item from the register.
assetsRouter.delete(
  "/:id",
  requirePermission("assets.manage"),
  asyncHandler(async (req, res) => {
    const asset = await prisma.asset.findUnique({ where: { id: req.params.id } });
    if (!asset) throw notFound("Item not found");
    await assertHostelAccess(req, asset.hostelId);
    await prisma.asset.delete({ where: { id: asset.id } });
    await audit({ userId: req.auth!.id, action: "asset.delete", entity: "Asset", entityId: asset.id, hostelId: asset.hostelId, oldValue: { name: asset.name } });
    res.json({ success: true });
  })
);

export default assetsRouter;
