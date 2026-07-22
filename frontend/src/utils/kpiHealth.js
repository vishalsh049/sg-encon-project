// Health classification thresholds shared across KPI cards and the summary row.
export function getHealthStatus(uptimeNumber) {
  const v = Number(uptimeNumber);
  if (!Number.isFinite(v)) return { level: "unknown", label: "No Data", emoji: "⚪", color: "text-text-muted", bg: "bg-surface-muted", border: "border-border-color" };
  if (v >= 99.5) return { level: "excellent", label: "Excellent", emoji: "🟢", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10", border: "border-emerald-100 dark:border-emerald-500/20" };
  if (v >= 98)   return { level: "warning",   label: "Warning",   emoji: "🟡", color: "text-amber-600 dark:text-amber-400",   bg: "bg-amber-50 dark:bg-amber-500/10",   border: "border-amber-100 dark:border-amber-500/20" };
  return              { level: "critical",  label: "Critical",  emoji: "🔴", color: "text-rose-600 dark:text-rose-400",    bg: "bg-rose-50 dark:bg-rose-500/10",    border: "border-rose-100 dark:border-rose-500/20" };
}
