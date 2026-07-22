import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  Activity,
  AlertTriangle,
  AreaChart as AreaChartIcon,
  BarChart3,
  ChevronDown,
  LineChart as LineChartIcon,
  Loader2,
  Minus,
  RefreshCcw,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { buildApiUrl } from "../../lib/api";
import { calcYAxis, getChartTheme, getLabelStride } from "../../utils/chartMath";
import { ChartTooltip } from "./Tooltip";
import { createValueLabel } from "./ValueLabel";
import { useIsDarkMode } from "../../hooks/useIsDarkMode";

// Fixed legend/series order — matches the Circle filter dropdown order so the
// chart, legend and filter checkboxes always agree on circle ordering.
const CIRCLE_ORDER = ["Delhi", "Haryana", "Punjab", "Uttar Pradesh (East)"];

// Categorical slots 1-4 (blue / orange / aqua / yellow) from the validated
// enterprise palette — CVD-safe in fixed order for adjacent-series comparison.
const CIRCLE_COLORS = {
  light: { Delhi: "#2a78d6", Haryana: "#eb6834", Punjab: "#1baf7a", "Uttar Pradesh (East)": "#eda100" },
  dark: { Delhi: "#3987e5", Haryana: "#d95926", Punjab: "#199e70", "Uttar Pradesh (East)": "#c98500" },
};
const FALLBACK_COLORS = ["#8b5cf6", "#06b6d4", "#f97316", "#64748b"];

const TARGET_UPTIME = 100;

