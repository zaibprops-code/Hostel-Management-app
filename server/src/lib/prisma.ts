import { PrismaClient } from "@prisma/client";

// A single shared PrismaClient. On serverless platforms (Vercel) each cold start
// loads this module once, and reusing the instance across warm invocations keeps
// the database connection count bounded. The globalThis guard also prevents dev
// hot-reload (tsx watch) from leaking a new client on every reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
