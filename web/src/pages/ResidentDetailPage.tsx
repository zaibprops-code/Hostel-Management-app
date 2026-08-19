import { useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api, apiError, assetUrl } from "../lib/api";
import { toast } from "../lib/toast";
import { useConfirm } from "../context/ConfirmContext";
import { useAuth } from "../context/AuthContext";
import { useApi } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, MoneyInput, NumberInput, Select, ErrorText, PageLoader, StatusBadge, EmptyState } from "../components/ui";
import FileViewer from "../components/FileViewer";
import { compressPhoto, compressDocument } from "../lib/image";
import { uploadFile } from "../lib/upload";
import { formatPKR, formatDate, formatDateTime, titleCase } from "../lib/format";
import { elementToPdf } from "../lib/pdfExport";
import { downloadFile, shareFile, canShareFiles } from "../lib/download";

const DOC_TYPES: [string, string][] = [
  ["CNIC_FRONT", "CNIC (Front)"], ["CNIC_BACK", "CNIC (Back)"], ["PASSPORT", "Passport photo"],
  ["STUDENT_CARD", "Student card"], ["UNIVERSITY_CARD", "University card"], ["JOB_CARD", "Job / employee card"], ["CONTRACT", "Contract"], ["OTHER", "Other"],
];

export default function ResidentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { can, user } = useAuth();
  const { data: r, loading, refetch } = useApi<any>(`/residents/${id}`);
  const pdfRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<"" | "save" | "share">("");
  const [admitOpen, setAdmitOpen] = useState(false);
  const [availBeds, setAvailBeds] = useState<any[]>([]);
  const [admitForm, setAdmitForm] = useState<any>({ bedId: "", admissionDate: new Date().toISOString().slice(0, 10), monthlyRent: 0, depositAmount: 0, initialPayment: 0, paymentMethod: "CASH" });
  const [pay, setPay] = useState(false);
  const [notice, setNotice] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [payForm, setPayForm] = useState<any>({ amount: 0, method: "CASH", reference: "" });
  const [payProof, setPayProof] = useState<File | null>(null);
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
    try { await uploadFile({ scope: "resident.photo", residentId: id!, file: await compressPhoto(file) }); await refetch(); }
    catch (e) { setError(apiError(e)); } finally { setUploading(false); }
  }
  async function uploadDoc() {
    if (!docForm.file) return;
    setUploading(true); setError("");
    try {
      await uploadFile({ scope: "resident.document", residentId: id!, documentType: docForm.type, file: await compressDocument(docForm.file) });
      setDocOpen(false); setDocForm({ type: "CNIC_FRONT", file: null }); await refetch();
    } catch (e) { setError(apiError(e)); } finally { setUploading(false); }
  }
  async function deleteDoc(docId: string) {
    if (!(await confirm({ title: "Delete document?", message: "This document will be permanently removed.", confirmLabel: "Delete", danger: true }))) return;
    try { await api.delete(`/uploads/resident/document/${docId}`); setViewing(null); await refetch(); toast.success("Document deleted."); }
    catch (e) { toast.error(apiError(e)); }
  }
  async function deletePhoto() {
    if (!(await confirm({ title: "Remove photo?", message: "This resident's profile photo will be removed.", confirmLabel: "Remove", danger: true }))) return;
    try { await api.delete(`/uploads/resident/${id}/photo`); setViewing(null); await refetch(); toast.success("Photo removed."); }
    catch (e) { toast.error(apiError(e)); }
  }
  async function archiveFiles() {
    if (!(await confirm({ title: "Archive files?", message: "This permanently DELETES this resident's photo and all documents from the server to free up space. Download anything you want to keep first.", confirmLabel: "Archive & delete", danger: true }))) return;
    try { const { data } = await api.delete(`/uploads/resident/${id}/files`); toast.success(`Archived. ${data.removed} file(s) removed to free space.`); await refetch(); }
    catch (e) { toast.error(apiError(e)); }
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
    try {
      const { data } = await api.post("/payments", { residentId: id, ...payForm });
      if (payProof && data?.id) {
        await uploadFile({ scope: "payment.proof", paymentId: data.id, file: await compressDocument(payProof) }).catch(() => {});
      }
      setPay(false); setPayForm({ amount: 0, method: "CASH", reference: "" }); setPayProof(null); await refetch();
    } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }
  async function uploadPaymentProof(paymentId: string, file?: File) {
    if (!file) return;
    try { await uploadFile({ scope: "payment.proof", paymentId, file: await compressDocument(file) }); await refetch(); toast.success("Receipt attached."); }
    catch (e) { toast.error(apiError(e)); }
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

  // Admit a reviewed (RESERVED) resident: pick an available bed and check them
  // in via the standard admission workflow.
  async function openAdmit() {
    setError("");
    try {
      const { data } = await api.get(`/structure/available-beds?hostelId=${r.hostel.id}`);
      setAvailBeds(data);
      setAdmitForm({ bedId: data[0]?.id ?? "", admissionDate: new Date().toISOString().slice(0, 10), monthlyRent: data[0]?.monthlyRent ?? r.monthlyRent ?? 0, depositAmount: 0, initialPayment: 0, paymentMethod: "CASH" });
      setAdmitOpen(true);
    } catch (e) { toast.error(apiError(e)); }
  }
  async function admit() {
    if (!admitForm.bedId) { setError("Please select a bed."); return; }
    setSaving(true); setError("");
    try {
      await api.post("/admissions", { residentId: id, bedId: admitForm.bedId, admissionDate: admitForm.admissionDate, monthlyRent: admitForm.monthlyRent, depositAmount: admitForm.depositAmount, initialPayment: admitForm.initialPayment, paymentMethod: admitForm.paymentMethod });
      setAdmitOpen(false); toast.success("Resident admitted and bed assigned."); await refetch();
    } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }

  // Permanently remove a resident (mistaken entry, or a full purge after they
  // left). Checkout is the softer path that keeps their history.
  async function deleteResident() {
    const ok = await confirm({
      title: "Delete resident?",
      message: `Permanently delete ${r.fullName} and all their payments, rent charges, deposit and documents. This can't be undone. For someone who has simply left, use Checkout instead — it keeps the full record.`,
      confirmLabel: "Delete permanently",
      danger: true,
    });
    if (!ok) return;
    try { await api.delete(`/residents/${id}`); toast.success(`${r.fullName} was deleted.`); navigate("/admissions"); }
    catch (e) { toast.error(apiError(e)); }
  }

  // Export the resident's full profile — personal details, accommodation and
  // finances — as a real PDF document (saved to disk or shared on mobile).
  async function exportProfile(mode: "save" | "share") {
    if (!pdfRef.current) return;
    setExporting(mode);
    try {
      const pdf = await elementToPdf(pdfRef.current);
      const name = `Resident-${(r.fullName || "profile").replace(/\s+/g, "_")}-${String(r.id).slice(-6)}.pdf`;
      if (mode === "save") await downloadFile(pdf, name);
      else await shareFile(pdf, name);
    } catch { toast.error("Could not create the PDF. Please try again."); }
    finally { setExporting(""); }
  }

  if (loading) return <PageLoader />;
  if (!r) return <EmptyState title="Resident not found" />;

  const active = r.status === "ACTIVE" || r.status === "NOTICE_GIVEN";

  return (
    <div>
      <PageHeader
        title={r.fullName}
        mobileTitle
        actions={
          <div className="flex gap-2 flex-wrap">
            <Link to="/admissions" className="btn-secondary">← Back</Link>
            <Button variant="secondary" loading={exporting === "save"} disabled={!!exporting} onClick={() => exportProfile("save")}>Export PDF</Button>
            {canShareFiles() && <Button variant="secondary" loading={exporting === "share"} disabled={!!exporting} onClick={() => exportProfile("share")}>Share PDF</Button>}
            {can("admissions.manage") && r.status === "RESERVED" && <Button onClick={openAdmit}>Admit / Assign Bed</Button>}
            {can("payments.manage") && active && <Button onClick={() => setPay(true)}>Record Payment</Button>}
            {can("residents.manage") && r.status === "ACTIVE" && <Button variant="secondary" onClick={() => setNotice(true)}>Give Notice</Button>}
            {can("residents.manage") && !r.userId && <Button variant="secondary" onClick={() => { setPortalForm({ email: r.email ?? "", password: "" }); setPortal(true); }}>Create Portal Login</Button>}
            {can("residents.manage") && active && <Button variant="danger" onClick={() => setCheckout(true)}>Checkout</Button>}
            {can("residents.manage") && <Button variant="secondary" className="text-rose-600" onClick={deleteResident}>Delete</Button>}
          </div>
        }
      />

      {r.pendingReview && (
        <Card className="p-4 mb-4 bg-amber-50 border-amber-200">
          <p className="text-sm text-amber-800">🆕 This resident registered themselves through your intake link. Review their details below, then <b>Admit / Assign Bed</b> to check them in. Editing anything or admitting them clears this notice.</p>
        </Card>
      )}
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
              // Extra self-intake details — shown only when the resident provided them.
              ...([
                ["Guardian phone", r.guardianPhone],
                ["Guardian occupation", r.guardianOccupation],
                ["Business address", r.businessAddress],
                ["Religion", r.religion],
                ["Blood group", r.bloodGroup],
                ["Nationality", r.nationality],
                ["Vehicle", r.vehicle],
                ["Emergency", [r.emergencyName, r.emergencyPhone].filter(Boolean).join(" · ")],
                ["Local reference", [r.localRefName, r.localRefRelation && `(${r.localRefRelation})`, r.localRefPhone].filter(Boolean).join(" · ")],
                ["Reference address", r.localRefAddress],
                ["Expected move-in", r.expectedMoveIn ? formatDate(r.expectedMoveIn) : ""],
                ["Expected stay", r.expectedStayMonths ? `${r.expectedStayMonths} months` : ""],
                ["Medical notes", r.medicalNotes],
                ["Heard via", r.howHeard],
              ].filter((row) => row[1])),
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

          {r.rentCycle && (
            <Card className={`p-5 ${r.rentCycle.status === "OVERDUE" ? "border-rose-200 bg-rose-50/40" : r.rentCycle.status === "DUE" ? "border-amber-200 bg-amber-50/40" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-slate-800">Rent cycle</h3>
                  <p className="text-xs text-slate-400">Rent is collected 1st–{r.rentCycle.dueDay} of each month.</p>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${{ PAID: "bg-emerald-100 text-emerald-700", DUE: "bg-amber-100 text-amber-700", OVERDUE: "bg-rose-100 text-rose-700" }[r.rentCycle.status as string]}`}>
                  {{ PAID: "Paid up", DUE: "Due this month", OVERDUE: "Overdue" }[r.rentCycle.status as string]}
                </span>
              </div>
              <div className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">{r.rentCycle.status === "PAID" ? "Next rent due by" : "Pay by"}</span>
                  <span className="font-semibold text-slate-800">{formatDate(r.rentCycle.nextDueDate)}</span>
                </div>
                {r.rentCycle.outstandingMonths > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Unpaid months</span>
                    <span className="font-semibold text-rose-600">{r.rentCycle.outstandingMonths} · {formatPKR(r.outstanding)}</span>
                  </div>
                )}
              </div>
              {r.rentCycle.status !== "PAID" && can("payments.manage") && active && (
                <Button className="mt-3 w-full" onClick={() => setPay(true)}>Record Payment</Button>
              )}
            </Card>
          )}

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
                  <div key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="text-slate-700 truncate">{titleCase(p.method)} · {formatDate(p.paidAt)}{p.reference ? ` · ${p.reference}` : ""}</p>
                      {p.proofUrl ? (
                        <button onClick={() => setViewing({ url: assetUrl(p.proofUrl), name: `Receipt — ${r.fullName} — ${formatDate(p.paidAt)}`, mime: p.proofMime })} className="text-xs text-brand-600 font-medium">📎 View receipt</button>
                      ) : can("payments.manage") ? (
                        <label className="text-xs text-slate-400 cursor-pointer hover:text-brand-600">＋ Attach receipt
                          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => uploadPaymentProof(p.id, e.target.files?.[0])} />
                        </label>
                      ) : null}
                    </div>
                    <span className="font-semibold text-emerald-600 shrink-0">{formatPKR(p.amount)}</span>
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
          <Input label="Reference / transaction ID (optional)" value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} />
          <label className="block">
            <span className="label">Payment proof / receipt (optional)</span>
            <label className="input flex items-center cursor-pointer text-slate-500 truncate">
              {payProof ? payProof.name : "Attach transfer screenshot or PDF…"}
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setPayProof(e.target.files?.[0] ?? null)} />
            </label>
          </label>
          <p className="text-xs text-slate-400">Payment is auto-allocated to the oldest outstanding rent first.</p>
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => { setPay(false); setPayProof(null); }}>Cancel</Button><Button loading={saving} onClick={recordPayment}>Save Payment</Button></div>
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

      {/* Admit / assign bed modal (for RESERVED residents) */}
      <Modal open={admitOpen} onClose={() => setAdmitOpen(false)} title="Admit & Assign Bed">
        <div className="space-y-3">
          {!availBeds.length ? (
            <p className="text-sm text-rose-600">No available beds in {r.hostel?.name}. Add a bed or free one first, then try again.</p>
          ) : (
            <>
              <Select label="Bed" value={admitForm.bedId} onChange={(e) => { const b = availBeds.find((x) => x.id === e.target.value); setAdmitForm({ ...admitForm, bedId: e.target.value, monthlyRent: b?.monthlyRent ?? admitForm.monthlyRent }); }}>
                {availBeds.map((b) => <option key={b.id} value={b.id}>{b.roomName} · {b.label} — {formatPKR(b.monthlyRent)}</option>)}
              </Select>
              <Input label="Admission date" type="date" value={admitForm.admissionDate} onChange={(e) => setAdmitForm({ ...admitForm, admissionDate: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <MoneyInput label="Monthly rent" value={admitForm.monthlyRent} onChange={(n) => setAdmitForm({ ...admitForm, monthlyRent: n })} />
                <MoneyInput label="Security deposit" value={admitForm.depositAmount} onChange={(n) => setAdmitForm({ ...admitForm, depositAmount: n })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MoneyInput label="Initial payment (optional)" value={admitForm.initialPayment} onChange={(n) => setAdmitForm({ ...admitForm, initialPayment: n })} />
                <Select label="Method" value={admitForm.paymentMethod} onChange={(e) => setAdmitForm({ ...admitForm, paymentMethod: e.target.value })}>
                  {["CASH", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CARD", "OTHER"].map((m) => <option key={m} value={m}>{titleCase(m)}</option>)}
                </Select>
              </div>
            </>
          )}
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdmitOpen(false)}>Cancel</Button>
            <Button loading={saving} disabled={!availBeds.length} onClick={admit}>Admit Resident</Button>
          </div>
        </div>
      </Modal>

      {/* Off-screen printable sheet — html2canvas captures this into the PDF. */}
      <div aria-hidden className="fixed left-[-10000px] top-0 pointer-events-none" style={{ width: 760 }}>
        <ResidentPdfSheet innerRef={pdfRef} r={r} company={user?.company?.name} />
      </div>
    </div>
  );
}

// A clean, print-oriented rendering of the full resident record. Rendered
// off-screen and rasterised into the exported PDF — kept dependency-free and
// self-contained so it works in the browser and the Android WebView alike.
function ResidentPdfSheet({ innerRef, r, company }: { innerRef: React.RefObject<HTMLDivElement>; r: any; company?: string }) {
  const typeLabel = ({ STUDENT: "Student", PROFESSIONAL: "Professional", DAILY: "Daily guest" } as Record<string, string>)[r.occupantType] ?? "Student";
  const floor = r.bed?.room?.floor?.name;
  const emergency = [r.emergencyName, r.emergencyRelation && `(${r.emergencyRelation})`, r.emergencyPhone].filter(Boolean).join(" ");

  const personal: [string, any][] = [
    ["Full name", r.fullName],
    ["Status", titleCase(r.status)],
    ["Resident type", typeLabel],
    ["Father / Guardian", r.guardianName],
    ["Guardian phone", r.guardianPhone],
    ["Guardian occupation", r.guardianOccupation],
    ["Date of birth", r.dateOfBirth ? formatDate(r.dateOfBirth) : ""],
    ["Gender", titleCase(r.gender)],
    ["Religion", r.religion],
    ["Nationality", r.nationality],
    ["Blood group", r.bloodGroup],
    ["CNIC", r.cnic],
    ["Phone", r.phone],
    ["WhatsApp", r.whatsapp],
    ["Email", r.email],
    ["City", r.city],
    ["Permanent address", r.permanentAddress],
    ["Current address", r.currentAddress],
    ["Business / office address", r.businessAddress],
    ["Vehicle", r.vehicle],
    ["Emergency contact", emergency],
  ];

  const localRef: [string, any][] = [
    ["Name", r.localRefName],
    ["Relationship", r.localRefRelation],
    ["Phone", r.localRefPhone],
    ["Address in city", r.localRefAddress],
  ];

  const academic: [string, any][] = r.occupantType === "STUDENT"
    ? [["University", r.university], ["Program", r.program], ["Student ID", r.studentId]]
    : r.occupantType === "PROFESSIONAL"
    ? [["Company", r.company], ["Occupation", r.occupation]]
    : [];

  const accommodation: [string, any][] = [
    ["Hostel", r.hostel?.name],
    ["Floor", floor],
    ["Room", r.bed?.room?.name],
    ["Bed", r.bed?.label],
    ["Food plan", r.foodPlan?.name],
    ["Admission date", r.admissionDate ? formatDate(r.admissionDate) : ""],
    ["Check-in date", r.checkInDate ? formatDate(r.checkInDate) : ""],
    ...(r.occupantType === "DAILY"
      ? ([["Guests", r.guests ?? 1], ["Rate / night", formatPKR(r.dailyRate)], ["Expected checkout", r.expectedCheckout ? formatDate(r.expectedCheckout) : ""]] as [string, any][])
      : ([["Monthly rent", formatPKR(r.monthlyRent)]] as [string, any][])),
  ];

  const Section = ({ title, rows }: { title: string; rows: [string, any][] }) => {
    const shown = rows.filter(([, v]) => v !== undefined && v !== null && v !== "");
    if (!shown.length) return null;
    return (
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#0f766e", textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid #e2e8f0", paddingBottom: 4, marginBottom: 8 }}>{title}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 24, rowGap: 6 }}>
          {shown.map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, borderBottom: "1px dotted #eef2f6", paddingBottom: 4 }}>
              <span style={{ color: "#94a3b8" }}>{k}</span>
              <span style={{ color: "#334155", fontWeight: 600, textAlign: "right" }}>{String(v)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const th = { textAlign: "left" as const, fontSize: 10.5, color: "#94a3b8", fontWeight: 600, padding: "6px 8px", borderBottom: "1px solid #e2e8f0" };
  const td = { fontSize: 12, color: "#334155", padding: "6px 8px", borderBottom: "1px solid #f1f5f9" };

  return (
    <div ref={innerRef} style={{ width: 760, background: "#fff", color: "#0f172a", padding: 32, fontFamily: "Arial, Helvetica, sans-serif", boxSizing: "border-box" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #0f766e", paddingBottom: 12 }}>
        <div>
          {company && <div style={{ fontSize: 20, fontWeight: 800, color: "#0f766e", lineHeight: 1.1 }}>{company}</div>}
          <div style={{ fontSize: 14, fontWeight: 600, color: "#475569" }}>{r.hostel?.name}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>RESIDENT PROFILE</div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>Generated {formatDateTime(new Date())}</div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>Ref: {String(r.id).slice(-8).toUpperCase()}</div>
        </div>
      </div>

      {/* Name + avatar */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16 }}>
        <div style={{ height: 56, width: 56, borderRadius: "50%", background: "#ccfbf1", color: "#0f766e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800 }}>{(r.fullName || "?").charAt(0).toUpperCase()}</div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{r.fullName}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>{typeLabel}{r.bed?.room?.name ? ` · Room ${r.bed.room.name}${r.bed?.label ? ` / Bed ${r.bed.label}` : ""}` : ""}</div>
        </div>
      </div>

      {/* Financial summary cards */}
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        {[["Outstanding", formatPKR(r.outstanding), "#e11d48"], ["Deposit held", formatPKR(r.deposit?.amount ?? 0), "#0f172a"], ["Monthly rent", formatPKR(r.monthlyRent), "#0f172a"]].map(([label, value, color]) => (
          <div key={label} style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ fontSize: 10.5, color: "#94a3b8" }}>{label}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
      </div>

      <Section title="Personal Information" rows={personal} />
      {!!academic.length && <Section title={r.occupantType === "STUDENT" ? "Academic Details" : "Professional Details"} rows={academic} />}
      <Section title="Local Reference (for verification)" rows={localRef} />
      <Section title="Accommodation" rows={accommodation} />

      {/* Rent charges */}
      {!!r.rentCharges?.length && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#0f766e", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Rent Charges</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Period</th><th style={th}>Amount</th><th style={th}>Paid</th><th style={th}>Balance</th><th style={th}>Status</th></tr></thead>
            <tbody>
              {r.rentCharges.map((c: any) => (
                <tr key={c.id}>
                  <td style={td}>{c.periodMonth}/{c.periodYear}</td>
                  <td style={td}>{formatPKR(c.amount)}</td>
                  <td style={td}>{formatPKR(c.amountPaid)}</td>
                  <td style={{ ...td, color: c.balance > 0 ? "#e11d48" : "#334155", fontWeight: c.balance > 0 ? 700 : 400 }}>{formatPKR(c.balance)}</td>
                  <td style={td}>{titleCase(c.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payment history */}
      {!!r.payments?.length && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#0f766e", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Payment History</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Date</th><th style={th}>Method</th><th style={th}>Reference</th><th style={{ ...th, textAlign: "right" }}>Amount</th></tr></thead>
            <tbody>
              {r.payments.map((p: any) => (
                <tr key={p.id}>
                  <td style={td}>{formatDate(p.paidAt)}</td>
                  <td style={td}>{titleCase(p.method)}</td>
                  <td style={td}>{p.reference || "—"}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#059669" }}>{formatPKR(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Deposit ledger */}
      {!!r.deposit?.transactions?.length && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#0f766e", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Security Deposit Ledger</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Date</th><th style={th}>Type</th><th style={{ ...th, textAlign: "right" }}>Amount</th><th style={th}>Note</th></tr></thead>
            <tbody>
              {r.deposit.transactions.map((t: any) => (
                <tr key={t.id}>
                  <td style={td}>{formatDate(t.createdAt)}</td>
                  <td style={td}>{titleCase(t.type)}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formatPKR(t.amount)}</td>
                  <td style={td}>{t.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Declaration + signatures — for the printed copy handed to authorities. */}
      <div style={{ marginTop: 24, border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 16px" }}>
        <div style={{ fontSize: 11.5, color: "#475569", lineHeight: 1.5 }}>
          I hereby declare that the information provided above is true and correct to the best of my knowledge.
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 28, gap: 24 }}>
          <div style={{ flex: 1 }}>
            <div style={{ borderTop: "1px solid #94a3b8", paddingTop: 4, fontSize: 11, color: "#64748b" }}>Resident signature &amp; date</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ height: 64, width: 96, border: "1px dashed #94a3b8", borderRadius: 6 }} />
            <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 4 }}>Thumb impression</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ borderTop: "1px solid #94a3b8", paddingTop: 4, fontSize: 11, color: "#64748b", textAlign: "right" }}>For office use — Reg # / Room #</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, borderTop: "1px solid #e2e8f0", paddingTop: 8, fontSize: 10.5, color: "#94a3b8", textAlign: "center" }}>
        This document was generated by {company || "the hostel management system"} on {formatDateTime(new Date())}. Figures reflect the most recent records at the time of export.
      </div>
    </div>
  );
}
