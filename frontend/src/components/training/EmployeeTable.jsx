import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import StatusBadge from "./StatusBadge";
import EmployeeCard from "./EmployeeCard";

const COLUMNS = [
  { key: "full_name", label: "Candidate", sortable: true },
  { key: "mobile", label: "Mobile" },
  { key: "aadhaar_no", label: "Aadhaar" },
  { key: "training_batch", label: "Batch", sortable: true },
  { key: "circle", label: "Circle", sortable: true },
  { key: "created_at", label: "Registered", sortable: true },
  { key: "status", label: "Status", sortable: true },
];

function SkeletonRows({ rows = 6 }) {
  return Array.from({ length: rows }).map((_, index) => (
    <tr key={index} className="animate-pulse border-b border-slate-50">
      {COLUMNS.map((column) => (
        <td key={column.key} className="px-4 py-3.5">
          <div className="h-3.5 w-24 rounded bg-slate-100" />
        </td>
      ))}
    </tr>
  ));
}

function formatDate(value) {
  if (!value) return "—";
  return String(value).slice(0, 10);
}

/**
 * Responsive employee list: table on desktop, cards on mobile.
 * meta: { total, page, pageSize } from the API.
 */
export default function EmployeeTable({
  rows,
  meta,
  loading,
  sortBy,
  sortDir,
  onSortChange,
  onPageChange,
  actions,
}) {
  const navigate = useNavigate();

  const total = meta?.total || 0;
  const page = meta?.page || 1;
  const pageSize = meta?.pageSize || 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const openProfile = (row) => navigate(`/dashboard/training/employees/${row.id}`);

  const toggleSort = (column) => {
    if (!column.sortable) return;
    if (sortBy === column.key) {
      onSortChange(column.key, sortDir === "asc" ? "desc" : "asc");
    } else {
      onSortChange(column.key, "asc");
    }
  };

  return (
    <div className="overflow-hidden rounded-[20px] border border-slate-100 bg-white shadow-sm">
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-400">
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  onClick={() => toggleSort(column)}
                  className={`px-4 py-3 font-semibold ${
                    column.sortable ? "cursor-pointer select-none hover:text-slate-600" : ""
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    {column.label}
                    {column.sortable ? (
                      sortBy === column.key ? (
                        sortDir === "asc" ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )
                    ) : null}
                  </span>
                </th>
              ))}
              {actions ? <th className="px-4 py-3 text-right font-semibold">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows />
            ) : rows.length ? (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-slate-50 transition hover:bg-blue-50/40"
                  onClick={() => openProfile(row)}
                >
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-slate-800">{row.full_name}</p>
                    <p className="text-xs text-slate-400">
                      {row.employee_code || row.email || `#${row.id}`}
                    </p>
                  </td>
                  <td className="px-4 py-3.5 text-slate-600">{row.mobile || "—"}</td>
                  <td className="px-4 py-3.5 font-mono text-xs text-slate-600">
                    {row.aadhaar_no || "—"}
                  </td>
                  <td className="px-4 py-3.5 text-slate-600">{row.training_batch || "—"}</td>
                  <td className="px-4 py-3.5 text-slate-600">{row.circle || "—"}</td>
                  <td className="px-4 py-3.5 text-slate-600">{formatDate(row.created_at)}</td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={row.status} />
                  </td>
                  {actions ? (
                    <td
                      className="px-4 py-3.5 text-right"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {actions(row)}
                    </td>
                  ) : null}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={COLUMNS.length + (actions ? 1 : 0)}
                  className="px-4 py-14 text-center text-sm text-slate-400"
                >
                  No candidates found for the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 p-3 md:hidden">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          ))
        ) : rows.length ? (
          rows.map((row) => (
            <EmployeeCard
              key={row.id}
              employee={row}
              onClick={() => openProfile(row)}
              actions={actions}
            />
          ))
        ) : (
          <p className="py-10 text-center text-sm text-slate-400">
            No candidates found for the current filters.
          </p>
        )}
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
        <span>
          {total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}` : "0 records"}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 transition enabled:hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[70px] text-center text-xs font-medium">
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 transition enabled:hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
