import { useState } from "react";
import { api, apiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useHostels } from "../context/HostelContext";
import { useApi, withQuery } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, Select, Textarea, ErrorText, PageLoader, StatusBadge, EmptyState } from "../components/ui";
import { StatCard } from "../components/stats";
import { formatPKR, formatDate, titleCase } from "../lib/format";
import { IconExpense, IconPlus } from "../components/icons";

const CATEGORIES = ["PROPERTY_RENT", "ELECTRICITY", "GAS", "WATER", "INTERNET", "FOOD", "GROCERIES", "SALARIES", "REPAIRS", "MAINTENANCE", "CLEANING", "TRANSPORTATION", "MARKETING", "FURNITURE", "APPLIANCES", "SECURITY", "MISCELLANEOUS"];

export default function ExpensesPage() {
  const { can } = useAuth();
  const { hostels, scopeParam } = useHostels();
  const [page, setPage] = useState(1);
  const [cat, setCat] = useState("");
  const url = withQuery("/expenses", scopeParam, `page=${page}`, cat && `category=${cat}`);
  const { data, loading, refetch } = useApi<any>(url, [page, cat, scopeParam]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ hostelId: "", category: "ELECTRICITY", amount: 0, date: new Date().toISOString().slice(0, 10), vendor: "", method: "CASH", description: "" });
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true); setError("");
    try { await api.post("/expenses", { ...form, hostelId: form.hostelId || hostels[0]?.id }); setOpen(false); await refetch(); }
    catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }
  async function voidExpense(id: string) {
    const reason = prompt("Reason for voiding?"); if (!reason) return;
    try { await api.post(`/expenses/${id}/void`, { reason }); await refetch(); } catch (e) { alert(apiError(e)); }
  }
  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

  return (
    <div>
      <PageHeader title="Expenses" subtitle="Operational spending"
        actions={can("expenses.manage") && <Button onClick={() => { setForm({ ...form, hostelId: hostels[0]?.id ?? "" }); setOpen(true); }}><IconPlus className="h-4 w-4" /> New Expense</Button>} />

      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <StatCard label="Total Expenses (filtered)" value={formatPKR(data?.totalAmount)} icon={<IconExpense />} accent="rose" />
        <Card className="p-4 flex items-center">
          <Select label="Filter category" value={cat} onChange={(e) => { setCat(e.target.value); setPage(1); }} className="w-full">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
          </Select>
        </Card>
      </div>

      {loading ? <PageLoader /> : !data?.data.length ? <EmptyState title="No expenses" icon={<IconExpense className="h-12 w-12" />} /> : (
        <Card className="overflow-hidden">
          <div className="lg:hidden divide-y divide-slate-100">
            {data.data.map((e: any) => (
              <div key={e.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-800 truncate">{titleCase(e.category)}{e.isRecurring && <span className="ml-1 text-[10px] text-brand-500">↻</span>}</p>
                  <span className="font-bold text-rose-600">{formatPKR(e.amount)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <p className="text-xs text-slate-400 truncate">{e.vendor ?? "—"} · {formatDate(e.date)}</p>
                  {can("expenses.manage") && e.status === "ACTIVE" ? <button onClick={() => voidExpense(e.id)} className="text-rose-600 text-sm font-medium">Void</button> : <StatusBadge status={e.status} />}
                </div>
              </div>
            ))}
          </div>
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50"><tr><th className="th">Category</th><th className="th">Amount</th><th className="th">Vendor</th><th className="th">Hostel</th><th className="th">Date</th><th className="th">Status</th><th className="th"></th></tr></thead>
              <tbody>
                {data.data.map((e: any) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="td font-medium text-slate-800">{titleCase(e.category)}{e.isRecurring && <span className="ml-1 text-[10px] text-brand-500">↻</span>}</td>
                    <td className="td font-semibold text-rose-600">{formatPKR(e.amount)}</td>
                    <td className="td">{e.vendor ?? "—"}</td>
                    <td className="td">{e.hostel}</td>
                    <td className="td">{formatDate(e.date)}</td>
                    <td className="td"><StatusBadge status={e.status} /></td>
                    <td className="td text-right">{can("expenses.manage") && e.status === "ACTIVE" && <button onClick={() => voidExpense(e.id)} className="text-rose-600 hover:underline text-sm">Void</button>}</td>
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

      <Modal open={open} onClose={() => setOpen(false)} title="New Expense">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Select label="Hostel" value={form.hostelId} onChange={(e) => setForm({ ...form, hostelId: e.target.value })}>{hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</Select>
          <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</Select>
          <Input label="Amount" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: +e.target.value })} />
          <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <Input label="Vendor" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
          <Select label="Method" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>{["CASH", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CARD", "OTHER"].map((m) => <option key={m} value={m}>{titleCase(m)}</option>)}</Select>
          <div className="col-span-2"><Textarea label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={saving} onClick={save}>Save Expense</Button></div>
      </Modal>
    </div>
  );
}
