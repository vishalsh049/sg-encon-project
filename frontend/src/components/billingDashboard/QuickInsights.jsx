import React, { useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  AlertOctagon,
  Award,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { CARD_SHELL, SECTION_HEADING, formatCr } from "./theme";
import MetricTooltip from "./MetricTooltip";

function InsightCard({ icon: Icon, label, value, sub, colorClasses }) {
  return (
    <div className={`${CARD_SHELL} p-4 flex items-start gap-3`}>
      <div className={`h-10 w-10 shrink-0 rounded-2xl flex items-center justify-center text-white shadow-md bg-gradient-to-br ${colorClasses}`}>
        <Icon size={17} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-muted">{label}</div>
        <div className="mt-1 text-[15px] font-bold text-text-primary truncate">{value}</div>
        {sub && <div className="text-xs text-text-muted mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

export default function QuickInsights({ circleRankingData, summary, circleStats }) {
  const insights = useMemo(() => {
    const byRevenue = [...circleRankingData].sort((a, b) => Number(b.revenue) - Number(a.revenue));
    const highestRevenue = byRevenue[0];
    const lowestRevenue = byRevenue[byRevenue.length - 1];

    const domainLoss = [
      { domain: "FTTx", loss: Number(summary?.fttx_loss || 0) },
      { domain: "Fiber", loss: Number(summary?.fiber_loss || 0) },
      { domain: "Tower", loss: Number(summary?.tower_loss || 0) },
    ].sort((a, b) => b.loss - a.loss);
    const highestLossDomain = domainLoss[0];

    const byEfficiency = [...circleRankingData].sort((a, b) => Number(b.efficiency ?? 0) - Number(a.efficiency ?? 0));
    const bestPerformance = byEfficiency[0];
    const needsAttention = byEfficiency[byEfficiency.length - 1];

    const byPending = [...circleStats].sort((a, b) => b.pending - a.pending);
    const highestPending = byPending[0];

    return { highestRevenue, lowestRevenue, highestLossDomain, bestPerformance, needsAttention, highestPending };
  }, [circleRankingData, summary, circleStats]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 px-1">
        <h3 className={`${SECTION_HEADING} text-amber-600 dark:text-amber-400 flex items-center gap-1.5`}>
          Quick Insights
          <MetricTooltip text="Automatically generated highlights from the current filtered data — no manual input required." />
        </h3>
        <div className="h-1 w-28 rounded-full bg-gradient-to-r from-amber-400/40 via-rose-400/30 to-indigo-400/30" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <InsightCard
          icon={TrendingUp}
          label="Highest Revenue Circle"
          value={insights.highestRevenue?.circle || "-"}
          sub={insights.highestRevenue ? `₹ ${insights.highestRevenue.revenue} Cr` : ""}
          colorClasses="from-emerald-500 to-emerald-400"
        />

        <InsightCard
          icon={TrendingDown}
          label="Lowest Revenue Circle"
          value={insights.lowestRevenue?.circle || "-"}
          sub={insights.lowestRevenue ? `₹ ${insights.lowestRevenue.revenue} Cr` : ""}
          colorClasses="from-slate-500 to-slate-400"
        />

        <InsightCard
          icon={AlertOctagon}
          label="Highest Loss Domain"
          value={insights.highestLossDomain?.domain || "-"}
          sub={insights.highestLossDomain ? formatCr(insights.highestLossDomain.loss) : ""}
          colorClasses="from-indigo-500 to-indigo-400"
        />

        <InsightCard
          icon={Award}
          label="Best Billing Performance"
          value={insights.bestPerformance?.circle || "-"}
          sub={insights.bestPerformance ? `${insights.bestPerformance.efficiency}% completion` : ""}
          colorClasses="from-cyan-500 to-sky-400"
        />

        <InsightCard
          icon={AlertTriangle}
          label="Needs Attention"
          value={insights.needsAttention?.circle || "-"}
          sub={insights.needsAttention ? `${insights.needsAttention.efficiency}% completion` : ""}
          colorClasses="from-rose-500 to-rose-400"
        />

        <InsightCard
          icon={Clock}
          label="Highest Pending Billing"
          value={insights.highestPending?.circle || "-"}
          sub={insights.highestPending ? `${insights.highestPending.pending} pending checkpoints` : ""}
          colorClasses="from-amber-500 to-amber-400"
        />
      </div>
    </div>
  );
}
