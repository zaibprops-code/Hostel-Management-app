import { useCallback, useEffect, useRef, useState } from "react";
import { api, apiError } from "./api";

// Simple data-fetching hook with loading/error/refetch.
//
// Important UX detail: `loading` is only true for the FIRST load of a given URL
// (and when the URL/deps change to a genuinely new dataset). A `refetch()` after
// that — e.g. the reload a page runs right after adding or editing a record —
// updates the data IN PLACE without flipping `loading` back to true. That keeps
// the list on screen (pages that do `if (loading) return <Loader/>` don't blank
// out) so edits appear seamlessly instead of forcing a full-page spinner. Use
// `refreshing` if you want to show a subtle background-activity hint.
export function useApi<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  const refetch = useCallback(async () => {
    if (!url) {
      setLoading(false);
      return;
    }
    // First load blanks to a loader; later refetches refresh quietly.
    if (loadedRef.current) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.get<T>(url);
      setData(res.data);
      loadedRef.current = true;
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  useEffect(() => {
    // A new URL/deps set is a new dataset → show the loader again.
    loadedRef.current = false;
    refetch();
  }, [refetch]);

  return { data, loading, refreshing, error, refetch, setData };
}

// Build a URL with an optional scope param plus extra query values.
export function withQuery(base: string, ...parts: (string | undefined | false)[]): string {
  const q = parts.filter(Boolean).join("&");
  return q ? `${base}${base.includes("?") ? "&" : "?"}${q}` : base;
}
