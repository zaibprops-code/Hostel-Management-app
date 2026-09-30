import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import axios from "axios";
import { api, tokenStore, startKeepAlive } from "../lib/api";
import { clearApiCache } from "../lib/useApi";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: "OWNER" | "MANAGER" | "ACCOUNTANT" | "KITCHEN" | "STAFF" | "RESIDENT";
  avatarUrl?: string;
  company: { id: string; name: string; currency: string };
  permissions: string[];
  hostelIds: string[];
  residentId?: string | null;
  residentHostelId?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: string) => boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// The signed-in user is remembered on this device so the app opens instantly
// on the last session; the server re-confirms it in the background (and the
// API still checks every request). Only present while a login token exists.
const USER_KEY = "hms_user";
function readCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw && tokenStore.access ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}
function storeUser(u: AuthUser | null) {
  try {
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(USER_KEY);
  } catch { /* storage unavailable */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(readCachedUser);
  const [loading, setLoading] = useState(() => !readCachedUser());
  const setUser = (u: AuthUser | null) => {
    storeUser(u);
    setUserState(u);
  };

  async function loadMe() {
    if (!tokenStore.access) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
    } catch (err) {
      // Sign out only when the login itself is rejected — not when the network
      // blips or the server is waking up (keep the remembered session then).
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if ((status && status < 500) || !readCachedUser()) {
        tokenStore.clear();
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMe();
  }, []);

  // While signed in, keep the server warm and the login fresh.
  useEffect(() => {
    if (user) return startKeepAlive();
  }, [user?.id]);

  async function login(email: string, password: string) {
    const { data } = await api.post("/auth/login", { email, password });
    clearApiCache(); // never show a previous account's cached pages
    tokenStore.set(data.accessToken, data.refreshToken);
    setUser(data.user);
  }

  async function logout() {
    try {
      await api.post("/auth/logout");
    } catch {
      /* ignore */
    }
    tokenStore.clear();
    clearApiCache();
    try {
      Object.keys(localStorage).filter((k) => k.startsWith("hms_hostels:")).forEach((k) => localStorage.removeItem(k));
    } catch { /* storage unavailable */ }
    setUser(null);
  }

  const can = (permission: string) => !!user?.permissions.includes(permission);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, can, refresh: loadMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
