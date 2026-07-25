import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, apiError, assetUrl } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useApi } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, MoneyInput, NumberInput, Select, ErrorText, PageLoader, StatusBadge, EmptyState } from "../components/ui";
import FileViewer from "../components/FileViewer";
import { compressPhoto, compressDocument } from "../lib/image";
import { formatPKR, formatDate, titleCase } from "../lib/format";

const DOC_TYPES: [string, string][] = [
  ["CNIC_FRONT", "CNIC (Front)"], ["CNIC_BACK", "CNIC (Back)"], ["PASSPORT", "Passport photo"],
  ["STUDENT_CARD", "Student card"], ["UNIVERSITY_CARD", "University card"], ["CONTRACT", "Contract"], ["OTHER", "Other"],
];

export default function ResidentDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const { data: r, loading, refetch } = useApi<any>(`/residents/${id}`);
  const [pay, setPay] = useState(false);
  const [notice, setNotice] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [payForm, setPayForm] = useState<any>({ amount: 0, method: "CASH", reference: "" });
  const [coForm, setCoForm] = useState<any>({ checkoutDate: new Date().toISOString().slice(0, 10), damageCharges: 0, otherCharges: 0, inspectionNotes: "" });
  const [portal, setPortal] = useState(false);
  const [portalForm, setPortalForm] = useState<any>({ email: "", password: "" });
  const [portalDone, setPortalDone] = useState("");
  const [docOpen, setDocOpen] = useState(false);
  const [docForm, setDocForm] = useState<{ type: string; file: File | null }>({ type: "CNIC_FRONT", file: null });
  const [uploading, setUploading] = useState(false);
  // Which file is open in the full-screen viewer.
  const [viewing, setViewing] = useState<null | { url: string; name: string; mime?: string | null; onDelete?: () => void }>(null);

  async function uploadPhoto(file?: File) {
    if (!file) return;
    setUploading(true); setError("");
    try { const fd = new FormData(); fd.append("file", await compressPhoto(file)); await api.post(`/uploads/resident/${id}/photo`, fd); await refetch(); }
    catch (e) { setError(apiError(e)); } finally { setUploading(false); }
  }
  async function uploadDoc() {
    if (!docForm.file) return;
    setUploading(true); setError("");
    try {
      const fd = new FormData(); fd.append("file", await compressDocument(docForm.file)); fd.append("type", docForm.type);
      await api.post(`/uploads/resident/${id}/document`, fd);
      setDocOpen(false); setDocForm({ type: "CNIC_FRONT", file: null }); await refetch();
    } catch (e) { setError(apiError(e)); } finally { setUploading(false); }
  }
  async function deleteDoc(docId: string) {
    if (!confirm("Delete this document?")) return;
    try { await api.delete(`/uploads/resident/document/${docId}`); setViewing(null); await refetch(); }
    catch (e) { alert(apiError(e)); }
  }
  async function deletePhoto() {
    if (!confirm("Remove this resident's profile photo?")) return;
    try { await api.delete(`/uploads/resident/${id}/photo`); setViewing(null); await refetch(); }
    catch (e) { alert(apiError(e)); }
  }
  async function archiveFiles() {
    if (!confirm("Archive will permanently DELETE this resident's photo and all documents from the server to free up space.\n\nMake sure you've downloaded anything you want to keep first. Continue?")) return;
    try { const { data } = await api.delete(`/uploads/resident/${id}/files`); alert(`Archived. ${data.removed} file(s) removed to free space.`); await refetch(); }
    catch (e) { alert(apiError(e)); }
  }

  async function createPortalAccess() {
    setSaving(true); setError("");
    try {
      const { data } = await api.post(`/residents/${id}/portal-access`, { email: portalForm.email || undefined, password: portalForm.password });
      setPortalDone(data.email); setPortal(false); await refetch();
    } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }

  async function recordPayment() {
    setSaving(true); setError("");
    try { await api.post("/payments", { residentId: id, ...payForm }); setPay(false); setPayForm({ amount: 0, method: "CASH", reference: "" }); await refetch(); }
    catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }
  async function giveNotice() {
    setSaving(true); setError("");
    try { await api.post(`/checkouts/${id}/notice`, { noticeDate: new Date().toISOString().slice(0, 10) }); setNotice(false); await refetch(); }
    catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }
  async function finalizeCheckout() {
    setSaving(true); setError("");
    try { await api.post(`/checkouts/${id}`, coForm); setCheckout(false); await refetch(); }
    catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }

  if (loading) return <PageLoader />;
  if (!r) return <EmptyState title="Resident not found" />;

  const active = r.status === "ACTIVE" || r.status === "NOTICE_GIVEN";

  return (
    <div>
      <PageHeader
        title={r.fullName}
        subtitle={`${r.hostel.name} · ${r.bed ? `${r.bed.room.name} / ${r.bed.label}` : "No bed assigned"}`}
        actions={
          <div className="flex gap-2 flex-wrap">
            <Link to="/admissions" className="btn-secondary">← Back</Link>
            {can("payments.manage") && active && <Button onClick={() => setPay(true)}>Record Payment</Button>}
            {can("residents.manage") && r.status === "ACTIVE" && <Button variant="secondary" onClick={() => setNotice(true)}>Give Notice</Button>}
            {can("residents.manage") && !r.userId && <Button variant="secondary" onClick={() => { setPortalForm({ email: r.email ?? "", password: "" }); setPortal(true); }}>Create Portal Login</Button>}
            {can("residents.manage") && active && <Button variant="danger" onClick={() => setCheckout(true)}>Checkout</Button>}
          </div>
        }
      />

      {portalDone && (
        <Card className="p-4 mb-4 bg-emerald-50 border-emerald-100">
          <p className="text-sm text-emerald-800">✅ Portal login created for <b>{portalDone}</b>. The resident can now sign in with that email and the password you set.</p>
        </Card>
      )}
      {r.userId && !portalDone && (
        <Card className="p-3 mb-4 bg-slate-50">
          <p className="text-sm text-slate-600">🔑 This resident has a portal login ({r.email}).</p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left: profile */}
        <Card className="p-5 lg:col-span-1">
          <div className="flex items-center gap-3 mb-4">
            <button
              type="button"
              onClick={() => r.photoUrl && setViewing({ url: assetUrl(r.photoUrl), name: `${r.fullName} — photo.jpg`, mime: "image/jpeg", onDelete: can("residents.manage") ? deletePhoto : undefined })}
              className="h-16 w-16 shrink-0 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-xl font-bold overflow-hidden"
              title={r.photoUrl ? "View photo" : ""}
            >
              {r.photoUrl ? <img src={assetUrl(r.photoUrl)} alt={r.fullName} className="h-full w-full object-cover" /> : r.fullName.charAt(0)}
            </button>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 truncate">{r.fullName}</p>
              <StatusBadge status={r.status} />
              {can("residents.manage") && (
                <label className="block text-xs text-brand-600 font-medium mt-1 cursor-pointer">
                  {uploading ? "Uploading…" : r.photoUrl ? "Change photo" : "Add photo"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadPhoto(e.target.files?.[0])} />
                </label>
              )}
            </div>
          </div>

          {/* Documents */}
          <div className="border-t border-slate-100 pt-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-slate-700">Documents</h4>
              {can("residents.manage") && <button onClick={() => { setDocForm({ type: "CNIC_FRONT", file: null }); setError(""); setDocOpen(true); }} className="text-brand-600 text-sm font-medium">+ Add</button>}
            </div>
            {!r.documents?.length ? <p className="text-xs text-slate-400">No documents uploaded.</p> : (
              <div className="space-y-1.5">
                {r.documents.map((d: any) => (
                  <button
                    key={d.id}
                    onClick={() => setViewing({ url: assetUrl(d.fileUrl), name: d.fileName || `${DOC_TYPES.find((t) => t[0] === d.type)?.[1] ?? d.type}`, mime: d.mimeType, onDelete: can("residents.manage") ? () => deleteDoc(d.id) : undefined })}
                    className="w-full flex items-center justify-between gap-2 text-sm rounded-lg bg-slate-50 hover:bg-slate-100 px-3 py-2 text-left"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{DOC_TYPES.find((t) => t[0] === d.type)?.[1] ?? titleCase(d.type)}</span>
                    <span className="text-brand-600 text-xs shrink-0">View →</span>
                  </button>
                ))}
              </div>
            )}
            {can("residents.manage") && (r.photoUrl || r.documents?.length > 0) && (
              <button onClick={archiveFiles} className="mt-3 text-xs text-slate-400 hover:text-rose-600">Archive files (free up space)</button>
            )}
          </div>
          <dl className="space-y-2 text-sm">
            {[
              ["Type", { STUDENT: "Student", PROFESSIONAL: "Professional", DAILY: "Daily guest" }[r.occupantType as string] ?? "Student"],
              ["Guardian", r.guardianName], ["Phone", r.phone], ["CNIC", r.cnic], ["City", r.city],
              ...(r.occupantType === "STUDENT" ? [["University", r.university], ["Program", r.program]] : []),
              ...(r.occupantType === "PROFESSIONAL" ? [["Company", r.company], ["Occupation", r.occupation]] : []),
              ["Food Plan", r.foodPlan?.name],
              ["Admission", formatDate(r.admissionDate)],
              ...(r.occupantType === "DAILY"
                ? [["Guests", String(r.guests ?? 1)], ["Room rate / night", formatPKR(r.dailyRate)], ["Expected checkout", r.expectedCheckout ? formatDate(r.expectedCheckout) : "—"]]
                : [["Monthly Rent", formatPKR(r.monthlyRent)]]),
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between gap-2">
                <dt className="text-slate-400">{k}</dt>
                <dd className="font-medium text-slate-700 text-right">{v || "—"}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* Right: finance */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card className="p-4"><p className="text-xs text-slate-400">Outstanding</p><p className="text-xl font-bold text-rose-600">{formatPKR(r.outstanding)}</p></Card>
            <Card className="p-4"><p className="text-xs text-slate-400">Deposit Held</p><p className="text-xl font-bold text-slate-800">{formatPKR(r.deposit?.amount ?? 0)}</p></Card>
            <Card className="p-4"><p className="text-xs text-slate-400">Monthly Rent</p><p className="text-xl font-bold text-slate-800">{formatPKR(r.monthlyRent)}</p></Card>
          </div>

          <Card className="p-5">
            <h3 className="font-semibold text-slate-800 mb-3">Rent Charges</h3>
            {!r.rentCharges.length ? <p className="text-sm text-slate-400">No charges yet.</p> : (
              <>
                {/* Mobile: rows */}
                <div className="lg:hidden divide-y divide-slate-100">
                  {r.rentCharges.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-slate-700">{c.periodMonth}/{c.periodYear}</p>
                        <p className="text-xs text-slate-400">Paid {formatPKR(c.amountPaid)} of {formatPKR(c.amount)}</p>
                      </div>
                      <div className="text-right">
                        <StatusBadge status={c.status} />
                        {c.balance > 0 && <p className="text-xs text-rose-600 font-medium mt-1">{formatPKR(c.balance)} due</p>}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop: table */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-slate-400"><th className="py-2">Period</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
                    <tbody>
                      {r.rentCharges.map((c: any) => (
                        <tr key={c.id} className="border-t border-slate-100">
                          <td className="py-2">{c.periodMonth}/{c.periodYear}</td>
                          <td>{formatPKR(c.amount)}</td><td>{formatPKR(c.amountPaid)}</td>
                          <td className={c.balance > 0 ? "text-rose-600 font-medium" : ""}>{formatPKR(c.balance)}</td>
                          <td><StatusBadge status={c.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold text-slate-800 mb-3">Payment History</h3>
            {!r.payments.length ? <p className="text-sm text-slate-400">No payments recorded.</p> : (
              <div className="divide-y divide-slate-100">
                {r.payments.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                    <span>{titleCase(p.method)} · {formatDate(p.paidAt)}</span>
                    <span className="font-semibold text-emerald-600">{formatPKR(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Payment modal */}
      <Modal open={pay} onClose={() => setPay(false)} title="Record Payment">
        <div className="space-y-3">
          <MoneyInput label="Amount" value={payForm.amount} onChange={(n) => setPayForm({ ...payForm, amount: n })} />
          <Select label="Method" value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
            {["CASH", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CARD", "OTHER"].map((m) => <option key={m} value={m}>{titleCase(m)}</option>)}
          </Select>
          <Input label="Reference (optional)" value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} />
          <p className="text-xs text-slate-400">Payment is auto-allocated to the oldest outstanding rent first.</p>
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setPay(false)}>Cancel</Button><Button loading={saving} onClick={recordPayment}>Save Payment</Button></div>
        </div>
      </Modal>

      {/* Portal login modal */}
      <Modal open={portal} onClose={() => setPortal(false)} title="Create Portal Login">
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Give {r.fullName} their own login to view rent, payments, notices and raise complaints.</p>
          <Input label="Login email" type="email" value={portalForm.email} onChange={(e) => setPortalForm({ ...portalForm, email: e.target.value })} placeholder="resident@email.com" />
          <Input label="Set a password" type="password" value={portalForm.password} onChange={(e) => setPortalForm({ ...portalForm, password: e.target.value })} minLength={8} />
          <p className="text-xs text-slate-400">Share these details with the resident. They can change the password later.</p>
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setPortal(false)}>Cancel</Button><Button loading={saving} onClick={createPortalAccess}>Create Login</Button></div>
        </div>
      </Modal>

      {/* Full-screen photo / document viewer */}
      {viewing && <FileViewer open={true} onClose={() => setViewing(null)} url={viewing.url} name={viewing.name} mime={viewing.mime} onDelete={viewing.onDelete} />}

      {/* Document upload modal */}
      <Modal open={docOpen} onClose={() => setDocOpen(false)} title="Add Document">
        <div className="space-y-3">
          <Select label="Document type" value={docForm.type} onChange={(e) => setDocForm({ ...docForm, type: e.target.value })}>
            {DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <label className="block">
            <span className="label">File (image or PDF)</span>
            <label className="input flex items-center cursor-pointer text-slate-500 truncate">
              {docForm.file ? docForm.file.name : "Choose file…"}
              <input type="file" accept="*/*" className="hidden" onChange={(e) => setDocForm({ ...docForm, file: e.target.files?.[0] ?? null })} />
            </label>
          </label>
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setDocOpen(false)}>Cancel</Button><Button loading={uploading} disabled={!docForm.file} onClick={uploadDoc}>Upload</Button></div>
        </div>
      </Modal>

      {/* Notice modal */}
      <Modal open={notice} onClose={() => setNotice(false)} title="Give Notice">
        <p className="text-sm text-slate-600">Record that {r.fullName} has given notice to leave. The expected checkout date is calculated from the hostel's notice period.</p>
        <ErrorText>{error}</ErrorText>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setNotice(false)}>Cancel</Button><Button loading={saving} onClick={giveNotice}>Confirm Notice</Button></div>
      </Modal>

      {/* Checkout modal */}
      <Modal open={checkout} onClose={() => setCheckout(false)} title="Final Checkout & Settlement">
        <div className="space-y-3">
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Outstanding rent</span><span className="font-medium text-rose-600">{formatPKR(r.outstanding)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Deposit held</span><span className="font-medium">{formatPKR(r.deposit?.amount ?? 0)}</span></div>
          </div>
          <Input label="Checkout date" type="date" value={coForm.checkoutDate} onChange={(e) => setCoForm({ ...coForm, checkoutDate: e.target.value })} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <MoneyInput label="Damage charges" value={coForm.damageCharges} onChange={(n) => setCoForm({ ...coForm, damageCharges: n })} />
            <MoneyInput label="Other charges" value={coForm.otherCharges} onChange={(n) => setCoForm({ ...coForm, otherCharges: n })} />
          </div>
          <div className="rounded-lg bg-emerald-50 p-3 text-sm flex justify-between">
            <span className="text-emerald-700 font-medium">Estimated refund</span>
            <span className="font-bold text-emerald-700">{formatPKR(Math.max(0, (r.deposit?.amount ?? 0) - r.outstanding - coForm.damageCharges - coForm.otherCharges))}</span>
          </div>
          <Input label="Inspection notes" value={coForm.inspectionNotes} onChange={(e) => setCoForm({ ...coForm, inspectionNotes: e.target.value })} />
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCheckout(false)}>Cancel</Button><Button variant="danger" loading={saving} onClick={finalizeCheckout}>Finalize Checkout</Button></div>
        </div>
      </Modal>
    </div>
  );
}
