import { useMemo } from "react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

// Compact trend strip: big number (latest aggregate uptime) + a minimal
// inline sparkline + day-over-day delta. Aggregates across visible entities
// per date — same "overall" series Combo uses — since a sparkline card has
// no room for a per-circle legend/breakdown.
export default function SparklineView({ chartData, entities, hiddenEntities }) {
  const visibleEntities = entities.filter(e => !hiddenEntities?.has(e));

  const series = useMemo(() => {
    return (chartData || []).map(row => {
      const vals = visibleEntities.map(e => Number(row[e])).filter(v => v > 0);
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      return { date: row.date, uptime: avg };
    });
  }, [chartData, visibleEntities]);

  const withValues = series.filter(r => r.uptime != null);
  const latest = withValues[withValues.length - 1]?.uptime ?? null;
  const prev = withValues[withValues.length - 2]?.uptime ?? null;
  const delta = latest != null && prev != null ? latest - prev : null;

  const trendUp = delta != null && delta > 0.001;
  const trendDown = delta != null && delta < -0.001;
  const TrendIcon = trendUp ? TrendingUp : trendDown ? TrendingDown : Minus;
  const trendColor = trendUp ? "text-emerald-500" : trendDown ? "text-rose-500" : "text-text-muted";
  const lineColor = trendDown ? "#ef4444" : "#3b82f6";

  if (!withValues.length) {
    return (
      <div className="flex h-16 items-center justify-center rounded-2xl bg-surface-muted">
        <p className="text-xs text-text-muted">No data for selected range</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-2xl font-bold tracking-tight text-text-primary">{latest.toFixed(2)}%</p>
        <div className={`mt-0.5 flex items-center gap-1 text-xs font-semibold ${trendColor}`}>
          <TrendIcon className="h-3 w-3" />
          {delta != null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}%` : "No change data"}
        </div>
      </div>
      <div className="h-12 w-24 flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
            <Line
              type="monotone"
              dataKey="uptime"
              stroke={lineColor}
              strokeWidth={1.75}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
