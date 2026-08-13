import { useEffect, useState } from "react";
import axios from "axios";
import { saveAs } from "file-saver";
import toast from "react-hot-toast";
import { X, FileSpreadsheet, ListChecks } from "lucide-react";

import { buildApiUrl } from "../../lib/api";
import { formatDisplayDate, formatDateTime } from "../../lib/attendanceFormat";
import ValidationErrorModal from "../ValidationErrorModal";

// Real per-date detail (spec §20-22): totals under the current scope plus
// every attendance_uploads batch that actually contributed rows to that
// date+scope. Shared by the Days-Uploaded calendar and Upload History's
// "View Details" so both surfaces show identical data for the same date.
export default function UploadDayDetailModal({ date, scope, onClose, onViewRecords }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorModalData, setErrorModalData] = useState(null);
  const [errorModalMeta, setErrorModalMeta] = useState(null);

  useEffect(() => {
    if (!date) {
      setDetail(null);
      return;
    }
    setLoading(true);
    axios
      .get(buildApiUrl("/api/attendance/calendar/day"), {
        params: { date, circle: scope?.circle, cmp: scope?.cmp, jobRole: scope?.jobRole },
      })
      .then((res) => setDetail(res.data))
      .catch((err) => {
        console.error(err);
        toast.error(err?.response?.data?.message || "Failed to load this date's detail.");
      })
      .finally(() => setLoading(false));
  }, [date, scope?.circle, scope?.cmp, scope?.jobRole]);

  const openUploadErrors = async (upload) => {
    try {
      const res = await axios.get(buildApiUrl(`/api/attendance/uploads/${upload.id}/errors`));
      setErrorModalData({ errors: res.data.errors, totalRecords: res.data.totalRecords });
      setErrorModalMeta({ id: upload.id, date: res.data.attendanceDate });
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load upload errors.");
    }
  };

  const exportUploadErrors = async () => {
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

  if (!date) return null;

  return (
    <>
      <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-lg rounded-2xl bg-surface p-5 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-text-primary">{formatDisplayDate(date)}</h2>
            <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary">
              <X size={18} />
            </button>
          </div>

          {loading ? (
            <p className="py-6 text-center text-sm text-text-muted">Loading...</p>
          ) : !detail || detail.uploads.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">Attendance has not been uploaded for this date.</p>
          ) : (
            <>
              <div className="mb-3 grid grid-cols-4 gap-2 text-center text-xs">
                <div className="rounded-lg bg-surface-muted p-2"><p className="text-text-muted">Total</p><p className="font-bold text-text-primary">{detail.total}</p></div>
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 p-2"><p className="text-emerald-600 dark:text-emerald-400">Present</p><p className="font-bold text-emerald-600 dark:text-emerald-400">{detail.present}</p></div>
                <div className="rounded-lg bg-rose-50 dark:bg-rose-500/10 p-2"><p className="text-rose-600 dark:text-rose-400">Absent</p><p className="font-bold text-rose-600 dark:text-rose-400">{detail.absent}</p></div>
                <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 p-2"><p className="text-amber-600 dark:text-amber-400">Leave</p><p className="font-bold text-amber-600 dark:text-amber-400">{detail.leave}</p></div>
              </div>

              <div className="max-h-64 space-y-2 overflow-y-auto">
                {detail.uploads.map((upload) => (
                  <div key={upload.id} className="rounded-lg border border-border-color/60 bg-surface-muted/40 p-3 text-xs">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-medium text-text-primary">
                        <FileSpreadsheet size={12} /> {upload.original_name}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        upload.status === "completed_with_errors"
                          ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                          : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                      }`}>
                        {upload.status === "completed_with_errors" ? "Completed with Errors" : "Completed"}
                      </span>
                    </div>
                    <p className="text-text-muted">
                      Uploaded {formatDateTime(upload.confirmed_at || upload.created_at)} by {upload.uploaded_by_name || "-"}
                    </p>
                    <p className="text-text-muted">
                      {upload.total_rows} rows · {upload.inserted_rows + upload.updated_rows} saved
                      {upload.error_rows > 0 ? ` · ${upload.error_rows} errors` : ""}
                    </p>
                    {upload.error_rows > 0 && (
                      <button type="button" onClick={() => openUploadErrors(upload)} className="mt-1 font-semibold text-rose-600 underline dark:text-rose-400">
                        View Errors
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {onViewRecords && (
                <button
                  type="button"
                  onClick={() => onViewRecords(date)}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border-color px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:text-text-primary"
                >
                  <ListChecks size={13} />
                  View Attendance Records
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <ValidationErrorModal
        isOpen={!!errorModalData}
        onClose={() => { setErrorModalData(null); setErrorModalMeta(null); }}
        errorData={errorModalData}
        title="Upload Errors"
        subtitle={errorModalMeta ? `Attendance date ${formatDisplayDate(errorModalMeta.date)} — records that were not saved.` : ""}
        onExport={errorModalMeta ? exportUploadErrors : undefined}
      />
    </>
  );
}
