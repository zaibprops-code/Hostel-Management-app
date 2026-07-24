import { useState } from "react";
import { api, apiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useHostels } from "../context/HostelContext";
import { useApi, withQuery } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, Select, Textarea, ErrorText, PageLoader, StatusBadge, EmptyState } from "../components/ui";
import { formatPKR, formatDate, titleCase } from "../lib/format";
import { IconMaintenance, IconPlus } from "../components/icons";

const STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING", "COMPLETED", "CANCELLED"];

export default function MaintenancePage() {
  const { can } = useAuth();
  const { hostels, scopeParam } = useHostels();
  const { data, loading, refetch } = useApi<any[]>(withQuery("/maintenance", scopeParam), [scopeParam]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ hostelId: "", title: "", description: "", priority: "MEDIUM", roomLabel: "", estimatedCost: 0 });
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true); setError("");
    try { await api.post("/maintenance", { ...form, hostelId: form.hostelId || hostels[0]?.id }); setOpen(false); await refetch(); } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }
  async function update(id: string, patch: any) {
    try { await api.patch(`/maintenance/${id}`, patch); await refetch(); } catch (e) { alert(apiError(e)); }
  }

  if (loading) return <PageLoader />;

  return (
    <div>
      <PageHeader title="Maintenance" subtitle="Repair & maintenance tickets"
        actions={can("maintenance.manage") && <Button onClick={() => { setForm({ ...form, hostelId: hostels[0]?.id ?? "" }); setOpen(true); }}><IconPlus className="h-4 w-4" /> New Ticket</Button>} />

      {!data?.length ? <EmptyState title="No tickets" icon={<IconMaintenance className="h-12 w-12" />} /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-800">{t.title}</p>
                  <p className="text-xs text-slate-400">{t.hostel}{t.roomLabel ? ` · ${t.roomLabel}` : ""}{t.resident ? ` · ${t.resident}` : ""} · {formatDate(t.createdAt)}</p>
                </div>
                <StatusBadge status={t.priority} />
              </div>
              {t.description && <p className="text-sm text-slate-600 mt-2">{t.description}</p>}
              <div className="flex items-center justify-between mt-3">
                <span className="text-sm text-slate-500">{t.estimatedCost ? `Est. ${formatPKR(t.estimatedCost)}` : ""}{t.actualCost ? ` · Actual ${formatPKR(t.actualCost)}` : ""}</span>
                {can("maintenance.manage") ? (
                  <select className="input py-1 w-auto text-xs" value={t.status} onChange={(e) => update(t.id, { status: e.target.value })}>
                    {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                  </select>
                ) : <StatusBadge status={t.status} />}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New Maintenance Ticket">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Select label="Hostel" value={form.hostelId} onChange={(e) => setForm({ ...form, hostelId: e.target.value })}>{hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</Select>
          <Select label="Priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>{["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}</Select>
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Input label="Room / location" value={form.roomLabel} onChange={(e) => setForm({ ...form, roomLabel: e.target.value })} />
          <div className="lg:col-span-2"><Textarea label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <Input label="Estimated cost" type="number" value={form.estimatedCost} onChange={(e) => setForm({ ...form, estimatedCost: +e.target.value })} />
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={saving} onClick={save}>Create Ticket</Button></div>
      </Modal>
    </div>
  );
}
