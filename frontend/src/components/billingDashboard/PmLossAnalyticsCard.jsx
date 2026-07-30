import React, { useMemo } from "react";
import { TrendingDown, PieChart } from "lucide-react";
import { formatCr } from "./theme";
import MetricTooltip from "./MetricTooltip";
import TrendChart from "./TrendChart";

export default function PmLossAnalyticsCard({ summary, trendSeries, latestBillingMonthLabel }) {
  const domainData = useMemo(
    () => [
      { domain: "FTTx", loss: Number(summary?.fttx_loss || 0) },
      { domain: "Fiber", loss: Number(summary?.fiber_loss || 0) },
      { domain: "Tower", loss: Number(summary?.tower_loss || 0) },
    ],
    [summary]
  );

  return (
    <div className="p-5">
      {/* HEADER */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] tracking-[0.35em] font-bold text-indigo-700 dark:text-indigo-400 uppercase">
            PM Loss
            <MetricTooltip text="Revenue deduction due to PM (Preventive Maintenance) issues, for the latest uploaded billing month." />
          </div>

          <div className="mt-2 text-sm tracking-[0.14em] text-text-muted">Total PM Loss</div>

          <div className="mt-1 text-[22px] font-semibold tracking-[-0.05em] text-indigo-700 dark:text-indigo-400">
            {formatCr(summary?.pm_loss)}
          </div>

          <div className="mt-2 text-indigo-600 dark:text-indigo-400 text-xs">Loss due to PM deductions</div>
        </div>

        <div className="h-8 w-8 shrink-0 rounded-full border border-indigo-200 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-700 dark:text-indigo-400">
          <TrendingDown size={14} />
        </div>
      </div>

      {/* TREND */}
      <div className="mt-4 rounded-2xl border border-border-color p-4">
        <div className="mb-4 text-[10px] tracking-[0.28em] font-semibold uppercase text-indigo-700 dark:text-indigo-400">
          PM Loss Trend
        </div>

        <TrendChart series={trendSeries} color="#4f46e5" emptyStateLabel={latestBillingMonthLabel} />
      </div>

      {/* BREAKDOWN */}
      <div className="mt-4 rounded-2xl border border-indigo-100 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/10 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-indigo-100 dark:bg-indigo-500/15 flex items-center justify-center text-indigo-700 dark:text-indigo-400">
              <PieChart size={14} />
            </div>
            <div>
              <div className="text-[12px] font-semibold tracking-[0.26em] uppercase text-indigo-700 dark:text-indigo-400">
                PM Loss Breakdown
              </div>
              <div className="text-[12px] tracking-[0.10em] text-text-muted mt-1">Domain-wise PM loss analysis</div>
            </div>
          </div>

          <div className="text-[10px] px-2 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20">
            LIVE
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border-color">
          <div className="grid grid-cols-2 bg-surface-muted border-b border-border-color">
            <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">Domain</div>
            <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-700 dark:text-indigo-400 border-l border-border-color">PM Loss</div>
          </div>

          {domainData.map((row, idx) => (
            <div
              key={row.domain}
              className={`grid grid-cols-2 ${idx < domainData.length - 1 ? "border-b border-border-color" : ""}`}
            >
              <div className="p-3 text-xs font-semibold text-text-secondary">{row.domain}</div>
              <div className="p-3 text-xs font-semibold text-indigo-700 dark:text-indigo-400 border-l border-border-color">{formatCr(row.loss)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
