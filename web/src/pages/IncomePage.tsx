import { useState } from "react";
import { api, apiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useHostels } from "../context/HostelContext";
import { useApi, withQuery } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, Select, Textarea, ErrorText, PageLoader, EmptyState } from "../components/ui";
import { StatCard } from "../components/stats";
import { formatPKR, formatDate, titleCase } from "../lib/format";
import { IconIncome, IconPlus } from "../components/icons";

const CATEGORIES = ["LATE_FEE", "LAUNDRY", "ELECTRICITY", "EXTRA_FOOD", "DAMAGE_CHARGE", "OTHER"];

export default function IncomePage() {
  const { can } = useAuth();
  const { hostels, scopeParam } = useHostels();
  const [page, setPage] = useState(1);
  const { data, loading, refetch } = useApi<any>(withQuery("/income", scopeParam, `page=${page}`), [page, scopeParam]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ hostelId: "", category: "LATE_FEE", amount: 0, date: new Date().toISOString().slice(0, 10), method: "CASH", notes: "" });
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true); setError("");
    try { await api.post("/income", { ...form, hostelId: form.hostelId || hostels[0]?.id }); setOpen(false); await refetch(); }
    catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }
  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

  return (
    <div>
      <PageHeader title="Income" subtitle="Non-rent revenue streams"
        actions={can("income.manage") && <Button onClick={() => { setForm({ ...form, hostelId: hostels[0]?.id ?? "" }); setOpen(true); }}><IconPlus className="h-4 w-4" /> New Income</Button>} />

      <div className="mb-4"><StatCard label="Total Income (non-rent)" value={formatPKR(data?.totalAmount)} icon={<IconIncome />} accent="emerald" /></div>

      {loading ? <PageLoader /> : !data?.data.length ? <EmptyState title="No income recorded" icon={<IconIncome className="h-12 w-12" />} /> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50"><tr><th className="th">Category</th><th className="th">Amount</th><th className="th">Resident</th><th className="th">Hostel</th><th className="th">Date</th></tr></thead>
              <tbody>
                {data.data.map((i: any) => (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <td className="td font-medium text-slate-800">{titleCase(i.category)}</td>
                    <td className="td font-semibold text-emerald-600">{formatPKR(i.amount)}</td>
                    <td className="td">{i.resident ?? "—"}</td>
                    <td className="td">{i.hostel}</td>
                    <td className="td">{formatDate(i.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
            <div className="flex gap-2"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button></div>
          </div>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New Income">
        <div className="grid grid-cols-2 gap-3">
          <Select label="Hostel" value={form.hostelId} onChange={(e) => setForm({ ...form, hostelId: e.target.value })}>{hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</Select>
          <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</Select>
          <Input label="Amount" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: +e.target.value })} />
          <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <Select label="Method" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>{["CASH", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CARD", "OTHER"].map((m) => <option key={m} value={m}>{titleCase(m)}</option>)}</Select>
          <div className="col-span-2"><Textarea label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={saving} onClick={save}>Save Income</Button></div>
      </Modal>
    </div>
  );
}
