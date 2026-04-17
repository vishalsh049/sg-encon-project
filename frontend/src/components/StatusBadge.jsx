function StatusBadge({ status }) {
  const normalizedStatus = String(status || "").trim().toLowerCase();

  const styles = {
    active: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    inactive: "bg-slate-100 text-slate-600 ring-slate-200",
    planned: "bg-amber-50 text-amber-700 ring-amber-100",
    dark: "bg-slate-100 text-slate-600 ring-slate-200",
    fault: "bg-rose-50 text-rose-700 ring-rose-100",
  };

  return (
    <span
      className={`inline-flex min-w-[84px] items-center justify-center rounded-full px-3 py-1.5 text-xs font-medium capitalize ring-1 ${styles[normalizedStatus] || styles.dark}`}
    >
      {status || "Unknown"}
    </span>
  );
}

export default StatusBadge;
