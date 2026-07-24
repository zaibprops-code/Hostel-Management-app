import { useState } from "react";
import { api, apiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useHostels } from "../context/HostelContext";
import { useApi, withQuery } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, Select, ErrorText, PageLoader, EmptyState } from "../components/ui";
import { formatPKR } from "../lib/format";
import { IconSupplier, IconPlus } from "../components/icons";

export default function SuppliersPage() {
  const { can } = useAuth();
  const { hostels, scopeParam } = useHostels();
  const { data, loading, refetch } = useApi<any[]>(withQuery("/suppliers", scopeParam), [scopeParam]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ hostelId: "", name: "", contactPerson: "", phone: "", products: "", paymentTerms: "" });
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true); setError("");
    try { await api.post("/suppliers", { ...form, hostelId: form.hostelId || hostels[0]?.id }); setOpen(false); await refetch(); } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }

  if (loading) return <PageLoader />;

  return (
    <div>
      <PageHeader title="Suppliers" subtitle="Vendors & payment terms"
        actions={can("suppliers.manage") && <Button onClick={() => { setForm({ ...form, hostelId: hostels[0]?.id ?? "" }); setOpen(true); }}><IconPlus className="h-4 w-4" /> New Supplier</Button>} />

      {!data?.length ? <EmptyState title="No suppliers" icon={<IconSupplier className="h-12 w-12" />} /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((s) => (
            <Card key={s.id} className="p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-lg bg-brand-50 text-brand-600 grid place-items-center"><IconSupplier /></div>
                <div><p className="font-semibold text-slate-800">{s.name}</p><p className="text-xs text-slate-400">{s.hostel}</p></div>
              </div>
              <dl className="text-sm space-y-1">
                <div className="flex justify-between"><dt className="text-slate-400">Contact</dt><dd className="font-medium text-slate-700">{s.contactPerson ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-400">Phone</dt><dd className="font-medium text-slate-700">{s.phone ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-400">Products</dt><dd className="font-medium text-slate-700 text-right">{s.products ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-400">Outstanding</dt><dd className="font-semibold text-rose-600">{formatPKR(s.outstanding)}</dd></div>
              </dl>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New Supplier">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label="Hostel" value={form.hostelId} onChange={(e) => setForm({ ...form, hostelId: e.target.value })}>{hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</Select>
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Contact person" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Products" value={form.products} onChange={(e) => setForm({ ...form, products: e.target.value })} />
          <Input label="Payment terms" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} />
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={saving} onClick={save}>Save</Button></div>
      </Modal>
    </div>
  );
}
