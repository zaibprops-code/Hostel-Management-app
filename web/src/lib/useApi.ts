import { useCallback, useEffect, useRef, useState } from "react";
import { api, apiError } from "./api";

// In-memory cache of the last response per URL (this browser tab only).
// Revisiting a page shows its last data instantly and refreshes it in the
// background ("stale-while-revalidate"), instead of a blank loader every time.
// Cleared on logout so one account never sees another's data.
const MAX_ENTRIES = 60;
const cache = new Map<string, unknown>();
function remember(url: string, data: unknown) {
  cache.delete(url); // re-insert → most recently used last
  cache.set(url, data);
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
}
export function clearApiCache() {
  cache.clear();
}

// Simple data-fetching hook with loading/error/refetch.
//
// Important UX detail: `loading` is only true for the FIRST load of a given URL
// (and when the URL/deps change to a genuinely new dataset) — and not even then
// if this URL was loaded before in this tab: the cached copy shows at once
// while fresh data loads. A `refetch()` after that — e.g. the reload a page
// runs right after adding or editing a record — updates the data IN PLACE
// without flipping `loading` back to true. That keeps the list on screen (pages
// that do `if (loading) return <Loader/>` don't blank out) so edits appear
// seamlessly. Use `refreshing` if you want to show a subtle activity hint.
export function useApi<T>(url: string | null, deps: unknown[] = []) {
  const [data, setDataState] = useState<T | null>(() => (url && cache.has(url) ? (cache.get(url) as T) : null));
  const [loading, setLoading] = useState(() => !(url && cache.has(url)));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const urlRef = useRef(url);
  urlRef.current = url;

  // Local edits (optimistic updates) also refresh the cached copy.
  const setData = useCallback((next: T | null | ((prev: T | null) => T | null)) => {
    setDataState((prev) => {
      const value = typeof next === "function" ? (next as (p: T | null) => T | null)(prev) : next;
      if (urlRef.current && value != null) remember(urlRef.current, value);
      return value;
    });
  }, []);

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
      remember(url, res.data);
      if (urlRef.current === url) setDataState(res.data);
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
    // A new URL/deps set is a new dataset: show its cached copy if we have
    // one (and refresh quietly), otherwise the loader.
    if (url && cache.has(url)) {
      setDataState(cache.get(url) as T);
      setLoading(false);
      loadedRef.current = true;
    } else {
      setDataState(null);
      loadedRef.current = false;
    }
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetch]);

  return { data, loading, refreshing, error, refetch, setData };
}

// Build a URL with an optional scope param plus extra query values.
export function withQuery(base: string, ...parts: (string | undefined | false)[]): string {
  const q = parts.filter(Boolean).join("&");
  return q ? `${base}${base.includes("?") ? "&" : "?"}${q}` : base;
}
