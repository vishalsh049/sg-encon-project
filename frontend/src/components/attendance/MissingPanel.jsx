import { useState } from "react";
import toast from "react-hot-toast";
import { Download, RefreshCw, X } from "lucide-react";

import PremiumDatePicker from "../PremiumDatePicker";
import { formatDisplayDate, todayStr } from "../../lib/attendanceFormat";

// Shown when the user clicks "Check Missing Attendance". A From/To range
// (not a single day) — an employee shows up if they're missing attendance on
// at least one day anywhere in that range (see the backend's
// fetchMissingAttendanceRows for the exact semantics).
export default function MissingPanel({
  dateFrom, dateTo, onDateFromChange, onDateToChange,
  missing, missingLoading, onClose, onExport, scope,
}) {
  const [exporting, setExporting] = useState(false);

  const scopeChips = [scope?.circle, scope?.cmp, scope?.jobRole].filter(Boolean);
  const rangeLabel = dateFrom === dateTo
    ? formatDisplayDate(dateFrom || todayStr())
    : `${formatDisplayDate(dateFrom || todayStr())} to ${formatDisplayDate(dateTo || todayStr())}`;

  const parseDate = (value) => (value ? new Date(`${value}T00:00:00`) : null);

  const handleExport = async () => {
    setExporting(true);
    try {
      await onExport();
    } catch (err) {
      console.error(err);
      toast.error("Failed to export missing attendance.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-amber-200/60 bg-amber-50/60 p-4 dark:border-amber-500/20 dark:bg-amber-500/5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            Missing attendance from
          </p>
          <div className="w-48">
            <PremiumDatePicker
              value={dateFrom}
              onChange={onDateFromChange}
              isDateDisabled={(d) => d > new Date() || (parseDate(dateTo) && d > parseDate(dateTo))}
            />
          </div>
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">to</p>
          <div className="w-48">
            <PremiumDatePicker
              value={dateTo}
              onChange={onDateToChange}
              isDateDisabled={(d) => d > new Date() || (parseDate(dateFrom) && d < parseDate(dateFrom))}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || missingLoading || !missing?.count}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-color bg-surface px-3 text-sm font-medium text-text-secondary transition hover:text-text-primary disabled:opacity-60"
          >
            {exporting ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
            Export Missing List
          </button>
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X size={16} />
          </button>
        </div>
      </div>

      {scopeChips.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] text-amber-700/80 dark:text-amber-400/80">
          <span>Scoped to:</span>
          {scopeChips.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-amber-300/60 bg-amber-100/60 px-2 py-0.5 dark:border-amber-500/30 dark:bg-amber-500/10"
            >
              {chip}
            </span>
          ))}
        </div>
      )}

      {missingLoading ? (
        <p className="text-sm text-text-muted">Loading...</p>
      ) : !missing ? (
        <p className="text-sm text-text-muted">Pick a date range to check.</p>
      ) : missing.count === 0 ? (
        <p className="text-sm text-text-muted">All employees have attendance recorded for {rangeLabel}.</p>
      ) : (
        <>
          <p className="mb-2 text-sm text-amber-700 dark:text-amber-400">
            {missing.count} employee(s) missing attendance for at least one day between {rangeLabel}.
          </p>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-border-color/60">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-muted text-text-muted">
                <tr>
                  <th className="px-3 py-2">HRMS ID</th>
                  <th className="px-3 py-2">Employee Name</th>
                  <th className="px-3 py-2">Job Role</th>
                  <th className="px-3 py-2">CMP</th>
                  <th className="px-3 py-2">Circle</th>
                </tr>
              </thead>
              <tbody>
                {missing.missing.map((row) => (
                  <tr key={row.employee_code} className="border-t border-border-color/50">
                    <td className="px-3 py-2">{row.employee_code}</td>
                    <td className="px-3 py-2">{row.employee_name}</td>
                    <td className="px-3 py-2">{row.job_role}</td>
                    <td className="px-3 py-2">{row.cmp}</td>
                    <td className="px-3 py-2">{row.circle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
