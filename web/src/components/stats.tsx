import { ReactNode } from "react";
import clsx from "clsx";
import { Card } from "./ui";

export function StatCard({ label, value, sub, icon, accent = "brand" }: { label: string; value: ReactNode; sub?: string; icon?: ReactNode; accent?: "brand" | "emerald" | "amber" | "rose" | "violet" | "slate" }) {
  const accents: Record<string, string> = {
    brand: "bg-brand-50 text-brand-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
    violet: "bg-violet-50 text-violet-600",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-slate-400 truncate">{label}</p>
          <p className="mt-1.5 sm:mt-2 text-xl sm:text-2xl font-bold text-slate-900 truncate">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-400 truncate">{sub}</p>}
        </div>
        {icon && <div className={clsx("hidden sm:grid h-10 w-10 rounded-lg place-items-center shrink-0", accents[accent])}>{icon}</div>}
      </div>
    </Card>
  );
}

// Categorical palette (accessible, consistent across the app)
export const CHART_COLORS = ["#325dff", "#00b8a9", "#f59e0b", "#8b5cf6", "#ef4444", "#10b981", "#ec4899", "#0ea5e9", "#f97316", "#64748b"];
