import { ReferenceLine } from "recharts";
import { LabelList } from "recharts";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { buildApiUrl } from "../lib/api";
import { hasPermission } from "../lib/session";
import Select, { components as ReactSelectComponents } from "react-select";
import {
  ChevronDown,
  Filter as FilterIcon,
  RefreshCcw,
  Sparkles,
  ChevronUp,
  Loader2,
} from "lucide-react";
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";
import { PieChart as PieIcon, TrendingUp } from "lucide-react";

const initialStats = {
  totalSites: null,
  totalFiber: null,
  totalManpower: null,
  totalScrum: null,
  siteBreakdown: [],
  uptimeData: [],
  monthlyData: [],
  yearlyData: [],
  fiberBreakdown: [],
};

const initialScrumFunctionSummary = {
  fiber: 0,
  fttx: 0,
  utility: 0,
  others: 0,
};

const weeklyFallback = [
  { label: "Mon", uptime: 92 },
  { label: "Tue", uptime: 95 },
  { label: "Wed", uptime: 90 },
  { label: "Thu", uptime: 97 },
  { label: "Fri", uptime: 94 },
  { label: "Sat", uptime: 96 },
];

const monthlyFallback = [
  { label: "Week 1", uptime: 93 },
  { label: "Week 2", uptime: 95 },
  { label: "Week 3", uptime: 92 },
  { label: "Week 4", uptime: 96 },
];

const siteData = [
  { value: 20 },
  { value: 25 },
  { value: 18 },
  { value: 30 },
  { value: 28 },
  { value: 35 },
];

const manpowerData = [
  { value: 10 },
  { value: 15 },
  { value: 12 },
  { value: 20 },
  { value: 18 },
  { value: 22 },
];

const scrumData = [
  { value: 30 },
  { value: 28 },
  { value: 35 },
  { value: 40 },
  { value: 38 },
  { value: 45 },
];

const COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#64748b",
];

const SCRUM_MANPOWER_COLORS = {
  Fiber: {
    solid: "#ef4444",
    start: "#fb7185",
    end: "#dc2626",
    depth: "#991b1b",
    label: "#7f1d1d",
  },
  FTTx: {
    solid: "#06b6d4",
    start: "#67e8f9",
    end: "#0891b2",
    depth: "#0e7490",
    label: "#164e63",
  },
  Utility: {
    solid: "#f59e0b",
    start: "#fcd34d",
    end: "#f97316",
    depth: "#c2410c",
    label: "#9a3412",
  },
  Others: {
    solid: "#84cc16",
    start: "#bef264",
    end: "#65a30d",
    depth: "#4d7c0f",
    label: "#365314",
  },
};

function isDashboardPayload(data) {
  return (
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    "totalSites" in data &&
    "totalManpower" in data &&
    "totalScrum" in data &&
    Array.isArray(data.siteBreakdown) &&
    Array.isArray(data.manpowerBreakdown)
  );
}

function formatDisplayDate(value) {
  if (!value) return "";

  // ✅ FIX: handle DD/MM/YYYY format
  const parts = value.split("/");

  if (parts.length === 3) {
    const [day, month, year] = parts;
    const d = new Date(`${year}-${month}-${day}`);
    
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  // fallback
  const d = new Date(value);
  if (Number.isNaN(d.valueOf())) return "";

  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatFiberValue(value) {
  return Number(value || 0).toFixed(2);
}

function formatNumber(value) {
  return Number(value).toFixed(2).replace(/\.00$/, "");
}

function truncateTo2(value) {
  return Number(Number(value).toFixed(2));
}

function ScrumManpowerTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  const item = payload[0]?.payload;

  if (!item) {
    return null;
  }

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur-md"
    >
      <div className="text-sm font-semibold text-slate-800">{item.name}</div>
      <div className="mt-1 text-xs text-slate-500">
        Count: <span className="font-semibold text-slate-700">{item.value}</span>
      </div>
      <div className="text-xs text-slate-500">
        Share: <span className="font-semibold text-slate-700">{item.percentage}%</span>
      </div>
    </div>
  );
}

const renderOutsideLabel = ({ cx, cy, midAngle, outerRadius, payload }) => {
  const RADIAN = Math.PI / 180;

  const radius = outerRadius + 25; // distance outside
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <g>
      {/* Line */}
      <line
        x1={cx + outerRadius * Math.cos(-midAngle * RADIAN)}
        y1={cy + outerRadius * Math.sin(-midAngle * RADIAN)}
        x2={x}
        y2={y}
        stroke="#cbd5e1"
        strokeDasharray="3 3"
      />

      {/* Text */}
      <text
        x={x}
        y={y - 10}
        textAnchor={x > cx ? "start" : "end"}
        className="fill-slate-700 text-[11px] font-semibold"
      >
        {payload.name}
      </text>

      <text
        x={x}
        y={y + 5}
        textAnchor={x > cx ? "start" : "end"}
        className="fill-slate-900 text-[14px] font-bold"
      >
        {payload.value}
      </text>

      <text
        x={x}
        y={y + 18}
        textAnchor={x > cx ? "start" : "end"}
        className="fill-slate-400 text-[11px]"
      >
        {payload.percentage}%
      </text>
    </g>
  );
};


