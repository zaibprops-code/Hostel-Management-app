import { useState } from "react";
import clsx from "clsx";
import { api, apiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useHostels } from "../context/HostelContext";
import { useApi, withQuery } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, Select, Badge, ErrorText, PageLoader, EmptyState } from "../components/ui";
import { formatPKR } from "../lib/format";
import { IconInventory, IconPlus } from "../components/icons";

export default function InventoryPage() {
  const { can } = useAuth();
  const { hostels, scopeParam } = useHostels();
  const { data, loading, refetch } = useApi<any[]>(withQuery("/inventory", scopeParam), [scopeParam]);
  const [open, setOpen] = useState(false);
  const [txn, setTxn] = useState<null | any>(null);
  const [form, setForm] = useState<any>({ hostelId: "", name: "", category: "Grains", unit: "kg", quantity: 0, minStock: 0, purchasePrice: 0 });
  const [txnForm, setTxnForm] = useState<any>({ type: "PURCHASE", quantity: 0, unitCost: 0, note: "" });
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true); setError("");
    try { await api.post("/inventory", { ...form, hostelId: form.hostelId || hostels[0]?.id }); setOpen(false); await refetch(); } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }
  async function saveTxn() {
    setSaving(true); setError("");
    try { await api.post(`/inventory/${txn.id}/transaction`, txnForm); setTxn(null); setTxnForm({ type: "PURCHASE", quantity: 0, unitCost: 0, note: "" }); await refetch(); }
    catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }

  if (loading) return <PageLoader />;
  const lowCount = data?.filter((i) => i.lowStock).length ?? 0;

  return (
    <div>
      <PageHeader title="Inventory" subtitle={lowCount ? `${lowCount} item(s) low on stock` : "Kitchen & grocery stock"}
        actions={can("inventory.manage") && <Button onClick={() => { setForm({ ...form, hostelId: hostels[0]?.id ?? "" }); setOpen(true); }}><IconPlus className="h-4 w-4" /> New Item</Button>} />

      {!data?.length ? <EmptyState title="No inventory items" icon={<IconInventory className="h-12 w-12" />} /> : (
        <Card className="overflow-hidden">
          <div className="sm:hidden divide-y divide-slate-100">
            {data.map((i) => (
              <div key={i.id} className={clsx("px-4 py-3", i.lowStock && "bg-amber-50/40")}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-800 truncate">{i.name}</p>
                  {i.expired ? <Badge color="red">Expired</Badge> : i.nearExpiry ? <Badge color="amber">Near expiry</Badge> : i.lowStock ? <Badge color="amber">Low</Badge> : <Badge color="green">OK</Badge>}
                </div>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <p className="text-xs text-slate-400">{i.category} · <span className="font-semibold text-slate-600">{i.quantity} {i.unit}</span></p>
                  {can("inventory.manage") && <button onClick={() => setTxn(i)} className="text-brand-600 text-sm font-medium">Adjust</button>}
                </div>
              </div>
            ))}
          </div>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50"><tr><th className="th">Item</th><th className="th">Category</th><th className="th">Stock</th><th className="th">Min</th><th className="th">Status</th><th className="th">Hostel</th><th className="th"></th></tr></thead>
              <tbody>
                {data.map((i) => (
                  <tr key={i.id} className={clsx("hover:bg-slate-50", i.lowStock && "bg-amber-50/40")}>
                    <td className="td font-medium text-slate-800">{i.name}</td>
                    <td className="td">{i.category}</td>
                    <td className="td font-semibold">{i.quantity} {i.unit}</td>
                    <td className="td text-slate-400">{i.minStock} {i.unit}</td>
                    <td className="td">{i.expired ? <Badge color="red">Expired</Badge> : i.nearExpiry ? <Badge color="amber">Near expiry</Badge> : i.lowStock ? <Badge color="amber">Low stock</Badge> : <Badge color="green">OK</Badge>}</td>
                    <td className="td">{i.hostel}</td>
                    <td className="td text-right">{can("inventory.manage") && <button onClick={() => setTxn(i)} className="text-brand-600 hover:underline text-sm">Adjust</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New Inventory Item">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label="Hostel" value={form.hostelId} onChange={(e) => setForm({ ...form, hostelId: e.target.value })}>{hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</Select>
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <Select label="Unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>{["kg", "litre", "dozen", "piece", "pack", "bag"].map((u) => <option key={u} value={u}>{u}</option>)}</Select>
          <Input label="Quantity" type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: +e.target.value })} />
          <Input label="Min stock" type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: +e.target.value })} />
          <Input label="Purchase price" type="number" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: +e.target.value })} />
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={saving} onClick={save}>Save Item</Button></div>
      </Modal>

      <Modal open={!!txn} onClose={() => setTxn(null)} title={txn ? `Stock: ${txn.name}` : ""}>
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Current stock: <b>{txn?.quantity} {txn?.unit}</b></p>
          <Select label="Transaction type" value={txnForm.type} onChange={(e) => setTxnForm({ ...txnForm, type: e.target.value })}>{["PURCHASE", "CONSUMPTION", "WASTE", "ADJUSTMENT"].map((t) => <option key={t} value={t}>{t}</option>)}</Select>
          <Input label="Quantity" type="number" value={txnForm.quantity} onChange={(e) => setTxnForm({ ...txnForm, quantity: +e.target.value })} />
          <Input label="Unit cost (optional)" type="number" value={txnForm.unitCost} onChange={(e) => setTxnForm({ ...txnForm, unitCost: +e.target.value })} />
          <Input label="Note" value={txnForm.note} onChange={(e) => setTxnForm({ ...txnForm, note: e.target.value })} />
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setTxn(null)}>Cancel</Button><Button loading={saving} onClick={saveTxn}>Record</Button></div>
        </div>
      </Modal>
    </div>
  );
}
