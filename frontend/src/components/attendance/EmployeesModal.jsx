import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { saveAs } from "file-saver";
import toast from "react-hot-toast";
import { X, Search, Download, RefreshCw, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

import { buildApiUrl } from "../../lib/api";

const PAGE_SIZE = 25;

const COLUMNS = [
  { key: "hrmsId", label: "HRMS ID" },
  { key: "name", label: "Employee Name" },
  { key: "jobRole", label: "Job Role" },
  { key: "cmp", label: "CMP" },
  { key: "circle", label: "Circle" },
];

// Total Employees popup (spec §10): headcount from Physical master matching
// the current Circle/CMP/Job Role scope — not filtered by attendance status
// or date range, since it's a current-headcount snapshot, same as the card.
export default function EmployeesModal({ open, onClose, scope }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ sortBy: "name", sortDir: "asc" });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  const fetchParams = useCallback(() => ({
    page,
    pageSize: PAGE_SIZE,
    circle: scope.circle,
    cmp: scope.cmp,
    jobRole: scope.jobRole,
    search,
    sortBy: sort.sortBy,
    sortDir: sort.sortDir,
  }), [page, scope, search, sort]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(buildApiUrl("/api/attendance/employees"), { params: fetchParams() });
      setRows(res.data.employees || []);
      setTotal(res.data.pagination?.total || 0);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to load employees.");
    } finally {
      setLoading(false);
    }
  }, [fetchParams]);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSort({ sortBy: "name", sortDir: "asc" });
    setPage(1);
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = "auto"; };
  }, [open]);

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
      const res = await axios.get(buildApiUrl("/api/attendance/employees/export"), {
        params: exportParams,
        responseType: "blob",
      });
      saveAs(res.data, "attendance_employees.xlsx");
    } catch (err) {
      console.error(err);
      toast.error("Failed to export employees.");
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="fixed inset-0 z-[9997] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-color px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Total Employees</h2>
            <p className="text-xs text-text-muted">{total} employee{total === 1 ? "" : "s"} active in Physical master</p>
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
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-rose-600 dark:text-rose-400">{error}</td></tr>
              ) : loading ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-text-muted">Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-text-muted">No employees found for the selected filters.</td></tr>
              ) : (
                rows.map((emp) => (
                  <tr key={emp.id} className="border-t border-border-color/50">
                    <td className="px-4 py-3">{emp.employee_code}</td>
                    <td className="px-4 py-3">{emp.employee_name}</td>
                    <td className="px-4 py-3">{emp.job_role}</td>
                    <td className="px-4 py-3">{emp.cmp}</td>
                    <td className="px-4 py-3">{emp.circle}</td>
                    <td className="px-4 py-3">{emp.employment_status || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!error && total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-border-color/50 px-5 py-3 text-xs text-text-muted">
            <span>Page {page} of {totalPages} ({total} employees)</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-border-color px-2 py-1 disabled:opacity-40">Prev</button>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-border-color px-2 py-1 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
