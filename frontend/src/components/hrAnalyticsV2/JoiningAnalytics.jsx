import React from "react";
import { UserPlus } from "lucide-react";
import TrendAnalyticsBase from "./TrendAnalyticsBase";

export default function JoiningAnalytics({ rows, loading, periodFilter, periodLabel }) {
  return (
    <TrendAnalyticsBase
      title="New Joining Analytics"
      icon={UserPlus}
      accentClass="text-emerald-600 dark:text-emerald-400"
      barColor="#10b981"
      rows={rows}
      loading={loading}
      periodFilter={periodFilter}
      periodLabel={periodLabel}
    />
  );
}
