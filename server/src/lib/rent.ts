import { Prisma, PrismaClient, RentChargeStatus } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

// Recomputes a rent charge's status from its amount / discount / amountPaid.
export function computeStatus(
  amount: number,
  discount: number,
  amountPaid: number,
  dueDate: Date
): RentChargeStatus {
  const net = amount - discount;
  if (amountPaid >= net && net >= 0) return "PAID";
  if (amountPaid > 0) return "PARTIALLY_PAID";
  if (dueDate < new Date()) return "OVERDUE";
  return "PENDING";
}

// Ensures a rent charge exists for the given resident + period. Idempotent.
export async function ensureRentCharge(
  tx: Tx,
  params: {
    hostelId: string;
    residentId: string;
    year: number;
    month: number; // 1-12
    amount: number;
    dueDay: number;
  }
) {
  const existing = await tx.rentCharge.findUnique({
    where: {
      residentId_periodYear_periodMonth: {
        residentId: params.residentId,
        periodYear: params.year,
        periodMonth: params.month,
      },
    },
  });
  if (existing) return existing;

  const dueDate = new Date(params.year, params.month - 1, Math.min(params.dueDay, 28));
  return tx.rentCharge.create({
    data: {
      hostelId: params.hostelId,
      residentId: params.residentId,
      periodYear: params.year,
      periodMonth: params.month,
      amount: params.amount,
      dueDate,
      status: computeStatus(params.amount, 0, 0, dueDate),
    },
  });
}

// Generates rent charges for every active resident up to the current month.
// Returns the number of new charges created. Safe to run repeatedly.
export async function generateDueRent(prisma: PrismaClient, hostelIds?: string[]): Promise<number> {
  const now = new Date();
  const residents = await prisma.resident.findMany({
    where: {
      status: "ACTIVE",
      admissionDate: { not: null },
      ...(hostelIds ? { hostelId: { in: hostelIds } } : {}),
    },
  });

  let created = 0;
  for (const r of residents) {
    if (!r.admissionDate) continue;
    const start = new Date(r.admissionDate.getFullYear(), r.admissionDate.getMonth(), 1);
    const cursor = new Date(start);
    while (
      cursor.getFullYear() < now.getFullYear() ||
      (cursor.getFullYear() === now.getFullYear() && cursor.getMonth() <= now.getMonth())
    ) {
      const before = await prisma.rentCharge.findUnique({
        where: {
          residentId_periodYear_periodMonth: {
            residentId: r.id,
            periodYear: cursor.getFullYear(),
            periodMonth: cursor.getMonth() + 1,
          },
        },
      });
      if (!before) {
        await ensureRentCharge(prisma, {
          hostelId: r.hostelId,
          residentId: r.id,
          year: cursor.getFullYear(),
          month: cursor.getMonth() + 1,
          amount: Number(r.monthlyRent),
          dueDay: 1,
        });
        created++;
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  return created;
}
