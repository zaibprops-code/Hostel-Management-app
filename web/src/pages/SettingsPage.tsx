import { useState } from "react";
import { api, apiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useApi } from "../lib/useApi";
import { PageHeader, Card, Button, Input, ErrorText } from "../components/ui";

function mb(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { data: storage } = useApi<any>("/storage");
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

        {storage && (() => {
          const pct = Math.min(100, Math.round((storage.dbBytes / storage.limitBytes) * 100));
          const bar = pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
          return (
            <Card className="p-6 lg:col-span-2">
              <h3 className="font-semibold text-slate-800 mb-1">Storage</h3>
              <p className="text-sm text-slate-400 mb-4">Photos &amp; documents are stored in your database (about {mb(storage.limitBytes)} free).</p>

              <div className="flex items-end justify-between mb-1.5">
                <span className="text-2xl font-bold text-slate-900">{mb(storage.dbBytes)}</span>
                <span className="text-sm text-slate-400">of {mb(storage.limitBytes)} used ({pct}%)</span>
              </div>
              <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.max(2, pct)}%` }} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-400">Files stored</p>
                  <p className="text-lg font-bold text-slate-800">{storage.fileCount.toLocaleString()}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-400">Files size</p>
                  <p className="text-lg font-bold text-slate-800">{mb(storage.fileBytes)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-400">Avg / file</p>
                  <p className="text-lg font-bold text-slate-800">{storage.avgFileBytes ? mb(storage.avgFileBytes) : "—"}</p>
                </div>
              </div>

              <p className="text-sm text-slate-600 mt-4">
                Room for roughly <b className="text-brand-600">{storage.estimatedFilesRemaining.toLocaleString()}</b> more photos/documents
                {storage.avgFileBytes ? " at your current average size." : " (estimated at ~600 KB each)."}
              </p>
              {pct >= 80 && <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">Storage is getting full. Let your developer know so more space can be added.</p>}
            </Card>
          );
        })()}
      </div>
    </div>
  );
}
