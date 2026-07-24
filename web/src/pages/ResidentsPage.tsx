import { useState } from "react";
import { Link } from "react-router-dom";
import { api, apiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useHostels } from "../context/HostelContext";
import { useApi, withQuery } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, Select, ErrorText, PageLoader, StatusBadge, EmptyState } from "../components/ui";
import { formatPKR, formatDate } from "../lib/format";
import { IconResidents, IconPlus, IconSearch } from "../components/icons";

export default function ResidentsPage() {
  const { can } = useAuth();
  const { hostels, scopeParam } = useHostels();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const url = withQuery("/residents", scopeParam, `page=${page}`, search && `search=${encodeURIComponent(search)}`, status && `status=${status}`);
  const { data, loading, refetch } = useApi<any>(url, [page, search, status, scopeParam]);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ hostelId: "", fullName: "", guardianName: "", phone: "", cnic: "", gender: "MALE", city: "", university: "", program: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true); setError("");
    try {
      await api.post("/residents", { ...form, hostelId: form.hostelId || hostels[0]?.id });
      setOpen(false); setForm({ hostelId: "", fullName: "", guardianName: "", phone: "", cnic: "", gender: "MALE", city: "", university: "", program: "" });
      await refetch();
    } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

  return (
    <div>
      <PageHeader
        title="Residents"
        subtitle={data ? `${data.total} residents` : "Manage residents"}
        actions={can("residents.manage") && <Button onClick={() => { setForm({ ...form, hostelId: hostels[0]?.id ?? "" }); setOpen(true); }}><IconPlus className="h-4 w-4" /> New Resident</Button>}
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
        <EmptyState title="No residents found" message="Try adjusting filters or add a new resident." icon={<IconResidents className="h-12 w-12" />} />
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

      <Modal open={open} onClose={() => setOpen(false)} title="New Resident" wide>
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
        <p className="text-xs text-slate-400 mt-2">The resident is created as <b>Reserved</b>. Assign a room & bed via Admissions.</p>
        <ErrorText>{error}</ErrorText>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={saving} onClick={save}>Create Resident</Button>
        </div>
      </Modal>
    </div>
  );
}
