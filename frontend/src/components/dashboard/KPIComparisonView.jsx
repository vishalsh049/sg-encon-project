import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getChartTheme } from "../../utils/chartMath";
import { getHealthStatus } from "../../utils/kpiHealth";

const COLOR_HEX = {
  blue: "#3b82f6", emerald: "#22c55e", violet: "#8b5cf6",
  orange: "#f59e0b", cyan: "#06b6d4", rose: "#f43f5e",
};

// Compares the 6 KPIs against each other (not circles within one KPI) — a
// fundamentally different axis than the per-card charts, so this replaces
// the card grid entirely rather than rendering inside ChartRenderer.
export default function KPIComparisonView({ towerCards, dark = false }) {
  const theme = getChartTheme(dark);

  const data = useMemo(() =>
    towerCards
      .map(c => ({ name: c.name, value: parseFloat(c.uptime) || 0, color: COLOR_HEX[c.color] || "#3b82f6" }))
      .sort((a, b) => b.value - a.value),
    [towerCards]
  );

  if (!data.length) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl border border-border-color bg-surface">
        <p className="text-sm text-text-muted">No KPI data available</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border-color bg-surface p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">KPI Comparison — Overall Uptime</h3>
      <div className="h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="2 2" stroke={theme.grid} horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: theme.tick }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: theme.tickDim, fontWeight: 600 }} axisLine={false} tickLine={false} width={70} />
            <Tooltip
              formatter={val => [`${Number(val).toFixed(2)}%`, "Uptime"]}
              contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 10px 30px rgba(15,23,42,0.14)", fontSize: 12, background: theme.tooltipBg, color: theme.tooltipText }}
            />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={28} isAnimationActive={false}>
              {data.map(d => <Cell key={d.name} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {data.map(d => {
          const health = getHealthStatus(d.value);
          return (
            <div key={d.name} className="rounded-xl border border-border-color bg-surface-muted px-3 py-2">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-xs font-semibold text-text-primary">{d.name}</span>
                <span className="ml-auto text-xs" title={health.label}>{health.emoji}</span>
              </div>
              <p className="mt-1 text-sm font-bold text-text-primary">{d.value.toFixed(2)}%</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
