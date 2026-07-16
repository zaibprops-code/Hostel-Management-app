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

// Resolve where the API lives. In local dev this stays "/api" (Vite proxies it).
// In production the frontend and backend are on different hosts, so we read the
// API location from build-time env vars:
//   VITE_API_URL  – full base, e.g. https://hostel-api.onrender.com/api
//   VITE_API_HOST – host only,  e.g. hostel-api.onrender.com  (→ https://…/api)
function resolveApiBase(): string {
  const url = import.meta.env.VITE_API_URL as string | undefined;
  const host = import.meta.env.VITE_API_HOST as string | undefined;
  if (url) return url.replace(/\/$/, "");
  if (host) return `https://${host.replace(/^https?:\/\//, "").replace(/\/$/, "")}/api`;
  return "/api";
}

export const API_BASE = resolveApiBase();

export const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
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
            .post(`${API_BASE}/auth/refresh`, { refreshToken: tokenStore.refresh })
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
