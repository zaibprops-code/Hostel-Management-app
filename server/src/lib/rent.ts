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
    dueDate?: Date; // overrides dueDay (e.g. a join month due on the next rent day)
    notes?: string;
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
  const dueDate = params.dueDate ?? endOfDay(params.year, params.month - 1, Math.min(params.dueDay, 28));
  return tx.rentCharge.create({
    data: {
      hostelId: params.hostelId,
      residentId: params.residentId,
      periodYear: params.year,
      periodMonth: params.month,
      amount: params.amount,
      dueDate,
      notes: params.notes,
      status: computeStatus(params.amount, 0, 0, dueDate),
    },
  });
}

// Last second of a calendar day (m0 is 0-11; overflow rolls into next year).
function endOfDay(y: number, m0: number, d: number): Date {
  return new Date(y, m0, d, 23, 59, 59);
}

// The calendar day a stored date falls on, as YYYY-MM-DD. Due dates are sent to
// the UI in this form so they never shift a day across time zones.
export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Days in a given month (m is 1-12).
export function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

// Pro-rata for the join month: the resident pays only for the days they stay,
// from the join day to the end of that month (both inclusive). The daily rate
// is the monthly rent spread over the actual days in THAT month, so joining on
// the 20th of a 31-day month at ₨22,000 → 12 days × ₨709.68 = ₨8,516.
export interface ProRata {
  fromDay: number;     // join day
  toDay: number;       // last day of the month
  days: number;        // days billed
  daysInMonth: number;
  perDay: number;      // monthly rent ÷ days in month (unrounded)
  amount: number;      // rounded to whole rupees
}
export function proRata(admissionDate: Date, monthlyRent: number): ProRata {
  const y = admissionDate.getFullYear();
  const m = admissionDate.getMonth() + 1;
  const dim = daysInMonth(y, m);
  const fromDay = admissionDate.getDate();
  const days = dim - fromDay + 1;
  return { fromDay, toDay: dim, days, daysInMonth: dim, perDay: monthlyRent / dim, amount: Math.round((monthlyRent * days) / dim) };
}
export function proratedFirstAmount(admissionDate: Date, monthlyRent: number): number {
  return proRata(admissionDate, monthlyRent).amount;
}
// Human-readable breakdown stored on the pro-rated charge, e.g.
// "Pro-rata: 12 of 31 days (20–31 Aug) × ₨709.68/day".
export function proRataNote(admissionDate: Date, monthlyRent: number): string {
  const p = proRata(admissionDate, monthlyRent);
  const mon = MONTHS[admissionDate.getMonth()];
  const perDay = p.perDay.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const span = p.fromDay === p.toDay ? `${p.fromDay}` : `${p.fromDay}–${p.toDay}`;
  return `Pro-rata: ${p.days} of ${p.daysInMonth} day${p.days === 1 ? "" : "s"} (${span} ${mon}) × ₨${perDay}/day`;
}

// When the very first charge falls due. It is never before the join day:
//   • CALENDAR — the first rent day on/after joining. Join on the 5th with rent
//     due by the 10th → due the 10th; join on the 20th → due the 10th of next
//     month (together with that month's rent). Collecting at admission is
//     optional; if nothing is collected the amount simply waits until then.
//   • ANCHORED — the cycle starts on the join day, so it's due that day.
export function firstChargeDueDate(mode: string, admissionDate: Date, dueDay: number): Date {
  const y = admissionDate.getFullYear();
  const m0 = admissionDate.getMonth();
  const joinDay = admissionDate.getDate();
  if (mode === "ANCHORED") return endOfDay(y, m0, joinDay);
  const day = Math.min(dueDay || 5, 28);
  return joinDay <= day ? endOfDay(y, m0, day) : endOfDay(y, m0 + 1, day);
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
  return Math.min(hostelDay || 5, 28);
}

