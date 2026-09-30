import { ReactNode, useEffect, useMemo, useState } from "react";
import { api, apiError } from "../lib/api";
import { toast } from "../lib/toast";
import { useAuth } from "../context/AuthContext";
import { Modal, Button, Input, Select, Textarea, ErrorText } from "./ui";
import { formatPKR } from "../lib/format";

// Every editable resident detail, as the form holds it (text / "" for empty).
const FIELDS = [
  "fullName", "occupantType", "gender", "dateOfBirth", "cnic", "phone", "whatsapp", "email",
  "university", "program", "studentId", "company", "occupation",
  "guardianName", "guardianPhone", "guardianOccupation", "businessAddress",
  "permanentAddress", "currentAddress", "city",
  "emergencyName", "emergencyRelation", "emergencyPhone",
  "localRefName", "localRefRelation", "localRefPhone", "localRefAddress",
  "religion", "nationality", "bloodGroup", "vehicle", "medicalNotes", "howHeard",
  "foodPlanId", "contractMonths", "expectedMoveIn", "expectedStayMonths",
] as const;
type Field = (typeof FIELDS)[number];
type Form = Record<Field, string>;
const DATE_FIELDS: Field[] = ["dateOfBirth", "expectedMoveIn"];
const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

function toForm(r: any): Form {
  const f = {} as Form;
  for (const k of FIELDS) {
    const v = r?.[k];
    f[k] = v == null ? "" : DATE_FIELDS.includes(k) ? String(v).slice(0, 10) : String(v);
  }
  return f;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">{title}</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

// Edit a resident's details — name, contacts, study / work, guardian,
// addresses, emergency & local reference, and the rest. Sends only what
// changed. (Room, rent, deposit and stay dates have their own actions.)
export default function EditResidentModal({ r, open, onClose, onSaved }: { r: any; open: boolean; onClose: () => void; onSaved: (updated: any) => void }) {
  const { can } = useAuth();
  const [form, setForm] = useState<Form>(() => toForm(r));
  const [initial, setInitial] = useState<Form>(() => toForm(r));
  const [plans, setPlans] = useState<{ id: string; name: string; monthlyCost: number }[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const f = toForm(r);
    setForm(f); setInitial(f); setError("");
    if (can("food.view") && plans === null) {
      api.get("/food/plans").then(({ data }) => setPlans(data)).catch(() => setPlans([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const changed = useMemo(() => FIELDS.filter((k) => form[k] !== initial[k]), [form, initial]);
  const set = (k: Field) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const field = (k: Field, label: string, props: Record<string, unknown> = {}) => (
    <Input label={label} value={form[k]} onChange={set(k)} {...props} />
  );
  const isDaily = r?.occupantType === "DAILY";

  async function save() {
    if (!form.fullName.trim()) { setError("Name can't be empty."); return; }
    if (!changed.length) { onClose(); return; }
    setSaving(true); setError("");
    try {
      const payload = Object.fromEntries(changed.map((k) => [k, form[k]]));
      const { data } = await api.put(`/residents/${r.id}`, payload);
      toast.success(data.changed?.length ? `Details saved (${data.changed.length} change${data.changed.length === 1 ? "" : "s"}).` : "No changes to save.");
      onSaved(data);
      onClose();
    } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Edit details — ${r?.fullName ?? ""}`} wide>
      <div className="space-y-5">
        <Section title="Basic">
          <div className="sm:col-span-2">{field("fullName", "Full name *", { maxLength: 120 })}</div>
          {isDaily ? (
            <Input label="Resident type" value="Daily guest" disabled />
          ) : (
            <Select label="Resident type" value={form.occupantType} onChange={set("occupantType")}>
              <option value="STUDENT">Student</option>
              <option value="PROFESSIONAL">Professional</option>
            </Select>
          )}
          <Select label="Gender" value={form.gender} onChange={set("gender")}>
            <option value="">—</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </Select>
          {field("dateOfBirth", "Date of birth", { type: "date" })}
          {field("cnic", "CNIC", { placeholder: "12345-1234567-1" })}
          {field("phone", "Phone", { inputMode: "tel" })}
          {field("whatsapp", "WhatsApp", { inputMode: "tel" })}
          <div className="sm:col-span-2">
            {field("email", "Email", { type: "email" })}
            {r?.userId && <p className="mt-1 text-xs text-slate-400">They sign in to the resident portal with this email — changing it changes their login too.</p>}
          </div>
        </Section>

        {form.occupantType === "PROFESSIONAL" ? (
          <Section title="Work">
            {field("company", "Company / organisation")}
            {field("occupation", "Occupation / designation")}
          </Section>
        ) : !isDaily ? (
          <Section title="Study">
            {field("university", "University / college")}
            {field("program", "Program / degree")}
            {field("studentId", "Student ID")}
          </Section>
        ) : null}

        <Section title="Guardian">
          {field("guardianName", "Father / guardian name")}
          {field("guardianPhone", "Guardian phone", { inputMode: "tel" })}
          {field("guardianOccupation", "Guardian occupation")}
          {field("businessAddress", "Business / office address")}
        </Section>

        <Section title="Addresses">
          <div className="sm:col-span-2">{field("permanentAddress", "Permanent address")}</div>
          <div className="sm:col-span-2">{field("currentAddress", "Current address")}</div>
          {field("city", "City")}
        </Section>

        <Section title="Emergency contact">
          {field("emergencyName", "Name")}
          {field("emergencyRelation", "Relation")}
          {field("emergencyPhone", "Phone", { inputMode: "tel" })}
        </Section>

        <Section title="Local reference">
          {field("localRefName", "Name")}
          {field("localRefRelation", "Relation")}
          {field("localRefPhone", "Phone", { inputMode: "tel" })}
          {field("localRefAddress", "Address in the city")}
        </Section>

        <Section title="Other">
          {field("religion", "Religion")}
          {field("nationality", "Nationality")}
          <Select label="Blood group" value={form.bloodGroup} onChange={set("bloodGroup")}>
            <option value="">—</option>
            {[...BLOOD, ...(form.bloodGroup && !BLOOD.includes(form.bloodGroup) ? [form.bloodGroup] : [])].map((b) => <option key={b} value={b}>{b}</option>)}
          </Select>
          {field("vehicle", "Vehicle", { placeholder: "e.g. Bike LEA-1234" })}
          {plans !== null && (
            <Select label="Food plan" value={form.foodPlanId} onChange={set("foodPlanId")}>
              <option value="">None</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({formatPKR(p.monthlyCost)})</option>)}
              {form.foodPlanId && !plans.some((p) => p.id === form.foodPlanId) && <option value={form.foodPlanId}>{r?.foodPlan?.name ?? "Current plan"}</option>}
            </Select>
          )}
          {!isDaily && field("contractMonths", "Contract (months)", { type: "number", min: 0, max: 120 })}
          {field("howHeard", "How they heard about us")}
          {field("expectedMoveIn", "Expected move-in", { type: "date" })}
          {field("expectedStayMonths", "Expected stay (months)", { type: "number", min: 0, max: 120 })}
          <div className="sm:col-span-2">
            <Textarea label="Medical notes" value={form.medicalNotes} onChange={set("medicalNotes")} maxLength={1000} placeholder="Allergies or conditions the hostel should know" />
          </div>
        </Section>

        <p className="text-xs text-slate-400">Room, rent, deposit and the hostel are changed from their own actions on this page (Change room, Edit rent terms, Deposit → Edit).</p>
        <ErrorText>{error}</ErrorText>
        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto text-xs text-slate-500">{changed.length ? `${changed.length} unsaved change${changed.length === 1 ? "" : "s"}` : "No changes yet"}</span>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} disabled={!changed.length || !form.fullName.trim()} onClick={save}>Save details</Button>
        </div>
      </div>
    </Modal>
  );
}
