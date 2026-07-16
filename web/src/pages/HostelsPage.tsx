import { useState } from "react";
import { api, apiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useHostels } from "../context/HostelContext";
import { useApi } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, Select, ErrorText, PageLoader, EmptyState } from "../components/ui";
import { formatPKR } from "../lib/format";
import { IconHostel, IconPlus } from "../components/icons";

export default function HostelsPage() {
  const { can } = useAuth();
  const { reload } = useHostels();
  const { data, loading, refetch } = useApi<any[]>("/hostels");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ name: "", code: "", city: "Islamabad", gender: "MALE", propertyRent: 0, propertyDeposit: 0, noticePeriodDays: 30, contactNumber: "", address: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true); setError("");
    try {
      await api.post("/hostels", form);
      setOpen(false);
      setForm({ name: "", code: "", city: "Islamabad", gender: "MALE", propertyRent: 0, propertyDeposit: 0, noticePeriodDays: 30, contactNumber: "", address: "" });
      await refetch(); await reload();
    } catch (err) { setError(apiError(err)); } finally { setSaving(false); }
  }

  if (loading) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Hostels"
        subtitle="Manage your branches"
        actions={can("hostels.manage") && <Button onClick={() => setOpen(true)}><IconPlus className="h-4 w-4" /> New Hostel</Button>}
      />
      {!data?.length ? (
        <EmptyState title="No hostels yet" message="Create your first hostel branch to get started." icon={<IconHostel className="h-12 w-12" />} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((h) => (
            <Card key={h.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-lg bg-brand-50 text-brand-600 grid place-items-center"><IconHostel /></div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{h.name}</h3>
                    <p className="text-xs text-slate-400">{h.code} · {h.city}</p>
                  </div>
                </div>
                <span className="text-xs font-semibold rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{h.gender ?? "—"}</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 py-2">
                  <p className="text-lg font-bold text-slate-800">{h.stats.occupancyRate}%</p>
                  <p className="text-[11px] text-slate-400">Occupancy</p>
                </div>
                <div className="rounded-lg bg-slate-50 py-2">
                  <p className="text-lg font-bold text-slate-800">{h.stats.occupiedBeds}/{h.stats.totalBeds}</p>
                  <p className="text-[11px] text-slate-400">Beds</p>
                </div>
                <div className="rounded-lg bg-slate-50 py-2">
                  <p className="text-lg font-bold text-slate-800">{h.stats.activeResidents}</p>
                  <p className="text-[11px] text-slate-400">Residents</p>
                </div>
              </div>
              <div className="mt-4 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Property rent</span><span className="font-medium text-slate-700">{formatPKR(h.propertyRent)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Property deposit</span><span className="font-medium text-slate-700">{formatPKR(h.propertyDeposit)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Contact</span><span className="font-medium text-slate-700">{h.contactNumber ?? "—"}</span></div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New Hostel">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <Input label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <Select label="Gender" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
            <option value="MALE">Boys</option><option value="FEMALE">Girls</option><option value="OTHER">Mixed</option>
          </Select>
          <Input label="Contact number" value={form.contactNumber} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} />
          <Input label="Notice period (days)" type="number" value={form.noticePeriodDays} onChange={(e) => setForm({ ...form, noticePeriodDays: +e.target.value })} />
          <Input label="Property rent (monthly)" type="number" value={form.propertyRent} onChange={(e) => setForm({ ...form, propertyRent: +e.target.value })} />
          <Input label="Property deposit" type="number" value={form.propertyDeposit} onChange={(e) => setForm({ ...form, propertyDeposit: +e.target.value })} />
          <div className="col-span-2"><Input label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={saving} onClick={save}>Create Hostel</Button>
        </div>
      </Modal>
    </div>
  );
}
