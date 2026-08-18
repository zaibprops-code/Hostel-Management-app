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
// appliances, kitchen utensils, bedding, electronics…) plus improvements fitted
// into the rented building whose cost can be recovered from the property owner.

interface Asset {
  id: string; hostelId: string; name: string; category: string; quantity: number;
  condition: string; location: string | null; unitCost: number; totalValue: number;
  purchaseDate: string | null; vendor: string | null; warrantyUntil: string | null;
  recoverable: boolean; recoveryStatus: string; recoveredAmount: number; recoveredDate: string | null;
  notes: string | null; hostel?: string;
}
interface Summary { distinctItems: number; totalUnits: number; totalValue: number; damagedUnits: number; ownerOwesPending: number; ownerOwesCount: number; categories: string[] }

const CATEGORIES = ["Furniture", "Appliances", "Kitchen", "Bedding", "Electronics", "Bathroom", "Cleaning", "Safety & Security", "Other"];
const CONDITIONS: [string, string][] = [["NEW", "New"], ["GOOD", "Good"], ["FAIR", "Fair"], ["DAMAGED", "Damaged"]];
const CONDITION_BADGE: Record<string, "green" | "blue" | "amber" | "red"> = { NEW: "green", GOOD: "blue", FAIR: "amber", DAMAGED: "red" };
const RECOVERY: [string, string][] = [["PENDING", "Pending — owner to pay"], ["RECOVERED", "Recovered"], ["ADJUSTED", "Adjusted in rent"], ["WAIVED", "Waived (won't claim)"]];
const condLabel = (c: string) => CONDITIONS.find((x) => x[0] === c)?.[1] ?? c;

// One-tap starters for the most common hostel items, so entry is fast.
const PRESETS: { name: string; category: string }[] = [
  { name: "Bed", category: "Bedding" }, { name: "Mattress", category: "Bedding" },
  { name: "Pillow", category: "Bedding" }, { name: "Cupboard", category: "Furniture" },
  { name: "Study table", category: "Furniture" }, { name: "Chair", category: "Furniture" },
  { name: "Refrigerator", category: "Appliances" }, { name: "Water dispenser", category: "Appliances" },
  { name: "Fan", category: "Appliances" }, { name: "Geyser", category: "Bathroom" },
  { name: "Shower", category: "Bathroom" }, { name: "Water motor", category: "Appliances" },
  { name: "Gas stove", category: "Kitchen" }, { name: "Plates (set)", category: "Kitchen" },
  { name: "Cooking pot", category: "Kitchen" }, { name: "CCTV camera", category: "Electronics" },
  { name: "Router", category: "Electronics" }, { name: "Fire extinguisher", category: "Safety & Security" },
];

const BLANK = {
  hostelId: "", name: "", category: "Furniture", quantity: 1, condition: "GOOD", location: "",
  unitCost: 0, purchaseDate: "", vendor: "", warrantyUntil: "",
  recoverable: false, recoveryStatus: "PENDING", recoveredAmount: 0, recoveredDate: "", notes: "",
};

