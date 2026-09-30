// Client-side mirror of the server's first-month rent rules (server/src/lib/rent.ts)
// so the admission form previews exactly what will be charged.

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Aug 2026" for a charge period.
export function periodLabel(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`;
}

// Calendar day of a date / datetime-local input value ("2026-08-20" or
// "2026-08-20T14:30"), read as written — no time-zone shifting.
function parseDay(value: string): { y: number; m0: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || "");
  return m ? { y: Number(m[1]), m0: Number(m[2]) - 1, d: Number(m[3]) } : null;
}

export interface FirstMonthPlan {
  monthLabel: string;   // "Aug 2026"
  monthShort: string;   // "Aug"
  fromDay: number;
  toDay: number;
  days: number;
  daysInMonth: number;
  perDay: number;
  prorated: boolean;    // billed for the days stayed only
  amount: number;       // first charge
  dueDate: Date;        // when that first charge falls due
}

// What the first monthly charge will be and when it's due. Calendar cycles
// can be pro-rated (monthly rent ÷ days in the month × days stayed) and are
// due on the first rent day on/after joining; anchored cycles are a full month
// due on the join day.
export function firstMonthPlan(o: { admissionDate: string; monthlyRent: number; billingMode: string; proratedFirst: boolean; dueDay?: number }): FirstMonthPlan | null {
  const p = parseDay(o.admissionDate);
  if (!p) return null;
  const rent = o.monthlyRent || 0;
  const dim = new Date(p.y, p.m0 + 1, 0).getDate();
  const days = dim - p.d + 1;
  const prorated = o.billingMode === "CALENDAR" && o.proratedFirst && p.d > 1;
  const dueDay = Math.min(o.dueDay || 5, 28);
  const dueDate = o.billingMode === "ANCHORED"
    ? new Date(p.y, p.m0, p.d)
    : p.d <= dueDay ? new Date(p.y, p.m0, dueDay) : new Date(p.y, p.m0 + 1, dueDay);
  return {
    monthLabel: `${MONTHS[p.m0]} ${p.y}`,
    monthShort: MONTHS[p.m0],
    fromDay: p.d,
    toDay: dim,
    days,
    daysInMonth: dim,
    perDay: rent / dim,
    prorated,
    amount: prorated ? Math.round((rent * days) / dim) : Math.round(rent),
    dueDate,
  };
}

// "₨709.68" — the daily rate, kept to 2 decimals so days × rate visibly adds up.
export function formatPerDay(n: number): string {
  return "₨ " + n.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// The window rent is paid in each month: "1st–5th" (or "the 1st").
export function dueWindow(dueDay: number): string {
  const d = Math.min(dueDay || 5, 28);
  return d <= 1 ? "on the 1st" : `1st–${ordinal(d)}`;
}

// "10th", "1st", "22nd"
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
