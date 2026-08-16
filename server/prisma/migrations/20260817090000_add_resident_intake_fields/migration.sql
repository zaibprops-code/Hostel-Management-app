-- Additional resident details captured on the public self-intake form.
-- All nullable/additive — safe, non-destructive.
ALTER TABLE "Resident" ADD COLUMN "guardianPhone" TEXT;
ALTER TABLE "Resident" ADD COLUMN "nationality" TEXT;
ALTER TABLE "Resident" ADD COLUMN "bloodGroup" TEXT;
ALTER TABLE "Resident" ADD COLUMN "vehicle" TEXT;
ALTER TABLE "Resident" ADD COLUMN "medicalNotes" TEXT;
ALTER TABLE "Resident" ADD COLUMN "howHeard" TEXT;
ALTER TABLE "Resident" ADD COLUMN "expectedMoveIn" TIMESTAMP(3);
ALTER TABLE "Resident" ADD COLUMN "expectedStayMonths" INTEGER;
