import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import clsx from "clsx";
import { api, apiError } from "../lib/api";
import { compressPhoto, compressDocument } from "../lib/image";
import { Spinner } from "../components/ui";
import { sound, isMuted, setMuted } from "../lib/sound";

// Public, no-login resident self-intake form reached via a hostel's shared
// /intake/:token link. Branded in Riwaq's colours (deep green + gold), with
// staggered reveal animations, subtle sound cues, live progress, and inline
// validation. Submissions land in the owner's app as pending records.

// ---- Riwaq brand palette (scoped to this public page) ---------------------
const GREEN = "#14442f";
const FIELD =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm transition outline-none focus:border-[#c9a45c] focus:ring-2 focus:ring-[#c9a45c]/30";
const LABEL = "mb-1 block text-xs font-semibold text-[#14442f]";

type Form = Record<string, string>;

const BLANK: Form = {
  fullName: "", guardianName: "", guardianPhone: "", cnic: "", dateOfBirth: "", gender: "",
  nationality: "", bloodGroup: "", phone: "", whatsapp: "", email: "", city: "",
  permanentAddress: "", currentAddress: "",
  occupantType: "STUDENT", university: "", program: "", studentId: "", company: "", occupation: "",
  expectedMoveIn: "", expectedStayMonths: "", vehicle: "",
  emergencyName: "", emergencyRelation: "", emergencyPhone: "",
  medicalNotes: "", howHeard: "",
};

type Files = { photo: File | null; cnicFront: File | null; cnicBack: File | null; studentCard: File | null };

// Fields that count toward the "profile complete" progress meter.
const TRACKED = ["fullName", "phone", "cnic", "dateOfBirth", "gender", "city", "permanentAddress", "emergencyName", "emergencyPhone"];

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
  const [muted, setMutedState] = useState(isMuted());
  const [invalidMsg, setInvalidMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/public/intake/${token}`);
        setInfo(data);
        if (data.gender === "MALE" || data.gender === "FEMALE") setForm((f) => ({ ...f, gender: data.gender }));
        setState("ok");
      } catch (e) {
        setInvalidMsg(apiError(e));
        setState("invalid");
      }
    })();
  }, [token]);

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: "" } : e));
  }
  function pickFile(key: keyof Files, f: File | null) {
    setFiles((s) => ({ ...s, [key]: f }));
    if (f) sound.pick();
  }
  function toggleMute() {
    const next = !muted;
    setMuted(next); setMutedState(next);
    if (!next) sound.tap(); // little confirmation that sound is back on
  }

  // Live completeness meter — encourages a full profile without blocking.
  const progress = useMemo(() => {
    const filled = TRACKED.filter((k) => (form[k] ?? "").trim()).length + (files.photo ? 1 : 0) + (files.cnicFront ? 1 : 0);
    return Math.round((filled / (TRACKED.length + 2)) * 100);
  }, [form, files]);

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
      sound.error();
      document.getElementById(`f-${Object.keys(found)[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
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
      sound.success();
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(apiError(err));
      sound.error();
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  }

  if (state === "loading") {
    return <div className="grid min-h-screen place-items-center bg-[#f4f2ea]"><Spinner className="h-8 w-8 text-[#14442f]" /></div>;
  }
  if (state === "invalid") {
    return (
      <BrandScreen>
        <div className="mb-3 text-5xl">🔗</div>
        <h1 className="text-lg font-bold text-slate-900">This link isn't working</h1>
        <p className="mt-2 text-sm text-slate-500">{invalidMsg || "The registration link is invalid or has been turned off. Please ask the hostel for a fresh link."}</p>
      </BrandScreen>
    );
  }
  if (done) {
    return (
      <BrandScreen>
        <div className="relative mx-auto mb-5 grid h-20 w-20 place-items-center">
          <span className="absolute inset-0 rounded-full bg-[#c9a45c]/40 animate-[intakeRing_1s_ease-out_forwards]" />
          <span className="grid h-20 w-20 place-items-center rounded-full bg-[#14442f] text-4xl text-white animate-[intakePop_0.5s_ease-out_both]">✓</span>
        </div>
        <img src="/riwaq-logo.png" alt="" className="mx-auto mb-4 h-14 w-14 rounded-xl object-cover" />
        <h1 className="text-xl font-bold text-slate-900">You're all set!</h1>
        <p className="mt-2 text-sm text-slate-500">
          Your details have been sent to <b className="text-[#14442f]">{info?.hostelName}</b>. They'll review them and get in touch to confirm your room. You can safely close this page.
        </p>
      </BrandScreen>
    );
  }

  const isStudent = form.occupantType === "STUDENT";
  const isPro = form.occupantType === "PROFESSIONAL";
  const genderFixed = info?.gender === "MALE" || info?.gender === "FEMALE";
  let step = 0;
  const delay = () => ({ animationDelay: `${step++ * 70}ms` });

  return (
    <div className="min-h-screen bg-[#f4f2ea] safe-top safe-bottom">
      <div className="mx-auto max-w-lg px-4 pb-36 pt-5">
        {/* ---- Branded header ---- */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1b5138] via-[#14442f] to-[#0d3323] p-7 text-center text-white shadow-xl shadow-[#0d3323]/20 animate-[intakeIn_0.5s_ease-out_both]">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#c9a45c]/10 blur-2xl" />
          <MuteButton muted={muted} onToggle={toggleMute} />
          <img src="/riwaq-logo.png" alt={info?.companyName || "Logo"} className="mx-auto h-24 w-24 rounded-2xl object-cover shadow-lg ring-1 ring-white/20" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight">{info?.hostelName}</h1>
          {info?.city && <p className="text-sm text-[#e8dcc0]/80">{info.city}</p>}
          <div className="mx-auto my-3 h-px w-16 bg-[#c9a45c]/50" />
          <p className="text-sm text-white/85">Resident registration — tell us a little about you</p>
          {genderFixed && (
            <span className="mt-3 inline-block rounded-full bg-[#c9a45c]/20 px-3 py-1 text-xs font-semibold text-[#e8dcc0] ring-1 ring-[#c9a45c]/40">
              {info?.gender === "MALE" ? "Boys hostel" : "Girls hostel"}
            </span>
          )}
        </div>

        <form onSubmit={submit} noValidate className="mt-5 space-y-4">
          <Section icon="📸" title="Your photo" subtitle="A clear face photo helps the hostel recognise you at check-in." style={delay()}>
            <PhotoAvatar file={files.photo} onPick={(f) => pickFile("photo", f)} />
          </Section>

          <Section icon="🧑" title="Personal details" style={delay()}>
            <div className="space-y-3">
              <TextField id="f-fullName" label="Full name" required value={form.fullName} error={errors.fullName}
                onChange={(e) => set("fullName", e.target.value)} placeholder="e.g. Ahmed Ali" autoComplete="name" />
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Father / Guardian name" value={form.guardianName} onChange={(e) => set("guardianName", e.target.value)} />
                <TextField label="Guardian's phone" value={form.guardianPhone} onChange={(e) => set("guardianPhone", e.target.value)} inputMode="tel" />
                <TextField label="CNIC number" value={form.cnic} onChange={(e) => set("cnic", e.target.value)} inputMode="numeric" placeholder="00000-0000000-0" />
                <TextField label="Date of birth" type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
                {!genderFixed && (
                  <SelectField label="Gender" value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                    <option value="">Select…</option>
                    <option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option>
                  </SelectField>
                )}
                <SelectField label="Blood group" value={form.bloodGroup} onChange={(e) => set("bloodGroup", e.target.value)}>
                  <option value="">Select…</option>
                  {["A+", "A−", "B+", "B−", "O+", "O−", "AB+", "AB−"].map((b) => <option key={b} value={b}>{b}</option>)}
                </SelectField>
                <TextField label="Nationality" value={form.nationality} onChange={(e) => set("nationality", e.target.value)} placeholder="Pakistani" />
                <TextField id="f-phone" label="Mobile number" required value={form.phone} error={errors.phone}
                  onChange={(e) => set("phone", e.target.value)} inputMode="tel" placeholder="03xx-xxxxxxx" autoComplete="tel" />
                <TextField label="WhatsApp number" value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} inputMode="tel" />
                <TextField id="f-email" label="Email" type="email" value={form.email} error={errors.email}
                  onChange={(e) => set("email", e.target.value)} inputMode="email" autoComplete="email" className="col-span-2" />
              </div>
            </div>
          </Section>

          <Section icon="🎓" title="You are a…" style={delay()}>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[["STUDENT", "Student", "🎓"], ["PROFESSIONAL", "Professional", "💼"], ["DAILY", "Short-stay", "🧳"]].map(([val, lbl, ic]) => (
                  <button type="button" key={val} onClick={() => { set("occupantType", val); sound.tap(); }}
                    className={clsx("flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs font-semibold transition active:scale-95",
                      form.occupantType === val
                        ? "border-[#14442f] bg-[#eef3ee] text-[#14442f] ring-2 ring-[#c9a45c]/40"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
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

          <Section icon="🏠" title="Address" style={delay()}>
            <div className="space-y-3">
              <TextField label="Permanent address" value={form.permanentAddress} onChange={(e) => set("permanentAddress", e.target.value)} />
              <TextField label="Current address" value={form.currentAddress} onChange={(e) => set("currentAddress", e.target.value)} />
              <TextField label="City" value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>
          </Section>

          <Section icon="🗓️" title="Your stay" subtitle="Helps the hostel plan your room." style={delay()}>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Expected move-in date" type="date" value={form.expectedMoveIn} onChange={(e) => set("expectedMoveIn", e.target.value)} />
              <TextField label="How many months?" value={form.expectedStayMonths} onChange={(e) => set("expectedStayMonths", e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="e.g. 12" />
              <TextField label="Vehicle (for parking)" value={form.vehicle} onChange={(e) => set("vehicle", e.target.value)} placeholder="Bike / Car / None" className="col-span-2" />
            </div>
          </Section>

          <Section icon="🪪" title="ID documents" subtitle="Optional but recommended — a photo of your CNIC speeds up check-in." style={delay()}>
            <div className="space-y-3">
              <DocPicker label="CNIC — front" file={files.cnicFront} onPick={(f) => pickFile("cnicFront", f)} />
              <DocPicker label="CNIC — back" file={files.cnicBack} onPick={(f) => pickFile("cnicBack", f)} />
              {isStudent && <DocPicker label="Student / University card" file={files.studentCard} onPick={(f) => pickFile("studentCard", f)} />}
            </div>
          </Section>

          <Section icon="🚨" title="Guardian & emergency contact" subtitle="Someone the hostel can call in an emergency." style={delay()}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Name" value={form.emergencyName} onChange={(e) => set("emergencyName", e.target.value)} />
                <TextField label="Relationship" value={form.emergencyRelation} onChange={(e) => set("emergencyRelation", e.target.value)} placeholder="e.g. Father" />
              </div>
              <TextField label="Phone number" value={form.emergencyPhone} onChange={(e) => set("emergencyPhone", e.target.value)} inputMode="tel" />
            </div>
          </Section>

          <Section icon="📝" title="A few more things" style={delay()}>
            <div className="space-y-3">
              <TextArea label="Medical conditions or allergies (optional)" value={form.medicalNotes} onChange={(e) => set("medicalNotes", e.target.value)}
                placeholder="Anything the hostel should know for your safety" rows={2} />
              <SelectField label="How did you hear about us?" value={form.howHeard} onChange={(e) => set("howHeard", e.target.value)}>
                <option value="">Select…</option>
                {["Friend or family", "Facebook / Instagram", "Google search", "Walked past", "University", "Another resident", "Other"].map((o) => <option key={o} value={o}>{o}</option>)}
              </SelectField>
            </div>
          </Section>

          {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 animate-[intakeIn_0.3s_ease-out_both]">{error}</p>}
        </form>
      </div>

      {/* ---- Sticky submit bar with progress ---- */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-black/5 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] backdrop-blur">
        <div className="mx-auto max-w-lg">
          <div className="mb-2 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-[#c9a45c] to-[#14442f] transition-all duration-500" style={{ width: `${Math.max(6, progress)}%` }} />
            </div>
            <span className="text-xs font-semibold text-[#14442f]">{progress}%</span>
          </div>
          <button type="button" onClick={submit} disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#14442f] py-3.5 text-base font-semibold text-white shadow-lg shadow-[#14442f]/20 transition hover:bg-[#0d3323] focus:outline-none focus:ring-2 focus:ring-[#c9a45c] active:scale-[0.99] disabled:opacity-70">
            {saving && <Spinner className="h-5 w-5 text-white" />}
            {saving ? "Submitting…" : "Submit my details"}
          </button>
          <p className="mt-2 text-center text-[11px] text-slate-400">🔒 Your information is sent only to {info?.companyName}.</p>
        </div>
      </div>
    </div>
  );
}

// ---- Building blocks ------------------------------------------------------

function BrandScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f4f2ea] p-6">
      <div className="w-full max-w-sm rounded-3xl border border-black/5 bg-white p-8 text-center shadow-xl animate-[intakeIn_0.4s_ease-out_both]">{children}</div>
    </div>
  );
}

function MuteButton({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-label={muted ? "Turn sounds on" : "Turn sounds off"}
      className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-lg ring-1 ring-white/20 transition hover:bg-white/20">
      {muted ? "🔇" : "🔊"}
    </button>
  );
}

function Section({ icon, title, subtitle, children, style }: { icon: string; title: string; subtitle?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm animate-[intakeIn_0.5s_ease-out_both]" style={style}>
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#eef3ee] text-lg ring-1 ring-[#14442f]/10">{icon}</span>
        <div>
          <h2 className="text-sm font-bold" style={{ color: GREEN }}>{title}</h2>
          {subtitle && <p className="text-xs leading-snug text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

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
      <span className={LABEL}>{label}{required && <span className="text-rose-500"> *</span>}</span>
      <input className={clsx(FIELD, error && "border-rose-400 focus:border-rose-400 focus:ring-rose-100")} {...rest} />
      {error && <span className="mt-1 block text-xs font-medium text-rose-600">{error}</span>}
    </label>
  );
}

function SelectField({ label, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <select className={clsx(FIELD, "bg-white")} {...rest}>{children}</select>
    </label>
  );
}

function TextArea({ label, className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className={LABEL}>{label}</span>
      <textarea className={clsx(FIELD, "resize-none")} {...rest} />
    </label>
  );
}

// Circular profile-photo picker with live preview + camera support.
function PhotoAvatar({ file, onPick }: { file: File | null; onPick: (f: File | null) => void }) {
  const url = useObjectUrl(file);
  const [broken, setBroken] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setBroken(false), [file]);
  return (
    <div className="flex flex-col items-center gap-2">
      <button type="button" onClick={() => ref.current?.click()}
        className="group relative h-28 w-28 overflow-hidden rounded-full border-2 border-dashed border-slate-300 bg-slate-50 transition hover:border-[#c9a45c] focus:outline-none focus:ring-2 focus:ring-[#c9a45c]/40">
        {url && !broken ? (
          <img src={url} alt="Your photo" className="h-full w-full object-cover" onError={() => setBroken(true)} />
        ) : file ? (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1 bg-emerald-50 text-emerald-600">
            <span className="text-2xl">✓</span><span className="text-[11px] font-semibold">Photo added</span>
          </span>
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-400">
            <span className="text-2xl">👤</span><span className="text-[11px] font-semibold">Add photo</span>
          </span>
        )}
        <span className="absolute bottom-1 right-1 grid h-7 w-7 place-items-center rounded-full bg-[#14442f] text-xs text-white shadow ring-2 ring-white">📷</span>
      </button>
      {file && (
        <button type="button" onClick={() => { onPick(null); if (ref.current) ref.current.value = ""; }}
          className="text-xs font-medium text-slate-400 hover:text-rose-500">Remove photo</button>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
    </div>
  );
}

// Document picker with an image thumbnail (or PDF chip) preview.
function DocPicker({ label, file, onPick }: { label: string; file: File | null; onPick: (f: File | null) => void }) {
  const url = useObjectUrl(file);
  const [broken, setBroken] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setBroken(false), [file]);
  const isPdf = file && !file.type.startsWith("image/");
  return (
    <div>
      <span className={LABEL}>{label}</span>
      {file ? (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2">
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100">
            {url && !broken ? <img src={url} alt="" className="h-full w-full object-cover" onError={() => setBroken(true)} /> : <span className="text-xl">📄</span>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-700">{file.name}</p>
            <p className="text-xs text-slate-400">{isPdf ? "PDF" : "Image"} · {(file.size / 1024).toFixed(0)} KB</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button type="button" onClick={() => ref.current?.click()} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#14442f] hover:bg-[#eef3ee]">Change</button>
            <button type="button" onClick={() => { onPick(null); if (ref.current) ref.current.value = ""; }} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-400 hover:bg-rose-50 hover:text-rose-500">Remove</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => ref.current?.click()}
          className="flex w-full items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-left transition hover:border-[#c9a45c] hover:bg-[#faf6ec]">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-white text-lg shadow-sm">📷</span>
          <span className="text-sm text-slate-500">Take a photo or upload a file</span>
        </button>
      )}
      <input ref={ref} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
    </div>
  );
}
