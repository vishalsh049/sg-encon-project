import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  BarChart2,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  Minus,
  RefreshCw,
  Table2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";

import { authFetch, buildApiUrl } from "../lib/api";
import { useDashboardPreferences } from "../hooks/useDashboardPreferences";
import { useFullscreen } from "../hooks/useFullscreen";
import { getEntityColor, orderEntities } from "../utils/chartMath";
import { getHealthStatus } from "../utils/kpiHealth";
import {
  exportChartAsCsv,
  exportChartAsPng,
  exportDashboardAsCsv,
  exportDashboardAsExcel,
  printDashboardReport,
  svgToPngDataUrl,
} from "../utils/chartExport";

import { CHART_TYPES } from "../utils/chartTypes";
import { computeSummaryTiles } from "../utils/kpiSummary";

import ChartRenderer from "../components/dashboard/ChartRenderer";
import ChartToolbar from "../components/dashboard/ChartToolbar";
import SummaryRow from "../components/dashboard/SummaryRow";

// ─── Constants ───────────────────────────────────────────────────────────────

const colorStyles = {
  blue:    { bg: "bg-blue-50 dark:bg-blue-500/10",       text: "text-blue-600 dark:text-blue-400",       border: "border-blue-100 dark:border-blue-500/20",       accent: "from-blue-500 to-indigo-500" },
  emerald: { bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-100 dark:border-emerald-500/20", accent: "from-emerald-500 to-teal-500" },
  violet:  { bg: "bg-violet-50 dark:bg-violet-500/10",   text: "text-violet-600 dark:text-violet-400",   border: "border-violet-100 dark:border-violet-500/20",   accent: "from-violet-500 to-purple-500" },
  orange:  { bg: "bg-orange-50 dark:bg-orange-500/10",   text: "text-orange-600 dark:text-orange-400",   border: "border-orange-100 dark:border-orange-500/20",   accent: "from-orange-500 to-amber-500" },
  cyan:    { bg: "bg-cyan-50 dark:bg-cyan-500/10",       text: "text-cyan-600 dark:text-cyan-400",       border: "border-cyan-100 dark:border-cyan-500/20",       accent: "from-cyan-500 to-sky-500" },
  rose:    { bg: "bg-rose-50 dark:bg-rose-500/10",       text: "text-rose-600 dark:text-rose-400",       border: "border-rose-100 dark:border-rose-500/20",       accent: "from-rose-500 to-pink-500" },
};

// Page-level date range for the KPI cards. Separate from the analytics popup's
// own 9-option `period` filter — the popup drills into one KPI over arbitrary
// historical windows, the page shows a recent snapshot of all six.
const RANGE_OPTIONS = [
  { key: "today",      label: "Today" },
  { key: "yesterday",  label: "Yesterday" },
  { key: "this_week",  label: "This Week" },
  { key: "this_month", label: "This Month" },
  { key: "last7",      label: "Last 7 Days" },
  { key: "last15",     label: "Last 15 Days" },
  { key: "last30",     label: "Last 30 Days" },
  { key: "custom",     label: "Custom Range" },
];

const PERIOD_OPTIONS = [
  { key: "last7",         label: "Last 7 Days" },
  { key: "last30",        label: "Last 30 Days" },
  { key: "current_month", label: "This Month" },
  { key: "prev_month",    label: "Prev Month" },
  { key: "custom_month",  label: "Custom Month" },
  { key: "yearly",        label: "Yearly" },
  { key: "month_range",   label: "Month to Month" },
  { key: "date_range",    label: "Date to Date" },
  { key: "quarterly",     label: "Quarterly" },
];

const MONTH_OPTIONS = [
  { v: "1",  l: "January" },   { v: "2",  l: "February" },
  { v: "3",  l: "March" },     { v: "4",  l: "April" },
  { v: "5",  l: "May" },       { v: "6",  l: "June" },
  { v: "7",  l: "July" },      { v: "8",  l: "August" },
  { v: "9",  l: "September" }, { v: "10", l: "October" },
  { v: "11", l: "November" },  { v: "12", l: "December" },
];

// Ends at the current year so the picker can't offer a year with no data.
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 4 + i);

const QUARTER_OPTIONS = [
  { key: "1", label: "Q1", months: "Jan–Mar" },
  { key: "2", label: "Q2", months: "Apr–Jun" },
  { key: "3", label: "Q3", months: "Jul–Sep" },
  { key: "4", label: "Q4", months: "Oct–Dec" },
];

const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

// `multiYear` appends the year to month labels. Without it, a Jan-2025→Mar-2026
// range collapses both Januaries onto one X-axis key and silently averages two
// different years into a single point.
const formatChartDate = (dateStr, period, multiYear = false) => {
  if (!dateStr) return "";
  if (["yearly", "month_range", "quarterly"].includes(period)) {
    const [y, m] = dateStr.split("-");
    const label = MONTH_ABBR[Number(m) - 1] || dateStr;
    return multiYear ? `${label} ${String(y).slice(2)}` : label;
  }
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
};

// Table View renders no chart but does render Lucide sort-arrow icons, which
// are also <svg>. A bare querySelector("svg") would rasterise a 12px arrow and
// embed it in the report as if it were the chart — scope to recharts' surface.
const findChartSvg = (root) => root?.querySelector(".recharts-wrapper svg") || null;

// ─── Loading skeleton ────────────────────────────────────────────────────────
// Shown only on the very first load so the page paints its layout instantly.
// Later refreshes keep the previous data on screen (see `refreshing`).

function DashboardSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border-color bg-surface p-3 shadow-sm">
            <div className="h-3 w-20 rounded bg-surface-muted" />
            <div className="mt-2 h-5 w-16 rounded bg-surface-muted" />
            <div className="mt-1.5 h-3 w-12 rounded bg-surface-muted" />
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-[18px] border border-border-color bg-surface p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-surface-muted" />
              <div>
                <div className="h-4 w-24 rounded bg-surface-muted" />
                <div className="mt-1.5 h-3 w-14 rounded bg-surface-muted" />
              </div>
            </div>
            <div className="mt-3 h-6 w-20 rounded bg-surface-muted" />
            <div className="mt-3 h-44 rounded-xl bg-surface-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Shared UI bits ──────────────────────────────────────────────────────────

function EmptyState({ title, message, className = "" }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-16 ${className}`}>
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-surface-muted">
        <BarChart2 className="h-7 w-7 text-text-muted" />
      </div>
      <div className="max-w-sm text-center">
        <p className="text-sm font-semibold text-text-secondary">{title}</p>
        {message && <p className="mt-1 text-xs text-text-muted">{message}</p>}
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
      <AlertCircle className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1 min-w-0">
        <strong>Could not load dashboard data.</strong> {message}
      </span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-lg border border-red-300 bg-white/70 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-white dark:border-red-500/30 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-500/10"
        >
          Retry
        </button>
      )}
    </div>
  );
}

// Small dropdown wrapper used by the range / chart-type / export controls.
function Dropdown({ open, onToggle, label, icon: Icon, title, children, align = "right", disabled = false }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onToggle(false); };
    const onKey  = (e) => { if (e.key === "Escape") onToggle(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onToggle]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => onToggle(!open)}
        disabled={disabled}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 items-center gap-2 rounded-xl border border-border-color bg-surface px-3 text-sm font-medium text-text-secondary shadow-sm transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        {Icon && <Icon className="h-4 w-4 flex-shrink-0" />}
        <span className="hidden sm:inline">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-text-muted" />
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute ${align === "right" ? "right-0" : "left-0"} top-11 z-50 min-w-[210px] rounded-2xl border border-border-color bg-surface p-1.5 shadow-[0_10px_40px_rgba(15,23,42,0.18)]`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function DropdownItem({ active, onClick, children, hint, icon: Icon, disabled }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className={`flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400" : "text-text-secondary hover:bg-surface-muted"
      }`}
    >
      {Icon && <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />}
      <span className="min-w-0">
        <span className="block">{children}</span>
        {hint && <span className="mt-0.5 block text-[11px] font-normal leading-snug text-text-muted">{hint}</span>}
      </span>
    </button>
  );
}

// ─── Analytics Popup (drill-down) ────────────────────────────────────────────

const POPUP_CHART_VIEWS = [
  { key: "line",    label: "Line Trend" },
  { key: "bar",     label: "Bar Comparison" },
  { key: "stacked", label: "Stacked Bar" },
  { key: "table",   label: "Data Table" },
];

