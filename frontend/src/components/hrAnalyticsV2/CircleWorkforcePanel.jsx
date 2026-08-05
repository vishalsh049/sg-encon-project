import React from "react";
import { MapPin } from "lucide-react";
import { CARD_SHELL, SECTION_HEADING, statusColor } from "../billingDashboard/theme";

export default function CircleWorkforcePanel({ circles, loading, selectedCircle, onSelectCircle, showOfferedSalary = true }) {
  return (
    <div className={`${CARD_SHELL} p-5`}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className={`${SECTION_HEADING} text-sky-600 dark:text-sky-400 flex items-center gap-1.5`}>
          <MapPin size={14} /> Circle-wise Workforce
        </h2>
        {selectedCircle && (
          <button
            type="button"
            onClick={() => onSelectCircle("")}
            className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Clear circle filter
          </button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-surface-muted" />
          ))}
        </div>
      ) : !circles.length ? (
        <div className="rounded-xl bg-surface-muted p-6 text-center text-sm text-text-muted">
          No circle data for the current filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {circles.map((circle) => {
            const status = statusColor(circle.utilizationPct);
            const isActive = selectedCircle === circle.circle;
            return (
              <button
                type="button"
                key={circle.circle}
                onClick={() => onSelectCircle(isActive ? "" : circle.circle)}
                className={`rounded-xl border p-4 text-left transition ${
                  isActive
                    ? "border-indigo-300 dark:border-indigo-500/40 bg-indigo-50/60 dark:bg-indigo-500/10 ring-2 ring-indigo-200 dark:ring-indigo-500/20"
                    : "border-border-color/60 bg-surface-muted/60 hover:border-indigo-200 hover:dark:border-indigo-500/20"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-text-primary">{circle.circle}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${status.badge}`}>
                    {status.label}
                  </span>
                </div>

                <div className="mt-3 flex items-baseline gap-2 text-xs">
                  <span className="text-text-secondary">
                    R <span className="font-bold text-text-primary">{circle.requirement}</span>
                  </span>
                  <span className="text-text-muted">|</span>
                  <span className="text-text-secondary">
                    A <span className="font-bold text-text-primary">{circle.available}</span>
                  </span>
                  <span className="text-text-muted">|</span>
                  <span
                    className={
                      circle.gap > 0
                        ? "text-rose-600 dark:text-rose-400 font-bold"
                        : circle.gap < 0
                        ? "text-violet-600 dark:text-violet-400 font-bold"
                        : "text-emerald-600 dark:text-emerald-400 font-bold"
                    }
                  >
                    G {circle.gap}
                  </span>
                </div>

                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface">
                  <div className={`h-full rounded-full ${status.bar}`} style={{ width: `${Math.min(circle.utilizationPct, 100)}%` }} />
                </div>
                <div className="mt-1 text-[10px] font-semibold text-text-muted">{circle.utilizationPct}% utilization</div>

                {showOfferedSalary && (
                  <div className="mt-3 text-[11px] text-text-muted">
                    Offered Salary: <span className="font-semibold text-text-secondary">{circle.payroll ? `₹${(circle.payroll / 100000).toFixed(1)}L` : "—"}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
