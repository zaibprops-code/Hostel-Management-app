import { useMemo, useState } from "react";
import clsx from "clsx";
import { api, apiError } from "../lib/api";
import { toast } from "../lib/toast";
import { useConfirm } from "../context/ConfirmContext";
import { useAuth } from "../context/AuthContext";
import { useHostels } from "../context/HostelContext";
import { useApi, withQuery } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, Textarea, MoneyInput, NumberInput, Select, Badge, ErrorText, PageLoader, EmptyState } from "../components/ui";
import { formatPKR } from "../lib/format";
import { IconBox, IconPlus } from "../components/icons";

// Asset register — a per-hostel record of durable belongings (furniture,
// appliances, kitchen utensils, bedding, electronics…), with counts, condition
// and value. Distinct from Inventory (consumable stock).

interface Asset {
  id: string; hostelId: string; name: string; category: string; quantity: number;
  condition: string; location: string | null; unitCost: number; totalValue: number;
  purchaseDate: string | null; notes: string | null; hostel?: string;
}
interface Summary { distinctItems: number; totalUnits: number; totalValue: number; damagedUnits: number; categories: string[] }

const CATEGORIES = ["Furniture", "Appliances", "Kitchen", "Bedding", "Electronics", "Bathroom", "Cleaning", "Safety & Security", "Other"];
const CONDITIONS: [string, string][] = [["NEW", "New"], ["GOOD", "Good"], ["FAIR", "Fair"], ["DAMAGED", "Damaged"]];
const CONDITION_BADGE: Record<string, "green" | "blue" | "amber" | "red"> = { NEW: "green", GOOD: "blue", FAIR: "amber", DAMAGED: "red" };
const condLabel = (c: string) => CONDITIONS.find((x) => x[0] === c)?.[1] ?? c;

const BLANK = { hostelId: "", name: "", category: "Furniture", quantity: 1, condition: "GOOD", location: "", unitCost: 0, purchaseDate: "", notes: "" };

