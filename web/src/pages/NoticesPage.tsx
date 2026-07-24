import { useState } from "react";
import { api, apiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useHostels } from "../context/HostelContext";
import { useApi, withQuery } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, Select, Textarea, ErrorText, PageLoader, Badge, EmptyState } from "../components/ui";
import { formatDate, titleCase } from "../lib/format";
import { IconNotice, IconPlus } from "../components/icons";

const TYPES = ["GENERAL", "FOOD", "MAINTENANCE", "EMERGENCY", "PAYMENT_REMINDER"];
const typeColor: Record<string, any> = { GENERAL: "gray", FOOD: "green", MAINTENANCE: "amber", EMERGENCY: "red", PAYMENT_REMINDER: "blue" };

export default function NoticesPage() {
  const { can } = useAuth();
  const { hostels, scopeParam } = useHostels();
  const { data, loading, refetch } = useApi<any[]>(withQuery("/notices", scopeParam), [scopeParam]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ hostelId: "", type: "GENERAL", title: "", body: "", pinned: false });
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true); setError("");
    try { await api.post("/notices", { ...form, hostelId: form.hostelId || undefined }); setOpen(false); await refetch(); } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }

  if (loading) return <PageLoader />;

  return (
    <div>
      <PageHeader title="Notices" subtitle="Announcements for residents & staff"
        actions={can("notices.manage") && <Button onClick={() => setOpen(true)}><IconPlus className="h-4 w-4" /> New Notice</Button>} />

      {!data?.length ? <EmptyState title="No notices" icon={<IconNotice className="h-12 w-12" />} /> : (
        <div className="space-y-3">
          {data.map((n) => (
            <Card key={n.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    {n.pinned && <span title="Pinned">📌</span>}
                    <p className="font-semibold text-slate-800">{n.title}</p>
                    <Badge color={typeColor[n.type]}>{titleCase(n.type)}</Badge>
                  </div>
                  <p className="text-sm text-slate-600 mt-1.5">{n.body}</p>
                  <p className="text-xs text-slate-400 mt-2">{n.hostel} · {formatDate(n.createdAt)}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New Notice">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label="Scope" value={form.hostelId} onChange={(e) => setForm({ ...form, hostelId: e.target.value })}>
            <option value="">Company-wide</option>
            {hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </Select>
          <Select label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select>
          <div className="col-span-2"><Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="col-span-2"><Textarea label="Body" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm col-span-2"><input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} /> Pin this notice</label>
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={saving} onClick={save}>Publish</Button></div>
      </Modal>
    </div>
  );
}