// Generates rent charges for every current resident (active or serving notice)
// up to the current cycle — including any months missed so far, e.g. after a
// back-dated admission. Honours each resident's billing mode:
//   • CALENDAR — one charge per calendar month (the first pro-rated if chosen),
//     due on the resident's billing day (or the hostel's).
//   • ANCHORED — one full charge per personal monthly cycle starting on the
//     join day (12th → 12th → 12th …).
// Scope it to hostels and/or specific residents. Returns the number of new
// charges created. Idempotent — safe to run often.
export async function generateDueRent(prisma: PrismaClient, hostelIds?: string[], residentIds?: string[]): Promise<number> {
  const now = new Date();
  const residents = await prisma.resident.findMany({
    where: {
      status: { in: ["ACTIVE", "NOTICE_GIVEN"] }, // billed until checkout
      admissionDate: { not: null },
      occupantType: { not: "DAILY" }, // daily guests are billed once for their stay
      ...(hostelIds ? { hostelId: { in: hostelIds } } : {}),
      ...(residentIds ? { id: { in: residentIds } } : {}),
    },
  });
  if (residents.length === 0) return 0;

  const hostelRows = await prisma.hostel.findMany({
    where: { id: { in: [...new Set(residents.map((r) => r.hostelId))] } },
    select: { id: true, rentDueDay: true },
  });
  const dueDayOf = new Map(hostelRows.map((h) => [h.id, h.rentDueDay]));

  // Every existing charge for these residents, fetched once.
  const existing = await prisma.rentCharge.findMany({
    where: { residentId: { in: residents.map((r) => r.id) } },
    select: { id: true, residentId: true, periodYear: true, periodMonth: true, amount: true, discount: true, amountPaid: true, dueDate: true, status: true },
  });
  const key = (rid: string, y: number, m: number) => `${rid}:${y}:${m}`;
  const byPeriod = new Map(existing.map((c) => [key(c.residentId, c.periodYear, c.periodMonth), c]));

  // Whether cycle month (y,m) has started as of now.
  const started = (y: number, m0: number) =>
    y < now.getFullYear() || (y === now.getFullYear() && m0 <= now.getMonth());

  let created = 0;
  for (const r of residents) {
    const admission = r.admissionDate;
    if (!admission) continue;
    const rent = Number(r.monthlyRent);
    const hostelDay = dueDayOf.get(r.hostelId) ?? 5;
    const dueDay = residentDueDay(r, hostelDay);

    const ensure = async (y: number, m: number, amount: number, due: number, extra: { dueDate?: Date; notes?: string } = {}) => {
      if (byPeriod.has(key(r.id, y, m))) return;
      await ensureRentCharge(prisma, { hostelId: r.hostelId, residentId: r.id, year: y, month: m, amount, dueDay: due, ...extra });
      created++;
    };

    const firstY = admission.getFullYear();
    const firstM = admission.getMonth() + 1;
    const firstDue = firstChargeDueDate(r.billingMode, admission, dueDay);

    if (r.billingMode === "ANCHORED") {
      // dueDay is the resident's billing day — the join day unless changed.
      for (let k = 0; ; k++) {
        const cs = new Date(firstY, firstM - 1 + k, 1);
        if (!started(cs.getFullYear(), cs.getMonth())) break;
        await ensure(cs.getFullYear(), cs.getMonth() + 1, rent, dueDay, k === 0 ? { dueDate: firstDue } : {});
      }
    } else {
      const cursor = new Date(firstY, firstM - 1, 1);
      while (started(cursor.getFullYear(), cursor.getMonth())) {
        const y = cursor.getFullYear();
        const m = cursor.getMonth() + 1;
        if (y === firstY && m === firstM) {
          const pr = r.proratedFirst && admission.getDate() > 1;
          await ensure(y, m, pr ? proratedFirstAmount(admission, rent) : rent, dueDay, {
            dueDate: firstDue,
            notes: pr ? proRataNote(admission, rent) : undefined,
          });
        } else {
          await ensure(y, m, rent, dueDay);
        }
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }

    // Repair: a join-month charge must never fall due before the resident
    // joined (older records were due on the month's rent day even when they
    // joined after it, so they showed "overdue" from day one).
    const joinCharge = byPeriod.get(key(r.id, firstY, firstM));
    if (joinCharge && joinCharge.dueDate < new Date(firstY, firstM - 1, admission.getDate()) && joinCharge.status !== "WAIVED") {
      await prisma.rentCharge.update({
        where: { id: joinCharge.id },
        data: {
          dueDate: firstDue,
          status: computeStatus(Number(joinCharge.amount), Number(joinCharge.discount), Number(joinCharge.amountPaid), firstDue),
        },
      });
    }

    // Sweep any advance credit (money paid but not yet tied to a charge) onto
    // the resident's oldest unpaid months — so an overpayment or a pro-rated
    // join month automatically reduces what's due next.
    await applyResidentAdvances(prisma, r.id);
  }
  return created;
}

// Re-date the still-unpaid rent charges of these residents after their due
// day changed (the hostel's "rent due by" day, or the resident's own terms):
// each open month moves to the new due day — a join month to the first due
// day on/after joining — and its status is recomputed. Paid months keep their
// history. Returns the number of charges moved.
export async function redateOpenCharges(db: Tx, where: { hostelId?: string; residentId?: string }): Promise<number> {
  const residents = await db.resident.findMany({
    where: {
      ...(where.hostelId ? { hostelId: where.hostelId } : {}),
      ...(where.residentId ? { id: where.residentId } : {}),
      status: { in: ["ACTIVE", "NOTICE_GIVEN"] },
      admissionDate: { not: null },
      occupantType: { not: "DAILY" },
    },
    include: {
      hostel: { select: { rentDueDay: true } },
      rentCharges: { where: { status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] } } },
    },
  });
  let moved = 0;
  for (const r of residents) {
    const adm = r.admissionDate!;
    const dueDay = residentDueDay(r, r.hostel.rentDueDay);
    for (const c of r.rentCharges) {
      const isJoin = c.periodYear === adm.getFullYear() && c.periodMonth === adm.getMonth() + 1;
      const due = isJoin
        ? firstChargeDueDate(r.billingMode, adm, dueDay)
        : endOfDay(c.periodYear, c.periodMonth - 1, dueDay);
      if (due.getTime() === c.dueDate.getTime()) continue;
      await db.rentCharge.update({
        where: { id: c.id },
        data: { dueDate: due, status: computeStatus(Number(c.amount), Number(c.discount), Number(c.amountPaid), due) },
      });
      moved++;
    }
  }
  return moved;
}

