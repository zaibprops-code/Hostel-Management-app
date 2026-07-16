import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { api, apiError } from "../lib/api";
import { Button, Input, ErrorText, Card } from "../components/ui";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/reset-password", { token, newPassword: password });
      setDone(true);
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
      <Card className="w-full max-w-sm p-8">
        <h2 className="text-xl font-bold text-slate-900">Set a new password</h2>
        <p className="text-sm text-slate-500 mt-1 mb-6">Choose a strong password (min 8 characters).</p>
        {done ? (
          <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">Password updated! Redirecting to login…</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Input label="Reset token" value={token} onChange={(e) => setToken(e.target.value)} required />
            <Input label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
            <ErrorText>{error}</ErrorText>
            <Button type="submit" loading={loading} className="w-full">Update password</Button>
            <Link to="/login" className="text-sm text-brand-600 hover:underline block text-center">← Back to login</Link>
          </form>
        )}
      </Card>
    </div>
  );
}
