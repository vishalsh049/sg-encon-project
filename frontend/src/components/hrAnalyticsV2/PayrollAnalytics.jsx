import React from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Wallet, ShieldAlert, AlertTriangle } from "lucide-react";
import { CARD_SHELL, SECTION_HEADING } from "../billingDashboard/theme";

// Below this, "Avg Salary" and "Extra Payroll Est." are computed from too few
// records to be a meaningful company-wide figure — flag it instead of letting
// a near-empty nth_salary column silently render a misleadingly tiny average.
const LOW_COVERAGE_THRESHOLD = 50;

const PIE_COLORS = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6", "#14b8a6", "#ec4899"];

function formatINR(value) {
  const n = Number(value || 0);
  if (n >= 10000000) return `₹ ${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹ ${(n / 100000).toFixed(2)} L`;
  return `₹ ${n.toLocaleString("en-IN")}`;
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0];
  return (
    <div className="rounded-2xl border border-border-color bg-surface-elevated px-3 py-2 text-xs shadow-panel">
      <div className="font-semibold text-text-primary">{point.name}</div>
      <div className="mt-0.5 text-text-secondary">{formatINR(point.value)}</div>
    </div>
  );
}

export default function PayrollAnalytics({ payroll, loading }) {
  const byCircle = (payroll?.byCircle || []).slice(0, 8).map((row) => ({ name: row.circle, value: row.payroll }));
  const coveragePct = payroll?.salaryCoveragePct ?? 0;
  const lowCoverage = coveragePct < LOW_COVERAGE_THRESHOLD;

  return (
    <div className={`${CARD_SHELL} p-5`}>
      <h2 className={`${SECTION_HEADING} mb-1 text-amber-600 dark:text-amber-400 flex items-center gap-1.5`}>
        <Wallet size={14} /> Offered Salary Analytics
      </h2>
      <p className="mb-4 text-[11px] text-text-muted">
        Figures below reflect the salary <span className="font-semibold">offered</span> to each employee on record
        (nth_salary) — not confirmed or actual payroll disbursement.
      </p>

      {loading ? (
        <div className="h-72 animate-pulse rounded-xl bg-surface-muted" />
      ) : (
        <>
          {!loading && lowCoverage && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                Offered salary (nth_salary) is on file for only{" "}
                <span className="font-semibold">
                  {payroll?.salariedHeadcount ?? 0} of {payroll?.availableHeadcount ?? 0}
                </span>{" "}
                available employees ({coveragePct}% coverage). Avg Offered Salary below is computed only from the
                records that do have salary data — treat it as indicative, not company-wide, until more records
                are filled in.
              </span>
            </div>
          )}

          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-surface-muted/60 p-3 text-center">
              <div className="text-lg font-bold text-text-primary">{formatINR(payroll?.totalPayroll)}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Total Offered Salary</div>
            </div>
            <div className="rounded-xl bg-surface-muted/60 p-3 text-center">
              <div className="text-lg font-bold text-text-primary">{formatINR(payroll?.avgSalary)}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                Avg Offered Salary {lowCoverage ? `(${coveragePct}% coverage)` : ""}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-muted">Offered Salary by Circle</div>
              {byCircle.length ? (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={byCircle} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                        {byCircle.map((entry, index) => (
                          <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="rounded-xl bg-surface-muted p-6 text-center text-sm text-text-muted">No data</div>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                <ShieldAlert size={13} /> Offered Salary Without Approved Requirement
              </div>
              {payroll?.noApprovedRequirement?.length ? (
                <div className="max-h-56 space-y-1.5 overflow-auto custom-scrollbar pr-1">
                  {payroll.noApprovedRequirement.map((row) => (
                    <div
                      key={`${row.circle}-${row.cmp}-${row.roleKey}`}
                      className="flex items-center justify-between rounded-lg bg-rose-50 dark:bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-700 dark:text-rose-400"
                    >
                      <span className="truncate">
                        {row.roleLabel} · {row.circle} / {row.cmp}
                      </span>
                      <span className="font-semibold">{row.available} · {formatINR(row.salary)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 p-4 text-center text-xs text-emerald-700 dark:text-emerald-400">
                  {lowCoverage
                    ? "No offered-salary records without an approved requirement — though salary data coverage is too low to be conclusive."
                    : "Every employee with an offered salary maps to an approved requirement."}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
