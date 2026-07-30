import React, { useMemo, useState } from "react";
import { Building2, ChevronDown, ChevronRight } from "lucide-react";
import { CARD_SHELL, SECTION_HEADING } from "../billingDashboard/theme";

// roleKeys the drilldown endpoint (backend/routes/hrDashboardExport.js) will
// actually accept — technicianb/riggerb are real "Available" buckets with no
// signoff column, so they're shown but not clickable into the employee list.
const DRILLDOWN_ELIGIBLE = new Set([
  "state_leadership_team", "noc_executive", "analyst", "cmp_lead", "technician", "rigger",
  "utility_supervisor", "utility_engineer", "isp_engineer", "wh_incharge_cum_security",
  "splicer", "assistant_splicer", "fiber_helper", "patroller", "fiber_supervisor", "fibre_engineer",
  "fttx_splicer", "fttx_assistant_splicer", "fttx_supervisor", "fttx_helper", "fttx_engineer", "fttx_technician",
]);

export default function CmpAnalyticsPanel({ cmps, loading, onOpenDrilldown, showOfferedSalary = true }) {
  const [expanded, setExpanded] = useState(new Set());
  const [sortKey, setSortKey] = useState("gap");

  const sorted = useMemo(() => {
    return [...(cmps || [])].sort((a, b) => Number(b[sortKey] || 0) - Number(a[sortKey] || 0));
  }, [cmps, sortKey]);

  const toggle = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const sortOptions = [
    { key: "gap", label: "Gap" },
    { key: "extra", label: "Extra" },
    { key: "available", label: "Available" },
    ...(showOfferedSalary ? [{ key: "payroll", label: "Offered Salary" }] : []),
  ];

  return (
    <div className={`${CARD_SHELL} p-5`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className={`${SECTION_HEADING} text-violet-600 dark:text-violet-400 flex items-center gap-1.5`}>
          <Building2 size={14} /> CMP Analytics
        </h2>
        <div className="flex items-center gap-1 text-[11px]">
          <span className="text-text-muted">Rank by</span>
          {sortOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setSortKey(option.key)}
              className={`rounded-full border px-2.5 py-1 font-semibold transition ${
                sortKey === option.key
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
      ) : !sorted.length ? (
        <div className="rounded-xl bg-surface-muted p-6 text-center text-sm text-text-muted">
          No CMP data for the current filters.
        </div>
      ) : (
        <div className="max-h-[520px] overflow-auto custom-scrollbar rounded-xl border border-border-color/60">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-surface-muted text-[11px] uppercase text-text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">CMP</th>
                <th className="px-3 py-2 text-left font-semibold">Circle</th>
                <th className="px-3 py-2 text-right font-semibold">Req</th>
                <th className="px-3 py-2 text-right font-semibold">Avail</th>
                <th className="px-3 py-2 text-right font-semibold">Gap</th>
                <th className="px-3 py-2 text-right font-semibold">Extra</th>
                <th className="px-3 py-2 text-right font-semibold">New Joining</th>
                <th className="px-3 py-2 text-right font-semibold">Resigned</th>
                <th className="px-3 py-2 text-right font-semibold">Pending</th>
                <th className="px-3 py-2 text-right font-semibold">Util %</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((cmp) => {
                const key = `${cmp.circle}||${cmp.cmp}`;
                const isOpen = expanded.has(key);
                return (
                  <React.Fragment key={key}>
                    <tr
                      className="cursor-pointer border-t border-border-color/60 text-text-secondary hover:bg-surface-muted/60"
                      onClick={() => toggle(key)}
                    >
                      <td className="px-3 py-2 font-semibold text-text-primary">
                        <span className="inline-flex items-center gap-1.5">
                          {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          {cmp.cmp}
                        </span>
                      </td>
                      <td className="px-3 py-2">{cmp.circle}</td>
                      <td className="px-3 py-2 text-right">{cmp.requirement}</td>
                      <td className="px-3 py-2 text-right">{cmp.available}</td>
                      <td
                        className={`px-3 py-2 text-right font-semibold ${
                          cmp.gap > 0
                            ? "text-rose-600 dark:text-rose-400"
                            : cmp.gap < 0
                            ? "text-violet-600 dark:text-violet-400"
                            : "text-text-muted"
                        }`}
                      >
                        {cmp.gap}
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold ${cmp.extra > 0 ? "text-violet-600 dark:text-violet-400" : "text-text-muted"}`}>
                        {cmp.extra}
                      </td>
                      <td className="px-3 py-2 text-right">{cmp.newJoiningThisMonth}</td>
                      <td className="px-3 py-2 text-right">{cmp.resignedEmployees}</td>
                      <td className="px-3 py-2 text-right">{cmp.pendingJoining}</td>
                      <td className="px-3 py-2 text-right font-semibold">{cmp.utilizationPct}%</td>
                    </tr>

                    {isOpen && (
                      <tr>
                        <td colSpan={10} className="bg-surface-muted/40 px-3 py-2">
                          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-4">
                            {cmp.designations.map((d) => {
                              const clickable = DRILLDOWN_ELIGIBLE.has(d.roleKey) && (d.requirement > 0 || d.available > 0);
                              return (
                                <button
                                  type="button"
                                  key={d.roleKey}
                                  disabled={!clickable}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (clickable) {
                                      onOpenDrilldown({
                                        roleKey: d.roleKey,
                                        roleLabel: d.roleLabel,
                                        circle: cmp.circle,
                                        cmp: cmp.cmp,
                                      });
                                    }
                                  }}
                                  className={`rounded-lg border border-border-color/60 bg-surface px-2.5 py-1.5 text-left text-[11px] ${
                                    clickable ? "hover:border-indigo-300 hover:dark:border-indigo-500/30 cursor-pointer" : "cursor-default opacity-70"
                                  }`}
                                  title={clickable ? `View ${d.roleLabel} employees` : undefined}
                                >
                                  <div className="font-semibold text-text-primary truncate">{d.roleLabel}</div>
                                  <div className="mt-0.5 text-text-muted">
                                    R {d.requirement} · A {d.available} ·{" "}
                                    <span
                                      className={
                                        d.gap > 0
                                          ? "text-rose-600 dark:text-rose-400 font-semibold"
                                          : d.gap < 0
                                          ? "text-violet-600 dark:text-violet-400 font-semibold"
                                          : ""
                                      }
                                    >
                                      G {d.gap}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
