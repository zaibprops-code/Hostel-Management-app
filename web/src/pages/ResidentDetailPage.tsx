import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, apiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useApi } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, Select, ErrorText, PageLoader, StatusBadge, EmptyState } from "../components/ui";
import { formatPKR, formatDate, titleCase } from "../lib/format";

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
            <Link to="/residents" className="btn-secondary">← Back</Link>
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
            <div className="h-14 w-14 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-xl font-bold">{r.fullName.charAt(0)}</div>
            <div>
              <p className="font-semibold text-slate-900">{r.fullName}</p>
              <StatusBadge status={r.status} />
            </div>
          </div>
          <dl className="space-y-2 text-sm">
            {[["Guardian", r.guardianName], ["Phone", r.phone], ["CNIC", r.cnic], ["City", r.city], ["University", r.university], ["Program", r.program], ["Food Plan", r.foodPlan?.name], ["Admission", formatDate(r.admissionDate)], ["Monthly Rent", formatPKR(r.monthlyRent)]].map(([k, v]) => (
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
              <div className="overflow-x-auto">
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
          <Input label="Amount" type="number" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: +e.target.value })} />
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
          <div className="grid grid-cols-2 gap-3">
            <Input label="Damage charges" type="number" value={coForm.damageCharges} onChange={(e) => setCoForm({ ...coForm, damageCharges: +e.target.value })} />
            <Input label="Other charges" type="number" value={coForm.otherCharges} onChange={(e) => setCoForm({ ...coForm, otherCharges: +e.target.value })} />
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
