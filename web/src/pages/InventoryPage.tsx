import { useState } from "react";
import clsx from "clsx";
import { api, apiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useHostels } from "../context/HostelContext";
import { useApi, withQuery } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, MoneyInput, NumberInput, Select, Badge, ErrorText, PageLoader, EmptyState } from "../components/ui";
import { formatPKR } from "../lib/format";
import { IconInventory, IconPlus } from "../components/icons";
import SuppliersPage from "./SuppliersPage";

export default function InventoryPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<"items" | "suppliers">("items");
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
        actions={tab === "items" && can("inventory.manage") && <Button onClick={() => { setForm({ ...form, hostelId: hostels[0]?.id ?? "" }); setOpen(true); }}><IconPlus className="h-4 w-4" /> New Item</Button>} />

      {can("suppliers.view") && (
        <div className="flex gap-2 mb-4">
          {(["items", "suppliers"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={clsx("rounded-lg px-3.5 py-1.5 text-sm font-medium border", tab === t ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600")}>
              {t === "items" ? "Stock items" : "Suppliers"}
            </button>
          ))}
        </div>
      )}

      {tab === "suppliers" ? <SuppliersPage embedded /> : (
      !data?.length ? <EmptyState title="No inventory items" icon={<IconInventory className="h-12 w-12" />} /> : (
        <Card className="overflow-hidden">
          <div className="lg:hidden divide-y divide-slate-100">
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
          <div className="hidden lg:block overflow-x-auto">
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
      ))}

      <Modal open={open} onClose={() => setOpen(false)} title="New Inventory Item">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Select label="Hostel" value={form.hostelId} onChange={(e) => setForm({ ...form, hostelId: e.target.value })}>{hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</Select>
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <Select label="Unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>{["kg", "litre", "dozen", "piece", "pack", "bag"].map((u) => <option key={u} value={u}>{u}</option>)}</Select>
          <NumberInput label="Quantity" value={form.quantity} onChange={(n) => setForm({ ...form, quantity: n })} />
          <NumberInput label="Min stock" value={form.minStock} onChange={(n) => setForm({ ...form, minStock: n })} />
          <MoneyInput label="Purchase price" value={form.purchasePrice} onChange={(n) => setForm({ ...form, purchasePrice: n })} />
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={saving} onClick={save}>Save Item</Button></div>
      </Modal>

      <Modal open={!!txn} onClose={() => setTxn(null)} title={txn ? `Stock: ${txn.name}` : ""}>
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Current stock: <b>{txn?.quantity} {txn?.unit}</b></p>
          <Select label="Transaction type" value={txnForm.type} onChange={(e) => setTxnForm({ ...txnForm, type: e.target.value })}>{["PURCHASE", "CONSUMPTION", "WASTE", "ADJUSTMENT"].map((t) => <option key={t} value={t}>{t}</option>)}</Select>
          <NumberInput label="Quantity" value={txnForm.quantity} onChange={(n) => setTxnForm({ ...txnForm, quantity: n })} />
          <MoneyInput label="Unit cost (optional)" value={txnForm.unitCost} onChange={(n) => setTxnForm({ ...txnForm, unitCost: n })} />
          <Input label="Note" value={txnForm.note} onChange={(e) => setTxnForm({ ...txnForm, note: e.target.value })} />
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setTxn(null)}>Cancel</Button><Button loading={saving} onClick={saveTxn}>Record</Button></div>
        </div>
      </Modal>
    </div>
  );
}
