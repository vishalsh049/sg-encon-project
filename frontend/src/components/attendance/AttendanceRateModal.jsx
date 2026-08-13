import { X } from "lucide-react";

import { dateRangeLabel } from "../../lib/attendanceDateRange";

// Read-only breakdown (spec §14) built entirely from the already-fetched
// dashboard summary — no new fetch, no export (not required by the spec for
// this card), so it can never disagree with the StatCard that opened it.
export default function AttendanceRateModal({ open, onClose, summary, dateRange, circleLabel, cmpLabel }) {
  if (!open) return null;

  const present = summary?.present ?? 0;
  const absent = summary?.absent ?? 0;
  const leave = summary?.leave ?? 0;
  const marked = present + absent + leave;
  const rate = marked > 0 ? Math.round((present / marked) * 100) : null;

  const rows = [
    { label: "Present", value: present, tone: "text-emerald-600 dark:text-emerald-400" },
    { label: "Absent", value: absent, tone: "text-rose-600 dark:text-rose-400" },
    { label: "Leave", value: leave, tone: "text-amber-600 dark:text-amber-400" },
    { label: "Total Marked Days", value: marked, tone: "text-text-primary" },
  ];

  return (
    <div className="fixed inset-0 z-[9997] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Attendance Rate</h2>
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 rounded-2xl bg-surface-muted p-4 text-center">
          <p className="text-4xl font-bold text-text-primary">{rate === null ? "-" : `${rate}%`}</p>
          <p className="mt-1 text-xs text-text-muted">Present ÷ all marked days (Present + Absent + Leave)</p>
        </div>

        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between rounded-lg border border-border-color/60 px-3 py-2 text-sm">
              <span className="text-text-secondary">{row.label}</span>
              <span className={`font-semibold ${row.tone}`}>{row.value}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-1 border-t border-border-color/60 pt-3 text-xs text-text-muted">
          <p>Date Range: {dateRange ? dateRangeLabel(dateRange) : "-"}</p>
          <p>Circle: {circleLabel || "All Circles"}</p>
          <p>CMP: {cmpLabel || "All CMPs"}</p>
        </div>
      </div>
    </div>
  );
}
