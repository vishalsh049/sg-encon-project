import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { calcYAxis, getChartTheme, getLabelStride } from "../../utils/chartMath";
import { createValueLabel } from "./ValueLabel";

// Bars = daily aggregate uptime (mean across visible entities for that date).
// Line = trailing 7-day moving average of that same aggregate. This is
// intentionally a single overall series, not a per-entity breakdown — use
// Line/Area/Bar for circle-by-circle comparison.
function buildComboData(chartData, entities) {
  const daily = (chartData || []).map(row => {
    const vals = entities.map(e => Number(row[e])).filter(v => v > 0);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return { date: row.date, uptime: avg };
  });

  return daily.map((row, i) => {
    const windowVals = daily.slice(Math.max(0, i - 6), i + 1).map(r => r.uptime).filter(v => v != null);
    const movingAvg = windowVals.length ? windowVals.reduce((a, b) => a + b, 0) / windowVals.length : null;
    return { ...row, movingAvg };
  });
}

export default function ComboChartView({ chartData, entities, hiddenEntities, variant = "compact", dark = false, verticalLabels = false }) {
  const isCompact = variant === "compact";
  const theme = getChartTheme(dark);
  const visibleEntities = entities.filter(e => !hiddenEntities?.has(e));
  // Headroom for rotated labels near the top of the plot (see LineChartView).
  const topMargin = verticalLabels ? (isCompact ? 34 : 46) : 10;

  const data = useMemo(() => buildComboData(chartData, visibleEntities), [chartData, visibleEntities]);
  const stride = getLabelStride(data.length, variant);

  const allVals = useMemo(() =>
    data.flatMap(row => [row.uptime, row.movingAvg]).filter(v => v != null && v > 0),
    [data]
  );

  const { domain, ticks, tickFormatter } = useMemo(() => {
    if (!allVals.length) return { domain: [0, 100], ticks: undefined, tickFormatter: v => `${v}%` };
    return calcYAxis(allVals);
  }, [allVals]);

  if (!data.length) {
    return (
      <div className={`flex ${isCompact ? "h-40" : "h-72"} items-center justify-center rounded-2xl bg-surface-muted`}>
        <p className="text-xs text-text-muted">No data for selected range</p>
      </div>
    );
  }

  return (
    <div className={isCompact ? "h-40 w-full" : "h-[360px] w-full"}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: topMargin, right: isCompact ? 8 : 20, left: isCompact ? -24 : -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 2" stroke={theme.grid} vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: isCompact ? 8 : 11, fill: theme.tick }} axisLine={false} tickLine={false} />
          <YAxis
            domain={domain}
            ticks={ticks}
            tick={{ fontSize: isCompact ? 7.5 : 11, fill: theme.tickDim }}
            axisLine={false}
            tickLine={false}
            width={isCompact ? 28 : 44}
            tickFormatter={tickFormatter}
          />
          <Tooltip
            formatter={(val, name) => [val != null ? `${Number(val).toFixed(2)}%` : "—", name === "uptime" ? "Daily uptime" : "7-day avg"]}
            contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 10px 30px rgba(15,23,42,0.14)", fontSize: 11, background: theme.tooltipBg, color: theme.tooltipText }}
          />
          <Bar dataKey="uptime" name="uptime" fill="#3b82f6" fillOpacity={0.55} radius={[3, 3, 0, 0]} maxBarSize={isCompact ? 14 : 32} isAnimationActive={false}>
            <LabelList dataKey="uptime" content={createValueLabel({ mode: "bar", seriesIndex: 0, stride, variant, dark, vertical: verticalLabels, fill: dark ? "#93c5fd" : "#1d4ed8" })} />
          </Bar>
          <Line dataKey="movingAvg" name="movingAvg" type="monotone" stroke="#f59e0b" strokeWidth={isCompact ? 1.75 : 2.25} dot={false} connectNulls isAnimationActive={false}>
            <LabelList dataKey="movingAvg" content={createValueLabel({ mode: "point", seriesIndex: 2, stride, variant, dark, vertical: verticalLabels, fill: dark ? "#fcd34d" : "#b45309" })} />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
      {!isCompact && (
        <div className="mt-2 flex items-center gap-4 text-[11px] text-text-muted">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-500/60" /> Daily uptime</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded bg-amber-500" /> 7-day moving average</span>
        </div>
      )}
    </div>
  );
}
