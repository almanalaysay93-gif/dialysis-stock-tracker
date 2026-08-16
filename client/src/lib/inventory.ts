import type { StockTotal } from "./types";

export const CATEGORY_META: Record<string, { label: string; accent: string }> = {
  dialyzer: { label: "Dialyzer", accent: "oklch(0.42 0.09 200)" },
  bloodline: { label: "Bloodline", accent: "oklch(0.55 0.12 155)" },
  needles: { label: "Needles", accent: "oklch(0.6 0.09 240)" },
  saline: { label: "Saline", accent: "oklch(0.72 0.06 190)" },
  medications: { label: "Medications", accent: "oklch(0.5 0.15 320)" },
  disinfectants: { label: "Disinfectants", accent: "oklch(0.65 0.14 140)" },
  PPE: { label: "PPE", accent: "oklch(0.7 0.1 80)" },
  "PD supplies": { label: "PD Supplies", accent: "oklch(0.55 0.1 30)" },
};

export const REASON_META: Record<string, { label: string; color: string }> = {
  issued: { label: "Issued", color: "text-foreground" },
  adjusted: { label: "Adjusted", color: "text-warning" },
  "written off": { label: "Written off", color: "text-danger" },
  returned: { label: "Returned", color: "text-ok" },
};

export const SHIFT_LABEL: Record<string, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(ts: Date | string) {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function daysUntil(iso: string) {
  const now = new Date();
  const then = new Date(iso + "T00:00:00");
  return Math.ceil((then.getTime() - now.getTime()) / 86400000);
}

export function expiryStatus(iso: string): "expired" | "within30" | "within60" | "within90" | "ok" {
  const d = daysUntil(iso);
  if (d < 0) return "expired";
  if (d <= 30) return "within30";
  if (d <= 60) return "within60";
  if (d <= 90) return "within90";
  return "ok";
}

export function stockHealth(item: StockTotal) {
  if (item.isExpired || item.isCritical) return "danger";
  if (item.isLowStock) return "warning";
  return "ok";
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
