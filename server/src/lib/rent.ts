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

  // End of the due day so rent is "overdue" only AFTER that day (due-by inclusive).
  const dueDate = new Date(params.year, params.month - 1, Math.min(params.dueDay, 28), 23, 59, 59);
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
      occupantType: { not: "DAILY" }, // daily guests are billed once for their stay
      ...(hostelIds ? { hostelId: { in: hostelIds } } : {}),
    },
  });

  // Each hostel's "rent due by" day drives the charge due dates.
  const hostelRows = await prisma.hostel.findMany({
    where: { id: { in: [...new Set(residents.map((r) => r.hostelId))] } },
    select: { id: true, rentDueDay: true },
  });
  const dueDayOf = new Map(hostelRows.map((h) => [h.id, h.rentDueDay]));

  let created = 0;
  for (const r of residents) {
    if (!r.admissionDate) continue;
    const dueDay = dueDayOf.get(r.hostelId) ?? 10;
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
          dueDay,
        });
        created++;
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  return created;
}

// Generate this month's rent charges lazily on read, at most once per hostel per
// month (there is no cron in this deployment). Cheap and idempotent.
const lastRentRun = new Map<string, string>();
export async function catchUpRent(prisma: PrismaClient, hostelIds: string[]): Promise<void> {
  const now = new Date();
  const ym = `${now.getFullYear()}-${now.getMonth() + 1}`;
  const todo = hostelIds.filter((id) => lastRentRun.get(id) !== ym);
  if (todo.length === 0) return;
  for (const id of todo) lastRentRun.set(id, ym); // claim first to avoid double runs
  try { await generateDueRent(prisma, todo); } catch { for (const id of todo) lastRentRun.delete(id); }
}

// Summarise a monthly resident's rent cycle for the UI.
export interface RentCycle {
  dueDay: number;
  status: "PAID" | "DUE" | "OVERDUE";
  nextDueDate: string; // ISO — when the next/most-overdue rent is due
  outstandingMonths: number;
}
export function rentCycle(
  charges: { periodYear: number; periodMonth: number; amount: number; discount: number; amountPaid: number }[],
  dueDay: number,
  now = new Date()
): RentCycle {
  const day = Math.min(dueDay || 10, 28);
  const unpaid = charges
    .filter((c) => c.amount - c.discount - c.amountPaid > 0.001)
    .sort((a, b) => a.periodYear - b.periodYear || a.periodMonth - b.periodMonth);
  if (unpaid.length === 0) {
    // Everything paid — next rent is next month, due by `day`.
    const next = new Date(now.getFullYear(), now.getMonth() + 1, day, 23, 59, 59);
    return { dueDay: day, status: "PAID", nextDueDate: next.toISOString(), outstandingMonths: 0 };
  }
  const earliest = unpaid[0];
  const dueBy = new Date(earliest.periodYear, earliest.periodMonth - 1, day, 23, 59, 59);
  return {
    dueDay: day,
    status: now > dueBy ? "OVERDUE" : "DUE",
    nextDueDate: dueBy.toISOString(),
    outstandingMonths: unpaid.length,
  };
}
