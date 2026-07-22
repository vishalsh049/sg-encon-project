import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import Select, { components as ReactSelectComponents } from "react-select";
import {
  Activity,
  AlertTriangle,
  Cable,
  Globe,
  RefreshCcw,
  Users,
} from "lucide-react";
import { buildApiUrl } from "../lib/api";
import { getStoredSession, hasPermission } from "../lib/session";
import { getPagePermission } from "../utils/access";
import UptimeTrendCard from "../components/dashboard/UptimeTrendCard";
import ScrumManpowerCard from "../components/dashboard/ScrumManpowerCard";

// ---------------------------------------------------------------------------
// Filter taxonomy
// ---------------------------------------------------------------------------
// These labels are the values actually stored in the database (enb.circle,
// scrum_manpower.state / maintenance_point), which is why they are spelled
// "Uttar Pradesh (East)" rather than the "UP East" wording used by the HR
// pages' cmpGroups list. Changing them here would silently break filtering.
const CIRCLE_TO_CMP = {
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

const ALL_CIRCLES = Object.keys(CIRCLE_TO_CMP);

const DOMAIN_OPTIONS = ["Fiber", "FTTX", "Utility", "Others"].map((v) => ({
  value: v,
  label: v,
}));

// A user whose circle is "All" / "All Circle" sees every circle; anyone else is
// locked to their own. The backend enforces this independently — this only
// keeps the UI from offering choices that would be ignored.
const ALL_CIRCLE_KEYS = new Set(["all", "allcircle", "allcircles"]);

const isAllCircleUser = (circle) =>
  ALL_CIRCLE_KEYS.has(String(circle || "").replace(/\s+/g, "").toLowerCase());

const matchCircleLabel = (circle) => {
  const key = String(circle || "").replace(/[\s()]/g, "").toLowerCase();
  return (
    ALL_CIRCLES.find(
      (label) => label.replace(/[\s()]/g, "").toLowerCase() === key
    ) || null
  );
};

// ---------------------------------------------------------------------------
// Scrum domain bucketing
// ---------------------------------------------------------------------------
// Mirrors backend/utils/scrumDashboardShared.js: FTTx is matched before Fiber,
// so "FTTx Fiber Splicer" buckets as FTTx in both places.
function bucketFunction(name) {
  const normalized = String(name || "").trim().toLowerCase();
  if (!normalized) return "others";
  if (normalized.includes("fttx")) return "fttx";
  if (normalized.includes("fiber") || normalized.includes("fibre")) return "fiber";
  if (normalized.includes("utility")) return "utility";
  return "others";
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
function formatCount(value) {
  if (value == null || Number.isNaN(Number(value))) return "--";
  return Number(value).toLocaleString("en-IN");
}

function formatFiberValue(value) {
  return Number(value || 0).toFixed(2);
}

function formatDisplayDate(value) {
  if (!value) return "";

  // Upload dates arrive either as DD/MM/YYYY strings or ISO timestamps.
  const parts = String(value).split("/");
  const parsed =
    parts.length === 3
      ? new Date(`${parts[2]}-${parts[1]}-${parts[0]}`)
      : new Date(value);

  if (Number.isNaN(parsed.valueOf())) return "";

  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTimeAgo(date) {
  if (!date) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

// ---------------------------------------------------------------------------
// react-select config — defined at module scope so react-select receives stable
// component/style identities. Previously these were re-created on every render,
// which remounted the menus and made every keystroke feel sluggish.
// ---------------------------------------------------------------------------
const SummaryValueContainer = (props) => {
  const { getValue, hasValue, children } = props;

  if (!hasValue) {
    return (
      <ReactSelectComponents.ValueContainer {...props}>
        {children}
      </ReactSelectComponents.ValueContainer>
    );
  }

  const values = getValue();
  const options = props.selectProps.options || [];
  const hasSelectAll = options[0]?.value === "__all__";

  const summary =
    hasSelectAll && values.length === options.length - 1
      ? "All Selected"
      : values.length === 1
      ? values[0].label
      : `${values[0].label} +${values.length - 1} more`;

  return (
    <ReactSelectComponents.ValueContainer {...props}>
      <span className="block max-w-[180px] truncate text-[13px] text-text-primary">
        {summary}
      </span>
      {children[1]}
    </ReactSelectComponents.ValueContainer>
  );
};

const CheckboxOption = (props) => {
  const isAll = props.value === "__all__";
  const selected = props.selectProps.value || [];
  const total = props.options.length - 1;

  const checked = isAll ? selected.length === total : props.isSelected;
  const indeterminate = isAll && selected.length > 0 && selected.length < total;

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
          className="h-4 w-4 rounded border-border-strong text-indigo-600 dark:text-indigo-400"
        />
        <span className="text-[13px] text-text-primary">{props.label}</span>
      </div>
    </ReactSelectComponents.Option>
  );
};

const SELECT_COMPONENTS = {
  Option: CheckboxOption,
  MultiValue: () => null,
  ValueContainer: SummaryValueContainer,
};

const selectStyles = {
  container: (base) => ({ ...base, width: "100%" }),
  control: (base, state) => ({
    ...base,
    borderRadius: 12,
    borderColor: state.isFocused
      ? "rgb(var(--color-primary))"
      : "rgb(var(--color-border))",
    boxShadow: state.isFocused ? "0 0 0 3px rgba(99,102,241,0.15)" : "none",
    padding: "4px 10px",
    minHeight: 38,
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
    boxShadow: state.isFocused
      ? "inset 0 0 0 1px rgba(var(--color-primary), 0.3)"
      : "none",
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
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  menuList: (base) => ({ ...base, padding: 8, maxHeight: 260 }),
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

const MENU_PORTAL_TARGET =
  typeof document !== "undefined" ? document.body : undefined;

// ---------------------------------------------------------------------------
// Presentational pieces
// ---------------------------------------------------------------------------
function StatCard(props) {
  // Read off `props` rather than destructuring: the repo's eslint setup does
  // not track JSX-only usage of a destructured component prop (same pattern as
  // SummaryTile in UptimeTrendCard.jsx).
  const Icon = props.Icon;
  const { label, value, tone, loading } = props;

  return (
    <div className="app-card flex items-center justify-between rounded-2xl border border-white/40 bg-surface/70 px-4 py-3 backdrop-blur-md transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <div className="min-w-0">
        <p className="mb-1 truncate text-sm text-text-secondary">{label}</p>
        {loading ? (
          <div className="h-8 w-24 animate-pulse rounded-md bg-surface-muted" />
        ) : (
          <h2 className="text-2xl font-bold text-text-primary">{value}</h2>
        )}
      </div>
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}
      >
        <Icon size={19} />
      </div>
    </div>
  );
}

function CardShell({ title, hint, children }) {
  return (
    <div className="flex h-[300px] flex-col rounded-2xl border border-white/40 bg-surface/70 p-4 shadow-[0_10px_35px_rgba(0,0,0,0.05)] backdrop-blur-md">
      <h4 className="mb-2 flex items-center justify-between text-sm font-semibold text-text-primary">
        {title}
        <span className="text-xs font-normal text-text-muted">{hint}</span>
      </h4>
      <div className="hide-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {children}
      </div>
    </div>
  );
}

function ListSkeleton({ rows = 4 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-12 animate-pulse rounded-lg bg-surface-muted"
          style={{ animationDelay: `${i * 70}ms` }}
        />
      ))}
    </>
  );
}

function EmptyState({ message }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
      <p className="text-sm font-medium text-text-secondary">No data</p>
      <p className="text-xs text-text-muted">{message}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-2 text-center">
      <AlertTriangle className="h-5 w-5 text-red-500 dark:text-red-400" />
      <p className="text-xs font-medium text-red-700 dark:text-red-400">
        {message}
      </p>
      <button onClick={onRetry} className="app-button-ghost px-3 py-1 text-xs">
        <RefreshCcw size={12} />
        Retry
      </button>
    </div>
  );
}

// Renders one of loading / error / empty / content for a list card, so every
// section on the page handles all four states the same way.
function CardBody({ status, isEmpty, emptyMessage, onRetry, errorMessage, children }) {
  if (status === "loading") return <ListSkeleton />;
  if (status === "error")
    return <ErrorState message={errorMessage} onRetry={onRetry} />;
  if (isEmpty) return <EmptyState message={emptyMessage} />;
  return children;
}

function ListRow({ title, subtitle, value, dotClass, badgeClass }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-white/30 bg-surface/60 px-2 py-2 shadow-sm backdrop-blur-sm transition hover:bg-surface/90">
      <div className="flex min-w-0 items-center gap-2">
        {dotClass ? (
          <div className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
        ) : null}
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-text-primary">
            {title}
          </span>
          <span className="truncate text-[11px] text-text-muted">{subtitle}</span>
        </div>
      </div>
      <span
        className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${badgeClass}`}
      >
        {value}
      </span>
    </div>
  );
}

function ScrumTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  return (
    <div className="rounded-2xl border border-border-color bg-surface/95 px-3 py-2 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur-md">
      <div className="text-sm font-semibold text-text-primary">{item.name}</div>
      <div className="mt-1 text-xs text-text-muted">
        Count:{" "}
        <span className="font-semibold text-text-secondary">
          {formatCount(item.value)}
        </span>
      </div>
      <div className="text-xs text-text-muted">
        Share:{" "}
        <span className="font-semibold text-text-secondary">
          {item.percentage}%
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
const EMPTY_STATS = {
  totalSites: null,
  totalFiber: null,
  totalManpower: null,
  totalScrum: null,
  siteBreakdown: [],
  fiberBreakdown: [],
  manpowerBreakdown: [],
};

function Dashboard() {
  const session = useMemo(() => getStoredSession(), []);
  const canViewDashboard = Boolean(
    session?.token && getPagePermission(session, "dashboard").view
  );
  const canViewWifi = hasPermission("site.WIFI");
  const canViewGsc = hasPermission("site.GSC");

  // Circle permission: "All Circle" users pick freely, everyone else is pinned
  // to their own circle so the filter can never suggest inaccessible data.
  const allCircleUser = isAllCircleUser(session?.circle);
  const lockedCircle = allCircleUser ? null : matchCircleLabel(session?.circle);

  const [filters, setFilters] = useState(() => ({
    circle: lockedCircle ? [{ value: lockedCircle, label: lockedCircle }] : [],
    cmp: [],
    domain: [],
  }));

  const [stats, setStats] = useState(EMPTY_STATS);
  const [roleSummary, setRoleSummary] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | success | error
  const [errorMessage, setErrorMessage] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [, setClockTick] = useState(0);

  useEffect(() => {
    if (!session?.token) window.location.href = "/";
  }, [session]);

  const filterParams = useMemo(() => {
    const toParam = (arr) => (arr?.length ? arr.map((o) => o.value).join(",") : "");
    return {
      circle: toParam(filters.circle),
      cmp: toParam(filters.cmp),
      domain: toParam(filters.domain),
    };
  }, [filters]);

  const filterKey = `${filterParams.circle}|${filterParams.cmp}|${filterParams.domain}`;

  // Guards against out-of-order responses: only the newest request may write
  // state, so rapidly toggling filters can never leave older data on screen.
  const requestSeq = useRef(0);
  // Per-filter response cache. Switching back to a combination already fetched
  // paints instantly, then revalidates in the background so nothing goes stale.
  const cacheRef = useRef(new Map());

  useEffect(() => {
    const cached = cacheRef.current.get(filterKey);
    if (cached) {
      setStats(cached.stats);
      setRoleSummary(cached.roleSummary);
      setStatus("success");
      setErrorMessage("");
    } else {
      setStatus("loading");
    }

    const seq = ++requestSeq.current;
    const controller = new AbortController();

    Promise.all([
      axios.get(buildApiUrl("/api/dashboard/stats"), {
        params: filterParams,
        signal: controller.signal,
      }),
      axios.get(buildApiUrl("/api/manpower/scrum/job-role-summary"), {
        params: filterParams,
        signal: controller.signal,
      }),
    ])
      .then(([statsRes, roleRes]) => {
        if (seq !== requestSeq.current) return;

        const payload = statsRes.data;
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
          throw new Error("Unexpected dashboard response from server.");
        }

        const nextStats = {
          totalSites: Number(payload.totalSites || 0),
          totalFiber: Number(payload.totalFiber || 0),
          totalManpower: Number(payload.totalManpower || 0),
          totalScrum: Number(payload.totalScrum || 0),
          siteBreakdown: Array.isArray(payload.siteBreakdown)
            ? payload.siteBreakdown
            : [],
          fiberBreakdown: Array.isArray(payload.fiberBreakdown)
            ? payload.fiberBreakdown
            : [],
          manpowerBreakdown: Array.isArray(payload.manpowerBreakdown)
            ? payload.manpowerBreakdown
            : [],
        };
        const nextRoles = Array.isArray(roleRes.data) ? roleRes.data : [];

        cacheRef.current.set(filterKey, {
          stats: nextStats,
          roleSummary: nextRoles,
        });
        setStats(nextStats);
        setRoleSummary(nextRoles);
        setStatus("success");
        setErrorMessage("");
        setLastUpdated(new Date());
      })
      .catch((err) => {
        if (axios.isCancel(err) || seq !== requestSeq.current) return;
        console.error("Dashboard load error:", err);
        // No cached fallback and no zero-filled placeholder: showing invented
        // numbers is worse than showing that the load failed.
        setStats(EMPTY_STATS);
        setRoleSummary([]);
        setStatus("error");
        setErrorMessage(
          err?.response?.data?.message || "Unable to load dashboard data."
        );
      });

    return () => controller.abort();
  }, [filterKey, filterParams, reloadTick]);

  const reload = useCallback(() => {
    cacheRef.current.delete(filterKey);
    setReloadTick((t) => t + 1);
  }, [filterKey]);

  // Other pages announce a scrum upload; refetch rather than trusting the
  // pushed payload, so the page and the database can never disagree.
  useEffect(() => {
    const onScrumUpdated = () => {
      cacheRef.current.clear();
      setReloadTick((t) => t + 1);
    };
    window.addEventListener("scrum-manpower-updated", onScrumUpdated);
    return () =>
      window.removeEventListener("scrum-manpower-updated", onScrumUpdated);
  }, []);

  // Keeps the "Live • 2m ago" label honest without refetching.
  useEffect(() => {
    const id = window.setInterval(() => setClockTick((t) => t + 1), 30000);
    return () => window.clearInterval(id);
  }, []);

  // ---- filter option lists ------------------------------------------------
  const circleOptions = useMemo(
    () =>
      (lockedCircle ? [lockedCircle] : ALL_CIRCLES).map((v) => ({
        value: v,
        label: v,
      })),
    [lockedCircle]
  );

  const cmpOptions = useMemo(() => {
    if (!filters.circle.length) return [];
    const list = filters.circle.flatMap((c) => CIRCLE_TO_CMP[c.value] || []);
    const unique = Array.from(new Set(list)).map((value) => ({
      value,
      label: value,
    }));
    return unique.length ? [{ value: "__all__", label: "Select All" }, ...unique] : [];
  }, [filters.circle]);

  const handleFilterChange = useCallback(
    (key, value) => {
      const next = value || [];

      if (key === "circle") {
        // CMP options are derived from the circle, so a circle change must
        // clear CMP — otherwise a CMP from a de-selected circle stays applied.
        setFilters((prev) => ({ ...prev, circle: next, cmp: [] }));
        return;
      }

      if (key === "cmp") {
        const all = cmpOptions.filter((o) => o.value !== "__all__");
        const pickedAll =
          next.some((v) => v.value === "__all__") || next.length === all.length;
        setFilters((prev) => ({ ...prev, cmp: pickedAll ? all : next }));
        return;
      }

      setFilters((prev) => ({ ...prev, [key]: next }));
    },
    [cmpOptions]
  );

  const resetFilters = useCallback(() => {
    setFilters({
      circle: lockedCircle ? [{ value: lockedCircle, label: lockedCircle }] : [],
      cmp: [],
      domain: [],
    });
  }, [lockedCircle]);

  const hasActiveFilters =
    (allCircleUser && filters.circle.length > 0) ||
    filters.cmp.length > 0 ||
    filters.domain.length > 0;

  // ---- derived views ------------------------------------------------------
  const siteBreakdownView = useMemo(
    () =>
      (stats.siteBreakdown || [])
        .filter((item) => item?.type)
        .map((item) => ({
          type: String(item.type).toUpperCase(),
          count: Number(item.count || 0),
          latestDate: item.reportDate || item.latestDate || null,
        }))
        .filter((item) => {
          if (item.type === "WIFI" && !canViewWifi) return false;
          if (item.type === "GSC" && !canViewGsc) return false;
          return true;
        }),
    [stats.siteBreakdown, canViewWifi, canViewGsc]
  );

  // The card must equal the list the user can actually see, so site types
  // hidden by permission are excluded from the total as well.
  const visibleSiteTotal = useMemo(
    () => siteBreakdownView.reduce((sum, item) => sum + item.count, 0),
    [siteBreakdownView]
  );

  const fiberBreakdownView = useMemo(() => {
    const grouped = new Map();

    (stats.fiberBreakdown || []).forEach((item) => {
      const category = item.fiberType || item.category || "Other";
      const entry = grouped.get(category) || { aerial: 0, ug: 0 };
      entry.aerial += Number(item.aerial || 0);
      entry.ug += Number(item.ug || 0);
      grouped.set(category, entry);
    });

    return Array.from(grouped, ([category, entry]) => ({
      category,
      aerial: Number(entry.aerial.toFixed(2)),
      ug: Number(entry.ug.toFixed(2)),
      total: Number((entry.aerial + entry.ug).toFixed(2)),
    }));
  }, [stats.fiberBreakdown]);

  const totalFiberCount = useMemo(
    () => fiberBreakdownView.reduce((sum, item) => sum + item.total, 0),
    [fiberBreakdownView]
  );

  // Derived from the same manpowerBreakdown rows the "Manpower Roles" card
  // renders, using the backend's own bucketing rules. This keeps the donut and
  // the role list guaranteed-consistent and removes a whole extra API round
  // trip per filter change. ScrumManpowerCard owns the presentation (colours,
  // percentages, layout) — this only supplies the four real counts.
  const scrumTotals = useMemo(() => {
    const totals = { fiber: 0, fttx: 0, utility: 0, others: 0 };

    (stats.manpowerBreakdown || []).forEach((item) => {
      totals[bucketFunction(item.function)] += Number(item.count || 0);
    });

    return totals;
  }, [stats.manpowerBreakdown]);

  if (!canViewDashboard) {
    return (
      <div className="rounded-2xl border border-border-color bg-surface p-8 text-text-secondary shadow-soft">
        You do not have permission to view the dashboard.
      </div>
    );
  }

  const loading = status === "loading";
  const failed = status === "error";

  return (
    <div className="space-y-3 text-text-primary">
      {/* ---------------------------------------------------------------- */}
      {/* Filters                                                          */}
      {/* ---------------------------------------------------------------- */}
      <div className="relative -mt-3">
        <div className="app-surface relative overflow-visible px-4 py-2">
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-border-color to-transparent" />

          <div className="relative flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="grid w-full flex-1 grid-cols-1 gap-2 sm:grid-cols-3 lg:flex">
              <div className="min-w-0">
                <Select
                  isMulti
                  placeholder="Select Circle"
                  aria-label="Filter by circle"
                  value={filters.circle}
                  options={circleOptions}
                  isDisabled={!allCircleUser}
                  onChange={(val) => handleFilterChange("circle", val)}
                  className="react-select-container"
                  classNamePrefix="rs"
                  styles={selectStyles}
                  menuPortalTarget={MENU_PORTAL_TARGET}
                  menuPosition="fixed"
                  menuPlacement="auto"
                  components={SELECT_COMPONENTS}
                  closeMenuOnSelect
                  blurInputOnSelect
                  hideSelectedOptions={false}
                />
              </div>

              <div className="min-w-0">
                <Select
                  isMulti
                  isDisabled={!filters.circle.length}
                  aria-label="Filter by CMP"
                  placeholder={
                    filters.circle.length ? "Select CMP" : "Select Circle first"
                  }
                  value={filters.cmp}
                  options={cmpOptions}
                  onChange={(val) => handleFilterChange("cmp", val)}
                  className="react-select-container"
                  classNamePrefix="rs"
                  styles={selectStyles}
                  components={SELECT_COMPONENTS}
                  menuPortalTarget={MENU_PORTAL_TARGET}
                  menuPosition="fixed"
                  menuPlacement="auto"
                  maxMenuHeight={220}
                  closeMenuOnSelect
                  blurInputOnSelect
                  hideSelectedOptions={false}
                  noOptionsMessage={() =>
                    filters.circle.length
                      ? "No CMP found for selection"
                      : "Select Circle first"
                  }
                />
              </div>

              <div className="min-w-0">
                <Select
                  isMulti
                  placeholder="Select Domain"
                  aria-label="Filter by domain"
                  value={filters.domain}
                  options={DOMAIN_OPTIONS}
                  onChange={(val) => handleFilterChange("domain", val)}
                  className="react-select-container"
                  classNamePrefix="rs"
                  styles={selectStyles}
                  components={SELECT_COMPONENTS}
                  menuPortalTarget={MENU_PORTAL_TARGET}
                  menuPosition="fixed"
                  menuPlacement="auto"
                  maxMenuHeight={220}
                  closeMenuOnSelect
                  blurInputOnSelect
                  hideSelectedOptions={false}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 lg:ml-auto">
              <button
                onClick={resetFilters}
                disabled={!hasActiveFilters}
                className="app-button-ghost gap-1 px-3 py-1 text-[12px] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCcw size={14} />
                Reset
              </button>

              <button
                onClick={reload}
                title="Refresh dashboard data"
                className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition ${
                  failed
                    ? "border-red-200 bg-red-100 text-red-700 dark:border-red-500/20 dark:bg-red-500/15 dark:text-red-400"
                    : loading
                    ? "border-yellow-200 bg-yellow-100 text-yellow-700 dark:border-yellow-500/20 dark:bg-yellow-500/15 dark:text-yellow-400"
                    : "border-green-200 bg-green-100 text-green-700 dark:border-green-500/20 dark:bg-green-500/15 dark:text-green-400"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    failed
                      ? "bg-red-500"
                      : loading
                      ? "bg-yellow-500 animate-pulse"
                      : "bg-green-500 animate-pulse"
                  }`}
                />
                {failed
                  ? "Offline"
                  : loading
                  ? "Loading…"
                  : `Live • ${formatTimeAgo(lastUpdated)}`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {failed ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {errorMessage}
          </span>
          <button onClick={reload} className="app-button-ghost px-3 py-1 text-xs">
            <RefreshCcw size={13} />
            Retry
          </button>
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Summary cards                                                    */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Active Sites"
          value={failed ? "--" : formatCount(visibleSiteTotal)}
          Icon={Globe}
          loading={loading}
          tone="bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400"
        />
        <StatCard
          label="Total Active Fiber"
          value={failed ? "--" : formatFiberValue(totalFiberCount)}
          Icon={Cable}
          loading={loading}
          tone="bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400"
        />
        <StatCard
          label="Total Active Manpower"
          value={failed ? "--" : formatCount(stats.totalManpower)}
          Icon={Users}
          loading={loading}
          tone="bg-purple-100 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400"
        />
        <StatCard
          label="Total (Scrum Manpower)"
          value={failed ? "--" : formatCount(stats.totalScrum)}
          Icon={Activity}
          loading={loading}
          tone="bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400"
        />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Breakdown lists                                                  */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <CardShell title="Site Types" hint="Latest upload">
          <CardBody
            status={status}
            isEmpty={siteBreakdownView.length === 0}
            emptyMessage="No site records for the selected filters."
            errorMessage={errorMessage}
            onRetry={reload}
          >
            {siteBreakdownView.map((item) => (
              <ListRow
                key={item.type}
                title={item.type}
                subtitle={
                  item.latestDate
                    ? `Date: ${formatDisplayDate(item.latestDate)}`
                    : "No date recorded"
                }
                value={formatCount(item.count)}
                dotClass="bg-green-500"
                badgeClass="bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400"
              />
            ))}
          </CardBody>
        </CardShell>

        <CardShell title="Fiber Inventory" hint="Km (Aerial + UG)">
          <CardBody
            status={status}
            isEmpty={fiberBreakdownView.length === 0}
            emptyMessage="No fiber inventory for the selected circle."
            errorMessage={errorMessage}
            onRetry={reload}
          >
            {fiberBreakdownView.map((item) => (
              <div
                key={item.category}
                className="rounded-xl border border-white/40 bg-surface/70 px-2 py-2 shadow-sm backdrop-blur-sm transition hover:shadow-lg"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-text-primary">
                    {item.category}
                  </span>
                  <span className="shrink-0 rounded-md bg-indigo-100 px-2 py-1 text-xs font-bold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
                    {formatFiberValue(item.total)}
                  </span>
                </div>

                <div className="space-y-1 text-xs text-text-secondary">
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                      Aerial
                    </span>
                    <span>{formatFiberValue(item.aerial)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-purple-500" />
                      UG
                    </span>
                    <span>{formatFiberValue(item.ug)}</span>
                  </div>
                </div>
              </div>
            ))}
          </CardBody>
        </CardShell>

        <CardShell title="Manpower Roles" hint="Active batch">
          <CardBody
            status={status}
            isEmpty={(stats.manpowerBreakdown || []).length === 0}
            emptyMessage="No manpower records for the selected filters."
            errorMessage={errorMessage}
            onRetry={reload}
          >
            {(stats.manpowerBreakdown || []).map((item) => (
              <ListRow
                key={item.function}
                title={item.function}
                subtitle="Function"
                value={formatCount(item.count)}
                badgeClass="bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400"
              />
            ))}
          </CardBody>
        </CardShell>

        <CardShell title="Job Roles" hint="Active batch">
          <CardBody
            status={status}
            isEmpty={roleSummary.length === 0}
            emptyMessage="No job roles for the selected filters."
            errorMessage={errorMessage}
            onRetry={reload}
          >
            {roleSummary.map((item) => (
              <ListRow
                key={item.category}
                title={item.category}
                subtitle="Job Role"
                value={formatCount(item.total)}
                dotClass="bg-blue-500"
                badgeClass="bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400"
              />
            ))}
          </CardBody>
        </CardShell>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Uptime trend + scrum donut                                       */}
      {/* ---------------------------------------------------------------- */}
      <div className="mt-6 grid grid-cols-1 items-stretch gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <UptimeTrendCard circle={filterParams.circle} cmp={filterParams.cmp} />
        </div>

        <ScrumManpowerCard
          totals={scrumTotals}
          status={status}
          errorMessage={errorMessage}
          onRetry={reload}
          lastUpdated={lastUpdated}
        />
      </div>
    </div>
  );
}

export default Dashboard;
