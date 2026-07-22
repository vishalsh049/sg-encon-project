// Every chart type the KPI dashboard offers. Lives here rather than beside the
// renderer so the renderer, the type picker and the persisted-preference
// migration all read one list and can never drift apart.
export const CHART_TYPES = [
  { key: "line",    label: "Line Chart",  hint: "Trend over time — best for spotting dips and recoveries" },
  { key: "bar",     label: "Bar Chart",   hint: "Side-by-side comparison of the most recent days" },
  { key: "stacked", label: "Stacked Bar", hint: "Combined daily composition across circles / CMPs" },
  { key: "table",   label: "Table View",  hint: "Exact values, sortable and searchable" },
];

export const isChartType = (key) => CHART_TYPES.some((t) => t.key === key);
