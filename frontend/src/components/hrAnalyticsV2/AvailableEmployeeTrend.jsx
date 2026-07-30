import React from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Users } from "lucide-react";
import { CARD_SHELL, SECTION_HEADING } from "../billingDashboard/theme";

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-border-color bg-surface-elevated px-3 py-2 text-xs shadow-panel">
      <div className="font-semibold text-text-primary">{label}</div>
      <div className="mt-0.5 text-text-secondary">{payload[0].value} available</div>
    </div>
  );
}

// Trailing month-end Available (Physical active headcount, reconstructed
// from date_of_joining / resigned_date) — same series backend/routes/
// hrAnalyticsV2Routes.js's /overview already computes for KPI trends.
export default function AvailableEmployeeTrend({ monthlyTrend, loading }) {
  const series = monthlyTrend || [];
  const latest = series[series.length - 1];
  const previous = series[series.length - 2];
  const change = latest && previous ? latest.activeEmployees - previous.activeEmployees : null;

  return (
    <div className={`${CARD_SHELL} p-5`}>
      <h2 className={`${SECTION_HEADING} mb-4 text-cyan-600 dark:text-cyan-400 flex items-center gap-1.5`}>
        <Users size={14} /> Available Employee Trend
      </h2>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-surface-muted" />
      ) : !series.length ? (
        <div className="rounded-xl bg-surface-muted p-6 text-center text-sm text-text-muted">
          No trend data for the current filters.
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-surface-muted/60 py-3 text-center">
              <div className="text-lg font-bold text-text-primary">{latest?.activeEmployees ?? 0}</div>
              <div className="text-[9px] font-semibold uppercase tracking-wide text-text-muted">Available Now</div>
            </div>
            <div className="rounded-lg bg-surface-muted/60 py-3 text-center">
              <div className={`text-lg font-bold ${change > 0 ? "text-emerald-600 dark:text-emerald-400" : change < 0 ? "text-rose-600 dark:text-rose-400" : "text-text-primary"}`}>
                {change == null ? "—" : change > 0 ? `+${change}` : change}
              </div>
              <div className="text-[9px] font-semibold uppercase tracking-wide text-text-muted">Vs Previous Month</div>
            </div>
            <div className="rounded-lg bg-surface-muted/60 py-3 text-center">
              <div className="text-lg font-bold text-text-primary">{series.length}</div>
              <div className="text-[9px] font-semibold uppercase tracking-wide text-text-muted">Months Shown</div>
            </div>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="availableTrendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 2" vertical={false} stroke="rgba(148,163,184,0.25)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={36} allowDecimals={false} domain={["auto", "auto"]} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#06b6d4", strokeWidth: 1 }} />
                <Area
                  type="monotone"
                  dataKey="activeEmployees"
                  stroke="#0891b2"
                  strokeWidth={2}
                  fill="url(#availableTrendFill)"
                  isAnimationActive
                  animationDuration={600}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
