import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "../lib/api";
import { useAuth } from "./AuthContext";

export interface HostelLite {
  id: string;
  name: string;
  code: string;
  city?: string;
  rentDueDay?: number; // day of month monthly rent is due by
  stats?: { totalBeds: number; occupiedBeds: number; availableBeds: number; occupancyRate: number; activeResidents: number };
}

interface HostelContextValue {
  hostels: HostelLite[];
  selected: string | "all";
  setSelected: (id: string | "all") => void;
  loading: boolean;
  reload: () => Promise<void>;
  // Optimistic, in-place updates so the branch switcher reflects a rename or
  // removal instantly, before the server round-trip completes.
  patchLocal: (id: string, changes: Partial<HostelLite>) => void;
  removeLocal: (id: string) => void;
  // convenience: the hostelId query string fragment for API calls
  scopeParam: string;
}

const HostelContext = createContext<HostelContextValue | null>(null);

export function HostelProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // The hostel list is remembered per user on this device so pages and the
  // switcher appear instantly; it is refreshed from the server right away.
  const cacheKey = user ? `hms_hostels:${user.id}` : "";
  const readCache = (): HostelLite[] | null => {
    try { const raw = cacheKey ? localStorage.getItem(cacheKey) : null; return raw ? JSON.parse(raw) : null; } catch { return null; }
  };
  const [hostels, setHostelsState] = useState<HostelLite[]>(() => readCache() ?? []);
  const [selected, setSelected] = useState<string | "all">("all");
  const [loading, setLoading] = useState(() => !readCache());
  const setHostels = (next: HostelLite[] | ((hs: HostelLite[]) => HostelLite[])) =>
    setHostelsState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      try { if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify(value)); } catch { /* storage unavailable */ }
      return value;
    });

  async function reload() {
    // Residents use the separate portal; everyone else needs their hostel list
    // (for the switcher and for hostel dropdowns in create forms).
    if (!user || user.role === "RESIDENT") {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/hostels/accessible");
      setHostels(data);
    } catch {
      // Keep what we had (e.g. a network blip); only an empty list if nothing.
      setHostelsState((prev) => prev);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const cached = readCache();
    if (cached) { setHostelsState(cached); setLoading(false); }
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const patchLocal = (id: string, changes: Partial<HostelLite>) =>
    setHostels((hs) => hs.map((h) => (h.id === id ? { ...h, ...changes } : h)));
  const removeLocal = (id: string) => setHostels((hs) => hs.filter((h) => h.id !== id));

  const scopeParam = selected === "all" ? "" : `hostelId=${selected}`;

  return (
    <HostelContext.Provider value={{ hostels, selected, setSelected, loading, reload, patchLocal, removeLocal, scopeParam }}>
      {children}
    </HostelContext.Provider>
  );
}

export function useHostels() {
  const ctx = useContext(HostelContext);
  if (!ctx) throw new Error("useHostels must be used within HostelProvider");
  return ctx;
}
