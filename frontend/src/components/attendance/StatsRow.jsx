import { Users, CheckCircle2, XCircle, CalendarClock, ClipboardList, Percent } from "lucide-react";

const TONE_CLASSES = {
  blue: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10",
  green: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10",
  red: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10",
  amber: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10",
  gray: "text-text-secondary bg-surface-muted",
};

function StatCard({ label, value, hint, icon: Icon, tone = "blue" }) {
  return (
    <div className="rounded-2xl border border-border-color/70 bg-surface/70 backdrop-blur-xl p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wide text-text-muted">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${TONE_CLASSES[tone]}`}>
          {Icon && <Icon size={16} />}
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold text-text-primary">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-text-muted">{hint}</p>}
    </div>
  );
}

// Six cards, each with a one-line hint, so the numbers are self-explanatory
// on the page itself instead of requiring anyone to ask what they mean.
export default function StatsRow({ summary, summaryLoading }) {
  const marked = (summary?.present ?? 0) + (summary?.absent ?? 0) + (summary?.leave ?? 0);
  const rate = marked > 0 ? Math.round(((summary?.present ?? 0) / marked) * 100) : null;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      <StatCard
        label="Total Employees"
        value={summaryLoading ? "..." : summary?.totalEmployees ?? 0}
        hint="Active in Physical master"
        icon={Users}
        tone="blue"
      />
      <StatCard
        label="Present"
        value={summaryLoading ? "..." : summary?.present ?? 0}
        hint="Marked Present this month"
        icon={CheckCircle2}
        tone="green"
      />
      <StatCard
        label="Absent"
        value={summaryLoading ? "..." : summary?.absent ?? 0}
        hint="Marked Absent this month"
        icon={XCircle}
        tone="red"
      />
      <StatCard
        label="Leave"
        value={summaryLoading ? "..." : summary?.leave ?? 0}
        hint="Marked Leave this month"
        icon={CalendarClock}
        tone="amber"
      />
      <StatCard
        label="Attendance Rate"
        value={summaryLoading ? "..." : rate === null ? "-" : `${rate}%`}
        hint="Present ÷ all marked days"
        icon={Percent}
        tone="green"
      />
      <StatCard
        label="Days Uploaded"
        value={summaryLoading ? "..." : `${summary?.daysUploaded ?? 0}/${summary?.totalDaysInMonth ?? "-"}`}
        hint="Distinct dates uploaded this month"
        icon={ClipboardList}
        tone="gray"
      />
    </div>
  );
}
