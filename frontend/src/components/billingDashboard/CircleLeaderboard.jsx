import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Trophy } from "lucide-react";
import { CARD_SHELL, SECTION_HEADING, statusColor } from "./theme";
import MetricTooltip from "./MetricTooltip";

const RANK_STYLES = {
  1: "bg-gradient-to-br from-amber-400 to-orange-500",
  2: "bg-gradient-to-br from-slate-400 to-slate-500",
  3: "bg-gradient-to-br from-orange-400 to-amber-600",
};

export default function CircleLeaderboard({ circleRankingData }) {
  const rows = useMemo(() => {
    const revenues = circleRankingData.map((r) => Number(r.revenue) || 0);
    const maxRevenue = Math.max(1, ...revenues);

    return circleRankingData.map((item) => {
      const efficiency = Number(item.efficiency ?? 0);
      const revenuePercentile = Math.round((Number(item.revenue || 0) / maxRevenue) * 100);
      const score = Math.round(efficiency * 0.5 + revenuePercentile * 0.5);
      return { ...item, efficiency, score };
    });
  }, [circleRankingData]);

  return (
    <div className={`${CARD_SHELL} overflow-hidden`}>
      <div className="flex items-center justify-between p-5 border-b border-border-color/60">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shadow-lg">
            <Trophy size={20} />
          </div>
          <div>
            <div className={`${SECTION_HEADING} text-amber-700 dark:text-amber-400 flex items-center gap-1.5`}>
              Circle Performance Leaderboard
              <MetricTooltip text="Circles ranked by latest-period revenue. Billing % and Performance Score come from real billing completion data (billing efficiency + revenue share)." />
            </div>
            <div className="mt-1 text-sm text-text-muted">Revenue &amp; billing efficiency leaderboard</div>
          </div>
        </div>

        <div className="px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
          LIVE
        </div>
      </div>

      <div className="p-4">
        <div className="overflow-x-auto rounded-2xl border border-border-color">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted">
              <tr>
                {["Rank", "Circle", "Revenue", "Billing %", "Performance Score", "Status"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-text-muted border-b border-border-color">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((item, index) => {
                const status = statusColor(item.efficiency);
                return (
                  <motion.tr
                    key={item.circle}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35, delay: index * 0.05 }}
                    className="border-b border-border-color last:border-b-0 hover:bg-surface-muted/70 transition"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`h-8 w-8 rounded-xl flex items-center justify-center text-white text-sm font-bold ${RANK_STYLES[item.rank] || "bg-gradient-to-br from-slate-500 to-slate-600"}`}>
                          {item.rank}
                        </div>
                        {item.rank === 1 && (
                          <span className="px-2 py-1 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-500/20 text-[9px] font-bold uppercase">
                            Top
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-text-secondary">{item.circle}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-700 dark:text-emerald-400">₹ {item.revenue} Cr</td>
                    <td className="px-4 py-3 font-semibold text-indigo-700 dark:text-indigo-400">{item.efficiency}%</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 w-32">
                        <div className="h-1.5 flex-1 rounded-full overflow-hidden bg-surface-muted">
                          <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500" style={{ width: `${item.score}%` }} />
                        </div>
                        <span className="text-xs font-bold text-text-primary">{item.score}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full border ${status.badge}`}>
                        {status.label}
                      </span>
                    </td>
                  </motion.tr>
                );
              })}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-text-muted">
                    No circle ranking data available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
