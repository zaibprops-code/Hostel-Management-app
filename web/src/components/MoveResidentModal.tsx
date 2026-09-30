import { useEffect, useState } from "react";
import clsx from "clsx";
import { api, apiError } from "../lib/api";
import { toast } from "../lib/toast";
import { Modal, Button, Input, MoneyInput, Select, ErrorText } from "./ui";
import { formatPKR } from "../lib/format";
import { MONTHS, formatPerDay, dueWindow } from "../lib/rent";
import { useHostels } from "../context/HostelContext";

interface FreeBed { id: string; label: string; monthlyRent: number; roomName: string; floor: string }

// Today as YYYY-MM-DD in the viewer's own time zone (for a date input).
function localToday(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
function parseDay(v: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || "");
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}

// Move a resident to another room / bed — in their hostel or another branch.
// Loads the resident and the chosen hostel's free beds itself, so it can be
// opened from anywhere with just the resident's id.
export default function MoveResidentModal({ residentId, open, onClose, onMoved }: { residentId: string | null; open: boolean; onClose: () => void; onMoved: () => void }) {
  const { hostels } = useHostels();
  const [r, setR] = useState<any>(null);
  const [hostelId, setHostelId] = useState("");
  const [beds, setBeds] = useState<FreeBed[]>([]);
  const [loading, setLoading] = useState(false);
  const [bedsLoading, setBedsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ bedId: "", search: "", moveDate: "", monthlyRent: 0, rentFrom: "NEXT_MONTH", oldBedStatus: "AVAILABLE", reason: "", carryBalance: false });

  useEffect(() => {
    if (!open || !residentId) return;
    let alive = true;
    setLoading(true); setError(""); setR(null); setBeds([]); setHostelId("");
    (async () => {
      try {
        const { data: res } = await api.get(`/residents/${residentId}`);
        if (!alive) return;
        setR(res);
        setHostelId(res.hostel.id);
        setForm({ bedId: "", search: "", moveDate: localToday(), monthlyRent: res.monthlyRent, rentFrom: "NEXT_MONTH", oldBedStatus: "AVAILABLE", reason: "", carryBalance: false });
      } catch (e) { if (alive) setError(apiError(e)); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [open, residentId]);

  // Free beds of the chosen hostel (reloaded when the hostel changes). A
  // branch transfer can only start a new rent next month.
  useEffect(() => {
    if (!open || !hostelId) return;
    let alive = true;
    setBedsLoading(true); setBeds([]);
    setForm((f) => ({ ...f, bedId: "", search: "", rentFrom: "NEXT_MONTH" }));
    api.get("/structure/available-beds", { params: { hostelId } })
      .then(({ data }) => { if (alive) setBeds(data); })
      .catch((e) => { if (alive) setError(apiError(e)); })
      .finally(() => { if (alive) setBedsLoading(false); });
    return () => { alive = false; };
  }, [open, hostelId]);

  const current = r?.bed ? `${r.bed.room?.name} · ${r.bed.label}` : "—";
  const cross = !!r && !!hostelId && hostelId !== r.hostel.id;
  const oldHostel = r?.hostel?.name ?? "";
  const newHostel = hostels.find((h) => h.id === hostelId);
  const target = beds.find((b) => b.id === form.bedId);
  const oldRent: number = r?.monthlyRent ?? 0;
  const rentChanges = Math.abs((form.monthlyRent || 0) - oldRent) > 0.5;
  const q = form.search.trim().toLowerCase();
  const matches = beds.filter((b) => !q || `${b.roomName} ${b.label} ${b.floor}`.toLowerCase().includes(q));

  // Preview of the move month when the new rent starts on the move date.
  const mv = parseDay(form.moveDate);
  const nextMonthLabel = mv ? `${MONTHS[mv.m % 12]} ${mv.m === 12 ? mv.y + 1 : mv.y}` : "next month";
  // Mirrors the server: days before the move stay billed as they are; days
  // from the move day are re-priced at the new rent.
  let split: null | { label: string; from: string; newDays: number; dim: number; before: number; amount: number; tailPerDay: number } = null;
  if (mv && rentChanges && form.rentFrom === "MOVE_DATE" && !cross && r?.admissionDate) {
    const dim = new Date(mv.y, mv.m, 0).getDate();
    const adm = parseDay(String(r.admissionDate));
    const isJoin = !!adm && adm.y === mv.y && adm.m === mv.m;
    const startDay = isJoin && r.proratedFirst ? adm!.d : 1;
    const newDays = dim - mv.d + 1;
    const ym = `${mv.y}-${String(mv.m).padStart(2, "0")}`;
    const charge = (r.rentCharges ?? []).find((c: any) => c.periodYear === mv.y && c.periodMonth === mv.m);
    const earlier = (r.roomHistory ?? []).find((h: any) => h.rentFrom === "MOVE_DATE" && String(h.movedOn).startsWith(ym));
    const before = charge ? charge.amount : Math.round((oldRent * (dim - startDay + 1)) / dim);
    const tailPerDay = earlier ? earlier.newRent / dim : before / (dim - startDay + 1);
    const amount = Math.max(0, Math.round(before - tailPerDay * newDays + (form.monthlyRent * newDays) / dim));
    split = { label: `${MONTHS[mv.m - 1]} ${mv.y}`, from: `${mv.d} ${MONTHS[mv.m - 1]}`, newDays, dim, before, amount, tailPerDay };
  }
  // Branch transfer: rent still unpaid up to the move month is the old
  // branch's — record it first, or carry it to the new branch.
  const moveYm = mv ? mv.y * 12 + (mv.m - 1) : Infinity;
  const arrears: number = cross
    ? (r?.rentCharges ?? []).filter((c: any) => c.periodYear * 12 + (c.periodMonth - 1) <= moveYm).reduce((s: number, c: any) => s + (c.balance || 0), 0)
    : 0;
  const moveMonthLabel = mv ? `${MONTHS[mv.m - 1]} ${mv.y}` : "The move month";
  const blockedByArrears = cross && arrears > 0.5 && !form.carryBalance;

  // A move can't be dated before joining or before their last room change;
  // a branch transfer is dated within this month.
  const monthStart = `${localToday().slice(0, 8)}01`;
  const minDate = [String(r?.admissionDate ?? "").slice(0, 10), r?.roomHistory?.[0]?.movedOn ?? "", cross ? monthStart : ""].sort().pop() || undefined;

  function pickBed(b: FreeBed) {
    // Suggest the new bed's rate; the owner can keep the current rent instead.
    setForm({ ...form, bedId: b.id, monthlyRent: b.monthlyRent });
  }

  async function submit() {
    if (!r || !target) { setError("Choose the new bed."); return; }
    setSaving(true); setError("");
    try {
      await api.post(`/residents/${r.id}/move`, {
        bedId: target.id,
        moveDate: form.moveDate,
        monthlyRent: form.monthlyRent,
        rentFrom: form.rentFrom,
        oldBedStatus: form.oldBedStatus,
        reason: form.reason || undefined,
        carryBalance: cross ? form.carryBalance : undefined,
      });
      toast.success(`${r.fullName} moved to ${cross && newHostel ? `${newHostel.name} · ` : ""}${target.roomName} · ${target.label}.`);
      onMoved();
      onClose();
    } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={r ? `Move resident — ${r.fullName}` : "Move resident"}>
      {loading || !r ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">{loading ? "Loading…" : ""}</p>
          <ErrorText>{error}</ErrorText>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm flex items-center justify-between gap-2">
            <span className="text-slate-500">Now in</span>
            <span className="font-medium text-slate-800 text-right">{hostels.length > 1 ? `${oldHostel} · ` : ""}{current} · {formatPKR(oldRent)}/month</span>
          </div>

          {hostels.length > 1 && (
            <Select label="Move to hostel" value={hostelId} onChange={(e) => setHostelId(e.target.value)}>
              {hostels.map((h) => <option key={h.id} value={h.id}>{h.name}{h.id === r.hostel.id ? " (same hostel — change room)" : " (branch transfer)"}</option>)}
            </Select>
          )}

          {bedsLoading ? (
            <p className="text-sm text-slate-500">Loading free beds…</p>
          ) : beds.length === 0 ? (
            <p className="text-sm text-slate-500">There's no free bed in {newHostel?.name ?? oldHostel} right now. Free up or add a bed in <b>Rooms &amp; Beds</b>, then try again.</p>
          ) : (
            <>
              <div>
                <span className="label">New bed <span className="font-normal text-slate-400">· {beds.length} free in {newHostel?.name ?? oldHostel}</span></span>
                <input className="input" placeholder="Search room or bed…" value={form.search} onChange={(e) => setForm({ ...form, search: e.target.value })} />
                <div className="mt-2 max-h-48 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {matches.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-slate-400">No free bed matches “{form.search}”.</p>
                  ) : matches.map((b) => {
                    const on = b.id === form.bedId;
                    return (
                      <button type="button" key={b.id} onClick={() => pickBed(b)}
                        className={clsx("w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm", on ? "bg-brand-50" : "hover:bg-slate-50")}>
                        <span className="min-w-0">
                          <span className={clsx("block truncate font-medium", on ? "text-brand-700" : "text-slate-700")}>{b.roomName} · {b.label}</span>
                          {b.floor && <span className="block text-xs text-slate-400">{b.floor}</span>}
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-slate-500">{formatPKR(b.monthlyRent)}</span>
                          <span className={clsx("h-4 w-4 rounded-full border-2", on ? "border-brand-600 bg-brand-600 shadow-[inset_0_0_0_2px_white]" : "border-slate-300")} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input label="Move date" type="date" value={form.moveDate} max={localToday()} min={minDate} onChange={(e) => setForm({ ...form, moveDate: e.target.value })} />
                <MoneyInput label="Monthly rent after move" value={form.monthlyRent} onChange={(n) => setForm({ ...form, monthlyRent: n })} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setForm({ ...form, monthlyRent: oldRent })}
                  className={clsx("rounded-lg border px-2.5 py-1 text-xs font-medium", !rentChanges ? "border-brand-400 text-brand-700 bg-brand-50" : "border-slate-200 text-slate-600 hover:border-brand-400")}>
                  Keep current rent: {formatPKR(oldRent)}
                </button>
                {target && Math.abs(target.monthlyRent - oldRent) > 0.5 && (
                  <button type="button" onClick={() => setForm({ ...form, monthlyRent: target.monthlyRent })}
                    className={clsx("rounded-lg border px-2.5 py-1 text-xs font-medium", Math.abs(form.monthlyRent - target.monthlyRent) < 0.5 ? "border-brand-400 text-brand-700 bg-brand-50" : "border-slate-200 text-slate-600 hover:border-brand-400")}>
                    New bed's rate: {formatPKR(target.monthlyRent)}
                  </button>
                )}
              </div>

              {rentChanges && (
                <>
                  <Select label="New rent starts" value={form.rentFrom} onChange={(e) => setForm({ ...form, rentFrom: e.target.value })}>
                    <option value="NEXT_MONTH">From next month ({nextMonthLabel})</option>
                    {r.billingMode === "CALENDAR" && !cross && <option value="MOVE_DATE">From the move date — split this month by days</option>}
                  </Select>
                  <div className="rounded-xl bg-brand-50 p-3 text-xs text-slate-600 space-y-1">
                    {split ? (
                      <>
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-slate-600">{split.label} rent</span>
                          <span className="font-bold text-brand-700">
                            {Math.abs(split.before - split.amount) > 0.5 && <span className="mr-1.5 text-xs font-normal text-slate-400 line-through">{formatPKR(split.before)}</span>}
                            {formatPKR(split.amount)}
                          </span>
                        </div>
                        <p>From {split.from}: {split.newDays} day{split.newDays === 1 ? "" : "s"} × {formatPerDay(form.monthlyRent / split.dim)} (new room) instead of {formatPerDay(split.tailPerDay)}. Days before the move stay as billed.</p>
                        <p>From {nextMonthLabel}: {formatPKR(form.monthlyRent)} a month. Anything already paid above the new amount counts toward next month.</p>
                      </>
                    ) : (
                      <p>This month stays at {formatPKR(oldRent)}. From {nextMonthLabel}: {formatPKR(form.monthlyRent)} a month.</p>
                    )}
                  </div>
                </>
              )}

              {cross && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900 space-y-1.5">
                  <p className="text-sm font-semibold">Branch transfer: {oldHostel} → {newHostel?.name}</p>
                  <p>• {moveMonthLabel} stays billed by {oldHostel}; {newHostel?.name} bills from {nextMonthLabel}.</p>
                  {(r.deposit?.amount ?? 0) > 0 && <p>• Security deposit {formatPKR(r.deposit.amount)} moves with them — {newHostel?.name} holds it and refunds it at checkout.</p>}
                  {r.advanceCredit > 0 && <p>• Advance credit {formatPKR(r.advanceCredit)} stays on their account and settles upcoming rent.</p>}
                  <p>• At {newHostel?.name}, rent is due {dueWindow(newHostel?.rentDueDay ?? 5)} of each month.</p>
                  {arrears > 0.5 && (
                    <label className="flex items-start gap-2 rounded-lg bg-white/80 p-2 text-slate-700 cursor-pointer">
                      <input type="checkbox" className="mt-0.5" checked={form.carryBalance} onChange={(e) => setForm({ ...form, carryBalance: e.target.checked })} />
                      <span>They still owe <b>{formatPKR(arrears)}</b> at {oldHostel}. Carry it to {newHostel?.name} to collect there — or cancel and record the payment first.</span>
                    </label>
                  )}
                </div>
              )}

              <Select label={`Old bed (${current}) after the move`} value={form.oldBedStatus} onChange={(e) => setForm({ ...form, oldBedStatus: e.target.value })}>
                <option value="AVAILABLE">Available for someone else</option>
                <option value="MAINTENANCE">Maintenance (cleaning / repair first)</option>
              </Select>
              <Input label="Reason (optional)" value={form.reason} maxLength={300} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Requested a quieter room" />
            </>
          )}

          <ErrorText>{error}</ErrorText>
          <div className="flex items-center justify-end gap-2">
            {target && <span className="mr-auto min-w-0 truncate text-xs text-slate-500">{current} → <b className="text-slate-700">{cross ? `${newHostel?.name} · ` : ""}{target.roomName} · {target.label}</b></span>}
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            {beds.length > 0 && <Button loading={saving} disabled={!target || !form.moveDate || blockedByArrears} onClick={submit}>{cross ? "Transfer resident" : "Move resident"}</Button>}
          </div>
        </div>
      )}
    </Modal>
  );
}
