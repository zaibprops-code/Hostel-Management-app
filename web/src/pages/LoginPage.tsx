import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, apiError, isNativeApp, needsServerConfig, getApiBase, setApiBase, clearApiBase } from "../lib/api";
import { Button, Input, ErrorText, Spinner } from "../components/ui";

type View = "loading" | "server" | "onboarding" | "login";

export default function LoginPage() {
  const { login, refresh } = useAuth();
  const navigate = useNavigate();

  const [view, setView] = useState<View>("loading");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Whether new owners may self-register, and whether this is the very first
  // business on a brand-new server (changes the sign-up screen's wording).
  const [allowSignup, setAllowSignup] = useState(true);
  const [isFirstRun, setIsFirstRun] = useState(false);

  // Login fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // First-run setup fields
  const [companyName, setCompanyName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");

  // Server address (phone app only)
  const [serverInput, setServerInput] = useState(() => {
    const base = getApiBase();
    return base === "/api" ? "" : base.replace(/\/api$/, "");
  });

  // Decide which screen to show.
  async function resolveView() {
    if (needsServerConfig()) {
      setView("server");
      return;
    }
    try {
      const { data } = await api.get("/setup/status");
      setAllowSignup(data.allowSignup ?? true);
      setIsFirstRun(Boolean(data.needsSetup));
      setView(data.needsSetup ? "onboarding" : "login");
    } catch {
      // If we cannot reach the server, fall back to the login screen.
      setView("login");
    }
  }

  useEffect(() => {
    resolveView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function saveServer(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (serverInput.trim()) setApiBase(serverInput);
    else clearApiBase();
    setView("loading");
    resolveView();
  }

  async function submitLogin(e: React.FormEvent) {
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

  async function submitSetup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/register", { companyName, name: ownerName, email: ownerEmail, password: ownerPassword });
      await login(ownerEmail, ownerPassword);
      await refresh();
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
          <span className="text-xl font-bold">Hostel Manager</span>
        </div>
        <div>
          <h1 className="text-4xl font-extrabold leading-tight">Run your entire hostel business from one platform.</h1>
          <p className="mt-4 text-brand-100 max-w-md">
            Residents, rooms &amp; beds, rent collection, expenses, food, staff and full financials — across every
            branch, in real time.
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
        <p className="text-xs text-brand-200">© {new Date().getFullYear()} Hostel Manager</p>
      </div>

      {/* Right side */}
      <div className="flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <span className="text-3xl">🏨</span>
            <span className="text-lg font-bold text-slate-900">Hostel Manager</span>
          </div>

          {view === "loading" && (
            <div className="flex justify-center py-20"><Spinner className="h-8 w-8 text-brand-600" /></div>
          )}

          {/* Phone app: enter server address (shown once, then remembered) */}
          {view === "server" && (
            <form onSubmit={saveServer} className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Connect to your hostel</h2>
                <p className="text-sm text-slate-500 mt-1">Enter your hostel's web address to get started. You only do this once.</p>
              </div>
              <div>
                <span className="label">Server address</span>
                <input className="input" placeholder="e.g. hostel-api-3fu5.onrender.com" value={serverInput} onChange={(e) => setServerInput(e.target.value)} autoFocus />
                <p className="text-xs text-slate-400 mt-1">Your administrator will give you this address.</p>
              </div>
              <Button type="submit" className="w-full">Continue</Button>
            </form>
          )}

          {/* Create a business account (first-run OR self-service sign-up) */}
          {view === "onboarding" && (
            <form onSubmit={submitSetup} className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">
                  {isFirstRun ? "Welcome! Let's set up your business" : "Create your business account"}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Set up your hostel business and its owner login. You'll get your own private space.
                </p>
              </div>
              <Input label="Business name" placeholder="e.g. Khan Hostels" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required autoFocus />
              <Input label="Your full name" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required />
              <Input label="Your email" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} required />
              <Input label="Create a password" type="password" value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} minLength={8} required />
              <p className="text-xs text-slate-400">Use at least 8 characters. Keep it safe — this is your owner login.</p>
              <ErrorText>{error}</ErrorText>
              <Button type="submit" loading={loading} className="w-full">Create my account</Button>
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => { setError(""); setView("login"); }} className="text-sm text-brand-600 hover:underline">
                  ← Already have an account? Sign in
                </button>
                {isNativeApp() && (
                  <button type="button" onClick={() => setView("server")} className="text-xs text-slate-400 hover:text-brand-600">⚙ Change server</button>
                )}
              </div>
            </form>
          )}

          {/* Normal login */}
          {view === "login" && (
            <>
              <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
              <p className="text-sm text-slate-500 mt-1 mb-6">Sign in to your management account.</p>
              <form onSubmit={submitLogin} className="space-y-4">
                <Input label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
                <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <ErrorText>{error}</ErrorText>
                <Button type="submit" loading={loading} className="w-full">Sign in</Button>
              </form>
              <div className="mt-3 flex items-center justify-between">
                {isNativeApp() ? (
                  <button type="button" onClick={() => setView("server")} className="text-xs text-slate-400 hover:text-brand-600">⚙ Server settings</button>
                ) : <span />}
                <Link to="/forgot-password" className="text-sm text-brand-600 hover:underline">Forgot password?</Link>
              </div>
              {allowSignup && (
                <p className="mt-6 pt-4 border-t border-slate-100 text-center text-sm text-slate-500">
                  New here?{" "}
                  <button type="button" onClick={() => { setError(""); setView("onboarding"); }} className="text-brand-600 font-medium hover:underline">
                    Create a business account
                  </button>
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