function Dashboard() {
  const session = JSON.parse(localStorage.getItem("sessionUser"));
  const canViewDashboard =
  session && session.token && hasPermission("view_dashboard");
 
useEffect(() => {
  const session = JSON.parse(localStorage.getItem("sessionUser"));

  if (!session || !session.token) {
    window.location.href = "/";
  }
}, []);

  const canViewWifi = hasPermission("site.WIFI");
  const canViewGsc = hasPermission("site.GSC");
  const [activeIndex, setActiveIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [stats, setStats] = useState(initialStats);
  const [uptimeTrend, setUptimeTrend] = useState([]);
  const [trendFilter, setTrendFilter] = useState("last7");
  const [selectedDate, setSelectedDate] = useState("");
  const [filters, setFilters] = useState({
    circle: [],
    cmp: [],
    domain: [],
  });

  const toParam = (arr) => (arr && arr.length ? arr.map((o) => o.value).join(",") : "");

  const filterParams = useMemo(
    () => ({
      circle: toParam(filters.circle),
      cmp: toParam(filters.cmp),
      domain: toParam(filters.domain),
    }),
    [filters.circle, filters.cmp, filters.domain]
  );

useEffect(() => {
  fetchStats();   // ✅ always get fresh data from backend
}, []);

useEffect(() => {
  fetchUptimeTrend(trendFilter);
}, [trendFilter, filters.circle, filters.cmp]);

const [apiStatus, setApiStatus] = useState("checking");
const [lastUpdated, setLastUpdated] = useState(null);

  const [roleSummary, setRoleSummary] = useState([
  { category: "Loading...", total: 0 }
   ]);

  const [scrumCount, setScrumCount] = useState(0);
  const [scrumPieActiveIndex, setScrumPieActiveIndex] = useState(0);
  const [scrumFunctionSummary, setScrumFunctionSummary] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem("scrumFunctionSummary"));
      return cached && typeof cached === "object"
        ? {
            fiber: Number(cached.fiber || 0),
            fttx: Number(cached.fttx || 0),
            utility: Number(cached.utility || 0),
            others: Number(cached.others || 0),
          }
        : initialScrumFunctionSummary;
    } catch {
      return initialScrumFunctionSummary;
    }
  });
 
  useEffect(() => {
  const loadData = async () => {
    try {
      const [countRes, roleRes, functionSummaryRes] = await Promise.all([
        axios.get(buildApiUrl("/api/manpower/scrum/count"), { params: filterParams }),
        axios.get(buildApiUrl("/api/manpower/scrum/job-role-summary"), { params: filterParams }),
        axios.get(buildApiUrl("/api/manpower/scrum/function-summary"), { params: filterParams }),
      ]);

      const countData = countRes.data || {};
      const roleData = roleRes.data || [];
      const functionSummaryData = functionSummaryRes.data || {};

      setScrumCount(Number(countData.total || 0));
      setRoleSummary(Array.isArray(roleData) ? roleData : []);
      const nextSummary = {
        fiber: Number(functionSummaryData.fiber || 0),
        fttx: Number(functionSummaryData.fttx || 0),
        utility: Number(functionSummaryData.utility || 0),
        others: Number(functionSummaryData.others || 0),
      };
      setScrumFunctionSummary(nextSummary);
      localStorage.setItem("scrumFunctionSummary", JSON.stringify(nextSummary));
    } catch (err) {
      console.log(err);
    }
  };

  loadData();
}, [filterParams]);

  useEffect(() => {
     window.addEventListener("scrum-manpower-updated", handleScrumSummaryUpdated);
    return () => {
      window.removeEventListener("scrum-manpower-updated", handleScrumSummaryUpdated);
    };
  }, []);

  const handleScrumSummaryUpdated = (event) => {
  const detail = event.detail;

  // ✅ STOP if no real data
  if (
    !detail ||
    Object.keys(detail).length === 0 ||
    (detail.fiber === undefined &&
      detail.fttx === undefined &&
      detail.utility === undefined &&
      detail.others === undefined)
  ) {
    console.log("❌ Ignored empty scrum update");
    return;
  }

  const nextSummary = {
    fiber: Number(detail.fiber || 0),
    fttx: Number(detail.fttx || 0),
    utility: Number(detail.utility || 0),
    others: Number(detail.others || 0),
  };

  console.log("✅ Updating Scrum:", nextSummary);

  setScrumFunctionSummary(nextSummary);
  localStorage.setItem("scrumFunctionSummary", JSON.stringify(nextSummary));
};

 const circleOptions = [
  ...["Delhi", "Haryana", "Punjab", "Uttar Pradesh (East)"].map((v) => ({
    value: v,
    label: v,
  })),
];

  const circleToCmp = {
    Delhi: [
      "Delhi-1 (West)",
      "Delhi-2 (South)",
      "Delhi-3 (Central-East)",
      "Delhi-4 (North)",
      "Faridabad (NCR)",
      "Ghaziabad (NCR)",
      "Gurgaon (NCR)",
      "Noida (NCR)",
    ],
    Haryana: ["Ambala", "Hissar", "Karnal", "Panipat", "Rewari", "Rohtak"],
    Punjab: [
      "Amritsar",
      "Bhatinda",
      "Chandigarh",
      "Jalandhar",  
      "Ludhiana-1",
      "Ludhiana-2",
      "Pathankot",
      "Patiala",
      "Sangrur",
    ],
    "Uttar Pradesh (East)": [
      "Allahabad",
      "Azamgarh",
      "Faizabad",
      "Gorakhpur",
      "Raebareilly",
      "Varanasi",
    ],
  };

