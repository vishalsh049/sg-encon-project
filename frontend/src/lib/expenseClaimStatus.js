// Single source of truth for Expense Claim status labels, badge styling and the
// horizontal progress tracker. Used by every Expense Claims screen.

export const STATUS_META = {
  draft: {
    label: "Draft",
    dot: "bg-slate-400",
    className:
      "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/20",
  },
  pending_l1: {
    label: "Pending L1",
    dot: "bg-amber-500",
    className:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
  },
  pending_l2: {
    label: "Pending L2",
    dot: "bg-violet-500",
    className:
      "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20",
  },
  pending_final: {
    label: "Pending Final Approval",
    dot: "bg-orange-500",
    className:
      "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20",
  },
  final_approved: {
    label: "Final Approved",
    dot: "bg-emerald-500",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
  },
  pending_finance: {
    label: "Pending Finance",
    dot: "bg-sky-500",
    className:
      "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20",
  },
  processing: {
    label: "Processing",
    dot: "bg-indigo-500",
    className:
      "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20",
  },
  on_hold: {
    label: "On Hold",
    dot: "bg-slate-500",
    className:
      "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/20",
  },
  completed: {
    label: "Completed",
    dot: "bg-emerald-500",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
  },
  rejected: {
    label: "Rejected",
    dot: "bg-rose-500",
    className:
      "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20",
  },
  returned: {
    label: "Returned",
    dot: "bg-amber-600",
    className:
      "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30",
  },
};

export const FINANCE_STATUS_META = {
  pending: { label: "Pending Processing", className: STATUS_META.pending_finance.className, dot: "bg-sky-500" },
  processing: { label: "Processing", className: STATUS_META.processing.className, dot: "bg-indigo-500" },
  processed: { label: "Processed", className: STATUS_META.completed.className, dot: "bg-emerald-500" },
  on_hold: { label: "On Hold", className: STATUS_META.on_hold.className, dot: "bg-slate-500" },
};

export function financeStatusMeta(status) {
  return FINANCE_STATUS_META[status] || FINANCE_STATUS_META.pending;
}

export function statusMeta(status) {
  return STATUS_META[status] || {
    label: status || "Unknown",
    dot: "bg-slate-400",
    className:
      "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/20",
  };
}

// Ordered stages for the progress tracker.
export const TRACKER_STEPS = [
  { key: "raised", label: "Raised" },
  { key: "l1", label: "L1 Approved" },
  { key: "l2", label: "L2 Approved" },
  { key: "final", label: "Final Approved" },
  { key: "finance", label: "Finance Processing" },
  { key: "completed", label: "Completed" },
];

// How far along a claim is: index of the step currently in progress.
// Anything before it is complete; anything after is pending.
const STATUS_TO_STEP = {
  draft: 0,
  returned: 0,
  pending_l1: 1,
  pending_l2: 2,
  pending_final: 3,
  final_approved: 4,
  pending_finance: 4,
  processing: 4,
  on_hold: 4,
  completed: 6,
  rejected: -1,
};

export function trackerState(status) {
  const activeIndex = STATUS_TO_STEP[status] ?? 0;
  return TRACKER_STEPS.map((step, index) => {
    if (status === "rejected") {
      return { ...step, state: index === 0 ? "done" : "rejected" };
    }
    if (index < activeIndex) return { ...step, state: "done" };
    if (index === activeIndex) return { ...step, state: "current" };
    return { ...step, state: "pending" };
  });
}
