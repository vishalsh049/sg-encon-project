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
    label: "In Finance",
    dot: "bg-emerald-500",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
  },
  // Legacy statuses — no claim reaches these any more (Finance is read-only),
  // but old records may still carry them, so keep labels for display.
  processing: {
    label: "In Finance",
    dot: "bg-emerald-500",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
  },
  on_hold: {
    label: "In Finance",
    dot: "bg-emerald-500",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
  },
  completed: {
    label: "In Finance",
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

export function statusMeta(status) {
  return STATUS_META[status] || {
    label: status || "Unknown",
    dot: "bg-slate-400",
    className:
      "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/20",
  };
}

// --- Advance Payment workflow — the two extra status dimensions ---------------
// Approval status is the claim's own current_status (STATUS_META above).

const NEUTRAL =
  "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/20";
const AMBER =
  "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20";
const GREEN =
  "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20";
const VIOLET =
  "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20";
const ORANGE =
  "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20";

export const PAYMENT_STATUS_META = {
  not_paid: { label: "Not Paid", className: NEUTRAL },
  partially_paid: { label: "Partially Paid", className: AMBER },
  fully_paid: { label: "Fully Paid", className: GREEN },
};

export const CLOSURE_STATUS_META = {
  na: { label: "N/A", className: NEUTRAL },
  open: { label: "Bill Closure Open", className: AMBER },
  under_verification: { label: "Bills Under Verification", className: VIOLET },
  refund_pending: { label: "Refund Pending", className: ORANGE },
  additional_payment_pending: { label: "Additional Payment Pending", className: ORANGE },
  closed: { label: "Closed", className: GREEN },
};

export function paymentStatusMeta(s) {
  return PAYMENT_STATUS_META[s] || { label: s || "—", className: NEUTRAL };
}
export function closureStatusMeta(s) {
  return CLOSURE_STATUS_META[s] || { label: s || "—", className: NEUTRAL };
}

// Advance bill status — reuses the claim status vocabulary plus a terminal
// "approved".
export const BILL_STATUS_META = {
  draft: { label: "Draft", className: NEUTRAL },
  pending_l1: { label: "Pending L1", className: AMBER },
  pending_l2: { label: "Pending L2", className: VIOLET },
  pending_final: { label: "Pending Final", className: ORANGE },
  approved: { label: "Approved", className: GREEN },
  returned: { label: "Returned", className: AMBER },
  rejected: {
    label: "Rejected",
    className:
      "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20",
  },
};
export function billStatusMeta(s) {
  return BILL_STATUS_META[s] || { label: s || "—", className: NEUTRAL };
}

// Ordered stages for the progress tracker. Finance is a read-only destination,
// NOT a processing step — the workflow ends when the claim lands there.
export const TRACKER_STEPS = [
  { key: "raised", label: "Raised" },
  { key: "l1", label: "L1 Approved" },
  { key: "l2", label: "L2 Approved" },
  { key: "final", label: "Final Approved" },
  { key: "finance", label: "Finance / Archived" },
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
  completed: 4,
  rejected: -1,
};

// Statuses that mean the claim has fully cleared final approval and is now in
// Finance — every tracker step (including "Finance") is complete.
const IN_FINANCE = new Set([
  "final_approved",
  "pending_finance",
  "processing",
  "on_hold",
  "completed",
]);

export function trackerState(status) {
  const activeIndex = STATUS_TO_STEP[status] ?? 0;
  const settled = IN_FINANCE.has(status);
  return TRACKER_STEPS.map((step, index) => {
    if (status === "rejected") {
      return { ...step, state: index === 0 ? "done" : "rejected" };
    }
    if (settled) return { ...step, state: "done" };
    if (index < activeIndex) return { ...step, state: "done" };
    if (index === activeIndex) return { ...step, state: "current" };
    return { ...step, state: "pending" };
  });
}
