import { useState } from "react";
import { api, apiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { PageHeader, Card, Button, Input, ErrorText } from "../components/ui";

export default function SettingsPage() {
  const { user } = useAuth();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [msg, setMsg] = useState(""); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault(); setError(""); setMsg("");
    if (form.newPassword !== form.confirm) return setError("New passwords do not match");
    setSaving(true);
    try {
      await api.post("/auth/change-password", { currentPassword: form.currentPassword, newPassword: form.newPassword });
      setMsg("Password updated successfully."); setForm({ currentPassword: "", newPassword: "", confirm: "" });
    } catch (err) { setError(apiError(err)); } finally { setSaving(false); }
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Profile & security" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="font-semibold text-slate-800 mb-4">Profile</h3>
          <div className="flex items-center gap-4 mb-4">
            <div className="h-16 w-16 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-2xl font-bold">{user?.name.charAt(0)}</div>
            <div>
              <p className="font-semibold text-slate-800">{user?.name}</p>
              <p className="text-sm text-slate-400">{user?.email}</p>
              <p className="text-xs text-slate-400 capitalize mt-0.5">{user?.role.toLowerCase()} · {user?.company.name}</p>
            </div>
          </div>
          <dl className="text-sm space-y-2">
            <div className="flex justify-between"><dt className="text-slate-400">Company</dt><dd className="font-medium">{user?.company.name}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Currency</dt><dd className="font-medium">{user?.company.currency}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Permissions</dt><dd className="font-medium">{user?.permissions.length}</dd></div>
          </dl>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold text-slate-800 mb-4">Change Password</h3>
          <form onSubmit={changePassword} className="space-y-3">
            <Input label="Current password" type="password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required />
            <Input label="New password" type="password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} minLength={8} required />
            <Input label="Confirm new password" type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />
            {msg && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">{msg}</p>}
            <ErrorText>{error}</ErrorText>
            <Button type="submit" loading={saving}>Update Password</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
