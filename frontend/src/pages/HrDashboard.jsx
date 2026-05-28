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
} from "lucide-react";

import { buildApiUrl } from "../lib/api";

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
  { key: "technicianb", label: "TechnicianB" },
  { key: "riggerb", label: "RiggerB" },
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
      "Nanded",
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
{
  key: "bench",
  label: "Bench Strength",
  icon: Users,
  tint:
    "from-slate-50 via-white to-gray-50/70 border-slate-200 text-slate-700",
  badge: "bg-slate-100 text-slate-700",
  valueClass: "text-slate-700",
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

  useEffect(() => {
    loadJobRoles();
    loadCircles();
    loadEmploymentStatus();
    loadScrumCount();
    loadSignoffData();
    loadActiveData();
    loadScrumActiveData();
  }, []);

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
      const response = await fetch(buildApiUrl("/api/physical/job-role-count"));
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
      const response = await fetch(buildApiUrl("/api/physical/circle-count"));
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
      const response = await fetch(
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
      const response = await fetch(buildApiUrl("/api/manpower/scrum/count"));
      const result = await response.json();
      setScrumCount(result);
    } catch (error) {
      console.log(error);
    }
  };

  const loadActiveData = async () => {
    try {
      const response = await fetch(
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
      const response = await fetch(
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
      const response = await fetch(buildApiUrl("/api/signoff"));
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
    return cmpGroups
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
  }, [searchText, selectedCircle, selectedCmp]);

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

        sum.bench +=
          Number(row.technicianb || 0) + Number(row.riggerb || 0);

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
    return cmpGroups
      .filter((group) => {
        if (selectedCircle === "") return true;
        return group.title.toLowerCase().includes(selectedCircle.toLowerCase());
      })
      .flatMap((group) => group.items);
  }, [selectedCircle]);

  const getSignoffRow = (cmpName) => signoffLookup[normalizeCmpName(cmpName)];

  const resetFilters = () => {
    setSearchText("");
    setSelectedCircle("");
    setSelectedCmp("");
  };

  const topMeta = [
    { label: "Total Employees", value: totalEmployees || employmentTotals.total },
    { label: "Circle Coverage", value: circles.length || cmpGroups.length },
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
      



      <div className="rounded-[12px] border border-slate-200/70 bg-white/90 p-2 backdrop-blur-xl">
        <div className="grid grid-cols-4 gap-2 xl:grid-cols-[1.15fr_1fr_1fr_0.9fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search anything..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              className="h-9 w-full rounded-[12px] border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] pl-12 pr-4 text-[15px] text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
            />
          </div>

          <select
            value={selectedCircle}
            onChange={(event) => setSelectedCircle(event.target.value)}
            className="h-9 w-full rounded-[12px] border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] px-4 text-[13px] text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
          >
            <option value="">Select Circle</option>
            <option value="Punjab">Punjab</option>
            <option value="Haryana">Haryana</option>
            <option value="Delhi">Delhi</option>
            <option value="UP East">UP East</option>
          </select>

          <select
            value={selectedCmp}
            onChange={(event) => setSelectedCmp(event.target.value)}
            className="h-9 w-full rounded-[12px] border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] px-4 text-[13px] text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
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
            className="inline-flex h-9 items-center justify-center gap-3 rounded-[12px] bg-[linear-gradient(96deg,_#3b82f6_0%,_#7c3aed_100%)] px-4 text-base font-semibold text-white transition hover:brightness-105"
          >
            <RefreshCcw className="h-4 w-4" />
            Reset
          </button>
        </div>
      </div>

      <div className="mt-1 grid grid-cols-2 gap-1 xl:grid-cols-[1.03fr_3.17fr]">
        <div className="rounded-[12px] border border-slate-200/70 bg-white/92 px-4 py-2 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-indigo-600">
                SIGN OFF
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Physical & Scrum Final Approval Status
              </p>
            </div>

            <div className="flex h-9 w-9 items-center justify-center rounded-[14px] bg-emerald-50 text-emerald-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 md:grid-cols-3 xl:grid-cols-6">
          {statCardConfig.map((card) => {
            const Icon = card.icon;

            return (
              <div
                key={card.key}
                className={`rounded-[12px] border bg-[linear-gradient(180deg,_rgba(255,255,255,0.98)_0%,_rgba(248,250,252,0.92)_100%)] px-3 py-2 ${card.tint}`}
              >
                <div className="flex items-center gap-2">
                 

                  <div className="min-w-0">
                    <p className="truncate text-[0.58rem] font-semibold uppercase tracking-[0.16em]">
                      {card.label}
                    </p>
                    <p className={`mt-1 text-[1rem] font-semibold leading-none ${card.valueClass}`}>
                      {categoryTotals[card.key]}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-1 grid grid-cols-1 gap-1 xl:grid-cols-2">
        <TablePanel
          panelId="physicalScroll"
           showJoining={true}
          icon={BriefcaseBusiness}
          title="PHYSICAL REQUIREMENT"
          subtitle="Requirement vs Available Manpower"
          description="Physical teams are field staff required for infrastructure deployment and maintenance."
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
          title="SCRUM MANPOWER"
          subtitle="Overview Scrum Manpower"
          description="Scrum teams include project management and support staff for planning and execution."
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
          subText={`Active manpower tracked across ${circles.length || cmpGroups.length} circle groups.`}
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
})
 {
  
  return (
    <div className="overflow-hidden rounded-[12px] border border-slate-200/70 bg-white/92">
      <div className={`bg-gradient-to-r ${gradient} px-4 py-2 text-white md:px-4 md:py-2`}>
        <div className="flex items-center gap-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] border border-white/20 bg-white/14 backdrop-blur-xl">
            <Icon className="h-4 w-4" />
          </div>

          <div>
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-white/95">
              {title}
            </p>
            <p className=" text-xs text-white">{subtitle}</p>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 md:px-4">
        {description}
      </div>

      <div
        id={panelId}
        className="custom-scrollbar overflow-x-auto overflow-y-auto bg-[linear-gradient(180deg,_#ffffff_0%,_#fbfdff_100%)]"
        style={{ maxHeight: "45vh", minHeight: "240px" }}
      >
        <table className="min-w-max whitespace-nowrap text-sm">
          <thead>
            <tr className="sticky top-0 z-[90] bg-[#f8fbff] text-[11px] uppercase text-slate-700">
              <th
                rowSpan={2}
                className="sticky left-0 top-0 z-[95] min-w-[140px] border border-slate-200 bg-[#f8fbff] px-4 py-1 text-left font-bold shadow-[8px_0_20px_rgba(241,245,249,0.95)]"
              >
                CMP
              </th>

              {columns.map((column) => (
                <th
                  key={column.key}
                  colSpan={3}
                  className={`border border-slate-200 px-2 py-1 text-center font-semibold ${accent}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>

            <tr className="sticky top-[27px] z-[85] bg-white text-[11px] text-slate-500">
              {columns.map((column) => (
                <React.Fragment key={column.key}>
                  <th className="border border-slate-200 px-2 py-1 text-center font-semibold">
                    R
                  </th>
                  <th className="border border-slate-200 px-2 py-1 text-center font-semibold">
                    A
                  </th>
                  <th className="border border-slate-200 px-2 py-1 text-center font-semibold">
                    G
                  </th>
                </React.Fragment>
              ))}
            </tr>
          </thead>

          <tbody className="text-[12px] text-slate-700">
            {groups.map((group) => (
              <React.Fragment key={group.title}>
                <tr className="bg-slate-50 font-semibold">
                  <td className="sticky left-0 z-[80] min-w-[140px] border border-slate-200 bg-slate-50 px-4 py-1 text-[12px] shadow-[8px_0_20px_rgba(241,245,249,0.95)]">
                    {`Total (${group.items.reduce(
                      (sum, cmpName) =>
                        sum +
                        Object.values(countLookup?.[cmpName] || {}).reduce(
                          (roleSum, value) =>
                            roleSum +
                            Number(
                              showJoining ? value?.total || 0 : value || 0
                            ),
                          0
                        ),
                      0
                    )})`}
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

                    return (
                      <React.Fragment key={column.key}>
                        <td className="border border-slate-200 px-2 py-1 text-center">
                          {totalRequirement}
                        </td>
                        <td className="border border-slate-200 px-2 py-1 text-center">
                          {totalAvailable}
                        </td>
                        <td
                          className={`border border-slate-200 px-2 py-1 text-center font-bold ${
                            totalGap <= 0 ? "text-emerald-600" : "text-red-500"
                          }`}
                        >
                          {totalGap}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>

                {group.items.map((cmpName) => {
                  const signoffRow = getSignoffRow(cmpName);

                  return (
                    <tr key={cmpName} className="transition hover:bg-slate-50/90">
                      <td className="sticky left-0 z-[70] min-w-[140px] border border-slate-200 bg-white px-2 py-1 font-medium">
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
      <td className="border border-slate-200 px-2 py-1 text-center font-semibold text-slate-900">
         {requirement}
      </td>
    
 <td className="border border-slate-200 px-2 py-1 text-center">

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
      className={`border border-slate-200 px-2 py-1 text-center font-semibold ${
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
