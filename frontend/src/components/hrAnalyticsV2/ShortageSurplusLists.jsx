import React, { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { CARD_SHELL, SECTION_HEADING } from "../billingDashboard/theme";

// Flattens the per-CMP designation breakdown (see GET /api/hr-analytics-v2/cmps)
// into circle+CMP+designation rows so shortage/surplus can be ranked at the
// same granularity as the spec's examples ("Punjab / Tower Technician").
function flatten(cmps) {
  const rows = [];
  (cmps || []).forEach((cmp) => {
    (cmp.designations || []).forEach((d) => {
      if (d.requirement === 0 && d.available === 0) return;
      rows.push({ circle: cmp.circle, cmp: cmp.cmp, ...d });
    });
  });
  return rows;
}

function priorityFor(gap, requirement) {
  if (requirement <= 0) return { label: "Low", classes: "bg-slate-50 dark:bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-500/20" };
  const ratio = gap / requirement;
  if (ratio >= 0.5) return { label: "High", classes: "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/20" };
  if (ratio >= 0.2) return { label: "Medium", classes: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20" };
  return { label: "Low", classes: "bg-slate-50 dark:bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-500/20" };
}

function ListCard({ title, icon: Icon, accent, rows, metricKey, metricLabel }) {
  return (
    <div className={`${CARD_SHELL} p-5`}>
      <h2 className={`${SECTION_HEADING} mb-4 flex items-center gap-1.5 ${accent}`}>
        <Icon size={14} /> {title}
      </h2>

      {!rows.length ? (
        <div className="rounded-xl bg-surface-muted p-6 text-center text-sm text-text-muted">Nothing to show.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const priority = priorityFor(row.gap, row.requirement);
            return (
              <div
                key={`${row.circle}-${row.cmp}-${row.roleKey}`}
                className="flex flex-col gap-2 rounded-xl border border-border-color/60 bg-surface-muted/50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-text-primary">{row.roleLabel}</div>
                  <div className="truncate text-[11px] text-text-muted">
                    {row.circle} · {row.cmp}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-right sm:shrink-0">
                  <div className="text-[11px] text-text-muted">
                    Need <span className="font-semibold text-text-secondary">{row.requirement}</span> · Avail{" "}
                    <span className="font-semibold text-text-secondary">{row.available}</span>
                  </div>
                  <div className="text-sm font-bold text-text-primary">{row[metricKey]}</div>
                  {metricKey === "gap" && (
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${priority.classes}`}>
                      {priority.label}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ShortageSurplusLists({ cmps, loading }) {
  const flattened = useMemo(() => flatten(cmps), [cmps]);

  const needHiring = useMemo(
    () => [...flattened].filter((r) => r.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 10),
    [flattened]
  );

  if (loading) {
    return <div className={`${CARD_SHELL} h-72 animate-pulse`} />;
  }

  return (
    <ListCard
      title="Need Immediate Hiring"
      icon={AlertTriangle}
      accent="text-rose-600 dark:text-rose-400"
      rows={needHiring}
      metricKey="gap"
      metricLabel="Gap"
    />
  );
}
