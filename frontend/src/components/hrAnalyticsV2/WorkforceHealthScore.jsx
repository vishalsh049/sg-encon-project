import React, { useMemo } from "react";
import { RadialBar, RadialBarChart, PolarAngleAxis } from "recharts";
import { HeartPulse } from "lucide-react";
import { CARD_SHELL, SECTION_HEADING } from "../billingDashboard/theme";
import MetricTooltip from "../billingDashboard/MetricTooltip";

// Fixed, documented weights — no hidden tuning. Each sub-score is 0-100:
//   fulfillment  (30%) = Utilization % (min(Available, Requirement) / Requirement)
//   activeRate   (20%) = Active / Total employees
//   retention    (20%) = 100 - attrition % this month (resigned / (active+resigned))
//   coverage     (15%) = 100 - Vacancy %
//   leanness     (10%) = 100 - min(Extra / Available * 200, 100)  (extra headcount is inefficiency)
//   hiringPace   (5%)  = min(New Joining this month / Active * 500, 100)
const WEIGHTS = { fulfillment: 0.3, activeRate: 0.2, retention: 0.2, coverage: 0.15, leanness: 0.1, hiringPace: 0.05 };

function band(score) {
  if (score >= 85) return { label: "Excellent", color: "#059669", soft: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20" };
  if (score >= 70) return { label: "Good", color: "#0891b2", soft: "bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-500/20" };
  if (score >= 55) return { label: "Average", color: "#d97706", soft: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20" };
  if (score >= 35) return { label: "Poor", color: "#ea580c", soft: "bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/20" };
  return { label: "Critical", color: "#dc2626", soft: "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/20" };
}

export default function WorkforceHealthScore({ overview, loading }) {
  const kpis = overview?.kpis || {};

  const { score, subScores } = useMemo(() => {
    const totalEmployees = Number(kpis.totalEmployees || 0);
    const activeEmployees = Number(kpis.activeEmployees || 0);
    const resignedThisMonth = Number(kpis.resignedThisMonth || 0);
    const newJoiningThisMonth = Number(kpis.newJoiningThisMonth || 0);
    const available = Number(kpis.available || 0);
    const extra = Number(kpis.extra || 0);

    const fulfillment = Number(kpis.utilizationPct || 0);
    const activeRate = totalEmployees > 0 ? (activeEmployees / totalEmployees) * 100 : 0;
    const attrition =
      activeEmployees + resignedThisMonth > 0 ? (resignedThisMonth / (activeEmployees + resignedThisMonth)) * 100 : 0;
    const retention = 100 - attrition;
    const coverage = 100 - Number(kpis.vacancyPct || 0);
    const leanness = 100 - Math.min(available > 0 ? (extra / available) * 200 : 0, 100);
    const hiringPace = Math.min(activeEmployees > 0 ? (newJoiningThisMonth / activeEmployees) * 500 : 0, 100);

    const sub = { fulfillment, activeRate, retention, coverage, leanness, hiringPace };
    const weighted = Object.keys(WEIGHTS).reduce(
      (sum, key) => sum + Math.max(0, Math.min(100, sub[key])) * WEIGHTS[key],
      0
    );

    return { score: Math.round(weighted), subScores: sub };
  }, [kpis]);

  const grade = band(score);
  const chartData = [{ name: "score", value: score, fill: grade.color }];

  return (
    <div className={`${CARD_SHELL} p-5`}>
      <div className="mb-2 flex items-center gap-1.5">
        <h2 className={`${SECTION_HEADING} text-rose-600 dark:text-rose-400 flex items-center gap-1.5`}>
          <HeartPulse size={14} /> Workforce Health Score
        </h2>
        <MetricTooltip text="Weighted blend of Requirement Fulfillment (30%), Active Rate (20%), Retention (20%), Vacancy Coverage (15%), Leanness / low-extra-headcount (10%) and Hiring Pace (5%)." />
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-xl bg-surface-muted" />
      ) : (
        <div className="flex flex-col items-center gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative h-40 w-40 shrink-0">
            <RadialBarChart
              width={160}
              height={160}
              cx={80}
              cy={80}
              innerRadius={58}
              outerRadius={78}
              barSize={14}
              data={chartData}
              startAngle={90}
              endAngle={-270}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
              <RadialBar background dataKey="value" cornerRadius={8} isAnimationActive animationDuration={700} />
            </RadialBarChart>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-text-primary">{score}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">/ 100</span>
            </div>
          </div>

          <div className="flex-1">
            <div className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-bold ${grade.soft}`}>
              {grade.label}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {[
                ["Fulfillment", subScores.fulfillment],
                ["Active Rate", subScores.activeRate],
                ["Retention", subScores.retention],
                ["Vacancy Coverage", subScores.coverage],
                ["Leanness", subScores.leanness],
                ["Hiring Pace", subScores.hiringPace],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-2 text-text-muted">
                  <span>{label}</span>
                  <span className="font-semibold text-text-secondary">{Math.round(value)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
