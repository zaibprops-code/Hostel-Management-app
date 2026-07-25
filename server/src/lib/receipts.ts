import { Prisma } from "@prisma/client";

// Mint the next sequential receipt number for a hostel, atomically. The counter
// is per hostel and per year, so numbers read like "PBH/2026/0001" and never
// repeat (voided receipts keep their number — nothing is reused).
export async function nextReceiptNo(
  tx: Prisma.TransactionClient,
  hostelId: string,
  hostelCode: string,
  date: Date
): Promise<string> {
  const year = date.getFullYear();
  const key = `${hostelId}:${year}`;
  // Single atomic statement: insert the counter at 1, or bump it by 1, and
  // return the value — safe even if two payments are recorded at once.
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "ReceiptSequence" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "ReceiptSequence"."value" + 1
    RETURNING "value"`;
  const seq = rows[0]?.value ?? 1;
  const prefix = (hostelCode || "RCP").toUpperCase();
  return `${prefix}/${year}/${String(seq).padStart(4, "0")}`;
}
