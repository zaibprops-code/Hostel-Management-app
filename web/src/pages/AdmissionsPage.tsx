import { useEffect, useState } from "react";
import { api, apiError } from "../lib/api";
import { useHostels } from "../context/HostelContext";
import { useApi, withQuery } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, Select, ErrorText, PageLoader, EmptyState } from "../components/ui";
import { formatPKR, formatDate } from "../lib/format";
import { IconAdmission, IconPlus } from "../components/icons";

export default function AdmissionsPage() {
  const { hostels, scopeParam } = useHostels();
  const { data: admissions, loading, refetch } = useApi<any[]>("/admissions");
  const [open, setOpen] = useState(false);
  const [reserved, setReserved] = useState<any[]>([]);
  const [beds, setBeds] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({ residentId: "", bedId: "", admissionDate: new Date().toISOString().slice(0, 10), monthlyRent: 0, depositAmount: 0, rentDueDay: 1, contractMonths: 12, foodPlanId: "", initialPayment: 0, paymentMethod: "CASH" });

  async function openModal() {
    setError("");
    try {
      const [res, bedRes, planRes] = await Promise.all([
        api.get(withQuery("/residents", scopeParam, "status=RESERVED", "pageSize=200")),
        api.get(withQuery("/structure/available-beds", scopeParam)),
        api.get("/food/plans").catch(() => ({ data: [] })),
      ]);
      setReserved(res.data.data); setBeds(bedRes.data); setPlans(planRes.data);
      setOpen(true);
    } catch (e) { setError(apiError(e)); }
  }

  // Auto-fill rent/deposit from the selected bed.
  useEffect(() => {
    const bed = beds.find((b) => b.id === form.bedId);
    if (bed) setForm((f: any) => ({ ...f, monthlyRent: bed.monthlyRent, depositAmount: f.depositAmount || bed.monthlyRent }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.bedId]);

  async function submit() {
    setSaving(true); setError("");
    try {
      const payload = { ...form, foodPlanId: form.foodPlanId || undefined };
      await api.post("/admissions", payload);
      setOpen(false); await refetch();
    } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }

  if (loading) return <PageLoader />;

  return (
    <div>
      <PageHeader title="Admissions" subtitle="Check-in workflow" actions={<Button onClick={openModal}><IconPlus className="h-4 w-4" /> New Admission</Button>} />

      {!admissions?.length ? (
        <EmptyState title="No admissions yet" message="Start by reserving a resident, then admit them to a bed." icon={<IconAdmission className="h-12 w-12" />} />
      ) : (
        <Card className="overflow-hidden">
          <div className="lg:hidden divide-y divide-slate-100">
            {admissions.map((a) => (
              <div key={a.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-800 truncate">{a.resident.fullName}</p>
                  <span className="font-semibold text-slate-700 shrink-0">{formatPKR(a.monthlyRent)}/mo</span>
                </div>
                <p className="text-xs text-slate-400 truncate mt-0.5">{a.room} · {a.bed} · {formatDate(a.admissionDate)}</p>
              </div>
            ))}
          </div>
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50"><tr>
                <th className="th">Resident</th><th className="th">Hostel</th><th className="th">Room / Bed</th>
                <th className="th">Rent</th><th className="th">Deposit</th><th className="th">Date</th>
              </tr></thead>
              <tbody>
                {admissions.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="td font-medium text-slate-800">{a.resident.fullName}</td>
                    <td className="td">{a.hostel.name}</td>
                    <td className="td">{a.room} · {a.bed}</td>
                    <td className="td">{formatPKR(a.monthlyRent)}</td>
                    <td className="td">{formatPKR(a.depositAmount)}</td>
                    <td className="td">{formatDate(a.admissionDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New Admission" wide>
        {reserved.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">No reserved residents. Create a resident first (they start as Reserved).</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Select label="Resident (Reserved)" value={form.residentId} onChange={(e) => setForm({ ...form, residentId: e.target.value })}>
              <option value="">Select…</option>
              {reserved.map((r) => <option key={r.id} value={r.id}>{r.fullName} · {r.hostel.name}</option>)}
            </Select>
            <Select label="Available Bed" value={form.bedId} onChange={(e) => setForm({ ...form, bedId: e.target.value })}>
              <option value="">Select…</option>
              {beds.map((b) => <option key={b.id} value={b.id}>{b.roomName} · {b.label} ({formatPKR(b.monthlyRent)})</option>)}
            </Select>
            <Input label="Admission date" type="date" value={form.admissionDate} onChange={(e) => setForm({ ...form, admissionDate: e.target.value })} />
            <Input label="Rent due day" type="number" value={form.rentDueDay} onChange={(e) => setForm({ ...form, rentDueDay: +e.target.value })} />
            <Input label="Monthly rent" type="number" value={form.monthlyRent} onChange={(e) => setForm({ ...form, monthlyRent: +e.target.value })} />
            <Input label="Security deposit" type="number" value={form.depositAmount} onChange={(e) => setForm({ ...form, depositAmount: +e.target.value })} />
            <Input label="Contract (months)" type="number" value={form.contractMonths} onChange={(e) => setForm({ ...form, contractMonths: +e.target.value })} />
            <Select label="Food plan" value={form.foodPlanId} onChange={(e) => setForm({ ...form, foodPlanId: e.target.value })}>
              <option value="">None</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({formatPKR(p.monthlyCost)})</option>)}
            </Select>
            <Input label="Initial payment" type="number" value={form.initialPayment} onChange={(e) => setForm({ ...form, initialPayment: +e.target.value })} />
            <Select label="Payment method" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
              {["CASH", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CARD"].map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}
            </Select>
          </div>
        )}
        <ErrorText>{error}</ErrorText>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={saving} disabled={!form.residentId || !form.bedId} onClick={submit}>Admit Resident</Button>
        </div>
      </Modal>
    </div>
  );
}
