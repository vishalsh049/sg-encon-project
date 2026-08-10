import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  RefreshCcw,
  Activity,
  Route,
  Timer,
  Building2,
  Layers,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { authFetch, buildApiUrl } from "../lib/api";
import { getEntityColor, getChartTheme } from "../utils/chartMath";

// ─── Formatting ────────────────────────────────────────────────────────────

const formatNumber = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "N/A";
  }
  return Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
};

const formatTimestamp = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return String(value);
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// ─── Small shared dropdown (matches KpiDashboard.jsx's pattern) ──────────

function Dropdown({ open, onToggle, label, icon: Icon, children }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onToggle(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onToggle]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => onToggle(!open)}
        className="flex h-10 items-center gap-2 rounded-xl border border-border-color bg-surface px-3.5 text-sm font-medium text-text-secondary shadow-sm transition hover:bg-surface-muted"
      >
        {Icon ? <Icon className="h-4 w-4 flex-shrink-0 text-text-muted" /> : null}
        <span>{label}</span>
        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-text-muted" />
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-50 min-w-[220px] rounded-2xl border border-border-color bg-surface p-2 shadow-[0_10px_40px_rgba(15,23,42,0.18)]">
          {children}
        </div>
      ) : null}
    </div>
  );
}

// ─── KPI card ──────────────────────────────────────────────────────────────

