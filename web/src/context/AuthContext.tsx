import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, tokenStore } from "../lib/api";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadMe() {
    if (!tokenStore.access) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
    } catch {
      tokenStore.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMe();
  }, []);

  async function login(email: string, password: string) {
    const { data } = await api.post("/auth/login", { email, password });
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
