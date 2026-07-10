import { Phone, CreditCard, Layers, CalendarDays } from "lucide-react";
import StatusBadge from "./StatusBadge";

/** Compact candidate card used in the mobile list view. */
export default function EmployeeCard({ employee, onClick, actions }) {
  return (
    <div
      onClick={onClick}
      className="cursor-pointer rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-800">{employee.full_name}</p>
          <p className="text-xs text-slate-400">
            {employee.employee_code || employee.email || `#${employee.id}`}
          </p>
        </div>
        <StatusBadge status={employee.status} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5 text-slate-400" />
          {employee.mobile || "—"}
        </span>
        <span className="flex items-center gap-1.5 font-mono">
          <CreditCard className="h-3.5 w-3.5 text-slate-400" />
          {employee.aadhaar_no || "—"}
        </span>
        <span className="flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-slate-400" />
          {employee.training_batch || "No batch"}
        </span>
        <span className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
          {String(employee.created_at || "").slice(0, 10) || "—"}
        </span>
      </div>

      {actions ? (
        <div className="mt-3 border-t border-slate-50 pt-2" onClick={(event) => event.stopPropagation()}>
          {actions(employee)}
        </div>
      ) : null}
    </div>
  );
}
