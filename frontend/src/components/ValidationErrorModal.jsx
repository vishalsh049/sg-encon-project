import React, { useState, useMemo, useEffect } from "react";
import {
  X,
  AlertTriangle,
  Download,
  Search,
  ChevronUp,
  ChevronDown,
  Copy,
  Check,
  CheckCircle,
  XCircle,
  AlertCircle,
  Info,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// ─── Parsing Utilities ────────────────────────────────────────────────────────

function getExpectedValues(field) {
  const f = field.toLowerCase();
  if (f.includes("employment status")) return ["Active", "Inactive"];
  if (f.includes("pprj status"))
    return ["Active", "Inactive", "Pending", "Not Applicable"];
  if (f.includes("job role")) return ["See allowed job roles list"];
  if (f.includes("circle"))
    return ["Punjab", "Delhi", "Haryana", "UP East", "UP West", "..."];
  if (f.includes("cmp")) return ["Valid CMP for selected Circle"];
  if (f.includes("aadhaar")) return ["Valid Aadhaar Number"];
  return ["See format template"];
}

function classifyError(msg) {
  // "Aadhaar Number is mandatory. Please fill Aadhaar Number and upload again."
  const mandatoryMatch = msg.match(/^(.+?)\s+is\s+mandatory\b/i);
  if (mandatoryMatch) {
    const field = mandatoryMatch[1].trim();
    return {
      column: field,
      currentValue: "(Blank)",
      expectedValues: getExpectedValues(field),
      errorType: `${field} is mandatory`,
      howToFix: `Enter a valid ${field} value in Excel.`,
    };
  }

  // "Job Role is blank" / "Employment Status is blank"
  const blankMatch = msg.match(/^(.+?)\s+is\s+blank$/i);
  if (blankMatch) {
    const field = blankMatch[1].trim();
    return {
      column: field,
      currentValue: "(Blank)",
      expectedValues: getExpectedValues(field),
      errorType: `${field} is blank`,
      howToFix: `Enter a valid ${field} value in Excel.`,
    };
  }

  // "Invalid Employment Status "Pending""
  const invalidFieldMatch = msg.match(/^Invalid\s+(.+?)\s+"(.+?)"$/i);
  if (invalidFieldMatch) {
    const field = invalidFieldMatch[1].trim();
    const value = invalidFieldMatch[2].trim();
    return {
      column: field,
      currentValue: value,
      expectedValues: getExpectedValues(field),
      errorType: `Invalid ${field}`,
      howToFix: `Replace "${value}" with a valid ${field} value.`,
    };
  }

  // "Invalid Circle: Punjab NCR"
  const circleMatch = msg.match(/^Invalid Circle:\s*(.+)$/i);
  if (circleMatch) {
    return {
      column: "Circle",
      currentValue: circleMatch[1].trim(),
      expectedValues: getExpectedValues("circle"),
      errorType: "Invalid Circle",
      howToFix: "Use a valid circle name from the dropdown.",
    };
  }

  // "Invalid CMP "XYZ" for Circle "Punjab""
  const cmpMatch = msg.match(
    /^Invalid CMP\s+"(.+?)"\s+for Circle\s+"(.+?)"$/i
  );
  if (cmpMatch) {
    return {
      column: "CMP",
      currentValue: cmpMatch[1].trim(),
      expectedValues: [`Valid CMP for ${cmpMatch[2].trim()}`],
      errorType: "Invalid CMP",
      howToFix: `Use a valid CMP for circle "${cmpMatch[2].trim()}".`,
    };
  }

  return {
    column: "Unknown",
    currentValue: "-",
    expectedValues: ["-"],
    errorType: "Other",
    howToFix: "Please correct this value and upload again.",
  };
}

// Coerce any error payload (string, object, array, null, …) into display-safe text.
function toErrorText(err) {
  if (err === null || err === undefined) return "";
  if (typeof err === "string") return err;
  if (typeof err === "number" || typeof err === "boolean") return String(err);
  if (Array.isArray(err)) return err.map(toErrorText).filter(Boolean).join("\n");
  if (typeof err === "object") {
    const msg = toErrorText(err.error ?? err.errorType ?? err.message ?? err.msg);
    if (msg) return msg;
    try {
      return JSON.stringify(err);
    } catch {
      return "Validation error";
    }
  }
  return String(err);
}

function firstText(...values) {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

// Structured backend error, e.g.
// { row, employee, employeeCode, column, currentValue, error, expected }
function parseErrorObject(errObj, index) {
  const message =
    firstText(errObj.error, errObj.errorType, errObj.message, errObj.msg) ||
    "Validation error";
  const classified = classifyError(message);
  const column = firstText(errObj.column, errObj.field) || classified.column;
  const rowNum = Number(errObj.row);
  const expectedValues = Array.isArray(errObj.expected)
    ? errObj.expected.map(toErrorText).filter(Boolean)
    : firstText(errObj.expected)
    ? [firstText(errObj.expected)]
    : classified.expectedValues;

  return {
    id: index,
    row: Number.isFinite(rowNum) && rowNum > 0 ? rowNum : null,
    employee: firstText(errObj.employee, errObj.employeeName) || "-",
    employeeCode: firstText(errObj.employeeCode, errObj.code) || "-",
    column,
    currentValue:
      firstText(errObj.currentValue, errObj.value) || classified.currentValue,
    expectedValues: expectedValues.length ? expectedValues : ["-"],
    errorType: message,
    howToFix:
      firstText(errObj.howToFix) ||
      `Correct the "${column}" value and upload again.`,
  };
}

function parseErrorString(rawError, index) {
  if (rawError && typeof rawError === "object" && !Array.isArray(rawError)) {
    return parseErrorObject(rawError, index);
  }

  const cleaned = toErrorText(rawError).replace(/^[❌⚠️✗×\s]+/, "").trim();

  // "Row 2 - John Doe (EMP001) : Job Role is blank"
  const rowMatch = cleaned.match(
    /^Row\s+(\d+)\s*[-–]\s*(.+?)\s*\((.+?)\)\s*:\s*(.+)$/
  );

  if (rowMatch) {
    const [, rowNum, name, code, msg] = rowMatch;
    return {
      id: index,
      row: parseInt(rowNum),
      employee: name.trim(),
      employeeCode: code.trim(),
      ...classifyError(msg.trim()),
    };
  }

  return {
    id: index,
    row: null,
    employee: "-",
    employeeCode: "-",
    ...classifyError(cleaned),
  };
}

// Accept every response shape the upload APIs may produce and return a flat
// list of error items (strings or structured objects).
function normalizeErrorList(errorData) {
  if (!errorData) return [];
  if (typeof errorData === "string") {
    return errorData.split("\n").filter((l) => l.trim());
  }
  if (Array.isArray(errorData)) {
    return errorData
      .flat(Infinity)
      .filter((e) => e !== null && e !== undefined && e !== "");
  }
  if (typeof errorData === "object") {
    const list = [
      errorData.errors,
      errorData.validationErrors,
      errorData.details,
    ].find((v) => Array.isArray(v) && v.length > 0);
    if (list) {
      return list
        .flat(Infinity)
        .filter((e) => e !== null && e !== undefined && e !== "");
    }
    const message = toErrorText(errorData.message ?? errorData.error);
    return message.split("\n").filter((l) => l.trim());
  }
  return [];
}

const FALLBACK_ERROR = {
  row: null,
  employee: "-",
  employeeCode: "-",
  column: "Unknown",
  currentValue: "-",
  expectedValues: ["-"],
  errorType: "Other",
  howToFix: "Please correct this value and upload again.",
};

// ─── Main Component ───────────────────────────────────────────────────────────

const ROWS_PER_PAGE = 10;

export default function ValidationErrorModal({ isOpen, onClose, errorData }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({
    key: "row",
    direction: "asc",
  });
  const [copiedRow, setCopiedRow] = useState(null);

  // Parse all errors — never let a malformed entry crash the modal
  const parsedErrors = useMemo(() => {
    let list;
    try {
      list = normalizeErrorList(errorData);
    } catch {
      return [];
    }
    return list.map((e, i) => {
      try {
        return parseErrorString(e, i);
      } catch {
        return { id: i, ...FALLBACK_ERROR };
      }
    });
  }, [errorData]);

  // Stats
  const totalRecordsRaw = Number(errorData?.totalRecords);
  const totalRecords =
    Number.isFinite(totalRecordsRaw) && totalRecordsRaw > 0
      ? totalRecordsRaw
      : null;
  const invalidRows = useMemo(
    () =>
      new Set(parsedErrors.filter((e) => e.row !== null).map((e) => e.row))
        .size,
    [parsedErrors]
  );
  const validRecords =
    totalRecords !== null ? Math.max(0, totalRecords - invalidRows) : null;

  // Grouped errors
  const groupedErrors = useMemo(() => {
    const groups = {};
    parsedErrors.forEach((e) => {
      if (!groups[e.errorType]) {
        groups[e.errorType] = {
          errorType: e.errorType,
          column: e.column,
          count: 0,
          rows: [],
          currentValues: new Set(),
          expectedValues: e.expectedValues,
          howToFix: e.howToFix,
        };
      }
      groups[e.errorType].count++;
      if (e.row) groups[e.errorType].rows.push(e.row);
      if (e.currentValue !== "(Blank)" && e.currentValue !== "-") {
        groups[e.errorType].currentValues.add(e.currentValue);
      }
    });
    return Object.values(groups).sort((a, b) => b.count - a.count);
  }, [parsedErrors]);

  // Important notes for help panel
  const importantNotes = useMemo(() => {
    return groupedErrors
      .filter(
        (g) =>
          g.expectedValues.length > 0 &&
          g.expectedValues[0] !== "-" &&
          g.expectedValues[0] !== "See format template"
      )
      .map((g) => ({ field: g.column, values: g.expectedValues }));
  }, [groupedErrors]);

  // Filtered + sorted table
  const filteredErrors = useMemo(() => {
    let list = parsedErrors;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(
        (e) =>
          String(e.row).includes(term) ||
          e.employee.toLowerCase().includes(term) ||
          e.employeeCode.toLowerCase().includes(term) ||
          e.column.toLowerCase().includes(term) ||
          e.currentValue.toLowerCase().includes(term) ||
          e.errorType.toLowerCase().includes(term)
      );
    }
    return [...list].sort((a, b) => {
      const av =
        sortConfig.key === "row"
          ? a.row ?? 0
          : String(a[sortConfig.key] ?? "");
      const bv =
        sortConfig.key === "row"
          ? b.row ?? 0
          : String(b[sortConfig.key] ?? "");
      if (av < bv) return sortConfig.direction === "asc" ? -1 : 1;
      if (av > bv) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [parsedErrors, searchTerm, sortConfig]);

  const totalPages = Math.ceil(filteredErrors.length / ROWS_PER_PAGE);
  const pageData = filteredErrors.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
    setCurrentPage(1);
  };

  const handleSearch = (val) => {
    setSearchTerm(val);
    setCurrentPage(1);
  };

  const copyRowNumber = (row) => {
    navigator.clipboard.writeText(String(row)).then(() => {
      setCopiedRow(row);
      setTimeout(() => setCopiedRow(null), 1500);
    });
  };

  const downloadErrorReport = () => {
    const headers = [
      "Row Number",
      "Employee Name",
      "Employee Code",
      "Column",
      "Current Value",
      "Expected Value",
      "Error Type",
      "How to Fix",
    ];
    const rows = parsedErrors.map((e) => [
      e.row ?? "-",
      e.employee,
      e.employeeCode,
      e.column,
      e.currentValue,
      e.expectedValues.join(" / "),
      e.errorType,
      e.howToFix,
    ]);
    const csv = [headers, ...rows]
      .map((r) =>
        r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");
    const blob = new Blob(["﻿" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "validation_errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ col }) => {
    if (sortConfig.key !== col)
      return <ChevronUp className="w-3 h-3 text-slate-300" />;
    return sortConfig.direction === "asc" ? (
      <ChevronUp className="w-3 h-3 text-blue-500 dark:text-blue-400" />
    ) : (
      <ChevronDown className="w-3 h-3 text-blue-500 dark:text-blue-400" />
    );
  };

  // Scroll-lock body while open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @keyframes vem-backdrop { from { opacity: 0; } to { opacity: 1; } }
        @keyframes vem-panel { from { opacity: 0; transform: translateY(14px) scale(0.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backgroundColor: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(4px)",
        animation: "vem-backdrop 0.2s ease-out both",
      }}
    >
      <div
        className="w-full bg-surface rounded-2xl shadow-2xl flex flex-col"
        style={{
          maxWidth: "1400px",
          maxHeight: "95vh",
          animation: "vem-panel 0.25s ease-out both",
        }}
      >
        {/* ── STICKY HEADER ──────────────────────────────────────────────── */}
        <div className="flex-shrink-0 border-b border-border-color rounded-t-2xl px-4 py-4 flex items-start gap-4">
          {/* Icon */}
          <div
            className="flex-shrink-0 flex items-center justify-center rounded-xl"
            style={{
              width: 48,
              height: 48,
              background: "linear-gradient(135deg,#FEE2E2,#FECACA)",
            }}
          >
            <AlertTriangle className="w-6 h-6" style={{ color: "#DC2626" }} />
          </div>

          {/* Title */}
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-text-primary leading-tight">
              File Upload Validation Failed
            </h2>
            <p className="text-sm text-text-muted mt-0.5">
              We found validation errors in your uploaded Excel file.{" "}
              <span className="font-medium text-text-secondary">
                Please correct the highlighted records and upload again.
              </span>
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={downloadErrorReport}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg transition-all shadow-sm"
              style={{ background: "linear-gradient(135deg,#2563EB,#1D4ED8)" }}
            >
              <Download className="w-4 h-4" />
              Download Error Report
            </button>
            <button
              onClick={onClose}
              className="flex items-center justify-center rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-muted transition-colors"
              style={{ width: 36, height: 36 }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── SUMMARY CARDS ──────────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-4 pt-2 pb-4 grid grid-cols-4 gap-4">
          {/* Total Records */}
          <div
            className="rounded-xl px-4 py-2 flex flex-col gap-1"
            style={{
              background: "linear-gradient(135deg,#F8FAFC,#F1F5F9)",
              border: "1px solid #E2E8F0",
            }}
          >
            <span className="text-xs font-semibold uppercase tracking-widest text-text-muted">
              Total Records
            </span>
            <span className="text-xl font-semibold text-text-primary">
              {totalRecords ?? "—"}
            </span>
            <span className="text-xs text-text-muted">Rows in uploaded file</span>
          </div>

          {/* Valid Records */}
          <div
            className="rounded-xl px-4 py-2 flex flex-col gap-1"
            style={{
              background: "linear-gradient(135deg,#F0FDF4,#DCFCE7)",
              border: "1px solid #BBF7D0",
            }}
          >
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
              Valid Records
            </span>
            <span className="text-xl font-semibold text-emerald-700 dark:text-emerald-400">
              {validRecords ?? "—"}
            </span>
            <div className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
              <span className="text-xs text-emerald-600 dark:text-emerald-400">Ready to import</span>
            </div>
          </div>

          {/* Invalid Records */}
          <div
            className="rounded-xl px-4 py-2 flex flex-col gap-1"
            style={{
              background: "linear-gradient(135deg,#FFF1F2,#FFE4E6)",
              border: "1px solid #FECDD3",
            }}
          >
            <span className="text-xs font-bold uppercase tracking-widest text-red-600 dark:text-red-400">
              Invalid Records
            </span>
            <span className="text-xl font-semibold text-red-700 dark:text-red-400">
              {invalidRows}
            </span>
            <div className="flex items-center gap-1">
              <XCircle className="w-3 h-3 text-red-500 dark:text-red-400" />
              <span className="text-xs text-red-600 dark:text-red-400">Need correction</span>
            </div>
          </div>

          {/* Error Types */}
          <div
            className="rounded-xl px-4 py-2 flex flex-col gap-1"
            style={{
              background: "linear-gradient(135deg,#FFFBEB,#FEF3C7)",
              border: "1px solid #FDE68A",
            }}
          >
            <span className="text-xs font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">
              Error Types
            </span>
            <span className="text-xl font-semibold text-amber-700 dark:text-amber-400">
              {groupedErrors.length}
            </span>
            <div className="flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-amber-500 dark:text-amber-400" />
              <span className="text-xs text-amber-600 dark:text-amber-400">Distinct issues</span>
            </div>
          </div>
        </div>

        {/* ── BODY ───────────────────────────────────────────────────────── */}
        <div
          className="flex-1 overflow-y-auto flex gap-6 px-4 pb-4 min-h-0"
          style={{ minHeight: 0 }}
        >
          {/* LEFT: Error Summary + Table */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">

            {/* Error Summary */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                <h3 className="text-sm font-bold text-text-primary">
                  Error Summary
                </h3>
                <span className="ml-auto text-xs text-text-muted">
                  {groupedErrors.length} error type
                  {groupedErrors.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="flex flex-col gap-3">
                {groupedErrors.map((group) => (
                  <div
                    key={group.errorType}
                    className="bg-surface rounded-xl p-4 transition-shadow"
                    style={{
                      border: "1px solid #E2E8F0",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                    }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Error icon */}
                      <div
                        className="flex-shrink-0 flex items-center justify-center rounded-lg"
                        style={{
                          width: 34,
                          height: 34,
                          background: "#FFF1F2",
                        }}
                      >
                        <XCircle
                          className="w-4 h-4"
                          style={{ color: "#EF4444" }}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Header row */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-text-primary">
                            {group.errorType}
                          </span>
                          <span
                            className="px-2.5 py-0.5 text-xs font-bold rounded-full"
                            style={{
                              background: "#FEE2E2",
                              color: "#B91C1C",
                            }}
                          >
                            {group.count} Record{group.count !== 1 ? "s" : ""}
                          </span>
                        </div>

                        {/* Details grid */}
                        <div className="mt-2.5 grid grid-cols-3 gap-4 text-xs">
                          <div>
                            <p className="font-semibold text-text-muted uppercase tracking-wide text-[10px] mb-1">
                              Column
                            </p>
                            <p className="font-semibold text-text-secondary">
                              {group.column}
                            </p>
                          </div>

                          {group.currentValues.size > 0 && (
                            <div>
                              <p className="font-semibold text-text-muted uppercase tracking-wide text-[10px] mb-1">
                                Found Values
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {[...group.currentValues]
                                  .slice(0, 4)
                                  .map((v) => (
                                    <span
                                      key={v}
                                      className="px-1.5 py-0.5 rounded font-mono"
                                      style={{
                                        background: "#FEF2F2",
                                        color: "#DC2626",
                                        fontSize: 11,
                                      }}
                                    >
                                      {v}
                                    </span>
                                  ))}
                                {group.currentValues.size > 4 && (
                                  <span className="text-text-muted text-[11px]">
                                    +{group.currentValues.size - 4} more
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          <div>
                            <p className="font-semibold text-text-muted uppercase tracking-wide text-[10px] mb-1">
                              Expected Values
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {group.expectedValues.map((v) => (
                                <span
                                  key={v}
                                  className="px-1.5 py-0.5 rounded font-medium"
                                  style={{
                                    background: "#F0FDF4",
                                    color: "#15803D",
                                    fontSize: 11,
                                  }}
                                >
                                  {v}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Detailed Error Table */}
            <div>
              {/* Table header controls */}
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 dark:text-red-400" />
                  <h3 className="text-sm font-bold text-text-primary">
                    Detailed Error Records
                  </h3>
                </div>
                <div
                  className="relative flex-1 ml-auto"
                  style={{ maxWidth: 300 }}
                >
                  <Search
                    className="absolute top-1/2 -translate-y-1/2 text-text-muted"
                    style={{ left: 10, width: 14, height: 14 }}
                  />
                  <input
                    type="text"
                    placeholder="Search row, employee, column..."
                    value={searchTerm}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="w-full py-2 text-xs rounded-lg focus:outline-none focus:ring-2 bg-surface-muted"
                    style={{
                      paddingLeft: 32,
                      paddingRight: 12,
                      border: "1px solid #E2E8F0",
                      focusRingColor: "#3B82F6",
                    }}
                  />
                </div>
                <span className="text-xs text-text-muted flex-shrink-0">
                  {filteredErrors.length} record
                  {filteredErrors.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Table */}
              <div
                className="rounded-xl overflow-hidden"
                style={{ border: "1px solid #E2E8F0" }}
              >
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                        {[
                          { key: "row", label: "Row" },
                          { key: "employee", label: "Employee" },
                          { key: "column", label: "Column" },
                          { key: "currentValue", label: "Current Value" },
                          { key: "errorType", label: "Error" },
                        ].map((col) => (
                          <th
                            key={col.key}
                            onClick={() => handleSort(col.key)}
                            className="text-left font-semibold text-text-muted uppercase tracking-wide cursor-pointer select-none hover:bg-surface-muted transition-colors"
                            style={{
                              padding: "10px 12px",
                              fontSize: 10,
                              letterSpacing: "0.08em",
                            }}
                          >
                            <div className="flex items-center gap-1">
                              {col.label}
                              <SortIcon col={col.key} />
                            </div>
                          </th>
                        ))}
                        <th
                          className="text-left font-semibold text-text-muted uppercase tracking-wide"
                          style={{
                            padding: "10px 12px",
                            fontSize: 10,
                            letterSpacing: "0.08em",
                          }}
                        >
                          Expected
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageData.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="text-center text-text-muted"
                            style={{ padding: "32px 16px" }}
                          >
                            No records match your search
                          </td>
                        </tr>
                      ) : (
                        pageData.map((err, idx) => (
                          <tr
                            key={err.id}
                            style={{
                              borderTop:
                                idx === 0 ? "none" : "1px solid #F1F5F9",
                              background:
                                idx % 2 === 0 ? "#FFFFFF" : "#FAFAFA",
                            }}
                            className="hover:bg-red-50 hover:dark:bg-red-500/10 transition-colors"
                          >
                            {/* Row Number */}
                            <td style={{ padding: "10px 12px" }}>
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="font-bold font-mono rounded"
                                  style={{
                                    padding: "2px 6px",
                                    background: "#FEE2E2",
                                    color: "#B91C1C",
                                  }}
                                >
                                  {err.row ?? "—"}
                                </span>
                                {err.row && (
                                  <button
                                    onClick={() => copyRowNumber(err.row)}
                                    className="transition-colors"
                                    style={{
                                      color:
                                        copiedRow === err.row
                                          ? "#10B981"
                                          : "#CBD5E1",
                                    }}
                                    title="Copy row number"
                                  >
                                    {copiedRow === err.row ? (
                                      <Check style={{ width: 12, height: 12 }} />
                                    ) : (
                                      <Copy style={{ width: 12, height: 12 }} />
                                    )}
                                  </button>
                                )}
                              </div>
                            </td>

                            {/* Employee */}
                            <td style={{ padding: "10px 12px" }}>
                              <div
                                className="font-semibold"
                                style={{ color: "#1E293B" }}
                              >
                                {err.employee}
                              </div>
                              <div
                                className="font-mono"
                                style={{ color: "#94A3B8", fontSize: 11 }}
                              >
                                {err.employeeCode}
                              </div>
                            </td>

                            {/* Column */}
                            <td
                              className="font-medium"
                              style={{ padding: "10px 12px", color: "#475569" }}
                            >
                              {err.column}
                            </td>

                            {/* Current Value */}
                            <td style={{ padding: "10px 12px" }}>
                              <span
                                className="rounded font-mono"
                                style={{
                                  padding: "2px 6px",
                                  background:
                                    err.currentValue === "(Blank)"
                                      ? "#F1F5F9"
                                      : "#FEF2F2",
                                  color:
                                    err.currentValue === "(Blank)"
                                      ? "#94A3B8"
                                      : "#DC2626",
                                  fontStyle:
                                    err.currentValue === "(Blank)"
                                      ? "italic"
                                      : "normal",
                                }}
                              >
                                {err.currentValue}
                              </span>
                            </td>

                            {/* Error */}
                            <td
                              style={{ padding: "10px 12px", color: "#64748B" }}
                            >
                              {err.errorType}
                            </td>

                            {/* Expected */}
                            <td style={{ padding: "10px 12px" }}>
                              <div className="flex flex-wrap gap-1">
                                {err.expectedValues.map((v) => (
                                  <span
                                    key={v}
                                    className="rounded font-medium"
                                    style={{
                                      padding: "2px 6px",
                                      background: "#F0FDF4",
                                      color: "#15803D",
                                      fontSize: 11,
                                    }}
                                  >
                                    {v}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div
                    className="flex items-center justify-between px-4"
                    style={{
                      padding: "10px 16px",
                      borderTop: "1px solid #F1F5F9",
                      background: "#F8FAFC",
                    }}
                  >
                    <span style={{ fontSize: 12, color: "#94A3B8" }}>
                      Showing{" "}
                      {Math.min(
                        (currentPage - 1) * ROWS_PER_PAGE + 1,
                        filteredErrors.length
                      )}
                      –
                      {Math.min(
                        currentPage * ROWS_PER_PAGE,
                        filteredErrors.length
                      )}{" "}
                      of {filteredErrors.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          setCurrentPage((p) => Math.max(1, p - 1))
                        }
                        disabled={currentPage === 1}
                        className="rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                          padding: 4,
                          color: "#475569",
                        }}
                      >
                        <ChevronLeft style={{ width: 16, height: 16 }} />
                      </button>

                      {/* Page numbers */}
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter((p) => {
                          if (totalPages <= 5) return true;
                          return (
                            p === 1 ||
                            p === totalPages ||
                            Math.abs(p - currentPage) <= 1
                          );
                        })
                        .reduce((acc, p, i, arr) => {
                          if (i > 0 && p - arr[i - 1] > 1)
                            acc.push("...");
                          acc.push(p);
                          return acc;
                        }, [])
                        .map((item, i) =>
                          item === "..." ? (
                            <span
                              key={`ellipsis-${i}`}
                              style={{ fontSize: 12, color: "#94A3B8", padding: "0 2px" }}
                            >
                              …
                            </span>
                          ) : (
                            <button
                              key={item}
                              onClick={() => setCurrentPage(item)}
                              className="rounded font-medium transition-colors"
                              style={{
                                width: 28,
                                height: 28,
                                fontSize: 12,
                                background:
                                  item === currentPage ? "#2563EB" : "transparent",
                                color:
                                  item === currentPage ? "#FFFFFF" : "#475569",
                              }}
                            >
                              {item}
                            </button>
                          )
                        )}

                      <button
                        onClick={() =>
                          setCurrentPage((p) => Math.min(totalPages, p + 1))
                        }
                        disabled={currentPage === totalPages}
                        className="rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ padding: 4, color: "#475569" }}
                      >
                        <ChevronRight style={{ width: 16, height: 16 }} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: Help Panel */}
          <div
            className="flex-shrink-0 flex flex-col gap-4"
            style={{ width: 272, alignSelf: "flex-start", position: "sticky", top: 0 }}
          >
            {/* How to Fix */}
            <div
              className="rounded-xl p-5"
              style={{
                background: "linear-gradient(135deg,#EFF6FF,#DBEAFE)",
                border: "1px solid #BFDBFE",
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Info
                  className="flex-shrink-0"
                  style={{ width: 16, height: 16, color: "#2563EB" }}
                />
                <h4 className="text-sm font-bold" style={{ color: "#1E40AF" }}>
                  How to Fix
                </h4>
              </div>
              <ol className="flex flex-col gap-2.5">
                {[
                  "Open your Excel file",
                  "Go to the mentioned row numbers",
                  "Correct the highlighted values",
                  "Save the Excel file",
                  "Upload again",
                ].map((step, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5"
                    style={{ fontSize: 12, color: "#1D4ED8" }}
                  >
                    <span
                      className="flex-shrink-0 flex items-center justify-center rounded-full font-bold"
                      style={{
                        width: 20,
                        height: 20,
                        background: "#2563EB",
                        color: "#FFFFFF",
                        fontSize: 10,
                        marginTop: 1,
                      }}
                    >
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            {/* Important Notes */}
            {importantNotes.length > 0 && (
              <div
                className="rounded-xl p-5"
                style={{
                  background: "linear-gradient(135deg,#FFFBEB,#FEF3C7)",
                  border: "1px solid #FDE68A",
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle
                    className="flex-shrink-0"
                    style={{ width: 16, height: 16, color: "#D97706" }}
                  />
                  <h4
                    className="text-sm font-bold"
                    style={{ color: "#92400E" }}
                  >
                    Important Notes
                  </h4>
                </div>
                <div className="flex flex-col gap-4">
                  {importantNotes.map((note) => (
                    <div key={note.field}>
                      <p
                        className="font-semibold mb-1.5"
                        style={{ fontSize: 12, color: "#92400E" }}
                      >
                        {note.field} must be one of:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {note.values.map((v) => (
                          <span
                            key={v}
                            className="rounded font-medium"
                            style={{
                              padding: "2px 8px",
                              background: "#FFFFFF",
                              border: "1px solid #FCD34D",
                              color: "#B45309",
                              fontSize: 11,
                            }}
                          >
                            {v}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                  <p
                    className="pt-2"
                    style={{
                      fontSize: 11,
                      color: "#D97706",
                      borderTop: "1px solid #FDE68A",
                    }}
                  >
                    Only use values exactly as shown above.
                  </p>
                </div>
              </div>
            )}

            {/* Tip card */}
            <div
              className="rounded-xl p-4"
              style={{
                background: "#F8FAFC",
                border: "1px solid #E2E8F0",
              }}
            >
              <p style={{ fontSize: 12, color: "#64748B", lineHeight: 1.6 }}>
                <span className="font-semibold" style={{ color: "#334155" }}>
                  Tip:{" "}
                </span>
                Use <strong>Download Error Report</strong> to get a CSV with
                only invalid rows, expected values, and fix instructions. Correct
                the file and upload again.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