export default function AssetsPage() {
  const confirm = useConfirm();
  const { can } = useAuth();
  const { hostels, scopeParam } = useHostels();
  const { data, loading, refetch } = useApi<{ data: Asset[]; summary: Summary }>(withQuery("/assets", scopeParam), [scopeParam]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(BLANK);
  const [cat, setCat] = useState("ALL");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const assets = data?.data ?? [];
  const summary = data?.summary;
  const shown = useMemo(() => (cat === "ALL" ? assets : assets.filter((a) => a.category === cat)), [assets, cat]);

  function openNew() { setForm({ ...BLANK, hostelId: hostels[0]?.id ?? "" }); setEditingId(null); setError(""); setOpen(true); }
  function openEdit(a: Asset) {
    setForm({
      hostelId: a.hostelId, name: a.name, category: a.category, quantity: a.quantity, condition: a.condition,
      location: a.location ?? "", unitCost: a.unitCost, purchaseDate: a.purchaseDate ? a.purchaseDate.slice(0, 10) : "", notes: a.notes ?? "",
    });
    setEditingId(a.id); setError(""); setOpen(true);
  }

  async function save() {
    setSaving(true); setError("");
    try {
      const payload = { ...form, hostelId: form.hostelId || hostels[0]?.id };
      if (editingId) await api.patch(`/assets/${editingId}`, payload);
      else await api.post("/assets", payload);
      setOpen(false); setEditingId(null); await refetch();
      toast.success(editingId ? "Item updated." : "Item added to the register.");
    } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }
  async function remove(a: Asset) {
    if (!(await confirm({ title: "Delete item?", message: `Remove "${a.name}" from the asset register? This can't be undone.`, confirmLabel: "Delete", danger: true }))) return;
    try { await api.delete(`/assets/${a.id}`); toast.success("Item removed."); await refetch(); }
    catch (e) { toast.error(apiError(e)); }
  }

  if (loading) return <PageLoader />;

  const tiles = [
    { label: "Distinct items", value: summary?.distinctItems ?? 0 },
    { label: "Total units", value: summary?.totalUnits ?? 0 },
    { label: "Register value", value: formatPKR(summary?.totalValue ?? 0) },
    { label: "Damaged units", value: summary?.damagedUnits ?? 0, warn: (summary?.damagedUnits ?? 0) > 0 },
  ];

  return (
    <div>
      <PageHeader
        title="Assets"
        subtitle="Furniture, appliances, kitchen & everything each hostel owns"
        actions={can("assets.manage") && <Button onClick={openNew}><IconPlus className="h-4 w-4" /> New Item</Button>}
      />

      {/* Summary tiles */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="p-4">
            <p className="text-xs font-medium text-slate-400">{t.label}</p>
            <p className={clsx("mt-1 text-xl font-bold", t.warn ? "text-rose-600" : "text-slate-800")}>{t.value}</p>
          </Card>
        ))}
      </div>

      {/* Category filter */}
      {assets.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {["ALL", ...(summary?.categories ?? [])].map((c) => (
            <button key={c} onClick={() => setCat(c)}
              className={clsx("rounded-lg border px-3 py-1.5 text-sm font-medium", cat === c ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-slate-300")}>
              {c === "ALL" ? "All" : c}
            </button>
          ))}
        </div>
      )}

      {!assets.length ? (
        <EmptyState
          title="No assets recorded yet"
          message="Add the things this hostel owns — beds, mattresses, fridge, plates, and more — to build a full register."
          icon={<IconBox className="h-12 w-12" />}
        />
      ) : (
        <Card className="overflow-hidden">
          {/* Mobile cards */}
          <div className="divide-y divide-slate-100 lg:hidden">
            {shown.map((a) => (
              <div key={a.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-800">{a.name}</p>
                    <p className="text-xs text-slate-400">{a.category}{a.location ? ` · ${a.location}` : ""}</p>
                  </div>
                  <Badge color={CONDITION_BADGE[a.condition] ?? "gray"}>{condLabel(a.condition)}</Badge>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-slate-600">Qty <b className="text-slate-800">{a.quantity}</b>{a.unitCost > 0 && <span className="text-slate-400"> · {formatPKR(a.totalValue)}</span>}</span>
                  {can("assets.manage") && (
                    <span className="flex gap-2">
                      <button onClick={() => openEdit(a)} className="text-xs font-semibold text-brand-600">Edit</button>
                      <button onClick={() => remove(a)} className="text-xs font-semibold text-slate-400 hover:text-rose-600">Delete</button>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Item</th><th className="th">Category</th><th className="th">Location</th>
                  <th className="th text-right">Qty</th><th className="th">Condition</th>
                  <th className="th text-right">Unit cost</th><th className="th text-right">Value</th>
                  {hostels.length > 1 && <th className="th">Hostel</th>}
                  {can("assets.manage") && <th className="th text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/60">
                    <td className="td font-medium text-slate-800">{a.name}{a.notes && <span className="block text-xs font-normal text-slate-400">{a.notes}</span>}</td>
                    <td className="td">{a.category}</td>
                    <td className="td text-slate-500">{a.location || "—"}</td>
                    <td className="td text-right font-semibold">{a.quantity}</td>
                    <td className="td"><Badge color={CONDITION_BADGE[a.condition] ?? "gray"}>{condLabel(a.condition)}</Badge></td>
                    <td className="td text-right text-slate-500">{a.unitCost > 0 ? formatPKR(a.unitCost) : "—"}</td>
                    <td className="td text-right">{a.totalValue > 0 ? formatPKR(a.totalValue) : "—"}</td>
                    {hostels.length > 1 && <td className="td text-slate-500">{a.hostel}</td>}
                    {can("assets.manage") && (
                      <td className="td text-right whitespace-nowrap">
                        <button onClick={() => openEdit(a)} className="text-xs font-semibold text-brand-600">Edit</button>
                        <button onClick={() => remove(a)} className="ml-3 text-xs font-semibold text-slate-400 hover:text-rose-600">Delete</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? "Edit Item" : "Add Item"}>
        <div className="space-y-3">
          {hostels.length > 1 && !editingId && (
            <Select label="Hostel" value={form.hostelId} onChange={(e) => setForm({ ...form, hostelId: e.target.value })}>
              {hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </Select>
          )}
          <Input label="Item name" placeholder="e.g. Refrigerator, Steel bed, Dinner plate" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            <NumberInput label="Quantity" value={form.quantity} onChange={(n) => setForm({ ...form, quantity: n })} />
            <Select label="Condition" value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}>
              {CONDITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
            <Input label="Location" placeholder="e.g. Room 101 / Kitchen" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            <MoneyInput label="Unit cost (optional)" value={form.unitCost} onChange={(n) => setForm({ ...form, unitCost: n })} />
            <Input label="Purchase date (optional)" type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
          </div>
          <Textarea label="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. brand, serial number, warranty…" />
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={save}>{editingId ? "Save changes" : "Add item"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
