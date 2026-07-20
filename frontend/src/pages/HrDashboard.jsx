import React, { startTransition, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  BriefcaseBusiness,
  CalendarRange,
  ChevronDown,
  Layers3,
  RefreshCcw,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  UserCog,
  Workflow,
  BadgeCheck,
  Lightbulb,
  BarChart3,
  Download,
  Maximize2,
  X,
  FileSpreadsheet,
  FileText,
  FileDown,
} from "lucide-react";

import toast from "react-hot-toast";

import { authFetch, buildApiUrl } from "../lib/api";
import { getStoredSession } from "../lib/session";
import { cmpGroups, circleLabelFromTitle } from "../lib/cmpGroups";
import { HrDashboardCircleContext } from "../components/hrDashboard/hrDashboardCircleContext";
import DrilldownModal from "../components/hrDashboard/DrilldownModal";

const physicalDesignationColumns = [
  { key: "state_leadership_team", label: "State Leadership Team" },
  { key: "noc_executive", label: "NOC Executive" },
  { key: "analyst", label: "Analyst" },
  { key: "cmp_lead", label: "CMP Lead" },
  { key: "technician", label: "Technician" },
  { key: "rigger", label: "Rigger" },
  { key: "utility_supervisor", label: "Utility Supervisor" },
  { key: "utility_engineer", label: "Utility Engineer" },
  { key: "isp_engineer", label: "ISP Engineer" },
  { key: "wh_incharge_cum_security", label: "WH Incharge cum Security" },
  { key: "splicer", label: "Splicer" },
  { key: "assistant_splicer", label: "Assistant Splicer" },
  { key: "fiber_helper", label: "Fiber Helper" },
  { key: "patroller", label: "Patroller" },
  { key: "fiber_supervisor", label: "Fiber Supervisor" },
  { key: "fibre_engineer", label: "Fibre Engineer" },
  { key: "fttx_splicer", label: "FTTx Splicer" },
  { key: "fttx_assistant_splicer", label: "FTTx Assistant Splicer" },
  { key: "fttx_supervisor", label: "FTTx Supervisor" },
  { key: "fttx_helper", label: "FTTx Helper" },
  { key: "fttx_engineer", label: "FTTx Engineer" },
  { key: "fttx_technician", label: "FTTx Technician" },
];

const scrumDesignationColumns = physicalDesignationColumns;

const statCardConfig = [
  {
    key: "admin",
    label: "Admin",
    icon: UserCog,
    tint:
      "from-blue-50 via-white to-blue-50/70 border-blue-100/80 text-blue-700",
    badge: "bg-blue-100/80 text-blue-700",
    valueClass: "text-blue-700",
  },
  {
    key: "utility",
    label: "Utility & ISP",
    icon: Workflow,
    tint:
      "from-violet-50 via-white to-violet-50/70 border-violet-100/80 text-violet-700",
    badge: "bg-violet-100/80 text-violet-700",
    valueClass: "text-violet-700",
  },
 {
  key: "fiber",
  label: "Fiber",
  icon: Users,
  tint:
    "from-cyan-50 via-white to-sky-50/70 border-cyan-100/80 text-cyan-700",
  badge: "bg-cyan-100/80 text-cyan-700",
  valueClass: "text-cyan-700",
},
{
  key: "fttx",
  label: "FTTX",
  icon: BadgeCheck,
  tint:
    "from-indigo-50 via-white to-blue-50/70 border-indigo-100/80 text-indigo-700",
  badge: "bg-indigo-100/80 text-indigo-700",
  valueClass: "text-indigo-700",
},
  {
    key: "fttxPo",
    label: "FTTX PO Based",
    icon: BarChart3,
    tint:
      "from-emerald-50 via-white to-teal-50/70 border-emerald-100/80 text-emerald-700",
    badge: "bg-emerald-100/80 text-emerald-700",
    valueClass: "text-emerald-700",
  },

];

const normalizeCircle = (value = "") =>
  value
    .replace("Uttar Pradesh (East)", "UP East")
    .replace(/\s+/g, "")
    .toLowerCase()
    .trim();

const normalizeCmpName = (value = "") =>
  value.replace("Bhatinda", "Bathinda").trim().toLowerCase();

// Circle label derived straight from the cmpGroups titles (imported from
// ../lib/cmpGroups), so adding a new circle group there automatically makes
// it a selectable circle everywhere on this page.
const allCircleLabels = cmpGroups.map((group) => circleLabelFromTitle(group.title));

// A couple of circle names are stored inconsistently across the app
// ("UP East" vs "Uttar Pradesh (East)" / "Uttar Pradesh East"). Strip
// spaces/parens and fold known aliases so every spelling of the same
// circle resolves to the same key.
const CIRCLE_KEY_ALIASES = {
  uttarpradesheast: "upeast",
};

const canonicalCircleKey = (value = "") => {
  const key = normalizeCircle(String(value).replace(/[()]/g, ""));
  return CIRCLE_KEY_ALIASES[key] || key;
};

const ALL_CIRCLE_KEYS = new Set(["", "all", "allcircle", "allcircles"]);

// Mirrors the dashboard's filteredGroups memo so the fullscreen and export
// popups can filter with their own local Search/Circle/CMP state without
// touching the dashboard's filters.
const filterCmpGroups = (groupsSource, searchText, selectedCircle, selectedCmp) =>
  groupsSource
    .map((group) => ({
      ...group,
      items: group.items.filter((cmp) => {
        const searchMatch = cmp
          .toLowerCase()
          .includes(searchText.toLowerCase());

        const circleMatch =
          selectedCircle === ""
            ? true
            : group.title.toLowerCase().includes(selectedCircle.toLowerCase());

        const cmpMatch = selectedCmp === "" ? true : cmp === selectedCmp;

        return searchMatch && circleMatch && cmpMatch;
      }),
    }))
    .filter((group) => group.items.length > 0);

const cmpOptionsForCircle = (groupsSource, selectedCircle) =>
  groupsSource
    .filter((group) =>
      selectedCircle === ""
        ? true
        : group.title.toLowerCase().includes(selectedCircle.toLowerCase())
    )
    .flatMap((group) => group.items);

// Flattens the RAG grid into plain rows (Circle, CMP, then R/A/G per
// designation) for the client-side CSV and PDF exports. Reads the exact same
// lookups the on-screen table renders from — no extra API calls.
const buildRagExportRows = ({
  groups,
  columns,
  countLookup,
  getSignoffRow,
  showJoining,
}) => {
  const header = ["Circle", "CMP"];
  columns.forEach((column) => {
    header.push(`${column.label} (R)`, `${column.label} (A)`, `${column.label} (G)`);
  });

  const rows = [];
  groups.forEach((group) => {
    const circleName = circleLabelFromTitle(group.title);
    group.items.forEach((cmpName) => {
      const signoffRow = getSignoffRow(cmpName);
      const row = [circleName, cmpName];

      columns.forEach((column) => {
        const requirement = Number(signoffRow?.[column.key] || 0);
        const available = Number(
          showJoining
            ? countLookup?.[cmpName]?.[column.key]?.total || 0
            : countLookup?.[cmpName]?.[column.key] || 0
        );
        row.push(requirement, available, requirement - available);
      });

      rows.push(row);
    });
  });

  return { header, rows };
};

