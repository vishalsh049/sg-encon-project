import { Check, X } from "lucide-react";
import { trackerState } from "../../lib/expenseClaimStatus";

// Horizontal stepper: Raised -> L1 Approved -> L2 Approved -> Final Approved -> Finance.
// Finance is the read-only end state, not a processing step.
export default function ClaimProgressTracker({ status }) {
  const steps = trackerState(status);

  return (
    <div className="flex w-full items-start gap-1 overflow-x-auto pb-1">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const done = step.state === "done";
        const current = step.state === "current";
        const rejected = step.state === "rejected";

        return (
          <div key={step.key} className="flex min-w-[92px] flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <div className="h-0.5 flex-1 bg-transparent" />
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition ${
                  done
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : current
                    ? "border-indigo-500 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"
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
              }`}
            >
              {step.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
