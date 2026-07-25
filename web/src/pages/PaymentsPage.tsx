import { useRef, useState } from "react";
import { api, apiError, assetUrl } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useHostels } from "../context/HostelContext";
import { useApi, withQuery } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, MoneyInput, Select, ErrorText, PageLoader, StatusBadge, EmptyState } from "../components/ui";
import FileViewer from "../components/FileViewer";
import { compressDocument } from "../lib/image";
import { elementToPng } from "../lib/capture";
import { downloadFile, shareFile, canShareFiles } from "../lib/download";
import { StatCard } from "../components/stats";
import { formatPKR, formatDate, formatDateTime, titleCase, amountInWords } from "../lib/format";
import { IconMoney, IconPlus } from "../components/icons";

export default function PaymentsPage() {
  const { can } = useAuth();
  const { scopeParam } = useHostels();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, loading, refetch } = useApi<any>(withQuery("/payments", scopeParam, `page=${page}`, search && `search=${encodeURIComponent(search)}`), [page, search, scopeParam]);
  const { data: outstanding } = useApi<any[]>(withQuery("/payments/reports/outstanding", scopeParam), [scopeParam]);
  const [receipt, setReceipt] = useState<any>(null);
  const [viewing, setViewing] = useState<null | { url: string; name: string; mime?: string | null }>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const [receiptBusy, setReceiptBusy] = useState<"" | "save" | "share">("");
  // Record-payment (direct from this tab, not only from a resident's profile).
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState<any>({ residentId: "", amount: 0, method: "CASH", reference: "" });
  const [payProof, setPayProof] = useState<File | null>(null);
  const [residentsList, setResidentsList] = useState<any[]>([]);
  const [payError, setPayError] = useState("");
  const [savingPay, setSavingPay] = useState(false);

  async function openPay() {
    setPayError(""); setPayForm({ residentId: "", amount: 0, method: "CASH", reference: "" }); setPayProof(null);
    try { const { data } = await api.get(withQuery("/residents", scopeParam, "pageSize=500", "status=ACTIVE")); setResidentsList(data.data ?? []); }
    catch { setResidentsList([]); }
    setPayOpen(true);
  }
  async function savePay() {
    if (!payForm.residentId) { setPayError("Please choose a resident."); return; }
    setSavingPay(true); setPayError("");
    try {
      const { data } = await api.post("/payments", { residentId: payForm.residentId, amount: payForm.amount, method: payForm.method, reference: payForm.reference });
      if (payProof && data?.id) {
        const fd = new FormData(); fd.append("file", await compressDocument(payProof));
        await api.post(`/uploads/payment/${data.id}/proof`, fd).catch(() => {});
      }
      setPayOpen(false); setPage(1); await refetch();
    } catch (e) { setPayError(apiError(e)); } finally { setSavingPay(false); }
  }

  async function viewReceipt(id: string) {
    try { const { data } = await api.get(`/payments/${id}/receipt`); setReceipt(data); } catch (e) { alert(apiError(e)); }
  }
  async function exportReceipt(mode: "save" | "share") {
    if (!receiptRef.current) return;
    setReceiptBusy(mode);
    try {
      const png = await elementToPng(receiptRef.current);
      const name = `Receipt-${(receipt.resident || "resident").replace(/\s+/g, "_")}-${String(receipt.id).slice(-6)}.png`;
      if (mode === "save") await downloadFile(png, name);
      else await shareFile(png, name);
    } catch { alert("Could not create the receipt image. Please try again."); }
    finally { setReceiptBusy(""); }
  }
  async function uploadProof(id: string, file?: File) {
    if (!file) return;
    try { const fd = new FormData(); fd.append("file", await compressDocument(file)); await api.post(`/uploads/payment/${id}/proof`, fd); await refetch(); }
    catch (e) { alert(apiError(e)); }
  }
  async function voidPayment(id: string) {
    const reason = prompt("Reason for voiding this payment?");
    if (!reason) return;
    try { await api.post(`/payments/${id}/void`, { reason }); await refetch(); } catch (e) { alert(apiError(e)); }
  }

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;
  const totalOutstanding = outstanding?.reduce((s, o) => s + o.outstanding, 0) ?? 0;

  return (
    <div>
      <PageHeader title="Rent Payments" subtitle="Rent collection & receipt register"
        actions={can("payments.manage") && <Button onClick={openPay}><IconPlus className="h-4 w-4" /> Record Payment</Button>} />

      <div className="grid gap-4 sm:grid-cols-3 mb-4">
        <StatCard label="Total Collected" value={formatPKR(data?.totalCollected)} icon={<IconMoney />} accent="emerald" />
        <StatCard label="Outstanding" value={formatPKR(totalOutstanding)} icon={<IconMoney />} accent="amber" />
        <StatCard label="Residents Owing" value={outstanding?.length ?? 0} icon={<IconMoney />} accent="rose" />
      </div>

      <Card className="p-4 mb-4">
        <input className="input" placeholder="Search by receipt no. or resident name…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </Card>

      {loading ? <PageLoader /> : !data?.data.length ? (
        <EmptyState title="No payments found" icon={<IconMoney className="h-12 w-12" />} />
      ) : (
        <Card className="overflow-hidden">
          {/* Mobile cards */}
          <div className="lg:hidden divide-y divide-slate-100">
            {data.data.map((p: any) => (
              <div key={p.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-800 truncate">{p.resident.fullName}</p>
                  <span className="font-bold text-emerald-600">{formatPKR(p.amount)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <p className="text-xs text-slate-400 truncate">{p.receiptNo ? `${p.receiptNo} · ` : ""}{titleCase(p.method)} · {formatDate(p.paidAt)}</p>
                  <StatusBadge status={p.status} />
                </div>
                <div className="flex gap-4 mt-2 items-center">
                  <button onClick={() => viewReceipt(p.id)} className="text-brand-600 text-sm font-medium">Receipt</button>
                  {p.proofUrl ? (
                    <button onClick={() => setViewing({ url: assetUrl(p.proofUrl), name: `Proof — ${p.resident.fullName} — ${formatDate(p.paidAt)}`, mime: p.proofMime })} className="text-slate-600 text-sm font-medium">📎 Proof</button>
                  ) : can("payments.manage") ? (
                    <label className="text-slate-400 text-sm cursor-pointer">＋ Proof<input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => uploadProof(p.id, e.target.files?.[0])} /></label>
                  ) : null}
                  {can("payments.manage") && p.status === "COMPLETED" && <button onClick={() => voidPayment(p.id)} className="text-rose-600 text-sm font-medium">Void</button>}
                </div>
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50"><tr>
                <th className="th">Receipt No.</th><th className="th">Resident</th><th className="th">Amount</th><th className="th">Method</th>
                <th className="th">Reference</th><th className="th">Date</th><th className="th">Status</th><th className="th"></th>
              </tr></thead>
              <tbody>
                {data.data.map((p: any) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="td font-mono text-xs text-slate-500">{p.receiptNo ?? "—"}</td>
                    <td className="td font-medium text-slate-800">{p.resident.fullName}</td>
                    <td className="td font-semibold text-emerald-600">{formatPKR(p.amount)}</td>
                    <td className="td">{titleCase(p.method)}</td>
                    <td className="td text-slate-400">{p.reference ?? "—"}</td>
                    <td className="td">{formatDate(p.paidAt)}</td>
                    <td className="td"><StatusBadge status={p.status} /></td>
                    <td className="td text-right whitespace-nowrap">
                      <button onClick={() => viewReceipt(p.id)} className="text-brand-600 hover:underline text-sm mr-3">Receipt</button>
                      {p.proofUrl ? (
                        <button onClick={() => setViewing({ url: assetUrl(p.proofUrl), name: `Proof — ${p.resident.fullName} — ${formatDate(p.paidAt)}`, mime: p.proofMime })} className="text-slate-600 hover:underline text-sm mr-3">Proof</button>
                      ) : can("payments.manage") ? (
                        <label className="text-slate-400 hover:underline text-sm mr-3 cursor-pointer">＋Proof<input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => uploadProof(p.id, e.target.files?.[0])} /></label>
                      ) : null}
                      {can("payments.manage") && p.status === "COMPLETED" && <button onClick={() => voidPayment(p.id)} className="text-rose-600 hover:underline text-sm">Void</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Record a payment directly from this tab */}
      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Record Payment">
        <div className="space-y-3">
          <Select label="Resident" value={payForm.residentId} onChange={(e) => setPayForm({ ...payForm, residentId: e.target.value })}>
            <option value="">Select resident…</option>
            {residentsList.map((r) => <option key={r.id} value={r.id}>{r.fullName}{r.room ? ` — ${r.room}${r.bed ? "/" + r.bed : ""}` : ""}</option>)}
          </Select>
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
          <p className="text-xs text-slate-400">The payment is auto-applied to the resident's oldest unpaid rent and gets a receipt number.</p>
          <ErrorText>{payError}</ErrorText>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setPayOpen(false)}>Cancel</Button><Button loading={savingPay} onClick={savePay}>Save Payment</Button></div>
        </div>
      </Modal>

      {viewing && <FileViewer open={true} onClose={() => setViewing(null)} url={viewing.url} name={viewing.name} mime={viewing.mime} />}

      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Payment Receipt">
        {receipt && (
          <>
            {/* The receipt itself — captured as an image for Save/Share */}
            <div ref={receiptRef} className="bg-white text-slate-800 p-5 rounded-xl border border-slate-100">
              <div className="text-center border-b-2 border-brand-600 pb-3 mb-3">
                <p className="text-xl font-extrabold text-brand-700 leading-tight">{receipt.company}</p>
                <p className="font-semibold text-slate-700">{receipt.hostel}</p>
                {(receipt.hostelAddress || receipt.hostelCity) && <p className="text-xs text-slate-500">{[receipt.hostelAddress, receipt.hostelCity].filter(Boolean).join(", ")}</p>}
                {receipt.hostelPhone && <p className="text-xs text-slate-500">☎ {receipt.hostelPhone}</p>}
              </div>

              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-bold tracking-wide text-slate-700">PAYMENT RECEIPT</p>
                  <p className="text-xs text-slate-500 font-semibold">No. {receipt.receiptNo ?? String(receipt.id).slice(-8).toUpperCase()}</p>
                </div>
                <span className={`rounded-md px-2.5 py-1 text-xs font-bold border ${receipt.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"}`}>
                  {receipt.status === "COMPLETED" ? "PAID" : titleCase(receipt.status)}
                </span>
              </div>

              <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-1.5 mb-3">
                <RRow k="Received from" v={receipt.resident} />
                {receipt.residentPhone && <RRow k="Phone" v={receipt.residentPhone} />}
                {receipt.residentCnic && <RRow k="CNIC" v={receipt.residentCnic} />}
                <RRow k="Room / Bed" v={`${receipt.room ?? "—"} / ${receipt.bed ?? "—"}`} />
                <RRow k="Date & time" v={formatDateTime(receipt.paidAt)} />
                <RRow k="Method" v={titleCase(receipt.method)} />
                {receipt.reference && <RRow k="Reference" v={receipt.reference} />}
              </div>

              {receipt.allocations?.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-slate-500 mb-1">Applied to rent</p>
                  <div className="rounded-lg border border-slate-100 divide-y divide-slate-100">
                    {receipt.allocations.map((a: any, i: number) => (
                      <div key={i} className="flex justify-between px-3 py-1.5 text-sm"><span className="text-slate-600">{a.period}</span><span className="font-medium">{formatPKR(a.amount)}</span></div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-lg bg-brand-600 text-white px-3 py-2.5 flex items-center justify-between">
                <span className="font-semibold">Amount Paid</span>
                <span className="text-xl font-extrabold">{formatPKR(receipt.amount)}</span>
              </div>
              <p className="text-xs text-slate-500 italic mt-1 mb-3">{amountInWords(receipt.amount)}</p>

              <div className="flex justify-between text-sm mb-4">
                <span className="text-slate-500">Balance remaining</span>
                <span className={receipt.outstanding > 0 ? "font-semibold text-rose-600" : "font-semibold text-emerald-600"}>{formatPKR(receipt.outstanding)}</span>
              </div>

              <div className="flex items-end justify-between pt-3 border-t border-dashed border-slate-200">
                <div className="text-xs text-slate-500">
                  <p>Received by</p>
                  <p className="font-medium text-slate-700 mt-0.5">{receipt.receivedBy ?? "—"}</p>
                </div>
                <div className="text-center">
                  <div className="w-28 border-b border-slate-400 mb-1" />
                  <p className="text-xs text-slate-400">Signature / Stamp</p>
                </div>
              </div>
              <p className="text-center text-[10px] text-slate-400 mt-3">Thank you! This is a computer-generated receipt.</p>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setReceipt(null)}>Close</Button>
              <Button variant="secondary" loading={receiptBusy === "save"} onClick={() => exportReceipt("save")}>⬇ Save</Button>
              {canShareFiles() && <Button loading={receiptBusy === "share"} onClick={() => exportReceipt("share")}>↗ Share</Button>}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

// One label/value row on the receipt.
function RRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-400 shrink-0">{k}</span>
      <span className="font-medium text-right break-words">{v}</span>
    </div>
  );
}
