import { useState } from "react";
import clsx from "clsx";
import { api, apiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useHostels } from "../context/HostelContext";
import { useApi, withQuery } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, MoneyInput, NumberInput, Select, Badge, ErrorText, PageLoader, EmptyState } from "../components/ui";
import { formatPKR, formatDate } from "../lib/format";
import { IconInventory, IconPlus } from "../components/icons";
import SuppliersPage from "./SuppliersPage";

// Common kitchen / rashan units. Offered as suggestions but the field is a free
// combobox, so the user can type any unit (e.g. "half kg", "40 kg bag") too.
const UNITS = ["kg", "grams", "litre", "ml", "dozen", "piece", "packet", "bag", "sack (bori)", "tin", "bottle", "carton", "can", "box"];

// Friendly labels for stock movements — plain language for a hostel owner,
// mapped to the backend's enum values.
const TXN_TYPES: [string, string][] = [
  ["PURCHASE", "Bring in / Purchase (add to stock)"],
  ["CONSUMPTION", "Used in kitchen (reduce stock)"],
  ["WASTE", "Wasted / spoiled (reduce stock)"],
  ["ADJUSTMENT", "Manual correction (set right)"],
];
const TXN_SHORT: Record<string, string> = { PURCHASE: "Brought in", CONSUMPTION: "Used", WASTE: "Wasted", ADJUSTMENT: "Correction" };
const TXN_COLOR: Record<string, "green" | "blue" | "red" | "gray"> = { PURCHASE: "green", CONSUMPTION: "blue", WASTE: "red", ADJUSTMENT: "gray" };

const today = () => new Date().toISOString().slice(0, 10);

