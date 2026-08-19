-- Extra resident details required for Pakistani police / tenant-verification
-- forms: guardian occupation, business address, religion, and a local reference
-- (a blood relative living in the hostel's city). Also add a JOB_CARD document
-- type for professionals' employer / job cards.

-- New DocumentType value (Postgres allows ADD VALUE inside a transaction on v12+;
-- Supabase is v15, and the value is not used within this same migration).
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'JOB_CARD';

ALTER TABLE "Resident" ADD COLUMN IF NOT EXISTS "guardianOccupation" TEXT;
ALTER TABLE "Resident" ADD COLUMN IF NOT EXISTS "businessAddress" TEXT;
ALTER TABLE "Resident" ADD COLUMN IF NOT EXISTS "religion" TEXT;
ALTER TABLE "Resident" ADD COLUMN IF NOT EXISTS "localRefName" TEXT;
ALTER TABLE "Resident" ADD COLUMN IF NOT EXISTS "localRefRelation" TEXT;
ALTER TABLE "Resident" ADD COLUMN IF NOT EXISTS "localRefAddress" TEXT;
ALTER TABLE "Resident" ADD COLUMN IF NOT EXISTS "localRefPhone" TEXT;
