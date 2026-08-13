import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { X, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

import { buildApiUrl } from "../../lib/api";
import UploadDayDetailModal from "./UploadDayDetailModal";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Same Sunday-start 42-cell grid math as PremiumDatePicker.jsx's
// buildCalendarDays, reused here for a status-colored month grid instead of
// a single-date picker.
function buildGridDays(viewDate) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDate = new Date(year, month, 1 - firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(startDate);
    current.setDate(startDate.getDate() + index);
    return current;
  });
}

const STATUS_STYLES = {
  uploaded: "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/40 dark:text-emerald-400",
  missing: "bg-rose-50 border-rose-300 text-rose-700 dark:bg-rose-500/10 dark:border-rose-500/40 dark:text-rose-400",
  future: "bg-surface-muted border-border-color/60 text-text-muted",
  no_data: "bg-surface-muted border-border-color/60 text-text-muted",
};

const STATUS_LABELS = {
  uploaded: "Uploaded",
  missing: "Attendance Not Uploaded",
  future: "Upcoming",
  no_data: "No employees expected",
};

// Days-Uploaded calendar (spec §16-20): green = attendance uploaded that
// date under the current scope, red = expected but missing, neutral =
// future or no employees expected that date. Clicking a day opens the same
// UploadDayDetailModal that Upload History's "View Details" uses.
export default function UploadCalendarModal({ open, onClose, scope, onViewRecords }) {
  const [viewDate, setViewDate] = useState(() => new Date());
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);

  const monthStr = useMemo(
    () => `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, "0")}`,
    [viewDate]
  );

  const fetchMonth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(buildApiUrl("/api/attendance/calendar"), {
        params: { month: monthStr, circle: scope.circle, cmp: scope.cmp, jobRole: scope.jobRole },
      });
      setDays(res.data.days || []);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to load the attendance calendar.");
    } finally {
      setLoading(false);
    }
  }, [monthStr, scope]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = "auto"; };
  }, [open]);

  useEffect(() => {
    if (open) fetchMonth();
  }, [open, fetchMonth]);

  useEffect(() => {
    setSelectedDate(null);
  }, [monthStr]);

  if (!open) return null;

  const dayStatusMap = new Map(days.map((d) => [d.date, d]));
  const gridDays = buildGridDays(viewDate);
  const todayIso = toIsoDate(new Date());

  return (
    <>
      <div className="fixed inset-0 z-[9997] flex items-center justify-center bg-black/40 p-4">
        <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-border-color px-5 py-4">
            <h2 className="text-lg font-semibold text-text-primary">Days Uploaded</h2>
            <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary">
              <X size={18} />
            </button>
          </div>

          <div className="flex items-center justify-between px-5 py-3">
            <button
              type="button"
              onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              className="rounded-lg border border-border-color p-1.5 text-text-secondary hover:text-text-primary"
            >
              <ChevronLeft size={16} />
            </button>
            <p className="text-sm font-semibold text-text-primary">
              {MONTH_NAMES[viewDate.getMonth()]} {viewDate.getFullYear()}
            </p>
            <button
              type="button"
              onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              className="rounded-lg border border-border-color p-1.5 text-text-secondary hover:text-text-primary"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-5">
            {error ? (
              <div className="flex flex-col items-center gap-2 py-8 text-sm text-rose-600 dark:text-rose-400">
                {error}
                <button type="button" onClick={fetchMonth} className="inline-flex items-center gap-1.5 rounded-lg border border-border-color px-3 py-1.5 text-xs font-medium">
                  <RefreshCw size={12} /> Retry
                </button>
              </div>
            ) : loading ? (
              <p className="py-8 text-center text-sm text-text-muted">Loading calendar...</p>
            ) : (
              <>
                <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-text-muted">
                  {WEEKDAY_LABELS.map((d) => <div key={d} className="py-1">{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {gridDays.map((date) => {
                    const isoDate = toIsoDate(date);
                    const inMonth = date.getMonth() === viewDate.getMonth();
                    const dayInfo = inMonth ? dayStatusMap.get(isoDate) : null;
                    const status = dayInfo?.status || (isoDate > todayIso ? "future" : "no_data");
                    const isToday = isoDate === todayIso;
                    return (
                      <button
                        key={isoDate}
                        type="button"
                        disabled={!inMonth}
                        onClick={() => setSelectedDate(isoDate)}
                        className={`aspect-square rounded-lg border text-xs font-medium transition ${
                          inMonth ? STATUS_STYLES[status] : "border-transparent text-text-muted/30"
                        } ${isToday ? "ring-2 ring-blue-400" : ""}`}
                        title={inMonth ? STATUS_LABELS[status] : undefined}
                      >
                        {date.getDate()}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-text-muted">
                  <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Uploaded</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Not Uploaded</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-surface-muted border border-border-color" /> Upcoming / No employees expected</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <UploadDayDetailModal
        date={selectedDate}
        scope={scope}
        onClose={() => setSelectedDate(null)}
        onViewRecords={(date) => { setSelectedDate(null); onViewRecords(date); }}
      />
    </>
  );
}
