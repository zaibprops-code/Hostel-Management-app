import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "../lib/api";
import { useAuth } from "./AuthContext";

export interface HostelLite {
  id: string;
  name: string;
  code: string;
  city?: string;
  stats?: { totalBeds: number; occupiedBeds: number; availableBeds: number; occupancyRate: number; activeResidents: number };
}

interface HostelContextValue {
  hostels: HostelLite[];
  selected: string | "all";
  setSelected: (id: string | "all") => void;
  loading: boolean;
  reload: () => Promise<void>;
  // convenience: the hostelId query string fragment for API calls
  scopeParam: string;
}

const HostelContext = createContext<HostelContextValue | null>(null);

export function HostelProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [hostels, setHostels] = useState<HostelLite[]>([]);
  const [selected, setSelected] = useState<string | "all">("all");
  const [loading, setLoading] = useState(true);

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
      setHostels([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const scopeParam = selected === "all" ? "" : `hostelId=${selected}`;

  return (
    <HostelContext.Provider value={{ hostels, selected, setSelected, loading, reload, scopeParam }}>
      {children}
    </HostelContext.Provider>
  );
}

export function useHostels() {
  const ctx = useContext(HostelContext);
  if (!ctx) throw new Error("useHostels must be used within HostelProvider");
  return ctx;
}