function UptimeAnalyticsPopup({ kpiName, kpiColor, chartType, onClose, initialCircle, initialCmp }) {
  const style = colorStyles[kpiColor] || colorStyles.blue;

  // Seeded from the dashboard's current chart type, but switchable in here —
  // drilling into one KPI shouldn't lock the user to whatever view the main
  // page happened to be on when they opened it.
  const [mainChartType, setMainChartType] = useState(
    POPUP_CHART_VIEWS.some(v => v.key === chartType) ? chartType : "line"
  );
  const [chartMenuOpen, setChartMenuOpen] = useState(false);
  const relatedChartViews = POPUP_CHART_VIEWS.filter(v => v.key !== mainChartType);
  const mainChartLabel = POPUP_CHART_VIEWS.find(v => v.key === mainChartType)?.label || "Line Trend";

  const today = new Date().toISOString().split("T")[0];
  const _now = new Date();
  const [filters, setFilters] = useState({
    circle:        initialCircle || "",
    cmp:           initialCmp    || "",
    period:        "last7",
    month:         String(_now.getMonth() + 1),
    year:          String(_now.getFullYear()),
    fromMonth:     String(_now.getMonth() + 1),
    fromMonthYear: String(_now.getFullYear()),
    toMonth:       String(_now.getMonth() + 1),
    toMonthYear:   String(_now.getFullYear()),
    fromDate:      today,
    toDate:        today,
    quarter:       String(Math.ceil((_now.getMonth() + 1) / 3)),
    quarterYear:   String(_now.getFullYear()),
  });

  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [exporting,   setExporting]   = useState(false);

  const chartRef = useRef(null);
  const shellRef = useRef(null);
  const [fullscreen, toggleFullscreen] = useFullscreen(shellRef);

  // Per-popup response cache keyed by query string — switching a filter back
  // to a combination already fetched reuses the response instead of hitting
  // the API again. Cleared by the explicit Refresh button, and discarded
  // entirely when the popup unmounts, so data can never go stale silently.
  const cacheRef = useRef(new Map());
  // Mirrors bypassCacheRef on the main dashboard: set right before a manual
  // refresh so that one fetch also skips the server-side cache, not just
  // this popup's own local one.
  const bypassServerCacheRef = useRef(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Esc closes the popup — but while in native fullscreen the browser consumes
  // Esc to exit fullscreen first, so only close when we're not fullscreen.
  useEffect(() => {
    const fn = (e) => { if (e.key === "Escape" && !document.fullscreenElement) onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  // AbortController cancels the previous in-flight request so rapid filter
  // clicks can't stack duplicates or apply a stale response out of order.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          kpi:           kpiName,
          circle:        filters.circle || "",
          cmp:           filters.cmp    || "",
          period:        filters.period,
          month:         filters.month,
          year:          filters.year,
          fromMonth:     filters.fromMonth,
          fromMonthYear: filters.fromMonthYear,
          toMonth:       filters.toMonth,
          toMonthYear:   filters.toMonthYear,
          fromDate:      filters.fromDate,
          toDate:        filters.toDate,
          quarter:       filters.quarter,
          quarterYear:   filters.quarterYear,
        });
        if (bypassServerCacheRef.current) {
          params.set("noCache", "1");
          bypassServerCacheRef.current = false;
        }

        const cacheKey = params.toString();
        const cached = cacheRef.current.get(cacheKey);
        if (cached) {
          if (!cancelled) { setData(cached); setLoading(false); }
          return;
        }

        const res  = await authFetch(buildApiUrl(`/api/tower-uptime/analytics?${params}`), { signal: controller.signal });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`);

        cacheRef.current.set(cacheKey, json);
        if (!cancelled) setData(json);
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error("Analytics fetch error:", err);
        if (!cancelled) {
          setError(err.message || "Request failed");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; controller.abort(); };
  }, [kpiName, filters, refreshTick]);

  // Regroup flat rows -> { date: label, <entity1>: value, ... } so it matches
  // the X-axis=date / series=entity orientation every chart view expects.
  const { chartData: transformedData, chartEntities } = useMemo(() => {
    if (!data?.chartData?.length) return { chartData: [], chartEntities: [] };

    // A month-grouped range crossing a year boundary needs the year in the
    // label, otherwise two different Januaries collide into one point.
    const years = new Set(data.chartData.map(r => String(r.date).slice(0, 4)));
    const multiYear = years.size > 1;

    const dateLabels = new Map();
    const entitySet  = new Set();

    data.chartData.forEach(row => {
      if (!dateLabels.has(row.date)) dateLabels.set(row.date, formatChartDate(row.date, filters.period, multiYear));
      entitySet.add(row.entity || "Overall");
    });

    const groupBy = data.groupBy || (filters.circle ? "cmp" : "circle");
    const orderedEntities = groupBy === "circle"
      ? orderEntities(Array.from(entitySet))
      : Array.from(entitySet).sort();

    const rowsByRawDate = {};
    data.chartData.forEach(row => {
      if (!rowsByRawDate[row.date]) rowsByRawDate[row.date] = {};
      rowsByRawDate[row.date][row.entity || "Overall"] = Number(row.uptime || 0);
    });

    const sortedRawDates = Array.from(dateLabels.keys()).sort();
    const chartData = sortedRawDates.map(rawDate => {
      const obj = { date: dateLabels.get(rawDate) };
      orderedEntities.forEach(e => {
        const v = rowsByRawDate[rawDate]?.[e];
        obj[e] = v > 0 ? v : null;
      });
      return obj;
    });

    return { chartData, chartEntities: orderedEntities };
  }, [data, filters.period, filters.circle]);

  const handleFilterChange = useCallback((key, value) => {
    setFilters(prev => {
      if (prev[key] === value) return prev; // no-op click shouldn't refetch
      const next = { ...prev, [key]: value };
      if (key === "circle") next.cmp = ""; // CMP list is circle-scoped
      return next;
    });
  }, []);

  const handleRefresh = useCallback(() => {
    cacheRef.current.clear();
    bypassServerCacheRef.current = true;
    setRefreshTick(t => t + 1);
  }, []);

  const handleExportPng = useCallback(() => {
    const svg = findChartSvg(chartRef.current);
    if (svg) exportChartAsPng(svg, `${kpiName}_uptime.png`);
  }, [kpiName]);

  const handleExportCsv = useCallback(() => {
    exportChartAsCsv(transformedData, chartEntities, `${kpiName}_uptime.csv`);
  }, [transformedData, chartEntities, kpiName]);

  const periodLabel = PERIOD_OPTIONS.find(p => p.key === filters.period)?.label || filters.period;

  const summary = useMemo(() => data?.summary || {}, [data]);
  const trend   = summary.trend || "stable";
  const TrendIcon  = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendText  = trend === "up" ? "Improving" : trend === "down" ? "Declining" : "Stable";
  const trendColor = trend === "up" ? "text-emerald-600 dark:text-emerald-400" : trend === "down" ? "text-rose-600 dark:text-rose-400" : "text-text-muted";

  const handleExportPdf = useCallback(async () => {
    if (!transformedData.length) return;
    setExporting(true);
    try {
      const svg = findChartSvg(chartRef.current);
      const chartImage = svg ? await svgToPngDataUrl(svg) : null;

      const ok = printDashboardReport({
        title:    `${kpiName} — Uptime Analytics`,
        subtitle: "Detailed uptime analysis & historical performance",
        meta: [
          { label: "Period",  value: periodLabel },
          { label: "Circle",  value: filters.circle || "All Circles" },
          { label: "CMP",     value: filters.cmp    || "All CMP" },
          { label: "Records", value: String(summary.total ?? "—") },
        ],
        tiles: [
          { label: "Average",     value: `${Number(summary.avg ?? 0).toFixed(2)}%` },
          { label: "Highest",     value: `${Number(summary.highest ?? 0).toFixed(2)}%` },
          { label: "Lowest",      value: `${Number(summary.lowest ?? 0).toFixed(2)}%` },
          { label: "Records",     value: String(summary.total ?? 0) },
          { label: "Trend",       value: trendText },
          { label: "Data Points", value: String(transformedData.length) },
        ],
        cards: [{
          name: kpiName,
          uptime: `${Number(summary.avg ?? 0).toFixed(2)}%`,
          entities: chartEntities,
          chartData: transformedData,
          groupBy: data?.groupBy || "circle",
          chartImage,
          colorFor: getEntityColor,
        }],
      });
      if (!ok) window.alert("Please allow pop-ups for this site to generate the PDF report.");
    } finally {
      setExporting(false);
    }
  }, [transformedData, chartEntities, kpiName, periodLabel, filters.circle, filters.cmp, summary, trendText, data?.groupBy]);

  const showMonthPicker = filters.period === "custom_month";
  const showYearPicker  = filters.period === "yearly" || filters.period === "custom_month";
  const hasData = transformedData.length > 0;

  const summaryTiles = [
    { label: "Average Uptime", value: `${Number(summary.avg ?? 0).toFixed(2)}%`,     tip: "Mean uptime across every record in the selected period." },
    { label: "Highest",        value: `${Number(summary.highest ?? 0).toFixed(2)}%`, tip: "Best single reading in the selected period." },
    { label: "Lowest",         value: `${Number(summary.lowest ?? 0).toFixed(2)}%`,  tip: "Worst single reading — the outage to investigate." },
    { label: "Records",        value: Number(summary.total ?? 0).toLocaleString(),   tip: "Number of source rows behind these figures." },
  ];

  const selectClass = "h-8 rounded-xl border border-border-color bg-surface px-2.5 text-xs text-text-secondary shadow-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100 dark:focus:border-blue-500/30";
  const toolbarBtn  = "flex items-center gap-1.5 rounded-xl border border-border-color bg-surface px-2.5 py-1.5 text-xs font-medium text-text-secondary shadow-sm transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-5"
      style={{ backgroundColor: "rgba(15,23,42,0.50)", backdropFilter: "blur(8px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`${kpiName} uptime analytics`}
    >
      <div
        ref={shellRef}
        onClick={e => e.stopPropagation()}
        className={`relative flex flex-col overflow-hidden border border-border-color/80 bg-surface shadow-[0_40px_100px_rgba(15,23,42,0.22)] animate-modal-enter ${
          fullscreen ? "h-full max-h-none w-full max-w-none rounded-none" : "max-h-[95vh] w-full max-w-6xl rounded-3xl"
        }`}
      >
        {/* ── Header ── */}
        <div className="flex flex-shrink-0 flex-col gap-3 border-b border-border-color bg-gradient-to-r from-surface-muted/70 to-surface px-4 py-4 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${style.accent} shadow-sm`}>
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold leading-snug tracking-tight text-text-primary sm:text-lg">
                {kpiName} Uptime Analytics
              </h2>
              <p className="mt-0.5 text-xs text-text-muted">
                {periodLabel} · {filters.circle || "All Circles"} · {filters.cmp || "All CMP"}
              </p>
            </div>
          </div>

          <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
            <select
              value={filters.circle}
              onChange={e => handleFilterChange("circle", e.target.value)}
              title="Filter by circle"
              className={selectClass}
            >
              <option value="">All Circles</option>
              {(data?.circles || []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select
              value={filters.cmp}
              onChange={e => handleFilterChange("cmp", e.target.value)}
              title="Filter by CMP"
              className={selectClass}
            >
              <option value="">All CMP</option>
              {(data?.cmps || []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <button
              onClick={onClose}
              title="Close (Esc)"
              aria-label="Close analytics"
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-border-color bg-surface text-text-muted shadow-sm transition hover:bg-surface-muted hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Period filter bar ── */}
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 overflow-x-auto border-b border-border-color bg-surface-muted/60 px-4 py-3 sm:px-6">
          <span className="mr-1 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.20em] text-text-muted">
            Period
          </span>

          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => handleFilterChange("period", opt.key)}
              aria-pressed={filters.period === opt.key}
              className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                filters.period === opt.key
                  ? `${style.bg} ${style.text} font-semibold shadow-sm ring-1 ring-current/40`
                  : "border border-border-color bg-surface text-text-secondary hover:border-border-strong hover:bg-surface-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}

          {showMonthPicker && (
            <select value={filters.month} onChange={e => handleFilterChange("month", e.target.value)} className={selectClass}>
              {MONTH_OPTIONS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
          )}

          {showYearPicker && (
            <select value={filters.year} onChange={e => handleFilterChange("year", e.target.value)} className={selectClass}>
              {YEAR_OPTIONS.map(y => <option key={y} value={String(y)}>{y}</option>)}
            </select>
          )}

          {filters.period === "month_range" && (
            <>
              <span className="whitespace-nowrap text-[10px] font-medium text-text-muted">From</span>
              <select value={filters.fromMonth} onChange={e => handleFilterChange("fromMonth", e.target.value)} className={selectClass}>
                {MONTH_OPTIONS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
              <select value={filters.fromMonthYear} onChange={e => handleFilterChange("fromMonthYear", e.target.value)} className={selectClass}>
                {YEAR_OPTIONS.map(y => <option key={y} value={String(y)}>{y}</option>)}
              </select>
              <span className="whitespace-nowrap text-[10px] font-medium text-text-muted">To</span>
              <select value={filters.toMonth} onChange={e => handleFilterChange("toMonth", e.target.value)} className={selectClass}>
                {MONTH_OPTIONS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
              <select value={filters.toMonthYear} onChange={e => handleFilterChange("toMonthYear", e.target.value)} className={selectClass}>
                {YEAR_OPTIONS.map(y => <option key={y} value={String(y)}>{y}</option>)}
              </select>
            </>
          )}

          {filters.period === "date_range" && (
            <>
              <span className="whitespace-nowrap text-[10px] font-medium text-text-muted">From</span>
              <input
                type="date"
                value={filters.fromDate}
                max={filters.toDate}
                onChange={e => handleFilterChange("fromDate", e.target.value)}
                className={selectClass}
              />
              <span className="whitespace-nowrap text-[10px] font-medium text-text-muted">To</span>
              <input
                type="date"
                value={filters.toDate}
                min={filters.fromDate}
                onChange={e => handleFilterChange("toDate", e.target.value)}
                className={selectClass}
              />
            </>
          )}

          {filters.period === "quarterly" && (
            <>
              <select value={filters.quarterYear} onChange={e => handleFilterChange("quarterYear", e.target.value)} className={selectClass}>
                {YEAR_OPTIONS.map(y => <option key={y} value={String(y)}>{y}</option>)}
              </select>
              {QUARTER_OPTIONS.map(q => (
                <button
                  key={q.key}
                  onClick={() => handleFilterChange("quarter", q.key)}
                  title={q.months}
                  aria-pressed={filters.quarter === q.key}
                  className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                    filters.quarter === q.key
                      ? `${style.bg} ${style.text} font-semibold shadow-sm ring-1 ring-current/40`
                      : "border border-border-color bg-surface text-text-secondary hover:border-border-strong hover:bg-surface-muted"
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </>
          )}
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">

          {error && <ErrorState message={error} onRetry={handleRefresh} />}

          {/* Summary tiles — straight from the backend's aggregate query */}
          {!loading && !error && hasData && (
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
              {summaryTiles.map(t => (
                <div key={t.label} title={t.tip} className="rounded-xl border border-border-color bg-surface p-3 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted">{t.label}</p>
                  <p className="mt-0.5 text-base font-semibold text-text-primary">{t.value}</p>
                </div>
              ))}
              <div title="First half of the period compared against the second half." className="rounded-xl border border-border-color bg-surface p-3 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted">Trend</p>
                <p className={`mt-0.5 flex items-center gap-1 text-base font-semibold ${trendColor}`}>
                  <TrendIcon className="h-4 w-4" />{trendText}
                </p>
              </div>
            </div>
          )}

          {/* Main chart */}
          <div className="overflow-hidden rounded-2xl border border-border-color bg-surface shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-color bg-surface-muted/40 px-4 py-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-2">
                <BarChart2 className={`h-4 w-4 flex-shrink-0 ${style.text}`} />
                <span className="truncate text-sm font-semibold text-text-primary">{kpiName} Uptime Trend</span>
                {!loading && hasData && (
                  <span className="whitespace-nowrap rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-text-muted">
                    {transformedData.length} points
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Dropdown
                  open={chartMenuOpen}
                  onToggle={setChartMenuOpen}
                  label={mainChartLabel}
                  icon={BarChart2}
                  title="Change how this chart is visualised"
                >
                  {POPUP_CHART_VIEWS.map(opt => (
                    <DropdownItem
                      key={opt.key}
                      active={mainChartType === opt.key}
                      onClick={() => { setMainChartType(opt.key); setChartMenuOpen(false); }}
                    >
                      {opt.label}
                    </DropdownItem>
                  ))}
                </Dropdown>
                <button
                  onClick={handleExportPng}
                  disabled={loading || !hasData || mainChartType === "table"}
                  title={mainChartType === "table" ? "Table view has no chart to export — use CSV or PDF" : "Download this chart as a PNG image"}
                  className={toolbarBtn}
                >
                  <ImageIcon className="h-3 w-3" /> PNG
                </button>
                <button onClick={handleExportCsv} disabled={loading || !hasData} title="Download the underlying data as CSV" className={toolbarBtn}>
                  <FileSpreadsheet className="h-3 w-3" /> CSV
                </button>
                <button onClick={handleExportPdf} disabled={loading || !hasData || exporting} title="Open a print-ready report (choose “Save as PDF”)" className={toolbarBtn}>
                  <FileText className="h-3 w-3" /> {exporting ? "Preparing…" : "PDF"}
                </button>
                <button onClick={handleRefresh} disabled={loading} title="Discard cached responses and refetch" className={toolbarBtn}>
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
                </button>
                <button onClick={toggleFullscreen} title={fullscreen ? "Exit fullscreen" : "Expand to fullscreen"} className={toolbarBtn}>
                  {fullscreen ? <><Minimize2 className="h-3 w-3" /> Exit</> : <><Maximize2 className="h-3 w-3" /> Fullscreen</>}
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-5">
              {loading ? (
                <div className="flex h-72 items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className={`h-9 w-9 animate-spin rounded-full border-[3px] border-border-color border-t-current ${style.text}`} />
                    <p className="animate-pulse text-sm text-text-muted">Loading analytics data…</p>
                  </div>
                </div>
              ) : !hasData ? (
                <EmptyState
                  className="h-72 py-0"
                  title="No Data Available"
                  message="No uptime records found for the selected filters and period. Try widening the period or clearing the circle/CMP filter."
                />
              ) : (
                <div ref={chartRef}>
                  <ChartRenderer
                    chartData={transformedData}
                    entities={chartEntities}
                    chartType={mainChartType}
                    variant="full"
                    verticalLabels
                  />
                </div>
              )}
            </div>
          </div>

          {/* Alternate views of the same dataset */}
          {!loading && hasData && (
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <BarChart2 className={`h-4 w-4 ${style.text}`} />
                <h3 className="text-sm font-semibold text-text-primary">Alternate Views</h3>
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-text-muted">
                  Same data, {relatedChartViews.length} more views
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {relatedChartViews.map(view => (
                  <div key={view.key} className="min-w-0 overflow-hidden rounded-2xl border border-border-color bg-surface shadow-sm">
                    <div className="border-b border-border-color bg-surface-muted/40 px-4 py-2.5">
                      <span className="text-xs font-semibold text-text-primary">{kpiName} — {view.label}</span>
                    </div>
                    <div className="p-4">
                      <ChartRenderer
                        chartData={transformedData}
                        entities={chartEntities}
                        chartType={view.key}
                        variant="compact"
                        verticalLabels
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
// Memoized so switching the global chart type / date range only re-renders
// cards whose data actually changed.

const KpiCard = React.memo(function KpiCard({ card, chartType, collapsed, onToggleCollapse, onOpenAnalytics, onRefresh, registerChartRef }) {
  const style = colorStyles[card.color] || colorStyles.blue;
  const orderedEntities = useMemo(() => orderEntities(card.entities || []), [card.entities]);
  const health = useMemo(() => getHealthStatus(parseFloat(card.uptime)), [card.uptime]);

  // The PDF export rasterises each card's live SVG, so the report shows the
  // exact chart on screen rather than a re-rendered approximation.
  const setRef = useCallback((el) => registerChartRef(card.name, el), [registerChartRef, card.name]);

  const groupLabel = card.groupBy === "cmp" ? "by CMP" : "by Circle";

  return (
    <div className={`relative rounded-[18px] border ${style.border} bg-surface p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${style.bg}`}>
            <Activity className={`h-4 w-4 ${style.text}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="truncate text-sm font-semibold text-text-primary">{card.name}</h2>
              <span title={`${health.label} — ${card.uptime} average uptime`}>{health.emoji}</span>
            </div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-text-muted">Uptime {groupLabel}</p>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          <p
            className="mr-1 text-base font-semibold text-text-primary"
            title="Average uptime across every plotted day and circle/CMP"
          >
            {card.uptime}
          </p>
          <ChartToolbar onFullscreen={() => onOpenAnalytics(card)} onRefresh={onRefresh} />
          <button
            onClick={() => onToggleCollapse(card.name)}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand card" : "Collapse card"}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-text-muted transition hover:bg-surface-muted hover:text-text-secondary"
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="mt-3" ref={setRef}>
          <ChartRenderer
            chartData={card.chartData || []}
            entities={orderedEntities}
            chartType={chartType}
            variant="compact"
          />
        </div>
      )}
    </div>
  );
});

// ─── Main Dashboard ───────────────────────────────────────────────────────────

function KpiDashboard() {
  const [prefs, updatePrefs] = useDashboardPreferences();
  const { chartType, selectedCircle, selectedCmp, dateRange, customFrom, customTo, collapsedCards } = prefs;

  const [towerCards, setTowerCards] = useState([]);
  const [circleList, setCircleList] = useState([]);
  const [cmpList, setCmpList]       = useState([]);
  const [loading, setLoading]       = useState(true);   // first paint only
  const [refreshing, setRefreshing] = useState(false);  // subsequent fetches
  const [error, setError]           = useState(null);
  const [analyticsPopup, setAnalyticsPopup] = useState(null);
  const [exporting, setExporting]   = useState(false);

  const [openMenu, setOpenMenu] = useState(null); // "range" | "chart" | "export"
  const toggleMenu = useCallback((name) => (open) => setOpenMenu(open ? name : null), []);

  const [refreshTick, setRefreshTick] = useState(0);
  // Set right before a manual refresh and consumed by the very next fetch, so
  // only that one request bypasses the server cache — not every later fetch
  // that happens to share the same refreshTick-driven effect run.
  const bypassCacheRef = useRef(false);
  const refreshTower = useCallback(() => {
    bypassCacheRef.current = true;
    setRefreshTick(t => t + 1);
  }, []);

  // In native fullscreen this element is lifted out of the app shell, so it
  // supplies its own background and padding (see className below).
  const shellRef = useRef(null);
  const [isFullscreen, toggleFullscreen] = useFullscreen(shellRef);

  // name -> DOM node wrapping that card's chart, for SVG capture during export.
  const chartRefs = useRef(new Map());
  const registerChartRef = useCallback((name, el) => {
    if (el) chartRefs.current.set(name, el);
    else chartRefs.current.delete(name);
  }, []);

  const toggleCardCollapsed = useCallback((kpiName) => {
    updatePrefs(prev => {
      const set = new Set(prev.collapsedCards);
      if (set.has(kpiName)) set.delete(kpiName);
      else set.add(kpiName);
      return { collapsedCards: Array.from(set) };
    });
  }, [updatePrefs]);

  // A half-filled custom range would silently fall through to the last-7-days
  // default on the backend, showing data that doesn't match the visible filter.
  const customRangeIncomplete = dateRange === "custom" && (!customFrom || !customTo);

  // Fetch tower cards. The AbortController cancels the in-flight request when
  // filters change again before it resolves, so rapid filter changes can't
  // pile up duplicate requests or apply stale responses out of order.
  useEffect(() => {
    if (customRangeIncomplete) return; // nothing to request until both dates are set

    const controller = new AbortController();
    let cancelled = false;

    const fetchTower = async () => {
      // Keep the existing cards on screen while refetching — replacing them
      // with a skeleton on every filter change makes the page flash.
      setRefreshing(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          circle: selectedCircle,
          cmp:    selectedCmp,
          range:  dateRange,
        });
        if (dateRange === "custom") {
          params.set("from", customFrom);
          params.set("to",   customTo);
        }
        if (bypassCacheRef.current) {
          params.set("noCache", "1");
          bypassCacheRef.current = false;
        }

        const res = await authFetch(buildApiUrl(`/api/tower-uptime?${params}`), { signal: controller.signal });
        if (!res.ok) throw new Error(`Server responded with HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;

        setTowerCards(Array.isArray(data) ? data : []);
      } catch (err) {
        if (err.name === "AbortError") return; // superseded by a newer request
        console.error("Tower uptime fetch error:", err);
        if (!cancelled) setError(err.message || "Request failed");
      } finally {
        if (!cancelled) { setLoading(false); setRefreshing(false); }
      }
    };

    fetchTower();
    return () => { cancelled = true; controller.abort(); };
  }, [selectedCircle, selectedCmp, dateRange, customFrom, customTo, refreshTick, customRangeIncomplete]);

  // Circle list comes from its own endpoint rather than being derived from the
  // cards: selecting a circle flips every card to CMP-grouping, so a derived
  // list went empty exactly when a circle was selected — leaving the user
  // unable to see or change their own selection after a reload.
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res  = await authFetch(buildApiUrl("/api/tower-uptime/circles"), { signal: controller.signal });
        const json = await res.json();
        setCircleList(json.circles || []);
      } catch (err) {
        if (err.name !== "AbortError") console.error("Circle fetch error:", err);
      }
    })();
    return () => controller.abort();
  }, [refreshTick]);

  // CMP options are scoped to the selected circle.
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const params = new URLSearchParams({ circle: selectedCircle });
        const res    = await authFetch(buildApiUrl(`/api/tower-uptime/cmps?${params}`), { signal: controller.signal });
        const json   = await res.json();
        setCmpList(json.cmps || []);
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error("CMP fetch error:", err);
        setCmpList([]);
      }
    })();
    return () => controller.abort();
  }, [selectedCircle, refreshTick]);

  const openAnalytics = useCallback((card) => {
    setAnalyticsPopup({ name: card.name, color: card.color });
  }, []);

  const activeRangeLabel = RANGE_OPTIONS.find(r => r.key === dateRange)?.label || "Last 7 Days";
  const activeChartLabel = CHART_TYPES.find(c => c.key === chartType)?.label || "Line Chart";

  const filterSummary = useMemo(() => {
    const range = dateRange === "custom" && customFrom && customTo
      ? `${customFrom} → ${customTo}`
      : activeRangeLabel;
    return `${range} · ${selectedCircle || "All Circles"} · ${selectedCmp || "All CMP"}`;
  }, [dateRange, customFrom, customTo, activeRangeLabel, selectedCircle, selectedCmp]);

  const hasCards = towerCards.length > 0;

  // ── Exports ──
  const exportMeta = useMemo(() => ({
    title:    "KPI Dashboard — Tower Uptime Report",
    subtitle: filterSummary,
  }), [filterSummary]);

  const handleExportExcel = useCallback(() => {
    setOpenMenu(null);
    exportDashboardAsExcel(towerCards, exportMeta);
  }, [towerCards, exportMeta]);

  const handleExportCsv = useCallback(() => {
    setOpenMenu(null);
    exportDashboardAsCsv(towerCards, exportMeta);
  }, [towerCards, exportMeta]);

  const handleExportPdf = useCallback(async () => {
    setOpenMenu(null);
    if (!hasCards) return;
    setExporting(true);
    try {
      // Rasterise every visible card chart in parallel; a collapsed card has no
      // mounted SVG, so it exports as a table-only section.
      const cards = await Promise.all(towerCards.map(async (card) => {
        const svg = findChartSvg(chartRefs.current.get(card.name));
        return {
          ...card,
          entities: orderEntities(card.entities || []),
          chartImage: svg ? await svgToPngDataUrl(svg) : null,
          colorFor: getEntityColor,
        };
      }));

      const ok = printDashboardReport({
        ...exportMeta,
        meta: [
          { label: "Date Range", value: dateRange === "custom" && customFrom && customTo ? `${customFrom} → ${customTo}` : activeRangeLabel },
          { label: "Circle",     value: selectedCircle || "All Circles" },
          { label: "CMP",        value: selectedCmp    || "All CMP" },
          { label: "View",       value: activeChartLabel },
          { label: "Generated",  value: new Date().toLocaleString("en-GB") },
        ],
        tiles: computeSummaryTiles(towerCards).map(t => ({ label: t.label, value: t.value, sub: t.sub })),
        cards,
      });
      if (!ok) window.alert("Please allow pop-ups for this site to generate the PDF report.");
    } finally {
      setExporting(false);
    }
  }, [hasCards, towerCards, exportMeta, dateRange, customFrom, customTo, activeRangeLabel, selectedCircle, selectedCmp, activeChartLabel]);

  const selectClass = "h-9 rounded-xl border border-border-color bg-surface px-3 text-sm text-text-secondary shadow-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100 dark:focus:border-blue-500/30";

  return (
    <div
      ref={shellRef}
      className={`min-h-screen ${isFullscreen ? "overflow-y-auto bg-background p-4 sm:p-6" : ""}`}
    >
      {/* ── Page header ── */}
      <div className="mb-3 flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600">
            <Activity className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-text-primary">Uptime Overview</h1>
            <p className="truncate text-sm text-text-muted">Monitor network uptime performance across circles over time.</p>
           
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedCircle}
            onChange={e => updatePrefs({ selectedCircle: e.target.value, selectedCmp: "" })}
            title="Filter every KPI by circle. Selecting one breaks each card down by CMP."
            className={selectClass}
          >
            <option value="">All Circles</option>
            {circleList.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={selectedCmp}
            onChange={e => updatePrefs({ selectedCmp: e.target.value })}
            title="Filter every KPI by CMP"
            className={selectClass}
          >
            <option value="">All CMP</option>
            {cmpList.map(cmp => <option key={cmp} value={cmp}>{cmp}</option>)}
          </select>

          {/* Date range */}
          <Dropdown
            open={openMenu === "range"}
            onToggle={toggleMenu("range")}
            label={activeRangeLabel}
            icon={CalendarDays}
            title="Change the period every card covers"
          >
            {RANGE_OPTIONS.map(opt => (
              <DropdownItem
                key={opt.key}
                active={dateRange === opt.key}
                onClick={() => { updatePrefs({ dateRange: opt.key }); if (opt.key !== "custom") setOpenMenu(null); }}
              >
                {opt.label}
              </DropdownItem>
            ))}
            {dateRange === "custom" && (
              <div className="mt-1 space-y-1.5 border-t border-border-color px-2 pt-2">
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted">From</label>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={e => updatePrefs({ customFrom: e.target.value })}
                  className="h-8 w-full rounded-lg border border-border-color bg-surface px-2 text-xs text-text-secondary outline-none focus:ring-2 focus:ring-blue-100"
                />
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted">To</label>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={e => updatePrefs({ customTo: e.target.value })}
                  className="h-8 w-full rounded-lg border border-border-color bg-surface px-2 text-xs text-text-secondary outline-none focus:ring-2 focus:ring-blue-100"
                />
                {customRangeIncomplete && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">Pick both dates to apply.</p>
                )}
              </div>
            )}
          </Dropdown>

          {/* Chart type */}
          <Dropdown
            open={openMenu === "chart"}
            onToggle={toggleMenu("chart")}
            label={activeChartLabel}
            icon={BarChart2}
            title="Change how every card visualises its data"
          >
            {CHART_TYPES.map(opt => (
              <DropdownItem
                key={opt.key}
                active={chartType === opt.key}
                hint={opt.hint}
                onClick={() => { updatePrefs({ chartType: opt.key }); setOpenMenu(null); }}
              >
                {opt.label}
              </DropdownItem>
            ))}
          </Dropdown>

          {/* Export */}
          <Dropdown
            open={openMenu === "export"}
            onToggle={toggleMenu("export")}
            label={exporting ? "Preparing…" : "Export"}
            icon={Download}
            title="Download the dashboard"
            disabled={!hasCards || exporting}
          >
            <DropdownItem icon={FileSpreadsheet} onClick={handleExportExcel} hint="Overview sheet plus one sheet per KPI">
              Excel (.xlsx)
            </DropdownItem>
            <DropdownItem icon={Table2} onClick={handleExportCsv} hint="One flat, pivot-ready table of every value">
              CSV (.csv)
            </DropdownItem>
            <DropdownItem icon={FileText} onClick={handleExportPdf} hint="Charts + tables; choose “Save as PDF” to print">
              PDF / Print
            </DropdownItem>
          </Dropdown>

          <button
            onClick={refreshTower}
            disabled={refreshing}
            title="Reload all KPI data from the server"
            className="flex h-9 items-center gap-2 rounded-xl border border-border-color bg-surface px-3 text-sm font-medium text-text-secondary shadow-sm transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "View the dashboard fullscreen"}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border-color bg-surface text-text-secondary shadow-sm transition hover:bg-surface-muted"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={refreshTower} />}

      {loading && <DashboardSkeleton />}

      {!loading && hasCards && <SummaryRow towerCards={towerCards} />}

      {!loading && hasCards && (
        <div className="grid gap-3 lg:grid-cols-2">
          {towerCards.map((card) => (
            <KpiCard
              key={card.name}
              card={card}
              chartType={chartType}
              collapsed={collapsedCards.includes(card.name)}
              onToggleCollapse={toggleCardCollapsed}
              onOpenAnalytics={openAnalytics}
              onRefresh={refreshTower}
              registerChartRef={registerChartRef}
            />
          ))}
        </div>
      )}

      {!loading && !error && !hasCards && (
        <EmptyState
          title={customRangeIncomplete ? "Select both custom dates" : "No tower data available"}
          message={
            customRangeIncomplete
              ? "Pick a start and end date to load the dashboard."
              : "Nothing was reported for the selected circle, CMP and date range. Try a wider range or clear the filters."
          }
        />
      )}

      <div className="mt-8 flex items-center justify-center gap-2 px-4 text-center text-xs text-text-muted">
        <Activity className="h-3.5 w-3.5 flex-shrink-0" />
        <p>Uptime is the average of successful tower checks over the selected period.</p>
      </div>

      {analyticsPopup && (
        <UptimeAnalyticsPopup
          kpiName={analyticsPopup.name}
          kpiColor={analyticsPopup.color}
          chartType={chartType}
          initialCircle={selectedCircle}
          initialCmp={selectedCmp}
          onClose={() => setAnalyticsPopup(null)}
        />
      )}
    </div>
  );
}

export default KpiDashboard;
