import { useState } from "react";
import { api, apiError } from "../lib/api";
import { toast } from "../lib/toast";
import { useAuth } from "../context/AuthContext";
import { useHostels } from "../context/HostelContext";
import { usePrompt } from "../context/PromptContext";
import { useApi } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, MoneyInput, NumberInput, Select, ErrorText, PageLoader, EmptyState } from "../components/ui";
import { formatPKR } from "../lib/format";
import { qrSvg } from "../lib/qr";
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
  // Registration-link + QR modal.
  const [intake, setIntake] = useState<{ hostelId: string; hostelName: string; link: string; svg: string } | null>(null);
  const [intakeBusy, setIntakeBusy] = useState(false);

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

  // Mint a fresh SINGLE-USE registration link for a hostel and open the share
  // modal (link + printable QR). Each call creates a new unique link that works
  // exactly once — generate one per prospective resident.
  async function openIntake(h: { id: string; name: string }) {
    setIntakeBusy(true);
    try {
      const { data } = await api.post(`/hostels/${h.id}/intake-link`, {});
      const link = `${window.location.origin}/intake/${data.token}`;
      setIntake({ hostelId: h.id, hostelName: h.name, link, svg: qrSvg(link) });
    } catch (err) { toast.error(apiError(err)); } finally { setIntakeBusy(false); }
  }
  async function copyIntakeLink() {
    if (!intake) return;
    try { await navigator.clipboard.writeText(intake.link); toast.success("Link copied — paste it into WhatsApp to share."); }
    catch { toast.error("Couldn't copy automatically — tap and hold the link to copy it."); }
  }
  // Open a print-friendly page with the QR + link so it can be printed or saved
  // as a PDF and stuck at the entrance.
  function printIntake() {
    if (!intake) return;
    const w = window.open("", "_blank", "width=480,height=680");
    if (!w) { toast.error("Please allow pop-ups to print the QR code."); return; }
    w.document.write(
      `<!doctype html><title>${intake.hostelName} — Registration</title>` +
      `<div style="font-family:system-ui,sans-serif;text-align:center;padding:40px">` +
      `<h1 style="font-size:22px;margin:0 0 4px">${intake.hostelName}</h1>` +
      `<p style="color:#555;margin:0 0 20px">Scan to register as a resident</p>` +
      `<div style="width:300px;margin:0 auto">${intake.svg}</div>` +
      `<p style="color:#777;font-size:12px;word-break:break-all;margin-top:20px">${intake.link}</p>` +
      `</div><script>window.onload=function(){window.print()}</script>`
    );
    w.document.close();
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
                  <Button variant="secondary" className="w-full" onClick={() => openIntake(h)}>🔗 Resident registration link &amp; QR</Button>
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

      <Modal open={!!intake} onClose={() => setIntake(null)} title="One-time registration link">
        {intake && (
          <div className="space-y-4">
            <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800">
              🔑 This is a <b>single-use</b> link for <b>one</b> resident of <b>{intake.hostelName}</b>. It stops working the moment they submit the form. Generate a new one for each new resident.
            </div>
            <div className="mx-auto w-56 h-56 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: intake.svg }} />
            <div className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600 break-all text-center">{intake.link}</div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={copyIntakeLink}>Copy link</Button>
              <Button className="flex-1" onClick={printIntake}>Print QR</Button>
            </div>
            <button
              type="button"
              disabled={intakeBusy}
              onClick={() => openIntake({ id: intake.hostelId, name: intake.hostelName })}
              className="w-full text-center text-sm font-medium text-brand-600 hover:underline disabled:opacity-50"
            >
              {intakeBusy ? "Generating…" : "↻ Generate a new one-time link"}
            </button>
            <p className="text-xs text-slate-400 text-center">Send the link or QR to one person on WhatsApp. It expires after 30 days if unused.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
