// Shared design tokens for the Billing Dashboard.
// One accent per concept everywhere (spec: "No random colors. Maintain one design system.")

export const ACCENTS = {
  revenue: {
    key: "revenue",
    label: "text-emerald-700 dark:text-emerald-400",
    soft: "bg-emerald-50 dark:bg-emerald-500/10",
    border: "border-emerald-200 dark:border-emerald-500/20",
    ring: "ring-emerald-500/20",
    gradient: "from-emerald-500 to-emerald-400",
    chart: { from: "#10b981", to: "#6ee7b7", solid: "#059669" },
  },
  pmLoss: {
    key: "pmLoss",
    label: "text-indigo-700 dark:text-indigo-400",
    soft: "bg-indigo-50 dark:bg-indigo-500/10",
    border: "border-indigo-200 dark:border-indigo-500/20",
    ring: "ring-indigo-500/20",
    gradient: "from-indigo-500 to-indigo-400",
    chart: { from: "#4f46e5", to: "#a5b4fc", solid: "#4338ca" },
  },
  penalty: {
    key: "penalty",
    label: "text-rose-700 dark:text-rose-400",
    soft: "bg-rose-50 dark:bg-rose-500/10",
    border: "border-rose-200 dark:border-rose-500/20",
    ring: "ring-rose-500/20",
    gradient: "from-rose-500 to-rose-400",
    chart: { from: "#ef4444", to: "#fca5a5", solid: "#dc2626" },
  },
  pending: {
    key: "pending",
    label: "text-amber-700 dark:text-amber-400",
    soft: "bg-amber-50 dark:bg-amber-500/10",
    border: "border-amber-200 dark:border-amber-500/20",
    ring: "ring-amber-500/20",
    gradient: "from-amber-500 to-amber-400",
    chart: { from: "#f59e0b", to: "#fcd34d", solid: "#d97706" },
  },
  completed: {
    key: "completed",
    label: "text-emerald-700 dark:text-emerald-400",
    soft: "bg-emerald-50 dark:bg-emerald-500/10",
    border: "border-emerald-200 dark:border-emerald-500/20",
    ring: "ring-emerald-500/20",
    gradient: "from-emerald-500 to-emerald-400",
    chart: { from: "#10b981", to: "#6ee7b7", solid: "#059669" },
  },
  neutral: {
    key: "neutral",
    label: "text-slate-700 dark:text-slate-300",
    soft: "bg-slate-50 dark:bg-slate-500/10",
    border: "border-slate-200 dark:border-slate-500/20",
    ring: "ring-slate-500/20",
    gradient: "from-slate-500 to-slate-400",
    chart: { from: "#64748b", to: "#cbd5e1", solid: "#475569" },
  },
  indigoAccent: {
    key: "indigoAccent",
    label: "text-violet-700 dark:text-violet-400",
    soft: "bg-violet-50 dark:bg-violet-500/10",
    border: "border-violet-200 dark:border-violet-500/20",
    ring: "ring-violet-500/20",
    gradient: "from-violet-500 to-violet-400",
    chart: { from: "#7c3aed", to: "#c4b5fd", solid: "#6d28d9" },
  },
};

// Domain-wise fixed colors so FTTx/Fiber/Tower always render the same hue.
export const DOMAIN_COLORS = {
  FTTx: ACCENTS.revenue.chart.solid,
  Fiber: ACCENTS.pmLoss.chart.solid,
  Tower: ACCENTS.indigoAccent.chart.solid,
};

// Shared premium card shell — glassmorphism + soft shadow + hover lift.
export const CARD_SHELL =
  "rounded-2xl border border-border-color/60 bg-surface/70 backdrop-blur-xl shadow-panel " +
  "transition-all duration-300 hover:shadow-[0_24px_60px_rgba(15,23,42,0.12)] hover:-translate-y-0.5";

export const SECTION_HEADING =
  "text-[12px] font-semibold tracking-[0.30em] uppercase";

export function statusColor(percent) {
  if (percent >= 80) {
    return { text: "text-emerald-700 dark:text-emerald-400", bar: "bg-emerald-500", bg: "bg-emerald-100 dark:bg-emerald-500/15", badge: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20", label: "On Track" };
  }
  if (percent >= 60) {
    return { text: "text-indigo-700 dark:text-indigo-400", bar: "bg-indigo-500", bg: "bg-indigo-100 dark:bg-indigo-500/15", badge: "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20", label: "In Progress" };
  }
  if (percent >= 40) {
    return { text: "text-amber-700 dark:text-amber-400", bar: "bg-amber-500", bg: "bg-amber-100 dark:bg-amber-500/15", badge: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20", label: "At Risk" };
  }
  return { text: "text-rose-700 dark:text-rose-400", bar: "bg-rose-500", bg: "bg-rose-100 dark:bg-rose-500/15", badge: "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/20", label: "Critical" };
}

export function formatCr(value) {
  return `₹ ${(Number(value || 0) / 10000000).toFixed(2)} Cr`;
}