// Apply a resident's unallocated payment credit ("advance") to their oldest
// unpaid rent charges. Money a resident paid beyond what was owed at the time
// (e.g. they paid a full month but the join month was pro-rated) waits as credit
// on the payment and is pulled forward here. Idempotent: once every payment's
// amount is fully allocated, re-running does nothing.
export async function applyResidentAdvances(db: Tx, residentId: string): Promise<void> {
  const payments = await db.payment.findMany({
    where: { residentId, status: "COMPLETED" },
    orderBy: { paidAt: "asc" },
    include: { allocations: true },
  });
  const pools = payments
    .map((p) => ({ id: p.id, avail: Number(p.amount) - p.allocations.reduce((s, a) => s + Number(a.amount), 0) }))
    .filter((p) => p.avail > 0.001);
  if (!pools.length) return;

  const charges = await db.rentCharge.findMany({
    where: { residentId, status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] } },
    orderBy: [{ periodYear: "asc" }, { periodMonth: "asc" }],
  });

  let pi = 0;
  for (const c of charges) {
    let need = Number(c.amount) - Number(c.discount) - Number(c.amountPaid);
    if (need <= 0.001) continue;
    let applied = 0;
    while (need > 0.001 && pi < pools.length) {
      const pool = pools[pi];
      if (pool.avail <= 0.001) { pi++; continue; }
      const take = Math.min(need, pool.avail);
      await db.paymentAllocation.create({ data: { paymentId: pool.id, rentChargeId: c.id, amount: take } });
      pool.avail -= take;
      need -= take;
      applied += take;
    }
    if (applied > 0) {
      const newPaid = Number(c.amountPaid) + applied;
      await db.rentCharge.update({
        where: { id: c.id },
        data: { amountPaid: newPaid, status: computeStatus(Number(c.amount), Number(c.discount), newPaid, c.dueDate) },
      });
    }
    if (pi >= pools.length) break;
  }
}

// Generate this month's rent charges lazily on read, at most once per hostel per
// month (there is no cron in this deployment). Cheap and idempotent.
const lastRentRun = new Map<string, string>();
const lastOverdueSweep = new Map<string, number>();
export async function catchUpRent(prisma: PrismaClient, hostelIds: string[]): Promise<void> {
  const now = new Date();
  await markOverdue(prisma, hostelIds, now);
  const ym = `${now.getFullYear()}-${now.getMonth() + 1}`;
  const todo = hostelIds.filter((id) => lastRentRun.get(id) !== ym);
  if (todo.length === 0) return;
  for (const id of todo) lastRentRun.set(id, ym); // claim first to avoid double runs
  try { await generateDueRent(prisma, todo); } catch { for (const id of todo) lastRentRun.delete(id); }
}

