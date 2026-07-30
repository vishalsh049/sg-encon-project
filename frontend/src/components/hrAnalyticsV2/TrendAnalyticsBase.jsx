import React, { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { CARD_SHELL, SECTION_HEADING } from "../billingDashboard/theme";
import {
  bucketSeries,
  sumToday,
  sumThisWeek,
  sumThisMonth,
  sumThisQuarter,
  sumThisYear,
  groupByField,
  filterRowsByPeriod,
} from "./trendUtils";

const GRANULARITY_OPTIONS = [
  { key: "day", label: "Daily" },
  { key: "week", label: "Weekly" },
  { key: "month", label: "Monthly" },
  { key: "quarter", label: "Quarterly" },
  { key: "year", label: "Yearly" },
];

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-border-color bg-surface-elevated px-3 py-2 text-xs shadow-panel">
      <div className="font-semibold text-text-primary">{label}</div>
      <div className="mt-0.5 text-text-secondary">{payload[0].value} employees</div>
    </div>
  );
}

// Shared implementation behind JoiningAnalytics.jsx / ResignationAnalytics.jsx
// — both consume the same shape of daily rows from the backend
// (/joining-trend, /resignation-trend) and only differ in title/color/data.
export default function TrendAnalyticsBase({ title, icon: Icon, accentClass, barColor, rows, loading, periodFilter, periodLabel }) {
  const [granularity, setGranularity] = useState("month");

  const allRows = rows || [];
  const periodActive = Boolean(periodFilter?.month || periodFilter?.quarter);
  const safeRows = useMemo(
    () => (periodActive ? filterRowsByPeriod(allRows, periodFilter) : allRows),
    [allRows, periodActive, periodFilter]
  );
  const periodTotal = useMemo(() => safeRows.reduce((sum, row) => sum + Number(row.total || 0), 0), [safeRows]);

  const summary = useMemo(
    () => ({
      today: sumToday(allRows),
      week: sumThisWeek(allRows),
      month: sumThisMonth(allRows),
      quarter: sumThisQuarter(allRows),
      year: sumThisYear(allRows),
    }),
    [allRows]
  );

  const series = useMemo(() => bucketSeries(safeRows, granularity, 12), [safeRows, granularity]);
  const byCircle = useMemo(() => groupByField(safeRows, "circle"), [safeRows]);
  const byCmp = useMemo(() => groupByField(safeRows, "cmp"), [safeRows]);
  const byDesignation = useMemo(() => groupByField(safeRows, "roleKey", "roleLabel"), [safeRows]);

  return (
    <div className={`${CARD_SHELL} p-5`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className={`${SECTION_HEADING} ${accentClass} flex items-center gap-1.5`}>
          <Icon size={14} /> {title}
        </h2>
        <div className="flex items-center gap-1 text-[11px]">
          {GRANULARITY_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setGranularity(option.key)}
              className={`rounded-full border px-2.5 py-1 font-semibold transition ${
                granularity === option.key
                  ? "border-indigo-300 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400"
                  : "border-border-color text-text-muted hover:text-text-secondary"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-surface-muted" />
      ) : !allRows.length ? (
        <div className="rounded-xl bg-surface-muted p-6 text-center text-sm text-text-muted">
          No records in the current filter scope.
        </div>
      ) : (
        <>
          {periodActive ? (
            <div className="mb-4 flex items-center justify-between rounded-xl border border-indigo-200 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/10 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                Selected Period — {periodLabel}
              </div>
              <div className="text-xl font-bold text-indigo-700 dark:text-indigo-400">{periodTotal}</div>
            </div>
          ) : (
            <div className="mb-4 grid grid-cols-5 gap-2 text-center">
              {[
                ["Today", summary.today],
                ["This Week", summary.week],
                ["This Month", summary.month],
                ["This Quarter", summary.quarter],
                ["This Year", summary.year],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-surface-muted/60 py-2">
                  <div className="text-base font-bold text-text-primary">{value}</div>
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-text-muted">{label}</div>
                </div>
              ))}
            </div>
          )}

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 2" vertical={false} stroke="rgba(148,163,184,0.25)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} width={30} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(15,23,42,0.04)" }} />
                <Bar dataKey="value" fill={barColor} radius={[6, 6, 0, 0]} maxBarSize={28} isAnimationActive animationDuration={600} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              ["By Circle", byCircle, (r) => r.key],
              ["By CMP", byCmp, (r) => r.key],
              ["By Designation", byDesignation, (r) => r.label || r.key],
            ].map(([label, list, labelFn]) => (
              <div key={label}>
                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-text-muted">{label}</div>
                <div className="space-y-1">
                  {list.slice(0, 5).map((row) => (
                    <div key={row.key} className="flex items-center justify-between text-[11px] text-text-secondary">
                      <span className="truncate">{labelFn(row)}</span>
                      <span className="font-semibold text-text-primary">{row.total}</span>
                    </div>
                  ))}
                  {!list.length && <div className="text-[11px] text-text-muted">No data</div>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
