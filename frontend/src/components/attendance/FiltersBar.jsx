import { useEffect, useState } from "react";
import Select from "react-select";
import { Download, AlertTriangle, Search } from "lucide-react";

import { ATTENDANCE_STATUS_OPTIONS, ATTENDANCE_STATUS_META } from "../../lib/attendanceStatus";

const selectStyles = {
  control: (provided, state) => ({
    ...provided,
    minHeight: "36px",
    height: "36px",
    borderRadius: "8px",
    borderColor: state.isFocused ? "rgb(var(--color-primary))" : "rgb(var(--color-border))",
    boxShadow: state.isFocused ? "0 0 0 3px rgba(99,102,241,0.15)" : "none",
    fontSize: "13px",
    backgroundColor: "rgb(var(--color-surface))",
  }),
  valueContainer: (provided) => ({ ...provided, height: "32px", padding: "0 12px" }),
  indicatorsContainer: (provided) => ({ ...provided, height: "32px" }),
  menu: (provided) => ({ ...provided, zIndex: 99999, marginTop: 2, backgroundColor: "rgb(var(--color-surface-elevated))" }),
  menuList: (provided) => ({ ...provided, maxHeight: "260px", paddingTop: 0 }),
  input: (provided) => ({ ...provided, fontSize: "12px", color: "rgb(var(--color-text-primary))" }),
  singleValue: (provided) => ({ ...provided, color: "rgb(var(--color-text-primary))" }),
};

// P/A/L legend next to the Status filter, so the codes used throughout the
// page (filter, records table, upload preview) never need explaining
// anywhere else.
function StatusLegend() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-text-muted">
      {Object.entries(ATTENDANCE_STATUS_META).map(([code, meta]) => (
        <span key={code} className="inline-flex items-center gap-1">
          <span className={`h-2 w-2 rounded-full ${meta.dotClass}`} />
          {code} = {meta.label}
        </span>
      ))}
    </div>
  );
}

export default function FiltersBar({
  month,
  onMonthChange,
  filters,
  onFiltersChange,
  circleOptions,
  cmpOptions,
  jobRoleOptions,
  onExport,
  onCheckMissing,
}) {
  const [searchInput, setSearchInput] = useState(filters.search || "");

  // Debounced so typing a name doesn't fire a records request on every
  // keystroke — only once typing pauses for 400ms.
  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchInput !== filters.search) {
        onFiltersChange({ search: searchInput });
      }
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="month"
          value={month}
          onChange={(e) => onMonthChange(e.target.value)}
          className="h-9 rounded-lg border border-border-color bg-surface px-3 text-sm text-text-primary"
        />
        <div className="w-44">
          <Select
            styles={selectStyles}
            placeholder="Circle"
            isClearable
            options={circleOptions}
            value={circleOptions.find((o) => o.value === filters.circle) || null}
            onChange={(selected) => onFiltersChange({ circle: selected?.value || "", cmp: "" })}
          />
        </div>
        <div className="w-44">
          <Select
            styles={selectStyles}
            placeholder="CMP"
            isClearable
            options={cmpOptions}
            value={cmpOptions.find((o) => o.value === filters.cmp) || null}
            onChange={(selected) => onFiltersChange({ cmp: selected?.value || "" })}
          />
        </div>
        <div className="w-52">
          <Select
            styles={selectStyles}
            placeholder="Job Role"
            isClearable
            options={jobRoleOptions}
            value={jobRoleOptions.find((o) => o.value === filters.jobRole) || null}
            onChange={(selected) => onFiltersChange({ jobRole: selected?.value || "" })}
          />
        </div>
        <div className="w-40">
          <Select
            styles={selectStyles}
            placeholder="Status"
            isClearable
            options={ATTENDANCE_STATUS_OPTIONS}
            value={ATTENDANCE_STATUS_OPTIONS.find((o) => o.value === filters.status) || null}
            onChange={(selected) => onFiltersChange({ status: selected?.value || "" })}
          />
        </div>
        <div className="relative w-52">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name or HRMS ID"
            className="h-9 w-full rounded-lg border border-border-color bg-surface pl-8 pr-3 text-sm text-text-primary"
          />
        </div>
        <button
          type="button"
          onClick={onExport}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-color bg-surface px-3 text-sm font-medium text-text-secondary transition hover:text-text-primary"
        >
          <Download size={14} />
          Export Excel
        </button>
        <button
          type="button"
          onClick={onCheckMissing}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-color bg-surface px-3 text-sm font-medium text-text-secondary transition hover:text-text-primary"
        >
          <AlertTriangle size={14} />
          Check Missing Attendance
        </button>
      </div>
      <StatusLegend />
    </div>
  );
}
