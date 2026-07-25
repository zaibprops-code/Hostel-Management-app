import { ReactNode, ButtonHTMLAttributes, SelectHTMLAttributes, InputHTMLAttributes, useEffect, useState } from "react";
import clsx from "clsx";
import { IconSearch } from "./icons";

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={clsx("animate-spin", className ?? "h-5 w-5 text-brand-600")} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
    </svg>
  );
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <Spinner className="h-8 w-8 text-brand-600" />
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("card", className)}>{children}</div>;
}

// Compact, consistent page header. On phones the tab name already shows in the
// top app bar, so the title is hidden here (set `mobileTitle` for sub-pages like
// a resident's profile that need it). Subtitles are intentionally not rendered —
// tabs show their content, not descriptive filler.
export function PageHeader({ title, actions, mobileTitle }: { title: string; subtitle?: string; actions?: ReactNode; mobileTitle?: boolean }) {
  if (!actions && !mobileTitle) {
    // Nothing to show on mobile; only a desktop title.
    return <h1 className="hidden lg:block text-2xl font-bold text-slate-900 mb-6">{title}</h1>;
  }
  return (
    <div className="mb-4 lg:mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <h1 className={clsx("text-xl lg:text-2xl font-bold text-slate-900 truncate", !mobileTitle && "hidden lg:block")}>{title}</h1>
      {actions && <div className="flex flex-wrap items-center gap-2 [&>*]:shrink-0">{actions}</div>}
    </div>
  );
}

// A search control that starts as an icon and expands into a field when tapped —
// keeps tab headers clean instead of a permanent full-width search bar.
export function SearchButton({ value, onChange, placeholder = "Search…" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(!!value);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-label="Search" className="btn-secondary px-3">
        <IconSearch className="h-4 w-4" />
      </button>
    );
  }
  return (
    <div className="relative flex-1 min-w-[160px]">
      <IconSearch className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input autoFocus className="input pl-9 pr-9" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      <button type="button" onClick={() => { onChange(""); setOpen(false); }} aria-label="Close search" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-2xl leading-none px-1">&times;</button>
    </div>
  );
}

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
}
export function Button({ variant = "primary", loading, children, className, disabled, ...rest }: BtnProps) {
  const cls = { primary: "btn-primary", secondary: "btn-secondary", danger: "btn-danger", ghost: "btn-ghost" }[variant];
  return (
    <button className={clsx(cls, className)} disabled={disabled || loading} {...rest}>
      {loading && <Spinner className="h-4 w-4 text-current" />}
      {children}
    </button>
  );
}

export function Input({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="block">
      {label && <span className="label">{label}</span>}
      <input className={clsx("input", className)} {...rest} />
    </label>
  );
}

// ---- Numeric inputs --------------------------------------------------------
// These fix the "stuck 0" problem: the field can be emptied with backspace and
// shows nothing (not "0") when the value is zero. They report a real number.

const digitsOnly = (s: string) => s.replace(/[^\d]/g, "");
const withCommas = (n: number) => n.toLocaleString("en-PK");

type NumProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  label?: string;
  value: number;
  onChange: (n: number) => void;
};

