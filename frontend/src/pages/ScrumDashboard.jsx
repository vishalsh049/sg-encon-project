import { useEffect, useMemo, useRef, useState } from "react";
import {
  BriefcaseBusiness,
  Building2,
  CalendarRange,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  Eye,
  Layers3,
  RefreshCw,
  Search,
  ShieldCheck,
  Tags,
  UserCheck,
  UserCog,
  UserX,
  Users,
  Workflow,
} from "lucide-react";
import toast from "react-hot-toast";

import { authFetch, buildApiUrl } from "../lib/api";
import { getStoredSession } from "../lib/session";
import { cmpGroups, circleLabelFromTitle } from "../lib/cmpGroups";
import PremiumDatePicker from "../components/PremiumDatePicker";
import EnterpriseTable from "../components/scrumDashboard/EnterpriseTable";
import EmployeeDrilldownModal from "../components/scrumDashboard/EmployeeDrilldownModal";
import { ScrumDashboardCircleContext } from "../components/scrumDashboard/scrumDashboardCircleContext";

// ---------------------------------------------------------------------------
// Circle-permission scoping — verbatim local copy of the same logic in
// frontend/src/pages/HrDashboard.jsx (not exported from there), so this page
// gets identical single-circle-lock behavior without touching that file.
// ---------------------------------------------------------------------------
const normalizeCircle = (value = "") =>
  value
    .replace("Uttar Pradesh (East)", "UP East")
    .replace(/\s+/g, "")
    .toLowerCase()
    .trim();

const CIRCLE_KEY_ALIASES = {
  uttarpradesheast: "upeast",
};

const canonicalCircleKey = (value = "") => {
  const key = normalizeCircle(String(value).replace(/[()]/g, ""));
  return CIRCLE_KEY_ALIASES[key] || key;
};

const ALL_CIRCLE_KEYS = new Set(["", "all", "allcircle", "allcircles"]);

