import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, notFound } from "../lib/http";
import { validateBody } from "../middleware/validate";
import { requirePermission, assertHostelAccess } from "../middleware/rbac";
import { hostelScope, dec } from "../lib/query";
import { audit } from "../lib/audit";

const router = Router();
const meals = ["BREAKFAST", "LUNCH", "DINNER"] as const;

// ---- Food plans ---------------------------------------------------------
router.get("/plans", requirePermission("food.view"), asyncHandler(async (_req, res) => {
  const plans = await prisma.foodPlan.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, include: { _count: { select: { residents: true } } } });
  res.json(plans.map((p) => ({ ...p, monthlyCost: dec(p.monthlyCost), residentCount: p._count.residents })));
}));

router.post("/plans", requirePermission("food.manage"), validateBody(z.object({
  name: z.string().min(1), description: z.string().optional(), monthlyCost: z.coerce.number().min(0).default(0),
  includesBreakfast: z.boolean().default(true), includesLunch: z.boolean().default(true), includesDinner: z.boolean().default(true),
})), asyncHandler(async (req, res) => {
  const plan = await prisma.foodPlan.create({ data: req.body });
  await audit({ userId: req.auth!.id, action: "foodplan.create", entity: "FoodPlan", entityId: plan.id });
  res.status(201).json(plan);
}));

// ---- Weekly menu --------------------------------------------------------
router.get("/menu", requirePermission("food.view"), asyncHandler(async (req, res) => {
  const scope = await hostelScope(req);
  const menus = await prisma.menu.findMany({ where: scope, orderBy: [{ dayOfWeek: "asc" }, { mealType: "asc" }] });
  res.json(menus);
}));

router.put("/menu", requirePermission("food.manage"), validateBody(z.object({
  hostelId: z.string(), dayOfWeek: z.coerce.number().int().min(0).max(6), mealType: z.enum(meals), description: z.string().min(1),
})), asyncHandler(async (req, res) => {
  await assertHostelAccess(req, req.body.hostelId);
  const menu = await prisma.menu.upsert({
    where: { hostelId_dayOfWeek_mealType: { hostelId: req.body.hostelId, dayOfWeek: req.body.dayOfWeek, mealType: req.body.mealType } },
    create: req.body,
    update: { description: req.body.description },
  });
  res.json(menu);
}));

// ---- Food headcount / cost estimate ------------------------------------
router.get("/headcount", requirePermission("food.view"), asyncHandler(async (req, res) => {
  const scope = await hostelScope(req);
  const [onPlan, offPlan] = await Promise.all([
    prisma.resident.count({ where: { ...scope, status: "ACTIVE", foodPlanId: { not: null } } }),
    prisma.resident.count({ where: { ...scope, status: "ACTIVE", foodPlanId: null } }),
  ]);
  const foodExpense = await prisma.expense.aggregate({ where: { ...scope, status: "ACTIVE", category: { in: ["FOOD", "GROCERIES"] } }, _sum: { amount: true } });
  const totalFood = dec(foodExpense._sum.amount);
  res.json({ onPlan, offPlan, totalActive: onPlan + offPlan, monthlyFoodCost: totalFood, costPerResident: onPlan ? Math.round(totalFood / onPlan) : 0 });
}));

export default router;
