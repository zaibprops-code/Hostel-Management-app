import { useState } from "react";
import { api, apiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useApi } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, Select, Textarea, ErrorText, PageLoader, StatusBadge, EmptyState } from "../components/ui";
import { StatCard } from "../components/stats";
import { formatPKR, formatDate, titleCase } from "../lib/format";
import { IconMoney, IconBed, IconNotice } from "../components/icons";

export default function PortalPage() {
  const { user, logout } = useAuth();
  const me = useApi<any>("/portal/me");
  const notices = useApi<any[]>("/portal/notices");
  const requests = useApi<any>("/portal/requests");
  const [modal, setModal] = useState<null | "complaint" | "maintenance">(null);
  const [form, setForm] = useState<any>({ category: "FOOD", subject: "", description: "", title: "", priority: "MEDIUM" });
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true); setError("");
    try {
      if (modal === "complaint") await api.post("/portal/complaints", { category: form.category, subject: form.subject, description: form.description });
      else await api.post("/portal/maintenance", { title: form.title, description: form.description, priority: form.priority });
      setModal(null); await requests.refetch();
    } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }

  if (me.loading) return <PageLoader />;
  if (me.error || !me.data) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
        <Card className="p-8 text-center max-w-sm">
          <p className="text-4xl mb-2">🏨</p>
          <h2 className="font-semibold text-slate-800">Resident Portal</h2>
          <p className="text-sm text-slate-500 mt-1">{me.error ?? "No resident profile is linked to your account."}</p>
          <Button variant="secondary" className="mt-4" onClick={logout}>Logout</Button>
        </Card>
      </div>
    );
  }

  const r = me.data;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2"><span className="text-2xl">🏨</span><span className="font-bold text-slate-800">{r.hostel.name}</span></div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500 hidden lg:block">{user?.name}</span>
          <Button variant="secondary" onClick={logout}>Logout</Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 lg:p-8">
        <PageHeader title={`Hello, ${r.fullName.split(" ")[0]} 👋`} subtitle={`${r.room ?? "—"} · ${r.bed ?? ""} · ${r.floor ?? ""}`} />

        <div className="grid gap-4 sm:grid-cols-3 mb-6">
          <StatCard label="Monthly Rent" value={formatPKR(r.monthlyRent)} icon={<IconMoney />} />
          <StatCard label="Outstanding" value={formatPKR(r.outstanding)} icon={<IconMoney />} accent={r.outstanding > 0 ? "rose" : "emerald"} />
          <StatCard label="Deposit Held" value={formatPKR(r.deposit?.amount ?? 0)} icon={<IconBed />} accent="brand" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h3 className="font-semibold text-slate-800 mb-3">My Rent Status</h3>
            {!r.rentCharges.length ? <p className="text-sm text-slate-400">No rent charges.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-400"><th className="py-2">Period</th><th>Amount</th><th>Balance</th><th>Status</th></tr></thead>
                <tbody>{r.rentCharges.slice(0, 8).map((c: any, i: number) => (
                  <tr key={i} className="border-t border-slate-100"><td className="py-2">{c.period}</td><td>{formatPKR(c.amount)}</td><td className={c.balance > 0 ? "text-rose-600" : ""}>{formatPKR(c.balance)}</td><td><StatusBadge status={c.status} /></td></tr>
                ))}</tbody>
              </table></div>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800">My Food Plan</h3>
            </div>
            {r.foodPlan ? (
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="font-medium text-slate-700">{r.foodPlan.name}</p>
                <p className="text-sm text-slate-400">{formatPKR(r.foodPlan.monthlyCost)}/month</p>
              </div>
            ) : <p className="text-sm text-slate-400">Not subscribed to a food plan.</p>}
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" onClick={() => { setForm({ ...form, subject: "", description: "" }); setModal("complaint"); }}>Raise Complaint</Button>
              <Button onClick={() => { setForm({ ...form, title: "", description: "" }); setModal("maintenance"); }}>Request Maintenance</Button>
            </div>
          </Card>

          <Card className="p-5 lg:col-span-2">
            <h3 className="font-semibold text-slate-800 mb-3">My Requests</h3>
            {requests.data && (requests.data.complaints.length + requests.data.tickets.length === 0) ? <p className="text-sm text-slate-400">No requests yet.</p> : (
              <div className="space-y-2">
                {requests.data?.complaints.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <div><p className="text-sm font-medium">{c.subject}</p><p className="text-xs text-slate-400">Complaint · {titleCase(c.category)} · {formatDate(c.createdAt)}</p></div>
                    <StatusBadge status={c.status} />
                  </div>
                ))}
                {requests.data?.tickets.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <div><p className="text-sm font-medium">{t.title}</p><p className="text-xs text-slate-400">Maintenance · {formatDate(t.createdAt)}</p></div>
                    <StatusBadge status={t.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5 lg:col-span-2">
            <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2"><IconNotice className="h-4 w-4 text-brand-500" /> Hostel Notices</h3>
            {!notices.data?.length ? <p className="text-sm text-slate-400">No notices.</p> : (
              <div className="space-y-2">
                {notices.data.map((n: any) => (
                  <div key={n.id} className="rounded-lg bg-slate-50 p-3">
                    <p className="font-medium text-slate-700">{n.pinned ? "📌 " : ""}{n.title}</p>
                    <p className="text-sm text-slate-600">{n.body}</p>
                    <p className="text-xs text-slate-400 mt-1">{formatDate(n.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </main>

      <Modal open={modal === "complaint"} onClose={() => setModal(null)} title="Raise a Complaint">
        <div className="space-y-3">
          <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {["ROOMMATE", "NOISE", "FOOD", "CLEANLINESS", "STAFF_BEHAVIOR", "MAINTENANCE", "SECURITY", "OTHER"].map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
          </Select>
          <Input label="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          <Textarea label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button loading={saving} onClick={submit}>Submit</Button></div>
        </div>
      </Modal>

      <Modal open={modal === "maintenance"} onClose={() => setModal(null)} title="Request Maintenance">
        <div className="space-y-3">
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Select label="Priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>{["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}</Select>
          <Textarea label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button loading={saving} onClick={submit}>Submit</Button></div>
        </div>
      </Modal>
    </div>
  );
}
