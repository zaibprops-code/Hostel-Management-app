import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiError, assetUrl } from "../lib/api";
import { useHostels } from "../context/HostelContext";
import { useApi, withQuery } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, MoneyInput, NumberInput, Select, ErrorText, PageLoader, StatusBadge, EmptyState } from "../components/ui";
import { formatPKR, formatDate } from "../lib/format";
import { IconAdmission, IconPlus, IconSearch } from "../components/icons";
import { compressPhoto, compressDocument } from "../lib/image";

// Document kinds a hostel typically keeps for a resident.
const DOC_TYPES: [string, string][] = [
  ["CNIC_FRONT", "CNIC (Front)"], ["CNIC_BACK", "CNIC (Back)"], ["PASSPORT", "Passport photo"],
  ["STUDENT_CARD", "Student card"], ["UNIVERSITY_CARD", "University card"], ["CONTRACT", "Contract"], ["OTHER", "Other"],
];

const OCCUPANT_TYPES: [string, string][] = [
  ["STUDENT", "Student"], ["PROFESSIONAL", "Working"], ["DAILY", "Daily guest"],
];
const OCCUPANT_LABEL: Record<string, string> = { STUDENT: "Student", PROFESSIONAL: "Professional", DAILY: "Daily guest" };

function rentLabel(r: any): string {
  return r.occupantType === "DAILY" ? `${formatPKR(r.dailyRate)}/day` : `${formatPKR(r.monthlyRent)}/mo`;
}

