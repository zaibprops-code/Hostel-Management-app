import { useState } from "react";
import { Link } from "react-router-dom";
import { api, apiError } from "../lib/api";
import { Button, Input, ErrorText, Card } from "../components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<{ message: string; devResetToken?: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/auth/forgot-password", { email });
      setSent(data);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
      <Card className="w-full max-w-sm p-8">
        <h2 className="text-xl font-bold text-slate-900">Reset your password</h2>
        <p className="text-sm text-slate-500 mt-1 mb-6">Enter your email and we'll generate a reset link.</p>
        {sent ? (
          <div className="space-y-4">
            <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">{sent.message}</p>
            {sent.devResetToken && (
              <div className="text-xs bg-slate-100 rounded-lg p-3">
                <p className="font-semibold text-slate-600 mb-1">Dev reset token:</p>
                <Link to={`/reset-password?token=${sent.devResetToken}`} className="text-brand-600 break-all hover:underline">
                  Continue to reset →
                </Link>
              </div>
            )}
            <Link to="/login" className="text-sm text-brand-600 hover:underline block">← Back to login</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            <ErrorText>{error}</ErrorText>
            <Button type="submit" loading={loading} className="w-full">Send reset link</Button>
            <Link to="/login" className="text-sm text-brand-600 hover:underline block text-center">← Back to login</Link>
          </form>
        )}
      </Card>
    </div>
  );
}
