import { CalendarDays, Filter, Layers, RotateCcw } from "lucide-react";

const STATUS_OPTIONS = ["Pending", "Under Review", "Approved", "Rejected", "Converted"];

function Field({ icon: Icon, label, children }) {
  return (
    <div className="min-w-[150px] flex-1">
      <label className="mb-1 flex items-center gap-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100";

/**
 * Filter row: status, training batch, registration date range.
 * value: { status, batch, dateFrom, dateTo }
 */
export default function Filters({ value, onChange, batches = [], onReset }) {
  const set = (key, fieldValue) => onChange({ ...value, [key]: fieldValue });

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field icon={Filter} label="Status">
        <select
          value={value.status || ""}
          onChange={(event) => set("status", event.target.value)}
          className={inputClass}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </Field>

      <Field icon={Layers} label="Training Batch">
        <select
          value={value.batch || ""}
          onChange={(event) => set("batch", event.target.value)}
          className={inputClass}
        >
          <option value="">All batches</option>
          {batches.map((batch) => (
            <option key={batch} value={batch}>
              {batch}
            </option>
          ))}
        </select>
      </Field>

      <Field icon={CalendarDays} label="Registered From">
        <input
          type="date"
          value={value.dateFrom || ""}
          onChange={(event) => set("dateFrom", event.target.value)}
          className={inputClass}
        />
      </Field>

      <Field icon={CalendarDays} label="Registered To">
        <input
          type="date"
          value={value.dateTo || ""}
          onChange={(event) => set("dateTo", event.target.value)}
          className={inputClass}
        />
      </Field>

      <button
        type="button"
        onClick={onReset}
        className="flex h-10 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Reset
      </button>
    </div>
  );
}
