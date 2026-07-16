import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/http";
import { requirePermission } from "../middleware/rbac";
import { parsePagination } from "../middleware/validate";

// =========================================================================
// Audit logs (read-only)
// =========================================================================
export const auditRouter = Router();

auditRouter.get("/", requirePermission("audit.view"), asyncHandler(async (req, res) => {
  const { page, pageSize } = parsePagination(req.query);
  const where: any = {};
  if (req.query.entity) where.entity = req.query.entity;
  if (req.query.action) where.action = { contains: req.query.action as string };
  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize,
      include: { user: { select: { name: true, email: true, role: true } } },
    }),
  ]);
  res.json({ total, page, pageSize, data: logs });
}));

// =========================================================================
// Notifications
// =========================================================================
export const notificationsRouter = Router();

notificationsRouter.get("/", asyncHandler(async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.auth!.id }, orderBy: { createdAt: "desc" }, take: 50,
  });
  const unread = notifications.filter((n) => !n.isRead).length;
  res.json({ unread, data: notifications });
}));

notificationsRouter.post("/:id/read", asyncHandler(async (req, res) => {
  await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.auth!.id }, data: { isRead: true } });
  res.json({ success: true });
}));

notificationsRouter.post("/read-all", asyncHandler(async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.auth!.id, isRead: false }, data: { isRead: true } });
  res.json({ success: true });
}));
