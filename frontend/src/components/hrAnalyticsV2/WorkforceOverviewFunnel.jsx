import React from "react";
import { ArrowDown } from "lucide-react";
import { CARD_SHELL, SECTION_HEADING } from "../billingDashboard/theme";

function formatINR(value) {
  const n = Number(value || 0);
  if (n >= 10000000) return `₹ ${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹ ${(n / 100000).toFixed(2)} L`;
  return `₹ ${n.toLocaleString("en-IN")}`;
}

const STEP_COLORS = [
  "from-indigo-500 to-indigo-400",
  "from-sky-500 to-sky-400",
  "from-rose-500 to-rose-400",
  "from-amber-500 to-amber-400",
  "from-violet-500 to-violet-400",
  "from-emerald-500 to-emerald-400",
  "from-teal-500 to-teal-400",
];

export default function WorkforceOverviewFunnel({ overview, loading, showOfferedSalary = true }) {
  const kpis = overview?.kpis || {};

  const steps = [
    { label: "Requirement", value: kpis.requirement ?? 0, display: kpis.requirement ?? 0 },
    { label: "Available", value: kpis.available ?? 0, display: kpis.available ?? 0 },
    { label: "Gap", value: kpis.gap ?? 0, display: kpis.gap ?? 0 },
    {
      label: "Vacancies",
      value: kpis.gap ?? 0,
      display: `${kpis.vacancyPct ?? 0}%`,
    },
    { label: "Extra Employees", value: kpis.extra ?? 0, display: kpis.extra ?? 0 },
    // kpis.payroll sums nth_salary — the salary offered to the employee on
    // record, not a confirmed/actual payroll disbursement. Label it as such
    // so it isn't mistaken for real payroll spend.
    ...(showOfferedSalary ? [{ label: "Offered Salary", value: kpis.payroll ?? 0, display: formatINR(kpis.payroll) }] : []),
    {
      label: "Actual Utilization",
      value: kpis.utilizationPct ?? 0,
      display: `${kpis.utilizationPct ?? 0}%`,
    },
  ];

  const maxValue = Math.max(1, ...steps.map((s) => (typeof s.value === "number" ? s.value : 0)));

  return (
    <div className={`${CARD_SHELL} p-5`}>
      <h2 className={`${SECTION_HEADING} mb-4 text-indigo-600 dark:text-indigo-400`}>
        Workforce Overview
      </h2>

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl bg-surface-muted" />
      ) : (
        <div className="flex flex-col gap-1 md:flex-row md:items-stretch md:gap-2">
          {steps.map((step, index) => {
            const widthPct = Math.max(
              14,
              Math.round((Math.min(step.value, maxValue) / maxValue) * 100)
            );
            return (
              <React.Fragment key={step.label}>
                <div className="flex-1 rounded-xl border border-border-color/60 bg-surface-muted/60 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-muted">
                    {step.label}
                  </div>
                  <div className="mt-1 text-lg font-bold text-text-primary">{step.display}</div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${STEP_COLORS[index % STEP_COLORS.length]} transition-all duration-500`}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div className="flex items-center justify-center text-text-muted md:rotate-[-90deg]">
                    <ArrowDown size={16} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