const domainOptions = [
  ...["Fiber", "FTTX", "Utility", "Others"].map((v) => ({
    value: v,
    label: v,
  })),
];

 const cmpOptions = useMemo(() => {
  if (!filters.circle.length) return [];

  const cmpList = filters.circle
    .map((c) => circleToCmp[c.value] || [])
    .flat();

  const uniqueOptions = Array.from(new Set(cmpList)).map((value) => ({
    value,
    label: value,
  }));

  return [
    { value: "__all__", label: "Select All" },
    ...uniqueOptions,
  ];
}, [filters.circle]);

  // Summary-only chips: keep single-line, no overflow
  const SummaryValueContainer = (props) => {
  const { getValue, hasValue, children } = props;
  const values = getValue();

  // ✅ If NO value → show default placeholder (IMPORTANT)
  if (!hasValue) {
    return (
      <ReactSelectComponents.ValueContainer {...props}>
        {children}
      </ReactSelectComponents.ValueContainer>
    );
  }

  // ✅ If value exists → show summary
  if (values.length === props.selectProps.options.length - 1 && props.selectProps.options[0].value === "__all__") {
  return (
    <ReactSelectComponents.ValueContainer {...props}>
      <span className="text-[13px] text-gray-800">All Selected</span>
      {children[1]}
    </ReactSelectComponents.ValueContainer>
  );
}

const summary =
  values.length === 1
    ? values[0].label
    : `${values[0].label} +${values.length - 1} more`;

  return (
    <ReactSelectComponents.ValueContainer {...props}>
      <span className="block max-w-[180px] truncate text-[13px] text-gray-800">
        {summary}
      </span>

      {/* keep input */}
      {children[1]}
    </ReactSelectComponents.ValueContainer>
  );
};

 const CheckboxOption = (props) => {
  const isAll = props.value === "__all__";
  const selected = props.selectProps.value || [];
  const total = props.options.length - 1;

  let checked = props.isSelected;
  let indeterminate = false;

  if (isAll) {
    checked = selected.length === total;
    indeterminate = selected.length > 0 && selected.length < total;
  }

  return (
    <ReactSelectComponents.Option {...props}>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          ref={(el) => {
            if (el) el.indeterminate = indeterminate;
          }}
          readOnly
          className="h-4 w-4 rounded border-gray-300 text-indigo-600"
        />
        <span className="text-[13px] text-gray-800">{props.label}</span>
      </div>
    </ReactSelectComponents.Option>
  );
};

  const selectStyles = {
    container: (base) => ({
      ...base,
      width: "100%",
    }),
    control: (base, state) => ({
      ...base,
      borderRadius: 12,
      borderColor: state.isFocused ? "rgb(var(--color-primary))" : "rgb(var(--color-border))",
      boxShadow: state.isFocused ? "0 0 0 3px rgba(99,102,241,0.15)" : "none",
      padding: "4px 10px",
      minHeight: 44,
      height: 44,
      backgroundColor: "rgb(var(--color-surface))",
      color: "rgb(var(--color-text-primary))",
      transition: "all 120ms ease",
    }),
    valueContainer: (base) => ({
      ...base,
      gap: 6,
      overflow: "hidden",
      flexWrap: "nowrap",
    }),
    input: (base) => ({
      ...base,
      margin: 0,
      padding: 0,
      color: "rgb(var(--color-text-primary))",
    }),
    placeholder: (base) => ({
      ...base,
      color: "rgb(var(--color-text-muted))",
      fontWeight: 400,
    }),
    singleValue: (base) => ({
      ...base,
      color: "rgb(var(--color-text-primary))",
      fontSize: 13,
    }),
    multiValue: () => null,
    option: (base, state) => ({
      ...base,
      borderRadius: 8,
      padding: "10px 12px",
      backgroundColor: state.isSelected
        ? "rgba(var(--color-primary), 0.12)"
        : state.isFocused
        ? "rgba(var(--color-primary), 0.08)"
        : "rgb(var(--color-surface))",
      color: "rgb(var(--color-text-primary))",
      boxShadow: state.isFocused ? "inset 0 0 0 1px rgba(var(--color-primary), 0.3)" : "none",
      display: "flex",
      alignItems: "center",
      gap: 8,
      fontWeight: 400,
    }),
    menu: (base) => ({
      ...base,
      borderRadius: 14,
      overflow: "hidden",
      backgroundColor: "rgb(var(--color-surface-elevated))",
      color: "rgb(var(--color-text-primary))",
      boxShadow:
        "0 15px 45px rgba(17,24,39,0.12), 0 5px 15px rgba(99,102,241,0.12)",
    }),
    menuPortal: (base) => ({
      ...base,
      zIndex: 9999,
    }),
    menuList: (base) => ({
      ...base,
      padding: 8,
      maxHeight: 260,
    }),
    indicatorSeparator: () => ({ display: "none" }),
    dropdownIndicator: (base) => ({
      ...base,
      color: "rgb(var(--color-text-muted))",
      ":hover": { color: "rgb(var(--color-primary))" },
    }),
    clearIndicator: (base) => ({
      ...base,
      color: "rgb(var(--color-text-muted))",
      ":hover": { color: "rgb(var(--color-danger))" },
    }),
    noOptionsMessage: (base) => ({
      ...base,
      color: "rgb(var(--color-text-secondary))",
      padding: "12px 8px",
    }),
  };

 const fetchStats = async () => {
  setErrorMessage("");

  try {
    const res = await axios.get(buildApiUrl("/api/dashboard/stats"), {
      params: filterParams,
    });

    console.log("Uptime API:", res.data);

    if (!isDashboardPayload(res.data)) {
      setErrorMessage("Invalid API response");
      setApiStatus("offline");
      return;
    }

    // ✅ ALWAYS USE LIVE DATA
    setStats((prev) => ({
  ...prev,
  ...res.data,
}));
    console.log("API Response:", res.data);
    console.log("Domain Data:", res.data.domainBreakdown);


    // ✅ STATUS
    setApiStatus("live");
    setLastUpdated(new Date());

  } catch (err) {
    console.log(err);

    // ⚠️ FALLBACK TO CACHE ONLY IF ERROR
    const cached = localStorage.getItem("dashboard");

    if (cached) {
      setStats(JSON.parse(cached));
    }

    setApiStatus("offline");
  }
};

