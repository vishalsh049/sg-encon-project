import { useState } from "react";
import toast from "react-hot-toast";
import { ArrowDown, ArrowUp, ArrowUpDown, RefreshCw, Trash2, CheckSquare, Square } from "lucide-react";

import { ATTENDANCE_STATUS_META } from "../../lib/attendanceStatus";
import { formatDisplayDate } from "../../lib/attendanceFormat";
import DeleteConfirmModal from "./DeleteConfirmModal";

export function StatusBadge({ code }) {
  if (!code) return <span className="text-text-muted">-</span>;
  const meta = ATTENDANCE_STATUS_META[code];
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta?.badgeClass || "bg-surface-muted text-text-secondary"}`}>
      {meta?.label || code}
    </span>
  );
}

const COLUMNS = [
  { key: "date", label: "Date", sortable: true },
  { key: "hrmsId", label: "HRMS ID", sortable: false },
  { key: "name", label: "Employee Name", sortable: true },
  { key: "jobRole", label: "Job Role", sortable: false },
  { key: "cmp", label: "CMP", sortable: true },
  { key: "circle", label: "Circle", sortable: true },
  { key: "status", label: "Attendance", sortable: true },
];

// Skeleton rows shown while the first page of records is loading, instead
// of a blank/plain-text row — same column count as the real table so layout
// doesn't shift once data arrives.
function SkeletonRows({ columnCount, rowCount = 8 }) {
  return Array.from({ length: rowCount }).map((_, rowIndex) => (
    <tr key={`skeleton-${rowIndex}`} className="border-t border-border-color/50">
      {Array.from({ length: columnCount }).map((__, colIndex) => (
        <td key={colIndex} className="px-4 py-3">
          <div className="h-3.5 w-full max-w-[7rem] animate-pulse rounded bg-surface-muted" />
        </td>
      ))}
    </tr>
  ));
}

function SortIcon({ active, dir }) {
  if (!active) return <ArrowUpDown size={12} className="text-text-muted/60" />;
  return dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
}

export default function RecordsTable({
  records, recordsLoading, recordsError, onRetry, pagination, onPageChange, sort, onSortChange,
  canDelete, deleteRecord, bulkDeleteRecords,
}) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const toggleSelectAll = () => {
    if (selectedIds.length === records.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(records.map((r) => r.id));
    }
  };

  const toggleSelectRow = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const runDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === "single") {
        await deleteRecord(deleteTarget.id);
        toast.success("Attendance record deleted.");
      } else {
        const res = await bulkDeleteRecords(selectedIds);
        toast.success(res?.message || "Selected records deleted.");
      }
      setSelectedIds([]);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to delete record(s).");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {canDelete && selectedIds.length > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-2.5 text-sm dark:border-rose-500/30 dark:bg-rose-500/10">
          <span className="text-rose-700 dark:text-rose-400">{selectedIds.length} record(s) selected</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSelectedIds([])} className="text-xs font-medium text-text-muted hover:text-text-primary">
              Clear selection
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget({ type: "bulk", count: selectedIds.length })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/40 dark:bg-transparent dark:text-rose-400"
            >
              <Trash2 size={13} />
              Delete Selected
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border-color/70 bg-surface/70">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-muted text-xs uppercase text-text-muted">
            <tr>
              {canDelete && (
                <th className="px-4 py-3">
                  <button type="button" onClick={toggleSelectAll} className="text-text-muted hover:text-text-primary">
                    {records.length > 0 && selectedIds.length === records.length ? <CheckSquare size={15} /> : <Square size={15} />}
                  </button>
                </th>
              )}
              {COLUMNS.map((col) => (
                <th key={col.key} className="px-4 py-3">
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => onSortChange(col.key)}
                      className="inline-flex items-center gap-1 transition hover:text-text-primary"
                    >
                      {col.label}
                      <SortIcon active={sort?.sortBy === col.key} dir={sort?.sortDir} />
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
              {canDelete && <th className="px-4 py-3">Action</th>}
            </tr>
          </thead>
          <tbody>
            {recordsError ? (
              <tr>
                <td colSpan={COLUMNS.length + 2} className="px-4 py-6 text-center">
                  <p className="mb-2 text-sm text-rose-600 dark:text-rose-400">{recordsError}</p>
                  <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border-color px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:text-text-primary"
                  >
                    <RefreshCw size={12} />
                    Retry
                  </button>
                </td>
              </tr>
            ) : recordsLoading ? (
              <SkeletonRows columnCount={COLUMNS.length + (canDelete ? 2 : 0)} />
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 2} className="px-4 py-6 text-center text-text-muted">
                  No attendance records found for the selected filters.
                </td>
              </tr>
            ) : (
              records.map((record) => (
                <tr key={record.id} className="border-t border-border-color/50">
                  {canDelete && (
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => toggleSelectRow(record.id)} className="text-text-muted hover:text-text-primary">
                        {selectedIds.includes(record.id) ? <CheckSquare size={15} /> : <Square size={15} />}
                      </button>
                    </td>
                  )}
                  <td className="px-4 py-3">{formatDisplayDate(String(record.attendance_date).slice(0, 10))}</td>
                  <td className="px-4 py-3">{record.employee_code}</td>
                  <td className="px-4 py-3">{record.employee_name}</td>
                  <td className="px-4 py-3">{record.job_role}</td>
                  <td className="px-4 py-3">{record.cmp}</td>
                  <td className="px-4 py-3">{record.circle}</td>
                  <td className="px-4 py-3"><StatusBadge code={record.status} /></td>
                  {canDelete && (
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ type: "single", id: record.id, label: record.employee_name })}
                        className="text-text-muted transition hover:text-rose-600 dark:hover:text-rose-400"
                        title="Delete this record"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
        {!recordsError && pagination.total > pagination.pageSize && (
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

      <DeleteConfirmModal
        target={deleteTarget}
        deleting={deleting}
        onConfirm={runDelete}
        onClose={() => !deleting && setDeleteTarget(null)}
      />
    </>
  );
}