const allCircleLabels = cmpGroups.map((group) => circleLabelFromTitle(group.title));

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return String(value);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return String(value);
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// 14 KPI cards per the approved spec. `metric` cards open the employee
// drilldown filtered by that pipeline bucket; `scrollTo` cards jump to the
// matching summary table below (a "Total Circles" count isn't itself a
// filterable employee subset — the Circle Wise Summary table is the real
// breakdown); the two resource-dimension cards with no dedicated summary
// table open the full (currently filtered) employee list instead.
const kpiCardConfig = [
  { key: "total", label: "Total Resources", icon: Users, tint: "from-blue-50 via-white to-blue-50/70 border-blue-100/80 text-blue-700", badge: "bg-blue-100/80 text-blue-700" },
 // { key: "active", label: "Active Resources", icon: UserCheck, tint: "from-emerald-50 via-white to-emerald-50/70 border-emerald-100/80 text-emerald-700", badge: "bg-emerald-100/80 text-emerald-700", metric: "active" },
 // { key: "deactivated", label: "Deactivated Resources", icon: UserX, tint: "from-rose-50 via-white to-rose-50/70 border-rose-100/80 text-rose-700", badge: "bg-rose-100/80 text-rose-700", metric: "deactivated" },
 // { key: "level1Approved", label: "Level 1 Approved", icon: ShieldCheck, tint: "from-sky-50 via-white to-sky-50/70 border-sky-100/80 text-sky-700", badge: "bg-sky-100/80 text-sky-700", metric: "level1Approved" },
 // { key: "level2Approved", label: "Level 2 Approved", icon: ShieldCheck, tint: "from-indigo-50 via-white to-indigo-50/70 border-indigo-100/80 text-indigo-700", badge: "bg-indigo-100/80 text-indigo-700", metric: "level2Approved" },
  { key: "sasSuccess", label: "SAS Success", icon: CheckCircle2, tint: "from-teal-50 via-white to-teal-50/70 border-teal-100/80 text-teal-700", badge: "bg-teal-100/80 text-teal-700", metric: "sasSuccess" },
  { key: "cobCompleted", label: "COB Completed", icon: ClipboardCheck, tint: "from-violet-50 via-white to-violet-50/70 border-violet-100/80 text-violet-700", badge: "bg-violet-100/80 text-violet-700", metric: "cobCompleted" },
  { key: "pendingApproval", label: "Pending Approval", icon: Clock3, tint: "from-amber-50 via-white to-amber-50/70 border-amber-100/80 text-amber-700", badge: "bg-amber-100/80 text-amber-700", metric: "pendingApproval" },
 // { key: "totalCircles", label: "Total Circles", icon: Workflow, tint: "from-cyan-50 via-white to-cyan-50/70 border-cyan-100/80 text-cyan-700", badge: "bg-cyan-100/80 text-cyan-700", scrollTo: "circle" },
 // { key: "totalCmps", label: "Total CMPs", icon: Building2, tint: "from-blue-50 via-white to-blue-50/70 border-blue-100/80 text-blue-700", badge: "bg-blue-100/80 text-blue-700", scrollTo: "cmp" },
  { key: "totalVendors", label: "Total Vendors", icon: BriefcaseBusiness, tint: "from-purple-50 via-white to-purple-50/70 border-purple-100/80 text-purple-700", badge: "bg-purple-100/80 text-purple-700", scrollTo: "vendor" },
 // { key: "totalJobRoles", label: "Total Job Roles", icon: UserCog, tint: "from-pink-50 via-white to-pink-50/70 border-pink-100/80 text-pink-700", badge: "bg-pink-100/80 text-pink-700", scrollTo: "jobRole" },
 // { key: "totalResourceTypes", label: "Total Resource Types", icon: Layers3, tint: "from-slate-50 via-white to-slate-50/70 border-slate-200/80 text-slate-700", badge: "bg-slate-100/80 text-slate-700" },
 // { key: "totalResourceCategories", label: "Total Resource Categories", icon: Tags, tint: "from-slate-50 via-white to-slate-50/70 border-slate-200/80 text-slate-700", badge: "bg-slate-100/80 text-slate-700" },
];

function KpiCard({ card, value, onClick }) {
  const Icon = card.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[14px] border bg-gradient-to-br px-3 py-2 text-left transition hover:shadow-md hover:-translate-y-0.5 ${card.tint}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[0.62rem] font-semibold uppercase tracking-[0.14em]">{card.label}</p>
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${card.badge}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-1 text-xl font-bold text-slate-900">{value ?? "—"}</p>
    </button>
  );
}

