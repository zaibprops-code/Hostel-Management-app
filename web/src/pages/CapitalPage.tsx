import { useState } from "react";
import { api, apiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useHostels } from "../context/HostelContext";
import { useApi, withQuery } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, Select, Textarea, ErrorText, PageLoader } from "../components/ui";
import { StatCard } from "../components/stats";
import { formatPKR, formatDate, titleCase } from "../lib/format";
import { IconMoney, IconPlus } from "../components/icons";

export default function CapitalPage() {
  const { can } = useAuth();
  const { hostels, scopeParam } = useHostels();
  const { data: inv, loading, refetch } = useApi<any>(withQuery("/capital/investments", scopeParam), [scopeParam]);
  const { data: loans, refetch: refetchLoans } = useApi<any>(withQuery("/capital/loans", scopeParam), [scopeParam]);
  const [modal, setModal] = useState<null | "inv" | "loan">(null);
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const [invForm, setInvForm] = useState<any>({ type: "OWNER_INVESTMENT", amount: 0, date: new Date().toISOString().slice(0, 10), source: "", purpose: "" });
  const [loanForm, setLoanForm] = useState<any>({ lender: "", principal: 0, interestRate: 0, date: new Date().toISOString().slice(0, 10), notes: "" });

  async function saveInv() {
    setSaving(true); setError("");
    try { await api.post("/capital/investments", invForm); setModal(null); await refetch(); } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }
  async function saveLoan() {
    setSaving(true); setError("");
    try { await api.post("/capital/loans", loanForm); setModal(null); await refetchLoans(); } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }

  if (loading) return <PageLoader />;

  return (
    <div>
      <PageHeader title="Capital & Loans" subtitle="Investment and financing — separate from operating profit"
        actions={can("capital.manage") && <div className="flex gap-2"><Button variant="secondary" onClick={() => setModal("loan")}><IconPlus className="h-4 w-4" /> Loan</Button><Button onClick={() => setModal("inv")}><IconPlus className="h-4 w-4" /> Investment</Button></div>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        <StatCard label="Total Invested" value={formatPKR(inv?.totalInvested)} icon={<IconMoney />} accent="brand" />
        <StatCard label="Withdrawn" value={formatPKR(inv?.totalWithdrawn)} icon={<IconMoney />} accent="amber" />
        <StatCard label="Net Capital" value={formatPKR(inv?.netCapital)} icon={<IconMoney />} accent="emerald" />
        <StatCard label="Loan Outstanding" value={formatPKR(loans?.outstanding)} icon={<IconMoney />} accent="rose" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-semibold text-slate-800 mb-3">Investments & Capital</h3>
          {!inv?.data.length ? <p className="text-sm text-slate-400">None recorded.</p> : (
            <div className="divide-y divide-slate-100">
              {inv.data.map((i: any) => (
                <div key={i.id} className="flex items-center justify-between py-2.5">
                  <div><p className="text-sm font-medium text-slate-700">{titleCase(i.type)}</p><p className="text-xs text-slate-400">{i.source ?? i.hostel} · {formatDate(i.date)}{i.purpose ? ` · ${i.purpose}` : ""}</p></div>
                  <span className={`text-sm font-semibold ${i.type === "CAPITAL_WITHDRAWAL" ? "text-rose-600" : "text-brand-600"}`}>{formatPKR(i.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold text-slate-800 mb-3">Loans</h3>
          {!loans?.data.length ? <p className="text-sm text-slate-400">None recorded.</p> : (
            <div className="divide-y divide-slate-100">
              {loans.data.map((l: any) => (
                <div key={l.id} className="flex items-center justify-between py-2.5">
                  <div><p className="text-sm font-medium text-slate-700">{l.lender}</p><p className="text-xs text-slate-400">{formatDate(l.date)} · {titleCase(l.status)}{l.interestRate ? ` · ${l.interestRate}%` : ""}</p></div>
                  <div className="text-right"><span className="text-sm font-semibold text-slate-800">{formatPKR(l.principal)}</span><p className="text-xs text-emerald-600">Repaid {formatPKR(l.amountRepaid)}</p></div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Modal open={modal === "inv"} onClose={() => setModal(null)} title="Record Investment">
        <div className="grid grid-cols-2 gap-3">
          <Select label="Type" value={invForm.type} onChange={(e) => setInvForm({ ...invForm, type: e.target.value })}>{["OWNER_INVESTMENT", "PARTNER_INVESTMENT", "CAPITAL_WITHDRAWAL", "OWNER_CONTRIBUTION"].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select>
          <Input label="Amount" type="number" value={invForm.amount} onChange={(e) => setInvForm({ ...invForm, amount: +e.target.value })} />
          <Input label="Date" type="date" value={invForm.date} onChange={(e) => setInvForm({ ...invForm, date: e.target.value })} />
          <Input label="Source / Investor" value={invForm.source} onChange={(e) => setInvForm({ ...invForm, source: e.target.value })} />
          <div className="col-span-2"><Textarea label="Purpose" value={invForm.purpose} onChange={(e) => setInvForm({ ...invForm, purpose: e.target.value })} /></div>
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button loading={saving} onClick={saveInv}>Save</Button></div>
      </Modal>

      <Modal open={modal === "loan"} onClose={() => setModal(null)} title="Record Loan">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Lender" value={loanForm.lender} onChange={(e) => setLoanForm({ ...loanForm, lender: e.target.value })} />
          <Input label="Principal" type="number" value={loanForm.principal} onChange={(e) => setLoanForm({ ...loanForm, principal: +e.target.value })} />
          <Input label="Interest rate (%)" type="number" value={loanForm.interestRate} onChange={(e) => setLoanForm({ ...loanForm, interestRate: +e.target.value })} />
          <Input label="Date" type="date" value={loanForm.date} onChange={(e) => setLoanForm({ ...loanForm, date: e.target.value })} />
          <div className="col-span-2"><Textarea label="Notes" value={loanForm.notes} onChange={(e) => setLoanForm({ ...loanForm, notes: e.target.value })} /></div>
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button loading={saving} onClick={saveLoan}>Save</Button></div>
      </Modal>
    </div>
  );
}