export default function InventoryPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<"items" | "history" | "suppliers">("items");
  const { hostels, scopeParam } = useHostels();
  const { data, loading, refetch } = useApi<any[]>(withQuery("/inventory", scopeParam), [scopeParam]);
  const { data: history, refetch: refetchHistory } = useApi<{ transactions: any[]; summary: { monthPurchaseTotal: number; monthPurchaseCount: number } }>(withQuery("/inventory/transactions", scopeParam), [scopeParam]);
  const [open, setOpen] = useState(false);
  const [txn, setTxn] = useState<null | any>(null);
  const [form, setForm] = useState<any>({ hostelId: "", name: "", category: "Grains", unit: "kg", quantity: 0, minStock: 0, purchasePrice: 0 });
  const [txnForm, setTxnForm] = useState<any>({ type: "PURCHASE", quantity: 0, unitCost: 0, note: "", date: today() });
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true); setError("");
    try { await api.post("/inventory", { ...form, hostelId: form.hostelId || hostels[0]?.id }); setOpen(false); await refetch(); } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }
  function openTxn(item: any, type = "PURCHASE") {
    setError("");
    setTxnForm({ type, quantity: 0, unitCost: type === "PURCHASE" ? item.purchasePrice || 0 : 0, note: "", date: today() });
    setTxn(item);
  }
  async function saveTxn() {
    setSaving(true); setError("");
    try {
      await api.post(`/inventory/${txn.id}/transaction`, txnForm);
      setTxn(null);
      await Promise.all([refetch(), refetchHistory()]);
    } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }

  if (loading) return <PageLoader />;
  const lowCount = data?.filter((i) => i.lowStock).length ?? 0;
  const monthTotal = history?.summary?.monthPurchaseTotal ?? 0;
  const txnTotal = (Number(txnForm.quantity) || 0) * (Number(txnForm.unitCost) || 0);
  const reduces = txnForm.type === "CONSUMPTION" || txnForm.type === "WASTE";

  return (
    <div>
      <PageHeader title="Kitchen & Inventory" subtitle={lowCount ? `${lowCount} item(s) low on stock` : "Rashan, kitchen & grocery stock"}
        actions={tab === "items" && can("inventory.manage") && <Button onClick={() => { setForm({ hostelId: hostels[0]?.id ?? "", name: "", category: "Grains", unit: "kg", quantity: 0, minStock: 0, purchasePrice: 0 }); setError(""); setOpen(true); }}><IconPlus className="h-4 w-4" /> New Item</Button>} />

      {/* Month intake summary — what we've brought in this month */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <Card className="p-4"><p className="text-xs text-slate-400">Brought in this month</p><p className="text-xl font-bold text-emerald-600">{formatPKR(monthTotal)}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-400">Purchases this month</p><p className="text-xl font-bold text-slate-800">{history?.summary?.monthPurchaseCount ?? 0}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-400">Items tracked</p><p className="text-xl font-bold text-slate-800">{data?.length ?? 0}</p></Card>
      </div>

      <div className="flex gap-2 mb-4">
        {(["items", "history", ...(can("suppliers.view") ? ["suppliers"] : [])] as const).map((t) => (
          <button key={t} onClick={() => setTab(t as any)}
            className={clsx("rounded-lg px-3.5 py-1.5 text-sm font-medium border", tab === t ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600")}>
            {t === "items" ? "Stock items" : t === "history" ? "Intake log" : "Suppliers"}
          </button>
        ))}
      </div>

      {tab === "suppliers" ? <SuppliersPage embedded /> :
       tab === "history" ? <HistoryLog rows={history?.transactions} /> : (
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
                  {can("inventory.manage") && (
                    <div className="flex gap-3">
                      <button onClick={() => openTxn(i, "PURCHASE")} className="text-emerald-600 text-sm font-medium">Bring in</button>
                      <button onClick={() => openTxn(i, "CONSUMPTION")} className="text-brand-600 text-sm font-medium">Update</button>
                    </div>
                  )}
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
                    <td className="td text-right">{can("inventory.manage") && (
                      <span className="flex justify-end gap-3">
                        <button onClick={() => openTxn(i, "PURCHASE")} className="text-emerald-600 hover:underline text-sm font-medium">Bring in</button>
                        <button onClick={() => openTxn(i, "CONSUMPTION")} className="text-brand-600 hover:underline text-sm">Update stock</button>
                      </span>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      {/* New item */}
      <Modal open={open} onClose={() => setOpen(false)} title="New Inventory Item">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Select label="Hostel" value={form.hostelId} onChange={(e) => setForm({ ...form, hostelId: e.target.value })}>{hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</Select>
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Basmati rice, Cooking oil, Eggs" />
          <Input label="Category" list="cat-list" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Grains, Vegetables, Dairy…" />
          <datalist id="cat-list">{["Grains", "Pulses (daal)", "Vegetables", "Fruit", "Dairy", "Meat & chicken", "Oil & ghee", "Spices", "Flour (atta)", "Sugar & tea", "Bakery", "Cleaning", "Gas & fuel", "Other"].map((c) => <option key={c} value={c} />)}</datalist>
          <div>
            <Input label="Unit" list="unit-list" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="kg, litre, dozen…" />
            <datalist id="unit-list">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
            <p className="mt-1 text-[11px] text-slate-400">Pick one or type your own.</p>
          </div>
          <NumberInput label={`Opening quantity (${form.unit || "unit"})`} value={form.quantity} onChange={(n) => setForm({ ...form, quantity: n })} />
          <NumberInput label={`Low-stock alert below (${form.unit || "unit"})`} value={form.minStock} onChange={(n) => setForm({ ...form, minStock: n })} />
          <MoneyInput label={`Typical price per ${form.unit || "unit"}`} value={form.purchasePrice} onChange={(n) => setForm({ ...form, purchasePrice: n })} />
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={saving} onClick={save}>Save Item</Button></div>
      </Modal>

      {/* Stock movement */}
      <Modal open={!!txn} onClose={() => setTxn(null)} title={txn ? txn.name : ""}>
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Current stock: <b className="text-slate-700">{txn?.quantity} {txn?.unit}</b></p>
          <Select label="What happened?" value={txnForm.type} onChange={(e) => setTxnForm({ ...txnForm, type: e.target.value, unitCost: e.target.value === "PURCHASE" ? (txn?.purchasePrice || 0) : 0 })}>
            {TXN_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <NumberInput label={`Quantity (${txn?.unit || "unit"})`} value={txnForm.quantity} onChange={(n) => setTxnForm({ ...txnForm, quantity: n })} />
            <Input label="Date" type="date" value={txnForm.date} onChange={(e) => setTxnForm({ ...txnForm, date: e.target.value })} />
          </div>
          {!reduces && <MoneyInput label={`Cost per ${txn?.unit || "unit"} (optional)`} value={txnForm.unitCost} onChange={(n) => setTxnForm({ ...txnForm, unitCost: n })} />}
          <Input label="Note (supplier, bill #, etc.)" value={txnForm.note} onChange={(e) => setTxnForm({ ...txnForm, note: e.target.value })} placeholder="Optional" />
          {!reduces && txnTotal > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm">
              <span className="text-emerald-700 font-medium">Total cost</span>
              <span className="font-bold text-emerald-700">{formatPKR(txnTotal)}</span>
            </div>
          )}
          <p className="text-xs text-slate-400">
            New stock will be <b className="text-slate-600">{Math.max(0, (Number(txn?.quantity) || 0) + (reduces ? -1 : 1) * (Number(txnForm.quantity) || 0)).toLocaleString()} {txn?.unit}</b> after this.
          </p>
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setTxn(null)}>Cancel</Button><Button loading={saving} disabled={!txnForm.quantity} onClick={saveTxn}>Record</Button></div>
        </div>
      </Modal>
    </div>
  );
}

// The full intake / usage record — a scrollable log of every stock movement so
// there's a complete history of what came into the kitchen and what was used.
function HistoryLog({ rows }: { rows?: any[] }) {
  if (!rows?.length) return <EmptyState title="No stock activity yet" message="Bring in some rashan or record usage and it will appear here." icon={<IconInventory className="h-12 w-12" />} />;
  return (
    <Card className="overflow-hidden">
      {/* Mobile */}
      <div className="lg:hidden divide-y divide-slate-100">
        {rows.map((t) => (
          <div key={t.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-slate-800 truncate">{t.item}</p>
              <Badge color={TXN_COLOR[t.type] ?? "gray"}>{TXN_SHORT[t.type] ?? t.type}</Badge>
            </div>
            <div className="flex items-center justify-between gap-2 mt-1 text-xs text-slate-500">
              <span>{formatDate(t.date)} · {t.quantity} {t.unit}{t.note ? ` · ${t.note}` : ""}</span>
              {t.total > 0 && <span className="font-semibold text-slate-700">{formatPKR(t.total)}</span>}
            </div>
          </div>
        ))}
      </div>
      {/* Desktop */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50"><tr><th className="th">Date</th><th className="th">Item</th><th className="th">Type</th><th className="th">Quantity</th><th className="th">Cost/unit</th><th className="th">Total</th><th className="th">Hostel</th><th className="th">Note</th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="td whitespace-nowrap">{formatDate(t.date)}</td>
                <td className="td font-medium text-slate-800">{t.item}</td>
                <td className="td"><Badge color={TXN_COLOR[t.type] ?? "gray"}>{TXN_SHORT[t.type] ?? t.type}</Badge></td>
                <td className="td font-semibold">{t.quantity} {t.unit}</td>
                <td className="td text-slate-500">{t.unitCost ? formatPKR(t.unitCost) : "—"}</td>
                <td className="td font-semibold">{t.total ? formatPKR(t.total) : "—"}</td>
                <td className="td text-slate-500">{t.hostel}</td>
                <td className="td text-slate-500 max-w-[16rem] truncate">{t.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
