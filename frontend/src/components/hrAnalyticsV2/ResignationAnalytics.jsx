import React, { useMemo } from "react";
import { UserMinus } from "lucide-react";
import TrendAnalyticsBase from "./TrendAnalyticsBase";
import { sumThisMonth, sumThisYear } from "./trendUtils";

export default function ResignationAnalytics({ rows, activeEmployees, loading, periodFilter, periodLabel }) {
  const attritionPct = useMemo(() => {
    const resignedThisYear = sumThisYear(rows || []);
    const base = Number(activeEmployees || 0) + resignedThisYear;
    return base > 0 ? Number(((resignedThisYear / base) * 100).toFixed(1)) : 0;
  }, [rows, activeEmployees]);

  const resignedThisMonth = useMemo(() => sumThisMonth(rows || []), [rows]);

  return (
    <div className="space-y-3">
      {!loading && (rows || []).length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10 px-4 py-2 text-xs text-rose-700 dark:text-rose-400">
          <span className="font-bold">Attrition (trailing 12 months): {attritionPct}%</span>
          <span className="text-rose-600/80 dark:text-rose-400/80">{resignedThisMonth} resigned this month</span>
        </div>
      )}
      <TrendAnalyticsBase
        title="Resignation Analytics"
        icon={UserMinus}
        accentClass="text-rose-600 dark:text-rose-400"
        barColor="#f43f5e"
        rows={rows}
        loading={loading}
        periodFilter={periodFilter}
        periodLabel={periodLabel}
      />
    </div>
  );
}
