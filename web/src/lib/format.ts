export function formatPKR(value: number | undefined | null): string {
  const n = Number(value ?? 0);
  return "₨ " + n.toLocaleString("en-PK", { maximumFractionDigits: 0 });
}

export function formatNumber(value: number | undefined | null): string {
  return Number(value ?? 0).toLocaleString("en-PK");
}

export function formatDate(value?: string | Date | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value?: string | Date | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function titleCase(value?: string | null): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
