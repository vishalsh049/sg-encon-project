import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BarChart2,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  Minus,
  Printer,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";

import { authFetch, buildApiUrl } from "../lib/api";
import { useDashboardPreferences } from "../hooks/useDashboardPreferences";
import { useIsDarkMode } from "../hooks/useIsDarkMode";
import { orderEntities } from "../utils/chartMath";
import { getHealthStatus } from "../utils/kpiHealth";
import { exportChartAsCsv, exportChartAsPng } from "../utils/chartExport";

import ChartRenderer from "../components/dashboard/ChartRenderer";
import ChartToolbar from "../components/dashboard/ChartToolbar";
import SummaryRow from "../components/dashboard/SummaryRow";
import KPIComparisonView from "../components/dashboard/KPIComparisonView";

// ─── Constants ───────────────────────────────────────────────────────────────

const colorStyles = {
  blue:    { bg: "bg-blue-50 dark:bg-blue-500/10",       text: "text-blue-600 dark:text-blue-400",       border: "border-blue-100 dark:border-blue-500/20",       dot: "bg-blue-500",    accent: "from-blue-500 to-indigo-500" },
  emerald: { bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-100 dark:border-emerald-500/20", dot: "bg-emerald-500", accent: "from-emerald-500 to-teal-500" },
  violet:  { bg: "bg-violet-50 dark:bg-violet-500/10",   text: "text-violet-600 dark:text-violet-400",   border: "border-violet-100 dark:border-violet-500/20",   dot: "bg-violet-500",  accent: "from-violet-500 to-purple-500" },
  orange:  { bg: "bg-orange-50 dark:bg-orange-500/10",   text: "text-orange-600 dark:text-orange-400",   border: "border-orange-100 dark:border-orange-500/20",   dot: "bg-orange-500",  accent: "from-orange-500 to-amber-500" },
  cyan:    { bg: "bg-cyan-50 dark:bg-cyan-500/10",       text: "text-cyan-600 dark:text-cyan-400",       border: "border-cyan-100 dark:border-cyan-500/20",       dot: "bg-cyan-500",    accent: "from-cyan-500 to-sky-500" },
  rose:    { bg: "bg-rose-50 dark:bg-rose-500/10",       text: "text-rose-600 dark:text-rose-400",       border: "border-rose-100 dark:border-rose-500/20",       dot: "bg-rose-500",    accent: "from-rose-500 to-pink-500" },
};

const CHART_TYPE_OPTIONS = [
  { key: "line",           label: "Line Chart" },
  { key: "bar",            label: "Bar Chart" },
  { key: "area",           label: "Area Chart" },
  { key: "stacked",        label: "Stacked Bar" },
  { key: "heatmap",        label: "Heat Map" },
  { key: "table",          label: "Table View" },
  { key: "combo",          label: "Combo Chart" },
  { key: "sparkline",      label: "Sparkline Cards" },
  { key: "kpi-comparison", label: "KPI Comparison" },
];

// Page-level date range for the compact KPI cards. Separate from the
// analytics popup's own 9-option `period` filter (last7/last30/current_month/
// prev_month/custom_month/yearly/month_range/date_range/quarterly) — the two
// are not unified in this phase, only the chart *rendering* is shared.
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

const YEAR_OPTIONS = [2022, 2023, 2024, 2025, 2026];

const QUARTER_OPTIONS = [
  { key: "1", label: "Q1", months: "Jan–Mar" },
  { key: "2", label: "Q2", months: "Apr–Jun" },
  { key: "3", label: "Q3", months: "Jul–Sep" },
  { key: "4", label: "Q4", months: "Oct–Dec" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatChartDate = (dateStr, period) => {
  if (!dateStr) return "";
  if (["yearly", "month_range", "quarterly"].includes(period)) {
    const [, m] = dateStr.split("-");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return months[Number(m) - 1] || dateStr;
  }
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
};

// ─── Loading skeletons ───────────────────────────────────────────────────────
// Shown while /tower-uptime is in flight so the page paints its layout
// instantly instead of a bare spinner. Mirrors the summary-row + card grid.

function DashboardSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      {/* Summary row skeleton */}
      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border-color bg-surface p-3 shadow-sm">
            <div className="h-3 w-20 rounded bg-surface-muted" />
            <div className="mt-2 h-5 w-16 rounded bg-surface-muted" />
            <div className="mt-1.5 h-3 w-12 rounded bg-surface-muted" />
          </div>
        ))}
      </div>

      {/* KPI card skeletons */}
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
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

