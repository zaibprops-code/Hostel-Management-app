import { formatPKR, formatDate } from "../lib/format";
import { FirstMonthPlan, formatPerDay, ordinal, dueWindow } from "../lib/rent";

// Live preview of a new resident's first rent charge: the pro-rata breakdown
// (or full month), when it falls due, and what follows each month.
export function FirstMonthSummary({ plan, monthlyRent, billingMode, dueDay }: { plan: FirstMonthPlan | null; monthlyRent: number; billingMode: string; dueDay: number }) {
  if (!plan) return null;
  const rent = monthlyRent || 0;
  const joinedAfterRentDay = billingMode === "CALENDAR" && plan.fromDay > Math.min(dueDay, 28);
  return (
    <div className="rounded-xl bg-brand-50 p-3 text-sm space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-slate-600">First month · {plan.monthLabel}</span>
        <span className="font-bold text-brand-700">{formatPKR(plan.amount)}</span>
      </div>
      <p className="text-xs text-slate-500">
        {plan.prorated
          ? <>Only the days they stay: <b className="text-slate-700">{plan.days} of {plan.daysInMonth} days</b> ({plan.fromDay === plan.toDay ? plan.fromDay : `${plan.fromDay}–${plan.toDay}`} {plan.monthShort}) × {formatPerDay(plan.perDay)}/day</>
          : billingMode === "ANCHORED"
            ? <>Full month, {plan.fromDay} {plan.monthShort} → {plan.fromDay} next month.</>
            : <>Full month's rent for {plan.monthLabel}.</>}
      </p>
      <p className="text-xs text-slate-500">
        Due by <b className="text-slate-700">{formatDate(plan.dueDate)}</b>
        {joinedAfterRentDay ? ` — joined after this month's rent day, so it's due with next month's rent.` : "."}
      </p>
      <p className="text-xs text-slate-500 border-t border-brand-100 pt-1.5">
        {billingMode === "ANCHORED"
          ? `Then ${formatPKR(rent)} every month on the ${ordinal(plan.fromDay)}.`
          : `Then ${formatPKR(rent)} every month, due ${dueWindow(dueDay)} of the month.`}
      </p>
    </div>
  );
}

// Under the "rent collected now" field: collecting at admission is optional —
// say what happens either way and offer one-tap amounts.
export function FirstPaymentHint({ plan, collected, onChange }: { plan: FirstMonthPlan | null; collected: number; onChange: (n: number) => void }) {
  if (!plan) return null;
  const amt = collected || 0;
  const chip = "rounded-lg border px-2.5 py-1 text-xs font-medium";
  const on = "border-brand-400 text-brand-700 bg-brand-50";
  const off = "border-slate-200 text-slate-600 hover:border-brand-400 hover:text-brand-600";
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onChange(plan.amount)} className={`${chip} ${amt === plan.amount ? on : off}`}>Collect now: {formatPKR(plan.amount)}</button>
        <button type="button" onClick={() => onChange(0)} className={`${chip} ${amt === 0 ? on : off}`}>Collect later</button>
      </div>
      <p className="text-xs text-slate-500">
        {amt <= 0
          ? `Nothing collected now — ${formatPKR(plan.amount)} stays due by ${formatDate(plan.dueDate)}.`
          : amt < plan.amount
            ? `${formatPKR(amt)} collected now; ${formatPKR(plan.amount - amt)} still due by ${formatDate(plan.dueDate)}.`
            : amt > plan.amount
              ? `First month fully paid; the extra ${formatPKR(amt - plan.amount)} is kept as advance for the coming months.`
              : "First month fully paid."}
      </p>
    </div>
  );
}