const csvCell = (value) => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const downloadRagCsv = (fileName, header, rows) => {
  const csv = [header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");

  // UTF-8 BOM so Excel opens the CSV with correct encoding.
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// PDF export: renders the flattened RAG rows into a print-optimised page and
// opens the browser print dialog (user saves as PDF) — no extra dependency.
const printRagPdf = ({ title, filtersSummary, header, rows }) => {
  const printWindow = window.open("", "_blank", "width=1280,height=800");
  if (!printWindow) {
    toast.error("Popup blocked. Please allow popups to export PDF.");
    return;
  }

  const headerHtml = header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("");
  const bodyHtml = rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`
    )
    .join("");

  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A3 landscape; margin: 8mm; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; margin: 14px; }
  h1 { font-size: 15px; margin: 0 0 2px; color: #1e3a8a; }
  p.meta { font-size: 9px; color: #475569; margin: 0 0 8px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #cbd5e1; padding: 2px 3px; font-size: 6.5px; text-align: center; white-space: nowrap; }
  th { background: #1e3a8a; color: #ffffff; font-weight: 600; }
  td:first-child, td:nth-child(2) { text-align: left; font-weight: 600; background: #f8fafc; }
  tr:nth-child(even) td { background: #f1f5f9; }
  tr:nth-child(even) td:first-child, tr:nth-child(even) td:nth-child(2) { background: #e2e8f0; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p class="meta">${escapeHtml(filtersSummary)} &nbsp;|&nbsp; Generated: ${escapeHtml(
    new Date().toLocaleString()
  )}</p>
<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>
</body>
</html>`);

  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 500);
};

