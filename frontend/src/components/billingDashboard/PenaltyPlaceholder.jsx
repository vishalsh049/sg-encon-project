import React from "react";
import { AlertTriangle, PieChart, Sparkles } from "lucide-react";
import MetricTooltip from "./MetricTooltip";
import TrendChart from "./TrendChart";

const PLACEHOLDER_ROWS = ["FTTx", "Fiber", "Tower"];

export default function PenaltyPlaceholder({ trendSeries }) {
  return (
    <div className="p-5">
      {/* HEADER */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] tracking-[0.35em] font-bold text-rose-700 dark:text-rose-400 uppercase">
            Penalties
            <MetricTooltip text="Penalty tracking (KPI Penalty / General Penalty) is under development. Figures will appear here once the backend API is live." />
          </div>

          <div className="mt-2 text-sm tracking-[0.14em] text-text-muted">Total Penalties</div>

          <div className="mt-1 text-[22px] font-semibold tracking-[-0.05em] text-rose-700 dark:text-rose-400">
            Coming Soon
          </div>

          <div className="mt-2 text-rose-600 dark:text-rose-400 text-xs">Penalty module under development</div>
        </div>

        <div className="h-8 w-8 shrink-0 rounded-full border border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center text-rose-700 dark:text-rose-400">
          <AlertTriangle size={14} />
        </div>
      </div>

      {/* TREND (no real data yet — every month renders as "no data") */}
      <div className="mt-4 rounded-2xl border border-dashed border-border-strong p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[10px] tracking-[0.28em] font-semibold uppercase text-text-muted">Penalties Trend</div>
          <div className="inline-flex items-center gap-1 rounded-full border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            <Sparkles size={10} />
            Coming Soon
          </div>
        </div>

        <TrendChart series={trendSeries} color="#ef4444" />
      </div>

      {/* PLACEHOLDER BREAKDOWN */}
      <div className="mt-4 rounded-2xl border border-rose-100 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-rose-100 dark:bg-rose-500/15 flex items-center justify-center text-rose-700 dark:text-rose-400">
              <PieChart size={14} />
            </div>
            <div>
              <div className="text-[12px] font-semibold tracking-[0.26em] uppercase text-rose-700 dark:text-rose-400">
                Penalty Breakdown
              </div>
              <div className="text-[12px] tracking-[0.10em] text-text-muted mt-1">Domain-wise penalty distribution</div>
            </div>
          </div>

          <div className="text-[10px] px-2 py-1 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-500/20">
            SOON
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border-color opacity-60">
          <div className="grid grid-cols-3 bg-surface-muted border-b border-border-color">
            <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">Domain</div>
            <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-rose-700 dark:text-rose-400 border-l border-border-color">KPI Penalty</div>
            <div className="px-2 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-orange-600 dark:text-orange-400 border-l border-border-color">GEN Penalty</div>
          </div>

          {PLACEHOLDER_ROWS.map((domain, idx) => (
            <div
              key={domain}
              className={`grid grid-cols-3 ${idx < PLACEHOLDER_ROWS.length - 1 ? "border-b border-border-color" : ""}`}
            >
              <div className="p-3 text-xs font-semibold text-text-secondary">{domain}</div>
              <div className="p-3 text-xs font-semibold text-text-muted border-l border-border-color">—</div>
              <div className="p-3 text-xs font-semibold text-text-muted border-l border-border-color">—</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
