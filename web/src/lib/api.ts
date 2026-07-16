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

export function setApiBase(input: string): void {
  localStorage.setItem(API_BASE_KEY, normalizeApiBase(input));
}

export function clearApiBase(): void {
  localStorage.removeItem(API_BASE_KEY);
}

// The mobile app has no same-origin backend, so it needs an explicit address.
export function needsServerConfig(): boolean {
  return isNativeApp() && !localStorage.getItem(API_BASE_KEY);
}

export const api = axios.create();

api.interceptors.request.use((config) => {
  config.baseURL = getApiBase(); // resolved per-request so runtime changes apply
  const token = tokenStore.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && tokenStore.refresh) {
      original._retry = true;
      try {
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
        const newToken = await refreshing;
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
    return err.response?.data?.error ?? err.message;
  }
  return "Something went wrong";
}
