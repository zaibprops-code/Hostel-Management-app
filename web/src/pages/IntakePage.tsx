import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, apiError } from "../lib/api";
import { Card, Button, Input, Select, ErrorText, Spinner } from "../components/ui";

// Public, no-login resident self-intake form reached via a hostel's shared
// /intake/:token link. Submissions land in the owner's app as pending records.

const BLANK = {
  fullName: "", guardianName: "", cnic: "", dateOfBirth: "", gender: "MALE",
  phone: "", whatsapp: "", email: "", city: "", permanentAddress: "", currentAddress: "",
  occupantType: "STUDENT", university: "", program: "", studentId: "", company: "", occupation: "",
  emergencyName: "", emergencyRelation: "", emergencyPhone: "",
};

export default function IntakePage() {
  const { token } = useParams();
  const [state, setState] = useState<"loading" | "ok" | "invalid">("loading");
  const [info, setInfo] = useState<{ hostelName: string; companyName: string } | null>(null);
  const [form, setForm] = useState<any>(BLANK);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/public/intake/${token}`);
        setInfo(data); setState("ok");
      } catch { setState("invalid"); }
    })();
  }, [token]);

  function set(k: string, v: string) { setForm((f: any) => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.email) delete payload.email;
      if (!payload.dateOfBirth) delete payload.dateOfBirth;
      await api.post(`/public/intake/${token}`, payload);
      setDone(true);
    } catch (err) { setError(apiError(err)); } finally { setSaving(false); }
  }

  if (state === "loading") {
    return <div className="min-h-screen grid place-items-center bg-slate-100"><Spinner className="h-8 w-8 text-brand-600" /></div>;
  }
  if (state === "invalid") {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-100 p-6">
        <Card className="max-w-sm w-full p-8 text-center">
          <div className="text-4xl mb-3">🔗</div>
          <h1 className="text-lg font-bold text-slate-900">This link isn't working</h1>
          <p className="text-sm text-slate-500 mt-2">The registration link is invalid or has been turned off. Please ask the hostel for a new link.</p>
        </Card>
      </div>
    );
  }
  if (done) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-100 p-6">
        <Card className="max-w-sm w-full p-8 text-center">
          <div className="text-4xl mb-3">✅</div>
          <h1 className="text-lg font-bold text-slate-900">Thank you!</h1>
          <p className="text-sm text-slate-500 mt-2">
            Your details have been sent to <b>{info?.hostelName}</b>. They'll get in touch to confirm your room. You can close this page.
          </p>
        </Card>
      </div>
    );
  }

  const isStudent = form.occupantType === "STUDENT";
  const isPro = form.occupantType === "PROFESSIONAL";

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-4 safe-top safe-bottom">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-5">
          <div className="text-3xl">🏨</div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">{info?.hostelName}</h1>
          <p className="text-sm text-slate-500">Resident registration — please fill in your details</p>
        </div>

        <form onSubmit={submit}>
          <Card className="p-5 space-y-3">
            <h2 className="text-sm font-semibold text-brand-700 uppercase tracking-wide">Personal</h2>
            <Input label="Full name *" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} required />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Father / Guardian name" value={form.guardianName} onChange={(e) => set("guardianName", e.target.value)} />
              <Input label="CNIC number" value={form.cnic} onChange={(e) => set("cnic", e.target.value)} />
              <Input label="Date of birth" type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
              <Select label="Gender" value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                <option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option>
              </Select>
              <Input label="Mobile number" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              <Input label="WhatsApp number" value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
              <Input label="Email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              <Input label="City" value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <Input label="Permanent address" value={form.permanentAddress} onChange={(e) => set("permanentAddress", e.target.value)} />
            <Input label="Current address" value={form.currentAddress} onChange={(e) => set("currentAddress", e.target.value)} />
          </Card>

          <Card className="p-5 space-y-3 mt-4">
            <h2 className="text-sm font-semibold text-brand-700 uppercase tracking-wide">You are a…</h2>
            <Select label="Occupant type" value={form.occupantType} onChange={(e) => set("occupantType", e.target.value)}>
              <option value="STUDENT">Student</option><option value="PROFESSIONAL">Working professional</option><option value="DAILY">Daily / short-stay guest</option>
            </Select>
            {isStudent && (
              <div className="grid grid-cols-2 gap-3">
                <Input label="University" value={form.university} onChange={(e) => set("university", e.target.value)} />
                <Input label="Program / class" value={form.program} onChange={(e) => set("program", e.target.value)} />
                <Input label="Student ID" value={form.studentId} onChange={(e) => set("studentId", e.target.value)} />
              </div>
            )}
            {isPro && (
              <div className="grid grid-cols-2 gap-3">
                <Input label="Company / employer" value={form.company} onChange={(e) => set("company", e.target.value)} />
                <Input label="Job title" value={form.occupation} onChange={(e) => set("occupation", e.target.value)} />
              </div>
            )}
          </Card>

          <Card className="p-5 space-y-3 mt-4">
            <h2 className="text-sm font-semibold text-brand-700 uppercase tracking-wide">Emergency contact</h2>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Name" value={form.emergencyName} onChange={(e) => set("emergencyName", e.target.value)} />
              <Input label="Relationship" value={form.emergencyRelation} onChange={(e) => set("emergencyRelation", e.target.value)} />
            </div>
            <Input label="Phone number" value={form.emergencyPhone} onChange={(e) => set("emergencyPhone", e.target.value)} />
          </Card>

          <div className="mt-4">
            <ErrorText>{error}</ErrorText>
            <Button type="submit" loading={saving} className="w-full">Submit my details</Button>
            <p className="text-center text-xs text-slate-400 mt-3">Your information is sent only to {info?.companyName}.</p>
          </div>
        </form>
      </div>
    </div>
  );
}