// ─── Analytics Popup (drill-down) ────────────────────────────────────────────

// Every chart view the popup renders from the one analytics dataset — the
// popup is the complete analytics view for a KPI, so all of these are shown
// together (main chart first, the rest in the related-charts grid below).
const POPUP_CHART_VIEWS = [
  { key: "line",      label: "Line Trend" },
  { key: "bar",       label: "Bar Comparison" },
  { key: "area",      label: "Area Trend" },
  { key: "stacked",   label: "Stacked Bar" },
  { key: "combo",     label: "Combo View" },
  { key: "heatmap",   label: "Heat Map" },
  { key: "sparkline", label: "Sparkline Cards" },
  { key: "table",     label: "Data Table" },
];

function UptimeAnalyticsPopup({ kpiName, kpiColor, chartType, onClose, initialCircle, initialCmp }) {
  const style = colorStyles[kpiColor] || colorStyles.blue;

  // The dashboard-level "kpi-comparison" type has no single-KPI equivalent —
  // fall back to the line trend as the popup's main chart.
  const mainChartType = POPUP_CHART_VIEWS.some(v => v.key === chartType) ? chartType : "line";
  const relatedChartViews = POPUP_CHART_VIEWS.filter(v => v.key !== mainChartType);

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
    fromDate:      _now.toISOString().split("T")[0],
    toDate:        _now.toISOString().split("T")[0],
    quarter:       String(Math.ceil((_now.getMonth() + 1) / 3)),
    quarterYear:   String(_now.getFullYear()),
  });

  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const chartRef = useRef(null);

  // Per-popup response cache keyed by query string — switching a filter back
  // to a combination already fetched reuses the response instead of hitting
  // the API again. Cleared by the explicit Refresh button, and discarded
  // entirely when the popup unmounts, so data can never go stale silently.
  const cacheRef = useRef(new Map());

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // ESC closes popup
  useEffect(() => {
    const fn = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  // Fetch whenever filters change (or a manual refresh is requested).
  // AbortController cancels the previous in-flight request so rapid filter
  // clicks don't stack duplicate requests.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const fetchData = async () => {
      setLoading(true);
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
        const cacheKey = params.toString();
        const cached = cacheRef.current.get(cacheKey);
        if (cached) {
          if (!cancelled) setData(cached);
          return;
        }
        const res  = await authFetch(buildApiUrl(`/api/tower-uptime/analytics?${params}`), { signal: controller.signal });
        const json = await res.json();
        if (res.ok) cacheRef.current.set(cacheKey, json); // never cache error payloads
        if (!cancelled) setData(json);
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error("Analytics fetch error:", err);
        if (!cancelled) setData({ chartData: [], summary: { avg: 0, highest: 0, lowest: 0, total: 0, trend: "stable" }, circles: [], cmps: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; controller.abort(); };
  }, [kpiName, filters, refreshTick]);

  // Regroup flat rows -> { date: label, <entity1>: value, ... } so it matches
  // the same X-axis=date/series=entity orientation every chart view expects.
  const { chartData: transformedData, chartEntities } = useMemo(() => {
    if (!data?.chartData?.length) return { chartData: [], chartEntities: [] };

    const dateLabels = new Map(); // rawDate -> label
    const entitySet  = new Set();

    data.chartData.forEach(row => {
      if (!dateLabels.has(row.date)) dateLabels.set(row.date, formatChartDate(row.date, filters.period));
      entitySet.add(row.entity || row.circle || "Overall");
    });

    const groupBy = data.groupBy || (filters.circle ? "cmp" : "circle");
    const orderedEntities = groupBy === "circle"
      ? orderEntities(Array.from(entitySet))
      : Array.from(entitySet).sort();

    const rowsByRawDate = {};
    data.chartData.forEach(row => {
      if (!rowsByRawDate[row.date]) rowsByRawDate[row.date] = {};
      const e = row.entity || row.circle || "Overall";
      rowsByRawDate[row.date][e] = Number(row.uptime || 0);
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

  const handleFilterChange = (key, value) => {
    setFilters(prev => {
      const next = { ...prev, [key]: value };
      if (key === "circle") next.cmp = "";
      return next;
    });
  };

  const handleExportPng = () => {
    const svg = chartRef.current?.querySelector("svg");
    if (svg) exportChartAsPng(svg, `${kpiName}_uptime.png`);
  };

  const handleExportCsv = () => {
    exportChartAsCsv(transformedData, chartEntities, `${kpiName}_uptime.csv`);
  };

  const summary  = data?.summary || {};
  const trend    = summary.trend || "stable";
  const TrendIcon  = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendText  = trend === "up" ? "Improving" : trend === "down" ? "Declining" : "Stable";
  const trendColor = trend === "up" ? "text-green-600 dark:text-green-400" : trend === "down" ? "text-red-600 dark:text-red-400" : "text-text-muted";
  const trendBg    = trend === "up" ? "bg-green-50 dark:bg-green-500/10 border-green-100 dark:border-green-500/20" : trend === "down" ? "bg-red-50 dark:bg-red-500/10 border-red-100 dark:border-red-500/20" : "bg-surface-muted border-border-color";

  const showMonthPicker = filters.period === "custom_month";
  const showYearPicker  = filters.period === "yearly" || filters.period === "custom_month";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-5"
      style={{ backgroundColor: "rgba(15,23,42,0.50)", backdropFilter: "blur(8px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`
          relative flex flex-col bg-surface
          shadow-[0_40px_100px_rgba(15,23,42,0.22)]
          border border-border-color/80
          overflow-hidden animate-modal-enter
          ${fullscreen
            ? "w-full h-full max-w-none max-h-none rounded-none"
            : "w-full max-w-5xl max-h-[93vh] rounded-3xl"}
        `}
      >

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-border-color bg-gradient-to-r from-surface-muted/70 to-surface flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${style.accent} flex-shrink-0 shadow-sm`}>
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-text-primary tracking-tight leading-snug">
                {kpiName} Uptime Analytics
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                Detailed uptime analysis &amp; historical performance
              </p>
            </div>
          </div>

          {/* Filters + close */}
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
            <select
              value={filters.circle}
              onChange={e => handleFilterChange("circle", e.target.value)}
              className="h-8 rounded-xl border border-border-color bg-surface px-3 text-xs text-text-secondary shadow-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
            >
              <option value="">All Circles</option>
              {(data?.circles || []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select
              value={filters.cmp}
              onChange={e => handleFilterChange("cmp", e.target.value)}
              className="h-8 rounded-xl border border-border-color bg-surface px-3 text-xs text-text-secondary shadow-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
            >
              <option value="">All CMP</option>
              {(data?.cmps || []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-border-color bg-surface text-text-muted shadow-sm hover:bg-surface-muted hover:text-text-primary transition"
              title="Close (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Period filter bar ── */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-border-color bg-surface-muted/60 flex-wrap flex-shrink-0 overflow-x-auto">
          <span className="text-[10px] font-semibold uppercase tracking-[0.20em] text-text-muted whitespace-nowrap mr-1">
            Period
          </span>

          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => handleFilterChange("period", opt.key)}
              className={`
                whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-medium transition-all
                ${filters.period === opt.key
                  ? `${style.bg} ${style.text} ring-1 ring-current/40 shadow-sm font-semibold`
                  : "bg-surface border border-border-color text-text-secondary hover:border-border-strong hover:bg-surface-muted"}
              `}
            >
              {opt.label}
            </button>
          ))}

          {showMonthPicker && (
            <select
              value={filters.month}
              onChange={e => handleFilterChange("month", e.target.value)}
              className="h-7 rounded-xl border border-border-color bg-surface px-2 text-xs text-text-secondary outline-none focus:ring-2 focus:ring-blue-100"
            >
              {MONTH_OPTIONS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
          )}

          {showYearPicker && (
            <select
              value={filters.year}
              onChange={e => handleFilterChange("year", e.target.value)}
              className="h-7 rounded-xl border border-border-color bg-surface px-2 text-xs text-text-secondary outline-none focus:ring-2 focus:ring-blue-100"
            >
              {YEAR_OPTIONS.map(y => <option key={y} value={String(y)}>{y}</option>)}
            </select>
          )}

          {/* Month to Month pickers */}
          {filters.period === "month_range" && (
            <>
              <span className="text-[10px] font-medium text-text-muted whitespace-nowrap">From</span>
              <select
                value={filters.fromMonth}
                onChange={e => handleFilterChange("fromMonth", e.target.value)}
                className="h-7 rounded-xl border border-border-color bg-surface px-2 text-xs text-text-secondary outline-none focus:ring-2 focus:ring-blue-100"
              >
                {MONTH_OPTIONS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
              <select
                value={filters.fromMonthYear}
                onChange={e => handleFilterChange("fromMonthYear", e.target.value)}
                className="h-7 rounded-xl border border-border-color bg-surface px-2 text-xs text-text-secondary outline-none focus:ring-2 focus:ring-blue-100"
              >
                {YEAR_OPTIONS.map(y => <option key={y} value={String(y)}>{y}</option>)}
              </select>
              <span className="text-[10px] font-medium text-text-muted whitespace-nowrap">To</span>
              <select
                value={filters.toMonth}
                onChange={e => handleFilterChange("toMonth", e.target.value)}
                className="h-7 rounded-xl border border-border-color bg-surface px-2 text-xs text-text-secondary outline-none focus:ring-2 focus:ring-blue-100"
              >
                {MONTH_OPTIONS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
              <select
                value={filters.toMonthYear}
                onChange={e => handleFilterChange("toMonthYear", e.target.value)}
                className="h-7 rounded-xl border border-border-color bg-surface px-2 text-xs text-text-secondary outline-none focus:ring-2 focus:ring-blue-100"
              >
                {YEAR_OPTIONS.map(y => <option key={y} value={String(y)}>{y}</option>)}
              </select>
            </>
          )}

          {/* Date to Date pickers */}
          {filters.period === "date_range" && (
            <>
              <span className="text-[10px] font-medium text-text-muted whitespace-nowrap">From</span>
              <input
                type="date"
                value={filters.fromDate}
                onChange={e => handleFilterChange("fromDate", e.target.value)}
                className="h-7 rounded-xl border border-border-color bg-surface px-2 text-xs text-text-secondary outline-none focus:ring-2 focus:ring-blue-100"
              />
              <span className="text-[10px] font-medium text-text-muted whitespace-nowrap">To</span>
              <input
                type="date"
                value={filters.toDate}
                onChange={e => handleFilterChange("toDate", e.target.value)}
                className="h-7 rounded-xl border border-border-color bg-surface px-2 text-xs text-text-secondary outline-none focus:ring-2 focus:ring-blue-100"
              />
            </>
          )}

          {/* Quarterly pickers */}
          {filters.period === "quarterly" && (
            <>
              <select
                value={filters.quarterYear}
                onChange={e => handleFilterChange("quarterYear", e.target.value)}
                className="h-7 rounded-xl border border-border-color bg-surface px-2 text-xs text-text-secondary outline-none focus:ring-2 focus:ring-blue-100"
              >
                {YEAR_OPTIONS.map(y => <option key={y} value={String(y)}>{y}</option>)}
              </select>
              {QUARTER_OPTIONS.map(q => (
                <button
                  key={q.key}
                  onClick={() => handleFilterChange("quarter", q.key)}
                  title={q.months}
                  className={`
                    whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-medium transition-all
                    ${filters.quarter === q.key
                      ? `${style.bg} ${style.text} ring-1 ring-current/40 shadow-sm font-semibold`
                      : "bg-surface border border-border-color text-text-secondary hover:border-border-strong hover:bg-surface-muted"}
                  `}
                >
                  {q.label}
                </button>
              ))}
            </>
          )}
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Chart card */}
          <div className="rounded-2xl border border-border-color bg-surface shadow-sm overflow-hidden">

            {/* Chart toolbar */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border-color bg-surface-muted/40">
              <div className="flex items-center gap-2">
                <BarChart2 className={`h-4 w-4 ${style.text}`} />
                <span className="text-sm font-semibold text-text-primary">
                  {kpiName} Uptime Trend
                </span>
                {!loading && transformedData.length > 0 && (
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-text-muted">
                    {transformedData.length} data points
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportPng}
                  disabled={loading || !transformedData.length}
                  className="flex items-center gap-1.5 rounded-xl border border-border-color bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-muted shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ImageIcon className="h-3 w-3" />
                  Export PNG
                </button>
                <button
                  onClick={handleExportCsv}
                  disabled={loading || !transformedData.length}
                  className="flex items-center gap-1.5 rounded-xl border border-border-color bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-muted shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <FileSpreadsheet className="h-3 w-3" />
                  Export CSV
                </button>
           {/*     <button
                  onClick={() => window.print()}
                  disabled={loading || !transformedData.length}
                  title="Print or save this analytics view as PDF"
                  className="flex items-center gap-1.5 rounded-xl border border-border-color bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-muted shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Printer className="h-3 w-3" />
                  Download PDF
                </button>
                 */}
                <button
                  onClick={() => { cacheRef.current.clear(); setRefreshTick(t => t + 1); }}
                  className="flex items-center gap-1.5 rounded-xl border border-border-color bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-muted shadow-sm transition"
                >
                  Refresh
                </button>
                <button
                  onClick={() => setFullscreen(f => !f)}
                  className="flex items-center gap-1.5 rounded-xl border border-border-color bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-muted shadow-sm transition"
                >
                  {fullscreen
                    ? <><Minimize2 className="h-3 w-3" /> Exit</>
                    : <><Maximize2 className="h-3 w-3" /> Fullscreen</>
                  }
                </button>
              </div>
            </div>

            {/* Chart body */}
            <div className="p-5">
              {loading ? (
                <div className="flex h-72 items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className={`h-9 w-9 animate-spin rounded-full border-[3px] border-border-color border-t-current ${style.text}`} />
                    <p className="text-sm text-text-muted animate-pulse">Loading analytics data…</p>
                  </div>
                </div>
              ) : !transformedData.length ? (
                <div className="flex h-72 flex-col items-center justify-center gap-3">
                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-surface-muted">
                    <BarChart2 className="h-7 w-7 text-text-muted" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-text-secondary">No Data Available</p>
                    <p className="text-xs text-text-muted mt-1">
                      No uptime records found for the selected filters and period.
                    </p>
                  </div>
                </div>
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

          {/* ── Summary KPI cards ── */}
         

          {/* ── Related charts — every other view of the same dataset ── */}
          {!loading && transformedData.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <BarChart2 className={`h-4 w-4 ${style.text}`} />
                <h3 className="text-sm font-semibold text-text-primary">All Chart Views</h3>
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-text-muted">
                  Same data, {relatedChartViews.length} more views
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {relatedChartViews.map(view => (
                  <div key={view.key} className="min-w-0 overflow-hidden rounded-2xl border border-border-color bg-surface shadow-sm">
                    <div className="border-b border-border-color bg-surface-muted/40 px-4 py-2.5">
                      <span className="text-xs font-semibold text-text-primary">
                        {kpiName} — {view.label}
                      </span>
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
// cards whose data actually changed, and each card's legend state stays local
// instead of living in an index-keyed map on the parent.

const KpiCard = React.memo(function KpiCard({ card, chartType, collapsed, onToggleCollapse, onOpenAnalytics, onRefresh }) {
  const style = colorStyles[card.color] || colorStyles.blue;
  const orderedEntities = useMemo(() => orderEntities(card.entities || card.circles || []), [card.entities, card.circles]);
  const health = useMemo(() => getHealthStatus(parseFloat(card.uptime)), [card.uptime]);

  return (
    <div className={`relative rounded-[18px] border ${style.border} bg-surface p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl`}>
      {/* Card header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${style.bg}`}>
            <Activity className={`h-4 w-4 ${style.text}`} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-semibold text-text-primary">{card.name}</h2>
              <span title={health.label}>{health.emoji}</span>
            </div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-text-muted">UPTIME</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <ChartToolbar
            onFullscreen={() => onOpenAnalytics(card)}
            onRefresh={onRefresh}
          />

          <button
            onClick={() => onToggleCollapse(card.name)}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-text-muted hover:bg-surface-muted hover:text-text-secondary transition"
            title={collapsed ? "Expand card" : "Collapse card"}
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {collapsed ? (
        <p className="mt-2 text-lg font-semibold text-text-primary">{card.uptime}</p>
      ) : (
        <div className="mt-3">
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
  const isDark = useIsDarkMode();

  // Stable identity so the memoized KpiCards don't re-render on every
  // dashboard render (updatePrefs supports functional patches).
  const toggleCardCollapsed = useCallback((kpiName) => {
    updatePrefs(prev => {
      const set = new Set(prev.collapsedCards);
      if (set.has(kpiName)) set.delete(kpiName);
      else set.add(kpiName);
      return { collapsedCards: Array.from(set) };
    });
  }, [updatePrefs]);

  const [towerCards, setTowerCards] = useState([]);
  const [circleList, setCircleList] = useState([]);
  const [cmpList, setCmpList]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [analyticsPopup, setAnalyticsPopup] = useState(null);
  const [chartTypeMenuOpen, setChartTypeMenuOpen] = useState(false);
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);

  const chartTypeMenuRef = useRef(null);
  const rangeMenuRef = useRef(null);

  // Close chart-type / range dropdowns on outside click
  useEffect(() => {
    const fn = (e) => {
      if (chartTypeMenuOpen && chartTypeMenuRef.current && !chartTypeMenuRef.current.contains(e.target)) {
        setChartTypeMenuOpen(false);
      }
      if (rangeMenuOpen && rangeMenuRef.current && !rangeMenuRef.current.contains(e.target)) {
        setRangeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [chartTypeMenuOpen, rangeMenuOpen]);

  // Manual refresh just bumps a tick; the effect below owns the actual fetch
  // so every request is cancellable and the callback identity stays stable
  // for the memoized cards.
  const [refreshTick, setRefreshTick] = useState(0);
  const refreshTower = useCallback(() => setRefreshTick(t => t + 1), []);

  // Fetch tower cards. The AbortController cancels the in-flight request when
  // filters change again before it resolves, so rapid filter changes can't
  // pile up duplicate requests or apply stale responses out of order.
  useEffect(() => {
    const controller = new AbortController();

    const fetchTower = async () => {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({
          circle: selectedCircle,
          cmp:    selectedCmp,
          range:  dateRange,
        });
        if (dateRange === "custom") {
          params.set("from", customFrom || "");
          params.set("to",   customTo   || "");
        }
        const res  = await authFetch(buildApiUrl(`/api/tower-uptime?${params}`), { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setTowerCards(data);

        if (!selectedCircle) {
          const circles = new Set();
          data.forEach(card => {
            if (card.groupBy === "circle") {
              (card.entities || card.circles || []).forEach(c => { if (c) circles.add(c); });
            }
          });
          const sorted = Array.from(circles).sort();
          if (sorted.length > 0) setCircleList(sorted);
        }
        setLoading(false);
      } catch (err) {
        if (err.name === "AbortError") return; // superseded by a newer request
        console.error(err);
        setError(err.message);
        setLoading(false);
      }
    };

    fetchTower();
    return () => controller.abort();
  }, [selectedCircle, selectedCmp, dateRange, customFrom, customTo, refreshTick]);

  // Fetch CMP list from dedicated endpoint whenever circle selection changes
  useEffect(() => {
    const controller = new AbortController();

    const fetchCmps = async () => {
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
    };

    fetchCmps();
    return () => controller.abort();
  }, [selectedCircle]);

  const openAnalytics = useCallback((card) => {
    setAnalyticsPopup({ name: card.name, color: card.color });
  }, []);

  const activeRangeLabel = RANGE_OPTIONS.find(r => r.key === dateRange)?.label || "Last 7 Days";
  const activeChartLabel = CHART_TYPE_OPTIONS.find(c => c.key === chartType)?.label || "Line Chart";

  return (
    <div className="min-h-screen">

      {/* ── Page header ── */}
      <div className="mb-2 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600">
            <Activity className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-md font-semibold text-text-primary">Uptime Overview</h1>
            <p className="text-sm text-text-muted">Real-time uptime trend of all monitored tower systems.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedCircle}
            onChange={e => updatePrefs({ selectedCircle: e.target.value, selectedCmp: "" })}
            className="h-9 rounded-xl border border-border-color bg-surface px-3 text-sm text-text-secondary shadow-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
          >
            <option value="">All Circles</option>
            {circleList.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={selectedCmp}
            onChange={e => updatePrefs({ selectedCmp: e.target.value })}
            className="h-9 rounded-xl border border-border-color bg-surface px-3 text-sm text-text-secondary shadow-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
          >
            <option value="">All CMP</option>
            {cmpList.map(cmp => <option key={cmp} value={cmp}>{cmp}</option>)}
          </select>

          {/* Date Range control */}
          <div className="relative" ref={rangeMenuRef}>
            <button
              onClick={() => setRangeMenuOpen(o => !o)}
              className="flex items-center gap-2 rounded-xl border border-border-color bg-surface px-4 py-2 text-sm font-medium text-text-secondary shadow-sm hover:bg-surface-muted transition"
            >
              <CalendarDays className="h-4 w-4" />
              {activeRangeLabel}
              <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
            </button>
            {rangeMenuOpen && (
              <div className="absolute right-0 top-11 z-50 min-w-[190px] rounded-2xl border border-border-color bg-surface p-1.5 shadow-[0_10px_40px_rgba(15,23,42,0.14)]">
                {RANGE_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => { updatePrefs({ dateRange: opt.key }); if (opt.key !== "custom") setRangeMenuOpen(false); }}
                    className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium transition ${dateRange === opt.key ? "bg-blue-50 text-blue-700" : "text-text-secondary hover:bg-surface-muted"}`}
                  >
                    {opt.label}
                  </button>
                ))}
                {dateRange === "custom" && (
                  <div className="mt-1 space-y-1.5 border-t border-border-color px-2 pt-2">
                    <input
                      type="date"
                      value={customFrom}
                      onChange={e => updatePrefs({ customFrom: e.target.value })}
                      className="h-8 w-full rounded-lg border border-border-color px-2 text-xs text-text-secondary outline-none focus:ring-2 focus:ring-blue-100"
                    />
                    <input
                      type="date"
                      value={customTo}
                      onChange={e => updatePrefs({ customTo: e.target.value })}
                      className="h-8 w-full rounded-lg border border-border-color px-2 text-xs text-text-secondary outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Dashboard View (global chart type) selector */}
          <div className="relative" ref={chartTypeMenuRef}>
            <button
              onClick={() => setChartTypeMenuOpen(o => !o)}
              className="flex items-center gap-2 rounded-xl border border-border-color bg-surface px-4 py-2 text-sm font-medium text-text-secondary shadow-sm hover:bg-surface-muted transition"
            >
              <BarChart2 className="h-4 w-4" />
              {activeChartLabel}
              <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
            </button>
            {chartTypeMenuOpen && (
              <div className="absolute right-0 top-11 z-50 min-w-[160px] rounded-2xl border border-border-color bg-surface p-1.5 shadow-[0_10px_40px_rgba(15,23,42,0.14)]">
                {CHART_TYPE_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => { updatePrefs({ chartType: opt.key }); setChartTypeMenuOpen(false); }}
                    className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium transition ${chartType === opt.key ? "bg-blue-50 text-blue-700" : "text-text-secondary hover:bg-surface-muted"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          <strong>Error loading data:</strong> {error}
        </div>
      )}

      {/* Loading skeleton — page paints instantly while the API completes */}
      {loading && <DashboardSkeleton />}

      {/* ── Summary Row ── */}
      {!loading && towerCards.length > 0 && <SummaryRow towerCards={towerCards} />}

      {/* KPI Comparison replaces the per-KPI card grid entirely — it compares
          KPIs against each other (AG1 vs ENB vs ESC ...), a different axis
          than the per-circle breakdown every other chart type shows. */}
      {!loading && chartType === "kpi-comparison" && (
        <KPIComparisonView towerCards={towerCards} dark={isDark} />
      )}

      

      {/* ── KPI Cards ── */}
      {!loading && chartType !== "kpi-comparison" && (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-2">
          {towerCards.map((card) => (
            <KpiCard
              key={card.name}
              card={card}
              chartType={chartType}
              collapsed={collapsedCards.includes(card.name)}
              onToggleCollapse={toggleCardCollapsed}
              onOpenAnalytics={openAnalytics}
              onRefresh={refreshTower}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && towerCards.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-surface-muted">
            <BarChart2 className="h-7 w-7 text-text-muted" />
          </div>
          <p className="text-text-muted text-sm font-medium">No tower data available</p>
        </div>
      )}

      {/* Footer note */}
      <div className="mt-10 flex items-center justify-center gap-2 text-xs text-text-muted">
        <Activity className="h-3.5 w-3.5" />
        <p>Uptime percentage is calculated based on successful tower checks over the selected time period.</p>
      </div>

      {/* ── Analytics Popup ── */}
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
