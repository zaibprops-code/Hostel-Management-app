import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Area, AreaChart,
} from "recharts";
import { useAuth } from "../context/AuthContext";
import { useHostels } from "../context/HostelContext";
import { useApi, withQuery } from "../lib/useApi";
import { PageHeader, Card, PageLoader, EmptyState } from "../components/ui";
import { StatCard, CHART_COLORS } from "../components/stats";
import { formatPKR, formatDate, titleCase } from "../lib/format";
import { IconHostel, IconBed, IconResidents, IconMoney, IconExpense, IconChart, IconMaintenance, IconComplaint } from "../components/icons";

interface Dashboard {
  kpis: Record<string, number>;
  recentPayments: { id: string; amount: number; resident: string; method: string; paidAt: string }[];
  recentExpenses: { id: string; amount: number; category: string; vendor?: string; date: string }[];
  charts?: {
    monthlyTrend: { month: string; revenue: number; expenses: number; profit: number }[];
    expenseCategories: { category: string; amount: number }[];
    revenuePerBed: number;
  };
}

export default function DashboardPage() {
  const { user, can } = useAuth();
  const { selected, scopeParam } = useHostels();
  const { data, loading } = useApi<Dashboard>(withQuery("/dashboard", scopeParam), [scopeParam]);

  const k = data?.kpis;
  const occupancyData = useMemo(
    () => (k ? [{ name: "Occupied", value: k.occupiedBeds }, { name: "Available", value: k.availableBeds }, { name: "Other", value: Math.max(0, k.totalBeds - k.occupiedBeds - k.availableBeds) }] : []),
    [k]
  );

  if (loading) return <PageLoader />;
  if (!data || !k) return <EmptyState title="No data yet" />;

  // Brand-new account with no hostels yet — show a friendly getting-started guide.
  if (can("hostels.manage") && k.totalHostels === 0) {
    return (
      <div>
        <PageHeader title={`Welcome, ${user?.name.split(" ")[0]}! 👋`} subtitle="Let's get your hostel set up. Follow these steps in order." />
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { n: 1, to: "/hostels", title: "Add your hostel", desc: "Create your first hostel branch — name, address and monthly building rent.", icon: <IconHostel />, cta: "Go to Hostels" },
            { n: 2, to: "/rooms", title: "Add rooms & beds", desc: "Set up the floors, rooms and beds so you can assign residents to them.", icon: <IconBed />, cta: "Go to Rooms & Beds" },
            { n: 3, to: "/residents", title: "Add residents", desc: "Create resident profiles for the people staying at your hostel.", icon: <IconResidents />, cta: "Go to Residents" },
            { n: 4, to: "/admissions", title: "Admit & collect rent", desc: "Assign a resident to a bed, set their rent and record their first payment.", icon: <IconMoney />, cta: "Go to Admissions" },
          ].map((s) => (
            <Card key={s.n} className="p-5">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 shrink-0 rounded-full bg-brand-600 text-white grid place-items-center font-bold">{s.n}</div>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2">{s.icon} {s.title}</h3>
                  <p className="text-sm text-slate-500 mt-1">{s.desc}</p>
                  <Link to={s.to} className="btn-primary mt-3 inline-flex text-sm">{s.cta} →</Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
        <Card className="p-5 mt-4 bg-brand-50 border-brand-100">
          <p className="text-sm text-brand-800">
            💡 <b>Tip:</b> When you hire a manager, go to <Link to="/users" className="underline font-medium">Users</Link> to create their login and give them access to a hostel. They'll only see their hostel — you see everything.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`Good day, ${user?.name.split(" ")[0]} 👋`}
        subtitle={selected === "all" ? "Company-wide overview" : "Hostel overview"}
      />

      {/* KPI grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {can("hostels.view") && <StatCard label="Hostels" value={k.totalHostels} icon={<IconHostel />} sub={`${k.totalRooms} rooms`} />}
        <StatCard label="Beds" value={`${k.occupiedBeds}/${k.totalBeds}`} sub={`${k.occupancyRate}% occupancy`} icon={<IconBed />} accent="violet" />
        <StatCard label="Active Residents" value={k.activeResidents} sub={`${k.leavingSoon} leaving soon`} icon={<IconResidents />} accent="emerald" />
        <StatCard label="Available Beds" value={k.availableBeds} icon={<IconBed />} accent="slate" />
        <StatCard label="Month Revenue" value={formatPKR(k.monthRevenue)} icon={<IconMoney />} accent="emerald" />
        <StatCard label="Month Expenses" value={formatPKR(k.monthExpenses)} icon={<IconExpense />} accent="rose" />
        {"netProfit" in k && (
          <StatCard label="Net Profit (Month)" value={formatPKR(k.netProfit)} sub={`${k.profitMargin ?? 0}% margin`} icon={<IconChart />} accent={k.netProfit >= 0 ? "emerald" : "rose"} />
        )}
        <StatCard label="Outstanding Rent" value={formatPKR(k.outstandingRent)} sub={`${formatPKR(k.overdueRent)} overdue`} icon={<IconMoney />} accent="amber" />
        <StatCard label="Deposits Held" value={formatPKR(k.depositsHeld)} icon={<IconMoney />} accent="brand" />
        <StatCard label="Collection Rate" value={`${k.collectionRate}%`} icon={<IconChart />} accent="brand" />
        <StatCard label="Pending Maintenance" value={k.pendingMaintenance} icon={<IconMaintenance />} accent="amber" />
        <StatCard label="Open Complaints" value={k.pendingComplaints} icon={<IconComplaint />} accent="rose" />
      </div>

      {/* Charts */}
      <div className="grid gap-4 mt-6 lg:grid-cols-3">
        {data.charts && (
          <Card className="p-5 lg:col-span-2">
            <h3 className="font-semibold text-slate-800 mb-4">Revenue vs Expenses (6 months)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={data.charts.monthlyTrend}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#325dff" stopOpacity={0.3} /><stop offset="95%" stopColor="#325dff" stopOpacity={0} /></linearGradient>
                  <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} /><stop offset="95%" stopColor="#ef4444" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip formatter={(v: number) => formatPKR(v)} />
                <Legend />
                <Area type="monotone" dataKey="revenue" stroke="#325dff" fill="url(#rev)" strokeWidth={2} name="Revenue" />
                <Area type="monotone" dataKey="expenses" stroke="#ef4444" fill="url(#exp)" strokeWidth={2} name="Expenses" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        )}

        <Card className="p-5">
          <h3 className="font-semibold text-slate-800 mb-4">Bed Occupancy</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={occupancyData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>
                {occupancyData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {data.charts && (
          <>
            <Card className="p-5">
              <h3 className="font-semibold text-slate-800 mb-4">Monthly Profit Trend</h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data.charts.monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `${v / 1000}k`} />
                  <Tooltip formatter={(v: number) => formatPKR(v)} />
                  <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} name="Profit" />
                </LineChart>
              </ResponsiveContainer>
            </Card>
            <Card className="p-5 lg:col-span-2">
              <h3 className="font-semibold text-slate-800 mb-4">Expenses by Category</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.charts.expenseCategories.slice(0, 8)} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `${v / 1000}k`} />
                  <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} stroke="#94a3b8" width={110} tickFormatter={titleCase} />
                  <Tooltip formatter={(v: number) => formatPKR(v)} />
                  <Bar dataKey="amount" fill="#325dff" radius={[0, 4, 4, 0]} name="Amount" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </>
        )}
      </div>

      {/* Recent activity */}
      <div className="grid gap-4 mt-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800">Recent Payments</h3>
            {can("payments.view") && <Link to="/payments" className="text-sm text-brand-600 hover:underline">View all</Link>}
          </div>
          {data.recentPayments.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">No payments yet</p> : (
            <div className="divide-y divide-slate-100">
              {data.recentPayments.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{p.resident}</p>
                    <p className="text-xs text-slate-400">{titleCase(p.method)} · {formatDate(p.paidAt)}</p>
                  </div>
                  <span className="text-sm font-semibold text-emerald-600">{formatPKR(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800">Recent Expenses</h3>
            {can("expenses.view") && <Link to="/expenses" className="text-sm text-brand-600 hover:underline">View all</Link>}
          </div>
          {data.recentExpenses.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">No expenses yet</p> : (
            <div className="divide-y divide-slate-100">
              {data.recentExpenses.map((e) => (
                <div key={e.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{titleCase(e.category)}</p>
                    <p className="text-xs text-slate-400">{e.vendor ?? "—"} · {formatDate(e.date)}</p>
                  </div>
                  <span className="text-sm font-semibold text-rose-600">{formatPKR(e.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
