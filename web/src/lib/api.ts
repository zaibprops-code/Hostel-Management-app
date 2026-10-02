import axios from "axios";

const ACCESS_KEY = "hms_access";
const REFRESH_KEY = "hms_refresh";

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

const API_BASE_KEY = "hms_api_base";

// True when running inside the native (Capacitor) Android/iOS shell.
export function isNativeApp(): boolean {
  return !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
}

// Normalise anything the user types ("myapi.onrender.com", "https://x", ".../api")
// into a clean "https://host/api" base.
export function normalizeApiBase(input: string): string {
  let v = input.trim().replace(/\/+$/, "");
  if (!v) return v;
  if (!/^https?:\/\//i.test(v)) v = "https://" + v;
  if (!/\/api$/i.test(v)) v = v + "/api";
  return v;
}

// Resolve where the API lives, in priority order:
//   1. A server address the user saved in-app (mobile / self-hosted).
//   2. Build-time env vars VITE_API_URL / VITE_API_HOST (web deploys).
//   3. "/api" — same-origin, used by the local Vite dev proxy.
export function getApiBase(): string {
  const saved = localStorage.getItem(API_BASE_KEY);
  if (saved) return saved.replace(/\/$/, "");
  const url = import.meta.env.VITE_API_URL as string | undefined;
  const host = import.meta.env.VITE_API_HOST as string | undefined;
  if (url) return url.replace(/\/$/, "");
  if (host) return `https://${host.replace(/^https?:\/\//, "").replace(/\/$/, "")}/api`;
  return "/api";
}

// Build an absolute URL for a server asset (e.g. "/uploads/xyz.jpg"). Uploads
// are served from the API origin, one level above the "/api" base.
//
// Files in the private R2 bucket ("/files/r2/<key>") are served through an
// authenticated route, but <img>/fetch can't send an Authorization header — so
// the access token is passed as a `t` query param, which the route accepts.
export function assetUrl(pathOrUrl: string | null | undefined): string {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const origin = getApiBase().replace(/\/api$/, "");
  let url = `${origin}${pathOrUrl}`;
  if (pathOrUrl.startsWith("/files/r2/")) {
    const token = tokenStore.access;
    if (token) url += `${url.includes("?") ? "&" : "?"}t=${encodeURIComponent(token)}`;
  }
  return url;
}

export function setApiBase(input: string): void {
  localStorage.setItem(API_BASE_KEY, normalizeApiBase(input));
}

export function clearApiBase(): void {
  localStorage.removeItem(API_BASE_KEY);
}

// True for the phone app when it runs the copy of the screens bundled in the
// APK (served from https://localhost). The CI build instead opens the live
// site (see web/capacitor.config.ts), where the API is same-origin just like
// on the website, so there's no server address to set.
export function isBundledApp(): boolean {
  return isNativeApp() && window.location.hostname === "localhost";
}

// The bundled mobile app has no same-origin backend, so it needs an explicit address.
export function needsServerConfig(): boolean {
  return isBundledApp() && !localStorage.getItem(API_BASE_KEY);
}

export const api = axios.create();

let refreshing: Promise<string> | null = null;

// One shared token refresh at a time.
function refreshTokens(): Promise<string> {
  if (!refreshing) {
    refreshing = axios
      .post(`${getApiBase()}/auth/refresh`, { refreshToken: tokenStore.refresh })
      .then((r) => {
        tokenStore.set(r.data.accessToken, r.data.refreshToken);
        return r.data.accessToken as string;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

// When the access token expires (read from the token itself — only to time
// the refresh; the server still verifies it).
function tokenExpiresAt(token: string | null): number | null {
  if (!token) return null;
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const exp = JSON.parse(atob(part)).exp;
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

// Refresh shortly BEFORE the access token expires, so a save after a break
// doesn't first fail, then refresh, then retry (three trips instead of one).
export async function ensureFreshToken(): Promise<void> {
  const exp = tokenExpiresAt(tokenStore.access);
  if (exp && tokenStore.refresh && exp - Date.now() < 90_000) {
    try { await refreshTokens(); } catch { /* the 401 handler below takes over */ }
  }
}

api.interceptors.request.use(async (config) => {
  config.baseURL = getApiBase(); // resolved per-request so runtime changes apply
  if (!String(config.url ?? "").startsWith("/auth/")) await ensureFreshToken();
  const token = tokenStore.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Keep-warm while the app is open: a tiny ping every few minutes (and when you
// come back to the tab) keeps the server and its database connection awake
// and the login fresh, so the next save doesn't wait for a cold start.
let lastWarm = 0;
function warm() {
  if (document.visibilityState !== "visible" || !tokenStore.access) return;
  if (Date.now() - lastWarm < 30_000) return;
  lastWarm = Date.now();
  renewSoon();
  ensureFreshToken().finally(() => {
    fetch(`${getApiBase()}/health/warm`, { cache: "no-store" }).catch(() => {});
  });
}
// Renew the login quietly a few minutes before it expires, so no click ever
// waits for a token refresh.
function renewSoon() {
  const exp = tokenExpiresAt(tokenStore.access);
  if (exp && tokenStore.refresh && exp - Date.now() < 3 * 60_000) refreshTokens().catch(() => {});
}
export function startKeepAlive(): () => void {
  warm();
  renewSoon();
  const timer = window.setInterval(warm, 4 * 60_000);
  const renewTimer = window.setInterval(renewSoon, 45_000);
  document.addEventListener("visibilitychange", warm);
  window.addEventListener("focus", warm);
  window.addEventListener("online", warm);
  return () => {
    window.clearInterval(timer);
    window.clearInterval(renewTimer);
    document.removeEventListener("visibilitychange", warm);
    window.removeEventListener("focus", warm);
    window.removeEventListener("online", warm);
  };
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && tokenStore.refresh) {
      original._retry = true;
      try {
        const newToken = await refreshTokens();
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        tokenStore.clear();
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export function apiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; details?: unknown } | undefined;
    // When the server rejects a form, it returns per-field reasons under
    // `details` (e.g. { email: ["Please enter a valid email address"] }).
    // Surface those specific messages so the user knows exactly what to fix,
    // instead of a vague "Validation failed".
    const details = data?.details;
    if (details && typeof details === "object") {
      const messages = Object.values(details as Record<string, unknown>)
        .flatMap((v) => (Array.isArray(v) ? v : [v]))
        .filter((m): m is string => typeof m === "string" && m.length > 0);
      if (messages.length) return messages.join(" ");
    }
    return data?.error ?? err.message;
  }
  return "Something went wrong";
}
