import { useNavigate } from "react-router-dom";
import { ArrowLeft, Pencil, UserRound } from "lucide-react";
import StatusBadge from "./StatusBadge";

/** Top card on the candidate profile page. */
export default function ProfileHeader({ employee, children }) {
  const navigate = useNavigate();

  if (!employee) return null;

  const initials = String(employee.full_name || "?")
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="relative overflow-hidden rounded-[22px] border border-white/70 bg-surface/90 p-5 shadow-sm backdrop-blur-xl">
      <div className="absolute inset-x-10 -top-8 h-24 rounded-full bg-gradient-to-r from-blue-400/20 via-indigo-400/20 to-violet-400/20 blur-3xl" />

      <div className="relative flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-2xl border border-border-color bg-surface text-text-muted transition hover:bg-surface-muted"
          title="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-bold text-white shadow">
          {initials || <UserRound className="h-6 w-6" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-semibold tracking-tight text-text-primary">
              {employee.full_name}
            </h1>
            <StatusBadge status={employee.status} />
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            {employee.employee_code ? (
              <span className="font-semibold text-indigo-600 dark:text-indigo-400">{employee.employee_code}</span>
            ) : (
              `Candidate #${employee.id}`
            )}
            {employee.training_batch ? ` · Batch ${employee.training_batch}` : ""}
            {employee.circle ? ` · ${employee.circle}` : ""}
            {` · Registered ${String(employee.created_at || "").slice(0, 10)}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {employee.status !== "Converted" ? (
            <button
              type="button"
              onClick={() => navigate(`/dashboard/training/employees/${employee.id}/edit`)}
              className="flex h-9 items-center gap-1.5 rounded-2xl border border-border-color bg-surface px-3 text-sm font-medium text-text-secondary transition hover:bg-surface-muted"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}
