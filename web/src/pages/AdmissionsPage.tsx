import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiError } from "../lib/api";
import { useHostels } from "../context/HostelContext";
import { useApi, withQuery } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, Select, ErrorText, PageLoader, StatusBadge, EmptyState } from "../components/ui";
import { formatPKR, formatDate } from "../lib/format";
import { IconAdmission, IconPlus, IconSearch } from "../components/icons";

const EMPTY = {
  // resident details
  hostelId: "", fullName: "", guardianName: "", phone: "", cnic: "", gender: "MALE", city: "", university: "", program: "",
  // admission details
  bedId: "", admissionDate: new Date().toISOString().slice(0, 10), monthlyRent: 0, depositAmount: 0,
  rentDueDay: 1, contractMonths: 12, foodPlanId: "", initialPayment: 0, paymentMethod: "CASH",
};

export default function AdmissionsPage() {
  const { hostels, scopeParam } = useHostels();

  // People list (all residents) — searchable, filterable, paginated.
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const url = withQuery("/residents", scopeParam, `page=${page}`, search && `search=${encodeURIComponent(search)}`, status && `status=${status}`);
  const { data, loading, refetch } = useApi<any>(url, [page, search, status, scopeParam]);

  // New-admission form (creates the resident + optionally admits to a bed).
  const [open, setOpen] = useState(false);
  const [beds, setBeds] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [form, setForm] = useState<any>(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function openModal() {
    setError("");
    setForm({ ...EMPTY, hostelId: hostels[0]?.id ?? "" });
    try {
      const [bedRes, planRes] = await Promise.all([
        api.get(withQuery("/structure/available-beds", scopeParam)),
        api.get("/food/plans").catch(() => ({ data: [] })),
      ]);
      setBeds(bedRes.data); setPlans(planRes.data);
      setOpen(true);
    } catch (e) { setError(apiError(e)); setOpen(true); }
  }

  // Beds available in the chosen hostel.
  const hostelBeds = beds.filter((b) => !form.hostelId || b.hostelId === form.hostelId);
  const selectedBed = beds.find((b) => b.id === form.bedId);

  // Auto-fill rent/deposit when a bed is picked.
  useEffect(() => {
    const bed = beds.find((b) => b.id === form.bedId);
    if (bed) setForm((f: any) => ({ ...f, monthlyRent: bed.monthlyRent, depositAmount: f.depositAmount || bed.monthlyRent }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.bedId]);

  // Clear a chosen bed if the hostel changes and the bed no longer belongs to it.
  useEffect(() => {
    if (form.bedId && selectedBed && selectedBed.hostelId !== form.hostelId) {
      setForm((f: any) => ({ ...f, bedId: "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.hostelId]);

  async function submit() {
    setSaving(true); setError("");
    try {
      const payload = {
        resident: {
          fullName: form.fullName, guardianName: form.guardianName, gender: form.gender,
          phone: form.phone, cnic: form.cnic, city: form.city, university: form.university, program: form.program,
        },
        hostelId: form.hostelId || hostels[0]?.id,
        bedId: form.bedId || undefined,
        admissionDate: form.admissionDate,
        monthlyRent: form.monthlyRent,
        depositAmount: form.depositAmount,
        rentDueDay: form.rentDueDay,
        contractMonths: form.contractMonths,
        foodPlanId: form.foodPlanId || undefined,
        initialPayment: form.initialPayment,
        paymentMethod: form.paymentMethod,
      };
      await api.post("/admissions", payload);
      setOpen(false); setPage(1); await refetch();
    } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

  return (
    <div>
      <PageHeader
        title="Admissions"
        subtitle={data ? `${data.total} residents` : "Register & admit residents"}
        actions={<Button onClick={openModal}><IconPlus className="h-4 w-4" /> New Admission</Button>}
      />

      <Card className="p-4 mb-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <IconSearch className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search name, phone, CNIC…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <select className="input bg-white max-w-[180px]" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {["ACTIVE", "RESERVED", "NOTICE_GIVEN", "CHECKED_OUT", "SUSPENDED", "BLACKLISTED"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
        </div>
      </Card>

      {loading ? <PageLoader /> : !data?.data.length ? (
        <EmptyState title="No residents yet" message="Tap “New Admission” to register your first resident and assign them a bed." icon={<IconAdmission className="h-12 w-12" />} />
      ) : (
        <Card className="overflow-hidden">
          {/* Mobile: tap-friendly cards */}
          <div className="lg:hidden divide-y divide-slate-100">
            {data.data.map((r: any) => (
              <Link key={r.id} to={`/residents/${r.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50">
                <div className="h-10 w-10 shrink-0 rounded-full bg-brand-100 text-brand-700 grid place-items-center font-semibold">{r.fullName.charAt(0)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-slate-800 truncate">{r.fullName}</p>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-xs text-slate-400 truncate">{r.room ? `${r.room} · ${r.bed}` : "No bed"} · {formatPKR(r.monthlyRent)}/mo</p>
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Name</th><th className="th">Hostel</th><th className="th">Room / Bed</th>
                  <th className="th">Rent</th><th className="th">Check-in</th><th className="th">Status</th><th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((r: any) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="td">
                      <p className="font-medium text-slate-800">{r.fullName}</p>
                      <p className="text-xs text-slate-400">{r.phone ?? "—"}</p>
                    </td>
                    <td className="td">{r.hostel.name}</td>
                    <td className="td">{r.room ? `${r.room} · ${r.bed}` : "—"}</td>
                    <td className="td">{formatPKR(r.monthlyRent)}</td>
                    <td className="td">{formatDate(r.checkInDate)}</td>
                    <td className="td"><StatusBadge status={r.status} /></td>
                    <td className="td text-right"><Link to={`/residents/${r.id}`} className="text-brand-600 font-medium hover:underline">View</Link></td>
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

      <Modal open={open} onClose={() => setOpen(false)} title="New Admission" wide>
        {/* --- Resident details --- */}
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Resident details</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Select label="Hostel" value={form.hostelId} onChange={(e) => setForm({ ...form, hostelId: e.target.value })}>
            {hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </Select>
          <Select label="Gender" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
            <option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option>
          </Select>
          <Input label="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          <Input label="Guardian name" value={form.guardianName} onChange={(e) => setForm({ ...form, guardianName: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="CNIC" value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} />
          <Input label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <Input label="University" value={form.university} onChange={(e) => setForm({ ...form, university: e.target.value })} />
          <Input label="Program / Degree" value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })} />
        </div>

        {/* --- Admission / bed assignment --- */}
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mt-5 mb-2">Bed & admission</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="lg:col-span-2">
            <Select label="Assign a bed (optional)" value={form.bedId} onChange={(e) => setForm({ ...form, bedId: e.target.value })}>
              <option value="">No bed yet — save as Reserved</option>
              {hostelBeds.map((b) => <option key={b.id} value={b.id}>{b.roomName} · {b.label} ({formatPKR(b.monthlyRent)})</option>)}
            </Select>
          </div>

          {form.bedId && (
            <>
              <Input label="Admission date" type="date" value={form.admissionDate} onChange={(e) => setForm({ ...form, admissionDate: e.target.value })} />
              <Input label="Rent due day" type="number" value={form.rentDueDay} onChange={(e) => setForm({ ...form, rentDueDay: +e.target.value })} />
              <Input label="Monthly rent" type="number" value={form.monthlyRent} onChange={(e) => setForm({ ...form, monthlyRent: +e.target.value })} />
              <Input label="Security deposit" type="number" value={form.depositAmount} onChange={(e) => setForm({ ...form, depositAmount: +e.target.value })} />
              <Input label="Contract (months)" type="number" value={form.contractMonths} onChange={(e) => setForm({ ...form, contractMonths: +e.target.value })} />
              <Select label="Food plan" value={form.foodPlanId} onChange={(e) => setForm({ ...form, foodPlanId: e.target.value })}>
                <option value="">None</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({formatPKR(p.monthlyCost)})</option>)}
              </Select>
              <Input label="Initial payment" type="number" value={form.initialPayment} onChange={(e) => setForm({ ...form, initialPayment: +e.target.value })} />
              <Select label="Payment method" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
                {["CASH", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CARD"].map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}
              </Select>
            </>
          )}
        </div>
        {!form.bedId && <p className="text-xs text-slate-400 mt-2">No bed selected — the resident is saved as <b>Reserved</b>. You can admit them to a bed later from here.</p>}

        <ErrorText>{error}</ErrorText>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={saving} disabled={!form.fullName || !form.hostelId} onClick={submit}>{form.bedId ? "Admit Resident" : "Save Resident"}</Button>
        </div>
      </Modal>
    </div>
  );
}
