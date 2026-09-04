import { Check, X } from "lucide-react";
import { trackerState } from "../../lib/expenseClaimStatus";

// Optional stage labels + one-line descriptions for the Raise Expense screen.
// Every other screen calls <ClaimProgressTracker status=… /> with no extra
// props and gets the original compact tracker, unchanged.
const STEP_DETAIL = {
  raised: { label: "Raise Expense", desc: "Fill expense details" },
  l1: { label: "L1 Approval", desc: "Line Manager" },
  l2: { label: "L2 Approval", desc: "Department Head" },
  final: { label: "Final Approval", desc: "Finance Review" },
  finance: { label: "Finance / Archived", desc: "Payment & Closure" },
};

// Horizontal stepper: Raised -> L1 Approved -> L2 Approved -> Final Approved -> Finance.
// Finance is the read-only end state, not a processing step.
export default function ClaimProgressTracker({ status, showDescriptions = false }) {
  const steps = trackerState(status);

  return (
    <div className="flex w-full items-start gap-1 overflow-x-auto pb-1">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const done = step.state === "done";
        const current = step.state === "current";
        const rejected = step.state === "rejected";
        const detail = STEP_DETAIL[step.key] || {};

        return (
          <div
            key={step.key}
            className={`flex flex-1 flex-col items-center ${
              showDescriptions ? "min-w-[104px]" : "min-w-[92px]"
            }`}
          >
            <div className="flex w-full items-center">
              <div className="h-0.5 flex-1 bg-transparent" />
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition ${
                  done
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : current
                    ? showDescriptions
                      ? "border-indigo-500 bg-indigo-500 text-white shadow-[0_0_0_4px_rgba(99,102,241,0.15)]"
                      : "border-indigo-500 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"
                    : rejected
                    ? "border-rose-400 bg-rose-50 text-rose-500 dark:bg-rose-500/10"
                    : "border-border-color bg-surface text-text-muted"
                }`}
              >
                {done ? <Check size={15} /> : rejected ? <X size={15} /> : index + 1}
              </div>
              <div
                className={`h-0.5 flex-1 ${
                  isLast ? "bg-transparent" : done ? "bg-emerald-500" : "bg-border-color"
                }`}
              />
            </div>
            <div
              className={`mt-1.5 text-center text-[11px] font-medium leading-tight ${
                current
                  ? "text-indigo-600 dark:text-indigo-300"
                  : done
                  ? "text-text-primary"
                  : "text-text-muted"
              } ${showDescriptions ? "font-semibold" : ""}`}
            >
              {showDescriptions && detail.label ? detail.label : step.label}
            </div>
            {showDescriptions && detail.desc ? (
              <div className="mt-0.5 text-center text-[10px] leading-tight text-text-muted">
                {detail.desc}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
