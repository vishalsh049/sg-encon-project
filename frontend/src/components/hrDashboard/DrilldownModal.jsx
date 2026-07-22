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
  FileDown,
  Copy,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";

import { authFetch, buildApiUrl } from "../../lib/api";
import { cmpGroups } from "../../lib/cmpGroups";
import { useHrDashboardCircleContext } from "./hrDashboardCircleContext";

const PAGE_SIZE = 25;

const SORT_COLUMNS = [
  { key: "employee_code", label: "Employee Code" },
  { key: "employee_name", label: "Employee Name" },
  { key: "cmp", label: "CMP / Cluster" },
  { key: "employment_status", label: "Employment Status" },
  { key: "joining_status", label: "Joining Status" },
  { key: "uploaded_at", label: "Uploaded At" },
];

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return String(value);
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const TABLE_COLUMNS = [
  { key: "employeeCode", label: "Employee Code" },
  { key: "employeeName", label: "Employee Name" },
  { key: "designation", label: "Designation" },
  { key: "circle", label: "Circle" },
  { key: "cmp", label: "CMP / Cluster" },
  { key: "department", label: "Department" },
  { key: "employmentStatus", label: "Employment Status" },
  { key: "joiningStatus", label: "Joining Status" },
  { key: "mobileNumber", label: "Mobile Number" },
  { key: "uploadedAt", label: "Uploaded At", format: formatDateTime },
  { key: "lastUpdatedAt", label: "Last Updated", format: formatDateTime },
];

