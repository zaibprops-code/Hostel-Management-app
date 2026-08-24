-- AlterTable: per-resident rent scheduling (cycle mode, billing day, pro-rata)
ALTER TABLE "Resident" ADD COLUMN "billingMode" TEXT NOT NULL DEFAULT 'CALENDAR';
ALTER TABLE "Resident" ADD COLUMN "billingDay" INTEGER;
ALTER TABLE "Resident" ADD COLUMN "proratedFirst" BOOLEAN NOT NULL DEFAULT false;
