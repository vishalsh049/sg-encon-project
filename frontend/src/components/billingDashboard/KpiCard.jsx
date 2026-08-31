import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { ACCENTS, CARD_SHELL } from "./theme";
import MetricTooltip from "./MetricTooltip";
import Sparkline from "./Sparkline";

/**
 * Executive Summary KPI card.
 * trend === null/undefined  -> no real month-over-month figure exists, show a neutral period badge instead
 * trend === number          -> genuine % change, rendered with an up/down arrow
 */
export default function KpiCard({
  accentKey = "neutral",
  icon: Icon,
  label,
  value,
  description,
  tooltip,
  trend = null,
  periodBadge,
  sparklineData,
  loading = false,
  // Billing Dashboard's dense grid relies on single-line truncation; set
  // this to let label/description wrap to full text instead (e.g. HR
  // Analytics V2's cards, which have longer formula-style descriptions).
  wrapText = false,
  // Smaller label / value / icon for tighter grids (e.g. Expense Management's
  // 5-across KPI row).
  compact = false,
}) {
  const accent = ACCENTS[accentKey] || ACCENTS.neutral;
  const trendPositive = typeof trend === "number" && trend >= 0;
  const clampClass = wrapText ? "" : "truncate";

  return (
    <div className={`${CARD_SHELL} ${compact ? "p-3" : "p-4"} flex flex-col gap-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <div className={`${compact ? "text-[10px] tracking-[0.16em]" : "text-[10px] tracking-[0.22em]"} font-bold uppercase text-text-muted ${clampClass}`}>
              {label}
            </div>
            {tooltip && <MetricTooltip text={tooltip} />}
          </div>

          {loading ? (
            <div className="mt-2 h-7 w-24 animate-pulse rounded-md bg-surface-muted" />
          ) : (
            <div className={`mt-1 ${compact ? "text-[18px]" : "text-[22px]"} font-bold tracking-[-0.04em] ${accent.label}`}>
              {value}
            </div>
          )}

          {description && (
            <div className={`mt-1 ${compact ? "text-[11px]" : "text-xs"} text-text-muted ${clampClass}`}>{description}</div>
          )}
        </div>

        <div
          className={`${compact ? "h-8 w-8" : "h-10 w-10"} shrink-0 rounded-2xl bg-gradient-to-br ${accent.gradient} flex items-center justify-center text-white shadow-md`}
        >
          {Icon && <Icon size={compact ? 15 : 18} />}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        {sparklineData && sparklineData.length >= 2 && (
          <div className="flex-1">
            <Sparkline
              data={sparklineData}
              color={accent.chart.solid}
              height={36}
            />
          </div>
        )}

        <div className="shrink-0 ml-auto">
          {typeof trend === "number" ? (
            <div
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${
                trendPositive
                  ? "border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400"
              }`}
            >
              {trendPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {Math.abs(trend)}%
            </div>
          ) : periodBadge ? (
            <div className="rounded-full border border-border-color bg-surface-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted whitespace-nowrap">
              {periodBadge}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