const fetchUptimeTrend = async (type) => {
  try {
    const res = await axios.get(buildApiUrl("/api/dashboard/uptime-trend"), {
      params: {
        type,
        circle: filterParams.circle,
        cmp: filterParams.cmp,
      },
    });

  setUptimeTrend(
  (res.data || [])
    .slice(-7)   // ✅ KEEP ONLY LAST 7 RECORDS
    .map((item) => ({
      label: formatDisplayDate(item.date),
      uptime: truncateTo2(item.uptime),  
    }))
);

  } catch (err) {
    console.log("Uptime error:", err);
  }
};

const getTimeAgo = (date) => {
  if (!date) return "";

  const seconds = Math.floor((new Date() - new Date(date)) / 1000);

  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
};

 useEffect(() => {
  fetchStats();   // ✅ ALWAYS CALL API
}, [filterParams]);

 const handleFilterChange = (key, value) => {
  if (!value) {
    setFilters((prev) => ({ ...prev, [key]: [] }));
    return;
  }

  if (key === "cmp") {
    const isAllSelected = value.some((v) => v.value === "__all__");

    const allOptions = cmpOptions.filter((o) => o.value !== "__all__");

    // ✅ Click Select All
    if (isAllSelected) {
      setFilters((prev) => ({
        ...prev,
        cmp: allOptions,
      }));
      return;
    }

    // ✅ Auto-select when all manually selected
    if (value.length === allOptions.length) {
      setFilters((prev) => ({
        ...prev,
        cmp: allOptions,
      }));
      return;
    }

    setFilters((prev) => ({ ...prev, cmp: value }));
    return;
  }

  if (key === "circle") {
    setFilters({
      circle: value,
      cmp: [],
      domain: filters.domain,
    });
    return;
  }

  setFilters((prev) => ({ ...prev, [key]: value }));
};


  const resetFilters = () => {
    setFilters({ circle: [], cmp: [], domain: [] });
  };
  const totalManpowerCount = (stats.manpowerBreakdown || []).reduce(
    (sum, item) => sum + Number(item.count || 0),
    0
  );

  const scrumManpowerChartData = useMemo(() => {
    const total =
      Number(scrumFunctionSummary.fiber || 0) +
      Number(scrumFunctionSummary.fttx || 0) +
      Number(scrumFunctionSummary.utility || 0) +
      Number(scrumFunctionSummary.others || 0);

        if (total === 0) return []; // 🔥 IMPORTANT

    return [
      { name: "Fiber", value: Number(scrumFunctionSummary.fiber || 0) },
      { name: "FTTx", value: Number(scrumFunctionSummary.fttx || 0) },
      { name: "Utility", value: Number(scrumFunctionSummary.utility || 0) },
      { name: "Others", value: Number(scrumFunctionSummary.others || 0) },
    ].map((item) => ({
      ...item,
      percentage: total ? Number(((item.value / total) * 100).toFixed(1)) : 0,
      color: SCRUM_MANPOWER_COLORS[item.name].solid,
      labelColor: SCRUM_MANPOWER_COLORS[item.name].label,
      depthColor: SCRUM_MANPOWER_COLORS[item.name].depth,
      gradientId: `scrumGradient${item.name.replace(/[^a-zA-Z0-9]/g, "")}`,
      depthGradientId: `scrumDepthGradient${item.name.replace(/[^a-zA-Z0-9]/g, "")}`,
      displayIndex: String(
        ["Fiber", "FTTx", "Utility", "Others"].indexOf(item.name) + 1
      ).padStart(2, "0"),
    }));
  }, [scrumFunctionSummary]);

  const scrumManpowerTotal = useMemo(
    () =>
      scrumManpowerChartData.reduce(
        (sum, item) => sum + Number(item.value || 0),
        0
      ),
    [scrumManpowerChartData]
  );

  const scrumManpowerPieData = useMemo(() => {
  return scrumManpowerChartData;
}, [scrumManpowerChartData]);

