import { ATTENDANCE_STATUS_META } from "../../lib/attendanceStatus";
import { formatDisplayDate } from "../../lib/attendanceFormat";

export function StatusBadge({ code }) {
  if (!code) return <span className="text-text-muted">-</span>;
  const meta = ATTENDANCE_STATUS_META[code];
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta?.badgeClass || "bg-surface-muted text-text-secondary"}`}>
      {meta?.label || code}
    </span>
  );
}

export default function RecordsTable({ records, recordsLoading, pagination, onPageChange }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border-color/70 bg-surface/70">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-muted text-xs uppercase text-text-muted">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">HRMS ID</th>
            <th className="px-4 py-3">Employee Name</th>
            <th className="px-4 py-3">Job Role</th>
            <th className="px-4 py-3">CMP</th>
            <th className="px-4 py-3">Circle</th>
            <th className="px-4 py-3">Attendance</th>
          </tr>
        </thead>
        <tbody>
          {recordsLoading ? (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-text-muted">Loading...</td>
            </tr>
          ) : records.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-text-muted">No attendance records found.</td>
            </tr>
          ) : (
            records.map((record) => (
              <tr key={record.id} className="border-t border-border-color/50">
                <td className="px-4 py-3">{formatDisplayDate(String(record.attendance_date).slice(0, 10))}</td>
                <td className="px-4 py-3">{record.employee_code}</td>
                <td className="px-4 py-3">{record.employee_name}</td>
                <td className="px-4 py-3">{record.job_role}</td>
                <td className="px-4 py-3">{record.cmp}</td>
                <td className="px-4 py-3">{record.circle}</td>
                <td className="px-4 py-3"><StatusBadge code={record.status} /></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {pagination.total > pagination.pageSize && (
        <div className="flex items-center justify-between border-t border-border-color/50 px-4 py-3 text-xs text-text-muted">
          <span>
            Page {pagination.page} of {Math.max(1, Math.ceil(pagination.total / pagination.pageSize))} ({pagination.total} records)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
              className="rounded-md border border-border-color px-2 py-1 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={pagination.page * pagination.pageSize >= pagination.total}
              onClick={() => onPageChange(pagination.page + 1)}
              className="rounded-md border border-border-color px-2 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
