-- Single-use resident-intake invite links.
CREATE TABLE "IntakeInvite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "hostelId" TEXT NOT NULL,
    "createdById" TEXT,
    "residentId" TEXT,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntakeInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntakeInvite_token_key" ON "IntakeInvite"("token");
CREATE INDEX "IntakeInvite_hostelId_idx" ON "IntakeInvite"("hostelId");

ALTER TABLE "IntakeInvite" ADD CONSTRAINT "IntakeInvite_hostelId_fkey"
    FOREIGN KEY ("hostelId") REFERENCES "Hostel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