const PERIOD_TABS = [
  { key: "last7", label: "Last 7 Days" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
];

const CHART_TYPES = [
  { key: "bar", label: "Bar Chart", icon: BarChart3 },
  { key: "line", label: "Line Chart", icon: LineChartIcon },
  { key: "area", label: "Area Chart", icon: AreaChartIcon },
];

function getCircleColor(name, index, dark) {
  return CIRCLE_COLORS[dark ? "dark" : "light"][name] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatPeriodLabel(rawPeriod, type) {
  if (type === "yearly") return String(rawPeriod ?? "");
  const d = new Date(rawPeriod);
  if (Number.isNaN(d.valueOf())) return String(rawPeriod ?? "");
  if (type === "monthly") return MONTH_SHORT[d.getMonth()] || String(rawPeriod);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function average(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function SummaryTile(props) {
  const Icon = props.Icon;
  const { label, value, sub, tone } = props;
  return (
    <div className="rounded-xl border border-white/40 bg-surface/60 p-3 shadow-sm backdrop-blur-sm transition hover:bg-surface/90">
      <div className="flex items-center gap-1.5 text-text-muted">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[10px] font-bold uppercase tracking-[0.14em]">{label}</span>
      </div>
      <p className={`mt-1 truncate text-base font-semibold ${tone || "text-text-primary"}`}>{value}</p>
      {sub ? <p className="text-[11px] text-text-muted">{sub}</p> : null}
    </div>
  );
}

export default function UptimeTrendCard({ circle = "", cmp = "" }) {
  const dark = useIsDarkMode();
  const [period, setPeriod] = useState("last7");
  const [chartType, setChartType] = useState("bar");
  const [chartMenuOpen, setChartMenuOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | success | error
  const [errorMessage, setErrorMessage] = useState("");
  const [retryTick, setRetryTick] = useState(0);
  const [isCompactWidth, setIsCompactWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 640 : false
  );
  const chartMenuRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleResize = () => setIsCompactWidth(window.innerWidth < 640);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!chartMenuOpen) return undefined;
    const onOutside = (e) => {
      if (chartMenuRef.current && !chartMenuRef.current.contains(e.target)) {
        setChartMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [chartMenuOpen]);

  const requestSeq = useRef(0);
  // Response cache keyed by period+filters — switching a filter back to a
  // combination already fetched renders instantly with no network round-trip.
  // Cleared entry-by-entry on error retry so stale failures never stick.
  const cacheRef = useRef(new Map());

  useEffect(() => {
    const cacheKey = `${period}|${circle}|${cmp}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setRows(cached);
      setStatus("success");
      setErrorMessage("");
      return undefined;
    }

    const seq = ++requestSeq.current;
    const controller = new AbortController();
    setStatus("loading");
    setErrorMessage("");

    axios
      .get(buildApiUrl("/api/dashboard/uptime-trend"), {
        params: { type: period, circle, cmp },
        signal: controller.signal,
      })
      .then((res) => {
        if (seq !== requestSeq.current) return;
        const nextRows = Array.isArray(res.data?.rows) ? res.data.rows : [];
        cacheRef.current.set(cacheKey, nextRows);
        setRows(nextRows);
        setStatus("success");
      })
      .catch((err) => {
        if (axios.isCancel(err) || seq !== requestSeq.current) return;
        console.error("Uptime trend fetch error:", err);
        setRows([]);
        setStatus("error");
        setErrorMessage(err?.response?.data?.message || "Failed to load uptime trend data.");
      });

    return () => controller.abort();
  }, [period, circle, cmp, retryTick]);

  const handleRetry = () => {
    cacheRef.current.delete(`${period}|${circle}|${cmp}`);
    setRetryTick((t) => t + 1);
  };

  const { chartData, entities } = useMemo(() => {
    if (!rows.length) return { chartData: [], entities: [] };

    const periodOrder = [];
    const periodMap = new Map();
    const circleSet = new Set();

    rows.forEach((row) => {
      const periodKey = String(row.period ?? "");
      if (!periodMap.has(periodKey)) {
        periodMap.set(periodKey, { date: formatPeriodLabel(row.period, period) });
        periodOrder.push(periodKey);
      }
      const circleName = String(row.circle || "").trim();
      if (!circleName) return;
      circleSet.add(circleName);
      periodMap.get(periodKey)[circleName] = Number(row.uptime);
    });

    const orderedEntities = [
      ...CIRCLE_ORDER.filter((c) => circleSet.has(c)),
      ...Array.from(circleSet).filter((c) => !CIRCLE_ORDER.includes(c)).sort(),
    ];

    return { chartData: periodOrder.map((k) => periodMap.get(k)), entities: orderedEntities };
  }, [rows, period]);

  const summary = useMemo(() => {
    if (!chartData.length || !entities.length) return null;

    const allValues = [];
    const circleAverages = entities.map((e) => {
      const vals = chartData
        .map((row) => row[e])
        .filter((v) => typeof v === "number" && Number.isFinite(v));
      allValues.push(...vals);
      return { circle: e, avg: average(vals) };
    }).filter((c) => c.avg != null);

    if (!allValues.length || !circleAverages.length) return null;

    const overallAvg = average(allValues);
    const best = circleAverages.reduce((a, b) => (b.avg > a.avg ? b : a));
    const worst = circleAverages.reduce((a, b) => (b.avg < a.avg ? b : a));

    const periodAverages = chartData
      .map((row) => average(entities.map((e) => row[e]).filter((v) => typeof v === "number" && Number.isFinite(v))))
      .filter((v) => v != null);

    const latest = periodAverages.length ? periodAverages[periodAverages.length - 1] : null;
    const prev = periodAverages.length > 1 ? periodAverages[periodAverages.length - 2] : null;
    const delta = latest != null && prev != null ? latest - prev : null;

    return { overallAvg, best, worst, delta };
  }, [chartData, entities]);

  const theme = getChartTheme(dark);
  const stride = getLabelStride(chartData.length, "full");

  const allVals = useMemo(
    () => chartData.flatMap((row) => entities.map((e) => Number(row[e])).filter((v) => v > 0)),
    [chartData, entities]
  );
  const { domain, ticks, tickFormatter } = useMemo(() => {
    if (!allVals.length) return { domain: [90, 100], ticks: undefined, tickFormatter: (v) => `${v}%` };
    return calcYAxis(allVals);
  }, [allVals]);

  // Grouped bars need horizontal room per category; lines/areas need less.
  const perPointWidth =
    chartType === "bar"
      ? Math.max(64, entities.length * 16 + 28)
      : period === "monthly"
      ? 52
      : 60;
  const chartMinWidth = Math.max(560, chartData.length * perPointWidth);

  // Rotate bar value labels when the group density would collide horizontally.
  const rotateBarLabels = chartData.length * Math.max(entities.length, 1) > 16;

  const trendUp = summary?.delta != null && summary.delta > 0.01;
  const trendDown = summary?.delta != null && summary.delta < -0.01;
  const TrendIcon = trendUp ? TrendingUp : trendDown ? TrendingDown : Minus;
  const trendTone = trendUp
    ? "text-emerald-600 dark:text-emerald-400"
    : trendDown
    ? "text-rose-600 dark:text-rose-400"
    : "text-text-muted";

  const activeChartType = CHART_TYPES.find((c) => c.key === chartType) || CHART_TYPES[0];
  const ActiveChartIcon = activeChartType.icon;

  const commonAxes = (
    <>
      <CartesianGrid strokeDasharray="2 2" stroke={theme.grid} vertical={false} />
      <XAxis
        dataKey="date"
        tick={{ fontSize: isCompactWidth ? 10 : 11, fill: theme.tick }}
        axisLine={false}
        tickLine={false}
        interval="preserveStartEnd"
      />
      <YAxis
        domain={domain}
        ticks={ticks}
        tick={{ fontSize: isCompactWidth ? 10 : 11, fill: theme.tickDim }}
        axisLine={false}
        tickLine={false}
        width={40}
        tickFormatter={tickFormatter}
      />
      <ReferenceLine y={TARGET_UPTIME} stroke="#10b981" strokeDasharray="4 4" strokeWidth={1.5} />
    </>
  );

  const chartMargin = { top: rotateBarLabels && chartType === "bar" ? 34 : 16, right: 16, left: -8, bottom: 0 };

  const renderChart = () => {
    if (chartType === "bar") {
      return (
        <BarChart data={chartData} margin={chartMargin} barCategoryGap="22%" barGap={2}>
          {commonAxes}
          <Tooltip
            content={<ChartTooltip chartData={chartData} />}
            cursor={{ fill: dark ? "rgba(148,163,184,0.08)" : "rgba(100,116,139,0.08)" }}
          />
          {entities.map((e, i) => (
            <Bar
              key={e}
              dataKey={e}
              name={e}
              fill={getCircleColor(e, i, dark)}
              radius={[3, 3, 0, 0]}
              maxBarSize={28}
              isAnimationActive
              animationDuration={600}
              animationEasing="ease-out"
            >
              <LabelList
                dataKey={e}
                content={createValueLabel({ mode: "bar", seriesIndex: i, stride, variant: "full", dark, rotate: rotateBarLabels })}
              />
            </Bar>
          ))}
        </BarChart>
      );
    }

    if (chartType === "area") {
      return (
        <AreaChart data={chartData} margin={chartMargin}>
          <defs>
            {entities.map((e, i) => (
              <linearGradient key={e} id={`uptimeArea${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={getCircleColor(e, i, dark)} stopOpacity={0.28} />
                <stop offset="100%" stopColor={getCircleColor(e, i, dark)} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          {commonAxes}
          <Tooltip
            content={<ChartTooltip chartData={chartData} />}
            cursor={{ stroke: theme.tickDim, strokeWidth: 1, strokeDasharray: "3 3" }}
          />
          {entities.map((e, i) => (
            <Area
              key={e}
              type="monotone"
              dataKey={e}
              name={e}
              stroke={getCircleColor(e, i, dark)}
              strokeWidth={2.25}
              fill={`url(#uptimeArea${i})`}
              dot={{ r: 2.5 }}
              activeDot={{ r: 5 }}
              connectNulls
              isAnimationActive
              animationDuration={600}
              animationEasing="ease-out"
            >
              <LabelList
                dataKey={e}
                content={createValueLabel({ mode: "point", seriesIndex: i, stride, variant: "full", dark })}
              />
            </Area>
          ))}
        </AreaChart>
      );
    }

    return (
      <LineChart data={chartData} margin={chartMargin}>
        {commonAxes}
        <Tooltip
          content={<ChartTooltip chartData={chartData} />}
          cursor={{ stroke: theme.tickDim, strokeWidth: 1, strokeDasharray: "3 3" }}
        />
        {entities.map((e, i) => (
          <Line
            key={e}
            type="monotone"
            dataKey={e}
            name={e}
            stroke={getCircleColor(e, i, dark)}
            strokeWidth={2.25}
            dot={{ r: 2.5 }}
            activeDot={{ r: 5 }}
            connectNulls
            isAnimationActive
            animationDuration={600}
            animationEasing="ease-out"
          >
            <LabelList
              dataKey={e}
              content={createValueLabel({ mode: "point", seriesIndex: i, stride, variant: "full", dark })}
            />
          </Line>
        ))}
      </LineChart>
    );
  };

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/40 bg-surface/70 p-5 shadow-[0_10px_40px_rgba(0,0,0,0.08)] backdrop-blur-md">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="flex items-center gap-2 text-md font-semibold text-text-primary">
            <Activity size={18} />
            Uptime Trend
          </h4>
          <p className="mt-0.5 text-xs text-text-muted">Circle-wise site availability over time</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* Chart type dropdown */}
          <div className="relative" ref={chartMenuRef}>
            <button
              onClick={() => setChartMenuOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-border-color bg-surface px-3 py-2 text-xs font-semibold text-text-secondary shadow-sm transition hover:bg-surface-muted sm:w-auto sm:py-1.5"
            >
              <span className="flex items-center gap-1.5">
                <ActiveChartIcon className="h-3.5 w-3.5" />
                {activeChartType.label}
              </span>
              <ChevronDown className="h-3 w-3 text-text-muted" />
            </button>
            {chartMenuOpen && (
              <div className="absolute right-0 top-9 z-50 min-w-[150px] rounded-xl border border-border-color bg-surface p-1 shadow-[0_10px_40px_rgba(15,23,42,0.14)]">
                {CHART_TYPES.map((opt) => {
                  const OptIcon = opt.icon;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => { setChartType(opt.key); setChartMenuOpen(false); }}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs font-medium transition ${
                        chartType === opt.key
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
                          : "text-text-secondary hover:bg-surface-muted"
                      }`}
                    >
                      <OptIcon className="h-3.5 w-3.5" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Period tabs */}
          <div className="grid w-full grid-cols-3 gap-1 rounded-xl bg-surface-muted p-1 shadow-inner sm:w-auto sm:flex sm:items-center sm:gap-0">
            {PERIOD_TABS.map((item) => (
              <button
                key={item.key}
                onClick={() => setPeriod(item.key)}
                className={`min-w-0 rounded-lg px-3 py-2 text-[11px] font-semibold transition-all duration-300 sm:px-4 sm:py-1.5 sm:text-xs ${
                  period === item.key
                    ? "scale-105 bg-surface text-blue-600 shadow-md dark:text-blue-400"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary strip */}
      {status === "success" && summary && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SummaryTile
            Icon={Activity}
            label="Overall Avg"
            value={`${summary.overallAvg.toFixed(2)}%`}
            sub={
              summary.delta != null ? (
                <span className={`inline-flex items-center gap-1 ${trendTone}`}>
                  <TrendIcon className="h-3 w-3" />
                  {`${summary.delta >= 0 ? "+" : ""}${summary.delta.toFixed(2)}% vs prev`}
                </span>
              ) : (
                "No prior period"
              )
            }
          />
          <SummaryTile
            Icon={Trophy}
            label="Best Circle"
            value={summary.best.circle}
            sub={`${summary.best.avg.toFixed(2)}%`}
            tone="text-emerald-600 dark:text-emerald-400"
          />
          <SummaryTile
            Icon={TrendingDown}
            label="Lowest Circle"
            value={summary.worst.circle}
            sub={`${summary.worst.avg.toFixed(2)}%`}
            tone="text-amber-600 dark:text-amber-400"
          />
          <SummaryTile
            Icon={Target}
            label="Target Uptime"
            value={`${TARGET_UPTIME}%`}
            sub={
              summary.overallAvg >= TARGET_UPTIME
                ? "Meeting target"
                : `${(TARGET_UPTIME - summary.overallAvg).toFixed(2)}% below`
            }
            tone={summary.overallAvg >= TARGET_UPTIME ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}
          />
        </div>
      )}

      {/* Legend */}
      {status === "success" && entities.length > 0 && (
        <div className="mb-1 flex flex-wrap items-center gap-x-1 gap-y-1 px-1">
          {entities.map((e, i) => (
            <div key={e} className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium">
              <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: getCircleColor(e, i, dark) }} />
              <span className="text-text-secondary">{e}</span>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium text-text-muted">
            <span className="h-0 w-3.5 border-t-2 border-dashed border-emerald-500" />
            Target {TARGET_UPTIME}%
          </div>
        </div>
      )}

      {/* Chart / states */}
      <div className="flex-1">
        {status === "loading" && (
          <div className="flex h-[300px] animate-pulse flex-col items-center justify-center gap-3 rounded-xl bg-surface-muted sm:h-[320px]">
            <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
            <p className="text-xs text-text-muted">Loading uptime trend…</p>
          </div>
        )}

        {status === "error" && (
          <div className="flex h-[300px] flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 text-center dark:border-red-500/20 dark:bg-red-500/10 sm:h-[320px]">
            <AlertTriangle className="h-6 w-6 text-red-500 dark:text-red-400" />
            <p className="text-sm font-medium text-red-700 dark:text-red-400">{errorMessage}</p>
            <button
              onClick={handleRetry}
              className="app-button-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs"
            >
              <RefreshCcw size={13} />
              Retry
            </button>
          </div>
        )}

        {status === "success" && chartData.length === 0 && (
          <div className="flex h-[300px] flex-col items-center justify-center gap-2 rounded-xl bg-surface-muted sm:h-[320px]">
            <Activity className="h-7 w-7 text-text-muted" />
            <p className="text-sm font-medium text-text-secondary">No uptime data available</p>
            <p className="text-xs text-text-muted">Try a different period or clear the circle/CMP filters.</p>
          </div>
        )}

        {status === "success" && chartData.length > 0 && (
          <div className="overflow-x-auto overflow-y-hidden pb-1">
            <div style={{ minWidth: chartMinWidth }} className="h-[260px] w-full sm:h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                {renderChart()}
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