// scope = { panel: "physical"|"scrum", roleKey, roleLabel, circle, cmp, clickedMetric: "designation"|"R"|"A"|"G" }
export default function DrilldownModal({ isOpen, scope, onClose }) {
  const { isAllCircleUser, userCircleLabel, allowedCircleLabels } = useHrDashboardCircleContext();

  const [search, setSearch] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [circle, setCircle] = useState("");
  const [cmp, setCmp] = useState("");
  const [employmentStatus, setEmploymentStatus] = useState("");
  const [joiningStatus, setJoiningStatus] = useState("");
  const [sortBy, setSortBy] = useState("employee_name");
  const [sortOrder, setSortOrder] = useState("asc");
  const [page, setPage] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const abortRef = useRef(null);

  // Re-seed local filters every time a *different* cell is drilled into.
  useEffect(() => {
    if (!isOpen || !scope) return;
    setSearch("");
    setEmployeeCode("");
    setCircle(scope.circle || (isAllCircleUser ? "" : userCircleLabel || ""));
    setCmp(scope.cmp || "");
    setEmploymentStatus("");
    setJoiningStatus("");
    setSortBy("employee_name");
    setSortOrder("asc");
    setPage(1);
    setIsFullscreen(false);
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, scope?.panel, scope?.roleKey, scope?.circle, scope?.cmp]);

  const fetchData = useCallback(() => {
    if (!isOpen || !scope) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    const params = new URLSearchParams();
    params.set("panel", scope.panel);
    params.set("roleKey", scope.roleKey);
    if (circle) params.set("circle", circle);
    if (cmp) params.set("cmp", cmp);
    if (search) params.set("search", search);
    if (employeeCode) params.set("employeeCode", employeeCode);
    if (employmentStatus) params.set("employmentStatus", employmentStatus);
    if (joiningStatus) params.set("joiningStatus", joiningStatus);
    params.set("sortBy", sortBy);
    params.set("sortOrder", sortOrder);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));

    authFetch(buildApiUrl(`/api/hr-dashboard/drilldown?${params.toString()}`), {
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
        if (abortRef.current === controller) {
          setLoading(false);
        }
      });
  }, [isOpen, scope, circle, cmp, search, employeeCode, employmentStatus, joiningStatus, sortBy, sortOrder, page]);

  // Debounce the two free-text filters so every keystroke doesn't fire a request.
  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = window.setTimeout(fetchData, search || employeeCode ? 350 : 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, circle, cmp, employmentStatus, joiningStatus, sortBy, sortOrder, page, search, employeeCode, scope?.panel, scope?.roleKey]);

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

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  if (!isOpen || !scope) return null;

  const cmpOptions = cmpGroups
    .filter((group) => (circle ? group.title.toLowerCase().includes(circle.toLowerCase()) : true))
    .flatMap((group) => group.items);

  const toggleSort = (key) => {
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
    setEmployeeCode("");
    setCircle(scope.circle || (isAllCircleUser ? "" : userCircleLabel || ""));
    setCmp(scope.cmp || "");
    setEmploymentStatus("");
    setJoiningStatus("");
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
<title>${escapeHtml(result?.header?.designation || "Employee Details")}</title>
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
<h1>${escapeHtml(result?.header?.designation || "Employee Details")} — ${escapeHtml(result?.header?.department || "")}</h1>
<p class="meta">Circle: ${escapeHtml(result?.header?.circle || "All")} | CMP: ${escapeHtml(result?.header?.cmp || "All")} | Required: ${result?.header?.required ?? 0} | Available: ${result?.header?.available ?? 0} | Gap: ${result?.header?.gap ?? 0} &nbsp;|&nbsp; Generated: ${escapeHtml(new Date().toLocaleString())}</p>
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
      const params = new URLSearchParams();
      params.set("panel", scope.panel);
      params.set("roleKey", scope.roleKey);
      if (circle) params.set("circle", circle);
      if (cmp) params.set("cmp", cmp);
      if (search) params.set("search", search);
      if (employeeCode) params.set("employeeCode", employeeCode);
      if (employmentStatus) params.set("employmentStatus", employmentStatus);
      if (joiningStatus) params.set("joiningStatus", joiningStatus);
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);
      params.set("export", "true");

      const response = await authFetch(
        buildApiUrl(`/api/hr-dashboard/drilldown/export?${params.toString()}`)
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
      link.download = `Employee_Drilldown_${scope.roleLabel || scope.roleKey}.xlsx`.replace(/\s+/g, "_");
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

  const header = result?.header;
  const summary = result?.summary;
  const pagination = result?.pagination;
  const showGapBanner = scope.clickedMetric === "G";

  const summaryCards = summary
    ? [
        { label: "Total Required", value: summary.totalRequired, tint: "text-text-primary" },
        { label: "Total Available", value: summary.totalAvailable, tint: "text-blue-700 dark:text-blue-400" },
        { label: "Total Gap", value: summary.totalGap, tint: summary.totalGap > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400" },
        { label: "Active Employees", value: summary.activeEmployees, tint: "text-emerald-700 dark:text-emerald-400" },
        { label: "Inactive Employees", value: summary.inactiveEmployees, tint: "text-text-muted" },
        { label: "Joined Employees", value: summary.joinedEmployees, tint: "text-violet-700 dark:text-violet-400" },
        { label: "Not Joined Employees", value: summary.notJoinedEmployees, tint: "text-amber-600 dark:text-amber-400" },
      ]
    : [];

  const modal = (
    <div
      className={`fixed inset-0 z-[400] flex items-center justify-center bg-overlay/60 backdrop-blur-sm ${
        isFullscreen ? "p-0" : "p-2 md:p-4"
      }`}
    >
      <style>{`@keyframes drilldownModalIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }`}</style>

      <div
        className={`flex min-h-0 flex-col overflow-hidden border border-white/40 bg-surface/95 shadow-[0_40px_120px_rgba(15,23,42,0.5)] backdrop-blur-2xl ${
          isFullscreen ? "h-full w-full rounded-none" : "h-[92vh] w-full max-w-6xl rounded-[18px]"
        }`}
        style={{ animation: "drilldownModalIn 0.2s ease" }}
      >
        <div className="bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 px-4 py-3 text-white">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-white/25 bg-surface/15 backdrop-blur-xl">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[0.8rem] font-semibold uppercase tracking-[0.1em]">
                  {header?.designation || scope.roleLabel}
                </p>
                <p className="text-xs text-white/90">
                  {header?.department || "—"} &nbsp;|&nbsp; Circle: {header?.circle || "All"} &nbsp;|&nbsp; CMP:{" "}
                  {header?.cmp || "All"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="rounded-lg border border-white/20 bg-surface/15 px-3 py-1.5">
                R {header?.required ?? "—"}
              </span>
              <span className="rounded-lg border border-white/20 bg-surface/15 px-3 py-1.5">
                A {header?.available ?? "—"}
              </span>
              <span className="rounded-lg border border-white/20 bg-surface/15 px-3 py-1.5">
                G {header?.gap ?? "—"}
              </span>
              <button
                type="button"
                onClick={fetchData}
                disabled={loading}
                title="Refresh"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-surface/20 px-3 py-1.5 backdrop-blur-sm transition hover:bg-surface/30 disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreen((prev) => !prev)}
                title="Toggle fullscreen"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-surface/20 px-3 py-1.5 backdrop-blur-sm transition hover:bg-surface/30"
              >
                {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={onClose}
                title="Close (Esc)"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-surface/20 px-3 py-1.5 backdrop-blur-sm transition hover:bg-surface/35"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {showGapBanner && (
          <div className="flex items-start gap-2 border-b border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Gap of {header?.gap ?? 0} is a staffing shortfall — there are no employee records for a vacant seat.
              The table below lists the currently <strong>Available</strong> employees for this designation.
            </span>
          </div>
        )}

        {summary && (
          <div className="grid grid-cols-2 gap-1.5 border-b border-border-color bg-surface-muted p-2 md:grid-cols-4 xl:grid-cols-7">
            {summaryCards.map((card) => (
              <div key={card.label} className="rounded-[10px] border border-border-color bg-surface px-2.5 py-1.5">
                <p className="truncate text-[0.6rem] font-semibold uppercase tracking-wide text-text-muted">
                  {card.label}
                </p>
                <p className={`text-sm font-bold ${card.tint}`}>{card.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="border-b border-border-color/80 bg-surface/80 p-2 backdrop-blur-xl">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Search Employee..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="h-8 w-full rounded-[10px] border border-border-color bg-surface pl-8 pr-3 text-xs text-text-secondary outline-none transition focus:border-indigo-300 focus:dark:border-indigo-500/30 focus:ring-4 focus:ring-indigo-50"
              />
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Search Employee Code..."
                value={employeeCode}
                onChange={(e) => {
                  setEmployeeCode(e.target.value);
                  setPage(1);
                }}
                className="h-8 w-full rounded-[10px] border border-border-color bg-surface pl-8 pr-3 text-xs text-text-secondary outline-none transition focus:border-indigo-300 focus:dark:border-indigo-500/30 focus:ring-4 focus:ring-indigo-50"
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
              className="h-8 w-full rounded-[10px] border border-border-color bg-surface px-2 text-xs text-text-secondary outline-none transition focus:border-indigo-300 focus:dark:border-indigo-500/30 focus:ring-4 focus:ring-indigo-50 disabled:cursor-not-allowed disabled:opacity-70"
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
              className="h-8 w-full rounded-[10px] border border-border-color bg-surface px-2 text-xs text-text-secondary outline-none transition focus:border-indigo-300 focus:dark:border-indigo-500/30 focus:ring-4 focus:ring-indigo-50"
            >
              <option value="">All CMPs</option>
              {cmpOptions.map((cmpName) => (
                <option key={cmpName} value={cmpName}>
                  {cmpName}
                </option>
              ))}
            </select>

            <select
              value={employmentStatus}
              onChange={(e) => {
                setEmploymentStatus(e.target.value);
                setPage(1);
              }}
              className="h-8 w-full rounded-[10px] border border-border-color bg-surface px-2 text-xs text-text-secondary outline-none transition focus:border-indigo-300 focus:dark:border-indigo-500/30 focus:ring-4 focus:ring-indigo-50"
            >
              <option value="">All Employment Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>

            <select
              value={joiningStatus}
              onChange={(e) => {
                setJoiningStatus(e.target.value);
                setPage(1);
              }}
              className="h-8 w-full rounded-[10px] border border-border-color bg-surface px-2 text-xs text-text-secondary outline-none transition focus:border-indigo-300 focus:dark:border-indigo-500/30 focus:ring-4 focus:ring-indigo-50"
            >
              <option value="">All Joining Status</option>
              <option value="Joined">Joined</option>
              <option value="Pending">Not Joined</option>
            </select>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={resetFilters}
              className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 transition hover:text-indigo-800 hover:dark:text-indigo-300"
            >
              Reset filters
            </button>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border-color bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-text-secondary transition hover:bg-surface-muted"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                Export Excel
              </button>
              <button
                type="button"
                onClick={handlePrintOrPdf}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border-color bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-text-secondary transition hover:bg-surface-muted"
              >
                <FileDown className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
                Export PDF
              </button>
              <button
                type="button"
                onClick={handlePrintOrPdf}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border-color bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-text-secondary transition hover:bg-surface-muted"
              >
                <Download className="h-3.5 w-3.5 text-text-muted" />
                Print
              </button>
              <button
                type="button"
                onClick={handleCopyData}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border-color bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-text-secondary transition hover:bg-surface-muted"
              >
                <Copy className="h-3.5 w-3.5 text-text-muted" />
                Copy Data
              </button>
            </div>
          </div>
        </div>

        <div className="relative flex-1 overflow-auto custom-scrollbar" style={{ isolation: "isolate" }}>
          <table className="min-w-max w-full whitespace-nowrap border-collapse text-xs">
            <thead>
              <tr className="sticky top-0 z-[10] bg-surface-muted text-[11px] font-bold uppercase text-text-secondary">
                {TABLE_COLUMNS.map((column) => {
                  const sortKey = SORT_COLUMNS.find((s) => s.key === column.key || s.label === column.label)?.key;
                  return (
                    <th
                      key={column.key}
                      className={`border-b border-border-strong px-3 py-2 text-left ${
                        sortKey ? "cursor-pointer select-none hover:bg-surface-muted" : ""
                      }`}
                      onClick={sortKey ? () => toggleSort(sortKey) : undefined}
                    >
                      <span className="inline-flex items-center gap-1">
                        {column.label}
                        {sortKey && sortBy === sortKey ? (
                          sortOrder === "asc" ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )
                        ) : null}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading && !result ? (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} className="px-3 py-10 text-center text-text-muted">
                    Loading employee details...
                  </td>
                </tr>
              ) : !result?.data?.length ? (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} className="px-3 py-10 text-center text-text-muted">
                    No employees match the current filters.
                  </td>
                </tr>
              ) : (
                result.data.map((row, index) => (
                  <tr
                    key={`${row.employeeCode || "row"}-${index}`}
                    className={`transition hover:bg-blue-50 hover:dark:bg-blue-500/10 ${index % 2 === 0 ? "bg-surface" : "bg-surface-muted"}`}
                  >
                    {TABLE_COLUMNS.map((column) => {
                      const raw = row[column.key];
                      const value = column.format ? column.format(raw) : raw || "—";
                      return (
                        <td key={column.key} className="border-b border-border-color px-3 py-1.5 text-text-secondary">
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

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-color bg-surface-muted px-4 py-2 text-xs text-text-secondary">
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
              className="rounded-lg border border-border-color bg-surface px-3 py-1 font-semibold text-text-secondary transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
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
              className="rounded-lg border border-border-color bg-surface px-3 py-1 font-semibold text-text-secondary transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
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
