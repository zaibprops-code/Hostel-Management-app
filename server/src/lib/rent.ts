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

// Days in a given month (m is 1-12).
export function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

// Pro-rated rent for the partial first calendar month: from the join day to the
// end of that month (inclusive), by actual days.
export function proratedFirstAmount(admissionDate: Date, monthlyRent: number): number {
  const y = admissionDate.getFullYear();
  const m = admissionDate.getMonth() + 1;
  const dim = daysInMonth(y, m);
  const remaining = dim - admissionDate.getDate() + 1;
  return Math.round((monthlyRent * remaining) / dim);
}

// The amount of a resident's VERY FIRST rent charge, honouring the cycle mode
// and the first-period choice made at admission. Anchored cycles always start
// as a full month on the join day; only calendar mode can be pro-rated.
export function firstChargeAmount(mode: string, prorated: boolean, admissionDate: Date, monthlyRent: number): number {
  if (mode === "CALENDAR" && prorated) return proratedFirstAmount(admissionDate, monthlyRent);
  return Math.round(monthlyRent);
}

// The due day to use for a resident: their own billingDay if set, else the
// join day for anchored cycles, else the hostel's rent-due day.
export function residentDueDay(
  r: { billingMode: string; billingDay: number | null; admissionDate: Date | null },
  hostelDay: number
): number {
  if (r.billingDay) return Math.min(r.billingDay, 28);
  if (r.billingMode === "ANCHORED" && r.admissionDate) return Math.min(r.admissionDate.getDate(), 28);
  return Math.min(hostelDay || 10, 28);
}

// Generates rent charges for every active resident up to the current cycle.
// Honours each resident's billing mode:
//   • CALENDAR — one charge per calendar month (the first pro-rated if chosen),
//     due on the resident's billing day (or the hostel's).
//   • ANCHORED — one full charge per personal monthly cycle starting on the
//     join day (12th → 12th → 12th …).
// Returns the number of new charges created. Idempotent — safe to run often.
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

  const hostelRows = await prisma.hostel.findMany({
    where: { id: { in: [...new Set(residents.map((r) => r.hostelId))] } },
    select: { id: true, rentDueDay: true },
  });
  const dueDayOf = new Map(hostelRows.map((h) => [h.id, h.rentDueDay]));

  // Whether cycle month (y,m) has started as of now.
  const started = (y: number, m0: number) =>
    y < now.getFullYear() || (y === now.getFullYear() && m0 <= now.getMonth());

  let created = 0;
  for (const r of residents) {
    const admission = r.admissionDate;
    if (!admission) continue;
    const rent = Number(r.monthlyRent);
    const hostelDay = dueDayOf.get(r.hostelId) ?? 10;
    const dueDay = residentDueDay(r, hostelDay);

    const ensure = async (y: number, m: number, amount: number, due: number) => {
      const before = await prisma.rentCharge.findUnique({
        where: { residentId_periodYear_periodMonth: { residentId: r.id, periodYear: y, periodMonth: m } },
      });
      if (before) return;
      await ensureRentCharge(prisma, { hostelId: r.hostelId, residentId: r.id, year: y, month: m, amount, dueDay: due });
      created++;
    };

    if (r.billingMode === "ANCHORED") {
      const anchorDay = Math.min(admission.getDate(), 28);
      for (let k = 0; ; k++) {
        const cs = new Date(admission.getFullYear(), admission.getMonth() + k, 1);
        if (!started(cs.getFullYear(), cs.getMonth())) break;
        await ensure(cs.getFullYear(), cs.getMonth() + 1, rent, anchorDay);
      }
    } else {
      const firstY = admission.getFullYear();
      const firstM = admission.getMonth() + 1;
      const cursor = new Date(firstY, firstM - 1, 1);
      while (started(cursor.getFullYear(), cursor.getMonth())) {
        const y = cursor.getFullYear();
        const m = cursor.getMonth() + 1;
        const isFirst = y === firstY && m === firstM;
        const amount = isFirst && r.proratedFirst ? proratedFirstAmount(admission, rent) : rent;
        await ensure(y, m, amount, dueDay);
        cursor.setMonth(cursor.getMonth() + 1);
      }
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