function HrDashboard() {
  const [jobRoles, setJobRoles] = useState([]);
  const [circles, setCircles] = useState([]);
  const [employmentStatus, setEmploymentStatus] = useState([]);
  const [signoffData, setSignoffData] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [selectedCircle, setSelectedCircle] = useState("");
  const [selectedCmp, setSelectedCmp] = useState("");
  const [activeData, setActiveData] = useState([]);
  const [scrumActiveData, setScrumActiveData] = useState([]);
  const [scrumCount, setScrumCount] = useState({
    total: 0,
    active: 0,
    inactive: 0,
  });
  const [exportingPhysical, setExportingPhysical] = useState(false);
  const [exportingScrum, setExportingScrum] = useState(false);
  // "physical" | "scrum" | null — which panel's fullscreen / export popup is open.
  const [fullScreenPanel, setFullScreenPanel] = useState(null);
  const [exportModalPanel, setExportModalPanel] = useState(null);
  // Filters the export popup should start from: set when opened from the
  // fullscreen view (which has its own local filters); null means it opens
  // with the dashboard's current filters.
  const [exportModalFilters, setExportModalFilters] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const refreshAbortRef = useRef(null);
  const refreshPromiseRef = useRef(null);
  const snapshotHashRef = useRef({
    jobRoles: "",
    circles: "",
    employmentStatus: "",
    scrumCount: "",
    signoffData: "",
    activeData: "",
    scrumActiveData: "",
  });

  // Logged-in user's circle permission — drives which circle sections,
  // filters, totals, and exports are visible on this page.
  const sessionUser = useMemo(() => getStoredSession(), []);
  const rawUserCircle = sessionUser?.circle || "";
  const isAllCircleUser = ALL_CIRCLE_KEYS.has(canonicalCircleKey(rawUserCircle));

  const userCircleLabel = useMemo(() => {
    if (isAllCircleUser) return null;
    const userKey = canonicalCircleKey(rawUserCircle);
    return (
      allCircleLabels.find((label) => canonicalCircleKey(label) === userKey) || null
    );
  }, [rawUserCircle, isAllCircleUser]);

  const allowedCircleLabels = useMemo(() => {
    if (isAllCircleUser) return allCircleLabels;
    return userCircleLabel ? [userCircleLabel] : [];
  }, [isAllCircleUser, userCircleLabel]);

  const visibleCmpGroups = useMemo(
    () =>
      cmpGroups.filter((group) =>
        allowedCircleLabels.includes(circleLabelFromTitle(group.title))
      ),
    [allowedCircleLabels]
  );

  // Single-circle users only ever have one valid circle — lock the filter
  // to it so every section (including Export Excel) scopes to it by default.
  useEffect(() => {
    if (!isAllCircleUser && userCircleLabel) {
      setSelectedCircle(userCircleLabel);
    }
  }, [isAllCircleUser, userCircleLabel]);

  useEffect(() => {
    const physical = document.getElementById("physicalScroll");
    const scrum = document.getElementById("scrumScroll");

    if (!physical || !scrum) return undefined;

    const syncPhysical = () => {
      scrum.scrollLeft = physical.scrollLeft;
      scrum.scrollTop = physical.scrollTop;
    };

    const syncScrum = () => {
      physical.scrollLeft = scrum.scrollLeft;
      physical.scrollTop = scrum.scrollTop;
    };

    physical.addEventListener("scroll", syncPhysical);
    scrum.addEventListener("scroll", syncScrum);

    return () => {
      physical.removeEventListener("scroll", syncPhysical);
      scrum.removeEventListener("scroll", syncScrum);
    };
  }, []);

  const setStateIfChanged = (key, nextValue, setState) => {
    const nextHash = JSON.stringify(nextValue);

    if (snapshotHashRef.current[key] === nextHash) {
      return false;
    }

    snapshotHashRef.current[key] = nextHash;
    setState(nextValue);
    return true;
  };

  const fetchJson = async (path, signal) => {
    const response = await authFetch(buildApiUrl(path), { signal });
    const contentType = response.headers.get("content-type") || "";
    let payload = null;

    if (contentType.includes("application/json")) {
      payload = await response.json();
    }

    if (!response.ok) {
      throw new Error(payload?.message || "Failed to load HR dashboard data.");
    }

    return payload;
  };

  const applySnapshot = (snapshot) => {
    startTransition(() => {
      setStateIfChanged("jobRoles", snapshot.jobRoles, setJobRoles);
      setStateIfChanged("circles", snapshot.circles, setCircles);
      setStateIfChanged(
        "employmentStatus",
        snapshot.employmentStatus,
        setEmploymentStatus
      );
      setStateIfChanged("scrumCount", snapshot.scrumCount, setScrumCount);
      setStateIfChanged("signoffData", snapshot.signoffData, setSignoffData);
      setStateIfChanged("activeData", snapshot.activeData, setActiveData);
      setStateIfChanged(
        "scrumActiveData",
        snapshot.scrumActiveData,
        setScrumActiveData
      );
    });
  };

  const refreshDashboard = async ({
    reason = "manual",
    silent = false,
    forceRestart = false,
  } = {}) => {
    if (refreshPromiseRef.current && forceRestart) {
      refreshAbortRef.current?.abort();
    }

    if (refreshPromiseRef.current && !forceRestart) {
      if (reason === "manual") {
        refreshAbortRef.current?.abort();
      } else {
        return refreshPromiseRef.current;
      }
    }

    const controller = new AbortController();
    refreshAbortRef.current = controller;
    setIsRefreshing(true);

    const refreshPromise = (async () => {
      try {
        const [
          jobRoleResult,
          circleResult,
          employmentResult,
          scrumCountResult,
          signoffResult,
          activeDataResult,
          scrumActiveResult,
        ] = await Promise.all([
          fetchJson("/api/physical/job-role-count", controller.signal),
          fetchJson("/api/physical/circle-count", controller.signal),
          fetchJson("/api/physical/employment-status-count", controller.signal),
          fetchJson("/api/manpower/scrum/count", controller.signal),
          fetchJson("/api/signoff", controller.signal),
          fetchJson("/api/physical/active-job-role-cmp-count", controller.signal),
          fetchJson("/api/manpower/scrum/cmp-role-count", controller.signal),
        ]);

        applySnapshot({
          jobRoles: jobRoleResult?.success ? jobRoleResult.data || [] : [],
          circles: circleResult?.success ? circleResult.data || [] : [],
          employmentStatus: employmentResult?.success
            ? employmentResult.data || []
            : [],
          scrumCount: scrumCountResult || {
            total: 0,
            active: 0,
            inactive: 0,
          },
          signoffData: signoffResult?.rows || [],
          activeData: activeDataResult?.success ? activeDataResult.data || [] : [],
          scrumActiveData: scrumActiveResult?.success
            ? scrumActiveResult.data || []
            : [],
        });

        setLastRefreshedAt(new Date());
      } catch (error) {
        if (error?.name === "AbortError") {
          return;
        }

        console.log(error);
        toast.error("Unable to refresh dashboard. Please try again.", {
          id: "hr-dashboard-refresh-error",
        });
      } finally {
        if (refreshAbortRef.current === controller) {
          refreshAbortRef.current = null;
        }
        if (refreshPromiseRef.current === refreshPromise) {
          refreshPromiseRef.current = null;
          setIsRefreshing(false);
        }
      }
    })();

    refreshPromiseRef.current = refreshPromise;
    return refreshPromise;
  };

  useEffect(() => {
    void refreshDashboard({ reason: "initial", silent: true });

    return () => {
      refreshAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshDashboard({ reason: "auto", silent: true });
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, []);

  const signoffLookup = useMemo(() => {
    return signoffData.reduce((lookup, row) => {
      lookup[normalizeCmpName(row?.cmp)] = row;
      return lookup;
    }, {});
  }, [signoffData]);

 const activeCountLookup = useMemo(() => {

  return activeData.reduce((lookup, item) => {

   const cmpName = item?.cmp;
    const roleKey = item?.role_key;

    if (!cmpName || !roleKey) return lookup;

    if (!lookup[cmpName]) {
      lookup[cmpName] = {};
    }

    lookup[cmpName][roleKey] = {
      physical_count: Number(item?.physical_count || 0),
      new_joining_count: Number(item?.new_joining_count || 0),
      total: Number(item?.total || 0),
    };

    return lookup;

  }, {});

}, [activeData]);

  const scrumActiveCountLookup = useMemo(() => {
    return scrumActiveData.reduce((lookup, item) => {
      const cmpName = item?.cmp;
      const roleKey = item?.role_key;
      const total = Number(item?.total || 0);

      if (!cmpName || !roleKey) return lookup;

      if (!lookup[cmpName]) {
        lookup[cmpName] = {};
      }

      lookup[cmpName][roleKey] = total;
      return lookup;
    }, {});
  }, [scrumActiveData]);

  const filteredGroups = useMemo(() => {
    return visibleCmpGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((cmp) => {
          const searchMatch = cmp
            .toLowerCase()
            .includes(searchText.toLowerCase());

          const circleMatch =
            selectedCircle === ""
              ? true
              : group.title.toLowerCase().includes(selectedCircle.toLowerCase());

          const cmpMatch = selectedCmp === "" ? true : cmp === selectedCmp;

          return searchMatch && circleMatch && cmpMatch;
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [visibleCmpGroups, searchText, selectedCircle, selectedCmp]);

  const categoryTotals = useMemo(() => {
    const filteredData = signoffData.filter((row) => {
      const searchMatch = row.cmp
        ?.toLowerCase()
        .includes(searchText.toLowerCase());

      const circleMatch =
        selectedCircle === ""
          ? true
          : normalizeCircle(row.circle)?.includes(normalizeCircle(selectedCircle));

      const cmpMatch = selectedCmp === "" ? true : row.cmp === selectedCmp;

      return searchMatch && circleMatch && cmpMatch;
    });

    return filteredData.reduce(
      (sum, row) => {
        sum.admin +=
          Number(row.state_leadership_team || 0) +
          Number(row.noc_executive || 0) +
          Number(row.analyst || 0) +
          Number(row.cmp_lead || 0);

        sum.utility +=
          Number(row.technician || 0) +
          Number(row.rigger || 0) +
          Number(row.utility_supervisor || 0) +
          Number(row.utility_engineer || 0) +
          Number(row.isp_engineer || 0) +
          Number(row.wh_incharge_cum_security || 0);

        sum.fiber +=
          Number(row.splicer || 0) +
          Number(row.assistant_splicer || 0) +
          Number(row.fiber_helper || 0) +
          Number(row.patroller || 0) +
          Number(row.fiber_supervisor || 0) +
          Number(row.fibre_engineer || 0);

        sum.fttx +=
          Number(row.fttx_splicer || 0) +
          Number(row.fttx_assistant_splicer || 0) +
          Number(row.fttx_supervisor || 0) +
          Number(row.fttx_helper || 0);

        sum.fttxPo +=
          Number(row.fttx_engineer || 0) + Number(row.fttx_technician || 0);

        
        return sum;
      },
      {
        admin: 0,
        utility: 0,
        fiber: 0,
        fttx: 0,
        fttxPo: 0,
        bench: 0,
      }
    );
  }, [signoffData, searchText, selectedCircle, selectedCmp]);

  const totalEmployees = useMemo(
    () => jobRoles.reduce((sum, item) => sum + Number(item.total || 0), 0),
    [jobRoles]
  );

  const employmentTotals = useMemo(() => {
    return employmentStatus.reduce(
      (summary, item) => {
        const label = String(
          item?.employment_status || item?.status || item?.label || ""
        ).toLowerCase();
        const count = Number(item?.total || item?.count || 0);

        summary.total += count;

        if (label.includes("active")) {
          summary.active += count;
        } else if (
          label.includes("resign") ||
          label.includes("left") ||
          label.includes("inactive")
        ) {
          summary.inactive += count;
        } else {
          summary.other += count;
        }

        return summary;
      },
      { active: 0, inactive: 0, other: 0, total: 0 }
    );
  }, [employmentStatus]);

  const filteredCmpOptions = useMemo(() => {
    return visibleCmpGroups
      .filter((group) => {
        if (selectedCircle === "") return true;
        return group.title.toLowerCase().includes(selectedCircle.toLowerCase());
      })
      .flatMap((group) => group.items);
  }, [visibleCmpGroups, selectedCircle]);

  const getSignoffRow = (cmpName) => signoffLookup[normalizeCmpName(cmpName)];

  const resetFilters = () => {
    setSearchText("");
    setSelectedCircle(isAllCircleUser ? "" : userCircleLabel || "");
    setSelectedCmp("");
  };

  const XLSX_CONTENT_TYPE =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  const downloadExport = async (endpoint, fallbackFileName, setLoading, filters) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const search = filters?.search ?? searchText;
      const circle = filters?.circle ?? selectedCircle;
      const cmp = filters?.cmp ?? selectedCmp;

      if (search) params.set("search", search);
      // Single-circle users can only ever export their own circle, even if
      // selectedCircle hasn't caught up to the lock effect yet.
      const effectiveCircle = isAllCircleUser ? circle : userCircleLabel || circle;
      if (effectiveCircle) params.set("circle", effectiveCircle);
      if (cmp) params.set("cmp", cmp);

      const response = await authFetch(
        buildApiUrl(`${endpoint}?${params.toString()}`)
      );

      const contentType = response.headers.get("content-type") || "";

      // A failed request, or a 200 that isn't actually an xlsx (e.g. an
      // unmatched route falling through to an HTML page, or a JSON error
      // body), must never be downloaded as-is — surface a real error instead.
      if (!response.ok || !contentType.includes(XLSX_CONTENT_TYPE)) {
        let message = "Export failed. Please try again.";
        try {
          if (contentType.includes("application/json")) {
            const body = await response.json();
            message = body?.message || message;
          }
        } catch {
          // response body wasn't JSON — keep the generic message
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fallbackFileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.log(error);
      toast.error(error.message || "Export failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const exportPhysicalRag = (filters) =>
    downloadExport(
      "/api/hr-dashboard/export/physical",
      "Physical_RAG_Export.xlsx",
      setExportingPhysical,
      filters
    );

  const exportScrumRag = (filters) =>
    downloadExport(
      "/api/hr-dashboard/export/scrum",
      "Scrum_RAG_Export.xlsx",
      setExportingScrum,
      filters
    );

  // Shared meta for the two RAG panels so the fullscreen and export popups
  // can render either one generically. Uses the same lookups the dashboard
  // tables already render from — nothing is re-fetched.
  const panelConfigs = {
    physical: {
      key: "physical",
      icon: BriefcaseBusiness,
      title: "PHYSICAL RAG",
      subtitle: "Requirement vs Available Manpower",
      gradient: "from-sky-500 via-cyan-500 to-teal-400",
      columns: physicalDesignationColumns,
      countLookup: activeCountLookup,
      showJoining: true,
      exportLabel: "Export Physical RAG",
      fileBase: "Physical_RAG_Export",
      onExportServer: exportPhysicalRag,
      exporting: exportingPhysical,
    },
    scrum: {
      key: "scrum",
      icon: Layers3,
      title: "SCRUM RAG",
      subtitle: "Overview Scrum Manpower",
      gradient: "from-violet-600 via-fuchsia-500 to-pink-500",
      columns: scrumDesignationColumns,
      countLookup: scrumActiveCountLookup,
      showJoining: false,
      exportLabel: "Export Scrum RAG",
      fileBase: "Scrum_RAG_Export",
      onExportServer: exportScrumRag,
      exporting: exportingScrum,
    },
  };

  const topMeta = [
    { label: "Total Employees", value: totalEmployees || employmentTotals.total },
    { label: "Circle Coverage", value: circles.length || visibleCmpGroups.length },
    { label: "Role Buckets", value: jobRoles.length || physicalDesignationColumns.length },
    { label: "Scrum Active", value: scrumCount.active || 0 },
  ];

  const lastRefreshedLabel = useMemo(() => {
    if (!lastRefreshedAt) return "Last Refreshed: --";

    return `Last Refreshed: ${lastRefreshedAt.toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })}`;
  }, [lastRefreshedAt]);

  const circleContextValue = useMemo(
    () => ({ isAllCircleUser, userCircleLabel, allowedCircleLabels }),
    [isAllCircleUser, userCircleLabel, allowedCircleLabels]
  );

  return (
    <HrDashboardCircleContext.Provider value={circleContextValue}>
    <div className="min-h-screen">
    <div className="relative overflow-hidden rounded-[14px] border border-white/70 bg-[linear-gradient(96deg,_#4f46e5_0%,_#7c3aed_50%,_#a21caf_100%)] px-4 py-2 text-white md:px-4 md:py-2">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.22),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.14),_transparent_24%)]" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[18px] border border-white/20 bg-white/14 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] backdrop-blur-xl">
              <Users className="h-4 w-4" />
            </div>

            <div>
              <h1 className="text-xs font-semibold uppercase tracking-[0.10em] md:text-sm">
                HR MANAGEMENT
              </h1>
              <p className=" text-xs text-white/85 md:text-sm">
                Physical & Scrum Team Monitoring Overview
              </p>

              
            </div>
          </div>

 {/* 
          <button
            type="button"
            className="inline-flex items-center justify-between gap-3 rounded-[18px] border border-white/10 bg-white/12 px-4 py-2 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-xl md:min-w-[250px]"
          >
            <span className="flex items-center gap-3">
              <CalendarRange className="h-3 w-3" />
              Select Date Range
            </span>
            <ChevronDown className="h-4 w-4" />
          </button>
         */} 

        </div>
      </div>
      



      <div className="rounded-[12px] border border-slate-200/70 bg-white/90 p-1 mt-1 backdrop-blur-xl">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-[1.15fr_1fr_1fr_0.9fr_0.9fr_0.9fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search anything..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              className="h-8 w-full rounded-[12px] border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] pl-12 pr-4 text-[13px] text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
            />
          </div>

          <select
            value={selectedCircle}
            onChange={(event) => setSelectedCircle(event.target.value)}
            disabled={!isAllCircleUser}
            className="h-8 w-full rounded-[12px] border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] px-4 text-[13px] text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isAllCircleUser && <option value="">Select Circle</option>}
            {allowedCircleLabels.map((circleLabel) => (
              <option key={circleLabel} value={circleLabel}>
                {circleLabel}
              </option>
            ))}
          </select>

          <select
            value={selectedCmp}
            onChange={(event) => setSelectedCmp(event.target.value)}
            className="h-8 w-full rounded-[12px] border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] px-4 text-[13px] text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
          >
            <option value="">Select CMP</option>
            {filteredCmpOptions.map((cmp) => (
              <option key={cmp} value={cmp}>
                {cmp}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex h-8 items-center justify-center gap-3 rounded-[12px] bg-[linear-gradient(96deg,_#3b82f6_0%,_#7c3aed_100%)] px-4 text-base font-semibold text-white transition hover:brightness-105"
          >
            <RefreshCcw className="h-4 w-4" />
            Reset
          </button>
        
        </div>
      </div>

      <div className="mt-1 grid grid-cols-1 gap-1 xl:grid-cols-1">
        <TablePanel
          panelId="physicalScroll"
          showJoining={true}
          icon={BriefcaseBusiness}
          title="PHYSICAL RAG"
          onExport={() => {
            setExportModalFilters(null);
            setExportModalPanel("physical");
          }}
          onRefresh={() => {
            void refreshDashboard({ reason: "manual", forceRestart: true });
          }}
          onFullScreen={() => setFullScreenPanel("physical")}
          exporting={exportingPhysical}
          exportLabel="Export Physical RAG"
          isRefreshing={isRefreshing}
          lastRefreshedLabel={lastRefreshedLabel}
          subtitle="Requirement vs Available Manpower"
          description="Real-time view of physical workforce requirements, availability, and deployment gaps."
          gradient="from-sky-500 via-cyan-500 to-teal-400"
          accent="text-cyan-600"
          groups={filteredGroups}
          columns={physicalDesignationColumns}
          countLookup={activeCountLookup}
          getSignoffRow={getSignoffRow}
        />

        <TablePanel
          panelId="scrumScroll"
          icon={Layers3}
          title="SCRUM RAG"
          onExport={() => {
            setExportModalFilters(null);
            setExportModalPanel("scrum");
          }}
          onRefresh={() => {
            void refreshDashboard({ reason: "manual", forceRestart: true });
          }}
          onFullScreen={() => setFullScreenPanel("scrum")}
          exporting={exportingScrum}
          exportLabel="Export Scrum RAG"
          isRefreshing={isRefreshing}
          lastRefreshedLabel={lastRefreshedLabel}
          subtitle="Overview Scrum Manpower"
          description="Real-time view of scrum workforce requirements, availability, and deployment gaps."
          gradient="from-violet-600 via-fuchsia-500 to-pink-500"
          accent="text-violet-600"
          groups={filteredGroups}
          columns={scrumDesignationColumns}
          countLookup={scrumActiveCountLookup}
          getSignoffRow={getSignoffRow}
        />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-4">
        <InfoCard
          icon={Lightbulb}
          title="How to Read"
          accent="text-blue-600"
          iconBg="bg-blue-50 text-blue-600"
          description="R: Requirement, A: Available, G: Gap"
          subText={
       <>
    <span className="font-semibold text-slate-700">
      A Column Format →
    </span>{" "}

    <span className="font-semibold text-slate-900">
      Total Available
    </span>

    {" / "}

    <span className="font-semibold text-blue-600">
      P = Physical Count
    </span>

    {" / "}

    <span className="font-semibold text-emerald-600">
      NJ = New Joining Count
    </span>
  </>
}
        />

        <InfoCard
          icon={BriefcaseBusiness}
          title="Physical Requirement"
          accent="text-slate-900"
          iconBg="bg-slate-100 text-slate-700"
          description="Field staff required for execution, installation and maintenance activities."
          subText={`Active manpower tracked across ${circles.length || visibleCmpGroups.length} circle groups.`}
        />

        <InfoCard
          icon={Layers3}
          title="Scrum Manpower"
          accent="text-violet-700"
          iconBg="bg-violet-50 text-violet-600"
          description="Project management, coordination and support staff for project delivery."
          subText={`Current scrum count snapshot: ${scrumCount.total || 0} total, ${scrumCount.active || 0} active.`}
        />

        <InfoCard
          icon={BarChart3}
          title="Key Insights"
          accent="text-emerald-700"
          iconBg="bg-emerald-50 text-emerald-600"
          description="Positive gap shown in red indicates shortfall. Lower or zero gap reflects healthier coverage."
          subText={`Employment summary: ${employmentTotals.active || 0} active, ${employmentTotals.inactive || 0} inactive.`}
        />
      </div>

      {fullScreenPanel && (
        <FullScreenRagModal
          config={panelConfigs[fullScreenPanel]}
          groupsSource={visibleCmpGroups}
          allowedCircleLabels={allowedCircleLabels}
          isAllCircleUser={isAllCircleUser}
          userCircleLabel={userCircleLabel}
          initialFilters={{
            search: searchText,
            circle: selectedCircle,
            cmp: selectedCmp,
          }}
          getSignoffRow={getSignoffRow}
          onClose={() => setFullScreenPanel(null)}
          onOpenExport={(filters) => {
            setExportModalFilters(filters);
            setExportModalPanel(fullScreenPanel);
          }}
        />
      )}

      {exportModalPanel && (
        <ExportRagModal
          config={panelConfigs[exportModalPanel]}
          groupsSource={visibleCmpGroups}
          allowedCircleLabels={allowedCircleLabels}
          isAllCircleUser={isAllCircleUser}
          userCircleLabel={userCircleLabel}
          initialFilters={
            exportModalFilters || {
              search: searchText,
              circle: selectedCircle,
              cmp: selectedCmp,
            }
          }
          getSignoffRow={getSignoffRow}
          onClose={() => setExportModalPanel(null)}
        />
      )}
    </div>
    </HrDashboardCircleContext.Provider>
  );
}

function TablePanel({
  panelId,
  icon: Icon,
  title,
  subtitle,
  description,
  gradient,
  accent,
  groups,
  columns,
  countLookup,
  getSignoffRow,
  showJoining = false,
  onExport,
  onRefresh,
  onFullScreen,
  exporting,
  exportLabel,
  isRefreshing,
  lastRefreshedLabel,
})
 {
  
  return (
    <div className="relative overflow-hidden rounded-[12px] border border-slate-200/70 bg-white/92">
      <div className={`bg-gradient-to-r ${gradient} px-4 py-2 text-white md:px-4 md:py-2`}>
        <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">

    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] border border-white/20 bg-white/14 backdrop-blur-xl">
        <Icon className="h-4 w-4" />
    </div>

    <div>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-white/95">
            {title}
        </p>

        <p className="text-xs text-white">
            {subtitle}
        </p>
    </div>

</div>

<div className="flex items-center gap-2">
    <button
        type="button"
        onClick={onFullScreen}
        title="Open full screen view"
        className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/20 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/30"
    >
        <Maximize2 className="h-4 w-4" />
        Full Screen
    </button>

    <button
        onClick={onExport}
        disabled={exporting}
        title={exportLabel}
        className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/20 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-70"
    >
        <Download className="h-4 w-4" />
        {exporting ? "Exporting..." : exportLabel}
    </button>

    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={onRefresh}
        disabled={isRefreshing}
        title="Refresh Dashboard Data"
        className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/20 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-70"
      >
        <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
        Refresh
      </button>
      <span className="mt-1 text-[11px] font-medium text-white/85">
        {lastRefreshedLabel}
      </span>
    </div>
</div>
        </div>
      </div>

          <div className="border-b border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 md:px-4">
        {description}
      </div>


      <StatCardsRow
        groups={groups}
        countLookup={countLookup}
        getSignoffRow={getSignoffRow}
      />

      <RagTable
        panelId={panelId}
        groups={groups}
        columns={columns}
        countLookup={countLookup}
        getSignoffRow={getSignoffRow}
        showJoining={showJoining}
      />
    </div>
  );
}

// Extracted verbatim from TablePanel so the fullscreen popup can reuse the
// exact same category summary cards.
function StatCardsRow({ groups, countLookup, getSignoffRow }) {

  const getAvailableCount = (cmpName, roleKey) => {
  const value = countLookup?.[cmpName]?.[roleKey];

  if (typeof value === "number") {
    // SCRUM
    return value;
  }

  // PHYSICAL
  return Number(value?.total || 0);
};

  return (
    <div className="grid grid-cols-2 gap-1 md:grid-cols-5 xl:grid-cols-5 p-1 border-b border-slate-200 bg-slate-50">

 {statCardConfig.map((card) => {

  let requirement = 0;
  let available = 0;

  groups.forEach((group) => {

    group.items.forEach((cmpName) => {

      const signoffRow = getSignoffRow(cmpName);

      // ADMIN REQUIREMENT
if (card.key === "admin") {
  requirement +=
    Number(signoffRow?.state_leadership_team || 0) +
    Number(signoffRow?.noc_executive || 0) +
    Number(signoffRow?.analyst || 0) +
    Number(signoffRow?.cmp_lead || 0);
}

// UTILITY REQUIREMENT
if (card.key === "utility") {
  requirement +=
    Number(signoffRow?.technician || 0) +
    Number(signoffRow?.rigger || 0) +
    Number(signoffRow?.utility_supervisor || 0) +
    Number(signoffRow?.utility_engineer || 0) +
    Number(signoffRow?.isp_engineer || 0) +
    Number(signoffRow?.wh_incharge_cum_security || 0);
}

// FIBER REQUIREMENT
if (card.key === "fiber") {
  requirement +=
    Number(signoffRow?.splicer || 0) +
    Number(signoffRow?.assistant_splicer || 0) +
    Number(signoffRow?.fiber_helper || 0) +
    Number(signoffRow?.patroller || 0) +
    Number(signoffRow?.fiber_supervisor || 0) +
    Number(signoffRow?.fibre_engineer || 0);
}

// FTTX REQUIREMENT
if (card.key === "fttx") {
  requirement +=
    Number(signoffRow?.fttx_splicer || 0) +
    Number(signoffRow?.fttx_assistant_splicer || 0) +
    Number(signoffRow?.fttx_supervisor || 0) +
    Number(signoffRow?.fttx_helper || 0);
}

// FTTX PO REQUIREMENT
if (card.key === "fttxPo") {
  requirement +=
    Number(signoffRow?.fttx_engineer || 0) +
    Number(signoffRow?.fttx_technician || 0);
}

{/* admin category calculate availability */}
     if (card.key === "admin") {

 available +=
  getAvailableCount(cmpName, "state_leadership_team") +
  getAvailableCount(cmpName, "noc_executive") +
  getAvailableCount(cmpName, "analyst") +
  getAvailableCount(cmpName, "cmp_lead");

}

{/* utility category calculate availability */}
   if (card.key === "utility") {

 available +=
  getAvailableCount(cmpName, "technician") +
  getAvailableCount(cmpName, "rigger") +
  getAvailableCount(cmpName, "utility_supervisor") +
  getAvailableCount(cmpName, "utility_engineer") +
  getAvailableCount(cmpName, "isp_engineer") +
  getAvailableCount(cmpName, "wh_incharge_cum_security");

}
{/* fiber category calculate availability */}
   if (card.key === "fiber") {

  available +=
  getAvailableCount(cmpName, "splicer") +
  getAvailableCount(cmpName, "assistant_splicer") +
  getAvailableCount(cmpName, "fiber_helper") +
  getAvailableCount(cmpName, "patroller") +
  getAvailableCount(cmpName, "fiber_supervisor") +
  getAvailableCount(cmpName, "fibre_engineer");

}

{/* fttx category calculate availability */}
    if (card.key === "fttx") {

  available +=
  getAvailableCount(cmpName, "fttx_splicer") +
  getAvailableCount(cmpName, "fttx_assistant_splicer") +
  getAvailableCount(cmpName, "fttx_supervisor") +
  getAvailableCount(cmpName, "fttx_helper");

}

{/* fttxPo category calculate availability */}
   if (card.key === "fttxPo") {

 available +=
  getAvailableCount(cmpName, "fttx_engineer") +
  getAvailableCount(cmpName, "fttx_technician");

}

    });

  });

  const gap = requirement - available;

  return (
    <div
      key={card.key}
     className={`rounded-[12px] border bg-white px-3 py-2 ${card.tint}`}
    >

      <p className="truncate text-[0.58rem] font-semibold uppercase tracking-[0.16em]">
        {card.label}
      </p>

    <div className="flex items-center justify-center gap-2 text-[14px] font-bold">

  <span className="text-slate-800">
    R {requirement}
  </span>

  <span className="text-slate-400">|</span>

  <span className="text-slate-700">
    A {available}
  </span>

  <span className="text-slate-400">|</span>

  <span className="text-emerald-600">
    G {gap}
  </span>

</div>

    </div>
  );
})}

</div>
  );
}

// Extracted verbatim from TablePanel: the scrolling RAG table with sticky
// header and sticky first column. `fillHeight` lets the fullscreen popup
// stretch it to the viewport instead of the dashboard's 55vh cap.
function RagTable({
  panelId,
  groups,
  columns,
  countLookup,
  getSignoffRow,
  showJoining = false,
  fillHeight = false,
}) {
  // Employee-level drill-down popup for a designation / R / A / G cell.
  // Self-contained here (rather than lifted to HrDashboard state) so none of
  // the 3 call sites of <RagTable> need extra props threaded through them.
  const [drilldown, setDrilldown] = useState(null);
  const panel = showJoining ? "physical" : "scrum";

  const openDrilldown = (column, circle, cmp, clickedMetric) => {
    setDrilldown({
      panel,
      roleKey: column.key,
      roleLabel: column.label,
      circle: circle || "",
      cmp: cmp || "",
      clickedMetric,
    });
  };

  return (
  <>
  <div
    id={panelId}
    className={`relative overflow-auto custom-scrollbar ${
      fillHeight ? "flex-1" : ""
    }`}
    style={
      fillHeight
        ? { isolation: "isolate" }
        : {
            maxHeight: "55vh",
            minHeight: "240px",
            isolation: "isolate",
          }
    }
>
      <table  className="relative z-0 min-w-max w-full whitespace-nowrap border-collapse text-sm">
          <thead>

            <tr className="sticky top-0 z-[100] bg-slate-100 text-[13px] font-bold">

 <th
  colSpan={13}
  className="bg-blue-900 text-white border border-white py-2 font-semibold"
>
  ADMIN
</th>

  <th
  colSpan={18}
 className="bg-blue-900 text-white border border-white py-2 font-semibold"
>
  UTILITY & ISP
</th>

<th
  colSpan={18}
 className="bg-blue-900 text-white border border-white py-2 font-semibold"
>
  FIBER
</th>

<th
  colSpan={12}
 className="bg-blue-900 text-white border border-white py-2 font-semibold"
>
  FTTX
</th>

<th
  colSpan={6}
  className="bg-blue-900 text-white border border-white py-2 font-semibold"
>
  FTTX PO BASED
</th>
</tr>
  
<tr className="sticky top-[36px] z-[90] bg-[#f8fbff] text-[12px] uppercase text-slate-700">
 <th
  rowSpan={3}
 className="sticky left-0 top-[36px] z-[105] min-w-[140px] border-r border-slate-300 bg-violet-50 px-4 py-1 text-left text-[13px] font-semibold text-slate-700"
   >
    CMP
  </th>

  {columns.map((column, index) => (
<th
  key={column.key}
  colSpan={3}
  onClick={() => openDrilldown(column, "", "", "designation")}
  title={`View ${column.label} employees`}
 className="min-w-[180px] cursor-pointer text-center py-2 font-semibold border-r-2 border-blue-300 bg-blue-200 text-blue-900 transition hover:bg-blue-300"
>
    {column.label}
  </th>
 ))}
</tr>

 <tr className="sticky top-[72px] z-[85] bg-[#F1F5F9] text-[12px] text-slate-500">
  {columns.map((column, index) => (
<React.Fragment key={column.key}>
<th className="border-b border-blue-500 py-1 text-center font-semibold text-blue-700 w-[40px] bg-blue-100">
  R
</th>

<th className="border-b border-blue-500 py-1 text-center font-semibold text-blue-700 w-[40px] bg-blue-100">
  A
</th>

<th className="border-b border-blue-500 py-1 text-center font-semibold text-blue-700 w-[40px] bg-blue-100">
  G
</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>

          <tbody className="text-[12px] text-slate-700">
            {groups.map((group) => (
              <React.Fragment key={group.title}>
              <tr className="bg-white font-bold border-y border-slate-200">
                 <td className="sticky left-0 z-[80] min-w-[140px] border-r-2 bg-indigo-50 border-blue-200 px-4 py-2 text-[13px] font-bold text-slate-900">
                  {`${group.title.replace(" SHQ", "")} Total`}
                  </td>

                  {columns.map((column) => {
                    const totalRequirement = group.items.reduce((sum, cmpName) => {
                      const row = getSignoffRow(cmpName);
                      return sum + Number(row?.[column.key] || 0);
                    }, 0);

                    const totalAvailable = group.items.reduce(
                      (sum, cmpName) =>
                        sum +
                        Number(
                          showJoining
                            ? countLookup?.[cmpName]?.[column.key]?.total || 0
                            : countLookup?.[cmpName]?.[column.key] || 0
                        ),
                      0
                    );

                    const totalGap = totalRequirement - totalAvailable;

                    const totalCircle = circleLabelFromTitle(group.title);

                    return (
                      <React.Fragment key={column.key}>
                        <td
                          onClick={() => openDrilldown(column, totalCircle, "", "R")}
                          title={`View ${column.label} employees — ${totalCircle}`}
                          className="w-[55px] cursor-pointer px-2 py-2 text-center bg-indigo-50 border-slate-300 font-bold border-y hover:bg-indigo-100"
                        >
                          {totalRequirement}
                        </td>
                        <td
                          onClick={() => openDrilldown(column, totalCircle, "", "A")}
                          title={`View ${column.label} employees — ${totalCircle}`}
                          className="w-[55px] cursor-pointer px-2 py-2 text-center font-bold border-y bg-indigo-50 border-slate-300 hover:bg-indigo-100"
                        >
                          {totalAvailable}
                        </td>
                        <td
                          onClick={() => openDrilldown(column, totalCircle, "", "G")}
                          title={`View ${column.label} employees — ${totalCircle}`}
                           className={`cursor-pointer px-2 py-2 text-center font-bold border-r border-y bg-indigo-50 border-slate-300 hover:bg-indigo-100 ${

                            totalGap <= 0 ? "text-emerald-600" : "text-red-500"
                          }`}
                        >
                          {totalGap}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>

               {group.items.map((cmpName, rowIndex) => {
                  const signoffRow = getSignoffRow(cmpName);

                  return (
                   <tr
  key={cmpName}
  className={`transition hover:bg-blue-50 ${
    rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50"
  }`}
>
  <td className="sticky left-0 z-[70] min-w-[160px] border-r-2 border-b border-slate-300 bg-slate-50 px-3 py-2 font-semibold text-slate-800">
    {cmpName}
  </td>
     {columns.map((column) => {
   const requirement = Number(signoffRow?.[column.key] || 0);
  let physicalCount = 0;
let newJoiningCount = 0;
let available = 0;

if (showJoining) {

  const availableData =
    countLookup?.[cmpName]?.[column.key] || {};

  physicalCount = Number(
    availableData.physical_count || 0
  );

  newJoiningCount = Number(
    availableData.new_joining_count || 0
  );

  available = Number(
    availableData.total || 0
  );

} else {

  available = Number(
    countLookup?.[cmpName]?.[column.key] || 0
  );

}
    const gap = requirement - available;

  const rowCircle = circleLabelFromTitle(group.title);

  return (
    <React.Fragment key={column.key}>
     <td
       onClick={() => openDrilldown(column, rowCircle, cmpName, "R")}
       title={`View ${column.label} employees — ${cmpName}`}
       className="w-[55px] cursor-pointer px-2 py-2 text-center border-b border-slate-200 hover:bg-blue-100"
     >
         {requirement}
      </td>

 <td
   onClick={() => openDrilldown(column, rowCircle, cmpName, "A")}
   title={`View ${column.label} employees — ${cmpName}`}
   className="w-[55px] cursor-pointer px-2 py-2 text-center border-b border-slate-200 hover:bg-blue-100"
 >

  {showJoining ? (

    <div className="flex flex-col items-center leading-none">

      <span className="font-semibold text-[13px] text-slate-900">
        {available}
      </span>

      <div className="flex items-center gap-1 text-[10px] font-semibold mt-[2px]">

        <span className="text-blue-600">
          {physicalCount}
        </span>

        <span className="text-slate-400">
          |
        </span>

        <span className="text-emerald-600">
          {newJoiningCount}
        </span>

      </div>

    </div>

  ) : (

    <span className="font-semibold text-slate-900">
      {available}
    </span>

  )}

</td>

 <td
    onClick={() => openDrilldown(column, rowCircle, cmpName, "G")}
    title={`View ${column.label} employees — ${cmpName}`}
    className={`cursor-pointer px-2 py-2 text-center font-bold border-r border-slate-300 hover:bg-blue-100 ${

    gap <= 0 ? "text-emerald-600" : "text-red-500"
  }`}
>
  {gap}
</td>

    </React.Fragment>
          );
       })}
     </tr>
    );
  })}
</React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
  <DrilldownModal
    isOpen={!!drilldown}
    scope={drilldown}
    onClose={() => setDrilldown(null)}
  />
  </>
  );
}

function InfoCard({ icon: Icon, title, accent, iconBg, description, subText }) {
  return (
    <div className="rounded-[14px] border border-slate-200/70 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] px-4 py-2 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
      <div className="flex items-start">
      

        <div>
          <p className={`text-sm font-semibold ${accent}`}>{title}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">{subText}</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fullscreen RAG popup: the complete table in an immersive modal with its own
// Search / Circle / CMP filters. Renders from the same lookups the dashboard
// already loaded — no extra API calls, no page reload.
// ---------------------------------------------------------------------------
function FullScreenRagModal({
  config,
  groupsSource,
  allowedCircleLabels,
  isAllCircleUser,
  userCircleLabel,
  initialFilters,
  getSignoffRow,
  onClose,
  onOpenExport,
}) {
  const [search, setSearch] = useState(initialFilters.search || "");
  const [circle, setCircle] = useState(initialFilters.circle || "");
  const [cmp, setCmp] = useState(initialFilters.cmp || "");

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const groups = useMemo(
    () => filterCmpGroups(groupsSource, search, circle, cmp),
    [groupsSource, search, circle, cmp]
  );

  const cmpOptions = useMemo(
    () => cmpOptionsForCircle(groupsSource, circle),
    [groupsSource, circle]
  );

  const resetFilters = () => {
    setSearch("");
    setCircle(isAllCircleUser ? "" : userCircleLabel || "");
    setCmp("");
  };

  const Icon = config.icon;

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-slate-900/60 p-2 backdrop-blur-sm md:p-4">
      <style>{`@keyframes hrModalIn { from { opacity: 0; transform: scale(0.985); } to { opacity: 1; transform: scale(1); } }`}</style>

      <div
        className="flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] border border-white/40 bg-white/95 shadow-[0_40px_120px_rgba(15,23,42,0.5)] backdrop-blur-2xl"
        style={{ animation: "hrModalIn 0.25s ease" }}
      >
        <div className={`bg-gradient-to-r ${config.gradient} px-4 py-2.5 text-white`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-white/25 bg-white/15 backdrop-blur-xl">
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[0.75rem] font-semibold uppercase tracking-[0.14em]">
                  {config.title} — Full Screen View
                </p>
                <p className="text-xs text-white/90">{config.subtitle}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenExport({ search, circle, cmp })}
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/20 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <Download className="h-4 w-4" />
                {config.exportLabel}
              </button>
              <button
                type="button"
                onClick={onClose}
                title="Close (Esc)"
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/20 px-3 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/35"
              >
                <X className="h-4 w-4" />
                Close
              </button>
            </div>
          </div>
        </div>

        <div className="border-b border-slate-200/80 bg-white/80 p-1.5 backdrop-blur-xl">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search Employee / CMP..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 w-full rounded-[12px] border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] pl-10 pr-4 text-[13px] text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
              />
            </div>

            <select
              value={circle}
              onChange={(event) => {
                setCircle(event.target.value);
                setCmp("");
              }}
              disabled={!isAllCircleUser}
              className="h-9 w-full rounded-[12px] border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] px-4 text-[13px] text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isAllCircleUser && <option value="">Select Circle</option>}
              {allowedCircleLabels.map((circleLabel) => (
                <option key={circleLabel} value={circleLabel}>
                  {circleLabel}
                </option>
              ))}
            </select>

            <select
              value={cmp}
              onChange={(event) => setCmp(event.target.value)}
              className="h-9 w-full rounded-[12px] border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] px-4 text-[13px] text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
            >
              <option value="">Select CMP</option>
              {cmpOptions.map((cmpName) => (
                <option key={cmpName} value={cmpName}>
                  {cmpName}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-[12px] bg-[linear-gradient(96deg,_#3b82f6_0%,_#7c3aed_100%)] px-4 text-sm font-semibold text-white transition hover:brightness-105"
            >
              <RefreshCcw className="h-4 w-4" />
              Reset
            </button>
          </div>
        </div>

        <StatCardsRow
          groups={groups}
          countLookup={config.countLookup}
          getSignoffRow={getSignoffRow}
        />

        {groups.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm font-semibold text-slate-400">
            No records match the current filters.
          </div>
        ) : (
          <RagTable
            panelId={`${config.key}ScrollFullScreen`}
            groups={groups}
            columns={config.columns}
            countLookup={config.countLookup}
            getSignoffRow={getSignoffRow}
            showJoining={config.showJoining}
            fillHeight
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export popup: filter (Circle / CMP / Search) + format (Excel / CSV / PDF),
// then export only the filtered data. Excel keeps using the existing backend
// export endpoint untouched; CSV and PDF are built client-side from the data
// already loaded on the dashboard.
// ---------------------------------------------------------------------------
const exportFormatOptions = [
  {
    value: "xlsx",
    label: "Excel (.xlsx)",
    hint: "Formatted RAG workbook",
    icon: FileSpreadsheet,
  },
  {
    value: "csv",
    label: "CSV",
    hint: "Plain data for analysis",
    icon: FileText,
  },
  {
    value: "pdf",
    label: "PDF",
    hint: "Print-ready snapshot",
    icon: FileDown,
  },
];

function ExportRagModal({
  config,
  groupsSource,
  allowedCircleLabels,
  isAllCircleUser,
  userCircleLabel,
  initialFilters,
  getSignoffRow,
  onClose,
}) {
  const [search, setSearch] = useState(initialFilters.search || "");
  const [circle, setCircle] = useState(initialFilters.circle || "");
  const [cmp, setCmp] = useState(initialFilters.cmp || "");
  const [format, setFormat] = useState("xlsx");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const filteredGroups = useMemo(
    () => filterCmpGroups(groupsSource, search, circle, cmp),
    [groupsSource, search, circle, cmp]
  );

  const cmpOptions = useMemo(
    () => cmpOptionsForCircle(groupsSource, circle),
    [groupsSource, circle]
  );

  const matchedCmpCount = useMemo(
    () => filteredGroups.reduce((sum, group) => sum + group.items.length, 0),
    [filteredGroups]
  );

  const hasFilters = Boolean(search || circle || cmp);

  const filtersSummary =
    [
      circle && `Circle: ${circle}`,
      cmp && `CMP: ${cmp}`,
      search && `Search: "${search}"`,
    ]
      .filter(Boolean)
      .join("  |  ") || "Complete data (no filters applied)";

  const handleExport = async () => {
    if (matchedCmpCount === 0) {
      toast.error("No records match the selected filters.");
      return;
    }

    setBusy(true);
    try {
      if (format === "xlsx") {
        await config.onExportServer({ search, circle, cmp });
      } else {
        const { header, rows } = buildRagExportRows({
          groups: filteredGroups,
          columns: config.columns,
          countLookup: config.countLookup,
          getSignoffRow,
          showJoining: config.showJoining,
        });

        if (format === "csv") {
          downloadRagCsv(`${config.fileBase}.csv`, header, rows);
          toast.success("CSV exported successfully.");
        } else {
          printRagPdf({
            title: config.title,
            filtersSummary,
            header,
            rows,
          });
        }
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const resetFilters = () => {
    setSearch("");
    setCircle(isAllCircleUser ? "" : userCircleLabel || "");
    setCmp("");
  };

  return (
    <div className="fixed inset-0 z-[320] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <style>{`@keyframes hrModalIn { from { opacity: 0; transform: scale(0.985); } to { opacity: 1; transform: scale(1); } }`}</style>

      <div
        className="w-full max-w-2xl overflow-hidden rounded-[20px] border border-white/50 bg-white/95 shadow-[0_40px_120px_rgba(15,23,42,0.5)] backdrop-blur-2xl"
        style={{ animation: "hrModalIn 0.25s ease" }}
      >
        <div className={`bg-gradient-to-r ${config.gradient} px-5 py-3 text-white`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-white/25 bg-white/15 backdrop-blur-xl">
                <Download className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.1em]">
                  {config.exportLabel}
                </p>
                <p className="text-xs text-white/90">
                  Choose filters and format, then export
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              title="Close (Esc)"
              className="rounded-lg border border-white/20 bg-white/20 p-2 text-white backdrop-blur-sm transition hover:bg-white/35"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Filters
          </p>

          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search Employee / CMP..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 w-full rounded-[12px] border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] pl-10 pr-4 text-[13px] text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
              />
            </div>

            <select
              value={circle}
              onChange={(event) => {
                setCircle(event.target.value);
                setCmp("");
              }}
              disabled={!isAllCircleUser}
              className="h-9 w-full rounded-[12px] border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] px-4 text-[13px] text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isAllCircleUser && <option value="">All Circles</option>}
              {allowedCircleLabels.map((circleLabel) => (
                <option key={circleLabel} value={circleLabel}>
                  {circleLabel}
                </option>
              ))}
            </select>

            <select
              value={cmp}
              onChange={(event) => setCmp(event.target.value)}
              className="h-9 w-full rounded-[12px] border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] px-4 text-[13px] text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
            >
              <option value="">All CMPs</option>
              {cmpOptions.map((cmpName) => (
                <option key={cmpName} value={cmpName}>
                  {cmpName}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-indigo-100 bg-indigo-50/60 px-4 py-2">
            <p className="text-xs text-slate-600">
              <span className="font-semibold text-indigo-700">
                {matchedCmpCount} CMP{matchedCmpCount === 1 ? "" : "s"}
              </span>{" "}
              will be exported — {filtersSummary}
            </p>
            {hasFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 transition hover:text-indigo-800"
              >
                <RefreshCcw className="h-3 w-3" />
                Reset filters
              </button>
            )}
          </div>

          <p className="mt-4 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Export Format
          </p>

          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
            {exportFormatOptions.map((option) => {
              const OptionIcon = option.icon;
              const selected = format === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFormat(option.value)}
                  className={`flex items-center gap-3 rounded-[14px] border px-3 py-2.5 text-left transition ${
                    selected
                      ? "border-indigo-400 bg-indigo-50/80 ring-4 ring-indigo-50"
                      : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${
                      selected
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <OptionIcon className="h-4 w-4" />
                  </span>
                  <span>
                    <span
                      className={`block text-[13px] font-semibold ${
                        selected ? "text-indigo-700" : "text-slate-700"
                      }`}
                    >
                      {option.label}
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      {option.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200/80 bg-slate-50/80 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-[12px] border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={busy || config.exporting}
            className="inline-flex items-center gap-2 rounded-[12px] bg-[linear-gradient(96deg,_#3b82f6_0%,_#7c3aed_100%)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <Download className="h-4 w-4" />
            {busy || config.exporting ? "Exporting..." : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default HrDashboard;
