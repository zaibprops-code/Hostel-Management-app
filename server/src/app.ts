import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import path from "path";
import { env } from "./lib/env";
import { authenticate } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/error";

import authRouter from "./modules/auth";
import hostelsRouter from "./modules/hostels";
import structureRouter from "./modules/structure";
import residentsRouter from "./modules/residents";
import admissionsRouter from "./modules/admissions";
import checkoutsRouter from "./modules/checkouts";
import paymentsRouter from "./modules/payments";
import { expensesRouter, incomeRouter, depositsRouter, capitalRouter } from "./modules/finance";
import dashboardRouter from "./modules/dashboard";
import reportsRouter from "./modules/reports";
import { maintenanceRouter, complaintsRouter, visitorsRouter, noticesRouter } from "./modules/operations";
import foodRouter from "./modules/food";
import { inventoryRouter, suppliersRouter } from "./modules/inventory";
import staffRouter from "./modules/staff";
import usersRouter from "./modules/users";
import { auditRouter, notificationsRouter } from "./modules/misc";
import portalRouter from "./modules/portal";
import uploadsRouter from "./modules/uploads";

export function createApp() {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin: env.corsOrigin.split(","), credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan(env.nodeEnv === "development" ? "dev" : "combined"));

  // Basic rate limiting; stricter on auth.
  app.use("/api", rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));
  const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: 40 });

  app.get("/api/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

  // Public auth routes
  app.use("/api/auth", authLimiter, authRouter);

  // Uploaded files (served with access checks in the router)
  app.use("/uploads", express.static(path.join(process.cwd(), env.uploadDir)));

  // Protected routes
  app.use("/api", authenticate);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/hostels", hostelsRouter);
  app.use("/api/structure", structureRouter);
  app.use("/api/residents", residentsRouter);
  app.use("/api/admissions", admissionsRouter);
  app.use("/api/checkouts", checkoutsRouter);
  app.use("/api/payments", paymentsRouter);
  app.use("/api/expenses", expensesRouter);
  app.use("/api/income", incomeRouter);
  app.use("/api/deposits", depositsRouter);
  app.use("/api/capital", capitalRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/maintenance", maintenanceRouter);
  app.use("/api/complaints", complaintsRouter);
  app.use("/api/visitors", visitorsRouter);
  app.use("/api/notices", noticesRouter);
  app.use("/api/food", foodRouter);
  app.use("/api/inventory", inventoryRouter);
  app.use("/api/suppliers", suppliersRouter);
  app.use("/api/staff", staffRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/audit", auditRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/portal", portalRouter);
  app.use("/api/uploads", uploadsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
