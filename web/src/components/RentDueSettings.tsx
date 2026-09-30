import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiError } from "../lib/api";
import { toast } from "../lib/toast";
import { useApi } from "../lib/useApi";
import { useAuth } from "../context/AuthContext";
import { useHostels } from "../context/HostelContext";
import { Card, Button, Select } from "./ui";
import { dueWindow, ordinal } from "../lib/rent";

interface HostelRent {
  id: string;
  name: string;
  rentDueDay: number;
  residents: number;
  following: number;
  exceptions: { id: string; fullName: string; billingMode: string; dueDay: number }[];
}

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

// Settings → Rent due dates: one due date per hostel that every resident
// follows, instead of setting it resident by resident.
export default function RentDueSettings() {
  const { can } = useAuth();
  const { reload } = useHostels();
  const { data, loading, refetch } = useApi<HostelRent[]>("/hostels/rent-settings");
  const manage = can("hostels.manage");

  return (
    <Card className="p-6 lg:col-span-2">
      <div id="rent" className="scroll-mt-24" />
      <h3 className="font-semibold text-slate-800 mb-1">Rent due dates</h3>
      <p className="text-sm text-slate-400 mb-4">
        Set when rent is due for each hostel. Every resident follows their hostel's date, so there's nothing to set per resident — changing it here moves everyone's unpaid rent to the new date.
      </p>
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : !data?.length ? (
        <p className="text-sm text-slate-400">No hostels yet.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {data.map((h) => <HostelRow key={h.id} h={h} manage={manage} onSaved={() => { refetch(); reload(); }} />)}
        </div>
      )}
    </Card>
  );
}

function HostelRow({ h, manage, onSaved }: { h: HostelRent; manage: boolean; onSaved: () => void }) {
  const [day, setDay] = useState(h.rentDueDay);
  const [applyToAll, setApplyToAll] = useState(false);
  const [showList, setShowList] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDay(h.rentDueDay); setApplyToAll(false); }, [h.rentDueDay, h.exceptions.length]);

  const changed = day !== h.rentDueDay || applyToAll;
  const n = h.exceptions.length;

  async function save() {
    setSaving(true);
    try {
      const { data } = await api.put(`/hostels/${h.id}/rent-settings`, { rentDueDay: day, applyToAll });
      const bits = [`${h.name}: rent due ${dueWindow(data.rentDueDay)} of each month.`];
      if (data.aligned) bits.push(`${data.aligned} resident${data.aligned === 1 ? "" : "s"} now follow it.`);
      if (data.moved) bits.push(`${data.moved} unpaid month${data.moved === 1 ? "" : "s"} moved to the new date.`);
      toast.success(bits.join(" "));
      onSaved();
    } catch (e) { toast.error(apiError(e)); } finally { setSaving(false); }
  }

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-800">{h.name}</p>
          <p className="text-xs text-slate-400">
            {h.residents === 0
              ? "No monthly residents yet."
              : n === 0
                ? `All ${h.residents} monthly resident${h.residents === 1 ? "" : "s"} follow this date.`
                : `${h.following} of ${h.residents} residents follow this date · ${n} ha${n === 1 ? "s" : "ve"} their own.`}
          </p>
        </div>
        <div className="w-full sm:w-56">
          <Select label="Rent due by" value={String(day)} disabled={!manage} onChange={(e) => setDay(Number(e.target.value))}>
            {DAYS.map((d) => <option key={d} value={d}>{d === 1 ? "The 1st" : `The ${ordinal(d)} (1st–${ordinal(d)})`}</option>)}
          </Select>
        </div>
        {manage && (
          <Button className="sm:w-auto" loading={saving} disabled={!changed} onClick={save}>Save</Button>
        )}
      </div>

      {n > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50/70 border border-amber-100 px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => setShowList(!showList)} className="text-amber-800 font-medium">
              {n} resident{n === 1 ? "" : "s"} with their own due date {showList ? "▴" : "▾"}
            </button>
            {manage && (
              <label className="flex items-center gap-2 text-amber-900 cursor-pointer">
                <input type="checkbox" checked={applyToAll} onChange={(e) => setApplyToAll(e.target.checked)} />
                Make them follow the hostel's date too
              </label>
            )}
          </div>
          {applyToAll && h.exceptions.some((r) => r.billingMode === "ANCHORED") && (
            <p className="mt-1.5 text-xs text-amber-800">
              Residents on a join-day cycle switch to calendar months: their current cycle is shortened to the end of this month so no days are charged twice, and anything already paid above that counts toward next month.
            </p>
          )}
          {showList && (
            <ul className="mt-2 space-y-1">
              {h.exceptions.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
                  <Link to={`/residents/${r.id}`} className="text-slate-700 hover:underline truncate">{r.fullName}</Link>
                  <span className="text-slate-500 shrink-0">
                    {r.billingMode === "ANCHORED" ? `join-day cycle · the ${ordinal(r.dueDay)}` : `own date · by the ${ordinal(r.dueDay)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
