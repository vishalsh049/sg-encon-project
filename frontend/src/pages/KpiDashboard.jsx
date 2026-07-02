import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  Activity,
  BarChart2,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  Filter,
  Maximize2,
  Minimize2,
  Minus,
  MoreVertical,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { authFetch, buildApiUrl } from "../lib/api";

// ─── Constants ───────────────────────────────────────────────────────────────

const CHART_COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#64748b",
];

const CIRCLE_COLORS_MAP = {
  "Punjab":  "#3b82f6",
  "Delhi":   "#22c55e",
  "Haryana": "#f59e0b",
  "UP East": "#8b5cf6",
};

function getCircleColor(name, index) {
  return CIRCLE_COLORS_MAP[name] || CHART_COLORS[index % CHART_COLORS.length];
}

const colorStyles = {
  blue:    { bg: "bg-blue-50",    text: "text-blue-600",    border: "border-blue-100",    dot: "bg-blue-500",    accent: "from-blue-500 to-indigo-500" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-100", dot: "bg-emerald-500", accent: "from-emerald-500 to-teal-500" },
  violet:  { bg: "bg-violet-50",  text: "text-violet-600",  border: "border-violet-100",  dot: "bg-violet-500",  accent: "from-violet-500 to-purple-500" },
  orange:  { bg: "bg-orange-50",  text: "text-orange-600",  border: "border-orange-100",  dot: "bg-orange-500",  accent: "from-orange-500 to-amber-500" },
  cyan:    { bg: "bg-cyan-50",    text: "text-cyan-600",    border: "border-cyan-100",    dot: "bg-cyan-500",    accent: "from-cyan-500 to-sky-500" },
  rose:    { bg: "bg-rose-50",    text: "text-rose-600",    border: "border-rose-100",    dot: "bg-rose-500",    accent: "from-rose-500 to-pink-500" },
};

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

// Compute a fully dynamic Y-axis: nice round tick positions that zoom in on
// the actual data range so small differences between bars are clearly visible.
function calcYAxis(vals, targetTickCount = 7) {
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;

  // Pad 20 % above and below (minimum 0.05 absolute so a flat line still shows)
  const pad   = Math.max(range * 0.2, 0.05);
  const rawLo = min - pad;
  const rawHi = max + pad;

  // Pick a "nice" step size (1, 2, or 5 × a power of 10)
  const rawStep = (rawHi - rawLo) / (targetTickCount - 1);
  const exp     = Math.floor(Math.log10(rawStep));
  const mag     = Math.pow(10, exp);
  const norm    = rawStep / mag;
  const niceStep =
    norm <= 1 ? mag :
    norm <= 2 ? 2 * mag :
    norm <= 5 ? 5 * mag : 10 * mag;

  // Snap domain boundaries to the step grid
  const lo = Math.floor(rawLo / niceStep) * niceStep;
  const hi = Math.ceil(rawHi  / niceStep) * niceStep;

  // Decimal places to show on tick labels
  const dp    = niceStep < 1 ? Math.max(0, -Math.floor(Math.log10(niceStep))) : 0;
  const count = Math.round((hi - lo) / niceStep);

  const ticks = Array.from({ length: count + 1 }, (_, i) =>
    parseFloat((lo + i * niceStep).toFixed(dp + 2))
  ).filter(t => t >= 0 && t <= 100);

  return {
    domain:        [Math.max(0, parseFloat(lo.toFixed(dp + 2))), Math.min(100, parseFloat(hi.toFixed(dp + 2)))],
    ticks,
    tickFormatter: v => `${Number(v).toFixed(dp)}%`,
  };
}

// Fixed X-axis order for circles
const CIRCLE_ORDER = ["Delhi", "Haryana", "Punjab", "UP East"];

// ─── Mini Grouped Bar Chart ───────────────────────────────────────────────────
// X-axis = Circles, one Bar per date (last 7 days), legend shows date labels.

function MiniGroupedChart({ chartData, circles, groupBy }) {
  // Dates in chronological order as they appear in chartData
  const dates = useMemo(() =>
    (chartData || []).map(row => row.date).filter(Boolean),
    [chartData]
  );

  // When grouping by circle: respect fixed display order; extras appended alphabetically.
  // When grouping by CMP: none match CIRCLE_ORDER so all sort alphabetically — correct.
  const orderedCircles = useMemo(() => {
    const known = CIRCLE_ORDER.filter(c => (circles || []).includes(c));
    const extra = (circles || []).filter(c => !CIRCLE_ORDER.includes(c)).sort();
    return [...known, ...extra];
  }, [circles]);

  // Transpose: rows keyed by circle, columns keyed by date
  // [{ circle: "Delhi", "22 Jun": 98.91, "23 Jun": 99.12, … }, …]
  const transposed = useMemo(() =>
    orderedCircles.map(circle => {
      const obj = { circle };
      dates.forEach(date => {
        const row = (chartData || []).find(r => r.date === date);
        const v = row ? Number(row[circle] || 0) : 0;
        obj[date] = v > 0 ? v : null;
      });
      return obj;
    }),
    [orderedCircles, dates, chartData]
  );

  const allVals = useMemo(() =>
    transposed.flatMap(row => dates.map(d => Number(row[d] || 0)).filter(v => v > 0)),
    [transposed, dates]
  );

  const { domain, ticks } = useMemo(() => {
    if (!allVals.length) return { domain: [0, 100], ticks: undefined };
    const result = calcYAxis(allVals);
    return { domain: result.domain, ticks: result.ticks };
  }, [allVals]);

  if (!transposed.length || !dates.length) {
    return (
      <div className="flex h-44 items-center justify-center rounded-2xl bg-slate-50">
        <p className="text-[10px] text-slate-400">
          {groupBy === "cmp" ? "No CMP data" : "No circle data"}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-slate-50/80 px-1 pt-2 pb-1">
      {/* Legend – date labels with per-day colors */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 pb-2">
        {dates.map((date, i) => (
          <div key={date} className="flex items-center gap-1">
            <div
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span className="text-[9px] font-medium text-slate-500">{date}</span>
          </div>
        ))}
      </div>

      {/* Chart: X-axis = circles, one bar per date */}
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={transposed}
            margin={{ top: 16, right: 4, left: -28, bottom: 0 }}
            barCategoryGap="5%"
            barGap={0}
          >
            <defs>
              {dates.map((date, i) => {
                const color = CHART_COLORS[i % CHART_COLORS.length];
                return (
                  <linearGradient key={`mg${i}`} id={`mg${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={color} stopOpacity={0.92} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.52} />
                  </linearGradient>
                );
              })}
            </defs>

            <CartesianGrid strokeDasharray="2 2" stroke="#f1f5f9" vertical={false} />

            <XAxis
              dataKey="circle"
              tick={{ fontSize: 8, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
            />

            <YAxis
              domain={domain}
              ticks={ticks}
              tick={{ fontSize: 7.5, fill: "#cbd5e1" }}
              axisLine={false}
              tickLine={false}
              width={28}
              tickFormatter={v => `${Number(v).toFixed(0)}%`}
            />

            <Tooltip
              formatter={(val, name) => [`${Number(val).toFixed(2)}%`, name]}
              contentStyle={{
                borderRadius: "10px",
                border: "none",
                boxShadow: "0 8px 25px rgba(15,23,42,0.12)",
                fontSize: "11px",
                padding: "8px 12px",
                backgroundColor: "rgba(255,255,255,0.97)",
              }}
              cursor={{ fill: "rgba(148,163,184,0.06)" }}
            />

            {dates.map((date, i) => (
              <Bar
                key={date}
                dataKey={date}
                name={date}
                fill={`url(#mg${i})`}
                radius={[3, 3, 0, 0]}
                maxBarSize={10}
              >
              <LabelList
  dataKey={date}
  position="top"
  angle={-90}
  offset={12}
  formatter={v => v != null && v > 0 ? `${Number(v).toFixed(2)}` : ""}
  style={{
    fontSize: 7,
    fontWeight: "700",
    fill: "#475569",
    textAnchor: "middle"
  }}
/>
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Analytics Popup ─────────────────────────────────────────────────────────

function UptimeAnalyticsPopup({ kpiName, kpiColor, onClose, initialCircle, initialCmp }) {
  const style = colorStyles[kpiColor] || colorStyles.blue;

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
  const chartRef = useRef(null);

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

  // Fetch whenever filters change
  useEffect(() => {
    let cancelled = false;
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
        const res  = await authFetch(buildApiUrl(`/api/tower-uptime/analytics?${params}`));
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        console.error("Analytics fetch error:", err);
        if (!cancelled) setData({ chartData: [], summary: { avg: 0, highest: 0, lowest: 0, total: 0, trend: "stable" }, circles: [], cmps: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [kpiName, filters]);

  // Transform flat rows → transposed grouped bar format
  // X-axis = entities (circles or CMPs), bar series = dates (last 7 days)
  const { chartData: transformedData, chartDates, chartEntities } = useMemo(() => {
    if (!data?.chartData?.length) return { chartData: [], chartDates: [], chartEntities: [] };

    // Collect dates (Map preserves insertion/chronological order from backend)
    const dateMap   = new Map();
    const entitySet = new Set();

    data.chartData.forEach(row => {
      const label = formatChartDate(row.date, filters.period);
      if (!dateMap.has(row.date)) dateMap.set(row.date, label);
      entitySet.add(row.entity || row.circle || "Overall");
    });

    const dates    = Array.from(dateMap.values());
    const entities = Array.from(entitySet);

    // For circle mode keep fixed display order; CMP mode sorts alphabetically
    const groupBy = data.groupBy || (filters.circle ? "cmp" : "circle");
    let orderedEntities;
    if (groupBy === "circle") {
      const known = CIRCLE_ORDER.filter(c => entities.includes(c));
      const extra = entities.filter(c => !CIRCLE_ORDER.includes(c)).sort();
      orderedEntities = [...known, ...extra];
    } else {
      orderedEntities = [...entities].sort();
    }

    // Build entity → { dateLabel → uptime }
    const entityDateMap = {};
    data.chartData.forEach(row => {
      const label = dateMap.get(row.date);
      const e     = row.entity || row.circle || "Overall";
      if (!entityDateMap[e]) entityDateMap[e] = {};
      entityDateMap[e][label] = Number(row.uptime || 0);
    });

    // One row per entity, columns = date labels
    const chartData = orderedEntities.map(entity => {
      const obj = { entity };
      dates.forEach(date => {
        const v = entityDateMap[entity]?.[date] || 0;
        obj[date] = v > 0 ? v : null;
      });
      return obj;
    });

    return { chartData, chartDates: dates, chartEntities: orderedEntities };
  }, [data, filters.period, filters.circle]);

  // Dynamic Y-axis: domain + explicit tick array so recharts cannot override
  const { yDomain, yTicks, yTickFormatter } = useMemo(() => {
    const fallback = { yDomain: [0, 100], yTicks: undefined, yTickFormatter: v => `${v}%` };
    if (!transformedData.length) return fallback;

    const vals = transformedData.flatMap(row =>
      chartDates.map(d => Number(row[d] || 0)).filter(v => v > 0)
    );
    if (!vals.length) return fallback;

    const { domain, ticks, tickFormatter } = calcYAxis(vals);
    return { yDomain: domain, yTicks: ticks, yTickFormatter: tickFormatter };
  }, [transformedData, chartDates]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => {
      const next = { ...prev, [key]: value };
      if (key === "circle") next.cmp = "";
      return next;
    });
  };

  // Download chart as SVG
  const handleDownloadSvg = () => {
    const svg = chartRef.current?.querySelector("svg");
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), { href: url, download: `${kpiName}_uptime.svg` });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const summary  = data?.summary || {}; 
  const trend    = summary.trend || "stable";
  const TrendIcon  = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendText  = trend === "up" ? "Improving" : trend === "down" ? "Declining" : "Stable";
  const trendColor = trend === "up" ? "text-green-600" : trend === "down" ? "text-red-600" : "text-slate-500";
  const trendBg    = trend === "up" ? "bg-green-50 border-green-100" : trend === "down" ? "bg-red-50 border-red-100" : "bg-slate-50 border-slate-200";

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
          relative flex flex-col bg-white
          shadow-[0_40px_100px_rgba(15,23,42,0.22)]
          border border-slate-100/80
          overflow-hidden animate-modal-enter
          ${fullscreen
            ? "w-full h-full max-w-none max-h-none rounded-none"
            : "w-full max-w-5xl max-h-[93vh] rounded-3xl"}
        `}
      >

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50/70 to-white flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${style.accent} flex-shrink-0 shadow-sm`}>
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-slate-900 tracking-tight leading-snug">
                {kpiName} Uptime Analytics
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Detailed uptime analysis &amp; historical performance
              </p>
            </div>
          </div>

          {/* Filters + close */}
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
            <select
              value={filters.circle}
              onChange={e => handleFilterChange("circle", e.target.value)}
              className="h-8 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 shadow-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
            >
              <option value="">All Circles</option>
              {(data?.circles || []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select
              value={filters.cmp}
              onChange={e => handleFilterChange("cmp", e.target.value)}
              className="h-8 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 shadow-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
            >
              <option value="">All CMP</option>
              {(data?.cmps || []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-800 transition"
              title="Close (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Period filter bar ── */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-100 bg-slate-50/60 flex-wrap flex-shrink-0 overflow-x-auto">
          <span className="text-[10px] font-semibold uppercase tracking-[0.20em] text-slate-400 whitespace-nowrap mr-1">
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
                  : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"}
              `}
            >
              {opt.label}
            </button>
          ))}

          {showMonthPicker && (
            <select
              value={filters.month}
              onChange={e => handleFilterChange("month", e.target.value)}
              className="h-7 rounded-xl border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
            >
              {MONTH_OPTIONS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
          )}

          {showYearPicker && (
            <select
              value={filters.year}
              onChange={e => handleFilterChange("year", e.target.value)}
              className="h-7 rounded-xl border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
            >
              {YEAR_OPTIONS.map(y => <option key={y} value={String(y)}>{y}</option>)}
            </select>
          )}

          {/* Month to Month pickers */}
          {filters.period === "month_range" && (
            <>
              <span className="text-[10px] font-medium text-slate-500 whitespace-nowrap">From</span>
              <select
                value={filters.fromMonth}
                onChange={e => handleFilterChange("fromMonth", e.target.value)}
                className="h-7 rounded-xl border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
              >
                {MONTH_OPTIONS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
              <select
                value={filters.fromMonthYear}
                onChange={e => handleFilterChange("fromMonthYear", e.target.value)}
                className="h-7 rounded-xl border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
              >
                {YEAR_OPTIONS.map(y => <option key={y} value={String(y)}>{y}</option>)}
              </select>
              <span className="text-[10px] font-medium text-slate-500 whitespace-nowrap">To</span>
              <select
                value={filters.toMonth}
                onChange={e => handleFilterChange("toMonth", e.target.value)}
                className="h-7 rounded-xl border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
              >
                {MONTH_OPTIONS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
              <select
                value={filters.toMonthYear}
                onChange={e => handleFilterChange("toMonthYear", e.target.value)}
                className="h-7 rounded-xl border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
              >
                {YEAR_OPTIONS.map(y => <option key={y} value={String(y)}>{y}</option>)}
              </select>
            </>
          )}

          {/* Date to Date pickers */}
          {filters.period === "date_range" && (
            <>
              <span className="text-[10px] font-medium text-slate-500 whitespace-nowrap">From</span>
              <input
                type="date"
                value={filters.fromDate}
                onChange={e => handleFilterChange("fromDate", e.target.value)}
                className="h-7 rounded-xl border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
              />
              <span className="text-[10px] font-medium text-slate-500 whitespace-nowrap">To</span>
              <input
                type="date"
                value={filters.toDate}
                onChange={e => handleFilterChange("toDate", e.target.value)}
                className="h-7 rounded-xl border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
              />
            </>
          )}

          {/* Quarterly pickers */}
          {filters.period === "quarterly" && (
            <>
              <select
                value={filters.quarterYear}
                onChange={e => handleFilterChange("quarterYear", e.target.value)}
                className="h-7 rounded-xl border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
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
                      : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"}
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
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">

            {/* Chart toolbar */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-50 bg-slate-50/40">
              <div className="flex items-center gap-2">
                <BarChart2 className={`h-4 w-4 ${style.text}`} />
                <span className="text-sm font-semibold text-slate-800">
                  {kpiName} Uptime Trend
                </span>
                {!loading && transformedData.length > 0 && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                    {transformedData.length} data points
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadSvg}
                  disabled={loading || !transformedData.length}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="h-3 w-3" />
                  Export SVG
                </button>
                <button
                  onClick={() => setFullscreen(f => !f)}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 shadow-sm transition"
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
                    <div className={`h-9 w-9 animate-spin rounded-full border-[3px] border-slate-100 border-t-current ${style.text}`} />
                    <p className="text-sm text-slate-400 animate-pulse">Loading analytics data…</p>
                  </div>
                </div>
              ) : !transformedData.length ? (
                <div className="flex h-72 flex-col items-center justify-center gap-3">
                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100">
                    <BarChart2 className="h-7 w-7 text-slate-300" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-600">No Data Available</p>
                    <p className="text-xs text-slate-400 mt-1">
                      No uptime records found for the selected filters and period.
                    </p>
                  </div>
                </div>
              ) : (
                <div ref={chartRef} className="h-[320px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={transformedData}
                      margin={{ top: 22, right: 18, left: -8, bottom: 0 }}
                      barCategoryGap="10%"
                      barGap={1}
                    >
                      <defs>
                        {chartDates.map((date, i) => (
                          <linearGradient key={`grad-${i}`} id={`popGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.92} />
                            <stop offset="100%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.55} />
                          </linearGradient>
                        ))}
                      </defs>

                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />

                      <XAxis
                        dataKey="entity"
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        domain={yDomain}
                        ticks={yTicks}
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                        width={52}
                        tickFormatter={yTickFormatter}
                      />

                      <ReferenceLine
                        y={99.5}
                        stroke="#10b981"
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                        label={{ value: "99.5% target", position: "insideTopRight", fontSize: 10, fill: "#10b981" }}
                      />

                      <Tooltip
                        formatter={(val, name) => [`${Number(val).toFixed(2)}%`, name]}
                        contentStyle={{
                          borderRadius: "14px",
                          border: "none",
                          boxShadow: "0 10px_35px_rgba(15,23,42,0.14)",
                          fontSize: "12px",
                          padding: "10px 14px",
                          backgroundColor: "rgba(255,255,255,0.97)",
                        }}
                        cursor={{ fill: "rgba(148,163,184,0.07)" }}
                      />

                      <Legend
                        wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }}
                        iconType="circle"
                      />

                      {chartDates.map((date, i) => (
                        <Bar
                          key={date}
                          dataKey={date}
                          name={date}
                          fill={`url(#popGrad${i})`}
                          radius={[5, 5, 0, 0]}
                          maxBarSize={52}
                        >
  <LabelList
  dataKey={date}
  content={({ x, y, width, value }) => {
    if (value == null) return null;

    return (
      <text
        x={x + width / 2}
        y={y - 26}
        transform={`rotate(-90 ${x + width / 2} ${y - 26})`}
        textAnchor="end"
        dominantBaseline="middle"
        fontSize="10"
        fontWeight="700"
        fill="#475569"
      >
        {Number(value).toFixed(2)}
      </text>
    );
  }}
/>
                        </Bar>
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* ── Summary KPI cards ── */}
          {!loading && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">

              {/* Average */}
              <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/70 to-white p-4 shadow-sm hover:shadow-md transition">
                <p className="text-[10px] font-bold uppercase tracking-[0.20em] text-blue-400">Average</p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                  {Number(summary.avg || 0).toFixed(2)}%
                </p>
                <p className="mt-0.5 text-xs text-slate-400">Avg uptime</p>
              </div>

              {/* Highest */}
              <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/70 to-white p-4 shadow-sm hover:shadow-md transition">
                <p className="text-[10px] font-bold uppercase tracking-[0.20em] text-emerald-500">Highest</p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-700">
                  {Number(summary.highest || 0).toFixed(2)}%
                </p>
                <p className="mt-0.5 text-xs text-slate-400">Peak uptime</p>
              </div>

              {/* Lowest */}
              <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50/70 to-white p-4 shadow-sm hover:shadow-md transition">
                <p className="text-[10px] font-bold uppercase tracking-[0.20em] text-rose-400">Lowest</p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-rose-600">
                  {Number(summary.lowest || 0).toFixed(2)}%
                </p>
                <p className="mt-0.5 text-xs text-slate-400">Min uptime</p>
              </div>

              {/* Trend */}
              <div className={`rounded-2xl border p-4 shadow-sm hover:shadow-md transition ${trendBg}`}>
                <p className="text-[10px] font-bold uppercase tracking-[0.20em] text-slate-400">Trend</p>
                <div className={`mt-2 flex items-center gap-1.5 ${trendColor}`}>
                  <TrendIcon className="h-5 w-5 flex-shrink-0" />
                  <span className="text-xl font-bold tracking-tight">{trendText}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">Overall direction</p>
              </div>

              {/* Total Records */}
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50/70 to-white p-4 shadow-sm hover:shadow-md transition">
                <p className="text-[10px] font-bold uppercase tracking-[0.20em] text-slate-400">Records</p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                  {Number(summary.total || 0).toLocaleString()}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">Total data points</p>
              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

function KpiDashboard() {
  const [towerCards, setTowerCards] = useState([]);
  const [selectedCircle, setSelectedCircle] = useState("");
  const [selectedCmp, setSelectedCmp] = useState("");
  const [circleList, setCircleList] = useState([]);
  const [cmpList, setCmpList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCardMenu, setActiveCardMenu] = useState(null); // index of open three-dot menu
  const [analyticsPopup, setAnalyticsPopup] = useState(null); // { name, color }

  const menuRefs = useRef({});

  // Close three-dot menu on outside click
  useEffect(() => {
    const fn = (e) => {
      if (activeCardMenu === null) return;
      const el = menuRefs.current[activeCardMenu];
      if (el && !el.contains(e.target)) setActiveCardMenu(null);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [activeCardMenu]);

  // Fetch tower cards
  useEffect(() => {
    const fetchTower = async () => {
      try {
        setLoading(true);
        setError(null);
        const res  = await authFetch(buildApiUrl(`/api/tower-uptime?circle=${selectedCircle}&cmp=${selectedCmp}`));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setTowerCards(data);

        // Extract unique circle names from entities when no circle filter is active
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
      } catch (err) {
        console.error(err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchTower();
  }, [selectedCircle, selectedCmp]);

  // Fetch CMP list from dedicated endpoint whenever circle selection changes
  useEffect(() => {
    const fetchCmps = async () => {
      try {
        const params = new URLSearchParams({ circle: selectedCircle });
        const res    = await authFetch(buildApiUrl(`/api/tower-uptime/cmps?${params}`));
        const json   = await res.json();
        setCmpList(json.cmps || []);
      } catch (err) {
        console.error("CMP fetch error:", err);
        setCmpList([]);
      }
    };
    fetchCmps();
  }, [selectedCircle]);

  const openAnalytics = (card) => {
    setActiveCardMenu(null);
    setAnalyticsPopup({ name: card.name, color: card.color });
  };

  return (
    <div className="min-h-screen">

      {/* ── Page header ── */}
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Uptime Overview</h1>
            <p className="text-sm text-slate-500">Real-time uptime trend of all monitored tower systems.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedCircle}
            onChange={e => { setSelectedCircle(e.target.value); setSelectedCmp(""); }}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
          >
            <option value="">All Circles</option>
            {circleList.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={selectedCmp}
            onChange={e => setSelectedCmp(e.target.value)}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
          >
            <option value="">All CMP</option>

{cmpList.map(cmp => (
    <option key={cmp} value={cmp}>
        {cmp}
    </option>
))}
          </select>

          <button className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition">
            <CalendarDays className="h-4 w-4" />
            Last 7 Days
          </button>

          <button className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition">
            <Filter className="h-4 w-4" />
            Filter
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <strong>Error loading data:</strong> {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-slate-200 border-t-blue-500" />
            <p className="text-sm text-slate-400">Loading tower uptime data…</p>
          </div>
        </div>
      )}

      {/* ── KPI Cards ── */}
      {!loading && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {towerCards.map((card, index) => {
            const style = colorStyles[card.color] || colorStyles.blue;

            return (
              <div
                key={index}
                className={`relative rounded-[18px] border ${style.border} bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl`}
              >
                {/* Card header row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${style.bg}`}>
                      <Activity className={`h-4 w-4 ${style.text}`} />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900">{card.name}</h2>
                      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">UPTIME</p>
                    </div>
                  </div>

                  {/* Three-dot menu */}
                  <div
                    className="relative"
                    ref={el => menuRefs.current[index] = el}
                  >
                    <button
                      onClick={() => setActiveCardMenu(activeCardMenu === index ? null : index)}
                      className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                      title="Options"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>

                    {activeCardMenu === index && (
                      <div className="absolute right-0 top-9 z-50 min-w-[160px] rounded-2xl border border-slate-100 bg-white p-1.5 shadow-[0_10px_40px_rgba(15,23,42,0.14)]">
                        <button
                          onClick={() => openAnalytics(card)}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition"
                        >
                          <Eye className="h-4 w-4 text-blue-400 flex-shrink-0" />
                          View Analytics
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Stats row */}
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-lg font-semibold text-slate-900">{card.uptime}</p>
                  <div className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-1">
                    <TrendingUp className="h-3 w-3 text-green-600" />
                    <span className="text-xs font-semibold text-green-600">{card.increase}</span>
                  </div>
                </div>

                {/* Mini grouped bar chart – circle-wise or CMP-wise comparison */}
                <div className="mt-3">
                  <MiniGroupedChart
                    chartData={card.chartData || []}
                    circles={card.entities || card.circles || []}
                    groupBy={card.groupBy || "circle"}
                  />
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && towerCards.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100">
            <BarChart2 className="h-7 w-7 text-slate-300" />
          </div>
          <p className="text-slate-500 text-sm font-medium">No tower data available</p>
        </div>
      )}

      {/* Footer note */}
      <div className="mt-10 flex items-center justify-center gap-2 text-xs text-slate-400">
        <Activity className="h-3.5 w-3.5" />
        <p>Uptime percentage is calculated based on successful tower checks over the selected time period.</p>
      </div>

      {/* ── Analytics Popup ── */}
      {analyticsPopup && (
        <UptimeAnalyticsPopup
          kpiName={analyticsPopup.name}
          kpiColor={analyticsPopup.color}
          initialCircle={selectedCircle}
          initialCmp={selectedCmp}
          onClose={() => setAnalyticsPopup(null)}
        />
      )}

    </div>
  );
}

export default KpiDashboard;
