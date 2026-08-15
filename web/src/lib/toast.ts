// A tiny bridge so any code — React component or plain module — can raise an
// in-app toast without prop-drilling. The ToastProvider registers the real
// handler on mount; until then (or in tests) calls fall back to the console.

export type ToastKind = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

type Pusher = (kind: ToastKind, message: string) => void;

let pusher: Pusher | null = null;

export function registerToast(fn: Pusher | null): void {
  pusher = fn;
}

function push(kind: ToastKind, message: string): void {
  if (!message) return;
  if (pusher) pusher(kind, message);
  // eslint-disable-next-line no-console
  else console.warn(`[toast:${kind}]`, message);
}

// Call these from anywhere: toast.success("Saved"), toast.error(apiError(e)), …
export const toast = {
  success: (message: string) => push("success", message),
  error: (message: string) => push("error", message),
  info: (message: string) => push("info", message),
};
