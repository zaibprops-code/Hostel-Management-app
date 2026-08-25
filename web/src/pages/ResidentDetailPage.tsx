import { useEffect, useRef, useState } from "react";
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
  const formRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<"" | "save" | "share" | "formSave" | "formShare">("");
  const [admitOpen, setAdmitOpen] = useState(false);
  const [availBeds, setAvailBeds] = useState<any[]>([]);
  const [admitForm, setAdmitForm] = useState<any>({ bedId: "", admissionDate: new Date().toISOString().slice(0, 10), monthlyRent: 0, depositAmount: 0, initialPayment: 0, paymentMethod: "CASH", billingMode: "CALENDAR", proratedFirst: false });
  const [pay, setPay] = useState(false);
  const [notice, setNotice] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [payForm, setPayForm] = useState<any>({ amount: 0, method: "CASH", reference: "", paidAt: new Date().toISOString().slice(0, 10), chargeId: "" });
  const [payProof, setPayProof] = useState<File | null>(null);
  const [deposit, setDeposit] = useState(false);
  const [depForm, setDepForm] = useState<any>({ amount: 0, method: "CASH" });
  const [terms, setTerms] = useState(false);
  const [termsForm, setTermsForm] = useState<any>({ monthlyRent: 0, billingMode: "CALENDAR", billingDay: "" });
  const [adjust, setAdjust] = useState<null | any>(null);
  const [adjForm, setAdjForm] = useState<any>({ amount: 0, note: "" });
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

  // Open the payment modal, optionally pre-targeting a specific month's charge.
  // Amount defaults to that month's balance, or the full outstanding otherwise.
  function openPay(chargeId?: string) {
    const charge = chargeId ? r.rentCharges.find((c: any) => c.id === chargeId) : null;
    setPayForm({
      amount: charge ? charge.balance : (r.outstanding || 0),
      method: "CASH",
      reference: "",
      paidAt: new Date().toISOString().slice(0, 10),
      chargeId: chargeId || "",
    });
    setPayProof(null);
    setError("");
    setPay(true);
  }

  async function recordPayment() {
    setSaving(true); setError("");
    try {
      const { data } = await api.post("/payments", {
        residentId: id,
        amount: payForm.amount,
        method: payForm.method,
        reference: payForm.reference || undefined,
        paidAt: payForm.paidAt || undefined,
        chargeIds: payForm.chargeId ? [payForm.chargeId] : undefined,
      });
      if (payProof && data?.id) {
        await uploadFile({ scope: "payment.proof", paymentId: data.id, file: await compressDocument(payProof) }).catch(() => {});
      }
      setPay(false); setPayProof(null); await refetch();
    } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }
  async function uploadPaymentProof(paymentId: string, file?: File) {
    if (!file) return;
    try { await uploadFile({ scope: "payment.proof", paymentId, file: await compressDocument(file) }); await refetch(); toast.success("Receipt attached."); }
    catch (e) { toast.error(apiError(e)); }
  }

  function openDeposit() { setDepForm({ amount: 0, method: "CASH" }); setError(""); setDeposit(true); }
  async function recordDeposit() {
    setSaving(true); setError("");
    try { await api.post(`/residents/${id}/deposit`, depForm); setDeposit(false); await refetch(); toast.success("Security deposit recorded."); }
    catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }

  function openTerms() {
    setTermsForm({ monthlyRent: r.monthlyRent, billingMode: r.billingMode || "CALENDAR", billingDay: r.billingDay ?? "" });
    setError(""); setTerms(true);
  }
  async function saveTerms() {
    setSaving(true); setError("");
    try {
      await api.patch(`/residents/${id}/billing`, {
        monthlyRent: termsForm.monthlyRent,
        billingMode: termsForm.billingMode,
        billingDay: termsForm.billingDay === "" ? null : Number(termsForm.billingDay),
      });
      setTerms(false); await refetch(); toast.success("Rent terms updated.");
    } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }

  function openAdjust(c: any) { setAdjForm({ amount: c.amount, note: c.notes || "" }); setError(""); setAdjust(c); }
  async function saveAdjust(payload: any) {
    setSaving(true); setError("");
    try { await api.post(`/residents/${id}/charges/${adjust.id}/adjust`, payload); setAdjust(null); await refetch(); toast.success("Charge updated."); }
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

  // Admit a reviewed (RESERVED) resident: pick an available bed and check them
  // in via the standard admission workflow.
  async function openAdmit() {
    setError("");
    try {
      const { data } = await api.get(`/structure/available-beds?hostelId=${r.hostel.id}`);
      setAvailBeds(data);
      setAdmitForm({ bedId: data[0]?.id ?? "", admissionDate: new Date().toISOString().slice(0, 10), monthlyRent: data[0]?.monthlyRent ?? r.monthlyRent ?? 0, depositAmount: 0, initialPayment: 0, paymentMethod: "CASH", billingMode: "CALENDAR", proratedFirst: false });
      setAdmitOpen(true);
    } catch (e) { toast.error(apiError(e)); }
  }
  async function admit() {
    if (!admitForm.bedId) { setError("Please select a bed."); return; }
    setSaving(true); setError("");
    try {
      await api.post("/admissions", { residentId: id, bedId: admitForm.bedId, admissionDate: admitForm.admissionDate, monthlyRent: admitForm.monthlyRent, billingMode: admitForm.billingMode, proratedFirst: admitForm.proratedFirst, depositAmount: admitForm.depositAmount, initialPayment: admitForm.initialPayment, paymentMethod: admitForm.paymentMethod });
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

  // Download the clean, branded registration form — the print-ready sheet meant
  // to be handed to authorities / kept on file. Waits for the logo + photo to
  // finish loading so they render into the capture instead of coming out blank.
  async function exportForm(mode: "save" | "share") {
    if (!formRef.current) return;
    setExporting(mode === "save" ? "formSave" : "formShare");
    try {
      const imgs = Array.from(formRef.current.querySelectorAll("img"));
      await Promise.all(imgs.map((img) => img.complete ? Promise.resolve() : new Promise((res) => { img.onload = img.onerror = () => res(null); })));
      const pdf = await elementToPdf(formRef.current);
      const name = `Registration-${(r.fullName || "form").replace(/\s+/g, "_")}-${String(r.id).slice(-6)}.pdf`;
      if (mode === "save") await downloadFile(pdf, name);
      else await shareFile(pdf, name);
    } catch { toast.error("Could not create the form PDF. Please try again."); }
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
          <>
            <Link to="/admissions" className="btn-secondary">← Back</Link>
            {can("admissions.manage") && r.status === "RESERVED" && <Button onClick={openAdmit}>Admit / Assign Bed</Button>}
            {can("payments.manage") && active && <Button onClick={() => openPay()}>Record Payment</Button>}
            <MoreMenu
              busy={!!exporting}
              items={[
                { label: "📄 Registration Form", onClick: () => exportForm("save"), disabled: !!exporting },
                canShareFiles() ? { label: "📤 Share Form", onClick: () => exportForm("share"), disabled: !!exporting } : null,
                { label: "📑 Full Profile PDF", onClick: () => exportProfile("save"), disabled: !!exporting },
                canShareFiles() ? { label: "📤 Share Profile", onClick: () => exportProfile("share"), disabled: !!exporting } : null,
                (can("residents.manage") && r.occupantType !== "DAILY") ? { label: "✏️ Edit rent terms", onClick: openTerms } : null,
                (can("payments.manage") && active) ? { label: "🛡 Record deposit", onClick: openDeposit } : null,
                (can("residents.manage") && r.status === "ACTIVE") ? { label: "🔔 Give Notice", onClick: () => setNotice(true) } : null,
                (can("residents.manage") && !r.userId) ? { label: "🔑 Create Portal Login", onClick: () => { setPortalForm({ email: r.email ?? "", password: "" }); setPortal(true); } } : null,
                (can("residents.manage") && active) ? { label: "🚪 Checkout", onClick: () => setCheckout(true) } : null,
                can("residents.manage") ? { label: "🗑 Delete resident", onClick: deleteResident, danger: true } : null,
              ]}
            />
          </>
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
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">Deposit Held</p>
                {can("payments.manage") && active && <button onClick={openDeposit} className="text-xs font-medium text-brand-600">{r.deposit?.amount ? "＋" : "Record"}</button>}
              </div>
              <p className="text-xl font-bold text-slate-800">{formatPKR(r.deposit?.amount ?? 0)}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">Monthly Rent</p>
                {can("residents.manage") && <button onClick={openTerms} className="text-xs font-medium text-brand-600">Edit</button>}
              </div>
              <p className="text-xl font-bold text-slate-800">{formatPKR(r.monthlyRent)}</p>
            </Card>
            {r.advanceCredit > 0 && (
              <Card className="p-4 border-emerald-100 bg-emerald-50/40 sm:col-span-3">
                <p className="text-xs text-emerald-700">Advance credit (paid ahead) — applies to upcoming rent automatically</p>
                <p className="text-xl font-bold text-emerald-600">{formatPKR(r.advanceCredit)}</p>
              </Card>
            )}
          </div>

          {r.rentCycle && (
            <Card className={`p-5 ${r.rentCycle.status === "OVERDUE" ? "border-rose-200 bg-rose-50/40" : r.rentCycle.status === "DUE" ? "border-amber-200 bg-amber-50/40" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-slate-800">Rent cycle</h3>
                  <p className="text-xs text-slate-400">
                    {r.billingMode === "ANCHORED"
                      ? `Billed every month on day ${r.rentCycle.dueDay} (their join day).`
                      : `Calendar month — rent due by day ${r.rentCycle.dueDay}.`}
                    {r.proratedFirst ? " First month was pro-rated." : ""}
                  </p>
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
                <Button className="mt-3 w-full" onClick={() => openPay()}>Record Payment</Button>
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
                      <div className="text-right flex items-center gap-3">
                        <div>
                          <StatusBadge status={c.status} />
                          {c.balance > 0 && <p className="text-xs text-rose-600 font-medium mt-1">{formatPKR(c.balance)} due</p>}
                        </div>
                        {can("payments.manage") && (
                          <div className="flex flex-col items-end gap-1">
                            {c.balance > 0 && active && <button onClick={() => openPay(c.id)} className="text-brand-600 text-sm font-medium">Pay</button>}
                            <button onClick={() => openAdjust(c)} className="text-slate-400 text-xs font-medium">Adjust</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop: table */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-slate-400"><th className="py-2">Period</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {r.rentCharges.map((c: any) => (
                        <tr key={c.id} className="border-t border-slate-100">
                          <td className="py-2">{c.periodMonth}/{c.periodYear}</td>
                          <td>{formatPKR(c.amount)}</td><td>{formatPKR(c.amountPaid)}</td>
                          <td className={c.balance > 0 ? "text-rose-600 font-medium" : ""}>{formatPKR(c.balance)}</td>
                          <td><StatusBadge status={c.status} /></td>
                          <td className="text-right">{can("payments.manage") && (
                            <span className="inline-flex gap-3">
                              {c.balance > 0 && active && <button onClick={() => openPay(c.id)} className="text-brand-600 font-medium hover:underline">Pay</button>}
                              <button onClick={() => openAdjust(c)} className="text-slate-400 hover:text-slate-600 hover:underline">Adjust</button>
                            </span>
                          )}</td>
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
        {(() => {
          const unpaid = (r.rentCharges ?? []).filter((c: any) => c.balance > 0)
            .sort((a: any, b: any) => a.periodYear - b.periodYear || a.periodMonth - b.periodMonth);
          const target = payForm.chargeId ? unpaid.find((c: any) => c.id === payForm.chargeId) : null;
          const amt = Number(payForm.amount) || 0;
          const settleTarget = target ? (amt >= target.balance ? "full" : amt > 0 ? "partial" : "none") : null;
          return (
        <div className="space-y-3">
          {r.outstanding > 0 ? (
            <div className="rounded-lg bg-rose-50 border border-rose-100 px-3 py-2 text-sm flex items-center justify-between">
              <span className="text-rose-700">Total outstanding</span>
              <span className="font-bold text-rose-700">{formatPKR(r.outstanding)}</span>
            </div>
          ) : (
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm text-emerald-700">All rent is paid up. This will be recorded as an advance.</div>
          )}

          <Select label="Apply to" value={payForm.chargeId}
            onChange={(e) => {
              const c = unpaid.find((x: any) => x.id === e.target.value);
              setPayForm({ ...payForm, chargeId: e.target.value, amount: c ? c.balance : (r.outstanding || payForm.amount) });
            }}>
            <option value="">Oldest unpaid month first (automatic)</option>
            {unpaid.map((c: any) => (
              <option key={c.id} value={c.id}>{c.periodMonth}/{c.periodYear} — {formatPKR(c.balance)} due</option>
            ))}
          </Select>

          <div className="grid grid-cols-2 gap-3">
            <MoneyInput label="Amount" value={payForm.amount} onChange={(n) => setPayForm({ ...payForm, amount: n })} />
            <Input label="Date paid" type="date" value={payForm.paidAt} onChange={(e) => setPayForm({ ...payForm, paidAt: e.target.value })} />
          </div>

          <div className="flex flex-wrap gap-2">
            {target && (
              <button type="button" onClick={() => setPayForm({ ...payForm, amount: target.balance })}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-brand-400 hover:text-brand-600">
                This month: {formatPKR(target.balance)}
              </button>
            )}
            {r.outstanding > 0 && (
              <button type="button" onClick={() => setPayForm({ ...payForm, amount: r.outstanding, chargeId: "" })}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-brand-400 hover:text-brand-600">
                Full outstanding: {formatPKR(r.outstanding)}
              </button>
            )}
          </div>

          {settleTarget && (
            <p className="text-xs text-slate-500">
              {settleTarget === "full"
                ? `Marks ${target.periodMonth}/${target.periodYear} as fully paid${amt > target.balance ? `; extra ${formatPKR(amt - target.balance)} goes to other months / advance.` : "."}`
                : settleTarget === "partial"
                ? `Partial — ${formatPKR(target.balance - amt)} will still be due for ${target.periodMonth}/${target.periodYear}.`
                : "Enter an amount."}
            </p>
          )}

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
          {!payForm.chargeId && <p className="text-xs text-slate-400">Payment is auto-allocated to the oldest outstanding rent first.</p>}
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => { setPay(false); setPayProof(null); }}>Cancel</Button><Button loading={saving} disabled={!payForm.amount} onClick={recordPayment}>Save Payment</Button></div>
        </div>
          );
        })()}
      </Modal>

      {/* Record security deposit */}
      <Modal open={deposit} onClose={() => setDeposit(false)} title="Record Security Deposit">
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Record the security / advance deposit {r.fullName} paid. Currently held: <b className="text-slate-700">{formatPKR(r.deposit?.amount ?? 0)}</b>.</p>
          <MoneyInput label="Deposit amount" value={depForm.amount} onChange={(n) => setDepForm({ ...depForm, amount: n })} />
          <Select label="Method" value={depForm.method} onChange={(e) => setDepForm({ ...depForm, method: e.target.value })}>
            {["CASH", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CARD", "OTHER"].map((m) => <option key={m} value={m}>{titleCase(m)}</option>)}
          </Select>
          <p className="text-xs text-slate-400">Deposits are held separately from rent and refunded (minus any deductions) at checkout.</p>
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setDeposit(false)}>Cancel</Button><Button loading={saving} disabled={!depForm.amount} onClick={recordDeposit}>Save Deposit</Button></div>
        </div>
      </Modal>

      {/* Edit rent terms */}
      <Modal open={terms} onClose={() => setTerms(false)} title="Edit Rent Terms">
        <div className="space-y-3">
          <MoneyInput label="Agreed monthly rent" value={termsForm.monthlyRent} onChange={(n) => setTermsForm({ ...termsForm, monthlyRent: n })} />
          <Select label="Rent cycle" value={termsForm.billingMode} onChange={(e) => setTermsForm({ ...termsForm, billingMode: e.target.value })}>
            <option value="ANCHORED">Every month on the join day</option>
            <option value="CALENDAR">Calendar month</option>
          </Select>
          <Input label="Rent due day of month (optional)" type="number" min={1} max={28} value={termsForm.billingDay}
            onChange={(e) => setTermsForm({ ...termsForm, billingDay: e.target.value })} placeholder="Falls back to the hostel's day" />
          <p className="text-xs text-slate-400">New rent applies to future months. To change a month already charged, use <b>Adjust</b> on that row.</p>
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setTerms(false)}>Cancel</Button><Button loading={saving} onClick={saveTerms}>Save</Button></div>
        </div>
      </Modal>

      {/* Adjust a month's rent charge */}
      <Modal open={!!adjust} onClose={() => setAdjust(null)} title={adjust ? `Adjust rent — ${adjust.periodMonth}/${adjust.periodYear}` : ""}>
        {adjust && (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">Charged</span><span className="font-medium">{formatPKR(adjust.amount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Paid so far</span><span className="font-medium">{formatPKR(adjust.amountPaid)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Balance</span><span className="font-medium text-rose-600">{formatPKR(adjust.balance)}</span></div>
            </div>
            <div className="flex flex-wrap gap-2">
              {r.admissionDate && adjust.periodMonth === new Date(r.admissionDate).getMonth() + 1 && adjust.periodYear === new Date(r.admissionDate).getFullYear() && (
                <button type="button" onClick={() => saveAdjust({ prorate: true, note: "Pro-rated to join date" })}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-brand-400 hover:text-brand-600">
                  Pro-rate to join date ({new Date(r.admissionDate).getDate()}th)
                </button>
              )}
              {adjust.balance > 0 && (
                <button type="button" onClick={() => saveAdjust({ waive: true, note: "Balance waived" })}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-rose-300 hover:text-rose-600">
                  Waive the {formatPKR(adjust.balance)} balance
                </button>
              )}
            </div>
            <MoneyInput label="Set charge amount" value={adjForm.amount} onChange={(n) => setAdjForm({ ...adjForm, amount: n })} />
            <Input label="Note (optional)" value={adjForm.note} onChange={(e) => setAdjForm({ ...adjForm, note: e.target.value })} placeholder="Why it was changed" />
            <p className="text-xs text-slate-400">If more was already paid than the new amount, the extra becomes advance credit and applies to upcoming months.</p>
            <ErrorText>{error}</ErrorText>
            <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setAdjust(null)}>Cancel</Button><Button loading={saving} onClick={() => saveAdjust({ amount: adjForm.amount, note: adjForm.note || undefined })}>Save</Button></div>
          </div>
        )}
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
              <Select label="Rent cycle" value={admitForm.billingMode} onChange={(e) => setAdmitForm({ ...admitForm, billingMode: e.target.value })}>
                <option value="ANCHORED">Every month on the join day (e.g. 12th → 12th)</option>
                <option value="CALENDAR">Calendar month</option>
              </Select>
              {admitForm.billingMode === "CALENDAR" && (
                <Select label="First charge" value={admitForm.proratedFirst ? "PRO" : "FULL"} onChange={(e) => setAdmitForm({ ...admitForm, proratedFirst: e.target.value === "PRO" })}>
                  <option value="FULL">Charge a full month now</option>
                  <option value="PRO">Charge only the remaining days this month (pro-rata)</option>
                </Select>
              )}
              {(() => {
                const rent = admitForm.monthlyRent || 0;
                const d = new Date(admitForm.admissionDate);
                let first = Math.round(rent);
                if (admitForm.billingMode === "CALENDAR" && admitForm.proratedFirst && !isNaN(d.getTime())) {
                  const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
                  first = Math.round((rent * (dim - d.getDate() + 1)) / dim);
                }
                return (
                  <div className="rounded-xl bg-brand-50 p-3 text-sm">
                    <div className="flex items-center justify-between"><span className="text-slate-600">First charge now</span><span className="font-bold text-brand-700">{formatPKR(first)}</span></div>
                    <p className="mt-1 text-xs text-slate-500">
                      {admitForm.billingMode === "ANCHORED"
                        ? `Then ${formatPKR(rent)} every month on day ${isNaN(d.getTime()) ? "?" : d.getDate()}.`
                        : admitForm.proratedFirst
                        ? `Pro-rated for the days left this month; then ${formatPKR(rent)} each calendar month.`
                        : `Then ${formatPKR(rent)} each calendar month.`}
                    </p>
                  </div>
                );
              })()}
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

      {/* Off-screen printable sheets — html2canvas captures these into the PDF. */}
      <div aria-hidden className="fixed left-[-10000px] top-0 pointer-events-none" style={{ width: 760 }}>
        <ResidentPdfSheet innerRef={pdfRef} r={r} company={user?.company?.name} />
      </div>
      <div aria-hidden className="fixed left-[-10000px] top-0 pointer-events-none" style={{ width: 760 }}>
        <RegistrationFormSheet innerRef={formRef} r={r} company={user?.company?.name} photoUrl={r.photoUrl ? assetUrl(r.photoUrl) : undefined} />
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

// A polished, branded, print-ready REGISTRATION FORM. Unlike the profile sheet
// above (which carries finances for internal records) this is the clean sheet a
// hostel keeps on file and hands to the police for tenant verification — it
// mirrors the fields on a paper admission form but in Riwaq's colours, with the
// resident's photo, a documents checklist and a signature / thumb-impression
// block. Rendered off-screen and rasterised into a PDF via html2canvas.
const RF = { green: "#14442f", gold: "#c9a45c", ink: "#1f2937", muted: "#6b7280", line: "#d7dbd4" };

function RegistrationFormSheet({ innerRef, r, company, photoUrl }: { innerRef: React.RefObject<HTMLDivElement>; r: any; company?: string; photoUrl?: string }) {
  const serif = "'Fraunces', Georgia, 'Times New Roman', serif";
  const typeLabel = ({ STUDENT: "Student", PROFESSIONAL: "Professional", DAILY: "Daily guest" } as Record<string, string>)[r.occupantType] ?? "Student";

  // A single form field: label above, value sitting on a dotted rule (blank when
  // empty, so the printout can be completed by hand if needed).
  const Field = ({ label, value, span }: { label: string; value?: any; span?: boolean }) => (
    <div style={{ gridColumn: span ? "1 / -1" : undefined }}>
      <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: RF.muted, marginBottom: 3 }}>{label}</div>
      <div style={{ minHeight: 17, fontSize: 12.5, fontWeight: 600, color: RF.ink, borderBottom: `1px dotted ${RF.line}`, paddingBottom: 3 }}>
        {value === undefined || value === null || value === "" ? " " : String(value)}
      </div>
    </div>
  );

  const FormSection = ({ title, cols = 2, children }: { title: string; cols?: number; children: React.ReactNode }) => (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontFamily: serif, fontSize: 12.5, fontWeight: 600, color: RF.green, letterSpacing: 0.3 }}>{title}</span>
        <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${RF.gold}, transparent)` }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, columnGap: 22, rowGap: 12 }}>{children}</div>
    </div>
  );

  const docTypes = new Set<string>((r.documents ?? []).map((d: any) => d.type));
  const checklist: [string, boolean][] = [
    ["Photograph", !!r.photoUrl],
    ["CNIC — Front", docTypes.has("CNIC_FRONT")],
    ["CNIC — Back", docTypes.has("CNIC_BACK")],
    ["Student / University card", docTypes.has("STUDENT_CARD") || docTypes.has("UNIVERSITY_CARD")],
    ["Job / employee card", docTypes.has("JOB_CARD")],
    ["Passport / Other", docTypes.has("PASSPORT") || docTypes.has("OTHER") || docTypes.has("CONTRACT")],
  ];

  return (
    <div ref={innerRef} style={{ width: 760, background: "#fff", color: RF.ink, padding: 36, fontFamily: "Arial, Helvetica, sans-serif", boxSizing: "border-box", position: "relative" }}>
      {/* Gold top rule */}
      <div style={{ height: 4, background: RF.gold, borderRadius: 4, marginBottom: 16 }} />

      {/* Header: logo + names on the left, passport photo on the right */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <img src="/riwaq-logo.png" alt="" style={{ height: 62, width: 62, borderRadius: 12, objectFit: "cover", border: `1px solid ${RF.line}` }} />
          <div>
            <div style={{ fontFamily: serif, fontSize: 24, fontWeight: 600, color: RF.green, lineHeight: 1.1 }}>{company || "Riwaq Hostels"}</div>
            <div style={{ fontSize: 12.5, color: RF.muted, marginTop: 2 }}>{r.hostel?.name}{r.city ? ` · ${r.city}` : ""}</div>
            <div style={{ fontSize: 10.5, letterSpacing: 2, textTransform: "uppercase", color: RF.gold, fontWeight: 700, marginTop: 6 }}>Resident Registration Form</div>
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ height: 108, width: 90, border: `1px solid ${RF.line}`, borderRadius: 8, overflow: "hidden", background: "#f8faf8", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {photoUrl ? <img src={photoUrl} alt="" style={{ height: "100%", width: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 9.5, color: RF.muted }}>Affix photo</span>}
          </div>
        </div>
      </div>

      {/* Meta strip */}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        {[["Registration ref", String(r.id).slice(-8).toUpperCase()], ["Resident type", typeLabel], ["Status", titleCase(r.status)], ["Date", formatDate(new Date())]].map(([k, v]) => (
          <div key={k} style={{ flex: 1, background: "#f4f6f3", borderRadius: 8, padding: "7px 12px" }}>
            <div style={{ fontSize: 8.5, textTransform: "uppercase", letterSpacing: 0.5, color: RF.muted, fontWeight: 700 }}>{k}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: RF.green, marginTop: 1 }}>{v}</div>
          </div>
        ))}
      </div>

      <FormSection title="Personal Information">
        <Field label="Full name" value={r.fullName} span />
        <Field label="Father / Guardian name" value={r.guardianName} />
        <Field label="Guardian's occupation" value={r.guardianOccupation} />
        <Field label="CNIC number" value={r.cnic} />
        <Field label="Date of birth" value={r.dateOfBirth ? formatDate(r.dateOfBirth) : ""} />
        <Field label="Gender" value={titleCase(r.gender)} />
        <Field label="Religion" value={r.religion} />
        <Field label="Nationality" value={r.nationality} />
        <Field label="Blood group" value={r.bloodGroup} />
        <Field label="Mobile number" value={r.phone} />
        <Field label="WhatsApp" value={r.whatsapp} />
        <Field label="Email" value={r.email} span />
      </FormSection>

      {r.occupantType === "STUDENT" && (
        <FormSection title="Education">
          <Field label="University / Institute" value={r.university} />
          <Field label="Program / Class" value={r.program} />
          <Field label="Student ID" value={r.studentId} />
          <Field label="Business / office address" value={r.businessAddress} />
        </FormSection>
      )}
      {r.occupantType === "PROFESSIONAL" && (
        <FormSection title="Occupation">
          <Field label="Company / Institute" value={r.company} />
          <Field label="Designation" value={r.occupation} />
          <Field label="Business / office address" value={r.businessAddress} span />
        </FormSection>
      )}

      <FormSection title="Address">
        <Field label="Permanent address" value={r.permanentAddress} span />
        <Field label="Current address" value={r.currentAddress} span />
        <Field label="City" value={r.city} />
        <Field label="Vehicle (parking)" value={r.vehicle} />
      </FormSection>

      <FormSection title="Local Reference — for verification">
        <Field label="Name" value={r.localRefName} />
        <Field label="Relationship" value={r.localRefRelation} />
        <Field label="Phone" value={r.localRefPhone} />
        <Field label="Address in city" value={r.localRefAddress} span />
      </FormSection>

      <FormSection title="Emergency Contact" cols={3}>
        <Field label="Name" value={r.emergencyName} />
        <Field label="Relationship" value={r.emergencyRelation} />
        <Field label="Phone" value={r.emergencyPhone} />
      </FormSection>

      <FormSection title="Accommodation & Stay" cols={3}>
        <Field label="Hostel" value={r.hostel?.name} />
        <Field label="Room" value={r.bed?.room?.name} />
        <Field label="Bed" value={r.bed?.label} />
        <Field label="Admission date" value={r.admissionDate ? formatDate(r.admissionDate) : ""} />
        <Field label="Monthly rent" value={r.occupantType === "DAILY" ? formatPKR(r.dailyRate) + " / night" : formatPKR(r.monthlyRent)} />
        <Field label="Expected stay" value={r.expectedStayMonths ? `${r.expectedStayMonths} months` : ""} />
      </FormSection>

      {/* Documents checklist */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontFamily: serif, fontSize: 12.5, fontWeight: 600, color: RF.green }}>Documents Provided</span>
          <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${RF.gold}, transparent)` }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {checklist.map(([label, on]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: RF.ink }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${on ? RF.green : RF.line}`, background: on ? RF.green : "#fff", color: "#fff", fontSize: 10, lineHeight: "12px", textAlign: "center", fontWeight: 700 }}>{on ? "✓" : " "}</span>
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Declaration + signatures */}
      <div style={{ marginTop: 20, border: `1px solid ${RF.line}`, borderRadius: 10, padding: "14px 16px", background: "#fcfdfb" }}>
        <div style={{ fontSize: 11.5, color: "#475569", lineHeight: 1.55 }}>
          I hereby declare that the information provided above is true and correct to the best of my knowledge, and I agree to abide by the rules and regulations of {company || "the hostel"}.
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 34, gap: 24 }}>
          <div style={{ flex: 1 }}>
            <div style={{ borderTop: `1px solid ${RF.muted}`, paddingTop: 4, fontSize: 10.5, color: RF.muted }}>Resident signature &amp; date</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ height: 60, width: 92, border: `1px dashed ${RF.muted}`, borderRadius: 6 }} />
            <div style={{ fontSize: 10, color: RF.muted, marginTop: 4 }}>Thumb impression</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ borderTop: `1px solid ${RF.muted}`, paddingTop: 4, fontSize: 10.5, color: RF.muted, textAlign: "right" }}>For office use — Reg # / Room #</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14, textAlign: "center", fontSize: 9.5, color: "#9aa3af" }}>
        {company || "Riwaq Hostels"} · Generated {formatDateTime(new Date())}
      </div>
    </div>
  );
}

// A compact "⋯ More" dropdown that keeps the header tidy by folding the many
// secondary actions (exports, notice, checkout, delete…) into one menu.
type MenuItem = { label: string; onClick: () => void; danger?: boolean; disabled?: boolean } | null | false;
function MoreMenu({ items, busy }: { items: MenuItem[]; busy?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const list = items.filter(Boolean) as Exclude<MenuItem, null | false>[];
  if (!list.length) return null;
  return (
    <div className="relative" ref={ref}>
      <Button variant="secondary" onClick={() => setOpen((o) => !o)}>{busy ? "Working…" : "More ▾"}</Button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {list.map((it, i) => (
            <button
              key={i}
              disabled={it.disabled}
              onClick={() => { setOpen(false); it.onClick(); }}
              className={`block w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ${it.danger ? "text-rose-600" : "text-slate-700"}`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
