import { useEffect, useState } from "react";
import axios from "axios";
import { saveAs } from "file-saver";
import toast from "react-hot-toast";
import { Upload, FileSpreadsheet, Download, X, History, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";

import { buildApiUrl } from "../../lib/api";
import PremiumDatePicker from "../PremiumDatePicker";
import ValidationErrorModal from "../ValidationErrorModal";
import { formatDisplayDate, todayStr } from "../../lib/attendanceFormat";

export default function UploadModal({ onClose, onUploaded }) {
  const [attendanceDate, setAttendanceDate] = useState(todayStr());
  const [file, setFile] = useState(null);
  const [validating, setValidating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState(null); // { batchId, summary, previewRows, attendanceDate }
  const [duplicateAction, setDuplicateAction] = useState("");
  const [errorModalData, setErrorModalData] = useState(null);
  // Set once /upload/confirm succeeds — shows the "Step 3 · Done" result
  // screen instead of immediately closing, since a partial-success upload
  // (valid rows saved, error rows skipped) needs to surface that outcome.
  const [result, setResult] = useState(null); // { inserted, updated, skipped, errorRows }

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, []);

  const handleValidate = async (event) => {
    event.preventDefault();
    if (!file) {
      toast.error("Please select an Excel file.");
      return;
    }

    setValidating(true);
    setPreview(null);
    try {
      const formData = new FormData();
      formData.append("attendanceDate", attendanceDate);
      formData.append("file", file);

      const res = await axios.post(buildApiUrl("/api/attendance/upload/validate"), formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const data = res.data;
      setPreview(data);
      setDuplicateAction("");

      if (data.summary.errorRows > 0) {
        setErrorModalData({ errors: data.errors, totalRecords: data.summary.totalRows });
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to validate the attendance file.");
    } finally {
      setValidating(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview?.batchId) return;
    const hasConflicts = preview.summary.conflictRows > 0;
    if (hasConflicts && !duplicateAction) {
      toast.error("Choose Skip or Update for the existing attendance records first.");
      return;
    }

    setConfirming(true);
    try {
      const res = await axios.post(buildApiUrl("/api/attendance/upload/confirm"), {
        batchId: preview.batchId,
        duplicateAction: duplicateAction || undefined,
      });

      toast.success(res.data.message || "Attendance saved successfully.");
      await onUploaded();
      setResult(res.data.summary || { inserted: 0, updated: 0, skipped: 0, errorRows: 0 });
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save attendance.");
    } finally {
      setConfirming(false);
    }
  };

  const handleExportErrors = async () => {
    if (!preview?.batchId) return;
    try {
      const res = await axios.get(buildApiUrl(`/api/attendance/uploads/${preview.batchId}/errors/export`), {
        responseType: "blob",
      });
      saveAs(res.data, `Attendance_Upload_Errors_${preview.attendanceDate}.xlsx`);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to export upload errors.");
    }
  };

  const handleCancelPreview = async () => {
    if (preview?.batchId) {
      try {
        await axios.post(buildApiUrl("/api/attendance/upload/cancel"), { batchId: preview.batchId });
      } catch (err) {
        console.error(err);
      }
    }
    setPreview(null);
    setFile(null);
    setDuplicateAction("");
  };

  const previewRows = preview?.previewRows || [];
  const conflictCount = preview?.summary?.conflictRows || 0;
  // Partial-success by design: rows that fail validation are simply skipped
  // (never inserted) rather than blocking the rest of the file — only an
  // unresolved duplicate-action choice blocks Confirm now.
  const canConfirm = preview && (!conflictCount || !!duplicateAction);

  return (
    <>
      <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4">
        <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">Upload Attendance</h2>
            <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary">
              <X size={18} />
            </button>
          </div>

          {!preview && (
            <form onSubmit={handleValidate} className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Step 1 · Select date and file
                </p>
                <label className="mb-1 block text-xs font-medium text-text-muted">Attendance Date</label>
                <PremiumDatePicker
                  value={attendanceDate}
                  onChange={setAttendanceDate}
                  isDateDisabled={(date) => date > new Date()}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-text-muted">Excel File (.xlsx, .xls, .csv)</label>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-color bg-surface-muted px-4 py-8 text-sm text-text-muted hover:border-blue-400">
                  <FileSpreadsheet size={18} />
                  {file ? file.name : "Click to select a file"}
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </label>
                <div className="mt-2 flex items-center justify-between text-[11px] text-text-muted">
                  <span>Required columns: Aadhar No, HRMS ID, Attendance.</span>
                  <a
                    href="/formats/attendance_format.xlsx"
                    download="Attendance_Format.xlsx"
                    className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    <Download size={12} />
                    Download format
                  </a>
                </div>
              </div>

              <button
                type="submit"
                disabled={validating}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-sm font-semibold text-white disabled:opacity-60"
              >
                {validating ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
                {validating ? "Validating..." : "Validate & Preview"}
              </button>
            </form>
          )}

          {preview && !result && (
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Step 2 · Review and confirm
              </p>
              <div className="grid grid-cols-4 gap-3 text-center text-sm">
                <div className="rounded-lg bg-surface-muted p-2">
                  <p className="text-text-muted text-[11px]">Total Rows</p>
                  <p className="font-bold text-text-primary">{preview.summary.totalRows}</p>
                </div>
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 p-2">
                  <p className="text-emerald-600 dark:text-emerald-400 text-[11px]">Valid</p>
                  <p className="font-bold text-emerald-600 dark:text-emerald-400">{preview.summary.validRows}</p>
                </div>
                <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 p-2">
                  <p className="text-amber-600 dark:text-amber-400 text-[11px]">Existing</p>
                  <p className="font-bold text-amber-600 dark:text-amber-400">{preview.summary.conflictRows}</p>
                </div>
                <div className="rounded-lg bg-rose-50 dark:bg-rose-500/10 p-2">
                  <p className="text-rose-600 dark:text-rose-400 text-[11px]">Errors</p>
                  <p className="font-bold text-rose-600 dark:text-rose-400">{preview.summary.errorRows}</p>
                </div>
              </div>

              {preview.summary.errorRows > 0 && (
                <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400">
                  This file has {preview.summary.errorRows} row(s) with validation errors — those rows will be{" "}
                  <strong>skipped</strong>, and the remaining valid rows will still be saved.{" "}
                  <button
                    type="button"
                    className="font-semibold underline"
                    onClick={() => setErrorModalData({ errors: preview.errors, totalRecords: preview.summary.totalRows })}
                  >
                    View errors
                  </button>
                  .
                </div>
              )}

              {conflictCount > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
                  <p className="mb-2 font-medium text-amber-700 dark:text-amber-400">
                    Attendance already exists for {conflictCount} employee(s) on {formatDisplayDate(preview.attendanceDate)}. Choose what to do:
                  </p>
                  <div className="flex gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="duplicateAction" value="skip" checked={duplicateAction === "skip"} onChange={() => setDuplicateAction("skip")} />
                      Skip Existing
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="duplicateAction" value="update" checked={duplicateAction === "update"} onChange={() => setDuplicateAction("update")} />
                      Update Existing
                    </label>
                  </div>
                </div>
              )}

              <div className="max-h-72 overflow-y-auto rounded-lg border border-border-color/60">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-surface-muted text-text-muted">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">HRMS ID</th>
                      <th className="px-3 py-2">Employee</th>
                      <th className="px-3 py-2">Attendance</th>
                      <th className="px-3 py-2">Validation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row) => (
                      <tr key={row.row} className="border-t border-border-color/40">
                        <td className="px-3 py-2">{row.row}</td>
                        <td className="px-3 py-2">{row.hrmsId || "-"}</td>
                        <td className="px-3 py-2">{row.employeeName || "-"}</td>
                        <td className="px-3 py-2">{row.attendanceCode || "-"}</td>
                        <td className="px-3 py-2">
                          {row.status === "valid" && <span className="text-emerald-600 dark:text-emerald-400">Valid</span>}
                          {row.status === "conflict" && (
                            <span className="text-amber-600 dark:text-amber-400">Already {row.existingStatus}</span>
                          )}
                          {row.status === "error" && (
                            <span className="text-rose-600 dark:text-rose-400">{row.errorMessages?.[0] || "Invalid"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCancelPreview}
                  className="rounded-xl border border-border-color px-4 py-2 text-sm font-medium text-text-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!canConfirm || confirming}
                  onClick={handleConfirm}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {confirming ? <RefreshCw size={16} className="animate-spin" /> : <History size={16} />}
                  {confirming ? "Saving..." : "Confirm & Save"}
                </button>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Step 3 · Done</p>

              <div className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${
                result.errorRows > 0
                  ? "border-amber-200 bg-amber-50/60 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
                  : "border-emerald-200 bg-emerald-50/60 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400"
              }`}>
                {result.errorRows > 0 ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
                <span className="font-medium">
                  {result.errorRows > 0 ? "Attendance Completed with Errors" : "Attendance saved successfully."}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-3 text-center text-sm">
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 p-2">
                  <p className="text-emerald-600 dark:text-emerald-400 text-[11px]">Inserted</p>
                  <p className="font-bold text-emerald-600 dark:text-emerald-400">{result.inserted}</p>
                </div>
                <div className="rounded-lg bg-blue-50 dark:bg-blue-500/10 p-2">
                  <p className="text-blue-600 dark:text-blue-400 text-[11px]">Updated</p>
                  <p className="font-bold text-blue-600 dark:text-blue-400">{result.updated}</p>
                </div>
                <div className="rounded-lg bg-surface-muted p-2">
                  <p className="text-text-muted text-[11px]">Skipped</p>
                  <p className="font-bold text-text-primary">{result.skipped}</p>
                </div>
                <div className="rounded-lg bg-rose-50 dark:bg-rose-500/10 p-2">
                  <p className="text-rose-600 dark:text-rose-400 text-[11px]">Errors</p>
                  <p className="font-bold text-rose-600 dark:text-rose-400">{result.errorRows}</p>
                </div>
              </div>

              {result.errorRows > 0 && (
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setErrorModalData({ errors: preview.errors, totalRecords: preview.summary.totalRows })}
                    className="inline-flex items-center gap-2 rounded-xl border border-border-color px-4 py-2 text-sm font-medium text-text-secondary transition hover:text-text-primary"
                  >
                    View Errors
                  </button>
                  <button
                    type="button"
                    onClick={handleExportErrors}
                    className="inline-flex items-center gap-2 rounded-xl border border-border-color px-4 py-2 text-sm font-medium text-text-secondary transition hover:text-text-primary"
                  >
                    <Download size={14} />
                    Export Errors Excel
                  </button>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ValidationErrorModal
        isOpen={!!errorModalData}
        onClose={() => setErrorModalData(null)}
        errorData={errorModalData}
        title="Attendance Upload Validation Failed"
        subtitle="Fix these rows in the Excel file and upload again. No records were saved."
      />
    </>
  );
}
