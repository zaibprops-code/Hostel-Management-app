import { useState } from "react";
import { api, apiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useHostels } from "../context/HostelContext";
import { useApi, withQuery } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, Select, Textarea, ErrorText, PageLoader, StatusBadge, EmptyState } from "../components/ui";
import { formatDate, titleCase } from "../lib/format";
import { IconComplaint, IconPlus } from "../components/icons";

const CATEGORIES = ["ROOMMATE", "NOISE", "FOOD", "CLEANLINESS", "STAFF_BEHAVIOR", "MAINTENANCE", "SECURITY", "OTHER"];
const STATUSES = ["OPEN", "UNDER_REVIEW", "IN_PROGRESS", "RESOLVED", "CLOSED"];

export default function ComplaintsPage() {
  const { can } = useAuth();
  const { hostels, scopeParam } = useHostels();
  const { data, loading, refetch } = useApi<any[]>(withQuery("/complaints", scopeParam), [scopeParam]);
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState<null | any>(null);
  const [form, setForm] = useState<any>({ hostelId: "", category: "FOOD", subject: "", description: "", priority: "MEDIUM" });
  const [replyText, setReplyText] = useState("");
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true); setError("");
    try { await api.post("/complaints", { ...form, hostelId: form.hostelId || hostels[0]?.id }); setOpen(false); await refetch(); } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }
  async function updateStatus(id: string, status: string) { try { await api.patch(`/complaints/${id}`, { status }); await refetch(); } catch (e) { alert(apiError(e)); } }
  async function sendReply() {
    setSaving(true); setError("");
    try { await api.patch(`/complaints/${reply.id}`, { response: replyText, status: "IN_PROGRESS" }); setReply(null); setReplyText(""); await refetch(); }
    catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }

  if (loading) return <PageLoader />;

  return (
    <div>
      <PageHeader title="Complaints" subtitle="Resident complaints & resolution"
        actions={<Button onClick={() => { setForm({ ...form, hostelId: hostels[0]?.id ?? "" }); setOpen(true); }}><IconPlus className="h-4 w-4" /> New Complaint</Button>} />

      {!data?.length ? <EmptyState title="No complaints" icon={<IconComplaint className="h-12 w-12" />} /> : (
        <div className="space-y-3">
          {data.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-800">{c.subject}</p>
                    <StatusBadge status={c.category} />
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{c.hostel}{c.resident ? ` · ${c.resident}` : ""} · {formatDate(c.createdAt)}</p>
                  {c.description && <p className="text-sm text-slate-600 mt-2">{c.description}</p>}
                  {c.response && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 mt-2">Response: {c.response}</p>}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {can("complaints.manage") ? (
                    <select className="input py-1 w-auto text-xs" value={c.status} onChange={(e) => updateStatus(c.id, e.target.value)}>
                      {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                    </select>
                  ) : <StatusBadge status={c.status} />}
                  {can("complaints.manage") && <button onClick={() => { setReply(c); setReplyText(c.response ?? ""); }} className="text-brand-600 hover:underline text-xs">Respond</button>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New Complaint">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label="Hostel" value={form.hostelId} onChange={(e) => setForm({ ...form, hostelId: e.target.value })}>{hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</Select>
          <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</Select>
          <div className="col-span-2"><Input label="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
          <div className="col-span-2"><Textarea label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={saving} onClick={save}>Submit</Button></div>
      </Modal>

      <Modal open={!!reply} onClose={() => setReply(null)} title="Respond to Complaint">
        <Textarea label="Response" value={replyText} onChange={(e) => setReplyText(e.target.value)} />
        <ErrorText>{error}</ErrorText>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setReply(null)}>Cancel</Button><Button loading={saving} onClick={sendReply}>Send</Button></div>
      </Modal>
    </div>
  );
}