// A charge's stored status is set when it's created or paid; once its due date
// passes unpaid it must read OVERDUE. Swept at most hourly per hostel.
async function markOverdue(prisma: PrismaClient, hostelIds: string[], now: Date): Promise<void> {
  const todo = hostelIds.filter((id) => now.getTime() - (lastOverdueSweep.get(id) ?? 0) > 3600_000);
  if (todo.length === 0) return;
  for (const id of todo) lastOverdueSweep.set(id, now.getTime());
  try {
    await prisma.rentCharge.updateMany({
      where: { hostelId: { in: todo }, status: "PENDING", dueDate: { lt: now } },
      data: { status: "OVERDUE" },
    });
  } catch { for (const id of todo) lastOverdueSweep.delete(id); }
}

// Summarise a monthly resident's rent cycle for the UI.
export interface RentCycle {
  dueDay: number;
  status: "PAID" | "DUE" | "OVERDUE";
  nextDueDate: string; // YYYY-MM-DD — when the next/most-overdue rent is due
  outstandingMonths: number;
}
export function rentCycle(
  charges: { periodYear: number; periodMonth: number; amount: number; discount: number; amountPaid: number; dueDate?: Date }[],
  dueDay: number,
  now = new Date()
): RentCycle {
  const day = Math.min(dueDay || 5, 28);
  const unpaid = charges
    .filter((c) => c.amount - c.discount - c.amountPaid > 0.001)
    .sort((a, b) => a.periodYear - b.periodYear || a.periodMonth - b.periodMonth);
  if (unpaid.length === 0) {
    // Everything paid — next rent is next month, due by `day`.
    const next = endOfDay(now.getFullYear(), now.getMonth() + 1, day);
    return { dueDay: day, status: "PAID", nextDueDate: ymd(next), outstandingMonths: 0 };
  }
  // The earliest-falling-due unpaid charge (a pro-rated join month can be due
  // on the same day as the month after it).
  const dueOf = (c: (typeof unpaid)[number]) => c.dueDate ?? endOfDay(c.periodYear, c.periodMonth - 1, day);
  const dueBy = unpaid.map(dueOf).reduce((a, b) => (b < a ? b : a));
  return {
    dueDay: day,
    status: now > dueBy ? "OVERDUE" : "DUE",
    nextDueDate: ymd(dueBy),
    outstandingMonths: unpaid.length,
  };
}

// Move `amount` of a resident's unallocated payment credit into their security
// deposit: tie that money to non-rent allocations (so it stops counting as rent
// advance) and record it on the deposit ledger. Used when an overpaid month is
// pro-rated and the extra should be held as deposit rather than credited ahead.
export async function moveCreditToDeposit(tx: any, resident: { id: string; hostelId: string }, amount: number): Promise<void> {
  if (amount <= 0.001) return;
  const payments = await tx.payment.findMany({
    where: { residentId: resident.id, status: "COMPLETED" },
    orderBy: { paidAt: "asc" },
    include: { allocations: true },
  });
  let remaining = amount;
  for (const p of payments) {
    if (remaining <= 0.001) break;
    const avail = Number(p.amount) - p.allocations.reduce((s: number, a: any) => s + Number(a.amount), 0);
    if (avail <= 0.001) continue;
    const take = Math.min(avail, remaining);
    // A null rentChargeId allocation = money applied to something other than rent.
    await tx.paymentAllocation.create({ data: { paymentId: p.id, rentChargeId: null, amount: take } });
    remaining -= take;
  }
  const moved = amount - remaining;
  if (moved <= 0.001) return;
  const existing = await tx.securityDeposit.findUnique({ where: { residentId: resident.id } });
  const dep = existing
    ? await tx.securityDeposit.update({ where: { id: existing.id }, data: { amount: Number(existing.amount) + moved, status: "HELD" } })
    : await tx.securityDeposit.create({ data: { hostelId: resident.hostelId, residentId: resident.id, amount: moved, method: "CASH", status: "HELD" } });
  await tx.depositTransaction.create({ data: { depositId: dep.id, type: "DEPOSIT", amount: moved, reason: "Converted from overpaid rent" } });
}