const siteBreakdownView = useMemo(() => {
  if (!stats.siteBreakdown || !stats.siteBreakdown.length) return [];

  return stats.siteBreakdown
    .filter((item) => item?.type)
    .filter((item) => {
      const normalizedType = String(item.type).toUpperCase();
      if (normalizedType === "WIFI" && !canViewWifi) return false;
      if (normalizedType === "GSC" && !canViewGsc) return false;
      return true;
    })
    .map((item) => {
      // ✅ FIX: use count-based latest date
      return {
        type: String(item.type).toUpperCase(),
        count: Number(item.count || 0),

        // 🔥 IMPORTANT FIX HERE
        latestDate: item.reportDate || item.latestDate || null,
      };
    });
}, [stats.siteBreakdown, canViewWifi, canViewGsc]);

// ✅ FIBER GROUPING
const fiberBreakdownView = useMemo(() => {
  const grouped = {};

  (stats.fiberBreakdown || []).forEach((item) => {
    const category = item.fiberType || item.category || "Other";

    if (!grouped[category]) {
      grouped[category] = {
        aerial: 0,
        ug: 0,
        total: 0,
      };
    }

    grouped[category].aerial += Number(item.aerial || 0);
    grouped[category].ug += Number(item.ug || 0);
    grouped[category].total += Number(item.aerial || 0) + Number(item.ug || 0);
  });

  Object.values(grouped).forEach((item) => {
    item.aerial = Number(item.aerial.toFixed(2));
    item.ug = Number(item.ug.toFixed(2));
    item.total = Number(item.total.toFixed(2));
  });

  return grouped;
}, [stats.fiberBreakdown]);

// ✅ TOTAL FIBER (THIS WAS MISSING ❗)
const totalFiberCount = useMemo(() => {

  return Object.values(fiberBreakdownView).reduce(
    (sum, item) => sum + item.total,
    0
  );
}, [fiberBreakdownView]);

  if (!canViewDashboard) {
    return (
      <div className="rounded-2xl border border-border-color bg-surface p-8 text-text-secondary shadow-soft">
        You do not have permission to view the dashboard.
      </div>
    );
  }

const getTrendColor = (data) => {
  if (!data.length) return "#3b82f6";

  const last = data[data.length - 1]?.uptime;

  if (last >= 99.5) return "#16a34a";   // green 🔥
  if (last >= 98) return "#2563eb";     // blue
  return "#dc2626";                     // red
};