const EMPTY = {
  // resident details
  hostelId: "", fullName: "", guardianName: "", phone: "", cnic: "", gender: "MALE", city: "",
  occupantType: "STUDENT", university: "", program: "", company: "", occupation: "",
  // admission details
  bedId: "", roomId: "", admissionDate: new Date().toISOString().slice(0, 10), monthlyRent: 0, depositAmount: 0,
  rentDueDay: 1, contractMonths: 12, foodPlanId: "", initialPayment: 0, paymentMethod: "CASH",
  // daily / short-stay
  dailyRate: 0, nights: 1, guests: 1,
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
  const [rooms, setRooms] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [form, setForm] = useState<any>(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Attachments (uploaded after the resident is created).
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [docs, setDocs] = useState<{ type: string; file: File | null }[]>([]);

  function pickPhoto(file?: File) {
    if (!file) return;
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function openModal() {
    setError("");
    setForm({ ...EMPTY, hostelId: hostels[0]?.id ?? "" });
    setPhoto(null); setPhotoPreview(""); setDocs([]);
    try {
      const [bedRes, roomRes, planRes] = await Promise.all([
        api.get(withQuery("/structure/available-beds", scopeParam)),
        api.get(withQuery("/structure/available-rooms", scopeParam)),
        api.get("/food/plans").catch(() => ({ data: [] })),
      ]);
      setBeds(bedRes.data); setRooms(roomRes.data); setPlans(planRes.data);
      setOpen(true);
    } catch (e) { setError(apiError(e)); setOpen(true); }
  }

  // Beds / rooms available in the chosen hostel.
  const hostelBeds = beds.filter((b) => !form.hostelId || b.hostelId === form.hostelId);
  const hostelRooms = rooms.filter((r) => !form.hostelId || r.hostelId === form.hostelId);
  const selectedBed = beds.find((b) => b.id === form.bedId);

  // Auto-fill monthly rent/deposit when a bed is picked.
  useEffect(() => {
    const bed = beds.find((b) => b.id === form.bedId);
    if (bed) setForm((f: any) => ({ ...f, monthlyRent: bed.monthlyRent, depositAmount: f.depositAmount || bed.monthlyRent }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.bedId]);

  // Suggest a daily rate when a room is picked (≈ whole-room monthly ÷ 30).
  useEffect(() => {
    const room = rooms.find((r) => r.id === form.roomId);
    if (room) setForm((f: any) => ({ ...f, dailyRate: f.dailyRate || Math.max(1, Math.round((room.suggestedRent || 0) / 30)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.roomId]);

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
          phone: form.phone, cnic: form.cnic, city: form.city, occupantType: form.occupantType,
          university: form.university, program: form.program, company: form.company, occupation: form.occupation,
        },
        hostelId: form.hostelId || hostels[0]?.id,
        bedId: form.occupantType === "DAILY" ? undefined : (form.bedId || undefined),
        roomId: form.occupantType === "DAILY" ? (form.roomId || undefined) : undefined,
        admissionDate: form.admissionDate,
        monthlyRent: form.monthlyRent,
        dailyRate: form.dailyRate,
        nights: form.nights,
        guests: form.guests,
        depositAmount: form.depositAmount,
        rentDueDay: form.rentDueDay,
        contractMonths: form.contractMonths,
        foodPlanId: form.foodPlanId || undefined,
        initialPayment: form.initialPayment,
        paymentMethod: form.paymentMethod,
      };
      const { data } = await api.post("/admissions", payload);
      const residentId = data.residentId as string;

      // Phase 2: upload the picture and documents to the new resident.
      const failures: string[] = [];
      if (photo) {
        try {
          const fd = new FormData(); fd.append("file", await compressPhoto(photo));
          await api.post(`/uploads/resident/${residentId}/photo`, fd);
        } catch { failures.push("profile picture"); }
      }
      for (const d of docs) {
        if (!d.file) continue;
        try {
          const fd = new FormData(); fd.append("file", await compressDocument(d.file)); fd.append("type", d.type);
          await api.post(`/uploads/resident/${residentId}/document`, fd);
        } catch { failures.push(DOC_TYPES.find((t) => t[0] === d.type)?.[1] ?? "document"); }
      }
      if (failures.length) {
        alert(`Resident saved, but these could not be uploaded: ${failures.join(", ")}. You can add them from the resident's profile.`);
      }

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
                <div className="h-10 w-10 shrink-0 rounded-full bg-brand-100 text-brand-700 grid place-items-center font-semibold overflow-hidden">
                  {r.photoUrl ? <img src={assetUrl(r.photoUrl)} alt="" className="h-full w-full object-cover" /> : r.fullName.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-slate-800 truncate">{r.fullName}</p>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-xs text-slate-400 truncate">{r.room ? `${r.room} · ${r.bed}` : "No bed"} · {rentLabel(r)}{r.occupantType === "DAILY" ? ` · ${r.guests || 1} guest${(r.guests || 1) > 1 ? "s" : ""}` : ""}</p>
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
                      <p className="text-xs text-slate-400">{OCCUPANT_LABEL[r.occupantType] ?? "Student"}{r.phone ? ` · ${r.phone}` : ""}</p>
                    </td>
                    <td className="td">{r.hostel.name}</td>
                    <td className="td">{r.room ? `${r.room} · ${r.bed}` : "—"}</td>
                    <td className="td">{rentLabel(r)}</td>
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
        {/* --- Profile picture --- */}
        <div className="flex items-center gap-4 mb-4">
          <div className="h-20 w-20 shrink-0 rounded-full bg-slate-100 overflow-hidden grid place-items-center border border-slate-200">
            {photoPreview
              ? <img src={photoPreview} alt="Preview" className="h-full w-full object-cover" />
              : <span className="text-2xl text-slate-300">{form.fullName?.charAt(0) || "🧑"}</span>}
          </div>
          <div>
            <label className="btn-secondary cursor-pointer inline-flex">
              {photo ? "Change photo" : "Upload photo"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />
            </label>
            <p className="text-xs text-slate-400 mt-1">Passport-size / profile picture (optional)</p>
          </div>
        </div>

        {/* --- Occupant type --- */}
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Who is staying?</p>
        <div className="grid grid-cols-3 gap-2 mb-1.5">
          {OCCUPANT_TYPES.map(([v, l]) => (
            <button key={v} type="button" onClick={() => setForm({ ...form, occupantType: v })}
              className={`rounded-xl border px-2 py-2.5 text-sm font-medium ${form.occupantType === v ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600"}`}>
              {l}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400 mb-4">
          {{
            STUDENT: "A student staying long-term — takes one bed, pays monthly rent.",
            PROFESSIONAL: "A working person staying long-term — takes one bed, pays monthly rent.",
            DAILY: "A short stay — books a whole room by the night for one or more people.",
          }[form.occupantType as string]}
        </p>

        {/* --- Resident details --- */}
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
          {form.occupantType === "DAILY" ? "Guest details" : "Resident details"}
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Select label="Hostel" value={form.hostelId} onChange={(e) => setForm({ ...form, hostelId: e.target.value })}>
            {hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </Select>
          <Select label="Gender" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
            <option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option>
          </Select>
          <Input label="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          <Input label={form.occupantType === "STUDENT" ? "Guardian name" : "Emergency contact name"} value={form.guardianName} onChange={(e) => setForm({ ...form, guardianName: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="CNIC" value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} />
          <Input label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          {form.occupantType === "STUDENT" && (
            <>
              <Input label="University" value={form.university} onChange={(e) => setForm({ ...form, university: e.target.value })} />
              <Input label="Program / Degree" value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })} />
            </>
          )}
          {form.occupantType === "PROFESSIONAL" && (
            <>
              <Input label="Company / Employer" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              <Input label="Job title" value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} />
            </>
          )}
        </div>

        {/* --- Assignment: a single bed (long-term) or a whole room (daily) --- */}
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mt-5 mb-2">
          {form.occupantType === "DAILY" ? "Room & stay" : "Bed & admission"}
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="lg:col-span-2">
            {form.occupantType === "DAILY" ? (
              <Select label="Book a whole room (optional)" value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}>
                <option value="">No room yet — save as Reserved</option>
                {hostelRooms.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.beds} bed{r.beds > 1 ? "s" : ""}{r.floor ? ` · ${r.floor}` : ""}</option>)}
              </Select>
            ) : (
              <Select label="Assign a bed (optional)" value={form.bedId} onChange={(e) => setForm({ ...form, bedId: e.target.value })}>
                <option value="">No bed yet — save as Reserved</option>
                {hostelBeds.map((b) => <option key={b.id} value={b.id}>{b.roomName} · {b.label} ({formatPKR(b.monthlyRent)})</option>)}
              </Select>
            )}
          </div>

          {(form.occupantType === "DAILY" ? form.roomId : form.bedId) && (
            <>
              <Input label={form.occupantType === "DAILY" ? "Check-in date" : "Admission date"} type="date" value={form.admissionDate} onChange={(e) => setForm({ ...form, admissionDate: e.target.value })} />

              {form.occupantType === "DAILY" ? (
                <>
                  <NumberInput label="Number of guests" value={form.guests} onChange={(n) => setForm({ ...form, guests: Math.max(1, n) })} />
                  <MoneyInput label="Room rate / night" value={form.dailyRate} onChange={(n) => setForm({ ...form, dailyRate: n })} />
                  <NumberInput label="Number of nights" value={form.nights} onChange={(n) => setForm({ ...form, nights: Math.max(1, n) })} />
                  <div className="rounded-xl bg-brand-50 p-3 text-sm flex items-center justify-between">
                    <span className="text-slate-600">Total ({form.nights} night{form.nights > 1 ? "s" : ""})</span>
                    <span className="font-bold text-brand-700">{formatPKR((form.dailyRate || 0) * (form.nights || 0))}</span>
                  </div>
                </>
              ) : (
                <>
                  <NumberInput label="Rent due day" value={form.rentDueDay} onChange={(n) => setForm({ ...form, rentDueDay: n })} />
                  <MoneyInput label="Monthly rent" value={form.monthlyRent} onChange={(n) => setForm({ ...form, monthlyRent: n })} />
                  <NumberInput label="Contract (months)" value={form.contractMonths} onChange={(n) => setForm({ ...form, contractMonths: n })} />
                </>
              )}

              <MoneyInput label="Security deposit" value={form.depositAmount} onChange={(n) => setForm({ ...form, depositAmount: n })} />
              <Select label="Food plan" value={form.foodPlanId} onChange={(e) => setForm({ ...form, foodPlanId: e.target.value })}>
                <option value="">None</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({formatPKR(p.monthlyCost)})</option>)}
              </Select>
              <MoneyInput label={form.occupantType === "DAILY" ? "Amount paid now" : "Initial payment"} value={form.initialPayment} onChange={(n) => setForm({ ...form, initialPayment: n })} />
              <Select label="Payment method" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
                {["CASH", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CARD"].map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}
              </Select>
            </>
          )}
        </div>
        {(form.occupantType === "DAILY" ? !form.roomId : !form.bedId) && (
          <p className="text-xs text-slate-400 mt-2">
            No {form.occupantType === "DAILY" ? "room" : "bed"} selected — saved as <b>Reserved</b>. You can assign it later from here.
          </p>
        )}

        {/* --- Documents (CNIC, passport, etc.) --- */}
        <div className="mt-5 flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Documents</p>
          <button type="button" onClick={() => setDocs([...docs, { type: "CNIC_FRONT", file: null }])} className="text-brand-600 text-sm font-medium">+ Add document</button>
        </div>
        {docs.length === 0 && <p className="text-xs text-slate-400">Attach CNIC, passport or other files — image or PDF (optional).</p>}
        <div className="space-y-2">
          {docs.map((d, i) => (
            <div key={i} className="flex flex-col sm:flex-row gap-2 rounded-xl border border-slate-200 p-2.5">
              <select className="input bg-white sm:max-w-[180px]" value={d.type}
                onChange={(e) => setDocs(docs.map((x, j) => j === i ? { ...x, type: e.target.value } : x))}>
                {DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <label className="input flex-1 flex items-center cursor-pointer text-slate-500 truncate">
                {d.file ? d.file.name : "Choose file…"}
                <input type="file" accept="*/*" className="hidden"
                  onChange={(e) => setDocs(docs.map((x, j) => j === i ? { ...x, file: e.target.files?.[0] ?? null } : x))} />
              </label>
              <button type="button" onClick={() => setDocs(docs.filter((_, j) => j !== i))} className="text-rose-600 text-sm font-medium px-2 self-center">Remove</button>
            </div>
          ))}
        </div>

        <ErrorText>{error}</ErrorText>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={saving} disabled={!form.fullName || !form.hostelId} onClick={submit}>{form.bedId ? "Admit Resident" : "Save Resident"}</Button>
        </div>
      </Modal>
    </div>
  );
}
