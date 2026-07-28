import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileSpreadsheet,
  Info,
  Layers,
  Search,
  X,
} from "lucide-react";

/**
 * Renders the structured validation payload returned by /api/reports/upload.
 *
 * The upload API sends a `message` (human summary) plus, when it can, an
 * `errors` array of { row, column, value, expected, reason, fix } and the
 * context the problem was found in (file, sheet, detected headers). This
 * dialog shows all of it: what failed, exactly where, and what to change.
 *
 * It degrades gracefully — with no `errors` array it shows just the message,
 * so a plain 500 still renders sensibly.
 */

const ROWS_PER_PAGE = 12;

const ERROR_TYPE_LABELS = {
  "row-validation": "Data validation failed",
  template: "Wrong template",
  "empty-sheet": "No data found",
  "no-sheets": "No worksheets",
  "unreadable-file": "File could not be opened",
  "file-name": "File name not accepted",
  "unsupported-site-type": "Unsupported Site Type",
};

const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

// Byte-order mark, so Excel opens the CSV as UTF-8 rather than mangling
// non-ASCII circle and file names.
const BOM = String.fromCharCode(0xfeff);

// Mounted only while there is a payload, so search text and page number reset
// naturally with the component instead of via a synchronising effect.
function ReportUploadErrorDialog({ onClose, payload }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [copiedRow, setCopiedRow] = useState(null);

  const {
    message = "",
    errors = [],
    errorType = "",
    siteType = "",
    fileName = "",
    sheetName = "",
    detectedHeaders = [],
    expectedHeaders = [],
    totalRows = null,
    invalidRows = null,
    totalErrors = null,
    truncated = false,
  } = payload || {};

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return errors;
    return errors.filter((item) =>
      [item.row, item.column, item.value, item.expected, item.reason]
        .filter((value) => value !== null && value !== undefined)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [errors, searchTerm]);

  // One card per distinct reason, so 400 rows failing the same way read as one
  // fix rather than 400 separate problems.
  const grouped = useMemo(() => {
    const groups = new Map();
    errors.forEach((item) => {
      const key = `${item.column}::${item.reason}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          column: item.column,
          reason: item.reason,
          expected: item.expected,
          fix: item.fix,
          rows: [],
          values: new Set(),
        });
      }
      const group = groups.get(key);
      if (item.row) group.rows.push(item.row);
      if (item.value && item.value !== "(blank)") group.values.add(item.value);
    });
    return [...groups.values()].sort((a, b) => b.rows.length - a.rows.length);
  }, [errors]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );

  const affectedRowCount =
    invalidRows ?? new Set(errors.map((item) => item.row).filter(Boolean)).size;

  const copyRow = (row) => {
    navigator.clipboard?.writeText(String(row)).then(
      () => {
        setCopiedRow(row);
        setTimeout(() => setCopiedRow(null), 1400);
      },
      () => {}
    );
  };

  const downloadErrorReport = () => {
    const headers = [
      "File",
      "Sheet",
      "Excel Row",
      "Column",
      "Value Found",
      "Expected Value",
      "Reason",
      "How to Fix",
    ];
    const body = errors.map((item) => [
      fileName,
      sheetName,
      item.row ?? "-",
      item.column,
      item.value,
      item.expected,
      item.reason,
      item.fix,
    ]);
    const csv = [headers, ...body]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");

    // U+FEFF byte-order mark, so Excel opens the CSV as UTF-8 rather than
    // mangling non-ASCII circle and file names.
    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(fileName || "upload").replace(/\.[^.]+$/, "")}_errors.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  if (!payload) return null;

  const statTile = (label, value, tone) => (
    <div className={`rounded-2xl border px-4 py-3 ${tone}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-75">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-error-title"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-overlay/50 backdrop-blur-sm"
      />

      <div className="animate-modal-enter relative z-10 flex max-h-[92vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-[22px] border border-border-color/80 bg-surface shadow-[0_30px_90px_rgba(15,23,42,0.22)]">

        {/* Header */}
        <div className="flex flex-shrink-0 items-start gap-4 border-b border-border-color/70 px-5 py-4">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
            <AlertTriangle size={20} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="upload-error-title"
                className="text-lg font-semibold tracking-[-0.02em] text-text-primary"
              >
                Upload stopped — nothing was saved
              </h2>
              {errorType ? (
                <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-red-700 dark:bg-red-500/10 dark:text-red-400">
                  {ERROR_TYPE_LABELS[errorType] || errorType}
                </span>
              ) : null}
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
              {fileName ? (
                <span className="inline-flex items-center gap-1.5">
                  <FileSpreadsheet size={13} />
                  <span className="max-w-[280px] truncate font-medium text-text-secondary">
                    {fileName}
                  </span>
                </span>
              ) : null}
              {sheetName ? (
                <span className="inline-flex items-center gap-1.5">
                  <Layers size={13} />
                  Sheet: <span className="font-medium text-text-secondary">{sheetName}</span>
                </span>
              ) : null}
              {siteType ? (
                <span className="inline-flex items-center gap-1.5">
                  Site Type:{" "}
                  <span className="font-medium text-text-secondary">{siteType}</span>
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            {errors.length ? (
              <button
                type="button"
                onClick={downloadErrorReport}
                className="hidden h-9 items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 sm:inline-flex"
              >
                <Download size={15} />
                Error report (CSV)
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border-color bg-surface text-text-secondary transition hover:bg-surface-muted"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">

          {/* Summary tiles — only when we have counts worth showing */}
          {errors.length ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {statTile(
                "Rows in file",
                totalRows ?? "—",
                "border-border-color bg-surface-muted text-text-primary"
              )}
              {statTile(
                "Rows with problems",
                affectedRowCount || "—",
                "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
              )}
              {statTile(
                "Distinct problems",
                grouped.length,
                "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400"
              )}
              {statTile(
                "Rows saved",
                0,
                "border-border-color bg-surface-muted text-text-primary"
              )}
            </div>
          ) : null}

          {/* The server's own explanation, always shown verbatim */}
          {message ? (
            <div className="whitespace-pre-line rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
              {message}
            </div>
          ) : null}

          {/* Column mismatch context */}
          {detectedHeaders.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-border-color bg-surface-muted px-4 py-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                  Columns found in your file
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {detectedHeaders.map((header) => (
                    <span
                      key={header}
                      className="rounded-lg bg-surface px-2 py-0.5 font-mono text-[11px] text-text-secondary ring-1 ring-border-color"
                    >
                      {header}
                    </span>
                  ))}
                </div>
              </div>

              {expectedHeaders.length ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
                    Columns the {siteType || "report"} template expects
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {expectedHeaders.map((header) => (
                      <span
                        key={header}
                        className="rounded-lg bg-surface px-2 py-0.5 font-mono text-[11px] text-emerald-700 ring-1 ring-emerald-200 dark:text-emerald-400 dark:ring-emerald-500/20"
                      >
                        {header}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Grouped problems */}
          {grouped.length ? (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                What needs fixing
              </h3>
              {grouped.map((group) => (
                <div
                  key={group.key}
                  className="rounded-2xl border border-border-color bg-surface px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-surface-muted px-2 py-0.5 font-mono text-[11px] font-semibold text-text-primary">
                      {group.column}
                    </span>
                    <span className="text-sm font-medium text-text-primary">
                      {group.reason}
                    </span>
                    <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-bold text-red-700 dark:bg-red-500/10 dark:text-red-400">
                      {group.rows.length} row{group.rows.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <dl className="mt-2.5 grid gap-3 text-xs sm:grid-cols-3">
                    <div>
                      <dt className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                        Values found
                      </dt>
                      <dd className="flex flex-wrap gap-1">
                        {group.values.size === 0 ? (
                          <span className="italic text-text-muted">(blank)</span>
                        ) : (
                          <>
                            {[...group.values].slice(0, 5).map((value) => (
                              <span
                                key={value}
                                className="rounded bg-red-50 px-1.5 py-0.5 font-mono text-red-700 dark:bg-red-500/10 dark:text-red-400"
                              >
                                {value}
                              </span>
                            ))}
                            {group.values.size > 5 ? (
                              <span className="text-text-muted">
                                +{group.values.size - 5} more
                              </span>
                            ) : null}
                          </>
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                        Expected
                      </dt>
                      <dd className="font-medium text-emerald-700 dark:text-emerald-400">
                        {group.expected}
                      </dd>
                    </div>

                    <div>
                      <dt className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                        Excel rows
                      </dt>
                      <dd className="font-mono text-text-secondary">
                        {group.rows.slice(0, 12).join(", ")}
                        {group.rows.length > 12
                          ? ` +${group.rows.length - 12} more`
                          : ""}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          ) : null}

          {/* Row-by-row table */}
          {errors.length ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                  Every problem row
                </h3>
                <div className="ml-auto flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-border-color bg-surface px-3 sm:max-w-[300px] sm:flex-none">
                  <Search size={14} className="text-text-muted" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => {
                      setSearchTerm(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Search row, column or value..."
                    className="w-full border-0 bg-transparent text-xs text-text-secondary outline-none placeholder:text-text-muted"
                  />
                </div>
                <span className="text-xs text-text-muted">
                  {filtered.length} of {errors.length}
                </span>
              </div>

              <div className="overflow-hidden rounded-2xl border border-border-color">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead>
                      <tr className="bg-surface-muted text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                        <th scope="col" className="whitespace-nowrap px-3 py-2.5">Row</th>
                        <th scope="col" className="whitespace-nowrap px-3 py-2.5">Column</th>
                        <th scope="col" className="whitespace-nowrap px-3 py-2.5">Found</th>
                        <th scope="col" className="whitespace-nowrap px-3 py-2.5">Expected</th>
                        <th scope="col" className="px-3 py-2.5">Reason</th>
                        <th scope="col" className="px-3 py-2.5">How to fix</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-color">
                      {pageRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-3 py-8 text-center text-text-muted"
                          >
                            No rows match your search.
                          </td>
                        </tr>
                      ) : (
                        pageRows.map((item, index) => (
                          <tr
                            key={`${item.row}-${item.column}-${index}`}
                            className="align-top transition hover:bg-surface-muted/60"
                          >
                            <td className="whitespace-nowrap px-3 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <span className="rounded bg-red-50 px-1.5 py-0.5 font-mono font-bold text-red-700 dark:bg-red-500/10 dark:text-red-400">
                                  {item.row ?? "—"}
                                </span>
                                {item.row ? (
                                  <button
                                    type="button"
                                    onClick={() => copyRow(item.row)}
                                    title="Copy row number"
                                    aria-label={`Copy row number ${item.row}`}
                                    className="text-text-muted transition hover:text-text-primary"
                                  >
                                    {copiedRow === item.row ? (
                                      <Check size={12} className="text-emerald-500" />
                                    ) : (
                                      <Copy size={12} />
                                    )}
                                  </button>
                                ) : null}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 font-medium text-text-secondary">
                              {item.column}
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className={`rounded px-1.5 py-0.5 font-mono ${
                                  item.value === "(blank)"
                                    ? "bg-surface-muted italic text-text-muted"
                                    : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                                }`}
                              >
                                {item.value}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 font-medium text-emerald-700 dark:text-emerald-400">
                              {item.expected}
                            </td>
                            <td className="px-3 py-2.5 text-text-secondary">
                              {item.reason}
                            </td>
                            <td className="px-3 py-2.5 text-text-muted">{item.fix}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 ? (
                  <div className="flex items-center justify-between gap-3 border-t border-border-color bg-surface-muted px-3 py-2">
                    <span className="text-[11px] text-text-muted">
                      Showing {(currentPage - 1) * ROWS_PER_PAGE + 1}–
                      {Math.min(currentPage * ROWS_PER_PAGE, filtered.length)} of{" "}
                      {filtered.length}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        aria-label="Previous page"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border-color bg-surface text-text-secondary disabled:opacity-40"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span className="text-[11px] tabular-nums text-text-secondary">
                        {currentPage} / {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setPage((prev) => Math.min(totalPages, prev + 1))
                        }
                        disabled={currentPage === totalPages}
                        aria-label="Next page"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border-color bg-surface text-text-secondary disabled:opacity-40"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {truncated ? (
                <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                  <Info size={13} className="mt-0.5 flex-shrink-0" />
                  Showing the first {errors.length} of {totalErrors} problems. Fix
                  these, upload again, and any that remain will be listed.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex flex-shrink-0 flex-col-reverse gap-2 border-t border-border-color/70 bg-surface px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-text-muted">
            No rows were saved. Correct the file and upload it again.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {errors.length ? (
              <button
                type="button"
                onClick={downloadErrorReport}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border-strong bg-surface px-5 text-sm font-medium text-text-secondary transition hover:bg-surface-muted sm:hidden"
              >
                <Download size={15} />
                Error report (CSV)
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-full bg-gradient-to-r from-violet-500 via-indigo-500 to-sky-500 px-6 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
            >
              Close and fix the file
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReportUploadErrorDialog;
