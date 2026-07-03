import React, { useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  CalendarRange,
  ChevronDown,
  Layers3,
  RefreshCcw,
  Search,
  ShieldCheck,
  Users,
  UserCog,
  Workflow,
  BadgeCheck,
  Lightbulb,
  BarChart3,
  Download,
} from "lucide-react";

import toast from "react-hot-toast";

import { authFetch, buildApiUrl } from "../lib/api";
import { getStoredSession } from "../lib/session";

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

const cmpGroups = [
  {
    title: "Delhi SHQ",
    items: [
      "Delhi SHQ",
      "Delhi-1 (West)",
      "Delhi-2 (South)",
      "Delhi-3 (Central-East)",
      "Delhi-4 (North)",
      "Faridabad (NCR)",
      "Ghaziabad (NCR)",
      "Gurgaon (NCR)",
      "Noida (NCR)",
    ],
  },
  {
    title: "Haryana SHQ",
    items: [
      "Haryana SHQ",
      "Ambala",
      "Hissar",
      "Karnal",
      "Panipat",
      "Palwal",
      "Rewari",
      "Rohtak",
    ],
  },
  {
    title: "Punjab SHQ",
    items: [
      "Punjab SHQ",
      "Amritsar",
      "Bathinda",
      "Chandigarh",
      "Jalandhar",
      "Ludhiana-1",
      "Ludhiana-2",
      "Pathankot",
      "Patiala",
      "Sangrur",
    ],
  },
  {
    title: "UP East SHQ",
    items: [
      "UP East SHQ",
      "Allahabad",
      "Azamgarh",
      "Faizabad",
      "Gorakhpur",
      "Raibareilly",
      "Varanasi",
    ],
  },
];

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

// Circle label derived straight from the cmpGroups titles, so adding a new
// circle group above automatically makes it a selectable circle everywhere
// on this page — no separate circle list to keep in sync.
const circleLabelFromTitle = (title = "") => title.replace(/\s*SHQ\s*$/i, "").trim();

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

  useEffect(() => {
    loadJobRoles();
    loadCircles();
    loadEmploymentStatus();
    loadScrumCount();
    loadSignoffData();
    loadActiveData();
    loadScrumActiveData();
  }, []);

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

  const loadJobRoles = async () => {
    try {
      const response = await authFetch(buildApiUrl("/api/physical/job-role-count"));
      const result = await response.json();

      if (result.success) {
        setJobRoles(result.data || []);
      }
    } catch (error) {
      console.log(error);
    }
  };

  const loadCircles = async () => {
    try {
      const response = await authFetch(buildApiUrl("/api/physical/circle-count"));
      const result = await response.json();

      if (result.success) {
        setCircles(result.data || []);
      }
    } catch (error) {
      console.log(error);
    }
  };

  const loadEmploymentStatus = async () => {
    try {
      const response = await authFetch(
        buildApiUrl("/api/physical/employment-status-count")
      );
      const result = await response.json();

      if (result.success) {
        setEmploymentStatus(result.data || []);
      }
    } catch (error) {
      console.log(error);
    }
  };

  const loadScrumCount = async () => {
    try {
      const response = await authFetch(buildApiUrl("/api/manpower/scrum/count"));
      const result = await response.json();
      setScrumCount(result);
    } catch (error) {
      console.log(error);
    }
  };

  const loadActiveData = async () => {
    try {
      const response = await authFetch(
        buildApiUrl("/api/physical/active-job-role-cmp-count")
      );
      const result = await response.json();

      if (result.success) {
        setActiveData(result.data || []);
      }
    } catch (error) {
      console.log(error);
    }
  };

  const loadScrumActiveData = async () => {
    try {
      const response = await authFetch(
        buildApiUrl("/api/manpower/scrum/cmp-role-count")
      );
      const result = await response.json();

      if (result.success) {
        setScrumActiveData(result.data || []);
      }
    } catch (error) {
      console.log(error);
    }
  };

  const loadSignoffData = async () => {
    try {
      const response = await authFetch(buildApiUrl("/api/signoff"));
      const result = await response.json();
      setSignoffData(result.rows || []);
    } catch (error) {
      console.log(error);
    }
  };

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

  const downloadExport = async (endpoint, fallbackFileName, setLoading) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchText) params.set("search", searchText);
      // Single-circle users can only ever export their own circle, even if
      // selectedCircle hasn't caught up to the lock effect yet.
      const effectiveCircle = isAllCircleUser
        ? selectedCircle
        : userCircleLabel || selectedCircle;
      if (effectiveCircle) params.set("circle", effectiveCircle);
      if (selectedCmp) params.set("cmp", selectedCmp);

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

  const exportPhysicalRag = () =>
    downloadExport(
      "/api/hr-dashboard/export/physical",
      "Physical_RAG_Export.xlsx",
      setExportingPhysical
    );

  const exportScrumRag = () =>
    downloadExport(
      "/api/hr-dashboard/export/scrum",
      "Scrum_RAG_Export.xlsx",
      setExportingScrum
    );

  const topMeta = [
    { label: "Total Employees", value: totalEmployees || employmentTotals.total },
    { label: "Circle Coverage", value: circles.length || visibleCmpGroups.length },
    { label: "Role Buckets", value: jobRoles.length || physicalDesignationColumns.length },
    { label: "Scrum Active", value: scrumCount.active || 0 },
  ];

  return (
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
          onExport={exportPhysicalRag}
          exporting={exportingPhysical}
          exportLabel="Export Physical RAG"
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
          onExport={exportScrumRag}
          exporting={exportingScrum}
          exportLabel="Export Scrum RAG"
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
    </div>
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
  exporting,
  exportLabel,
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

<button
    onClick={onExport}
    disabled={exporting}
    className="rounded-lg bg-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/30"
>
    {exporting ? "Exporting..." : exportLabel}
</button>
        </div>
      </div>

          <div className="border-b border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 md:px-4">
        {description}
      </div>


      {/* PHYSICAL TOP CATEGORY CARDS */}

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
    Number(countLookup?.[cmpName]?.state_leadership_team?.total || 0) +
    Number(countLookup?.[cmpName]?.noc_executive?.total || 0) +
    Number(countLookup?.[cmpName]?.analyst?.total || 0) +
    Number(countLookup?.[cmpName]?.cmp_lead?.total || 0);

}

