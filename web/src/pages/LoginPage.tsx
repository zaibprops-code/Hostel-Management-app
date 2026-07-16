import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiError } from "../lib/api";
import { Button, Input, ErrorText } from "../components/ui";

const DEMO = [
  { role: "Owner", email: "owner@xyzhostel.com" },
  { role: "Manager", email: "manager@xyzhostel.com" },
  { role: "Accountant", email: "accountant@xyzhostel.com" },
  { role: "Kitchen", email: "kitchen@xyzhostel.com" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("owner@xyzhostel.com");
  const [password, setPassword] = useState("Password123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-brand-700 via-brand-800 to-slate-900 p-12 text-white">
        <div className="flex items-center gap-3">
          <span className="text-4xl">🏨</span>
          <span className="text-xl font-bold">XYZ Hostel Group</span>
        </div>
        <div>
          <h1 className="text-4xl font-extrabold leading-tight">Run your entire hostel business from one platform.</h1>
          <p className="mt-4 text-brand-100 max-w-md">
            Residents, rooms & beds, rent collection, expenses, food, staff and full financials — across every branch,
            in real time.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-4 max-w-md">
            {[["Multi-branch", "Hostels"], ["Rent & deposits", "Finance"], ["Role-based", "Access control"]].map(([a, b]) => (
              <div key={a} className="rounded-xl bg-white/10 p-4">
                <p className="font-semibold">{a}</p>
                <p className="text-xs text-brand-200">{b}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-brand-200">© {new Date().getFullYear()} XYZ Hostel Group. Islamabad · Rawalpindi</p>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <span className="text-3xl">🏨</span>
            <span className="text-lg font-bold text-slate-900">XYZ Hostel Group</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
          <p className="text-sm text-slate-500 mt-1 mb-6">Sign in to your management account.</p>

          <form onSubmit={submit} className="space-y-4">
            <Input label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <ErrorText>{error}</ErrorText>
            <Button type="submit" loading={loading} className="w-full">Sign in</Button>
          </form>

          <div className="mt-3 text-right">
            <Link to="/forgot-password" className="text-sm text-brand-600 hover:underline">Forgot password?</Link>
          </div>

          <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold text-slate-500 mb-2">Demo accounts (password: Password123)</p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  onClick={() => { setEmail(d.email); setPassword("Password123"); }}
                  className="text-left rounded-lg border border-slate-200 px-3 py-2 hover:border-brand-400 hover:bg-brand-50 transition"
                >
                  <p className="text-sm font-semibold text-slate-700">{d.role}</p>
                  <p className="text-[11px] text-slate-400 truncate">{d.email}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
