import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { saveAs } from "file-saver";
import toast from "react-hot-toast";
import {
  X, Search, Download, RefreshCw, ArrowUp, ArrowDown, ArrowUpDown, Trash2, CheckSquare, Square,
} from "lucide-react";

import { buildApiUrl } from "../../lib/api";
import { formatDisplayDate } from "../../lib/attendanceFormat";
import { StatusBadge } from "./RecordsTable";
import DeleteConfirmModal from "./DeleteConfirmModal";

const PAGE_SIZE = 25;

const COLUMNS = [
  { key: "date", label: "Date" },
  { key: "hrmsId", label: "HRMS ID" },
  { key: "name", label: "Employee Name" },
  { key: "jobRole", label: "Job Role" },
  { key: "cmp", label: "CMP" },
  { key: "circle", label: "Circle" },
  { key: "status", label: "Attendance" },
];

function rangeParams(dateRange) {
  const params = { range: dateRange.range };
  if (dateRange.range === "custom") {
    params.from = dateRange.from;
    params.to = dateRange.to;
  }
  return params;
}

// Generic drill-down popup for the Present / Absent / Leave / Total Records
// cards. Always resolves its rows through GET /api/attendance/records and
// GET /api/attendance/records/export with the same params, so whatever this
// popup shows and exports is exactly what the underlying card counted.
export default function RecordsDrilldownModal({
  open,
  onClose,
  title,
  statusOverride,
  scope, // { dateRange, circle, cmp, jobRole }
  allowDelete,
  canDelete,
  deleteRecord,
  bulkDeleteRecords,
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ sortBy: "date", sortDir: "desc" });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchParams = useCallback(() => ({
    page,
    pageSize: PAGE_SIZE,
    circle: scope.circle,
    cmp: scope.cmp,
    jobRole: scope.jobRole,
    status: statusOverride || undefined,
    search,
    sortBy: sort.sortBy,
    sortDir: sort.sortDir,
    ...rangeParams(scope.dateRange),
  }), [page, scope, statusOverride, search, sort]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(buildApiUrl("/api/attendance/records"), { params: fetchParams() });
      setRows(res.data.records || []);
      setTotal(res.data.pagination?.total || 0);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to load records.");
    } finally {
      setLoading(false);
    }
  }, [fetchParams]);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSort({ sortBy: "date", sortDir: "desc" });
    setPage(1);
    setSelectedIds([]);
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = "auto"; };
  }, [open, statusOverride]);

  useEffect(() => {
    if (open) fetchRows();
  }, [open, fetchRows]);

  if (!open) return null;

  const handleSort = (key) => {
    setPage(1);
    setSort((s) => (s.sortBy === key ? { sortBy: key, sortDir: s.sortDir === "asc" ? "desc" : "asc" } : { sortBy: key, sortDir: "asc" }));
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { page: _p, pageSize: _ps, ...exportParams } = fetchParams();
      const res = await axios.get(buildApiUrl("/api/attendance/records/export"), {
        params: exportParams,
        responseType: "blob",
      });
      saveAs(res.data, `${(title || "attendance_records").replace(/\s+/g, "_").toLowerCase()}.xlsx`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to export records.");
    } finally {
      setExporting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === rows.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(rows.map((r) => r.id));
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
      await fetchRows();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to delete record(s).");
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="fixed inset-0 z-[9997] flex items-center justify-center bg-black/40 p-4">
        <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-border-color px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
              <p className="text-xs text-text-muted">{total} record{total === 1 ? "" : "s"} match the current filters</p>
            </div>
            <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary">
              <X size={18} />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-b border-border-color/60 px-5 py-3">
            <div className="relative w-64">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setPage(1); setSearch(e.target.value); }}
                placeholder="Search name or HRMS ID"
                className="h-9 w-full rounded-lg border border-border-color bg-surface pl-8 pr-3 text-sm text-text-primary"
              />
            </div>

            {allowDelete && canDelete && selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => setDeleteTarget({ type: "bulk", count: selectedIds.length })}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 text-sm font-medium text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-400"
              >
                <Trash2 size={14} />
                Delete Selected ({selectedIds.length})
              </button>
            )}

            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg border border-border-color bg-surface px-3 text-sm font-medium text-text-secondary transition hover:text-text-primary disabled:opacity-60"
            >
              {exporting ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
              Export Excel
            </button>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface-muted text-xs uppercase text-text-muted">
                <tr>
                  {allowDelete && canDelete && (
                    <th className="px-4 py-3">
                      <button type="button" onClick={toggleSelectAll} className="text-text-muted hover:text-text-primary">
                        {rows.length > 0 && selectedIds.length === rows.length ? <CheckSquare size={15} /> : <Square size={15} />}
                      </button>
                    </th>
                  )}
                  {COLUMNS.map((col) => (
                    <th key={col.key} className="px-4 py-3">
                      <button type="button" onClick={() => handleSort(col.key)} className="inline-flex items-center gap-1 transition hover:text-text-primary">
                        {col.label}
                        {sort.sortBy === col.key
                          ? (sort.sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
                          : <ArrowUpDown size={12} className="text-text-muted/60" />}
                      </button>
                    </th>
                  ))}
                  {allowDelete && canDelete && <th className="px-4 py-3">Action</th>}
                </tr>
              </thead>
              <tbody>
                {error ? (
                  <tr><td colSpan={9} className="px-4 py-6 text-center text-rose-600 dark:text-rose-400">{error}</td></tr>
                ) : loading ? (
                  <tr><td colSpan={9} className="px-4 py-6 text-center text-text-muted">Loading...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-6 text-center text-text-muted">No attendance records found for the selected filters.</td></tr>
                ) : (
                  rows.map((record) => (
                    <tr key={record.id} className="border-t border-border-color/50">
                      {allowDelete && canDelete && (
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
                      {allowDelete && canDelete && (
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
          </div>

          {!error && total > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-border-color/50 px-5 py-3 text-xs text-text-muted">
              <span>Page {page} of {totalPages} ({total} records)</span>
              <div className="flex gap-2">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-border-color px-2 py-1 disabled:opacity-40">Prev</button>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-border-color px-2 py-1 disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>
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
