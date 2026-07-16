import { useCallback, useEffect, useState } from "react";
import { api, apiError } from "./api";

// Simple data-fetching hook with loading/error/refetch.
export function useApi<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!url) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<T>(url);
      setData(res.data);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch, setData };
}

// Build a URL with an optional scope param plus extra query values.
export function withQuery(base: string, ...parts: (string | undefined | false)[]): string {
  const q = parts.filter(Boolean).join("&");
  return q ? `${base}${base.includes("?") ? "&" : "?"}${q}` : base;
}
