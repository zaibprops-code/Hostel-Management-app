import { useCallback, useEffect, useRef, useState, ReactNode } from "react";
import { registerToast, ToastItem, ToastKind } from "../lib/toast";

// In-app toast notifications — a professional replacement for window.alert().
// Stacks in the top-right on desktop and across the top on phones, auto-dismiss,
// tap to dismiss, and announced to screen readers.

const STYLES: Record<ToastKind, { ring: string; icon: string; iconWrap: string }> = {
  success: { ring: "border-emerald-200", icon: "✓", iconWrap: "bg-emerald-100 text-emerald-700" },
  error: { ring: "border-rose-200", icon: "!", iconWrap: "bg-rose-100 text-rose-700" },
  info: { ring: "border-slate-200", icon: "i", iconWrap: "bg-brand-100 text-brand-700" },
};

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const remove = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  }, []);

  useEffect(() => {
    registerToast((kind, message) => {
      const id = ++counter;
      setItems((list) => [...list.slice(-3), { id, kind, message }]); // cap the stack
      const ms = kind === "error" ? 6500 : 4000; // errors linger a little longer
      timers.current.set(id, setTimeout(() => remove(id), ms));
    });
    const map = timers.current;
    return () => {
      registerToast(null);
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, [remove]);

  return (
    <>
      {children}
      <div
        className="fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-3 pt-3 safe-top pointer-events-none lg:items-end lg:right-0 lg:left-auto lg:max-w-sm lg:px-4"
        aria-live="polite"
        aria-atomic="false"
      >
        {items.map((t) => {
          const s = STYLES[t.kind];
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => remove(t.id)}
              role={t.kind === "error" ? "alert" : "status"}
              className={`pointer-events-auto w-full max-w-sm text-left flex items-start gap-3 rounded-xl border ${s.ring} bg-white px-4 py-3 shadow-lg shadow-slate-900/5 animate-[toastin_0.18s_ease-out]`}
            >
              <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold ${s.iconWrap}`}>{s.icon}</span>
              <span className="min-w-0 flex-1 text-sm font-medium text-slate-700 break-words">{t.message}</span>
              <span className="text-slate-300 hover:text-slate-500 text-lg leading-none -mt-0.5">&times;</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
