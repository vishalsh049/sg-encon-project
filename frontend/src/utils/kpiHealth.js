// Health classification thresholds shared across KPI cards and the summary row.
export function getHealthStatus(uptimeNumber) {
  const v = Number(uptimeNumber);
  if (!Number.isFinite(v)) return { level: "unknown", label: "No Data", emoji: "⚪", color: "text-slate-400", bg: "bg-slate-50", border: "border-slate-200" };
  if (v >= 99.5) return { level: "excellent", label: "Excellent", emoji: "🟢", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100" };
  if (v >= 98)   return { level: "warning",   label: "Warning",   emoji: "🟡", color: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-100" };
  return              { level: "critical",  label: "Critical",  emoji: "🔴", color: "text-rose-600",    bg: "bg-rose-50",    border: "border-rose-100" };
}
