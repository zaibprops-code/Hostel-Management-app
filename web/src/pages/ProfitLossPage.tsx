import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import { useHostels } from "../context/HostelContext";
import { useApi, withQuery } from "../lib/useApi";
import { PageHeader, Card, PageLoader, EmptyState } from "../components/ui";
import { StatCard, CHART_COLORS } from "../components/stats";
import { formatPKR, titleCase } from "../lib/format";
import { IconChart } from "../components/icons";

export default function ProfitLossPage() {
  const { scopeParam } = useHostels();
  const { data: pl, loading } = useApi<any>(withQuery("/reports/profit-loss", scopeParam), [scopeParam]);
  const { data: comparison } = useApi<any[]>(withQuery("/reports/hostel-comparison", scopeParam), [scopeParam]);

  if (loading) return <PageLoader />;
  if (!pl) return <EmptyState title="No financial data" />;

  return (
    <div>
      <PageHeader title="Profit & Loss" subtitle="Security deposits, owner investment & loans are excluded from profit." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        <StatCard label="Total Revenue" value={formatPKR(pl.totalRevenue)} sub={`Rent ${formatPKR(pl.rentRevenue)} + Other ${formatPKR(pl.otherIncome)}`} icon={<IconChart />} accent="emerald" />
        <StatCard label="Total Expenses" value={formatPKR(pl.totalExpenses)} icon={<IconChart />} accent="rose" />
        <StatCard label="Net Profit" value={formatPKR(pl.netProfit)} icon={<IconChart />} accent={pl.netProfit >= 0 ? "emerald" : "rose"} />
        <StatCard label="Profit Margin" value={`${pl.profitMargin}%`} icon={<IconChart />} accent="brand" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-semibold text-slate-800 mb-4">Expenses by Category</h3>
          {!pl.expenseByCategory.length ? <p className="text-sm text-slate-400">No expenses.</p> : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={pl.expenseByCategory} layout="vertical" margin={{ left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v / 1000}k`} />
                <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={120} tickFormatter={titleCase} />
                <Tooltip formatter={(v: number) => formatPKR(v)} />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                  {pl.expenseByCategory.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold text-slate-800 mb-4">Statement Summary</h3>
          <div className="space-y-2 text-sm">
            <Row label="Rent revenue" value={pl.rentRevenue} />
            <Row label="Other income" value={pl.otherIncome} />
            <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold"><span>Total Revenue</span><span className="text-emerald-600">{formatPKR(pl.totalRevenue)}</span></div>
            <div className="pt-2" />
            {pl.expenseByCategory.slice(0, 8).map((e: any) => <Row key={e.category} label={titleCase(e.category)} value={-e.amount} />)}
            <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold"><span>Total Expenses</span><span className="text-rose-600">{formatPKR(pl.totalExpenses)}</span></div>
            <div className="flex justify-between border-t-2 border-slate-800 pt-2 mt-2 text-lg font-bold"><span>Net Profit</span><span className={pl.netProfit >= 0 ? "text-emerald-600" : "text-rose-600"}>{formatPKR(pl.netProfit)}</span></div>
          </div>
        </Card>
      </div>

      {comparison && comparison.length > 1 && (
        <Card className="p-5 mt-4">
          <h3 className="font-semibold text-slate-800 mb-4">Hostel Comparison</h3>
          {/* Mobile: cards */}
          <div className="lg:hidden space-y-2">
            {comparison.map((c) => (
              <div key={c.hostel} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-800">{c.hostel}</p>
                  <span className={c.profit >= 0 ? "font-bold text-emerald-600" : "font-bold text-rose-600"}>{formatPKR(c.profit)}</span>
                </div>
                <div className="mt-1 flex justify-between text-xs text-slate-400">
                  <span>Rev {formatPKR(c.revenue)}</span>
                  <span>Exp {formatPKR(c.expenses)}</span>
                  <span>{c.occupancyRate}% full</span>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400"><th className="py-2">Hostel</th><th>Revenue</th><th>Expenses</th><th>Profit</th><th>Occupancy</th></tr></thead>
              <tbody>
                {comparison.map((c) => (
                  <tr key={c.hostel} className="border-t border-slate-100">
                    <td className="py-2 font-medium text-slate-700">{c.hostel}</td>
                    <td className="text-emerald-600">{formatPKR(c.revenue)}</td>
                    <td className="text-rose-600">{formatPKR(c.expenses)}</td>
                    <td className={c.profit >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>{formatPKR(c.profit)}</td>
                    <td>{c.occupancyRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return <div className="flex justify-between"><span className="text-slate-500">{label}</span><span className={value < 0 ? "text-rose-600" : "text-slate-700"}>{formatPKR(Math.abs(value))}</span></div>;
}
