import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import toast from "react-hot-toast";
import {
  ChevronUp,
  ChevronDown,
  Search,
  RefreshCw,
  Maximize2,
  Minimize2,
  Download,
  FileSpreadsheet,
  FileText,
  FileDown,
  Copy,
  Columns3,
  Printer,
} from "lucide-react";

// Shared enterprise table shell: search, sort, sticky header, client
// pagination, column-visibility, Export Excel/CSV/PDF, Print, Copy, Refresh,
// Fullscreen — implemented once and reused by every Scrum Dashboard summary
// table so none of that toolbar logic is duplicated per table.
//
// Built for aggregate rows (one row per circle/CMP/vendor/job-role/status/
// upload) — never anywhere near 100k rows — so everything here is client
// side over the already-fetched `rows` prop. The one place that genuinely
// needs server-side paging (the employee-level drilldown) uses
// EmployeeDrilldownModal instead, not this component.

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function EnterpriseTable({
  title,
  subtitle,
  columns,
  rows,
  loading = false,
  emptyMessage = "No records found.",
  defaultSortKey,
  onRowClick,
  onRefresh,
  fileBase = "Export",
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState(defaultSortKey || columns[0]?.key);
  const [sortOrder, setSortOrder] = useState("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[1]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState(() => new Set());

  const visibleColumns = useMemo(
    () => columns.filter((column) => !hiddenColumns.has(column.key)),
    [columns, hiddenColumns]
  );

  const getCellRaw = (row, column) => row?.[column.key];
  const getCellText = (row, column) => {
    const raw = getCellRaw(row, column);
    if (column.format) return String(column.format(raw, row) ?? "");
    return raw === null || raw === undefined ? "" : String(raw);
  };

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const needle = search.trim().toLowerCase();
    return rows.filter((row) =>
      columns.some((column) => getCellText(row, column).toLowerCase().includes(needle))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, columns]);

  const sortedRows = useMemo(() => {
    if (!sortKey) return filteredRows;
    const column = columns.find((c) => c.key === sortKey);
    if (!column) return filteredRows;

    const copy = [...filteredRows];
    copy.sort((a, b) => {
      const aRaw = getCellRaw(a, column);
      const bRaw = getCellRaw(b, column);
      const aNum = Number(aRaw);
      const bNum = Number(bRaw);
      let cmp;
      if (Number.isFinite(aNum) && Number.isFinite(bNum) && aRaw !== "" && bRaw !== "") {
        cmp = aNum - bNum;
      } else {
        cmp = String(aRaw ?? "").localeCompare(String(bRaw ?? ""));
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filteredRows, sortKey, sortOrder, columns]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize, rows]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  const toggleColumn = (key) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleCopy = async () => {
    if (!sortedRows.length) {
      toast.error("No rows to copy.");
      return;
    }
    const header = visibleColumns.map((c) => c.label).join("\t");
    const body = sortedRows
      .map((row) => visibleColumns.map((c) => getCellText(row, c)).join("\t"))
      .join("\n");
    try {
      await navigator.clipboard.writeText([header, body].join("\n"));
      toast.success("Copied to clipboard.");
    } catch (error) {
      console.log(error);
      toast.error("Copy failed. Please try again.");
    }
  };

  const handleExportExcel = () => {
    if (!sortedRows.length) {
      toast.error("No rows to export.");
      return;
    }
    const data = sortedRows.map((row) => {
      const record = {};
      visibleColumns.forEach((c) => {
        record[c.label] = getCellText(row, c);
      });
      return record;
    });
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, title?.slice(0, 31) || "Data");
    XLSX.writeFile(workbook, `${fileBase}.xlsx`);
    toast.success("Excel exported successfully.");
    setShowExportMenu(false);
  };

  const csvCell = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const handleExportCsv = () => {
    if (!sortedRows.length) {
      toast.error("No rows to export.");
      return;
    }
    const header = visibleColumns.map((c) => c.label);
    const body = sortedRows.map((row) => visibleColumns.map((c) => getCellText(row, c)));
    const csv = [header, ...body].map((r) => r.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileBase}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    toast.success("CSV exported successfully.");
    setShowExportMenu(false);
  };

  const handlePrintOrPdf = () => {
    if (!sortedRows.length) {
      toast.error("No rows to print.");
      return;
    }
    const printWindow = window.open("", "_blank", "width=1280,height=800");
    if (!printWindow) {
      toast.error("Popup blocked. Please allow popups to print/export PDF.");
      return;
    }
    const headerHtml = visibleColumns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("");
    const bodyHtml = sortedRows
      .map(
        (row) =>
          `<tr>${visibleColumns
            .map((c) => `<td>${escapeHtml(getCellText(row, c))}</td>`)
            .join("")}</tr>`
      )
      .join("");

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
<title>${escapeHtml(title || "Export")}</title>
<style>
  @page { size: A3 landscape; margin: 8mm; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; margin: 14px; }
  h1 { font-size: 15px; margin: 0 0 2px; color: #1e3a8a; }
  p.meta { font-size: 9px; color: #475569; margin: 0 0 8px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #cbd5e1; padding: 3px 6px; font-size: 9px; text-align: left; white-space: nowrap; }
  th { background: #1e3a8a; color: #ffffff; font-weight: 600; }
  tr:nth-child(even) td { background: #f1f5f9; }
</style>
</head>
<body>
<h1>${escapeHtml(title || "Export")}</h1>
<p class="meta">${escapeHtml(subtitle || "")} &nbsp;|&nbsp; Generated: ${escapeHtml(new Date().toLocaleString())} &nbsp;|&nbsp; ${sortedRows.length} record(s)</p>
<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>
</body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 400);
    setShowExportMenu(false);
  };

  const content = (
    <div
      className={`relative overflow-hidden rounded-[12px] border border-border-color/70 bg-surface/92 ${
        isFullscreen ? "fixed inset-0 z-[350] flex flex-col rounded-none" : ""
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-color bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fbff_100%)] px-4 py-2.5">
        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-text-secondary">
            {title}
          </p>
          {subtitle ? <p className="text-xs text-text-muted">{subtitle}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-36 rounded-[10px] border border-border-color bg-surface pl-8 pr-2 text-xs text-text-secondary outline-none transition focus:border-indigo-300 focus:dark:border-indigo-500/30 focus:ring-4 focus:ring-indigo-50 sm:w-44"
            />
          </div>

          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              title="Refresh"
              className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-border-color bg-surface text-text-muted transition hover:bg-surface-muted"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          ) : null}

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowColumnMenu((prev) => !prev);
                setShowExportMenu(false);
              }}
              title="Column visibility"
              className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-border-color bg-surface text-text-muted transition hover:bg-surface-muted"
            >
              <Columns3 className="h-3.5 w-3.5" />
            </button>
            {showColumnMenu ? (
              <div className="absolute right-0 z-20 mt-1 w-52 rounded-[10px] border border-border-color bg-surface p-2 shadow-lg">
                {columns.map((column) => (
                  <label
                    key={column.key}
                    className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-surface-muted"
                  >
                    <input
                      type="checkbox"
                      checked={!hiddenColumns.has(column.key)}
                      onChange={() => toggleColumn(column.key)}
                    />
                    {column.label}
                  </label>
                ))}
              </div>
            ) : null}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowExportMenu((prev) => !prev);
                setShowColumnMenu(false);
              }}
              title="Export"
              className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-border-color bg-surface px-2.5 text-xs font-semibold text-text-secondary transition hover:bg-surface-muted"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
            {showExportMenu ? (
              <div className="absolute right-0 z-20 mt-1 w-44 rounded-[10px] border border-border-color bg-surface p-1 shadow-lg">
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-muted"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  Export Excel
                </button>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-muted"
                >
                  <FileText className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={handlePrintOrPdf}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-muted"
                >
                  <FileDown className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
                  Export PDF
                </button>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={handlePrintOrPdf}
            title="Print"
            className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-border-color bg-surface text-text-muted transition hover:bg-surface-muted"
          >
            <Printer className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={handleCopy}
            title="Copy data"
            className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-border-color bg-surface text-text-muted transition hover:bg-surface-muted"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setIsFullscreen((prev) => !prev)}
            title="Toggle fullscreen"
            className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-border-color bg-surface text-text-muted transition hover:bg-surface-muted"
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <div
        className={`relative overflow-auto custom-scrollbar ${isFullscreen ? "flex-1" : ""}`}
        style={isFullscreen ? { isolation: "isolate" } : { maxHeight: "360px", isolation: "isolate" }}
      >
        <table className="min-w-max w-full whitespace-nowrap border-collapse text-xs">
          <thead>
            <tr className="sticky top-0 z-[10] bg-surface-muted text-[11px] font-bold uppercase text-text-secondary">
              {visibleColumns.map((column) => (
                <th
                  key={column.key}
                  onClick={() => toggleSort(column.key)}
                  className="cursor-pointer select-none border-b border-border-strong px-3 py-2 text-left transition hover:bg-surface-muted"
                >
                  <span className="inline-flex items-center gap-1">
                    {column.label}
                    {sortKey === column.key ? (
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
            {loading ? (
              <tr>
                <td colSpan={visibleColumns.length} className="px-3 py-10 text-center text-text-muted">
                  Loading...
                </td>
              </tr>
            ) : !pageRows.length ? (
              <tr>
                <td colSpan={visibleColumns.length} className="px-3 py-10 text-center text-text-muted">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pageRows.map((row, index) => (
                <tr
                  key={row.__key ?? index}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`transition hover:bg-blue-50 hover:dark:bg-blue-500/10 ${index % 2 === 0 ? "bg-surface" : "bg-surface-muted"} ${
                    onRowClick ? "cursor-pointer" : ""
                  }`}
                >
                  {visibleColumns.map((column) => (
                    <td key={column.key} className="border-b border-border-color px-3 py-1.5 text-text-secondary">
                      {column.render ? column.render(row) : getCellText(row, column) || "—"}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-color bg-surface-muted px-4 py-2 text-[11px] text-text-secondary">
        <span>
          {sortedRows.length === 0
            ? "Showing 0 of 0"
            : `Showing ${(currentPage - 1) * pageSize + 1}–${Math.min(
                currentPage * pageSize,
                sortedRows.length
              )} of ${sortedRows.length}`}
        </span>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded-lg border border-border-color bg-surface px-2 py-1 text-[11px] font-semibold text-text-secondary"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            className="rounded-lg border border-border-color bg-surface px-3 py-1 font-semibold text-text-secondary transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            Prev
          </button>
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            className="rounded-lg border border-border-color bg-surface px-3 py-1 font-semibold text-text-secondary transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );

  if (isFullscreen) {
    return createPortal(
      <div className="fixed inset-0 z-[340] bg-overlay/60 backdrop-blur-sm">{content}</div>,
      document.body
    );
  }

  return content;
}
