import React from "react";
import { AlertTriangle, PieChart } from "lucide-react";
import { formatCurrency } from "../../utils/penaltyFormat";
import MetricTooltip from "./MetricTooltip";
import TrendChart from "./TrendChart";

// Merges the two independent byDomain breakdowns (KPI Penalty's is always
// exactly Tower/Fiber/FTTx; General Penalty's domain is free text from the
// uploaded Excel) into one row per domain, normalizing case/whitespace so
// "fttx"/"FTTx "/"FTTx" from General Penalty line up with KPI Penalty's
// canonical labels instead of showing as separate rows.
function normalizeDomainKey(domain) {
  const trimmed = String(domain || "").trim();
  if (!trimmed) return "Unspecified";
  const lower = trimmed.toLowerCase();
  if (lower === "fttx") return "FTTx";
  if (lower === "fiber") return "Fiber";
  if (lower === "tower") return "Tower";
  return trimmed;
}

function mergeDomainRows(kpiByDomain, generalByDomain) {
  const merged = new Map();

  (kpiByDomain || []).forEach((row) => {
    const domain = normalizeDomainKey(row.domain);
    const entry = merged.get(domain) || { domain, kpiPenalty: 0, genPenalty: 0 };
    entry.kpiPenalty += Number(row.penaltyAmount || 0);
    merged.set(domain, entry);
  });

  (generalByDomain || []).forEach((row) => {
    const domain = normalizeDomainKey(row.domain);
    const entry = merged.get(domain) || { domain, kpiPenalty: 0, genPenalty: 0 };
    entry.genPenalty += Number(row.penaltyAccepted || 0);
    merged.set(domain, entry);
  });

  return [...merged.values()].sort((a, b) => (b.kpiPenalty + b.genPenalty) - (a.kpiPenalty + a.genPenalty));
}

export default function PenaltyAnalyticsCard({ kpiPenalty, generalPenalty, insight, loading, trendSeries }) {
  const totalPenalties = Number(kpiPenalty?.totalPenaltyAmount || 0) + Number(generalPenalty?.totalPenaltyAccepted || 0);
  const domainRows = mergeDomainRows(kpiPenalty?.byDomain, generalPenalty?.byDomain);

  return (
    <div className="p-5">
      {/* HEADER */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] tracking-[0.35em] font-bold text-rose-700 dark:text-rose-400 uppercase">
            Penalties
            <MetricTooltip text="KPI Penalty amount + General Penalty (accepted) for the selected circle/period." />
          </div>

          <div className="mt-2 text-sm tracking-[0.14em] text-text-muted">Total Penalties</div>

          {loading ? (
            <div className="mt-1 h-7 w-28 animate-pulse rounded-md bg-surface-muted" />
          ) : (
            <div className="mt-1 text-[22px] font-semibold tracking-[-0.05em] text-rose-700 dark:text-rose-400">
              {formatCurrency(totalPenalties)}
            </div>
          )}

          <div className="mt-2 text-rose-600 dark:text-rose-400 text-xs">
            {insight || "KPI + General penalties for the selected period"}
          </div>
        </div>

        <div className="h-8 w-8 shrink-0 rounded-full border border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center text-rose-700 dark:text-rose-400">
          <AlertTriangle size={14} />
        </div>
      </div>

      {/* TREND */}
      <div className="mt-4 rounded-2xl border border-border-color p-4">
        <div className="mb-4 text-[10px] tracking-[0.28em] font-semibold uppercase text-rose-700 dark:text-rose-400">
          Penalties Trend
        </div>

        <TrendChart series={trendSeries} color="#ef4444" unit="L" />
      </div>

      {/* BREAKDOWN */}
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
              <div className="text-[12px] tracking-[0.10em] text-text-muted mt-1">KPI + General Penalty by domain</div>
            </div>
          </div>

          <div className="text-[10px] px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20">
            LIVE
          </div>
        </div>

        {domainRows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-color px-3 py-4 text-center text-xs text-text-muted">
            No KPI or General Penalty records in this range.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border-color">
            <div className="grid grid-cols-3 bg-surface-muted border-b border-border-color">
              <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">Domain</div>
              <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-rose-600 dark:text-rose-400 border-l border-border-color">
                KPI Penalty
              </div>
              <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-orange-600 dark:text-orange-400 border-l border-border-color">
                Gen Penalty
              </div>
            </div>

            {domainRows.map((row, idx) => (
              <div
                key={row.domain}
                className={`grid grid-cols-3 ${idx < domainRows.length - 1 ? "border-b border-border-color" : ""}`}
              >
                <div className="p-3 text-xs font-semibold text-text-secondary">{row.domain}</div>
                <div className="p-3 text-xs font-semibold text-rose-600 dark:text-rose-400 border-l border-border-color">
                  {formatCurrency(row.kpiPenalty)}
                </div>
                <div className="p-3 text-xs font-semibold text-orange-600 dark:text-orange-400 border-l border-border-color">
                  {formatCurrency(row.genPenalty)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
