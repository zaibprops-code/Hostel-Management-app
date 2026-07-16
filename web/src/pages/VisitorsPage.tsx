import { useState } from "react";
import { api, apiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useHostels } from "../context/HostelContext";
import { useApi, withQuery } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, Select, ErrorText, PageLoader, Badge, EmptyState } from "../components/ui";
import { formatDateTime } from "../lib/format";
import { IconVisitor, IconPlus } from "../components/icons";

export default function VisitorsPage() {
  const { can } = useAuth();
  const { hostels, scopeParam } = useHostels();
  const { data, loading, refetch } = useApi<any[]>(withQuery("/visitors", scopeParam), [scopeParam]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ hostelId: "", name: "", cnic: "", phone: "", purpose: "", notes: "" });
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true); setError("");
    try { await api.post("/visitors", { ...form, hostelId: form.hostelId || hostels[0]?.id }); setOpen(false); await refetch(); } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }
  async function checkout(id: string) { try { await api.patch(`/visitors/${id}/checkout`); await refetch(); } catch (e) { alert(apiError(e)); } }

  if (loading) return <PageLoader />;

  return (
    <div>
      <PageHeader title="Visitors" subtitle="Visitor log"
        actions={can("visitors.manage") && <Button onClick={() => { setForm({ ...form, hostelId: hostels[0]?.id ?? "" }); setOpen(true); }}><IconPlus className="h-4 w-4" /> Register Visitor</Button>} />

      {!data?.length ? <EmptyState title="No visitors logged" icon={<IconVisitor className="h-12 w-12" />} /> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50"><tr><th className="th">Visitor</th><th className="th">Phone</th><th className="th">Purpose</th><th className="th">Arrival</th><th className="th">Departure</th><th className="th">Hostel</th><th className="th"></th></tr></thead>
              <tbody>
                {data.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <td className="td font-medium text-slate-800">{v.name}<p className="text-xs text-slate-400">{v.cnic ?? ""}</p></td>
                    <td className="td">{v.phone ?? "—"}</td>
                    <td className="td">{v.purpose ?? "—"}</td>
                    <td className="td">{formatDateTime(v.arrivalTime)}</td>
                    <td className="td">{v.departureTime ? formatDateTime(v.departureTime) : <Badge color="green">Inside</Badge>}</td>
                    <td className="td">{v.hostel}</td>
                    <td className="td text-right">{can("visitors.manage") && !v.departureTime && <button onClick={() => checkout(v.id)} className="text-brand-600 hover:underline text-sm">Check out</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Register Visitor">
        <div className="grid grid-cols-2 gap-3">
          <Select label="Hostel" value={form.hostelId} onChange={(e) => setForm({ ...form, hostelId: e.target.value })}>{hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</Select>
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="CNIC" value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Purpose" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
          <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={saving} onClick={save}>Register</Button></div>
      </Modal>
    </div>
  );
}
