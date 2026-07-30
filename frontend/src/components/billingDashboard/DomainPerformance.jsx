import React from "react";
import { Wifi, Cable, RadioTower } from "lucide-react";
import { CARD_SHELL, SECTION_HEADING, DOMAIN_COLORS, statusColor, formatCr } from "./theme";
import MetricTooltip from "./MetricTooltip";

const DOMAIN_ICONS = { FTTx: Wifi, Fiber: Cable, Tower: RadioTower };
const DOMAINS = ["FTTx", "Fiber", "Tower"];

export default function DomainPerformance({ summary, domainCompletion }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 px-1">
        <h3 className={`${SECTION_HEADING} text-violet-600 dark:text-violet-400 flex items-center gap-1.5`}>
          Domain Performance
          <MetricTooltip text="Revenue, PM Loss and billing completion for each service domain, for the latest billing period and selected filters." />
        </h3>
        <div className="h-1 w-28 rounded-full bg-gradient-to-r from-violet-500/40 via-indigo-500/40 to-emerald-400/30" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {DOMAINS.map((domain) => {
          const Icon = DOMAIN_ICONS[domain];
          const color = DOMAIN_COLORS[domain];
          const key = domain.toLowerCase();
          const revenue = Number(summary?.[`${key}_cm`] || 0) + Number(summary?.[`${key}_pm`] || 0);
          const loss = Number(summary?.[`${key}_loss`] || 0);
          const completion = domainCompletion?.[domain] || { done: 0, pending: 0, percent: 0 };
          const status = statusColor(completion.percent);

          return (
            <div key={domain} className={`${CARD_SHELL} p-4 relative overflow-hidden`}>
              <div className="absolute left-0 top-0 h-full w-1" style={{ backgroundColor: color }} />

              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className="h-9 w-9 rounded-xl flex items-center justify-center text-white shadow-sm"
                    style={{ backgroundColor: color }}
                  >
                    <Icon size={16} />
                  </div>
                  <div className="text-sm font-bold text-text-primary">{domain}</div>
                </div>

                <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full border ${status.badge}`}>
                  {status.label}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="rounded-xl bg-surface-muted/60 p-2.5">
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-text-muted">Revenue</div>
                  <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{formatCr(revenue)}</div>
                </div>
                <div className="rounded-xl bg-surface-muted/60 p-2.5">
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-text-muted">PM Loss</div>
                  <div className="text-sm font-bold text-indigo-700 dark:text-indigo-400">{formatCr(loss)}</div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Completion</div>
                  <div className={`text-xs font-bold ${status.text}`}>{completion.percent}%</div>
                </div>
                <div className={`h-1.5 rounded-full overflow-hidden ${status.bg}`}>
                  <div
                    className={`h-full rounded-full ${status.bar} transition-all duration-700`}
                    style={{ width: `${completion.percent}%` }}
                  />
                </div>
                <div className="mt-1 text-[10px] text-text-muted">
                  {completion.done} done · {completion.pending} pending
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
