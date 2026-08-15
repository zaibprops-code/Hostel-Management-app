import { useState } from "react";
import { api, apiError } from "../lib/api";
import { toast } from "../lib/toast";
import { useAuth } from "../context/AuthContext";
import { useHostels } from "../context/HostelContext";
import { usePrompt } from "../context/PromptContext";
import { useApi } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, MoneyInput, NumberInput, Select, ErrorText, PageLoader, EmptyState } from "../components/ui";
import { formatPKR } from "../lib/format";
import { IconHostel, IconPlus } from "../components/icons";

const BLANK = { name: "", code: "", city: "Islamabad", gender: "MALE", propertyRent: 0, propertyDeposit: 0, noticePeriodDays: 30, rentDueDay: 10, contactNumber: "", address: "" };

export default function HostelsPage() {
  const { can } = useAuth();
  const { reload } = useHostels();
  const prompt = usePrompt();
  const { data, loading, refetch } = useApi<any[]>("/hostels");
  const [open, setOpen] = useState(false);
  // null = creating a new hostel; otherwise the id of the hostel being edited.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(BLANK);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const manage = can("hostels.manage");

  function openCreate() {
    setEditingId(null);
    setForm(BLANK);
    setError("");
    setOpen(true);
  }
  function openEdit(h: any) {
    setEditingId(h.id);
    setForm({
      name: h.name ?? "", code: h.code ?? "", city: h.city ?? "", gender: h.gender ?? "MALE",
      propertyRent: h.propertyRent ?? 0, propertyDeposit: h.propertyDeposit ?? 0,
      noticePeriodDays: h.noticePeriodDays ?? 30, rentDueDay: h.rentDueDay ?? 10,
      contactNumber: h.contactNumber ?? "", address: h.address ?? "",
    });
    setError("");
    setOpen(true);
  }

  async function save() {
    setSaving(true); setError("");
    try {
      if (editingId) await api.put(`/hostels/${editingId}`, form);
      else await api.post("/hostels", form);
      setOpen(false);
      await refetch(); await reload();
    } catch (err) { setError(apiError(err)); } finally { setSaving(false); }
  }

  // Generate (once) and copy the public resident-registration link for a hostel.
  async function copyIntakeLink(h: any) {
    try {
      const { data } = await api.post(`/hostels/${h.id}/intake-link`, {});
      const link = `${window.location.origin}/intake/${data.token}`;
      try {
        await navigator.clipboard.writeText(link);
        toast.success("Registration link copied — paste it into WhatsApp to share.");
      } catch {
        // Clipboard blocked (e.g. some in-app browsers): show it to copy by hand.
        await prompt({ title: "Resident registration link", message: "Copy this link and share it with residents:", label: "Link", defaultValue: link, confirmLabel: "Done" });
      }
    } catch (err) { toast.error(apiError(err)); }
  }

  // Deleting a hostel wipes the whole branch, so we make the owner type its
  // name to confirm — the standard guard against an accidental, irreversible
  // teardown. No need to empty the branch by hand first.
  async function askDelete(h: any) {
    const typed = await prompt({
      title: `Delete "${h.name}"?`,
      message:
        "This permanently deletes this hostel and EVERYTHING in it — residents, rooms, beds, payments, deposits, expenses, income, staff, inventory and every record. This cannot be undone.\n\nType the hostel name to confirm.",
      label: "Hostel name",
      placeholder: h.name,
      confirmLabel: "Delete forever",
      required: true,
    });
    if (typed === null) return; // cancelled
    if (typed.trim().toLowerCase() !== String(h.name).trim().toLowerCase()) {
      toast.error("The name didn't match — nothing was deleted.");
      return;
    }
    try {
      await api.delete(`/hostels/${h.id}`);
      toast.success(`"${h.name}" was deleted.`);
      await refetch(); await reload();
    } catch (err) {
      toast.error(apiError(err));
    }
  }

  if (loading) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Hostels"
        subtitle="Manage your branches"
        actions={manage && <Button onClick={openCreate}><IconPlus className="h-4 w-4" /> New Hostel</Button>}
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
              {manage && (
                <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                  <Button variant="secondary" className="w-full" onClick={() => copyIntakeLink(h)}>🔗 Copy resident registration link</Button>
                  <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1" onClick={() => openEdit(h)}>Edit</Button>
                    <Button variant="danger" className="flex-1" onClick={() => askDelete(h)}>Delete</Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? "Edit Hostel" : "New Hostel"}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <Input label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <Select label="Gender" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
            <option value="MALE">Boys</option><option value="FEMALE">Girls</option><option value="OTHER">Mixed</option>
          </Select>
          <Input label="Contact number" value={form.contactNumber} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} />
          <NumberInput label="Notice period (days)" value={form.noticePeriodDays} onChange={(n) => setForm({ ...form, noticePeriodDays: n })} />
          <NumberInput label="Rent due by (day of month)" value={form.rentDueDay} onChange={(n) => setForm({ ...form, rentDueDay: Math.min(28, Math.max(1, n)) })} />
          <MoneyInput label="Property rent (monthly)" value={form.propertyRent} onChange={(n) => setForm({ ...form, propertyRent: n })} />
          <MoneyInput label="Property deposit" value={form.propertyDeposit} onChange={(n) => setForm({ ...form, propertyDeposit: n })} />
          <div className="lg:col-span-2"><Input label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={saving} onClick={save}>{editingId ? "Save Changes" : "Create Hostel"}</Button>
        </div>
      </Modal>
    </div>
  );
}
