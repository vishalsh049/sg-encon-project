import React, { useMemo } from "react";
import { IndianRupee, ChartColumn } from "lucide-react";
import { formatCr } from "./theme";
import MetricTooltip from "./MetricTooltip";
import TrendChart from "./TrendChart";

export default function RevenueAnalyticsCard({ revenueKpi, summary, insight, loading, trendSeries, latestBillingMonthLabel }) {
  const domainData = useMemo(
    () => [
      { domain: "FTTx", cm: Number(summary?.fttx_cm || 0), pm: Number(summary?.fttx_pm || 0) },
      { domain: "Fiber", cm: Number(summary?.fiber_cm || 0), pm: Number(summary?.fiber_pm || 0) },
      { domain: "Tower", cm: Number(summary?.tower_cm || 0), pm: Number(summary?.tower_pm || 0) },
    ],
    [summary]
  );

  return (
    <div className="p-5">
      {/* HEADER */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] tracking-[0.35em] font-bold text-emerald-700 dark:text-emerald-400 uppercase">
            Revenue
            <MetricTooltip text="Total approved billing revenue (CM + PM) for the latest uploaded billing month." />
          </div>

          <div className="mt-2 text-sm tracking-[0.14em] text-text-muted">Total Revenue</div>

          {loading ? (
            <div className="mt-1 h-7 w-28 animate-pulse rounded-md bg-surface-muted" />
          ) : (
            <div className="mt-1 text-[22px] font-semibold tracking-[-0.05em] text-emerald-700 dark:text-emerald-400">
              {formatCr(revenueKpi.totalRevenue)}
            </div>
          )}

          <div className="mt-2 text-emerald-600 dark:text-emerald-400 text-xs">
            {insight || "Synced from revenue KPI API"}
          </div>
        </div>

        <div className="h-8 w-8 shrink-0 rounded-full border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-700 dark:text-emerald-400">
          <IndianRupee size={14} />
        </div>
      </div>

      {/* TREND */}
      <div className="mt-4 rounded-2xl border border-border-color p-4">
        <div className="mb-4 text-[10px] tracking-[0.28em] font-semibold uppercase text-emerald-700 dark:text-emerald-400">
          Revenue Trend
        </div>

        <TrendChart series={trendSeries} color="#10b981" emptyStateLabel={latestBillingMonthLabel} />
      </div>

      {/* BREAKDOWN */}
      <div className="mt-4 rounded-2xl border border-emerald-100 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center text-emerald-700 dark:text-emerald-400">
              <ChartColumn size={14} />
            </div>
            <div>
              <div className="text-[12px] font-semibold tracking-[0.26em] uppercase text-emerald-700 dark:text-emerald-400">
                Revenue Breakdown
              </div>
              <div className="text-[12px] tracking-[0.10em] text-text-muted mt-1">Domain-wise revenue distribution</div>
            </div>
          </div>

          <div className="text-[10px] px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20">
            LIVE
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border-color">
          <div className="grid grid-cols-3 bg-surface-muted border-b border-border-color">
            <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">Domain</div>
            <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400 border-l border-border-color">CM Revenue</div>
            <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700 dark:text-violet-400 border-l border-border-color">PM Revenue</div>
          </div>

          {domainData.map((row, idx) => (
            <div
              key={row.domain}
              className={`grid grid-cols-3 ${idx < domainData.length - 1 ? "border-b border-border-color" : ""}`}
            >
              <div className="p-3 text-xs font-semibold text-text-secondary">{row.domain}</div>
              <div className="p-3 text-xs font-semibold text-emerald-700 dark:text-emerald-400 border-l border-border-color">{formatCr(row.cm)}</div>
              <div className="p-3 text-xs font-semibold text-violet-700 dark:text-violet-400 border-l border-border-color">{formatCr(row.pm)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
