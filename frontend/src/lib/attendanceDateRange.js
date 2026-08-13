// Date-range preset constants/helpers shared between DateRangeFilter.jsx and
// FiltersBar.jsx. Same preset keys as the backend's resolveAttendanceDateRange
// (backend/services/attendanceService.js) and the same range/from/to param
// convention used by the KPI Dashboard's date filter.
export const DATE_RANGE_OPTIONS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "this_week", label: "This Week" },
  { key: "this_month", label: "This Month" },
  { key: "previous_month", label: "Previous Month" },
  { key: "custom", label: "Custom Range" },
];

export const DEFAULT_DATE_RANGE = { range: "this_month", from: "", to: "" };

export function dateRangeLabel(value) {
  if (value?.range === "custom" && value.from && value.to) {
    return `${value.from} → ${value.to}`;
  }
  return DATE_RANGE_OPTIONS.find((o) => o.key === value?.range)?.label || "This Month";
}

export function isDefaultDateRange(value) {
  return (value?.range || "this_month") === DEFAULT_DATE_RANGE.range;
}
