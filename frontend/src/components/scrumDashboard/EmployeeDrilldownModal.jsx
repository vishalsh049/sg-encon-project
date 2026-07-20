import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Search,
  RefreshCw,
  Maximize2,
  Minimize2,
  Download,
  FileSpreadsheet,
  Printer,
  Copy,
  ChevronUp,
  ChevronDown,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";

import { authFetch, buildApiUrl } from "../../lib/api";
import { cmpGroups } from "../../lib/cmpGroups";
import { useScrumDashboardCircleContext } from "./scrumDashboardCircleContext";

// Employee-level drilldown behind every KPI card / summary-table row click on
// the Scrum Dashboard. Adapted from
// frontend/src/components/hrDashboard/DrilldownModal.jsx — same server-side
// search/sort/paginate/export UX, pointed at /api/scrum-dashboard/employees.

const PAGE_SIZE = 25;

const TABLE_COLUMNS = [
  { key: "resourceName", label: "Resource Name", sortKey: "resourceName" },
  { key: "sapId", label: "SAP ID", sortKey: "sapId" },
  { key: "circle", label: "Circle", sortKey: "circle" },
  { key: "cmp", label: "CMP", sortKey: "cmp" },
  { key: "jobRole", label: "Job Role", sortKey: "jobRole" },
  { key: "vendor", label: "Vendor", sortKey: "vendor" },
  { key: "mobile", label: "Mobile" },
  { key: "email", label: "Email" },
  { key: "status", label: "Status", sortKey: "status" },
  { key: "profileUploadDate", label: "Profile Upload Date", sortKey: "profileUploadDate", format: formatDate },
  { key: "level1Date", label: "Level 1 Date", sortKey: "level1Date", format: formatDate },
  { key: "level2Date", label: "Level 2 Date", sortKey: "level2Date", format: formatDate },
  { key: "sasDate", label: "SAS Date", sortKey: "sasDate", format: formatDate },
  { key: "cobDate", label: "COB Date", sortKey: "cobDate", format: formatDate },
];

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return String(value);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// scope = { title, metric, circle, cmp, vendor, jobRole, status, batchId }
export default function EmployeeDrilldownModal({ isOpen, scope, filterOptions, onClose }) {
  const { isAllCircleUser, userCircleLabel, allowedCircleLabels } = useScrumDashboardCircleContext();

  const [search, setSearch] = useState("");
  const [circle, setCircle] = useState("");
  const [cmp, setCmp] = useState("");
  const [vendor, setVendor] = useState("");
  const [jobRole, setJobRole] = useState("");
  // Distinct from `jobRole` (exact raw job_role, driven by the dropdown):
  // set when opened from a Job Role Summary row, which groups by a fuzzy
  // category bucket, not the exact job_role text — see buildDashboardWhere's
  // jobRoleCategory handling in backend/routes/scrumDashboard.js.
  const [jobRoleCategory, setJobRoleCategory] = useState("");
  const [status, setStatus] = useState("");
  const [sortBy, setSortBy] = useState("resourceName");
  const [sortOrder, setSortOrder] = useState("asc");
  const [page, setPage] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !scope) return;
    setSearch("");
    setCircle(scope.circle || (isAllCircleUser ? "" : userCircleLabel || ""));
    setCmp(scope.cmp || "");
    setVendor(scope.vendor || "");
    setJobRole(scope.jobRole || "");
    setJobRoleCategory(scope.jobRoleCategory || "");
    setStatus(scope.status || "");
    setSortBy("resourceName");
    setSortOrder("asc");
    setPage(1);
    setIsFullscreen(false);
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOpen,
    scope?.metric,
    scope?.circle,
    scope?.cmp,
    scope?.vendor,
    scope?.jobRole,
    scope?.jobRoleCategory,
    scope?.status,
    scope?.batchId,
  ]);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (scope?.metric) params.set("metric", scope.metric);
    if (scope?.batchId) params.set("batchId", scope.batchId);
    if (circle) params.set("circle", circle);
    if (cmp) params.set("cmp", cmp);
    if (vendor) params.set("vendor", vendor);
    if (jobRole) params.set("jobRole", jobRole);
    if (jobRoleCategory) params.set("jobRoleCategory", jobRoleCategory);
    if (status) params.set("status", status);
    if (search) params.set("search", search);
    params.set("sortBy", sortBy);
    params.set("sortOrder", sortOrder);
    return params;
  }, [scope, circle, cmp, vendor, jobRole, jobRoleCategory, status, search, sortBy, sortOrder]);

  const fetchData = useCallback(() => {
    if (!isOpen || !scope) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    const params = buildParams();
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));

    authFetch(buildApiUrl(`/api/scrum-dashboard/employees?${params.toString()}`), {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.message || "Failed to load employee details.");
        }
        setResult(payload);
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        console.log(error);
        toast.error(error.message || "Failed to load employee details.");
      })
      .finally(() => {
        if (abortRef.current === controller) setLoading(false);
      });
  }, [isOpen, scope, buildParams, page]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = window.setTimeout(fetchData, search ? 350 : 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, circle, cmp, vendor, jobRole, jobRoleCategory, status, sortBy, sortOrder, page, search, scope]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!isOpen || !scope) return null;

  const cmpOptions = cmpGroups
    .filter((group) => (circle ? group.title.toLowerCase().includes(circle.toLowerCase()) : true))
    .flatMap((group) => group.items);

  const toggleSort = (key) => {
    if (!key) return;
    if (sortBy === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const resetFilters = () => {
    setSearch("");
    setCircle(scope.circle || (isAllCircleUser ? "" : userCircleLabel || ""));
    setCmp(scope.cmp || "");
    setVendor(scope.vendor || "");
    setJobRole(scope.jobRole || "");
    setJobRoleCategory(scope.jobRoleCategory || "");
    setStatus(scope.status || "");
    setPage(1);
  };

  const handleCopyData = async () => {
    if (!result?.data?.length) {
      toast.error("No rows to copy.");
      return;
    }
    const header = TABLE_COLUMNS.map((c) => c.label).join("\t");
    const rows = result.data.map((row) =>
      TABLE_COLUMNS.map((c) => {
        const raw = row[c.key];
        return c.format ? c.format(raw) : raw ?? "";
      }).join("\t")
    );
    try {
      await navigator.clipboard.writeText([header, ...rows].join("\n"));
      toast.success("Copied to clipboard.");
    } catch (error) {
      console.log(error);
      toast.error("Copy failed. Please try again.");
    }
  };

  const buildPrintHtml = () => {
    const headerHtml = TABLE_COLUMNS.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("");
    const bodyHtml = (result?.data || [])
      .map((row) => {
        const cells = TABLE_COLUMNS.map((c) => {
          const raw = row[c.key];
          const text = c.format ? c.format(raw) : raw ?? "";
          return `<td>${escapeHtml(text)}</td>`;
        }).join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");

    return `<!DOCTYPE html>
<html>
<head>
<title>${escapeHtml(scope.title || "Employee Details")}</title>
<style>
  @page { size: A3 landscape; margin: 8mm; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; margin: 14px; }
  h1 { font-size: 15px; margin: 0 0 2px; color: #1e3a8a; }
  p.meta { font-size: 9px; color: #475569; margin: 0 0 8px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #cbd5e1; padding: 3px 5px; font-size: 8px; text-align: left; white-space: nowrap; }
  th { background: #1e3a8a; color: #ffffff; font-weight: 600; }
  tr:nth-child(even) td { background: #f1f5f9; }
</style>
</head>
<body>
<h1>${escapeHtml(scope.title || "Employee Details")}</h1>
<p class="meta">Circle: ${escapeHtml(circle || "All")} | CMP: ${escapeHtml(cmp || "All")} | Total: ${result?.pagination?.totalRecords ?? 0} &nbsp;|&nbsp; Generated: ${escapeHtml(new Date().toLocaleString())}</p>
<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>
</body>
</html>`;
  };

  const handlePrintOrPdf = () => {
    if (!result?.data?.length) {
      toast.error("No rows to print.");
      return;
    }
    const printWindow = window.open("", "_blank", "width=1280,height=800");
    if (!printWindow) {
      toast.error("Popup blocked. Please allow popups to print/export PDF.");
      return;
    }
    printWindow.document.write(buildPrintHtml());
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };

  const handleExportExcel = async () => {
    try {
      const params = buildParams();
      const response = await authFetch(
        buildApiUrl(`/api/scrum-dashboard/employees/export?${params.toString()}`)
      );
      const contentType = response.headers.get("content-type") || "";

      if (!response.ok || !contentType.includes("spreadsheetml")) {
        let message = "Export failed. Please try again.";
        try {
          if (contentType.includes("application/json")) {
            const body = await response.json();
            message = body?.message || message;
          }
        } catch {
          // keep generic message
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Scrum_Employees_${scope.title || "Export"}.xlsx`.replace(/\s+/g, "_");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Excel exported successfully.");
    } catch (error) {
      console.log(error);
      toast.error(error.message || "Export failed. Please try again.");
    }
  };

  const pagination = result?.pagination;

  const modal = (
    <div
      className={`fixed inset-0 z-[400] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm ${
        isFullscreen ? "p-0" : "p-2 md:p-4"
      }`}
    >
      <style>{`@keyframes scrumDrilldownIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }`}</style>

      <div
        className={`flex min-h-0 flex-col overflow-hidden border border-white/40 bg-white/95 shadow-[0_40px_120px_rgba(15,23,42,0.5)] backdrop-blur-2xl ${
          isFullscreen ? "h-full w-full rounded-none" : "h-[92vh] w-full max-w-6xl rounded-[18px]"
        }`}
        style={{ animation: "scrumDrilldownIn 0.2s ease" }}
      >
        <div className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 px-4 py-3 text-white">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-white/25 bg-white/15 backdrop-blur-xl">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[0.8rem] font-semibold uppercase tracking-[0.1em]">
                  {scope.title || "Employee Details"}
                </p>
                <p className="text-xs text-white/90">
                  Circle: {circle || "All"} &nbsp;|&nbsp; CMP: {cmp || "All"} &nbsp;|&nbsp; Total:{" "}
                  {pagination?.totalRecords ?? "—"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <button
                type="button"
                onClick={fetchData}
                disabled={loading}
                title="Refresh"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/20 px-3 py-1.5 backdrop-blur-sm transition hover:bg-white/30 disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreen((prev) => !prev)}
                title="Toggle fullscreen"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/20 px-3 py-1.5 backdrop-blur-sm transition hover:bg-white/30"
              >
                {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={onClose}
                title="Close (Esc)"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/20 px-3 py-1.5 backdrop-blur-sm transition hover:bg-white/35"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="border-b border-slate-200/80 bg-white/80 p-2 backdrop-blur-xl">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search name / SAP ID / mobile / email..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="h-8 w-full rounded-[10px] border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
              />
            </div>

            <select
              value={circle}
              onChange={(e) => {
                setCircle(e.target.value);
                setCmp("");
                setPage(1);
              }}
              disabled={!isAllCircleUser}
              className="h-8 w-full rounded-[10px] border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isAllCircleUser && <option value="">All Circles</option>}
              {allowedCircleLabels.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={cmp}
              onChange={(e) => {
                setCmp(e.target.value);
                setPage(1);
              }}
              className="h-8 w-full rounded-[10px] border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
            >
              <option value="">All CMPs</option>
              {cmpOptions.map((cmpName) => (
                <option key={cmpName} value={cmpName}>
                  {cmpName}
                </option>
              ))}
            </select>

            <select
              value={vendor}
              onChange={(e) => {
                setVendor(e.target.value);
                setPage(1);
              }}
              className="h-8 w-full rounded-[10px] border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
            >
              <option value="">All Vendors</option>
              {(filterOptions?.vendors || []).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>

            <select
              value={jobRole}
              onChange={(e) => {
                setJobRole(e.target.value);
                setPage(1);
              }}
              className="h-8 w-full rounded-[10px] border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
            >
              <option value="">All Job Roles</option>
              {(filterOptions?.jobRoles || []).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="h-8 w-full rounded-[10px] border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
            >
              <option value="">All Status</option>
              {(filterOptions?.statuses || []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={resetFilters}
              className="text-[11px] font-semibold text-indigo-600 transition hover:text-indigo-800"
            >
              Reset filters
            </button>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                Export Excel
              </button>
              <button
                type="button"
                onClick={handlePrintOrPdf}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <Printer className="h-3.5 w-3.5 text-red-500" />
                Print / PDF
              </button>
              <button
                type="button"
                onClick={handleCopyData}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <Copy className="h-3.5 w-3.5 text-slate-500" />
                Copy Data
              </button>
            </div>
          </div>
        </div>

        <div className="relative flex-1 overflow-auto custom-scrollbar" style={{ isolation: "isolate" }}>
          <table className="min-w-max w-full whitespace-nowrap border-collapse text-xs">
            <thead>
              <tr className="sticky top-0 z-[10] bg-slate-100 text-[11px] font-bold uppercase text-slate-600">
                {TABLE_COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    className={`border-b border-slate-300 px-3 py-2 text-left ${
                      column.sortKey ? "cursor-pointer select-none hover:bg-slate-200" : ""
                    }`}
                    onClick={column.sortKey ? () => toggleSort(column.sortKey) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {column.label}
                      {column.sortKey && sortBy === column.sortKey ? (
                        sortOrder === "asc" ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )
                      ) : null}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && !result ? (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} className="px-3 py-10 text-center text-slate-400">
                    Loading employee details...
                  </td>
                </tr>
              ) : !result?.data?.length ? (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} className="px-3 py-10 text-center text-slate-400">
                    No employees match the current filters.
                  </td>
                </tr>
              ) : (
                result.data.map((row, index) => (
                  <tr
                    key={`${row.sapId || "row"}-${index}`}
                    className={`transition hover:bg-blue-50 ${index % 2 === 0 ? "bg-white" : "bg-slate-50"}`}
                  >
                    {TABLE_COLUMNS.map((column) => {
                      const raw = row[column.key];
                      const value = column.format ? column.format(raw) : raw || "—";
                      return (
                        <td key={column.key} className="border-b border-slate-200 px-3 py-1.5 text-slate-700">
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
          <span>
            {pagination
              ? `Showing ${pagination.totalRecords === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1}–${Math.min(
                  pagination.page * pagination.pageSize,
                  pagination.totalRecords
                )} of ${pagination.totalRecords}`
              : "—"}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!pagination || pagination.page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Prev
            </button>
            <span>
              Page {pagination?.page || 1} of {pagination?.totalPages || 1}
            </span>
            <button
              type="button"
              disabled={!pagination || pagination.page >= pagination.totalPages}
              onClick={() => setPage((prev) => prev + 1)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