// A plain whole-number input (counts, days, quantities).
export function NumberInput({ label, value, onChange, className, ...rest }: NumProps) {
  const [text, setText] = useState(value ? String(value) : "");
  useEffect(() => {
    const cur = text === "" ? 0 : Number(text);
    if (cur !== value) setText(value ? String(value) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <label className="block">
      {label && <span className="label">{label}</span>}
      <input
        inputMode="numeric"
        className={clsx("input", className)}
        value={text}
        onChange={(e) => { const d = digitsOnly(e.target.value); setText(d); onChange(d === "" ? 0 : Number(d)); }}
        {...rest}
      />
    </label>
  );
}

// A money input: currency prefix, thousands separators, clearable.
export function MoneyInput({ label, value, onChange, className, currency = "₨", ...rest }: NumProps & { currency?: string }) {
  const [text, setText] = useState(value ? withCommas(value) : "");
  useEffect(() => {
    const cur = digitsOnly(text) === "" ? 0 : Number(digitsOnly(text));
    if (cur !== value) setText(value ? withCommas(value) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <label className="block">
      {label && <span className="label">{label}</span>}
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">{currency}</span>
        <input
          inputMode="numeric"
          className={clsx("input pl-9", className)}
          value={text}
          onChange={(e) => { const d = digitsOnly(e.target.value); setText(d ? withCommas(Number(d)) : ""); onChange(d ? Number(d) : 0); }}
          {...rest}
        />
      </div>
    </label>
  );
}

export function Select({ label, children, className, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="block">
      {label && <span className="label">{label}</span>}
      <select className={clsx("input bg-white", className)} {...rest}>
        {children}
      </select>
    </label>
  );
}

export function Textarea({ label, className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className="block">
      {label && <span className="label">{label}</span>}
      <textarea className={clsx("input min-h-[80px]", className)} {...rest} />
    </label>
  );
}

const badgeColors: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-700",
  red: "bg-rose-100 text-rose-700",
  amber: "bg-amber-100 text-amber-700",
  blue: "bg-brand-100 text-brand-700",
  gray: "bg-slate-100 text-slate-600",
  purple: "bg-violet-100 text-violet-700",
};

export function Badge({ children, color = "gray" }: { children: ReactNode; color?: keyof typeof badgeColors }) {
  return <span className={clsx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", badgeColors[color])}>{children}</span>;
}

// Maps common status strings to badge colors.
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, keyof typeof badgeColors> = {
    ACTIVE: "green", PAID: "green", COMPLETED: "green", RESOLVED: "green", REFUNDED: "green", AVAILABLE: "green",
    PENDING: "amber", PARTIALLY_PAID: "amber", RESERVED: "amber", NOTICE_GIVEN: "amber", IN_PROGRESS: "amber", UNDER_REVIEW: "amber", WAITING: "amber", HELD: "blue", ASSIGNED: "blue",
    OVERDUE: "red", SUSPENDED: "red", BLACKLISTED: "red", URGENT: "red", VOIDED: "red", FORFEITED: "red", MAINTENANCE: "red", BLOCKED: "red",
    CHECKED_OUT: "gray", CLOSED: "gray", CANCELLED: "gray", OPEN: "blue", HIGH: "red", MEDIUM: "amber", LOW: "gray", OCCUPIED: "blue",
  };
  const label = status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return <Badge color={map[status] ?? "gray"}>{label}</Badge>;
}

export function EmptyState({ title, message, icon }: { title: string; message?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 text-slate-300">{icon}</div>
      <p className="font-semibold text-slate-700">{title}</p>
      {message && <p className="text-sm text-slate-400 mt-1 max-w-sm">{message}</p>}
    </div>
  );
}

// A dialog that behaves like a native app: a bottom sheet on phones (slides up,
// rounded top, swipe-handle) and a centered card on larger screens.
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-slate-900/50 backdrop-blur-sm lg:p-4"
      onClick={onClose}
    >
      <div
        className={clsx(
          "bg-white w-full flex flex-col max-h-[92vh] lg:max-h-[88vh]",
          "rounded-t-3xl lg:rounded-2xl lg:border lg:border-slate-200 lg:shadow-xl",
          "animate-[slideup_0.22s_ease-out] lg:animate-none",
          wide ? "lg:max-w-3xl" : "lg:max-w-lg"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Swipe handle (mobile) */}
        <div className="lg:hidden pt-2.5 pb-1 flex justify-center shrink-0"><span className="h-1.5 w-10 rounded-full bg-slate-300" /></div>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 lg:px-6 py-3 lg:py-4 shrink-0">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-3xl leading-none -mt-1 p-1">&times;</button>
        </div>
        <div className="px-5 sm:px-6 py-5 overflow-y-auto safe-bottom">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", danger, loading, onConfirm, onCancel }: { open: boolean; title: string; message: string; confirmLabel?: string; danger?: boolean; loading?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="text-sm text-slate-600">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant={danger ? "danger" : "primary"} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{children}</p>;
}
