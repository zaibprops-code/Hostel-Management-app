import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useHostels } from "../context/HostelContext";
import { useApi, withQuery } from "../lib/useApi";
import { PageHeader, Card, Button, PageLoader } from "../components/ui";
import { formatPKR, titleCase } from "../lib/format";
import { IconReport } from "../components/icons";

function toCsv(rows: Record<string, any>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const body = rows.map((r) => headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","));
  return [headers.join(","), ...body].join("\n");
}
function download(name: string, rows: Record<string, any>[]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const { can } = useAuth();
  const { scopeParam } = useHostels();
  const occ = useApi<any[]>(withQuery("/reports/occupancy", scopeParam), [scopeParam]);
  const rent = useApi<any>(withQuery("/reports/rent-collection", scopeParam), [scopeParam]);
  const income = useApi<any[]>(withQuery("/reports/income", scopeParam), [scopeParam]);
  const expense = useApi<any[]>(withQuery("/reports/expenses", scopeParam), [scopeParam]);
  const residents = useApi<any[]>(withQuery("/reports/residents", scopeParam), [scopeParam]);
  const deposits = useApi<any>(withQuery("/reports/deposits", scopeParam), [scopeParam]);

  if (occ.loading) return <PageLoader />;

  return (
    <div>
      <PageHeader title="Reports" subtitle="Operational & financial reports" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Occupancy" onExport={() => download("occupancy.csv", occ.data ?? [])}>
          <Table rows={occ.data ?? []} cols={[["hostel", "Hostel"], ["totalBeds", "Total"], ["occupiedBeds", "Occupied"], ["availableBeds", "Available"], ["occupancyRate", "%"]]} />
        </Section>

        <Section title="Rent Collection">
          {rent.data && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-sm">
              <Kpi label="Expected" value={formatPKR(rent.data.expected)} />
              <Kpi label="Collected" value={formatPKR(rent.data.collected)} good />
              <Kpi label="Outstanding" value={formatPKR(rent.data.outstanding)} bad />
              <Kpi label="Overdue" value={formatPKR(rent.data.overdue)} bad />
              <div className="col-span-2"><Kpi label="Collection Rate" value={`${rent.data.collectionRate}%`} /></div>
            </div>
          )}
        </Section>

        <Section title="Income by Category" onExport={() => download("income.csv", income.data ?? [])}>
          <CatTable rows={income.data ?? []} />
        </Section>

        <Section title="Expenses by Category" onExport={() => download("expenses.csv", expense.data ?? [])}>
          <CatTable rows={expense.data ?? []} />
        </Section>

        <Section title="Residents by Status" onExport={() => download("residents.csv", residents.data ?? [])}>
          <Table rows={residents.data ?? []} cols={[["status", "Status"], ["count", "Count"]]} format={{ status: titleCase }} />
        </Section>

        <Section title="Security Deposits">
          {deposits.data && (
            <div className="grid grid-cols-1 gap-3 text-sm">
              <Kpi label="Total Held" value={formatPKR(deposits.data.totalHeld)} />
              <Kpi label="Total Refunds" value={formatPKR(deposits.data.totalRefunds)} good />
              <Kpi label="Total Deductions" value={formatPKR(deposits.data.totalDeductions)} bad />
            </div>
          )}
        </Section>
      </div>
      {!can("finance.viewProfit") && <p className="text-xs text-slate-400 mt-4">Profit & Loss reporting requires additional permission.</p>}
    </div>
  );
}

function Section({ title, children, onExport }: { title: string; children: React.ReactNode; onExport?: () => void }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2"><IconReport className="h-4 w-4 text-brand-500" /> {title}</h3>
        {onExport && <Button variant="ghost" onClick={onExport} className="text-xs py-1">Export CSV</Button>}
      </div>
      {children}
    </Card>
  );
}
function Kpi({ label, value, good, bad }: { label: string; value: string; good?: boolean; bad?: boolean }) {
  return <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-400">{label}</p><p className={`text-lg font-bold ${good ? "text-emerald-600" : bad ? "text-rose-600" : "text-slate-800"}`}>{value}</p></div>;
}
function Table({ rows, cols, format = {} }: { rows: any[]; cols: [string, string][]; format?: Record<string, (v: any) => string> }) {
  if (!rows.length) return <p className="text-sm text-slate-400">No data.</p>;
  return (
    <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead><tr className="text-left text-xs text-slate-400">{cols.map(([, l]) => <th key={l} className="py-2">{l}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-slate-100">{cols.map(([k]) => <td key={k} className="py-2">{format[k] ? format[k](r[k]) : r[k]}</td>)}</tr>)}</tbody>
    </table></div>
  );
}
function CatTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <p className="text-sm text-slate-400">No data.</p>;
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.category} className="flex items-center justify-between text-sm">
          <span className="text-slate-600">{titleCase(r.category)}</span>
          <span className="font-medium text-slate-800">{formatPKR(r.amount)}</span>
        </div>
      ))}
      <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-sm"><span>Total</span><span>{formatPKR(total)}</span></div>
    </div>
  );
}
