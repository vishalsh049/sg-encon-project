// Compute a fully dynamic Y-axis: nice round tick positions that zoom in on
// the actual data range so small differences between series are clearly visible.
export function calcYAxis(vals, targetTickCount = 7) {
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;

  // Pad 20 % above and below (minimum 0.05 absolute so a flat line still shows)
  const pad   = Math.max(range * 0.2, 0.05);
  const rawLo = min - pad;
  const rawHi = max + pad;

  // Pick a "nice" step size (1, 2, or 5 × a power of 10)
  const rawStep = (rawHi - rawLo) / (targetTickCount - 1);
  const exp     = Math.floor(Math.log10(rawStep));
  const mag     = Math.pow(10, exp);
  const norm    = rawStep / mag;
  const niceStep =
    norm <= 1 ? mag :
    norm <= 2 ? 2 * mag :
    norm <= 5 ? 5 * mag : 10 * mag;

  // Snap domain boundaries to the step grid
  const lo = Math.floor(rawLo / niceStep) * niceStep;
  const hi = Math.ceil(rawHi  / niceStep) * niceStep;

  // Decimal places to show on tick labels
  const dp    = niceStep < 1 ? Math.max(0, -Math.floor(Math.log10(niceStep))) : 0;
  const count = Math.round((hi - lo) / niceStep);

  const ticks = Array.from({ length: count + 1 }, (_, i) =>
    parseFloat((lo + i * niceStep).toFixed(dp + 2))
  ).filter(t => t >= 0 && t <= 100);

  return {
    domain:        [Math.max(0, parseFloat(lo.toFixed(dp + 2))), Math.min(100, parseFloat(hi.toFixed(dp + 2)))],
    ticks,
    tickFormatter: v => `${Number(v).toFixed(dp)}%`,
  };
}

// Fixed display order for known circles; anything else sorts alphabetically after.
export const CIRCLE_ORDER = ["Delhi", "Haryana", "Punjab", "UP East"];

export function orderEntities(entities) {
  const known = CIRCLE_ORDER.filter(c => (entities || []).includes(c));
  const extra = (entities || []).filter(c => !CIRCLE_ORDER.includes(c)).sort();
  return [...known, ...extra];
}

export const CHART_COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#64748b",
];

const CIRCLE_COLORS_MAP = {
  "Punjab":  "#3b82f6",
  "Delhi":   "#22c55e",
  "Haryana": "#f59e0b",
  "UP East": "#8b5cf6",
};

export function getEntityColor(name, index) {
  return CIRCLE_COLORS_MAP[name] || CHART_COLORS[index % CHART_COLORS.length];
}

// Recharts renders raw SVG, so grid/tick colors need real hex values per
// theme rather than Tailwind dark: classes.
export function getChartTheme(isDark) {
  return isDark
    ? { grid: "#1e293b", tick: "#64748b", tickDim: "#475569", tooltipBg: "rgba(15,23,42,0.97)", tooltipText: "#e2e8f0" }
    : { grid: "#f1f5f9", tick: "#94a3b8", tickDim: "#cbd5e1", tooltipBg: "rgba(255,255,255,0.97)", tooltipText: "#334155" };
}

// Shared "always 2 decimals + %" formatting for on-chart value labels.
export function formatPercentLabel(value) {
  const n = Number(value);
  return value != null && Number.isFinite(n) ? `${n.toFixed(2)}%` : "";
}

// Enterprise dashboards (Grafana/Datadog/Power BI) thin dense value labels
// rather than rendering an unreadable pile of overlapping text — show every
// point when there's room, then progressively skip points as the series
// gets denser. Returns a stride: render every Nth point's label.
export function getLabelStride(pointCount, variant) {
  const maxLabels = variant === "compact" ? 10 : 20;
  if (!pointCount || pointCount <= maxLabels) return 1;
  return Math.ceil(pointCount / maxLabels);
}