// Set a rent charge's amount / discount / due date / note. If more is already
// paid against it than the new net, the excess is freed (newest allocations
// first) and goes where `excessTo` says: the security deposit, or advance
// credit that settles the coming months.
export async function resetCharge(
  tx: any,
  resident: { id: string; hostelId: string },
  charge: { id: string; amountPaid: unknown; allocations: { id: string; amount: unknown }[] },
  next: { amount: number; discount: number; dueDate: Date; notes: string | null; excessTo: "deposit" | "credit" }
): Promise<void> {
  const net = Math.max(0, next.amount - next.discount);
  let paid = Number(charge.amountPaid);
  if (paid > net) {
    let excess = paid - net;
    const allocs = [...charge.allocations].sort((a, b) => b.id.localeCompare(a.id));
    for (const a of allocs) {
      if (excess <= 0.001) break;
      const amt = Number(a.amount);
      const cut = Math.min(amt, excess);
      if (cut >= amt - 0.001) await tx.paymentAllocation.delete({ where: { id: a.id } });
      else await tx.paymentAllocation.update({ where: { id: a.id }, data: { amount: amt - cut } });
      excess -= cut;
      paid -= cut;
    }
  }
  const waived = next.discount > 0 && net <= 0.001 && paid <= 0.001;
  await tx.rentCharge.update({
    where: { id: charge.id },
    data: {
      amount: next.amount, discount: next.discount, amountPaid: paid, dueDate: next.dueDate,
      status: waived ? "WAIVED" : computeStatus(next.amount, next.discount, paid, next.dueDate),
      notes: next.notes,
    },
  });
  const freed = Math.max(0, Number(charge.amountPaid) - paid);
  if (freed > 0.001 && next.excessTo !== "credit") {
    // Overpaid rent turns into security deposit — next month stays billable
    // in full (the resident does not get a rent discount for paying early).
    await moveCreditToDeposit(tx, resident, freed);
  } else {
    // Keep it as advance credit against the coming months.
    await applyResidentAdvances(tx, resident.id);
  }
}

// Switch a resident from a join-day (anchored) cycle to calendar months.
// Their latest anchored charge covers join day → join day next month, so it is
// cut at its month's end (e.g. 12–30 Sep = 19 of 30 days); calendar billing
// then starts cleanly next month with no days charged twice. Anything already
// paid above the shortened charge becomes advance credit. A resident already
// on calendar months just gets the new billing day.
export async function switchToCalendar(tx: any, residentId: string, billingDay: number | null = null): Promise<void> {
  const r = await tx.resident.findUnique({ where: { id: residentId } });
  if (!r) return;
  if (r.billingMode !== "ANCHORED") {
    await tx.resident.update({ where: { id: r.id }, data: { billingDay } });
    return;
  }
  const adm: Date | null = r.admissionDate;
  const anchor = Math.min(r.billingDay ?? adm?.getDate() ?? 1, 28);
  const latest = await tx.rentCharge.findFirst({
    where: { residentId: r.id, status: { not: "WAIVED" } },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    include: { allocations: true },
  });
  const isJoin = !!latest && !!adm && latest.periodYear === adm.getFullYear() && latest.periodMonth === adm.getMonth() + 1;
  await tx.resident.update({
    where: { id: r.id },
    data: { billingMode: "CALENDAR", billingDay, ...(isJoin ? { proratedFirst: true } : {}) },
  });
  if (!latest || anchor <= 1) return; // a 1st→1st cycle already matches calendar months
  const dim = daysInMonth(latest.periodYear, latest.periodMonth);
  const days = dim - anchor + 1;
  const base = Number(latest.amount);
  const perDay = (base / dim).toLocaleString("en-US", { maximumFractionDigits: 2 });
  await resetCharge(tx, r, latest, {
    amount: Math.round((base * days) / dim),
    discount: Number(latest.discount),
    dueDate: latest.dueDate,
    notes: `Switched to calendar months: ${days} of ${dim} days (${anchor}–${dim} ${MONTHS[latest.periodMonth - 1]}) × ₨${perDay}/day`,
    excessTo: "credit",
  });
}
