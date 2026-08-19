import React from "react";
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from "recharts";

const NO_DATA_COLOR = "#e2e8f0";

function CustomTooltip({ active, payload, unit }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div className="rounded-2xl border border-border-color bg-surface-elevated px-3 py-2 text-xs shadow-panel">
      <div className="font-semibold text-text-primary">{point.month}</div>
      {point.hasData ? (
        <div className="mt-0.5 text-text-secondary">₹ {point.realValue} {unit}</div>
      ) : (
        <div className="mt-0.5 text-text-muted italic">No data available</div>
      )}
    </div>
  );
}

/**
 * Month-by-month bar chart driven by the Last 3/6/12 Months filter.
 * Only the latest uploaded billing month has a real figure (see backend note
 * in BillingDashboard.jsx) — every other month renders as a short muted
 * "no data" bar rather than a misleading 0. `unit` is a display label only —
 * callers are responsible for pre-scaling `series[].value` to match it
 * (e.g. divide by 1e7 for "Cr", by 1e5 for "L").
 */
export default function TrendChart({ series, color, barSize, emptyStateLabel, unit = "Cr" }) {
  const hasAnyRealData = series.some((d) => d.hasData);
  const realValues = series.filter((d) => d.hasData).map((d) => d.value);
  const maxReal = realValues.length ? Math.max(...realValues) : 0;
  const noDataHeight = maxReal > 0 ? Number((maxReal * 0.06).toFixed(2)) : 0.3;

  const resolvedBarSize = barSize || (series.length >= 12 ? 14 : series.length >= 6 ? 20 : 28);

  const plotData = series.map((d) => ({
    month: d.month,
    hasData: d.hasData,
    realValue: d.value,
    plotValue: d.hasData ? d.value : noDataHeight,
  }));

  return (
    <div>
      {!hasAnyRealData && emptyStateLabel && (
        <div className="mb-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
          No data in this range — latest available: <span className="font-semibold">{emptyStateLabel}</span>
        </div>
      )}
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={plotData}>
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
            <YAxis width={28} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <Tooltip cursor={{ fill: "rgba(15,23,42,0.04)" }} content={<CustomTooltip unit={unit} />} />
            <Bar dataKey="plotValue" radius={[10, 10, 0, 0]} barSize={resolvedBarSize} isAnimationActive animationDuration={700}>
              {plotData.map((entry, i) => (
                <Cell key={i} fill={entry.hasData ? color : NO_DATA_COLOR} fillOpacity={entry.hasData ? 1 : 0.7} />
              ))}
              <LabelList
                dataKey="realValue"
                position="top"
                formatter={(value) => (value == null ? "" : value)}
                style={{ fontSize: 11, fill: color, fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
