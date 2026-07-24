import { useState } from "react";
import { api, apiError } from "../lib/api";
import { useHostels } from "../context/HostelContext";
import { useApi } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, Select, ErrorText, PageLoader, Badge, EmptyState } from "../components/ui";
import { formatDateTime, titleCase } from "../lib/format";
import { IconUsers, IconPlus } from "../components/icons";

const ROLES = ["OWNER", "MANAGER", "ACCOUNTANT", "KITCHEN", "STAFF", "RESIDENT"];
// Permissions the owner commonly grants/revokes per user.
const GRANTABLE = ["finance.viewProfit", "capital.view", "capital.manage", "deposits.refund", "users.manage", "audit.view", "settings.manage"];

export default function UsersPage() {
  const { hostels } = useHostels();
  const { data, loading, refetch } = useApi<any[]>("/users");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<null | any>(null);
  const [form, setForm] = useState<any>({ name: "", email: "", phone: "", password: "", role: "MANAGER", hostelIds: [], permissions: {} });
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);

  function toggleHostel(id: string) {
    setForm((f: any) => ({ ...f, hostelIds: f.hostelIds.includes(id) ? f.hostelIds.filter((x: string) => x !== id) : [...f.hostelIds, id] }));
  }
  function togglePerm(key: string) {
    setForm((f: any) => ({ ...f, permissions: { ...f.permissions, [key]: !f.permissions[key] } }));
  }

  async function save() {
    setSaving(true); setError("");
    try {
      if (editing) {
        await api.put(`/users/${editing.id}`, { name: form.name, phone: form.phone, role: form.role, hostelIds: form.hostelIds, permissions: form.permissions });
      } else {
        await api.post("/users", form);
      }
      setOpen(false); setEditing(null); await refetch();
    } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }

  function openNew() {
    setEditing(null);
    setForm({ name: "", email: "", phone: "", password: "", role: "MANAGER", hostelIds: [], permissions: {} });
    setOpen(true);
  }
  function openEdit(u: any) {
    setEditing(u);
    const perms: Record<string, boolean> = {};
    GRANTABLE.forEach((p) => { perms[p] = u.permissions.includes(p); });
    setForm({ name: u.name, email: u.email, phone: u.phone ?? "", password: "", role: u.role, hostelIds: u.hostels.map((h: any) => h.id), permissions: perms });
    setOpen(true);
  }
  async function resetPassword(u: any) {
    const pw = prompt(`Set a new password for ${u.name} (min 8 chars):`);
    if (!pw) return;
    try { await api.post(`/users/${u.id}/reset-password`, { newPassword: pw }); alert("Password updated."); } catch (e) { alert(apiError(e)); }
  }

  if (loading) return <PageLoader />;

  return (
    <div>
      <PageHeader title="Users & Permissions" subtitle="Team accounts and role-based access"
        actions={<Button onClick={openNew}><IconPlus className="h-4 w-4" /> New User</Button>} />

      {!data?.length ? <EmptyState title="No users" icon={<IconUsers className="h-12 w-12" />} /> : (
        <Card className="overflow-hidden">
          <div className="sm:hidden divide-y divide-slate-100">
            {data.map((u) => (
              <div key={u.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{u.name}</p>
                    <p className="text-xs text-slate-400 truncate">{u.email}</p>
                  </div>
                  <Badge color="blue">{titleCase(u.role)}</Badge>
                </div>
                <div className="flex gap-4 mt-2">
                  <button onClick={() => openEdit(u)} className="text-brand-600 text-sm font-medium">Edit</button>
                  <button onClick={() => resetPassword(u)} className="text-slate-500 text-sm font-medium">Reset password</button>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50"><tr><th className="th">Name</th><th className="th">Role</th><th className="th">Hostels</th><th className="th">Last Login</th><th className="th">Status</th><th className="th"></th></tr></thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="td"><p className="font-medium text-slate-800">{u.name}</p><p className="text-xs text-slate-400">{u.email}</p></td>
                    <td className="td"><Badge color="blue">{titleCase(u.role)}</Badge></td>
                    <td className="td text-xs">{u.hostels.length ? u.hostels.map((h: any) => h.name).join(", ") : (u.role === "OWNER" ? "All" : "—")}</td>
                    <td className="td text-xs">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}</td>
                    <td className="td">{u.isActive ? <Badge color="green">Active</Badge> : <Badge color="gray">Disabled</Badge>}</td>
                    <td className="td text-right whitespace-nowrap">
                      <button onClick={() => openEdit(u)} className="text-brand-600 hover:underline text-sm mr-3">Edit</button>
                      <button onClick={() => resetPassword(u)} className="text-slate-500 hover:underline text-sm">Reset PW</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={open} onClose={() => { setOpen(false); setEditing(null); }} title={editing ? "Edit User" : "New User"} wide>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Email" type="email" value={form.email} disabled={!!editing} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}</Select>
          {!editing && <div className="col-span-2"><Input label="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>}
        </div>

        <div className="mt-4">
          <p className="label">Hostel access</p>
          <div className="flex flex-wrap gap-2">
            {hostels.map((h) => (
              <button key={h.id} onClick={() => toggleHostel(h.id)} type="button"
                className={`rounded-lg border px-3 py-1.5 text-sm ${form.hostelIds.includes(h.id) ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600"}`}>
                {h.name}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <p className="label">Extra permissions (override role defaults)</p>
          <div className="grid grid-cols-2 gap-2">
            {GRANTABLE.map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm rounded-lg border border-slate-200 px-3 py-2">
                <input type="checkbox" checked={!!form.permissions[p]} onChange={() => togglePerm(p)} />
                <span>{p}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-1">e.g. allow a manager to view profit or refund deposits.</p>
        </div>

        <ErrorText>{error}</ErrorText>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => { setOpen(false); setEditing(null); }}>Cancel</Button><Button loading={saving} onClick={save}>{editing ? "Save Changes" : "Create User"}</Button></div>
      </Modal>
    </div>
  );
}
