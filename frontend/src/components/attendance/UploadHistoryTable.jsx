import { useState } from "react";
import axios from "axios";
import { saveAs } from "file-saver";
import toast from "react-hot-toast";
import { RefreshCw, AlertTriangle, Eye, Download } from "lucide-react";

import { buildApiUrl } from "../../lib/api";
import { formatDisplayDate, formatDateTime } from "../../lib/attendanceFormat";
import ValidationErrorModal from "../ValidationErrorModal";
import UploadDayDetailModal from "./UploadDayDetailModal";

const COLUMN_COUNT = 11;

const STATUS_LABELS = {
  pending_preview: "Pending Preview",
  cancelled: "Cancelled",
  completed: "Completed",
  completed_with_errors: "Completed with Errors",
  // legacy rows saved before this status was introduced
  confirmed: "Completed",
};

function StatusPill({ status }) {
  const isError = status === "completed_with_errors";
  const isDone = status === "completed" || status === "confirmed";
  const cls = isError
    ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
    : isDone
    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
    : "bg-surface-muted text-text-secondary";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{STATUS_LABELS[status] || status}</span>;
}

export default function UploadHistoryTable({ uploads, uploadsLoading, uploadsError, onRetry, scope }) {
  const [errorModalData, setErrorModalData] = useState(null);
  const [errorModalMeta, setErrorModalMeta] = useState(null);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await axios.get(buildApiUrl("/api/attendance/uploads/export"), {
        responseType: "blob",
      });
      saveAs(res.data, "attendance_upload_history.xlsx");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to export upload history.");
    } finally {
      setExporting(false);
    }
  };
  const [detailDate, setDetailDate] = useState(null);

  const openErrors = async (item) => {
    try {
      const res = await axios.get(buildApiUrl(`/api/attendance/uploads/${item.id}/errors`));
      setErrorModalData({ errors: res.data.errors, totalRecords: res.data.totalRecords });
      setErrorModalMeta({ id: item.id, date: res.data.attendanceDate });
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load upload errors.");
    }
  };

  const exportErrors = async () => {
    if (!errorModalMeta) return;
    try {
      const res = await axios.get(buildApiUrl(`/api/attendance/uploads/${errorModalMeta.id}/errors/export`), {
        responseType: "blob",
      });
      saveAs(res.data, `Attendance_Upload_Errors_${errorModalMeta.date}.xlsx`);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to export upload errors.");
    }
  };

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || uploadsLoading || uploads.length === 0}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-color bg-surface px-3 text-sm font-medium text-text-secondary transition hover:text-text-primary disabled:opacity-60"
        >
          {exporting ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
          Export Upload History
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border-color/70 bg-surface/70">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-muted text-xs uppercase text-text-muted">
            <tr>
              <th className="px-4 py-3">Uploaded At</th>
              <th className="px-4 py-3">Attendance Date</th>
              <th className="px-4 py-3">File</th>
              <th className="px-4 py-3">Uploaded By</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Inserted</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3">Skipped</th>
              <th className="px-4 py-3">Errors</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {uploadsError ? (
              <tr>
                <td colSpan={COLUMN_COUNT} className="px-4 py-6 text-center">
                  <p className="mb-2 text-sm text-rose-600 dark:text-rose-400">{uploadsError}</p>
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
            ) : uploadsLoading ? (
              <tr>
                <td colSpan={COLUMN_COUNT} className="px-4 py-6 text-center text-text-muted">Loading...</td>
              </tr>
            ) : uploads.length === 0 ? (
              <tr>
                <td colSpan={COLUMN_COUNT} className="px-4 py-6 text-center text-text-muted">No uploads yet.</td>
              </tr>
            ) : (
              uploads.map((item) => (
                <tr key={item.id} className="border-t border-border-color/50">
                  <td className="px-4 py-3">{formatDateTime(item.created_at)}</td>
                  <td className="px-4 py-3">{formatDisplayDate(String(item.attendance_date).slice(0, 10))}</td>
                  <td className="px-4 py-3">{item.original_name}</td>
                  <td className="px-4 py-3">{item.uploaded_by_name || "-"}</td>
                  <td className="px-4 py-3"><StatusPill status={item.status} /></td>
                  <td className="px-4 py-3">{item.total_rows}</td>
                  <td className="px-4 py-3">{item.inserted_rows}</td>
                  <td className="px-4 py-3">{item.updated_rows}</td>
                  <td className="px-4 py-3">{item.skipped_rows}</td>
                  <td className="px-4 py-3">
                    {item.error_rows > 0 ? (
                      <span className="font-semibold text-rose-600 dark:text-rose-400">{item.error_rows}</span>
                    ) : (
                      "0"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setDetailDate(String(item.attendance_date).slice(0, 10))}
                        className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary"
                      >
                        <Eye size={12} /> View Details
                      </button>
                      {item.error_rows > 0 && (
                        <button
                          type="button"
                          onClick={() => openErrors(item)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:underline dark:text-rose-400"
                        >
                          <AlertTriangle size={12} /> View Errors
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ValidationErrorModal
        isOpen={!!errorModalData}
        onClose={() => { setErrorModalData(null); setErrorModalMeta(null); }}
        errorData={errorModalData}
        title="Upload Errors"
        subtitle={errorModalMeta ? `Attendance date ${formatDisplayDate(errorModalMeta.date)} — records that were not saved.` : ""}
        onExport={errorModalMeta ? exportErrors : undefined}
      />

      <UploadDayDetailModal date={detailDate} scope={scope} onClose={() => setDetailDate(null)} />
    </>
  );
}
