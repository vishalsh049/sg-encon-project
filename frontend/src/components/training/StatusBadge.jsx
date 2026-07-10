const STYLES = {
  // Employee statuses
  "pending": "bg-amber-50 text-amber-700 ring-amber-200",
  "under review": "bg-sky-50 text-sky-700 ring-sky-200",
  "approved": "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "rejected": "bg-rose-50 text-rose-700 ring-rose-200",
  "converted": "bg-indigo-50 text-indigo-700 ring-indigo-200",
  // Document verification statuses
  "verified": "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

export default function StatusBadge({ status, className = "" }) {
  const key = String(status || "").trim().toLowerCase();
  const style = STYLES[key] || "bg-slate-100 text-slate-600 ring-slate-200";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${style} ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status || "Unknown"}
    </span>
  );
}
