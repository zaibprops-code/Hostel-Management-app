import { useState } from "react";
import { api, apiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useHostels } from "../context/HostelContext";
import { useApi, withQuery } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, PageLoader, StatusBadge, EmptyState } from "../components/ui";
import { StatCard } from "../components/stats";
import { formatPKR, formatDate, titleCase } from "../lib/format";
import { IconMoney } from "../components/icons";

export default function PaymentsPage() {
  const { can } = useAuth();
  const { scopeParam } = useHostels();
  const [page, setPage] = useState(1);
  const { data, loading, refetch } = useApi<any>(withQuery("/payments", scopeParam, `page=${page}`), [page, scopeParam]);
  const { data: outstanding } = useApi<any[]>(withQuery("/payments/reports/outstanding", scopeParam), [scopeParam]);
  const [receipt, setReceipt] = useState<any>(null);

  async function viewReceipt(id: string) {
    try { const { data } = await api.get(`/payments/${id}/receipt`); setReceipt(data); } catch (e) { alert(apiError(e)); }
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
      <PageHeader title="Payments" subtitle="Rent collection & receipts" />

      <div className="grid gap-4 sm:grid-cols-3 mb-4">
        <StatCard label="Total Collected" value={formatPKR(data?.totalCollected)} icon={<IconMoney />} accent="emerald" />
        <StatCard label="Outstanding" value={formatPKR(totalOutstanding)} icon={<IconMoney />} accent="amber" />
        <StatCard label="Residents Owing" value={outstanding?.length ?? 0} icon={<IconMoney />} accent="rose" />
      </div>

      {loading ? <PageLoader /> : !data?.data.length ? (
        <EmptyState title="No payments recorded" icon={<IconMoney className="h-12 w-12" />} />
      ) : (
        <Card className="overflow-hidden">
          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-slate-100">
            {data.data.map((p: any) => (
              <div key={p.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-800 truncate">{p.resident.fullName}</p>
                  <span className="font-bold text-emerald-600">{formatPKR(p.amount)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <p className="text-xs text-slate-400">{titleCase(p.method)} · {formatDate(p.paidAt)}</p>
                  <StatusBadge status={p.status} />
                </div>
                <div className="flex gap-4 mt-2">
                  <button onClick={() => viewReceipt(p.id)} className="text-brand-600 text-sm font-medium">Receipt</button>
                  {can("payments.manage") && p.status === "COMPLETED" && <button onClick={() => voidPayment(p.id)} className="text-rose-600 text-sm font-medium">Void</button>}
                </div>
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50"><tr>
                <th className="th">Resident</th><th className="th">Amount</th><th className="th">Method</th>
                <th className="th">Reference</th><th className="th">Date</th><th className="th">Status</th><th className="th"></th>
              </tr></thead>
              <tbody>
                {data.data.map((p: any) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="td font-medium text-slate-800">{p.resident.fullName}</td>
                    <td className="td font-semibold text-emerald-600">{formatPKR(p.amount)}</td>
                    <td className="td">{titleCase(p.method)}</td>
                    <td className="td text-slate-400">{p.reference ?? "—"}</td>
                    <td className="td">{formatDate(p.paidAt)}</td>
                    <td className="td"><StatusBadge status={p.status} /></td>
                    <td className="td text-right whitespace-nowrap">
                      <button onClick={() => viewReceipt(p.id)} className="text-brand-600 hover:underline text-sm mr-3">Receipt</button>
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

      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Payment Receipt">
        {receipt && (
          <div id="receipt" className="text-sm">
            <div className="text-center border-b border-dashed border-slate-200 pb-3 mb-3">
              <p className="text-lg font-bold">{receipt.company}</p>
              <p className="text-slate-500">{receipt.hostel}</p>
              <p className="text-xs text-slate-400 mt-1">Receipt #{receipt.id.slice(-8).toUpperCase()}</p>
            </div>
            <div className="space-y-1.5">
              {[["Resident", receipt.resident], ["Room / Bed", `${receipt.room ?? "—"} / ${receipt.bed ?? "—"}`], ["Method", titleCase(receipt.method)], ["Reference", receipt.reference ?? "—"], ["Date", formatDate(receipt.paidAt)]].map(([k, v]) => (
                <div key={k} className="flex justify-between"><span className="text-slate-400">{k}</span><span className="font-medium">{v}</span></div>
              ))}
            </div>
            {receipt.allocations?.length > 0 && (
              <div className="mt-3 border-t border-dashed border-slate-200 pt-3">
                <p className="text-xs font-semibold text-slate-500 mb-1">Applied to</p>
                {receipt.allocations.map((a: any, i: number) => (
                  <div key={i} className="flex justify-between text-xs"><span>{a.period}</span><span>{formatPKR(a.amount)}</span></div>
                ))}
              </div>
            )}
            <div className="mt-3 border-t-2 border-slate-800 pt-3 flex justify-between text-lg font-bold">
              <span>Total Paid</span><span>{formatPKR(receipt.amount)}</span>
            </div>
            <div className="mt-5 flex justify-end gap-2 print:hidden">
              <Button variant="secondary" onClick={() => setReceipt(null)}>Close</Button>
              <Button onClick={() => window.print()}>Print</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
