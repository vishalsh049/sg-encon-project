import React from "react";
import {
  Lightbulb,
  AlertTriangle,
  TrendingUp,
  Award,
  TrendingDown,
  Target,
  Wallet,
  Gauge,
} from "lucide-react";
import { CARD_SHELL, SECTION_HEADING } from "../billingDashboard/theme";
import MetricTooltip from "../billingDashboard/MetricTooltip";

const ICONS = {
  shortage: AlertTriangle,
  surplus: TrendingUp,
  best: Award,
  worst: TrendingDown,
  "designation-shortage": Target,
  "roster-risk": Wallet,
  "overall-utilization": Gauge,
};

const COLOR_CLASSES = {
  shortage: "from-rose-500 to-rose-400",
  surplus: "from-violet-500 to-violet-400",
  best: "from-emerald-500 to-emerald-400",
  worst: "from-amber-500 to-amber-400",
  "designation-shortage": "from-indigo-500 to-indigo-400",
  "roster-risk": "from-rose-500 to-orange-400",
  "overall-utilization": "from-sky-500 to-cyan-400",
};

export default function SmartInsights({ insights, loading }) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-1.5 px-1">
        <h2 className={`${SECTION_HEADING} text-amber-600 dark:text-amber-400 flex items-center gap-1.5`}>
          <Lightbulb size={14} /> Smart Insights
        </h2>
        <MetricTooltip text="Automatically generated from the current filtered Requirement/Available/Payroll data — no manual input required." />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`${CARD_SHELL} h-20 animate-pulse`} />
          ))}
        </div>
      ) : !insights?.length ? (
        <div className={`${CARD_SHELL} p-6 text-center text-sm text-text-muted`}>No insights for the current filters.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {insights.map((insight, index) => {
            const Icon = ICONS[insight.type] || Lightbulb;
            const colorClasses = COLOR_CLASSES[insight.type] || "from-slate-500 to-slate-400";
            return (
              <div key={`${insight.type}-${index}`} className={`${CARD_SHELL} p-4 flex items-start gap-3`}>
                <div className={`h-10 w-10 shrink-0 rounded-2xl flex items-center justify-center text-white shadow-md bg-gradient-to-br ${colorClasses}`}>
                  <Icon size={17} />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-muted">{insight.label}</div>
                  <div className="mt-1 text-[13px] font-semibold text-text-primary">{insight.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
