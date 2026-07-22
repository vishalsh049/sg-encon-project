const STYLES = {
  // Employee statuses
  "pending": "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-200",
  "under review": "bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 ring-sky-200",
  "approved": "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-200",
  "rejected": "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 ring-rose-200",
  "converted": "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 ring-indigo-200",
  // Document verification statuses
  "verified": "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-200",
};

export default function StatusBadge({ status, className = "" }) {
  const key = String(status || "").trim().toLowerCase();
  const style = STYLES[key] || "bg-surface-muted text-text-secondary ring-border-strong";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${style} ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status || "Unknown"}
    </span>
  );
}
