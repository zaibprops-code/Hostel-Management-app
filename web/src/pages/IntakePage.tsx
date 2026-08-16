import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import clsx from "clsx";
import { api, apiError } from "../lib/api";
import { compressPhoto, compressDocument } from "../lib/image";
import { Card, Button, Spinner } from "../components/ui";

// Public, no-login resident self-intake form reached via a hostel's shared
// /intake/:token link. Submissions land in the owner's app as pending records.

type Form = Record<string, string>;

const BLANK: Form = {
  fullName: "", guardianName: "", cnic: "", dateOfBirth: "", gender: "",
  phone: "", whatsapp: "", email: "", city: "", permanentAddress: "", currentAddress: "",
  occupantType: "STUDENT", university: "", program: "", studentId: "", company: "", occupation: "",
  emergencyName: "", emergencyRelation: "", emergencyPhone: "",
};

type Files = { photo: File | null; cnicFront: File | null; cnicBack: File | null; studentCard: File | null };

export default function IntakePage() {
  const { token } = useParams();
  const [state, setState] = useState<"loading" | "ok" | "invalid">("loading");
  const [info, setInfo] = useState<{ hostelName: string; city?: string; companyName: string; gender?: string | null } | null>(null);
  const [form, setForm] = useState<Form>(BLANK);
  const [files, setFiles] = useState<Files>({ photo: null, cnicFront: null, cnicBack: null, studentCard: null });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/public/intake/${token}`);
        setInfo(data);
        // A gender-specific hostel (boys-only / girls-only) fixes every
        // resident's gender, so we don't ask — just set it from the hostel.
        if (data.gender === "MALE" || data.gender === "FEMALE") setForm((f) => ({ ...f, gender: data.gender }));
        setState("ok");
      } catch { setState("invalid"); }
    })();
  }, [token]);

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: "" } : e)); // clear a field's error as the user fixes it
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = "Please enter your full name.";
    if (!form.phone.trim()) e.phone = "Please add a mobile number so the hostel can reach you.";
    else if (form.phone.replace(/\D/g, "").length < 7) e.phone = "That doesn't look like a valid number.";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Please enter a valid email, or leave it blank.";
    return e;
  }

  async function submit(ev: React.SyntheticEvent) {
    ev.preventDefault();
    setError("");
    const found = validate();
    if (Object.keys(found).length) {
      setErrors(found);
      // Bring the first problem field into view.
      const first = Object.keys(found)[0];
      document.getElementById(`f-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v !== "" && v != null) fd.append(k, v); });
      if (files.photo) fd.append("photo", await compressPhoto(files.photo));
      if (files.cnicFront) fd.append("cnicFront", await compressDocument(files.cnicFront));
      if (files.cnicBack) fd.append("cnicBack", await compressDocument(files.cnicBack));
      if (form.occupantType === "STUDENT" && files.studentCard) fd.append("studentCard", await compressDocument(files.studentCard));
      await api.post(`/public/intake/${token}`, fd);
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(apiError(err));
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  }

  if (state === "loading") {
    return <div className="min-h-screen grid place-items-center bg-slate-100"><Spinner className="h-8 w-8 text-brand-600" /></div>;
  }
  if (state === "invalid") {
    return (
      <Centered>
        <div className="text-5xl mb-3">🔗</div>
        <h1 className="text-lg font-bold text-slate-900">This link isn't working</h1>
        <p className="text-sm text-slate-500 mt-2">The registration link is invalid or has been turned off. Please ask the hostel for a fresh link.</p>
      </Centered>
    );
  }
  if (done) {
    return (
      <Centered>
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl">✅</div>
        <h1 className="text-xl font-bold text-slate-900">You're all set!</h1>
        <p className="text-sm text-slate-500 mt-2">
          Your details have been sent to <b className="text-slate-700">{info?.hostelName}</b>. They'll review them and get in touch to confirm your room. You can safely close this page.
        </p>
      </Centered>
    );
  }

  const isStudent = form.occupantType === "STUDENT";
  const isPro = form.occupantType === "PROFESSIONAL";
  const initial = (info?.hostelName || "H").trim().charAt(0).toUpperCase();
  // Only ask for gender when the hostel accepts any gender. Boys-only/girls-only
  // hostels already answer it.
  const genderFixed = info?.gender === "MALE" || info?.gender === "FEMALE";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 safe-top safe-bottom">
      <div className="mx-auto max-w-lg px-4 pb-32 pt-5">
        {/* Branded header */}
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-center text-white shadow-lg shadow-brand-900/10">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/15 text-2xl font-bold ring-1 ring-white/25 backdrop-blur">{initial}</div>
          <h1 className="mt-3 text-xl font-bold tracking-tight">{info?.hostelName}</h1>
          {info?.city && <p className="text-sm text-white/70">{info.city}</p>}
          <p className="mt-2 text-sm text-white/85">Resident registration — tell us a little about you</p>
          {genderFixed && (
            <span className="mt-3 inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/25">
              {info?.gender === "MALE" ? "🧑 Boys hostel" : "👩 Girls hostel"}
            </span>
          )}
        </div>

        <form onSubmit={submit} noValidate className="mt-5 space-y-4">
          {/* Profile photo */}
          <Section icon="📸" title="Your photo" subtitle="A clear face photo helps the hostel recognise you at check-in.">
            <PhotoAvatar file={files.photo} onPick={(f) => setFiles((s) => ({ ...s, photo: f }))} />
          </Section>

          {/* Personal */}
          <Section icon="🧑" title="Personal details">
            <div className="space-y-3">
              <TextField id="f-fullName" label="Full name" required value={form.fullName} error={errors.fullName}
                onChange={(e) => set("fullName", e.target.value)} placeholder="e.g. Ahmed Ali" autoComplete="name" />
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Father / Guardian name" value={form.guardianName} onChange={(e) => set("guardianName", e.target.value)} />
                <TextField label="CNIC number" value={form.cnic} onChange={(e) => set("cnic", e.target.value)} inputMode="numeric" placeholder="00000-0000000-0" />
                <TextField label="Date of birth" type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
                {!genderFixed && (
                  <SelectField label="Gender" value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                    <option value="">Select…</option>
                    <option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option>
                  </SelectField>
                )}
                <TextField id="f-phone" label="Mobile number" required value={form.phone} error={errors.phone}
                  onChange={(e) => set("phone", e.target.value)} inputMode="tel" placeholder="03xx-xxxxxxx" autoComplete="tel" />
                <TextField label="WhatsApp number" value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} inputMode="tel" />
                <TextField id="f-email" label="Email" type="email" value={form.email} error={errors.email}
                  onChange={(e) => set("email", e.target.value)} inputMode="email" autoComplete="email" className="col-span-2" />
              </div>
            </div>
          </Section>

          {/* Occupant type */}
          <Section icon="🎓" title="You are a…">
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[["STUDENT", "Student", "🎓"], ["PROFESSIONAL", "Professional", "💼"], ["DAILY", "Short-stay", "🧳"]].map(([val, lbl, ic]) => (
                  <button type="button" key={val} onClick={() => set("occupantType", val)}
                    className={clsx("flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs font-semibold transition",
                      form.occupantType === val ? "border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-100" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
                    <span className="text-lg">{ic}</span>{lbl}
                  </button>
                ))}
              </div>
              {isStudent && (
                <div className="grid grid-cols-2 gap-3">
                  <TextField label="University" value={form.university} onChange={(e) => set("university", e.target.value)} />
                  <TextField label="Program / class" value={form.program} onChange={(e) => set("program", e.target.value)} />
                  <TextField label="Student ID" value={form.studentId} onChange={(e) => set("studentId", e.target.value)} className="col-span-2" />
                </div>
              )}
              {isPro && (
                <div className="grid grid-cols-2 gap-3">
                  <TextField label="Company / employer" value={form.company} onChange={(e) => set("company", e.target.value)} />
                  <TextField label="Job title" value={form.occupation} onChange={(e) => set("occupation", e.target.value)} />
                </div>
              )}
            </div>
          </Section>

          {/* Address */}
          <Section icon="🏠" title="Address">
            <div className="space-y-3">
              <TextField label="Permanent address" value={form.permanentAddress} onChange={(e) => set("permanentAddress", e.target.value)} />
              <TextField label="Current address" value={form.currentAddress} onChange={(e) => set("currentAddress", e.target.value)} />
              <TextField label="City" value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>
          </Section>

          {/* Documents */}
          <Section icon="🪪" title="ID documents" subtitle="Optional but recommended — a photo of your CNIC speeds up check-in.">
            <div className="space-y-3">
              <DocPicker label="CNIC — front" file={files.cnicFront} onPick={(f) => setFiles((s) => ({ ...s, cnicFront: f }))} />
              <DocPicker label="CNIC — back" file={files.cnicBack} onPick={(f) => setFiles((s) => ({ ...s, cnicBack: f }))} />
              {isStudent && <DocPicker label="Student / University card" file={files.studentCard} onPick={(f) => setFiles((s) => ({ ...s, studentCard: f }))} />}
            </div>
          </Section>

          {/* Emergency */}
          <Section icon="🚨" title="Emergency contact" subtitle="Someone the hostel can call in an emergency.">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Name" value={form.emergencyName} onChange={(e) => set("emergencyName", e.target.value)} />
                <TextField label="Relationship" value={form.emergencyRelation} onChange={(e) => set("emergencyRelation", e.target.value)} placeholder="e.g. Father" />
              </div>
              <TextField label="Phone number" value={form.emergencyPhone} onChange={(e) => set("emergencyPhone", e.target.value)} inputMode="tel" />
            </div>
          </Section>

          {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
        </form>
      </div>

      {/* Sticky submit bar */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto max-w-lg">
          <Button type="button" onClick={submit} loading={saving} className="w-full text-base">Submit my details</Button>
          <p className="mt-2 text-center text-[11px] text-slate-400">🔒 Your information is sent only to {info?.companyName}.</p>
        </div>
      </div>
    </div>
  );
}

// ---- Small building blocks ------------------------------------------------

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid place-items-center bg-slate-100 p-6">
      <Card className="w-full max-w-sm p-8 text-center">{children}</Card>
    </div>
  );
}

