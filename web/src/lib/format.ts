export function formatPKR(value: number | undefined | null): string {
  const n = Number(value ?? 0);
  return "₨ " + n.toLocaleString("en-PK", { maximumFractionDigits: 0 });
}

export function formatNumber(value: number | undefined | null): string {
  return Number(value ?? 0).toLocaleString("en-PK");
}

// Amount in words, Pakistani numbering (thousand / lakh / crore) — for receipts.
export function amountInWords(value: number | undefined | null): string {
  let num = Math.round(Number(value ?? 0));
  if (num <= 0) return "Zero Rupees Only";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const below1000 = (n: number): string => {
    let s = "";
    if (n >= 100) { s += ones[Math.floor(n / 100)] + " Hundred "; n %= 100; }
    if (n >= 20) { s += tens[Math.floor(n / 10)] + " "; n %= 10; }
    if (n > 0) s += ones[n] + " ";
    return s;
  };
  let words = "";
  const crore = Math.floor(num / 10000000); num %= 10000000;
  const lakh = Math.floor(num / 100000); num %= 100000;
  const thousand = Math.floor(num / 1000); num %= 1000;
  if (crore) words += below1000(crore) + "Crore ";
  if (lakh) words += below1000(lakh) + "Lakh ";
  if (thousand) words += below1000(thousand) + "Thousand ";
  if (num) words += below1000(num);
  return words.replace(/\s+/g, " ").trim() + " Rupees Only";
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