export default function ScrumDashboard() {
  const sessionUser = useMemo(() => getStoredSession(), []);
  const rawUserCircle = sessionUser?.circle || "";
  const isAllCircleUser = ALL_CIRCLE_KEYS.has(canonicalCircleKey(rawUserCircle));

  const userCircleLabel = useMemo(() => {
    if (isAllCircleUser) return null;
    const userKey = canonicalCircleKey(rawUserCircle);
    return allCircleLabels.find((label) => canonicalCircleKey(label) === userKey) || null;
  }, [rawUserCircle, isAllCircleUser]);

  const allowedCircleLabels = useMemo(() => {
    if (isAllCircleUser) return allCircleLabels;
    return userCircleLabel ? [userCircleLabel] : [];
  }, [isAllCircleUser, userCircleLabel]);

  const circleContextValue = useMemo(
    () => ({ isAllCircleUser, userCircleLabel, allowedCircleLabels }),
    [isAllCircleUser, userCircleLabel, allowedCircleLabels]
  );

  // Filters
  const [search, setSearch] = useState("");
  const [circle, setCircle] = useState("");
  const [cmp, setCmp] = useState("");
  const [vendor, setVendor] = useState("");
  const [jobRole, setJobRole] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    if (!isAllCircleUser && userCircleLabel) setCircle(userCircleLabel);
  }, [isAllCircleUser, userCircleLabel]);

  const filteredCmpOptions = useMemo(
    () =>
      cmpGroups
        .filter((group) => allowedCircleLabels.includes(circleLabelFromTitle(group.title)))
        .filter((group) => (circle ? group.title.toLowerCase().includes(circle.toLowerCase()) : true))
        .flatMap((group) => group.items),
    [allowedCircleLabels, circle]
  );

  // Data
  const [filterOptions, setFilterOptions] = useState({});
  const [summary, setSummary] = useState(null);
  const [circleSummary, setCircleSummary] = useState([]);
  const [cmpSummary, setCmpSummary] = useState([]);
  const [vendorSummary, setVendorSummary] = useState([]);
  const [jobRoleSummary, setJobRoleSummary] = useState([]);
  const [statusSummary, setStatusSummary] = useState([]);
  const [recentUploads, setRecentUploads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [downloadingFile, setDownloadingFile] = useState("");

  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [drilldownScope, setDrilldownScope] = useState(null);

  const sectionRefs = useRef({});

  const openDrilldown = (scope) => {
    setDrilldownScope(scope);
    setDrilldownOpen(true);
  };

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (circle) params.set("circle", circle);
    if (cmp) params.set("cmp", cmp);
    if (vendor) params.set("vendor", vendor);
    if (jobRole) params.set("jobRole", jobRole);
    if (status) params.set("status", status);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return params;
  };

  const fetchFilterOptions = async () => {
    try {
      const params = new URLSearchParams();
      if (circle) params.set("circle", circle);
      const res = await authFetch(buildApiUrl(`/api/scrum-dashboard/filters?${params.toString()}`));
      const json = await res.json();
      if (json?.success) setFilterOptions(json);
    } catch (error) {
      console.log(error);
    }
  };

  const fetchAll = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const params = buildQueryParams().toString();
      const endpoints = [
        "summary",
        "circle-summary",
        "cmp-summary",
        "vendor-summary",
        "job-role-summary",
        "status-summary",
      ];

      const responses = await Promise.all([
        ...endpoints.map((endpoint) =>
          authFetch(buildApiUrl(`/api/scrum-dashboard/${endpoint}?${params}`))
        ),
        authFetch(buildApiUrl("/api/scrum-dashboard/recent-uploads")),
      ]);

      const payloads = await Promise.all(responses.map((r) => r.json()));
      const [summaryJson, circleJson, cmpJson, vendorJson, jobRoleJson, statusJson, uploadsJson] = payloads;

      if (!responses.every((r) => r.ok)) {
        throw new Error("One or more dashboard requests failed.");
      }

      setSummary(summaryJson?.data || null);
      setCircleSummary(circleJson?.data || []);
      setCmpSummary(cmpJson?.data || []);
      setVendorSummary(vendorJson?.data || []);
      setJobRoleSummary(jobRoleJson?.data || []);
      setStatusSummary(statusJson?.data || []);
      setRecentUploads(uploadsJson?.data || []);
      setLastRefreshedAt(new Date());
    } catch (error) {
      console.log(error);
      toast.error("Unable to refresh Scrum Dashboard. Please try again.", {
        id: "scrum-dashboard-refresh-error",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFilterOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circle]);

  useEffect(() => {
    const timer = window.setTimeout(() => fetchAll(), search ? 350 : 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, circle, cmp, vendor, jobRole, status, dateFrom, dateTo]);

  // Auto-updates the moment a new Excel file is uploaded on the Scrum upload
  // page, without the user having to manually refresh this tab.
  useEffect(() => {
    const interval = window.setInterval(() => fetchAll({ silent: true }), 60000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, circle, cmp, vendor, jobRole, status, dateFrom, dateTo]);

  const resetFilters = () => {
    setSearch("");
    setCircle(isAllCircleUser ? "" : userCircleLabel || "");
    setCmp("");
    setVendor("");
    setJobRole("");
    setStatus("");
    setDateFrom("");
    setDateTo("");
  };

  const handleKpiClick = (card) => {
    if (card.scrollTo) {
      sectionRefs.current[card.scrollTo]?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    openDrilldown({
      title: card.label,
      metric: card.metric,
      circle,
      cmp,
      vendor,
      jobRole,
      status,
    });
  };

  const handleDownloadFile = async (fileName) => {
    setDownloadingFile(fileName);
    try {
      const response = await authFetch(
        buildApiUrl(`/api/manpower/download/${encodeURIComponent(fileName)}`)
      );
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("File downloaded successfully.");
    } catch (error) {
      console.log(error);
      toast.error("Download failed. Please try again.");
    } finally {
      setDownloadingFile("");
    }
  };

  const lastRefreshedLabel = lastRefreshedAt
    ? `Last Refreshed: ${lastRefreshedAt.toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })}`
    : "Last Refreshed: --";

  const circleSummaryColumns = [
    { key: "circle", label: "Circle" },
    { key: "total", label: "Total Resources" },
    { key: "active", label: "Active" },
    { key: "deactivated", label: "Deactivated" },
    { key: "level1Approved", label: "Level 1 Approved" },
    { key: "level2Approved", label: "Level 2 Approved" },
    { key: "sasSuccess", label: "SAS Success" },
    { key: "cobCompleted", label: "COB Completed" },
    { key: "pending", label: "Pending" },
  ];

  const cmpSummaryColumns = [
    { key: "cmp", label: "CMP Name" },
    { key: "circle", label: "Circle" },
    { key: "total", label: "Total Resources" },
    { key: "active", label: "Active" },
    { key: "deactivated", label: "Deactivated" },
    { key: "pending", label: "Pending" },
  ];

  const vendorSummaryColumns = [
    { key: "vendor", label: "Vendor" },
    { key: "total", label: "Total Resources" },
    { key: "active", label: "Active" },
    { key: "deactivated", label: "Deactivated" },
    { key: "pending", label: "Pending" },
  ];

  const jobRoleSummaryColumns = [
    { key: "jobRole", label: "Job Role" },
    { key: "total", label: "Total Resources" },
    { key: "active", label: "Active" },
    { key: "deactivated", label: "Deactivated" },
    { key: "pending", label: "Pending" },
  ];

  const statusSummaryColumns = [
    { key: "status", label: "Status" },
    { key: "total", label: "Total Resources" },
  ];

  const recentUploadsColumns = [
    { key: "fileName", label: "File Name" },
    { key: "manualDate", label: "Upload Date", format: formatDate },
    { key: "uploadedBy", label: "Uploaded By" },
    { key: "circle", label: "Circle" },
    { key: "totalRecords", label: "Total Records" },
    { key: "status", label: "Status" },
    { key: "uploadedAt", label: "Uploaded At", format: formatDateTime },
    {
      key: "actions",
      label: "Actions",
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openDrilldown({
                title: `${row.fileName} — Uploaded Employees`,
                batchId: row.batchId,
              });
            }}
            title="View employees in this upload"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDownloadFile(row.fileName);
            }}
            disabled={downloadingFile === row.fileName}
            title="Download file"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <ScrumDashboardCircleContext.Provider value={circleContextValue}>
      <div className="min-h-screen">
        <div className="relative overflow-hidden rounded-[14px] border border-white/70 bg-[linear-gradient(96deg,_#4f46e5_0%,_#7c3aed_50%,_#a21caf_100%)] px-4 py-2 text-white md:px-4 md:py-2">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.22),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.14),_transparent_24%)]" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[18px] border border-white/20 bg-white/14 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] backdrop-blur-xl">
                <Layers3 className="h-4 w-4" />
              </div>
              <div>
                <h1 className="text-xs font-semibold uppercase tracking-[0.10em] md:text-sm">
                  SCRUM DASHBOARD
                </h1>
                <p className="text-xs text-white/85 md:text-sm">
                  Real-time Scrum manpower overview — requirement, approvals and deployment
                </p>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                onClick={() => fetchAll()}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-[14px] border border-white/20 bg-white/20 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <span className="text-[11px] font-medium text-white/85">{lastRefreshedLabel}</span>
            </div>
          </div>
        </div>

        <div className="rounded-[12px] border border-slate-200/70 bg-white/90 p-1 mt-1 backdrop-blur-xl">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
            <div className="relative xl:col-span-2">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search name, SAP ID, mobile, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full rounded-[12px] border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] pl-11 pr-4 text-[13px] text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
              />
            </div>

            <select
              value={circle}
              onChange={(e) => {
                setCircle(e.target.value);
                setCmp("");
              }}
              disabled={!isAllCircleUser}
              className="h-9 w-full rounded-[12px] border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] px-3 text-[13px] text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isAllCircleUser && <option value="">All Circles</option>}
              {allowedCircleLabels.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={cmp}
              onChange={(e) => setCmp(e.target.value)}
              className="h-9 w-full rounded-[12px] border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] px-3 text-[13px] text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
            >
              <option value="">All CMPs</option>
              {filteredCmpOptions.map((cmpName) => (
                <option key={cmpName} value={cmpName}>
                  {cmpName}
                </option>
              ))}
            </select>

            <select
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              className="h-9 w-full rounded-[12px] border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] px-3 text-[13px] text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
            >
              <option value="">All Vendors</option>
              {(filterOptions.vendors || []).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>

            <select
              value={jobRole}
              onChange={(e) => setJobRole(e.target.value)}
              className="h-9 w-full rounded-[12px] border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] px-3 text-[13px] text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
            >
              <option value="">All Job Roles</option>
              {(filterOptions.jobRoles || []).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 w-full rounded-[12px] border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] px-3 text-[13px] text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
            >
              <option value="">All Status</option>
              {(filterOptions.statuses || []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-[12px] bg-[linear-gradient(96deg,_#3b82f6_0%,_#7c3aed_100%)] px-4 text-sm font-semibold text-white transition hover:brightness-105"
            >
              <RefreshCw className="h-4 w-4" />
              Reset
            </button>
          </div>

          <div className="mt-2 grid grid-cols-1 gap-2 border-t border-slate-100 pt-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <CalendarRange className="h-3.5 w-3.5" />
              Date Range (Profile Upload)
            </div>
            <PremiumDatePicker value={dateFrom} onChange={setDateFrom} placeholder="From (YYYY-MM-DD)" />
            <PremiumDatePicker value={dateTo} onChange={setDateTo} placeholder="To (YYYY-MM-DD)" />
          </div>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7">
          {kpiCardConfig.map((card) => (
            <KpiCard
              key={card.key}
              card={card}
              value={summary ? summary[card.key] : "—"}
              onClick={() => handleKpiClick(card)}
            />
          ))}
        </div>

        <div className="mt-2 space-y-2">
          <div ref={(el) => (sectionRefs.current.circle = el)}>
            <EnterpriseTable
              title="Circle Wise Summary"
              subtitle="Requirement pipeline broken down by circle"
              columns={circleSummaryColumns}
              rows={circleSummary}
              loading={loading}
              defaultSortKey="circle"
              onRowClick={(row) => openDrilldown({ title: `${row.circle} — Scrum Employees`, circle: row.circle })}
              onRefresh={() => fetchAll()}
              fileBase="Scrum_Circle_Summary"
            />
          </div>

          <div ref={(el) => (sectionRefs.current.cmp = el)}>
            <EnterpriseTable
              title="CMP / Maintenance Point Summary"
              subtitle="Requirement pipeline broken down by CMP"
              columns={cmpSummaryColumns}
              rows={cmpSummary}
              loading={loading}
              defaultSortKey="cmp"
              onRowClick={(row) =>
                openDrilldown({ title: `${row.cmp} — Scrum Employees`, circle: row.circle, cmp: row.cmp })
              }
              onRefresh={() => fetchAll()}
              fileBase="Scrum_CMP_Summary"
            />
          </div>

          <div ref={(el) => (sectionRefs.current.vendor = el)}>
            <EnterpriseTable
              title="Vendor Summary"
              subtitle="Requirement pipeline broken down by vendor"
              columns={vendorSummaryColumns}
              rows={vendorSummary}
              loading={loading}
              defaultSortKey="vendor"
              onRowClick={(row) => openDrilldown({ title: `${row.vendor} — Scrum Employees`, vendor: row.vendor })}
              onRefresh={() => fetchAll()}
              fileBase="Scrum_Vendor_Summary"
            />
          </div>

          <div ref={(el) => (sectionRefs.current.jobRole = el)}>
            <EnterpriseTable
              title="Job Role Summary"
              subtitle="Requirement pipeline broken down by job role"
              columns={jobRoleSummaryColumns}
              rows={jobRoleSummary}
              loading={loading}
              defaultSortKey="total"
              onRowClick={(row) =>
                openDrilldown({ title: `${row.jobRole} — Scrum Employees`, jobRoleCategory: row.jobRole })
              }
              onRefresh={() => fetchAll()}
              fileBase="Scrum_JobRole_Summary"
            />
          </div>

          <div ref={(el) => (sectionRefs.current.status = el)}>
            <EnterpriseTable
              title="Status Summary"
              subtitle="Resource count by real upload status"
              columns={statusSummaryColumns}
              rows={statusSummary}
              loading={loading}
              defaultSortKey="total"
              onRowClick={(row) => openDrilldown({ title: `${row.status} — Scrum Employees`, status: row.status })}
              onRefresh={() => fetchAll()}
              fileBase="Scrum_Status_Summary"
            />
          </div>

          <div ref={(el) => (sectionRefs.current.uploads = el)}>
            <EnterpriseTable
              title="Recent Uploaded Scrum Files"
              subtitle="Latest Scrum Excel uploads (this app auto-refreshes off the newest batch)"
              columns={recentUploadsColumns}
              rows={recentUploads}
              loading={loading}
              defaultSortKey="uploadedAt"
              onRefresh={() => fetchAll()}
              fileBase="Scrum_Recent_Uploads"
            />
          </div>
        </div>

        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
          <div className="rounded-[14px] border border-slate-200/70 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] px-4 py-2">
            <p className="text-sm font-semibold text-blue-600">How to Read</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Pending Approval = Active resources awaiting Level 1 sign-off. Deactivated combines any resource with a
              deactivation date or a status marked deactivated.
            </p>
          </div>
          <div className="rounded-[14px] border border-slate-200/70 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] px-4 py-2">
            <p className="text-sm font-semibold text-violet-700">Approval Pipeline</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Level 1 → Level 2 → SAS Success → COB Completed reflects the order resources move through after profile
              upload, driven entirely by the dated columns on each record.
            </p>
          </div>
          <div className="rounded-[14px] border border-slate-200/70 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] px-4 py-2">
            <p className="text-sm font-semibold text-emerald-700">Always Latest Upload</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Every number here reflects the most recently uploaded Scrum batch for your circle scope — upload a new
              file on the Scrum page and this dashboard updates automatically.
            </p>
          </div>
        </div>

        <EmployeeDrilldownModal
          isOpen={drilldownOpen}
          scope={drilldownScope}
          filterOptions={filterOptions}
          onClose={() => setDrilldownOpen(false)}
        />
      </div>
    </ScrumDashboardCircleContext.Provider>
  );
}