function Section({ icon, title, subtitle, children }: { icon: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-lg">{icon}</span>
        <div>
          <h2 className="text-sm font-bold text-slate-800">{title}</h2>
          {subtitle && <p className="text-xs leading-snug text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

// Live object-URL for a picked file, cleaned up automatically.
function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) { setUrl(null); return; }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; required?: boolean; error?: string };
function TextField({ label, required, error, className, id, ...rest }: FieldProps) {
  return (
    <label className={clsx("block", className)} id={id}>
      <span className="label">{label}{required && <span className="text-rose-500"> *</span>}</span>
      <input
        className={clsx("input", error && "border-rose-400 focus:border-rose-400 focus:ring-rose-100")}
        {...rest}
      />
      {error && <span className="mt-1 block text-xs font-medium text-rose-600">{error}</span>}
    </label>
  );
}

function SelectField({ label, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select className="input bg-white" {...rest}>{children}</select>
    </label>
  );
}

// Circular profile-photo picker with live preview + camera support.
function PhotoAvatar({ file, onPick }: { file: File | null; onPick: (f: File | null) => void }) {
  const url = useObjectUrl(file);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col items-center gap-2">
      <button type="button" onClick={() => ref.current?.click()}
        className="group relative h-28 w-28 overflow-hidden rounded-full border-2 border-dashed border-slate-300 bg-slate-50 transition hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200">
        {url ? (
          <img src={url} alt="Your photo" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-400">
            <span className="text-2xl">👤</span>
            <span className="text-[11px] font-semibold">Add photo</span>
          </span>
        )}
        <span className="absolute bottom-1 right-1 grid h-7 w-7 place-items-center rounded-full bg-brand-600 text-xs text-white shadow ring-2 ring-white">📷</span>
      </button>
      {file && (
        <button type="button" onClick={() => { onPick(null); if (ref.current) ref.current.value = ""; }}
          className="text-xs font-medium text-slate-400 hover:text-rose-500">Remove photo</button>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
    </div>
  );
}

// Document picker with an image thumbnail (or PDF chip) preview.
function DocPicker({ label, file, onPick }: { label: string; file: File | null; onPick: (f: File | null) => void }) {
  const url = useObjectUrl(file);
  const ref = useRef<HTMLInputElement>(null);
  const isPdf = file && !file.type.startsWith("image/");
  return (
    <div>
      <span className="label">{label}</span>
      {file ? (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2">
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100">
            {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span className="text-xl">📄</span>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-700">{file.name}</p>
            <p className="text-xs text-slate-400">{isPdf ? "PDF" : "Image"} · {(file.size / 1024).toFixed(0)} KB</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button type="button" onClick={() => ref.current?.click()} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50">Change</button>
            <button type="button" onClick={() => { onPick(null); if (ref.current) ref.current.value = ""; }} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-400 hover:bg-rose-50 hover:text-rose-500">Remove</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => ref.current?.click()}
          className="flex w-full items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-left transition hover:border-brand-400 hover:bg-brand-50/40">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-white text-lg shadow-sm">📷</span>
          <span className="text-sm text-slate-500">Take a photo or upload a file</span>
        </button>
      )}
      <input ref={ref} type="file" accept="image/*,application/pdf" className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
    </div>
  );
}