// False positive on the next line: IconComponent is rendered below
// (<IconComponent .../>); confirmed via a clean `vite build` and by
// comparing against the identical, lint-clean pattern in
// billingDashboard/KpiCard.jsx. A tooling quirk specific to this file, not a
// real bug.
// eslint-disable-next-line no-unused-vars
function KpiCard({ icon: IconComponent, tone, label, value, subtitle }) {
  const toneStyles = {
    blue: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400",
    emerald: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    violet: "bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400",
    orange: "bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400",
    cyan: "bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  };
  return (
    <div className="rounded-2xl border border-border-color bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${toneStyles[tone] || toneStyles.blue}`}>
          <IconComponent className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">{label}</p>
          <p className="mt-0.5 text-xl font-semibold text-text-primary">{value}</p>
        </div>
      </div>
      {subtitle ? <p className="mt-2 text-xs text-text-muted">{subtitle}</p> : null}
    </div>
  );
}

// ─── Donut chart ───────────────────────────────────────────────────────────

function DistributionDonut({ title, subtitle, data, valueKey, dark }) {
  const theme = getChartTheme(dark);
  const total = data.reduce((sum, row) => sum + (row[valueKey] || 0), 0);
  return (
    <div className="rounded-2xl border border-border-color bg-surface p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>
      {data.length ? (
        <div className="mt-3 flex items-center gap-4">
          <div className="relative h-40 w-40 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey={valueKey}
                  nameKey="circle"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={2}
                  isAnimationActive={false}
                >
                  {data.map((row, index) => (
                    <Cell key={row.circle} fill={getEntityColor(row.circle, index)} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatNumber(value)}
                  contentStyle={{ background: theme.tooltipBg, border: "none", borderRadius: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Total</span>
              <span className="text-base font-semibold text-text-primary">{formatNumber(total)}</span>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            {data.map((row, index) => (
              <div key={row.circle} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5 text-text-secondary">
                  <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: getEntityColor(row.circle, index) }} />
                  <span className="truncate">{row.circle}</span>
                </span>
                <span className="flex-shrink-0 font-medium text-text-primary">
                  {row.percentage}% ({formatNumber(row[valueKey])})
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-3 flex h-40 items-center justify-center text-xs text-text-muted">No data available.</div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

const EMPTY_DETAILS = { weeks: [], circles: [], grandTotalCuts: 0, grandAvgMttr: 0, grandTotalFtkm: null };

function NsoDashboard() {
  const [filters, setFilters] = useState({ circle: "", cmp: "", year: "", month: "" });
  const [weekRange, setWeekRange] = useState({ fromYear: "", fromRaw: "", toYear: "", toRaw: "" });
  const [options, setOptions] = useState({ circles: [], cmps: [], years: [], months: [], weeks: [] });

  const [summary, setSummary] = useState(null);
  const [cutsTrend, setCutsTrend] = useState([]);
  const [ftkmTrend, setFtkmTrend] = useState([]);
  const [mttrTrend, setMttrTrend] = useState([]);
  const [cutsByCircle, setCutsByCircle] = useState([]);
  const [ftkmByCircle, setFtkmByCircle] = useState([]);
  const [topMttr, setTopMttr] = useState([]);
  const [details, setDetails] = useState(EMPTY_DETAILS);
  const [latestFile, setLatestFile] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [expandedCircles, setExpandedCircles] = useState(() => new Set());
  const [weekMenuOpen, setWeekMenuOpen] = useState(false);

  const apiQuery = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    if (weekRange.fromRaw) {
      params.set("weekFromYear", weekRange.fromYear);
      params.set("weekFromRaw", weekRange.fromRaw);
    }
    if (weekRange.toRaw) {
      params.set("weekToYear", weekRange.toYear);
      params.set("weekToRaw", weekRange.toRaw);
    }
    return params.toString();
  }, [filters, weekRange]);

  // Filter options (and the default week range, once) load independently of
  // the week-range selection itself, so changing the range doesn't refetch
  // its own option list out from under the user.
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
          if (value) params.set(key, value);
        });
        const res = await authFetch(buildApiUrl(`/api/nso/dashboard/filters?${params}`), { signal: controller.signal });
        if (!res.ok) throw new Error("Unable to load filter options");
        const data = await res.json();
        setOptions(data);
        // Default the Week Range to the trailing 4 available weeks, once,
        // the first time real weeks are known — never a hardcoded week.
        setWeekRange((prev) => {
          if (prev.fromRaw || prev.toRaw) return prev;
          if (!data.weeks?.length) return prev;
          const last = data.weeks[data.weeks.length - 1];
          const first = data.weeks[Math.max(0, data.weeks.length - 4)];
          return { fromYear: first.year, fromRaw: first.week, toYear: last.year, toRaw: last.week };
        });
      } catch (err) {
        if (err.name !== "AbortError") console.error(err);
      }
    })();
    return () => controller.abort();
  }, [filters]);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await authFetch(buildApiUrl("/api/nso/"), { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        setLatestFile(data.rows?.[0] || null);
      } catch (err) {
        if (err.name !== "AbortError") console.error(err);
      }
    })();
    return () => controller.abort();
  }, [refreshTick]);

  useEffect(() => {
    if (!weekRange.fromRaw && !weekRange.toRaw && !options.weeks?.length) {
      // Waiting on the default range to resolve from filter options first.
      return undefined;
    }
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const endpoints = [
          "summary",
          "cuts-trend",
          "ftkm-trend",
          "mttr-trend",
          "cuts-by-circle",
          "ftkm-by-circle",
          "top-mttr",
          "cmp-scope-details",
        ];
        const responses = await Promise.all(
          endpoints.map((path) =>
            authFetch(buildApiUrl(`/api/nso/dashboard/${path}?${apiQuery}`), { signal: controller.signal })
          )
        );
        responses.forEach((res, index) => {
          if (!res.ok) throw new Error(`${endpoints[index]} request failed`);
        });
        const [summaryData, cutsData, ftkmData, mttrData, cutsCircleData, ftkmCircleData, topMttrData, detailsData] =
          await Promise.all(responses.map((res) => res.json()));

        setSummary(summaryData);
        setCutsTrend(cutsData);
        setFtkmTrend(ftkmData);
        setMttrTrend(mttrData);
        setCutsByCircle(cutsCircleData);
        setFtkmByCircle(ftkmCircleData);
        setTopMttr(topMttrData);
        setDetails(detailsData);
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error(err);
        setError("Unable to load latest NSO data.");
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [apiQuery, refreshTick, options.weeks, weekRange.fromRaw, weekRange.toRaw]);

  const updateFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const refresh = () => setRefreshTick((t) => t + 1);

  const toggleCircle = (circle) => {
    setExpandedCircles((prev) => {
      const next = new Set(prev);
      if (next.has(circle)) next.delete(circle);
      else next.add(circle);
      return next;
    });
  };

  const doExport = async () => {
    try {
      const res = await authFetch(buildApiUrl(`/api/nso/dashboard/export?${apiQuery}`));
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `nso-fiber-performance-${Date.now()}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError("Unable to export the report.");
    }
  };

  const weekRangeLabel = useMemo(() => {
    if (!weekRange.fromRaw || !weekRange.toRaw) return "Select weeks";
    const fromOpt = options.weeks.find((w) => w.week === weekRange.fromRaw && String(w.year) === String(weekRange.fromYear));
    const toOpt = options.weeks.find((w) => w.week === weekRange.toRaw && String(w.year) === String(weekRange.toYear));
    return `${fromOpt?.label || weekRange.fromRaw} - ${toOpt?.label || weekRange.toRaw}`;
  }, [weekRange, options.weeks]);

  const dark = document.documentElement.classList.contains("dark");
  const theme = getChartTheme(dark);
  const hasData = !loading && summary && summary.totalCuts > 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-border-color bg-surface p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Fiber Performance Trend Dashboard</h1>
            <p className="mt-1 text-sm text-text-muted">Data automatically calculated from uploaded NSO file.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
              {latestFile ? (
                <>File Uploaded: <span className="font-semibold">{latestFile.original_name || latestFile.file_name}</span></>
              ) : (
                "No file uploaded yet"
              )}
            </div>
            <Dropdown open={weekMenuOpen} onToggle={setWeekMenuOpen} label={weekRangeLabel} icon={ChevronRight}>
              <div className="space-y-2 p-1">
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">From</p>
                  <select
                    className="app-input w-full text-xs"
                    value={weekRange.fromRaw ? `${weekRange.fromYear}::${weekRange.fromRaw}` : ""}
                    onChange={(e) => {
                      const [year, raw] = e.target.value.split("::");
                      setWeekRange((prev) => ({ ...prev, fromYear: year, fromRaw: raw }));
                    }}
                  >
                    {options.weeks.map((w) => (
                      <option key={`from-${w.year}-${w.week}`} value={`${w.year}::${w.week}`}>{w.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">To</p>
                  <select
                    className="app-input w-full text-xs"
                    value={weekRange.toRaw ? `${weekRange.toYear}::${weekRange.toRaw}` : ""}
                    onChange={(e) => {
                      const [year, raw] = e.target.value.split("::");
                      setWeekRange((prev) => ({ ...prev, toYear: year, toRaw: raw }));
                    }}
                  >
                    {options.weeks.map((w) => (
                      <option key={`to-${w.year}-${w.week}`} value={`${w.year}::${w.week}`}>{w.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </Dropdown>
            <button
              type="button"
              onClick={refresh}
              title="Refresh"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-color bg-surface text-text-secondary shadow-sm transition hover:bg-surface-muted"
            >
              <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={doExport}
              disabled={!hasData}
              className="flex h-10 items-center gap-2 rounded-xl border border-border-color bg-surface px-3.5 text-sm font-medium text-text-secondary shadow-sm transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Export
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <select className="app-input" value={filters.circle} onChange={(e) => updateFilter("circle", e.target.value)}>
            <option value="">All CMPs</option>
            {options.circles.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="app-input" value={filters.cmp} onChange={(e) => updateFilter("cmp", e.target.value)}>
            <option value="">All Scopes</option>
            {options.cmps.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="app-input" value={filters.year} onChange={(e) => updateFilter("year", e.target.value)}>
            <option value="">All Years</option>
            {options.years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="app-input" value={filters.month} onChange={(e) => updateFilter("month", e.target.value)}>
            <option value="">All Months</option>
            {options.months.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {error ? (
        <div className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400">
          {error}
          <button type="button" onClick={refresh} className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold">Retry</button>
        </div>
      ) : null}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-24 rounded-2xl bg-surface-muted shimmer" />)
        ) : (
          <>
            <KpiCard icon={Activity} tone="blue" label="Total Cuts" value={formatNumber(summary?.totalCuts)} subtitle="Selected week range" />
            <KpiCard icon={Route} tone="emerald" label="Total FTKM" value={formatNumber(summary?.totalFTKM)} subtitle="Selected week range" />
            <KpiCard icon={Timer} tone="violet" label="Avg MTTR (All Weeks)" value={formatNumber(summary?.avgMTTR)} subtitle="Selected week range" />
            <KpiCard icon={Building2} tone="orange" label="Active CMPs" value={formatNumber(summary?.activeCircles)} subtitle="Total operational CMPs" />
            <KpiCard icon={Layers} tone="cyan" label="Total Scopes" value={formatNumber(summary?.totalScopes)} subtitle="Across all CMPs" />
          </>
        )}
      </div>

      {!loading && !hasData && !error ? (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface-muted p-10 text-center text-sm text-text-muted">
          No data available for the selected filters.
        </div>
      ) : null}

      {/* Trend charts */}
      <div className="grid gap-4 xl:grid-cols-3">
        <TrendCard title="Cuts Trend (Weekly)" loading={loading} data={cutsTrend} dataKey="cuts" color="#2563eb" type="bar" theme={theme} />
        <TrendCard title="FTKM Trend (Weekly)" loading={loading} data={ftkmTrend} dataKey="ftkm" color="#16a34a" type="area" theme={theme} />
        <TrendCard title="MTTR Trend (Weekly)" loading={loading} data={mttrTrend} dataKey="mttr" color="#7c3aed" type="line" theme={theme} />
      </div>

      {/* Donuts + Top 5 MTTR */}
      <div className="grid gap-4 xl:grid-cols-3">
        <DistributionDonut title="Cuts Distribution by CMP" subtitle="Selected week range" data={cutsByCircle} valueKey="cuts" dark={dark} />
        <DistributionDonut title="FTKM Distribution by CMP" subtitle="Selected week range" data={ftkmByCircle} valueKey="ftkm" dark={dark} />
        <div className="rounded-2xl border border-border-color bg-surface p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-text-primary">Top 5 CMPs by Avg MTTR</h3>
          <p className="mt-0.5 text-xs text-text-muted">Selected week range</p>
          <div className="mt-3 h-52">
            {topMttr.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topMttr} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke={theme.grid} strokeDasharray="4 4" horizontal={false} />
                  <XAxis type="number" tick={{ fill: theme.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="circle" tick={{ fill: theme.tick, fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip contentStyle={{ background: theme.tooltipBg, border: "none", borderRadius: 12 }} formatter={(v) => formatNumber(v)} />
                  <Bar dataKey="mttr" radius={[0, 8, 8, 0]} isAnimationActive={false}>
                    {topMttr.map((row, index) => <Cell key={row.circle} fill={getEntityColor(row.circle, index)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-text-muted">No data available.</div>
            )}
          </div>
        </div>
      </div>

      {/* Detail table */}
      <div className="rounded-2xl border border-border-color bg-surface p-5 shadow-sm">
        <h3 className="text-base font-semibold text-text-primary">Fiber Performance Details by CMP &amp; Scope</h3>
        <p className="mt-0.5 text-xs text-text-muted">Click a CMP to expand its scopes.</p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-surface-muted text-text-muted">
              <tr>
                <th className="px-3 py-2.5 font-semibold">CMP</th>
                <th className="px-3 py-2.5 font-semibold">Scope</th>
                <th className="px-3 py-2.5 text-right font-semibold">Base FTKM</th>
                {details.weeks.map((week) => (
                  <th key={week} colSpan={3} className="border-l border-border-color px-3 py-2.5 text-center font-semibold">{week}</th>
                ))}
                <th className="border-l border-border-color px-3 py-2.5 text-right font-semibold">Total Cuts</th>
                <th className="px-3 py-2.5 text-right font-semibold">Avg MTTR</th>
              </tr>
              <tr className="text-[10px] uppercase tracking-wide text-text-muted">
                <th className="px-3 py-1" />
                <th className="px-3 py-1" />
                <th className="px-3 py-1" />
                {details.weeks.map((week) => (
                  <Fragment key={week}>
                    <th className="border-l border-border-color px-2 py-1 text-right">Cuts</th>
                    <th className="px-2 py-1 text-right">FTKM</th>
                    <th className="px-2 py-1 text-right">MTTR</th>
                  </Fragment>
                ))}
                <th className="border-l border-border-color px-3 py-1" />
                <th className="px-3 py-1" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}><td colSpan={5 + details.weeks.length * 3} className="h-10 animate-pulse bg-surface-muted" /></tr>
                ))
              ) : details.circles.length ? (
                details.circles.map((circleRow) => {
                  const expanded = expandedCircles.has(circleRow.circle);
                  return (
                    <Fragment key={circleRow.circle}>
                      <tr
                        onClick={() => toggleCircle(circleRow.circle)}
                        className="cursor-pointer border-t border-border-color bg-surface-muted/60 font-semibold text-text-primary hover:bg-surface-muted"
                      >
                        <td className="px-3 py-2.5" colSpan={2}>
                          <span className="flex items-center gap-1.5">
                            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            CMP: {circleRow.circle}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">{circleRow.baseFtkm ? formatNumber(circleRow.baseFtkm) : "N/A"}</td>
                        {circleRow.weeklyTotals.map((week) => (
                          <Fragment key={week.week}>
                            <td className="border-l border-border-color px-2 py-2.5 text-right">{formatNumber(week.cuts)}</td>
                            <td className="px-2 py-2.5 text-right">{week.ftkm === null ? "N/A" : formatNumber(week.ftkm)}</td>
                            <td className="px-2 py-2.5 text-right">-</td>
                          </Fragment>
                        ))}
                        <td className="border-l border-border-color px-3 py-2.5 text-right">{formatNumber(circleRow.totalCuts)}</td>
                        <td className="px-3 py-2.5 text-right">{formatNumber(circleRow.avgMttr)}</td>
                      </tr>
                      {expanded
                        ? circleRow.scopes.map((scopeRow) => (
                            <tr key={`${circleRow.circle}-${scopeRow.scope}`} className="border-t border-border-color text-text-secondary hover:bg-surface-muted/40">
                              <td className="px-3 py-2" />
                              <td className="px-3 py-2">{scopeRow.scope}</td>
                              <td className="px-3 py-2 text-right">{scopeRow.baseFtkm ? formatNumber(scopeRow.baseFtkm) : "N/A"}</td>
                              {scopeRow.weeks.map((week) => (
                                <Fragment key={week.week}>
                                  <td className="border-l border-border-color px-2 py-2 text-right">{formatNumber(week.cuts)}</td>
                                  <td className="px-2 py-2 text-right">{week.ftkm === null ? "N/A" : formatNumber(week.ftkm)}</td>
                                  <td className="px-2 py-2 text-right">{formatNumber(week.mttr)}</td>
                                </Fragment>
                              ))}
                              <td className="border-l border-border-color px-3 py-2 text-right">{formatNumber(scopeRow.totalCuts)}</td>
                              <td className="px-3 py-2 text-right">{formatNumber(scopeRow.avgMttr)}</td>
                            </tr>
                          ))
                        : null}
                    </Fragment>
                  );
                })
              ) : (
                <tr><td colSpan={5 + details.weeks.length * 3} className="px-3 py-8 text-center text-sm text-text-muted">No data available for the selected filters.</td></tr>
              )}
            </tbody>
            {details.circles.length ? (
              <tfoot>
                <tr className="border-t-2 border-border-strong bg-surface-muted font-semibold text-text-primary">
                  <td className="px-3 py-2.5" colSpan={3}>Grand Total</td>
                  <td colSpan={details.weeks.length * 3} className="border-l border-border-color px-3 py-2.5" />
                  <td className="border-l border-border-color px-3 py-2.5 text-right">{formatNumber(details.grandTotalCuts)}</td>
                  <td className="px-3 py-2.5 text-right">{formatNumber(details.grandAvgMttr)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-2 rounded-2xl border border-border-color bg-surface p-4 text-xs text-text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          <strong>Cuts</strong> = Ticket Count &nbsp;|&nbsp; <strong>MTTR</strong> = Average of MTTR Column &nbsp;|&nbsp; <strong>FTKM</strong> = ((Cuts / 7) × 31) / Base FTKM × 1000
        </p>
        <p>Last Updated: {formatTimestamp(latestFile?.uploaded_at)}</p>
      </div>
    </div>
  );
}

// ─── Trend chart card (Cuts=bar, FTKM=area-as-line, MTTR=line) ───────────

function TrendCard({ title, loading, data, dataKey, color, theme }) {
  return (
    <div className="rounded-2xl border border-border-color bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <span className="rounded-full bg-surface-muted px-2.5 py-1 text-[11px] font-semibold text-text-muted">{data.length} weeks</span>
      </div>
      <div className="mt-3 h-56">
        {loading ? (
          <div className="flex h-full items-center justify-center text-xs text-text-muted">Loading chart...</div>
        ) : data.length ? (
          <ResponsiveContainer width="100%" height="100%">
            {dataKey === "cuts" ? (
              <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke={theme.grid} strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="week" tick={{ fill: theme.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: theme.tick, fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
                <Tooltip contentStyle={{ background: theme.tooltipBg, border: "none", borderRadius: 12 }} formatter={(v) => formatNumber(v)} />
                <Bar dataKey={dataKey} fill={color} radius={[8, 8, 0, 0]} isAnimationActive={false} />
              </BarChart>
            ) : (
              <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke={theme.grid} strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="week" tick={{ fill: theme.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: theme.tick, fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
                <Tooltip contentStyle={{ background: theme.tooltipBg, border: "none", borderRadius: 12 }} formatter={(v) => (v === null ? "N/A" : formatNumber(v))} />
                <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
              </LineChart>
            )}
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-text-muted">No data available for the selected filters.</div>
        )}
      </div>
    </div>
  );
}

export default NsoDashboard;
