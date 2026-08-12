import { X } from "lucide-react";

import PremiumDatePicker from "../PremiumDatePicker";
import { formatDisplayDate, todayStr } from "../../lib/attendanceFormat";

// Shown when the user clicks "Check Missing Attendance". Unlike the original
// version this isn't locked to today — the date picker lets an admin check
// (and then chase up) any past day, not just the current one.
export default function MissingPanel({ date, onDateChange, missing, missingLoading, onClose }) {
  return (
    <div className="rounded-2xl border border-amber-200/60 bg-amber-50/60 p-4 dark:border-amber-500/20 dark:bg-amber-500/5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            Missing attendance for
          </p>
          <div className="w-40">
            <PremiumDatePicker value={date} onChange={onDateChange} isDateDisabled={(d) => d > new Date()} />
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary">
          <X size={16} />
        </button>
      </div>

      {missingLoading ? (
        <p className="text-sm text-text-muted">Loading...</p>
      ) : !missing ? (
        <p className="text-sm text-text-muted">Pick a date to check.</p>
      ) : missing.count === 0 ? (
        <p className="text-sm text-text-muted">All employees have attendance recorded for {formatDisplayDate(date || todayStr())}.</p>
      ) : (
        <>
          <p className="mb-2 text-sm text-amber-700 dark:text-amber-400">
            {missing.count} employee(s) missing attendance for {formatDisplayDate(date || todayStr())}.
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