export default function AssetsPage() {
  const confirm = useConfirm();
  const { can } = useAuth();
  const { hostels, scopeParam } = useHostels();
  const { data, loading, refetch } = useApi<{ data: Asset[]; summary: Summary }>(withQuery("/assets", scopeParam), [scopeParam]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(BLANK);
  const [showMore, setShowMore] = useState(false);
  const [cat, setCat] = useState("ALL");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [qtyBusy, setQtyBusy] = useState<string | null>(null);

  const assets = data?.data ?? [];
  const summary = data?.summary;
  const shown = useMemo(() => {
    if (cat === "ALL") return assets;
    if (cat === "RECOVERABLE") return assets.filter((a) => a.recoverable);
    return assets.filter((a) => a.category === cat);
  }, [assets, cat]);

  function openNew(preset?: { name: string; category: string }) {
    setForm({ ...BLANK, hostelId: hostels[0]?.id ?? "", ...(preset ?? {}) });
    setEditingId(null); setShowMore(false); setError(""); setOpen(true);
  }
  function openEdit(a: Asset) {
    setForm({
      hostelId: a.hostelId, name: a.name, category: a.category, quantity: a.quantity, condition: a.condition,
      location: a.location ?? "", unitCost: a.unitCost, purchaseDate: a.purchaseDate?.slice(0, 10) ?? "",
      vendor: a.vendor ?? "", warrantyUntil: a.warrantyUntil?.slice(0, 10) ?? "",
      recoverable: a.recoverable, recoveryStatus: a.recoveryStatus, recoveredAmount: a.recoveredAmount,
      recoveredDate: a.recoveredDate?.slice(0, 10) ?? "", notes: a.notes ?? "",
    });
    setEditingId(a.id); setShowMore(!!(a.location || a.vendor || a.purchaseDate || a.warrantyUntil || a.notes)); setError(""); setOpen(true);
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
  async function bumpQty(a: Asset, delta: number) {
    const next = Math.max(0, a.quantity + delta);
    if (next === a.quantity) return;
    setQtyBusy(a.id);
    try { await api.patch(`/assets/${a.id}`, { quantity: next }); await refetch(); }
    catch (e) { toast.error(apiError(e)); } finally { setQtyBusy(null); }
  }
  async function remove(a: Asset) {
    if (!(await confirm({ title: "Delete item?", message: `Remove "${a.name}" from the asset register? This can't be undone.`, confirmLabel: "Delete", danger: true }))) return;
    try { await api.delete(`/assets/${a.id}`); toast.success("Item removed."); await refetch(); }
    catch (e) { toast.error(apiError(e)); }
  }

  if (loading) return <PageLoader />;

  const owes = summary?.ownerOwesPending ?? 0;
  const tiles = [
    { label: "Register value", value: formatPKR(summary?.totalValue ?? 0) },
    { label: "Total units", value: summary?.totalUnits ?? 0 },
    { label: "Owner owes (pending)", value: formatPKR(owes), warn: owes > 0, hint: summary?.ownerOwesCount ? `${summary.ownerOwesCount} item(s)` : "" },
    { label: "Damaged units", value: summary?.damagedUnits ?? 0, warn: (summary?.damagedUnits ?? 0) > 0 },
  ];

  const money = (n: number) => (n > 0 ? formatPKR(n) : "—");

  return (
    <div>
      <PageHeader
        title="Assets"
        subtitle="Everything each hostel owns — and improvements to recover from the owner"
        actions={can("assets.manage") && <Button onClick={() => openNew()}><IconPlus className="h-4 w-4" /> New Item</Button>}
      />

      {/* Summary tiles */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="p-4">
            <p className="text-xs font-medium text-slate-400">{t.label}</p>
            <p className={clsx("mt-1 text-xl font-bold", t.warn ? "text-rose-600" : "text-slate-800")}>{t.value}</p>
            {t.hint && <p className="text-[11px] text-slate-400">{t.hint}</p>}
          </Card>
        ))}
      </div>

      {/* Quick add presets */}
      {can("assets.manage") && (
        <div className="mb-4">
          <p className="mb-1.5 text-xs font-semibold text-slate-500">Quick add</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p.name} onClick={() => openNew(p)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-brand-400 hover:text-brand-700">
                + {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Category filter */}
      {assets.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {["ALL", ...(summary?.categories ?? [])].map((c) => (
            <FilterChip key={c} active={cat === c} onClick={() => setCat(c)}>{c === "ALL" ? "All" : c}</FilterChip>
          ))}
          {(summary?.ownerOwesCount ?? 0) > 0 && (
            <FilterChip active={cat === "RECOVERABLE"} onClick={() => setCat("RECOVERABLE")}>💰 Recoverable</FilterChip>
          )}
        </div>
      )}

      {!assets.length ? (
        <EmptyState
          title="No assets recorded yet"
          message="Tap a Quick add button above, or “New Item”, to start the register — beds, mattresses, fridge, plates, and anything you fit into the building."
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
                {a.recoverable && <RecoverBadge a={a} />}
                <div className="mt-2 flex items-center justify-between">
                  {can("assets.manage") ? <Stepper a={a} busy={qtyBusy === a.id} onBump={bumpQty} /> : <span className="text-sm text-slate-600">Qty <b>{a.quantity}</b></span>}
                  <span className="text-sm text-slate-400">{money(a.totalValue)}</span>
                </div>
                {can("assets.manage") && (
                  <div className="mt-2 flex gap-3">
                    <button onClick={() => openEdit(a)} className="text-xs font-semibold text-brand-600">Edit</button>
                    <button onClick={() => remove(a)} className="text-xs font-semibold text-slate-400 hover:text-rose-600">Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Item</th><th className="th">Category</th><th className="th">Location</th>
                  <th className="th text-center">Qty</th><th className="th">Condition</th>
                  <th className="th text-right">Value</th><th className="th">Owner recovery</th>
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
                    <td className="td text-center">{can("assets.manage") ? <Stepper a={a} busy={qtyBusy === a.id} onBump={bumpQty} compact /> : <b>{a.quantity}</b>}</td>
                    <td className="td"><Badge color={CONDITION_BADGE[a.condition] ?? "gray"}>{condLabel(a.condition)}</Badge></td>
                    <td className="td text-right">{money(a.totalValue)}</td>
                    <td className="td">{a.recoverable ? <RecoverBadge a={a} /> : <span className="text-slate-300">—</span>}</td>
                    {hostels.length > 1 && <td className="td text-slate-500">{a.hostel}</td>}
                    {can("assets.manage") && (
                      <td className="td whitespace-nowrap text-right">
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
          <Input label="Item name" placeholder="e.g. Refrigerator, Steel bed, Shower" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            <NumberInput label="Quantity" value={form.quantity} onChange={(n) => setForm({ ...form, quantity: n })} />
            <MoneyInput label="Cost (per unit)" value={form.unitCost} onChange={(n) => setForm({ ...form, unitCost: n })} />
            <Select label="Condition" value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}>
              {CONDITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </div>

          {/* Recover cost from the property owner (rented building improvements) */}
          <div className={clsx("rounded-xl border p-3 transition", form.recoverable ? "border-amber-300 bg-amber-50/60" : "border-slate-200")}>
            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-amber-500" checked={form.recoverable} onChange={(e) => setForm({ ...form, recoverable: e.target.checked })} />
              <span>
                <span className="block text-sm font-semibold text-slate-800">Recover this cost from the property owner</span>
                <span className="block text-xs text-slate-500">For things fitted into the rented building (shower, geyser, wiring…) that the landlord should pay back.</span>
              </span>
            </label>
            {form.recoverable && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Select label="Recovery status" value={form.recoveryStatus} onChange={(e) => setForm({ ...form, recoveryStatus: e.target.value })}>
                  {RECOVERY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
                {form.recoveryStatus !== "PENDING" && form.recoveryStatus !== "WAIVED" && (
                  <>
                    <MoneyInput label="Amount recovered" value={form.recoveredAmount} onChange={(n) => setForm({ ...form, recoveredAmount: n })} />
                    <Input label="Recovered on" type="date" value={form.recoveredDate} onChange={(e) => setForm({ ...form, recoveredDate: e.target.value })} />
                  </>
                )}
              </div>
            )}
          </div>

          <button type="button" onClick={() => setShowMore((v) => !v)} className="text-xs font-semibold text-brand-600">
            {showMore ? "− Hide extra details" : "+ More details (location, vendor, warranty, notes)"}
          </button>
          {showMore && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input label="Location" placeholder="e.g. Room 101 / Kitchen" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                <Input label="Vendor / fitted by" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
                <Input label="Purchase / fitted date" type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
                <Input label="Warranty until" type="date" value={form.warrantyUntil} onChange={(e) => setForm({ ...form, warrantyUntil: e.target.value })} />
              </div>
              <Textarea label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. brand, serial number, warranty card…" />
            </div>
          )}

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

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={clsx("rounded-lg border px-3 py-1.5 text-sm font-medium", active ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-slate-300")}>
      {children}
    </button>
  );
}

// Inline − qty + control for fast count changes without opening the editor.
function Stepper({ a, busy, onBump, compact }: { a: Asset; busy: boolean; onBump: (a: Asset, d: number) => void; compact?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center rounded-lg border border-slate-200", compact ? "" : "bg-white")}>
      <button disabled={busy} onClick={() => onBump(a, -1)} className="grid h-7 w-7 place-items-center text-slate-500 hover:bg-slate-100 disabled:opacity-40">−</button>
      <span className="min-w-[2rem] text-center text-sm font-semibold text-slate-800">{a.quantity}</span>
      <button disabled={busy} onClick={() => onBump(a, 1)} className="grid h-7 w-7 place-items-center text-slate-500 hover:bg-slate-100 disabled:opacity-40">+</button>
    </span>
  );
}

// Small pill summarising the landlord cost-recovery state of an item.
function RecoverBadge({ a }: { a: Asset }) {
  const map: Record<string, { color: "amber" | "green" | "blue" | "gray"; text: string }> = {
    PENDING: { color: "amber", text: `Owner owes ${formatPKR(a.totalValue)}` },
    RECOVERED: { color: "green", text: "Recovered" },
    ADJUSTED: { color: "green", text: "Adjusted in rent" },
    WAIVED: { color: "gray", text: "Waived" },
  };
  const m = map[a.recoveryStatus] ?? map.PENDING;
  return <span className="mt-1 inline-block"><Badge color={m.color}>💰 {m.text}</Badge></span>;
}
