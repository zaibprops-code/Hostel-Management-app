-- Rent is due 1st–5th by default (was 10th). Existing hostels keep their setting.
ALTER TABLE "Hostel" ALTER COLUMN "rentDueDay" SET DEFAULT 5;