{/* utility category calculate availability */}
   if (card.key === "utility") {

  available +=
    Number(countLookup?.[cmpName]?.technician?.total || 0) +
    Number(countLookup?.[cmpName]?.rigger?.total || 0) +
    Number(countLookup?.[cmpName]?.utility_supervisor?.total || 0) +
    Number(countLookup?.[cmpName]?.utility_engineer?.total || 0) +
    Number(countLookup?.[cmpName]?.isp_engineer?.total || 0) +
    Number(countLookup?.[cmpName]?.wh_incharge_cum_security?.total || 0);

}
{/* fiber category calculate availability */}
   if (card.key === "fiber") {

  available +=
    Number(countLookup?.[cmpName]?.splicer?.total || 0) +
    Number(countLookup?.[cmpName]?.assistant_splicer?.total || 0) +
    Number(countLookup?.[cmpName]?.fiber_helper?.total || 0) +
    Number(countLookup?.[cmpName]?.patroller?.total || 0) +
    Number(countLookup?.[cmpName]?.fiber_supervisor?.total || 0) +
    Number(countLookup?.[cmpName]?.fibre_engineer?.total || 0);

}

{/* fttx category calculate availability */}
    if (card.key === "fttx") {

  available +=
    Number(countLookup?.[cmpName]?.fttx_splicer?.total || 0) +
    Number(countLookup?.[cmpName]?.fttx_assistant_splicer?.total || 0) +
    Number(countLookup?.[cmpName]?.fttx_supervisor?.total || 0) +
    Number(countLookup?.[cmpName]?.fttx_helper?.total || 0);

}

{/* fttxPo category calculate availability */}
   if (card.key === "fttxPo") {

  available +=
    Number(countLookup?.[cmpName]?.fttx_engineer?.total || 0) +
    Number(countLookup?.[cmpName]?.fttx_technician?.total || 0);

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

  <div
    id={panelId}
    className="relative overflow-auto custom-scrollbar"
    style={{
        maxHeight: "55vh",
        minHeight: "240px",
        isolation: "isolate",
    }}
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
 className="min-w-[180px] text-center py-2 font-semibold border-r-2 border-blue-300 bg-blue-200 text-blue-900"
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

                    console.log(
  group.title,
  column.key,
  "R=",
  totalRequirement,
  "A=",
  totalAvailable,
  "G=",
  totalRequirement - totalAvailable
);

                    const totalGap = totalRequirement - totalAvailable;

                    return (
                      <React.Fragment key={column.key}>
                        <td className="w-[55px] px-2 py-2 text-center bg-indigo-50 border-slate-300 font-bold border-y ">
                          {totalRequirement}
                        </td>
                        <td className="w-[55px] px-2 py-2 text-center font-bold border-y bg-indigo-50 border-slate-300">
                          {totalAvailable}
                        </td>
                        <td
                           className={`px-2 py-2 text-center font-bold border-r border-y bg-indigo-50 border-slate-300 ${

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

  return (
    <React.Fragment key={column.key}>
     <td className="w-[55px] px-2 py-2 text-center border-b border-slate-200">
         {requirement}
      </td>
    
 <td className="w-[55px] px-2 py-2 text-center border-b border-slate-200">

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
    className={`px-2 py-2 text-center font-bold border-r border-slate-300 ${

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
    </div>
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

export default HrDashboard;
