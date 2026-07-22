import { Phone, CreditCard, Layers, CalendarDays } from "lucide-react";
import StatusBadge from "./StatusBadge";

/** Compact candidate card used in the mobile list view. */
export default function EmployeeCard({ employee, onClick, actions }) {
  return (
    <div
      onClick={onClick}
      className="cursor-pointer rounded-2xl border border-border-color bg-surface p-4 shadow-sm transition hover:border-blue-200 hover:dark:border-blue-500/20 hover:shadow"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-text-primary">{employee.full_name}</p>
          <p className="text-xs text-text-muted">
            {employee.employee_code || employee.email || `#${employee.id}`}
          </p>
        </div>
        <StatusBadge status={employee.status} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-text-secondary">
        <span className="flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5 text-text-muted" />
          {employee.mobile || "—"}
        </span>
        <span className="flex items-center gap-1.5 font-mono">
          <CreditCard className="h-3.5 w-3.5 text-text-muted" />
          {employee.aadhaar_no || "—"}
        </span>
        <span className="flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-text-muted" />
          {employee.training_batch || "No batch"}
        </span>
        <span className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 text-text-muted" />
          {String(employee.created_at || "").slice(0, 10) || "—"}
        </span>
      </div>

      {actions ? (
        <div className="mt-3 border-t border-border-color pt-2" onClick={(event) => event.stopPropagation()}>
          {actions(employee)}
        </div>
      ) : null}
    </div>
  );
}
