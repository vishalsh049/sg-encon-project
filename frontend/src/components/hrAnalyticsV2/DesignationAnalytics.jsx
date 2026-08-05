import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { ListTree } from "lucide-react";
import { CARD_SHELL, SECTION_HEADING } from "../billingDashboard/theme";

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-border-color bg-surface-elevated px-3 py-2 text-xs shadow-panel">
      <div className="font-semibold text-text-primary">{label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="mt-0.5" style={{ color: entry.color }}>
          {entry.name}: <span className="font-semibold">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function heatColor(gap, maxGap) {
  if (gap <= 0 || maxGap <= 0) return "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  const intensity = Math.min(gap / maxGap, 1);
  if (intensity > 0.66) return "bg-rose-200 dark:bg-rose-500/25 text-rose-800 dark:text-rose-300";
  if (intensity > 0.33) return "bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-400";
  return "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400";
}

export default function DesignationAnalytics({ designations, loading }) {
  const chartData = useMemo(
    () =>
      (designations || [])
        .slice(0, 12)
        .map((d) => ({ label: d.roleLabel, Requirement: d.requirement, Available: d.available, Gap: d.gap })),
    [designations]
  );

  const maxGap = useMemo(() => Math.max(1, ...(designations || []).map((d) => d.gap)), [designations]);

  return (
    <div className={`${CARD_SHELL} p-5`}>
      <h2 className={`${SECTION_HEADING} mb-4 text-teal-600 dark:text-teal-400 flex items-center gap-1.5`}>
        <ListTree size={14} /> Designation Analytics
      </h2>

      {loading ? (
        <div className="h-72 animate-pulse rounded-xl bg-surface-muted" />
      ) : !designations?.length ? (
        <div className="rounded-xl bg-surface-muted p-6 text-center text-sm text-text-muted">
          No designation data for the current filters.
        </div>
      ) : (
        <>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 40 }}>
                <CartesianGrid strokeDasharray="2 2" vertical={false} stroke="rgba(148,163,184,0.25)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 11 }} width={36} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(15,23,42,0.04)" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Requirement" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Bar dataKey="Available" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Bar dataKey="Gap" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-5">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              Top Shortage Designations
            </div>
            <div className="space-y-1.5">
              {[...designations].sort((a, b) => b.gap - a.gap).slice(0, 6).map((d) => (
                <div key={d.roleKey} className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${heatColor(d.gap, maxGap)}`}>
                  <span className="font-semibold">{d.roleLabel}</span>
                  <span>Gap {d.gap}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
