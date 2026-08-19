import { Users, CheckCircle2, XCircle, CalendarClock, ClipboardList, Percent, ListChecks, RefreshCw } from "lucide-react";

const TONE_CLASSES = {
  blue: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10",
  green: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10",
  red: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10",
  amber: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10",
  violet: "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10",
  gray: "text-text-secondary bg-surface-muted",
};

function StatCard({ label, value, hint, icon: Icon, tone = "blue", onClick, loading }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-border-color/70 bg-surface/70 backdrop-blur-xl p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-border-color hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wide text-text-muted">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${TONE_CLASSES[tone]}`}>
          {Icon && <Icon size={16} />}
        </span>
      </div>
      {loading ? (
        <>
          <div className="mt-2.5 h-6 w-16 animate-pulse rounded bg-surface-muted" />
          <div className="mt-2 h-2.5 w-24 animate-pulse rounded bg-surface-muted" />
        </>
      ) : (
        <>
          <p className="mt-2 text-2xl font-bold text-text-primary">{value}</p>
          {hint && <p className="mt-1 text-[11px] text-text-muted">{hint}</p>}
        </>
      )}
    </button>
  );
}

// Seven cards, each with a one-line hint, so the numbers are self-explanatory
// on the page itself instead of requiring anyone to ask what they mean. All
// values (except Total Employees, a current-headcount snapshot) reflect
// whatever date range + circle/CMP/job-role filters are currently active.
export default function StatsRow({ summary, summaryLoading, summaryError, onRetry, onCardClick }) {
  const marked = (summary?.present ?? 0) + (summary?.absent ?? 0) + (summary?.leave ?? 0);
  const rate = marked > 0 ? Math.round(((summary?.present ?? 0) / marked) * 100) : null;

  if (summaryError) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50/60 px-4 py-3 text-sm dark:border-rose-500/30 dark:bg-rose-500/10">
        <span className="text-rose-700 dark:text-rose-400">{summaryError}</span>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/40 dark:text-rose-400 dark:hover:bg-rose-500/10"
        >
          <RefreshCw size={12} />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
      <StatCard
        label="Total Employees"
        value={summary?.totalEmployees ?? 0}
        hint="Active in Physical master (current headcount, not date-filtered)"
        icon={Users}
        tone="blue"
        loading={summaryLoading}
        onClick={() => onCardClick?.("employees")}
      />
      <StatCard
        label="Present"
        value={summary?.present ?? 0}
        hint="Marked Present in selected period"
        icon={CheckCircle2}
        tone="green"
        loading={summaryLoading}
        onClick={() => onCardClick?.("present")}
      />
      <StatCard
        label="Absent"
        value={summary?.absent ?? 0}
        hint="Marked Absent in selected period"
        icon={XCircle}
        tone="red"
        loading={summaryLoading}
        onClick={() => onCardClick?.("absent")}
      />
      <StatCard
        label="Leave"
        value={summary?.leave ?? 0}
        hint="Marked Leave in selected period"
        icon={CalendarClock}
        tone="amber"
        loading={summaryLoading}
        onClick={() => onCardClick?.("leave")}
      />
      <StatCard
        label="Attendance Rate"
        value={rate === null ? "-" : `${rate}%`}
        hint="Present ÷ all marked days"
        icon={Percent}
        tone="green"
        loading={summaryLoading}
        onClick={() => onCardClick?.("rate")}
      />
      <StatCard
        label="Total Records"
        value={summary?.totalRecords ?? 0}
        hint="All attendance rows in selected period"
        icon={ListChecks}
        tone="violet"
        loading={summaryLoading}
        onClick={() => onCardClick?.("records")}
      />
      <StatCard
        label="Days Uploaded"
        value={`${summary?.daysUploaded ?? 0}/${summary?.totalDaysInRange ?? "-"}`}
        hint="Distinct dates uploaded — click to view calendar"
        icon={ClipboardList}
        tone="gray"
        loading={summaryLoading}
        onClick={() => onCardClick?.("calendar")}
      />
    </div>
  );
}
