import { useState } from "react";
import { api, apiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useHostels } from "../context/HostelContext";
import { useApi, withQuery } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, MoneyInput, NumberInput, Select, ErrorText, PageLoader, EmptyState } from "../components/ui";
import { formatPKR, formatDate, titleCase } from "../lib/format";
import { IconStaff, IconPlus } from "../components/icons";

const TYPES = ["MANAGER", "KITCHEN", "CLEANER", "SECURITY", "MAINTENANCE", "ACCOUNTANT", "OTHER"];

export default function StaffPage() {
  const { can } = useAuth();
  const { hostels, scopeParam } = useHostels();
  const { data, loading, refetch } = useApi<any[]>(withQuery("/staff", scopeParam), [scopeParam]);
  const [open, setOpen] = useState(false);
  const [salary, setSalary] = useState<null | any>(null);
  const [form, setForm] = useState<any>({ hostelId: "", name: "", type: "KITCHEN", phone: "", cnic: "", joiningDate: new Date().toISOString().slice(0, 10), monthlySalary: 0 });
  const [salForm, setSalForm] = useState<any>({ periodMonth: new Date().getMonth() + 1, periodYear: new Date().getFullYear(), advance: 0, deductions: 0, netPaid: 0 });
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true); setError("");
    try { await api.post("/staff", { ...form, hostelId: form.hostelId || hostels[0]?.id }); setOpen(false); await refetch(); } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }
  function openSalary(s: any) { setSalForm({ ...salForm, netPaid: s.monthlySalary }); setSalary(s); }
  async function paySalary() {
    setSaving(true); setError("");
    try { await api.post(`/staff/${salary.id}/salary`, salForm); setSalary(null); await refetch(); } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }

  if (loading) return <PageLoader />;

  return (
    <div>
      <PageHeader title="Staff" subtitle="Team & salaries"
        actions={can("staff.manage") && <Button onClick={() => { setForm({ ...form, hostelId: hostels[0]?.id ?? "" }); setOpen(true); }}><IconPlus className="h-4 w-4" /> New Staff</Button>} />

      {!data?.length ? <EmptyState title="No staff yet" icon={<IconStaff className="h-12 w-12" />} /> : (
        <Card className="overflow-hidden">
          <div className="lg:hidden divide-y divide-slate-100">
            {data.map((s) => (
              <div key={s.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-800 truncate">{s.name}</p>
                  <span className="font-semibold text-slate-700 shrink-0">{formatPKR(s.monthlySalary)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <p className="text-xs text-slate-400">{titleCase(s.type)} · {s.phone ?? "—"}</p>
                  {can("staff.manage") && <button onClick={() => openSalary(s)} className="text-brand-600 text-sm font-medium">Pay Salary</button>}
                </div>
              </div>
            ))}
          </div>
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50"><tr><th className="th">Name</th><th className="th">Role</th><th className="th">Phone</th><th className="th">Joined</th><th className="th">Salary</th><th className="th">Hostel</th><th className="th"></th></tr></thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="td font-medium text-slate-800">{s.name}</td>
                    <td className="td">{titleCase(s.type)}</td>
                    <td className="td">{s.phone ?? "—"}</td>
                    <td className="td">{formatDate(s.joiningDate)}</td>
                    <td className="td font-semibold">{formatPKR(s.monthlySalary)}</td>
                    <td className="td">{s.hostel}</td>
                    <td className="td text-right">{can("staff.manage") && <button onClick={() => openSalary(s)} className="text-brand-600 hover:underline text-sm">Pay Salary</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New Staff Member">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Select label="Hostel" value={form.hostelId} onChange={(e) => setForm({ ...form, hostelId: e.target.value })}>{hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</Select>
          <Select label="Role" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select>
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="CNIC" value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} />
          <Input label="Joining date" type="date" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} />
          <MoneyInput label="Monthly salary" value={form.monthlySalary} onChange={(n) => setForm({ ...form, monthlySalary: n })} />
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={saving} onClick={save}>Save</Button></div>
      </Modal>

      <Modal open={!!salary} onClose={() => setSalary(null)} title={salary ? `Pay Salary — ${salary.name}` : ""}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <NumberInput label="Month" value={salForm.periodMonth} onChange={(n) => setSalForm({ ...salForm, periodMonth: n })} />
          <NumberInput label="Year" value={salForm.periodYear} onChange={(n) => setSalForm({ ...salForm, periodYear: n })} />
          <MoneyInput label="Advance" value={salForm.advance} onChange={(n) => setSalForm({ ...salForm, advance: n })} />
          <MoneyInput label="Deductions" value={salForm.deductions} onChange={(n) => setSalForm({ ...salForm, deductions: n })} />
          <div className="lg:col-span-2"><MoneyInput label="Net paid" value={salForm.netPaid} onChange={(n) => setSalForm({ ...salForm, netPaid: n })} /></div>
        </div>
        <p className="text-xs text-slate-400 mt-2">This also records a salary expense against the hostel.</p>
        <ErrorText>{error}</ErrorText>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setSalary(null)}>Cancel</Button><Button loading={saving} onClick={paySalary}>Record Payment</Button></div>
      </Modal>
    </div>
  );
}
