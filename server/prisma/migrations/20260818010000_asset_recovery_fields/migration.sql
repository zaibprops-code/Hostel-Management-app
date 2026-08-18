-- AlterTable: extra details + landlord cost-recovery tracking on assets
ALTER TABLE "Asset" ADD COLUMN "vendor" TEXT;
ALTER TABLE "Asset" ADD COLUMN "warrantyUntil" TIMESTAMP(3);
ALTER TABLE "Asset" ADD COLUMN "recoverable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Asset" ADD COLUMN "recoveryStatus" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Asset" ADD COLUMN "recoveredAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Asset" ADD COLUMN "recoveredDate" TIMESTAMP(3);
