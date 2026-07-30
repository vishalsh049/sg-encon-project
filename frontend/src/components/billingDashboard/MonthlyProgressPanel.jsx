import React from "react";
import { TrendingUp, TrendingDown, Percent, Sparkles } from "lucide-react";
import { SECTION_HEADING, statusColor } from "./theme";
import MetricTooltip from "./MetricTooltip";

export default function MonthlyProgressPanel({ chartData, avgCompletion, aiSummary, bestMonth, worstMonth, circleStats }) {
  const totals = circleStats.reduce(
    (acc, r) => ({ done: acc.done + r.done, pending: acc.pending + r.pending, total: acc.total + r.total }),
    { done: 0, pending: 0, total: 0 }
  );
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 px-1">
        <h3 className={`${SECTION_HEADING} text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5`}>
          Billing Insights
          <MetricTooltip text="Genuine month-by-month billing completion trend, built from real billing_status records." />
        </h3>
        <div className="h-1 w-28 rounded-full bg-gradient-to-r from-emerald-500/40 via-indigo-500/40 to-amber-400/30" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        {/* STAT CHIPS */}
        <div className="xl:col-span-3 space-y-3">
          <div className="rounded-2xl border border-border-color/60 bg-surface/70 backdrop-blur p-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-semibold tracking-[0.30em] uppercase text-text-muted">Avg Completion</div>
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-1 text-emerald-700 dark:text-emerald-400">
                <Percent size={12} />
              </div>
            </div>
            <div className="text-[18px] font-bold text-emerald-700 dark:text-emerald-400">{avgCompletion}%</div>
          </div>

          <div className="rounded-2xl border border-border-color/60 bg-surface/70 backdrop-blur p-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-semibold tracking-[0.24em] uppercase text-text-muted">Best Month</div>
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-1 text-emerald-700 dark:text-emerald-400">
                <TrendingUp size={12} />
              </div>
            </div>
            <div className="text-[15px] font-semibold text-text-primary">{bestMonth?.month || "-"}</div>
            <div className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              {bestMonth ? `${bestMonth.percent}% done` : ""}
            </div>
          </div>

          <div className="rounded-2xl border border-border-color/60 bg-surface/70 backdrop-blur p-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-semibold tracking-[0.24em] uppercase text-text-muted">Needs Attention</div>
              <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-1 text-rose-700 dark:text-rose-400">
                <TrendingDown size={12} />
              </div>
            </div>
            <div className="text-[15px] font-semibold text-text-primary">{worstMonth?.month || "-"}</div>
            <div className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
              {worstMonth ? `${worstMonth.percent}% done` : ""}
            </div>
          </div>

          <div className="rounded-2xl border border-indigo-100 dark:border-indigo-500/20 bg-indigo-50/60 dark:bg-indigo-500/10 p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.2em] uppercase text-indigo-700 dark:text-indigo-400">
              <Sparkles size={11} /> Summary
            </div>
            <div className="mt-1 text-xs text-text-secondary leading-4">{aiSummary}</div>
          </div>
        </div>

        {/* DONE VS PENDING */}
        <div className="xl:col-span-5 rounded-2xl border border-border-color/80 bg-gradient-to-br from-white to-surface-muted/70 dark:from-surface dark:to-surface-muted/40 backdrop-blur-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-border-color">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-text-secondary">Done vs Pending</div>
              <div className="text-xs text-text-muted">Circle-wise billing completion analytics</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">Live</div>
            </div>
          </div>

          <div className="p-2">
            <div className="overflow-hidden rounded-2xl border border-border-color bg-surface/70">
              <div className="grid grid-cols-4 bg-surface-muted border-b border-border-color">
                <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-[0.20em] text-text-muted">Circle</div>
                <div className="px-4 py-2 border-l border-border-color text-[11px] font-bold uppercase tracking-[0.20em] text-emerald-700 dark:text-emerald-400">Done</div>
                <div className="px-4 py-2 border-l border-border-color text-[11px] font-bold uppercase tracking-[0.20em] text-rose-600 dark:text-rose-400">Pending</div>
                <div className="px-4 py-2 border-l border-border-color text-[11px] font-bold uppercase tracking-[0.20em] text-indigo-700 dark:text-indigo-400">Total</div>
              </div>

              {circleStats.map((row) => (
                <div
                  key={row.circle}
                  className="grid grid-cols-4 border-b border-border-color last:border-b-0 hover:bg-surface-muted/70 transition-all duration-200"
                >
                  <div className="px-4 py-2 flex items-center text-sm font-semibold text-text-secondary">{row.circle}</div>
                  <div className="px-4 py-2 border-l border-border-color flex items-center text-sm font-semibold text-emerald-700 dark:text-emerald-400">{row.done}</div>
                  <div className="px-4 py-2 border-l border-border-color flex items-center text-sm font-semibold text-rose-600 dark:text-rose-400">{row.pending}</div>
                  <div className="px-4 py-2 border-l border-border-color flex items-center text-sm font-semibold text-indigo-700 dark:text-indigo-400">{row.total}</div>
                </div>
              ))}

              {circleStats.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-text-muted">No circle data available.</div>
              )}

              <div className="grid grid-cols-4 bg-surface-muted border-t border-border-color">
                <div className="px-4 py-1 text-sm font-semibold uppercase tracking-[0.10em] text-text-secondary">Total</div>
                <div className="px-4 py-1 border-l border-border-color text-sm font-semibold text-emerald-700 dark:text-emerald-400">{totals.done}</div>
                <div className="px-4 py-1 border-l border-border-color text-sm font-semibold text-rose-600 dark:text-rose-400">{totals.pending}</div>
                <div className="px-4 py-1 border-l border-border-color text-sm font-semibold text-indigo-700 dark:text-indigo-400">{totals.total}</div>
              </div>
            </div>
          </div>
        </div>

        {/* MONTHLY LIST */}
        <div className="xl:col-span-4 h-[290px] rounded-2xl border border-border-color/60 bg-surface/60 backdrop-blur p-4 overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.24em] uppercase text-cyan-700 dark:text-cyan-400">Monthly Progress</div>
              <div className="text-xs text-text-muted">Completion overview</div>
            </div>
            <div className="h-2 w-2 rounded-full bg-cyan-500/70" />
          </div>

          <div className="space-y-1.5 h-[220px] overflow-y-auto pr-1 custom-scrollbar">
            {chartData.map((item) => {
              const status = statusColor(item.percent);
              return (
                <div key={item.month} className="rounded-2xl border border-border-color/50 bg-surface/70 px-3 py-2">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm font-semibold text-text-secondary">{item.month}</div>
                      <div className="text-xs text-text-muted mt-1">{item.done} Done • {item.pending} Pending</div>
                    </div>
                    <div className={`text-sm font-bold ${status.text}`}>{item.percent}%</div>
                  </div>
                  <div className={`h-1 rounded-full overflow-hidden ${status.bg}`}>
                    <div className={`h-full rounded-full ${status.bar}`} style={{ width: `${item.percent}%` }} />
                  </div>
                </div>
              );
            })}

            {chartData.length === 0 && (
              <div className="text-xs text-text-muted text-center py-8">No billing data for the selected filters.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
