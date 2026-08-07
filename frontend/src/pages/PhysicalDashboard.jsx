import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  BarChart3,
  Briefcase,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Layers3,
  Printer,
  RefreshCcw,
  Search,
  Users,
} from "lucide-react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { authFetch, buildApiUrl } from "../lib/api";

const DRILLDOWN_PAGE_SIZE = 10;

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function SectionCard({ title, subtitle, children, className = "" }) {
  return (
    <div className={`rounded-2xl border border-border-color bg-surface p-4 shadow-sm ${className}`.trim()}>
      <div className="mb-2">
        <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
        {subtitle ? <p className="text-sm text-text-muted">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

function StatCard({ title, value, subtitle, icon: Icon, accent }) {
  return (
    <div className={`w-full rounded-2xl border border-border-color bg-gradient-to-br ${accent} p-2 shadow-sm`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-text-secondary">{title}</p>
          <p className="mt-1 text-xl font-semibold text-text-primary">{value}</p>
          {subtitle ? <p className="mt-1 text-sm text-text-muted">{subtitle}</p> : null}
        </div>
        <div className="rounded-xl bg-surface/70 p-2 text-text-secondary">
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

const ITEM_TONES = {
  Complete: "text-emerald-600 dark:text-emerald-400",
  Pending: "text-amber-600 dark:text-amber-400",
  Exempted: "text-text-muted",
  Active: "text-emerald-600 dark:text-emerald-400",
  "Active Employees": "text-emerald-600 dark:text-emerald-400",
  Inactive: "text-rose-600 dark:text-rose-400",
  "Inactive Employees": "text-rose-600 dark:text-rose-400",
  "Not Applicable": "text-text-muted",
};

function TableShell({ title, subtitle, searchValue, onSearchChange, columns, rows, onRowClick, onSortChange, page, totalPages, onPageChange, totalRecords, emptyMessage, loading, exportLabel, onExport }) {
  return (
    <SectionCard title={title} subtitle={subtitle} className="overflow-hidden">
      <div className="mb-2 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <span>{totalRecords} records</span>
          {exportLabel ? (
            <button type="button" onClick={onExport} className="flex items-center gap-1 rounded-lg border border-border-color px-2.5 py-1.5 font-medium text-text-secondary">
              <Download size={14} />
              {exportLabel}
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border-color bg-surface-muted px-3 py-2">
          <Search size={14} className="text-text-muted" />
          <input value={searchValue} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search table" className="w-40 bg-transparent text-sm outline-none" />
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="h-10 animate-pulse rounded-xl bg-surface-muted" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-color bg-surface-muted p-5 text-sm text-text-muted">{emptyMessage}</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border-color text-sm">
              <thead className="bg-surface-muted">
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} className="px-3 py-2 text-left font-semibold text-text-secondary">
                      {column.sortable ? (
                        <button type="button" onClick={() => onSortChange(column.key)} className="flex items-center gap-1">
                          {column.label}
                          <ArrowUpDown size={13} className="text-text-muted" />
                        </button>
                      ) : (
                        column.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-color bg-surface">
                {rows.map((row) => (
                  <tr key={row.id} onClick={() => onRowClick(row)} className="cursor-pointer transition hover:bg-surface-muted">
                    {columns.map((column) => (
                      <td key={`${row.id}-${column.key}`} className="px-3 py-2 text-text-secondary">
                        {column.render ? column.render(row) : row[column.key] ?? "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-text-muted">
            <span>Page {page} of {Math.max(totalPages, 1)}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1} className="rounded-lg border border-border-color px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-50">
                <ChevronLeft size={14} />
              </button>
              <button type="button" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="rounded-lg border border-border-color px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-50">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </>
      )}
    </SectionCard>
  );
}

export default function PhysicalDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [filterOptions, setFilterOptions] = useState({ circles: [], cmps: [], jobRoles: [], employmentStatuses: [], pprjStatuses: [] });
  const [filters, setFilters] = useState({
    circle: "",
    cmp: "",
    jobRole: "",
    employmentStatus: "",
    pprjStatus: "",
    dateFrom: "",
    dateTo: "",
  });
  const [drilldown, setDrilldown] = useState({
    open: false,
    title: "",
    metric: "",
    field: "",
    value: "",
    page: 1,
    rows: [],
    total: 0,
    totalPages: 1,
    loading: false,
    exporting: false,
    search: "",
    sortBy: "employee_name",
    sortOrder: "asc",
  });
  const lastFetchedSearch = useRef("");
  const [tableState, setTableState] = useState({
    circle: { search: "", sortBy: "total_employees", sortOrder: "desc", page: 1, pageSize: 10 },
    cmp: { search: "", sortBy: "total_employees", sortOrder: "desc", page: 1, pageSize: 10 },
    jobRole: { search: "", sortBy: "total_employees", sortOrder: "desc", page: 1, pageSize: 10 },
  });

  const buildFilterParams = () => {
    const params = new URLSearchParams();
    if (filters.circle) params.set("circle", filters.circle);
    if (filters.cmp) params.set("cmp", filters.cmp);
    if (filters.jobRole) params.set("jobRole", filters.jobRole);
    if (filters.employmentStatus) params.set("employmentStatus", filters.employmentStatus);
    if (filters.pprjStatus) params.set("pprjStatus", filters.pprjStatus);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    return params;
  };

  const loadFilterOptions = async (circle = "") => {
    try {
      const params = new URLSearchParams();
      if (circle) params.set("circle", circle);
      const response = await authFetch(buildApiUrl(`/api/physical/dashboard/filter-options?${params.toString()}`));
      const result = await response.json();
      if (response.ok && result.success) {
        setFilterOptions(result.data || { circles: [], cmps: [], jobRoles: [], employmentStatuses: [], pprjStatuses: [] });
      }
    } catch (err) {
      console.error("Failed to load filter options", err);
    }
  };

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      setError("");
      const params = buildFilterParams();
      const response = await authFetch(buildApiUrl(`/api/physical/dashboard/analytics?${params.toString()}`));
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to load analytics");
      }
      setData(result.data || null);
    } catch (err) {
      setError(err.message || "Unable to load analytics");
    } finally {
      setLoading(false);
    }
  };

  // CMP options narrow to the selected circle.
  useEffect(() => {
    loadFilterOptions(filters.circle);
  }, [filters.circle]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadAnalytics();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [filters.circle, filters.cmp, filters.jobRole, filters.employmentStatus, filters.pprjStatus, filters.dateFrom, filters.dateTo]);

  const refreshDashboard = () => {
    loadAnalytics();
  };

  const buildDrilldownParams = (state, extra = {}) => {
    const params = buildFilterParams();
    params.set("metric", state.metric);
    if (state.field) params.set("field", state.field);
    if (state.value) params.set("value", state.value);
    if (state.search) params.set("search", state.search);
    params.set("sortBy", state.sortBy);
    params.set("sortOrder", state.sortOrder);
    params.set("page", String(extra.page || state.page || 1));
    params.set("pageSize", String(extra.pageSize || DRILLDOWN_PAGE_SIZE));
    if (extra.export) params.set("export", "true");
    return params;
  };

  const fetchDrilldown = async (next) => {
    lastFetchedSearch.current = String(next.search || "");
    setDrilldown((prev) => ({ ...prev, ...next, open: true, loading: true }));
    try {
      const params = buildDrilldownParams(next);
      const response = await authFetch(buildApiUrl(`/api/physical/dashboard/drilldown?${params.toString()}`));
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to load employee details");
      }
      setDrilldown((prev) => ({
        ...prev,
        loading: false,
        rows: result.data || [],
        total: result.pagination?.totalRecords || 0,
        totalPages: result.pagination?.totalPages || 1,
      }));
    } catch (err) {
      setDrilldown((prev) => ({ ...prev, loading: false, rows: [], total: 0, totalPages: 1 }));
      setError(err.message || "Unable to load employee details");
    }
  };

  const openDrilldown = (title, metric, field, value = "") => {
    fetchDrilldown({ title, metric, field, value, page: 1, search: "", sortBy: "employee_name", sortOrder: "asc" });
  };

  const drilldownContext = () => ({
    title: drilldown.title,
    metric: drilldown.metric,
    field: drilldown.field,
    value: drilldown.value,
    search: drilldown.search,
    sortBy: drilldown.sortBy,
    sortOrder: drilldown.sortOrder,
  });

  // Debounced popup search — one API call per pause, not per keystroke.
  useEffect(() => {
    if (!drilldown.open) return undefined;
    if (drilldown.search === lastFetchedSearch.current) return undefined;
    const timer = window.setTimeout(() => {
      fetchDrilldown({ ...drilldownContext(), page: 1 });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [drilldown.search]);

  const loadDrilldownPage = (pageNumber) => {
    const nextPage = Math.min(Math.max(1, pageNumber), Math.max(1, drilldown.totalPages));
    if (nextPage === drilldown.page) return;
    fetchDrilldown({ ...drilldownContext(), page: nextPage });
  };

  const toggleDrilldownSort = (key) => {
    const sortOrder = drilldown.sortBy === key && drilldown.sortOrder === "asc" ? "desc" : "asc";
    fetchDrilldown({ ...drilldownContext(), page: 1, sortBy: key, sortOrder });
  };

  const mapDrilldownRow = (row) => ({
    "Employee Code": row.employee_code || "",
    "Employee Name": row.employee_name || "",
    Circle: row.circle || "",
    CMP: row.cmp || "",
    "Job Role": row.job_role || "",
    "Employment Status": row.employment_status || "",
    "PPRJ Status": row.pprj_status || "",
    "Mobile Number": row.mobile_number || "",
    "Date Of Joining": row.date_of_joining || "",
    Aadhaar: row.aadhaar_no || "",
    PAN: row.pan_no || "",
    "Bank Account": row.bank_account_no || "",
    IFSC: row.ifsc_code || "",
    UAN: row.uan_no || "",
    ESIC: row.esic_ip_no || "",
    PF: row.pf_no || "",
    "Missing Field(s)": row.missing_fields || "",
  });

  // Exports pull the full filtered result set from the server,
  // not just the rows on the current popup page.
  const fetchAllDrilldownRows = async () => {
    const params = buildDrilldownParams(drilldownContext(), { page: 1, pageSize: 10000, export: true });
    const response = await authFetch(buildApiUrl(`/api/physical/dashboard/drilldown?${params.toString()}`));
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Export failed");
    }
    return (result.data || []).map(mapDrilldownRow);
  };

  const exportDrilldown = async (format) => {
    try {
      setDrilldown((prev) => ({ ...prev, exporting: true }));
      const rows = await fetchAllDrilldownRows();
      if (!rows.length) return;
      const fileBase = `physical-${(drilldown.title || "drilldown").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;

      if (format === "csv") {
        const csv = [Object.keys(rows[0]).join(",")]
          .concat(rows.map((row) => Object.values(row).map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")))
          .join("\n");
        saveAs(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `${fileBase}.csv`);
      } else {
        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Employees");
        const workbookData = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
        saveAs(new Blob([workbookData], { type: "application/octet-stream" }), `${fileBase}.xlsx`);
      }
    } catch (err) {
      setError(err.message || "Export failed");
    } finally {
      setDrilldown((prev) => ({ ...prev, exporting: false }));
    }
  };

  // The single source of truth for every document tracking card.
  // Each field appears exactly once on the dashboard.
  const documentCards = useMemo(() => {
    const summary = data?.documentSummary;
    if (!summary) return [];

    const fieldCard = (key, title, summaryKey, field, withExempted = false) => ({
      key,
      title,
      items: [
        { label: "Complete", count: summary[summaryKey]?.completed || 0, metric: "field_status", field, drillValue: "complete" },
        { label: "Pending", count: summary[summaryKey]?.pending || 0, metric: "field_status", field, drillValue: "pending" },
        ...(withExempted
          ? [{ label: "Exempted", count: summary[summaryKey]?.exempted || 0, metric: "field_status", field, drillValue: "exempted" }]
          : []),
      ],
    });

    return [
      {
        key: "pprjStatus",
        title: "PPRJ Status",
        items: [
          { label: "Active", count: summary.pprjStatus?.active || 0, metric: "pprj_status", field: "pprj_status", drillValue: "Active" },
          { label: "Inactive", count: summary.pprjStatus?.inactive || 0, metric: "pprj_status", field: "pprj_status", drillValue: "Inactive" },
          { label: "Pending", count: summary.pprjStatus?.pending || 0, metric: "pprj_status", field: "pprj_status", drillValue: "Pending" },
          { label: "Not Applicable", count: summary.pprjStatus?.notApplicable || 0, metric: "pprj_status", field: "pprj_status", drillValue: "Not Applicable" },
        ],
      },
     // fieldCard("pprjCode", "PPRJ Code", "pprjCode", "pprj_code"),
      fieldCard("employeeCode", "Employee Code", "employeeCode", "employee_code"),
      fieldCard("mobile", "Mobile Number", "mobile", "mobile_number"),
     // fieldCard("joiningDate", "Date Of Joining", "joiningDate", "date_of_joining"),
      {
        key: "employmentStatus",
        title: "Employment Status",
        items: [
          { label: "Active Employees", count: summary.employmentStatus?.active || 0, metric: "employment_status", field: "employment_status", drillValue: "Active" },
          { label: "Inactive Employees", count: summary.employmentStatus?.inactive || 0, metric: "employment_status", field: "employment_status", drillValue: "Inactive" },
        ],
      },
    //  fieldCard("resignedDate", "Resigned Date", "resignedDate", "resigned_date"),
   //   fieldCard("lastWorkingDate", "Last Working Date", "lastWorkingDate", "last_working_date"),
      fieldCard("ifsc", "IFSC Code", "ifsc", "ifsc_code"),
      fieldCard("bankAccount", "Bank Account Number", "bankAccount", "bank_account_no"),
      fieldCard("pan", "PAN Number", "pan", "pan_no"),
      fieldCard("aadhaar", "Aadhaar Number", "aadhaar", "aadhaar_no"),
      fieldCard("uan", "UAN Number", "uan", "uan_no"),
      fieldCard("esic", "ESIC IP Number", "esic", "esic_ip_no", true),
      fieldCard("pf", "PF Number", "pf", "pf_no", true),
  {
  key: "gtli",
  title: "GTLI",
  items: [
    {
      label: "Covered",
      count: summary.gtli?.covered || 0,
      metric: "gtli_status",
      field: "gtli",
      drillValue: "Covered",
    },
    {
      label: "Pending",
      count: summary.gtli?.pending || 0,
      metric: "gtli_status",
      field: "gtli",
      drillValue: "Pending",
    },
    {
      label: "Not Applicable",
      count: summary.gtli?.notApplicable || 0,
      metric: "gtli_status",
      field: "gtli",
      drillValue: "Not Applicable",
    },
  ],
},
    ];
  }, [data]);

  const summaryCards = useMemo(() => {
    if (!data?.summary) return [];
    return [
      { title: "Total Employees", value: formatNumber(data.summary.totalEmployees), subtitle: "All visible employees", icon: Users, accent: "from-indigo-50 to-indigo-100" },
      { title: "New Joinings", value: formatNumber(data.summary.newJoinings), subtitle: "This month", icon: CalendarDays, accent: "from-sky-50 to-sky-100" },
      { title: "Resigned Employees", value: formatNumber(data.summary.resignedEmployees), subtitle: "Separated records", icon: Briefcase, accent: "from-rose-50 to-rose-100" },
    {
  title: "Active Employees",
  value: formatNumber(data.summary.activeEmployees),
  subtitle: "Currently working",
  icon: Users,
  accent: "from-emerald-50 to-emerald-100"
},
{
  title: "Inactive Employees",
  value: formatNumber(data.summary.inactiveEmployees),
  subtitle: "Separated / Inactive",
  icon: Users,
  accent: "from-rose-50 to-rose-100"
},
    ];
  }, [data]);

  const circleRows = useMemo(() => (data?.circleBreakdown || []).map((item) => ({
    id: `circle-${item.label}`,
    label: item.label,
    total_employees: Number(item.total_employees || 0),
    active_employees: Number(item.active_employees || 0),
    inactive_employees: Number(item.inactive_employees || 0),
    pf_pending: Number(item.pf_pending || 0),
    aadhaar_pending: Number(item.aadhaar_pending || 0),
    bank_pending: Number(item.bank_pending || 0),
    uan_pending: Number(item.uan_pending || 0),
    esic_pending: Number(item.esic_pending || 0),
    completion_percentage: Number(item.completion_percentage || 0),
  })), [data]);

  const cmpRows = useMemo(() => (data?.cmpBreakdown || []).map((item) => ({
    id: `cmp-${item.label}`,
    label: item.label,
    total_employees: Number(item.total_employees || 0),
    active_employees: Number(item.active_employees || 0),
    inactive_employees: Number(item.inactive_employees || 0),
    pending_documents: Number(item.pf_pending || 0) + Number(item.aadhaar_pending || 0) + Number(item.bank_pending || 0) + Number(item.uan_pending || 0) + Number(item.esic_pending || 0),
    completion_percentage: Number(item.completion_percentage || 0),
  })), [data]);

  const jobRoleRows = useMemo(() => (data?.jobRoleBreakdown || []).map((item) => ({
    id: `job-${item.label}`,
    label: item.label,
    total_employees: Number(item.total_employees || 0),
    missing_documents: Number(item.missing_documents || 0),
    completion_percentage: Number(item.completion_percentage || 0),
  })), [data]);

  const paginateRows = (rows, tableKey) => {
    const state = tableState[tableKey];
    const search = state.search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      const haystack = Object.values(row).join(" ").toLowerCase();
      return haystack.includes(search);
    });

    const sorted = [...filtered].sort((left, right) => {
      const leftValue = left[state.sortBy] ?? "";
      const rightValue = right[state.sortBy] ?? "";
      const multiplier = state.sortOrder === "asc" ? 1 : -1;
      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return (leftValue - rightValue) * multiplier;
      }
      return String(leftValue).localeCompare(String(rightValue)) * multiplier;
    });

    const totalPages = Math.max(1, Math.ceil(sorted.length / state.pageSize));
    const safePage = Math.min(state.page, totalPages);
    const start = (safePage - 1) * state.pageSize;
    return { rows: sorted.slice(start, start + state.pageSize), totalPages, page: safePage, totalRecords: sorted.length };
  };

  const circleTable = useMemo(() => paginateRows(circleRows, "circle"), [circleRows, tableState.circle]);
  const cmpTable = useMemo(() => paginateRows(cmpRows, "cmp"), [cmpRows, tableState.cmp]);
  const jobRoleTable = useMemo(() => paginateRows(jobRoleRows, "jobRole"), [jobRoleRows, tableState.jobRole]);

  const updateTableState = (tableKey, updates) => {
    setTableState((prev) => ({
      ...prev,
      [tableKey]: { ...prev[tableKey], ...updates },
    }));
  };

  const exportAllTables = () => {
    const workbook = XLSX.utils.book_new();
    const sheetRows = [
      { sheet: "Circle Analytics", rows: circleRows },
      { sheet: "CMP Analytics", rows: cmpRows },
      { sheet: "Job Role Analytics", rows: jobRoleRows },
    ];

    sheetRows.forEach(({ sheet, rows }) => {
      const worksheet = XLSX.utils.json_to_sheet(rows.map(({ id, ...row }) => row));
      XLSX.utils.book_append_sheet(workbook, worksheet, sheet);
    });

    const workbookData = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([workbookData], { type: "application/octet-stream" });
    saveAs(blob, `physical-dashboard-${Date.now()}.xlsx`);
  };

  const drilldownColumns = [
    { key: "employee_code", label: "Emp Code", sortable: true },
    { key: "employee_name", label: "Employee Name", sortable: true },
    { key: "circle", label: "Circle", sortable: true },
    { key: "cmp", label: "CMP", sortable: true },
    { key: "job_role", label: "Job Role", sortable: true },
    { key: "employment_status", label: "Status", sortable: true },
    { key: "pprj_status", label: "PPRJ", sortable: false },
    { key: "mobile_number", label: "Mobile", sortable: false },
    { key: "date_of_joining", label: "DOJ", sortable: true },
    { key: "aadhaar_no", label: "Aadhaar", sortable: false },
    { key: "pan_no", label: "PAN", sortable: false },
    { key: "bank_account_no", label: "Bank A/c", sortable: false },
    { key: "ifsc_code", label: "IFSC", sortable: false },
    { key: "uan_no", label: "UAN", sortable: false },
    { key: "esic_ip_no", label: "ESIC", sortable: false },
    { key: "pf_no", label: "PF", sortable: false },
  ];

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-8xl space-y-4">
        <div className=" top-0 z-20 rounded-3xl border border-border-color bg-surface/95 p-4 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-1 text-sm font-medium text-indigo-600 dark:text-indigo-400">
                <FileText size={12} />
                Physical Analytics Dashboard
              </div>
              <h1 className="mt-1 text-lg font-semibold text-text-primary">Employee document tracking</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={refreshDashboard} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">
                <RefreshCcw size={16} />
                Refresh
              </button>
              <button type="button" onClick={exportAllTables} className="flex items-center gap-2 rounded-xl border border-border-color px-3 py-2 text-sm font-semibold text-text-secondary">
                <Download size={16} />
                Export Excel
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4 xl:grid-cols-5">
            <div className="rounded-2xl border border-border-color bg-surface-muted p-2 xl:col-span-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Circle</label>
              <select value={filters.circle} onChange={(event) => setFilters((prev) => ({ ...prev, circle: event.target.value, cmp: "" }))} className="w-full rounded-xl border border-border-color bg-surface px-3 py-2 text-sm">
                <option value="">All circles</option>
                {filterOptions.circles.map((circle) => (
                  <option key={circle} value={circle}>{circle}</option>
                ))}
              </select>
            </div>
            <div className="rounded-2xl border border-border-color bg-surface-muted p-2 xl:col-span-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">CMP</label>
              <select value={filters.cmp} onChange={(event) => setFilters((prev) => ({ ...prev, cmp: event.target.value }))} className="w-full rounded-xl border border-border-color bg-surface px-3 py-2 text-sm">
                <option value="">All CMPs</option>
                {filterOptions.cmps.map((cmp) => (
                  <option key={cmp} value={cmp}>{cmp}</option>
                ))}
              </select>
            </div>
          {/*  <div className="rounded-2xl border border-border-color bg-surface-muted p-2 xl:col-span-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Job Role</label>
              <select value={filters.jobRole} onChange={(event) => setFilters((prev) => ({ ...prev, jobRole: event.target.value }))} className="w-full rounded-xl border border-border-color bg-surface px-3 py-2 text-sm">
                <option value="">All roles</option>
                {filterOptions.jobRoles.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>
             */}
            <div className="rounded-2xl border border-border-color bg-surface-muted p-2 xl:col-span-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Employment Status</label>
              <select value={filters.employmentStatus} onChange={(event) => setFilters((prev) => ({ ...prev, employmentStatus: event.target.value }))} className="w-full rounded-xl border border-border-color bg-surface px-3 py-2 text-sm">
                <option value="">All status</option>
                {filterOptions.employmentStatuses.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
         {/*    <div className="rounded-2xl border border-border-color bg-surface-muted p-2 xl:col-span-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">PPRJ Status</label>
              <select value={filters.pprjStatus} onChange={(event) => setFilters((prev) => ({ ...prev, pprjStatus: event.target.value }))} className="w-full rounded-xl border border-border-color bg-surface px-3 py-2 text-sm">
                <option value="">All PPRJ status</option>
                {filterOptions.pprjStatuses.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
            */}
           <div className="rounded-2xl border border-border-color bg-surface-muted p-2 xl:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Date Range (DOJ)</label>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={filters.dateFrom} onChange={(event) => setFilters((prev) => ({ ...prev, dateFrom: event.target.value }))} className="w-full rounded-xl border border-border-color bg-surface px-3 py-2 text-sm" />
                <input type="date" value={filters.dateTo} onChange={(event) => setFilters((prev) => ({ ...prev, dateTo: event.target.value }))} className="w-full rounded-xl border border-border-color bg-surface px-3 py-2 text-sm" />
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="grid gap-2 lg:grid-cols-6">
              {[...Array(6)].map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-2xl bg-surface-muted" />
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-3">
              {[...Array(6)].map((_, index) => (
                <div key={index} className="h-40 animate-pulse rounded-2xl bg-surface-muted" />
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10 p-6 text-sm text-rose-700 dark:text-rose-400">{error}</div>
        ) : !data ? (
          <div className="rounded-2xl border border-border-color bg-surface p-10 text-center text-text-muted">No analytics data available yet.</div>
        ) : (
          <>
            <div className="grid gap-2 lg:grid-cols-5">
              {summaryCards.map((card) => (
                <StatCard key={card.title} {...card} />
              ))}
            </div>

            <SectionCard title="Enterprise Document Tracking" subtitle="Click any count to see the employees behind it. Each field appears exactly once.">
              <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
                {documentCards.map((card) => (
                  <div key={card.key} className="rounded-2xl border border-border-color bg-surface-muted p-3">
                    <h4 className="mb-2 text-sm font-semibold text-text-primary">{card.title}</h4>
                    <div className="grid gap-2">
                      {card.items.map((item) => (
                        <button
                          key={`${card.key}-${item.label}`}
                          type="button"
                          onClick={() => openDrilldown(`${card.title} — ${item.label}`, item.metric, item.field, item.drillValue)}
                          className="flex items-center justify-between rounded-xl border border-border-color bg-surface px-3 py-2 text-left text-sm transition hover:border-indigo-300 hover:dark:border-indigo-500/30 hover:shadow-sm"
                        >
                          <span className={`font-medium ${ITEM_TONES[item.label] || "text-text-secondary"}`}>{item.label}</span>
                          <span className="font-semibold text-text-primary">{formatNumber(item.count)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <TableShell title="Circle Analytics" subtitle="Organization-wide headcount and pending document concentration"
             searchValue={tableState.circle.search} onSearchChange={(value) =>
              updateTableState("circle", { search: value, page: 1 })} 
              columns={[{ key: "label", label: "Circle", sortable: true },
              { key: "total_employees", label: "Total Employees", sortable: true },
               { key: "active_employees", label: "Active", sortable: true },
                { key: "inactive_employees", label: "Inactive", sortable: true },
                 { key: "pf_pending", label: "PF Pending", sortable: true },
                  { key: "aadhaar_pending", label: "Aadhaar Pending", sortable: true },
                   { key: "bank_pending", label: "Bank Pending", sortable: true }, 
                   { key: "uan_pending", label: "UAN Pending", sortable: true },
                    { key: "esic_pending", label: "ESIC Pending", sortable: true }, 
                    ]} 
                    rows={circleTable.rows} onRowClick={(row) => openDrilldown(`Circle — ${row.label}`, "circle", "circle", row.label)}
                     onSortChange={(key) => updateTableState("circle", { sortBy: key, sortOrder: tableState.circle.sortBy === key && tableState.circle.sortOrder === "asc" ? "desc" : "asc", page: 1 })} page={circleTable.page} totalPages={circleTable.totalPages} onPageChange={(page) => updateTableState("circle", { page })} totalRecords={circleTable.totalRecords} emptyMessage="No circle data available for the current filters." loading={false} exportLabel="Export circles" onExport={() => exportAllTables()} />

            <TableShell title="CMP Analytics" subtitle="CMP-level workforce and document backlog" searchValue={tableState.cmp.search} onSearchChange={(value) => updateTableState("cmp", { search: value, page: 1 })} columns={[{ key: "label", label: "CMP", sortable: true }, { key: "total_employees", label: "Total Employees", sortable: true }, { key: "active_employees", label: "Active", sortable: true }, { key: "inactive_employees", label: "Inactive", sortable: true }, 
               ]} rows={cmpTable.rows} onRowClick={(row) => openDrilldown(`CMP — ${row.label}`, "cmp", "cmp", row.label)} onSortChange={(key) => updateTableState("cmp", { sortBy: key, sortOrder: tableState.cmp.sortBy === key && tableState.cmp.sortOrder === "asc" ? "desc" : "asc", page: 1 })} page={cmpTable.page} totalPages={cmpTable.totalPages} onPageChange={(page) => updateTableState("cmp", { page })} totalRecords={cmpTable.totalRecords} emptyMessage="No CMP data available for the current filters." loading={false} exportLabel="Export CMPs" onExport={() => exportAllTables()} />

            <TableShell title="Job Role Analytics" subtitle="Role-wise headcount and missing document concentration" searchValue={tableState.jobRole.search} onSearchChange={(value) => updateTableState("jobRole", { search: value, page: 1 })} columns={[{ key: "label", label: "Job Role", sortable: true }, { key: "total_employees", label: "Employee Count", sortable: true },]} rows={jobRoleTable.rows} onRowClick={(row) => openDrilldown(`Job Role — ${row.label}`, "job_role", "job_role", row.label)} onSortChange={(key) => updateTableState("jobRole", { sortBy: key, sortOrder: tableState.jobRole.sortBy === key && tableState.jobRole.sortOrder === "asc" ? "desc" : "asc", page: 1 })} page={jobRoleTable.page} totalPages={jobRoleTable.totalPages} onPageChange={(page) => updateTableState("jobRole", { page })} totalRecords={jobRoleTable.totalRecords} emptyMessage="No job role data available for the current filters." loading={false} exportLabel="Export roles" onExport={() => exportAllTables()} />
          </>
        )}
      </div>

      {drilldown.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/60 p-4">
          <div className="flex max-h-[90vh] w-full max-w-7xl flex-col rounded-3xl bg-surface shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-color px-5 py-4 print:hidden">
              <div>
                <h3 className="text-lg font-semibold text-text-primary">{drilldown.title || "Employee details"}</h3>
                <p className="text-sm text-text-muted">{formatNumber(drilldown.total)} employees match this selection</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 rounded-xl border border-border-color bg-surface-muted px-3 py-2">
                  <Search size={14} className="text-text-muted" />
                  <input
                    value={drilldown.search}
                    onChange={(event) => setDrilldown((prev) => ({ ...prev, search: event.target.value }))}
                    placeholder="Name, code, Aadhaar, mobile"
                    className="w-52 bg-transparent text-sm outline-none"
                  />
                </div>
                <button type="button" disabled={drilldown.exporting} onClick={() => exportDrilldown("xlsx")} className="rounded-xl border border-border-color px-3 py-2 text-sm font-medium text-text-secondary disabled:opacity-50">
                  {drilldown.exporting ? "Exporting..." : "Export Excel"}
                </button>
                <button type="button" disabled={drilldown.exporting} onClick={() => exportDrilldown("csv")} className="rounded-xl border border-border-color px-3 py-2 text-sm font-medium text-text-secondary disabled:opacity-50">
                  Export CSV
                </button>
                <button type="button" onClick={() => window.print()} className="flex items-center gap-1 rounded-xl border border-border-color px-3 py-2 text-sm font-medium text-text-secondary">
                  <Printer size={14} />
                  Print
                </button>
                <button type="button" onClick={() => setDrilldown((prev) => ({ ...prev, open: false }))} className="rounded-xl border border-border-color px-3 py-2 text-sm font-medium text-text-secondary">
                  Close
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-5">
              {drilldown.loading ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, index) => (
                    <div key={index} className="h-10 animate-pulse rounded-xl bg-surface-muted" />
                  ))}
                </div>
              ) : drilldown.rows.length === 0 ? (
                <div className="text-sm text-text-muted">No employees found for this selection.</div>
              ) : (
                <div className="space-y-3">
                  <div className="overflow-x-auto rounded-2xl border border-border-color">
                    <table className="min-w-full divide-y divide-border-color text-sm">
                      <thead className="bg-surface-muted">
                        <tr>
                          {drilldownColumns.map((column) => (
                            <th key={column.key} className="whitespace-nowrap px-3 py-2 text-left font-semibold text-text-secondary">
                              {column.sortable ? (
                                <button type="button" onClick={() => toggleDrilldownSort(column.key)} className="flex items-center gap-1">
                                  {column.label}
                                  <ArrowUpDown size={13} className="text-text-muted" />
                                </button>
                              ) : (
                                column.label
                              )}
                            </th>
                          ))}
                          <th className="whitespace-nowrap px-3 py-2 text-left font-semibold text-text-secondary">Missing Field(s)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-color bg-surface">
                        {drilldown.rows.map((row) => (
                          <tr key={row.id} className="hover:bg-surface-muted">
                            {drilldownColumns.map((column) => (
                              <td key={`${row.id}-${column.key}`} className="whitespace-nowrap px-3 py-2 text-text-secondary">
                                {row[column.key] || "-"}
                              </td>
                            ))}
                            <td className="px-3 py-2">
                              {row.missing_fields ? (
                                <span className="text-xs font-medium text-amber-700 dark:text-amber-400">{row.missing_fields}</span>
                              ) : (
                                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">All documents complete</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between text-sm text-text-muted print:hidden">
                    <span>Page {drilldown.page} of {Math.max(drilldown.totalPages, 1)}</span>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => loadDrilldownPage(drilldown.page - 1)} disabled={drilldown.page === 1} className="rounded-lg border border-border-color px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-50">
                        <ChevronLeft size={14} />
                      </button>
                      <button type="button" onClick={() => loadDrilldownPage(drilldown.page + 1)} disabled={drilldown.page >= drilldown.totalPages} className="rounded-lg border border-border-color px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-50">
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
