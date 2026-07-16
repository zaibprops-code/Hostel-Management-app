import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, notFound } from "../lib/http";
import { validateBody } from "../middleware/validate";
import { requirePermission, assertHostelAccess } from "../middleware/rbac";
import { hostelScope, dec } from "../lib/query";
import { audit } from "../lib/audit";

// =========================================================================
// Inventory items & stock transactions
// =========================================================================
export const inventoryRouter = Router();

inventoryRouter.get("/", requirePermission("inventory.view"), asyncHandler(async (req, res) => {
  const scope = await hostelScope(req);
  const items = await prisma.inventoryItem.findMany({ where: scope, orderBy: { name: "asc" }, include: { hostel: { select: { name: true } } } });
  const soon = new Date(Date.now() + 7 * 86400000);
  res.json(items.map((i) => ({
    ...i,
    quantity: dec(i.quantity), minStock: dec(i.minStock), purchasePrice: dec(i.purchasePrice),
    hostel: i.hostel.name,
    lowStock: dec(i.quantity) <= dec(i.minStock),
    expired: i.expiryDate ? i.expiryDate < new Date() : false,
    nearExpiry: i.expiryDate ? i.expiryDate <= soon && i.expiryDate >= new Date() : false,
  })));
}));

inventoryRouter.post("/", requirePermission("inventory.manage"), validateBody(z.object({
  hostelId: z.string(), name: z.string().min(1), category: z.string().min(1), unit: z.string().default("kg"),
  quantity: z.coerce.number().min(0).default(0), minStock: z.coerce.number().min(0).default(0),
  purchasePrice: z.coerce.number().min(0).default(0), location: z.string().optional(), expiryDate: z.coerce.date().optional(),
})), asyncHandler(async (req, res) => {
  await assertHostelAccess(req, req.body.hostelId);
  const item = await prisma.inventoryItem.create({ data: req.body });
  await audit({ userId: req.auth!.id, action: "inventory.create", entity: "InventoryItem", entityId: item.id, hostelId: item.hostelId });
  res.status(201).json({ ...item, quantity: dec(item.quantity) });
}));

// Stock movement (purchase adds, consumption/waste subtract)
inventoryRouter.post("/:id/transaction", requirePermission("inventory.manage"), validateBody(z.object({
  type: z.enum(["PURCHASE", "CONSUMPTION", "WASTE", "ADJUSTMENT"]), quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().min(0).default(0), note: z.string().optional(),
})), asyncHandler(async (req, res) => {
  const item = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
  if (!item) throw notFound("Item not found");
  await assertHostelAccess(req, item.hostelId);
  const delta = req.body.type === "PURCHASE" || req.body.type === "ADJUSTMENT" ? req.body.quantity : -req.body.quantity;
  const result = await prisma.$transaction(async (tx) => {
    await tx.inventoryTransaction.create({ data: { itemId: item.id, ...req.body } });
    return tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: { increment: delta } } });
  });
  await audit({ userId: req.auth!.id, action: "inventory.transaction", entity: "InventoryItem", entityId: item.id, hostelId: item.hostelId, newValue: { type: req.body.type, quantity: req.body.quantity } });
  res.json({ ...result, quantity: dec(result.quantity) });
}));

// =========================================================================
// Suppliers
// =========================================================================
export const suppliersRouter = Router();

suppliersRouter.get("/", requirePermission("suppliers.view"), asyncHandler(async (req, res) => {
  const scope = await hostelScope(req);
  const rows = await prisma.supplier.findMany({ where: scope, orderBy: { name: "asc" }, include: { hostel: { select: { name: true } } } });
  res.json(rows.map((s) => ({ ...s, outstanding: dec(s.outstanding), hostel: s.hostel.name })));
}));

suppliersRouter.post("/", requirePermission("suppliers.manage"), validateBody(z.object({
  hostelId: z.string(), name: z.string().min(1), contactPerson: z.string().optional(), phone: z.string().optional(),
  address: z.string().optional(), products: z.string().optional(), paymentTerms: z.string().optional(),
})), asyncHandler(async (req, res) => {
  await assertHostelAccess(req, req.body.hostelId);
  const supplier = await prisma.supplier.create({ data: req.body });
  await audit({ userId: req.auth!.id, action: "supplier.create", entity: "Supplier", entityId: supplier.id, hostelId: supplier.hostelId });
  res.status(201).json(supplier);
}));