const trendColor = getTrendColor(uptimeTrend);
  
  //main return //

  return (
    <div className="space-y-3 text-text-primary">

      {/* Filters */}
      <div className="relative -mt-6">
      <div className="app-surface relative overflow-visible px-4 py-2">
<div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-border-color to-transparent" />
        
            <div className="relative flex flex-col gap-1">

  {/* 🔥 FILTER ROW */}
  <div className="flex items-center w-full">
     
              <div className="flex items-center gap-3 flex-1">
               <div className="w-[220px] shrink-0">
                  <Select
                    isMulti
                    placeholder="Select Circle"
                    value={filters.circle}
                    options={circleOptions}
                    onChange={(val) => handleFilterChange("circle", val)}
                    className="react-select-container"
                    classNamePrefix="rs"
                    styles={selectStyles}
                    menuPortalTarget={typeof document !== "undefined" ? document.body : undefined}
                    menuPosition="fixed"
                    menuPlacement="auto"
                    components={{
                      Option: CheckboxOption,
                      MultiValue: () => null,
                      ValueContainer: SummaryValueContainer,
                    }}
                    closeMenuOnSelect={true}
                    blurInputOnSelect={true}
                    hideSelectedOptions={false}
                  />
                </div>

                <div className="w-[220px] shrink-0">
                  <Select
                    isMulti
                    isDisabled={!filters.circle.length}
                    placeholder={filters.circle.length ? "Select CMP" : "Select Circle first"}
                    value={filters.cmp}
                    options={cmpOptions}
                    onChange={(val) => handleFilterChange("cmp", val)}
                    className="react-select-container"
                    classNamePrefix="rs"
                    styles={selectStyles}
                    components={{
                      Option: CheckboxOption,
                      MultiValue: () => null,
                      ValueContainer: SummaryValueContainer,
                    }}
                    title={!filters.circle.length ? "Select Circle first" : ""}
                    menuPortalTarget={typeof document !== "undefined" ? document.body : undefined}
                    menuPosition="fixed"
                    menuPlacement="auto"
                    maxMenuHeight={220}
                    closeMenuOnSelect={true}
                    blurInputOnSelect={true}
                    hideSelectedOptions={false}
                    noOptionsMessage={() =>
                      filters.circle.length ? "No CMP found for selection" : "Select Circle first"
                    }
                  />
                </div>

                <div className="w-[220px] shrink-0">
                  <Select
                    isMulti
                    placeholder="Select Domain"
                    value={filters.domain}
                    options={domainOptions}
                    onChange={(val) => handleFilterChange("domain", val)}
                    className="react-select-container"
                    classNamePrefix="rs"
                    styles={selectStyles}
                    components={{
                      Option: CheckboxOption,
                      MultiValue: () => null,
                      ValueContainer: SummaryValueContainer,
                    }}
                    menuPortalTarget={typeof document !== "undefined" ? document.body : undefined}
                    menuPosition="fixed"
                    menuPlacement="auto"
                    maxMenuHeight={220}
                    closeMenuOnSelect={true}
                    blurInputOnSelect={true}
                    hideSelectedOptions={false}
                  />
                </div>
            </div>


  {/* RIGHT SIDE (NOW CORRECT) */}
  <div className="ml-auto flex items-center gap-3">

    <button
      onClick={resetFilters}
      className="app-button-ghost px-3 py-1.5 text-[12px]"
    >
      <RefreshCcw size={14} />
      Reset
    </button>

    <div
      className={`flex items-center gap-2 px-3 py-1 rounded-full 
      text-xs font-medium border
      ${
        apiStatus === "live"
          ? "bg-green-100 text-green-700 border-green-200"
          : apiStatus === "checking"
          ? "bg-yellow-100 text-yellow-700 border-yellow-200"
          : "bg-red-100 text-red-700 border-red-200"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          apiStatus === "live"
            ? "bg-green-500 animate-pulse"
            : apiStatus === "checking"
            ? "bg-yellow-500"
            : "bg-red-500"
        }`}
      ></span>

      {apiStatus === "live" && (
        <>Live • {lastUpdated ? getTimeAgo(lastUpdated) : ""}</>
      )}

      {apiStatus === "checking" && "Checking..."}
      {apiStatus === "offline" && "Offline"}
    </div>

  </div>
</div>

          </div>
      </div>
      </div>

      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="app-card flex items-center justify-between bg-white/70
         backdrop-blur-md border border-white/40 shadow-[0_8px_30px_rgba(0,0,0,0.06)] 
         rounded-2xl px-4 py-3 transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
          <div>
            <p className="mb-1 text-sm text-text-secondary">Total Active Sites</p>
            <h2 className="text-2xl font-bold text-text-primary">
             {stats.totalSites !== null ? formatNumber(stats.totalSites) : "--"}
            </h2>
          </div>

          <LineChart width={80} height={40} data={siteData}>
            <Line
              type="monotone"
              dataKey="value"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </div>

        <div className="app-card flex items-center justify-between bg-white/70
         backdrop-blur-md border border-white/40 shadow-[0_8px_30px_rgba(0,0,0,0.06)] 
         rounded-2xl px-4 py-3 transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
  <div>
    <p className="mb-1 text-sm text-text-secondary">Total Active Fiber</p>
    <h2 className="text-2xl font-bold text-text-primary">
     {totalFiberCount !== null ? formatFiberValue(totalFiberCount) : "--"}
    </h2>
  </div>

  <LineChart width={80} height={40} data={siteData}>
    <Line
      type="monotone"
      dataKey="value"
      stroke="#6366f1"
      strokeWidth={2}
      dot={false}
    />
  </LineChart>
</div>

        <div className="app-card flex items-center justify-between bg-white/70
         backdrop-blur-md border border-white/40 shadow-[0_8px_30px_rgba(0,0,0,0.06)] 
         rounded-2xl p-4 transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
          <div>
            <p className="mb-1 text-sm text-text-secondary">Total Active Manpower</p>
            <h2 className="text-2xl font-bold text-text-primary">
             {stats.totalManpower !== null ? stats.totalManpower : "--"}
            </h2>
          </div>

          <LineChart width={80} height={40} data={manpowerData}>
            <Line
              type="monotone"
              dataKey="value"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </div>

        <div className="app-card flex items-center justify-between bg-white/70 
        backdrop-blur-md border border-white/40 shadow-[0_8px_30px_rgba(0,0,0,0.06)] 
        rounded-2xl px-4 py-3 transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
          <div>
            <p className="mb-1 text-sm text-text-secondary">
              Total (Scrum Manpower)
            </p>
            <h2 className="text-2xl font-bold text-text-primary">
              {scrumCount || 0}
            </h2>
          </div>

          <LineChart width={80} height={40} data={scrumData}>
            <Line
              type="monotone"
              dataKey="value"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="flex h-[300px] flex-col rounded-2xl bg-white/70 backdrop-blur-md 
         border border-white/40 shadow-[0_10px_35px_rgba(0,0,0,0.05)] p-4">
          <h4 className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-800">
            Site Types
            <span className="text-xs text-gray-400">Overview</span>
          </h4>

          <div className="hide-scrollbar max-h-64 space-y-3 overflow-y-auto pr-1">
            {siteBreakdownView.map((item, index) => (
              <div key={index}
                className="flex items-center justify-between rounded-lg px-2 py-2 transition 
                bg-white/60 hover:bg-white/90 backdrop-blur-sm border border-white/30 
                shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500"></div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-slate-800">
                      {item.type}
                    </span>
                    <div className="text-[11px] text-gray-400">
                    Date: {item.latestDate ? formatDisplayDate(item.latestDate) : "No Data"}
                    </div>
        </div>
       </div>

                <span className="rounded-md bg-green-100 px-2 py-1 text-xs font-semibold text-green-600">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex h-[300px] flex-col rounded-2xl bg-white/70 backdrop-blur-md 
         border border-white/40 shadow-[0_10px_35px_rgba(0,0,0,0.05)] p-4">
   <h4 className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-800">
    Fiber Inventory
    <span className="text-xs text-gray-400">Overview</span>
  </h4>

  <div className="hide-scrollbar max-h-64 space-y-3 overflow-y-auto pr-1">
   {Object.entries(fiberBreakdownView).map(([category, data], index) => (
  <div
    key={index}
    className="rounded-xl bg-white/70 backdrop-blur-sm border border-white/40 
      px-2 py-2 shadow-sm hover:shadow-lg transition">

    {/* HEADER */}
    <div className="flex justify-between items-center mb-2">
      <span className="text-sm font-semibold text-gray-800">
        {category}
      </span>

      <span className="text-xs font-bold bg-indigo-100 text-indigo-600 px-2 py-1 rounded-md">
        {formatFiberValue(data.total)}
      </span>
    </div>

    {/* SUB ITEMS */}
    <div className="space-y-1 text-xs text-slate-600">
      <div className="flex justify-between">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-blue-500"></span>
          Aerial
        </span>
        <span>{formatFiberValue(data.aerial)}</span>
      </div>

      <div className="flex justify-between">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-purple-500"></span>
          UG
        </span>
        <span>{formatFiberValue(data.ug)}</span>
      </div>
    </div>
  </div>
))}
  </div>
</div>

        <div className="flex h-[300px] flex-col rounded-2xl bg-white/70 backdrop-blur-md 
         border border-white/40 shadow-[0_10px_35px_rgba(0,0,0,0.05)] p-4">
          <h4 className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-800">
            Manpower Roles
            <span className="text-xs text-gray-400">Active</span>
          </h4>

          <div className="hide-scrollbar max-h-64 space-y-3 overflow-y-auto pr-2">
            {(stats.manpowerBreakdown || []).map((item, index) => (
              <div
                key={index}
                className="flex items-center justify-between rounded-lg px-2 py-2 transition 
                bg-white/60 hover:bg-white/90 backdrop-blur-sm border border-white/30 
                shadow-sm">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-slate-800">
                    {item.function}
                  </span>
                  <span className="text-xs text-gray-400">Active Role</span>
                </div>

                <span className="rounded-md bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-600">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex h-[300px] flex-col rounded-2xl bg-white/70 backdrop-blur-md  
        border border-white/40 shadow-[0_10px_35px_rgba(0,0,0,0.05)] p-4">
          <h4 className="mb-2 text-sm font-semibold text-slate-800">
            Job Roles
          </h4>

      <div className="hide-scrollbar max-h-64 space-y-3 overflow-y-auto pr-1">
  {roleSummary.map((item, index) => (
    <div
      key={item.category}
      className="flex items-center justify-between rounded-lg px-2 py-2 transition bg-white/60 hover:bg-white/90 backdrop-blur-sm border border-white/30 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-blue-500"></div>

        <div className="flex flex-col">
          <span className="text-sm font-medium text-slate-800">
            {item.category}
          </span>
          <span className="text-[11px] text-gray-400">
            Job Role
          </span>
        </div>
      </div>

      <span className="rounded-md bg-indigo-100 px-2 py-1 text-xs font-semibold text-indigo-600">
        {item.total}
      </span>
    </div>
  ))}
</div>   
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3 items-stretch">

        <div className="flex h-full flex-col rounded-2xl bg-white/70 backdrop-blur-md 
         border border-white/40 shadow-[0_10px_40px_rgba(0,0,0,0.08)]  p-5 md:col-span-2">
        
        <div className="mb-4 flex items-center justify-between">
         <h4 className="flex items-center gap-2 text-md font-semibold text-slate-800">
            <TrendingUp size={18} />
              Uptime Trend
              </h4>

 <div className="flex items-center bg-gray-100 p-1 rounded-xl shadow-inner">

  {[
    { key: "last7", label: "Last 7 Days" },
    { key: "monthly", label: "Monthly" },
    { key: "yearly", label: "Yearly" },
  ].map((item) => (
    <button
      key={item.key}
      onClick={() => setTrendFilter(item.key)}
      className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all duration-300 ${
        trendFilter === item.key
          ? "bg-white text-blue-600 shadow-md scale-105"
          : "text-gray-500 hover:text-gray-700"
      }`}
    >
      {item.label}
    </button>
  ))}

</div>
</div>

  <ResponsiveContainer width="100%" height={365}>
           <AreaChart
             data={uptimeTrend}
             margin={{ top: 30, right: 25, left: -10, bottom: 0 }}  
             >

  <defs>
    <linearGradient id="colorUptime" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={trendColor} stopOpacity={0.4} />
      <stop offset="60%" stopColor={trendColor} stopOpacity={0.15} />
      <stop offset="100%" stopColor={trendColor} stopOpacity={0} />
    </linearGradient>
  </defs>

  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.4} />

  <XAxis
  dataKey="label"
  type="category"
  interval={0}
  tick={{ fontSize: 12, fill: "#6b7280" }}
  axisLine={false}
  tickLine={false}
  padding={{ left: 30, right: 20 }} 
/>

  <YAxis
  domain={[97, 100]}   // or your dynamic domain
  ticks={[
     97, 97.5, 98, 98.5, 99, 99.5, 100
  ]}
  tick={{ fontSize: 12, fill: "#6b7280" }}
  axisLine={false}
  tickLine={false}
/>

  {/* 🔥 Benchmark Line */}
  <ReferenceLine
    y={99}
    stroke="#10b981"
    strokeDasharray="4 4"
    strokeWidth={1.5}
  />

  <Tooltip
    formatter={(value) => [`${truncateTo2(value)}%`, "Uptime"]}
    contentStyle={{
      borderRadius: "12px",
      border: "none",
      boxShadow: "0 8px 25px rgba(0,0,0,0.1)",
      fontSize: "13px",
    }}
  />

  <Area
  type="monotone"
  dataKey="uptime"
  stroke={trendColor}
  strokeWidth={3.5}
  fill="url(#colorUptime)"
  dot={(props) => {
    const { cx, cy, index } = props;
    const lastIndex = uptimeTrend.length - 1;

    if (index === lastIndex) {
      return (
        <circle
          cx={cx}
          cy={cy}
          r={6}
          fill={trendColor}
          stroke="#fff"
          strokeWidth={2}
        />
      );
    }

    return <circle cx={cx} cy={cy} r={3} fill={trendColor} />;
  }}
  activeDot={{
    r: 7,
    stroke: trendColor,
    strokeWidth: 2,
    fill: "#fff",
  }}
>

  {/* ✅ MUST BE INSIDE */}
 <LabelList
  dataKey="uptime"
  position="top"
  offset={10}   // slight adjust
  formatter={(value) => `${truncateTo2(value)}%`}
  style={{
    fontSize: "11px",
    fill: "#2563eb",
    fontWeight: 600,
  }}
/>

</Area>
 </AreaChart>
          </ResponsiveContainer>
        </div>
         
      {/* SCRUM MANPOWER CARD */}
<div className="flex h-full flex-col rounded-2xl border border-white/60 bg-[radial-gradient(circle_at_top,#f8fbff,rgba(255,255,255,0.98)_52%,rgba(241,245,249,0.98)_100%)] p-4 shadow-[0_24px_55px_rgba(15,23,42,0.11)] backdrop-blur-md md:col-span-1">
  <div className="mb-4 flex items-center justify-between">
    <h4 className="text-md font-semibold text-slate-800">
      Scrum Manpower
    </h4>
    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
      Live
    </span>
  </div>

  <div className="flex flex-1 items-center justify-center py-1">
  <div className="h-[290px] w-full max-w-[325px] min-w-[280px]">
    <ResponsiveContainer width="100%" height={290}>
      <PieChart>
        <defs>
          {scrumManpowerPieData.map((item) => (
            <g key={item.gradientId}>
              <linearGradient
                id={item.gradientId}
                x1="0"
                y1="0"
                x2="1"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor={
                    item.isPlaceholder
                      ? "#f8fafc"
                      : SCRUM_MANPOWER_COLORS[item.name].start
                  }
                />
                <stop
                  offset="50%"
                  stopColor={
                    item.isPlaceholder
                      ? "#e2e8f0"
                      : SCRUM_MANPOWER_COLORS[item.name].solid
                  }
                />
                <stop
                  offset="100%"
                  stopColor={
                    item.isPlaceholder
                      ? "#cbd5e1"
                      : SCRUM_MANPOWER_COLORS[item.name].end
                  }
                />
              </linearGradient>
              <linearGradient
                id={item.depthGradientId}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor={item.isPlaceholder ? "#cbd5e1" : item.depthColor}
                />
                <stop
                  offset="100%"
                  stopColor={item.isPlaceholder ? "#94a3b8" : item.color}
                />
              </linearGradient>
            </g>
          ))}
        </defs>

        <Pie
          data={scrumManpowerPieData.length ? scrumManpowerPieData : []}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={100}
          paddingAngle={3}
          cornerRadius={7}
          activeIndex={scrumPieActiveIndex}
          activeOuterRadius={128}
          onMouseEnter={(_, index) => setScrumPieActiveIndex(index)}
          onMouseLeave={() => setScrumPieActiveIndex(0)}
          isAnimationActive={false}
          animationDuration={420}
          filter="url(#scrumPieShadow)"
          labelLine={false}
          label={renderOutsideLabel}
          labelLine={false}
        >
          {scrumManpowerPieData.map((item) => (
            <Cell
            key={item.name}
           fill={`url(#${item.gradientId})`}
           stroke="transparent"
           strokeWidth={0}
          />
          ))}
        </Pie>
        <Tooltip content={<ScrumManpowerTooltip />} />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-slate-800 text-[25px] font-semibold"
        >
          {scrumManpowerTotal}
        </text>
        <text
          x="51%"
          y="58%"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-slate-400 text-[10px] font-semibold uppercase tracking-[0.22em]"
        >
          {scrumManpowerTotal > 0 ? "Total" : "Waiting For Data"}
        </text>
      </PieChart>
    </ResponsiveContainer>
  </div>
  </div>

  <div className="mt-3 grid grid-cols-4 gap-2">
    {scrumManpowerChartData.map((item) => (
      <button
        key={item.name}
        type="button"
        onMouseEnter={() =>
          setScrumPieActiveIndex(
            scrumManpowerChartData.findIndex((entry) => entry.name === item.name)
          )
        }
        className={`rounded-xl border px-2 py-2 text-left transition ${
          scrumManpowerChartData[scrumPieActiveIndex]?.name === item.name
            ? "border-slate-300 bg-white shadow-md"
            : "border-white/70 bg-white/70 hover:bg-white"
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-xs font-medium text-slate-700">{item.name}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-1">
          <span className="text-sm font-semibold text-slate-900">{item.value}</span>
          <span className="text-[10px] font-medium text-slate-400">{item.percentage}%</span>
        </div>
      </button>
    ))}
  </div>
</div>

      </div>
    </div>
  );
}

export default Dashboard;
