// Single source of truth for how each attendance code is labeled and
// colored, shared by the Status filter's legend and the Records table's
// badges so they can never fall out of sync with each other.
export const ATTENDANCE_STATUS_META = {
  P: { label: "Present", badgeClass: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", dotClass: "bg-emerald-500" },
  A: { label: "Absent", badgeClass: "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400", dotClass: "bg-rose-500" },
  L: { label: "Leave", badgeClass: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500" },
};

export const ATTENDANCE_STATUS_OPTIONS = Object.entries(ATTENDANCE_STATUS_META).map(
  ([value, meta]) => ({ value, label: meta.label })
);
