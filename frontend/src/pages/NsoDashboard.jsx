import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Download,
  Layers,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Zap,
  FileText,
  Settings,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { authFetch, buildApiUrl } from "../lib/api";

const sections = [
  { id: "overview", label: "Dashboard" },
  { id: "circle-ranking", label: "Circle Performance" },
  { id: "cmp-summary", label: "CMP Performance" },
  { id: "cuts-trend", label: "Weekly Trend" },
  { id: "mttr-trend", label: "Monthly Trend" },
  { id: "weekly-details", label: "Yearly Trend" },
  { id: "reports", label: "Reports" },
  { id: "upload", label: "Data Upload" },
  { id: "settings", label: "Settings" },
];

const statusStyles = {
  Good: "bg-emerald-500/10 text-emerald-600",
  Warning: "bg-amber-500/10 text-amber-600",
  Critical: "bg-rose-500/10 text-rose-600",
};

const heatmapColor = (value) => {
  if (value >= 6) return "bg-rose-500/15 text-rose-700";
  if (value >= 3) return "bg-amber-400/15 text-amber-700";
  if (value > 0) return "bg-emerald-500/15 text-emerald-700";
  return "bg-slate-700/10 text-slate-500";
};

const formatNumber = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return Number(value).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });
};

const formatChange = (value) => {
  if (value === null || value === undefined) return "0%";
  const sign = value > 0 ? "+" : "";
  return `${sign}${Number(value).toFixed(2)}%`;
};

function NsoDashboard() {
  const [filters, setFilters] = useState({
    circle: "",
    cmp: "",
    year: "",
    month: "",
    week: "",
  });
  const [options, setOptions] = useState({
    circles: [],
    cmps: [],
    years: [],
    months: [],
    weeks: [],
  });
  const [summary, setSummary] = useState(null);
  const [circleRanking, setCircleRanking] = useState([]);
  const [cutsTrend, setCutsTrend] = useState([]);
  const [mttrTrend, setMttrTrend] = useState([]);
  const [cmpSummary, setCmpSummary] = useState([]);
  const [heatmap, setHeatmap] = useState({ weeks: [], rows: [] });
  const [weeklyDetails, setWeeklyDetails] = useState({ weeks: [], rows: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSection, setActiveSection] = useState("overview");
  const [expandedCmps, setExpandedCmps] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);

  const pageSize = 8;

  const apiQuery = useMemo(() => {
    const searchParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) searchParams.set(key, value);
    });
    return searchParams.toString();
  }, [filters]);

  const cmpPageCount = Math.max(1, Math.ceil(cmpSummary.length / pageSize));
  const pagedCmpSummary = cmpSummary.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const sectionHash = useMemo(
    () => ({
      overview: "overview",
      "circle-ranking": "circle-ranking",
      "cmp-summary": "cmp-summary",
      "cuts-trend": "cuts-trend",
      "mttr-trend": "mttr-trend",
      "weekly-details": "weekly-details",
      reports: "reports",
      upload: "upload",
      settings: "settings",
    }),
    []
  );

  useEffect(() => {
    const loadFilters = async () => {
      try {
        const res = await authFetch(buildApiUrl(`/api/nso/dashboard/filters?${apiQuery}`));
        if (!res.ok) throw new Error("Unable to load filter options");
        const data = await res.json();
        setOptions(data);
      } catch (err) {
        console.error(err);
        setError("Unable to load filter options");
      }
    };

    loadFilters();
  }, [apiQuery]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [summaryRes, circleRes, cutsRes, mttrRes, cmpRes, heatmapRes, weeklyRes] =
          await Promise.all([
            authFetch(buildApiUrl(`/api/nso/dashboard/summary?${apiQuery}`)),
            authFetch(buildApiUrl(`/api/nso/dashboard/circle-ranking?${apiQuery}`)),
            authFetch(buildApiUrl(`/api/nso/dashboard/cuts-trend?${apiQuery}`)),
            authFetch(buildApiUrl(`/api/nso/dashboard/mttr-trend?${apiQuery}`)),
            authFetch(buildApiUrl(`/api/nso/dashboard/cmp-summary?${apiQuery}`)),
            authFetch(buildApiUrl(`/api/nso/dashboard/heatmap?${apiQuery}`)),
            authFetch(buildApiUrl(`/api/nso/dashboard/cmp-weekly?${apiQuery}`)),
          ]);

        if (!summaryRes.ok) throw new Error("Summary fetch failed");
        if (!circleRes.ok) throw new Error("Circle ranking fetch failed");

        const summaryData = await summaryRes.json();
        const circleData = await circleRes.json();
        const cutsData = await cutsRes.json();
        const mttrData = await mttrRes.json();
        const cmpData = await cmpRes.json();
        const heatmapData = await heatmapRes.json();
        const weeklyData = await weeklyRes.json();

        setSummary(summaryData);
        setCircleRanking(circleData);
        setCutsTrend(cutsData);
        setMttrTrend(mttrData);
        setCmpSummary(cmpData);
        setHeatmap(heatmapData);
        setWeeklyDetails(weeklyData);
        setCurrentPage(1);
      } catch (err) {
        console.error(err);
        setError("Unable to load dashboard data. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [apiQuery]);

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const doDownload = async () => {
    try {
      const res = await authFetch(buildApiUrl(`/api/nso/dashboard/export?${apiQuery}`));
      if (!res.ok) {
        throw new Error("Report download failed");
      }
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
      setError("Unable to download report");
    }
  };

  const toggleExpandCmp = (cmp) => {
    setExpandedCmps((current) =>
      current.includes(cmp)
        ? current.filter((item) => item !== cmp)
        : [...current, cmp]
    );
  };

  const onSectionClick = (sectionId) => {
    setActiveSection(sectionId);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const cardData = useMemo(() => {
    if (!summary) return [];
    return [
      {
        title: "Total Cuts",
        value: summary.totalCuts,
        previous: summary.previousCuts,
        change: summary.cutsChangePct,
      },
      {
        title: "Total FTKM",
        value: summary.totalFTKM,
        previous: summary.previousFTKM,
        change: summary.ftkmChangePct,
      },
      {
        title: "Average MTTR",
        value: summary.avgMTTR,
        previous: summary.previousMTTR,
        change: summary.mttrChangePct,
      },
      {
        title: "Active CMP",
        value: summary.activeCMP,
        previous: null,
        change: null,
      },
    ];
  }, [summary]);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[260px_1fr]">
        <aside className="sticky top-4 rounded-[32px] border border-slate-800/40 bg-slate-950/95 p-6 shadow-xl shadow-slate-900/5 text-slate-100">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-sky-500/15 text-sky-300">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.28em] text-slate-400">
                NSO Fiber Dashboard
              </p>
              <h2 className="text-xl font-semibold text-white">
                Fiber Performance
              </h2>
            </div>
          </div>

          <div className="space-y-2">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => onSectionClick(section.id)}
                className={`flex w-full items-center gap-3 rounded-3xl border px-4 py-3 text-left text-sm transition ${
                  activeSection === section.id
                    ? "border-sky-500 bg-sky-500/10 text-sky-100"
                    : "border-slate-800/80 bg-slate-950/90 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
                }`}
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900/80 text-slate-300">
                  <FileText className="h-4 w-4" />
                </span>
                <span>{section.label}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="space-y-6">
          <div className="rounded-[32px] border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/95">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  NSO Fiber Performance Dashboard
                </p>
                <h1 className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">
                  Circle-wise and CMP-wise Analysis
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={doDownload}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:bg-slate-800"
                >
                  <Download className="h-4 w-4" />
                  Download Report
                </button>
                <button
                  type="button"
                  onClick={() => setFilters({ circle: "", cmp: "", year: "", month: "", week: "" })}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <RefreshCcw className="h-4 w-4" />
                  Reset
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="xl:col-span-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Circle
                  </span>
                  <select
                    className="app-input w-full bg-slate-950/5 text-slate-900"
                    value={filters.circle}
                    onChange={(e) => updateFilter("circle", e.target.value)}
                  >
                    <option value="">All Circles</option>
                    {options.circles.map((circle) => (
                      <option key={circle} value={circle}>
                        {circle}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    CMP
                  </span>
                  <select
                    className="app-input w-full bg-slate-950/5 text-slate-900"
                    value={filters.cmp}
                    onChange={(e) => updateFilter("cmp", e.target.value)}
                  >
                    <option value="">All CMPs</option>
                    {options.cmps.map((cmp) => (
                      <option key={cmp} value={cmp}>
                        {cmp}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Year
                  </span>
                  <select
                    className="app-input w-full bg-slate-950/5 text-slate-900"
                    value={filters.year}
                    onChange={(e) => updateFilter("year", e.target.value)}
                  >
                    <option value="">All Years</option>
                    {options.years.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Month
                  </span>
                  <select
                    className="app-input w-full bg-slate-950/5 text-slate-900"
                    value={filters.month}
                    onChange={(e) => updateFilter("month", e.target.value)}
                  >
                    <option value="">All Months</option>
                    {options.months.map((month) => (
                      <option key={month} value={month}>
                        {month}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Week
                  </span>
                  <select
                    className="app-input w-full bg-slate-950/5 text-slate-900"
                    value={filters.week}
                    onChange={(e) => updateFilter("week", e.target.value)}
                  >
                    <option value="">All Weeks</option>
                    {options.weeks.map((week) => (
                      <option key={week} value={week.replace("WK-", "") || week}>
                        {week}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>

          {error ? (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-700">
              {error}
            </div>
          ) : null}

          <section id="overview" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-4">
              {loading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-32 rounded-[28px] bg-slate-100 shimmer"
                  />
                ))
              ) : (
                cardData.map((card) => (
                  <div
                    key={card.title}
                    className="rounded-[28px] border border-slate-200 bg-slate-950/95 p-5 shadow-lg shadow-slate-900/5"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">
                          {card.title}
                        </p>
                        <p className="mt-3 text-3xl font-semibold text-white">
                          {formatNumber(card.value)}
                        </p>
                      </div>
                      <div className="inline-flex h-12 w-12 items-center justify-center rounded-3xl bg-slate-800 text-slate-200">
                        <Zap className="h-5 w-5" />
                      </div>
                    </div>
                    {card.previous !== null ? (
                      <p className="mt-4 text-sm text-slate-400">
                        Prev week: <span className="font-semibold text-white">{formatNumber(card.previous)}</span>
                        <span className="ml-3 text-emerald-400">{formatChange(card.change)}</span>
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>

          <div id="circle-ranking" className="space-y-4 rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Circle Performance Ranking</h2>
                <p className="text-sm text-slate-500">
                  Rank circles by cuts, FTKM, and MTTR.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Sorted by cuts
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Circle</th>
                    <th className="px-4 py-3">Cuts</th>
                    <th className="px-4 py-3">FTKM</th>
                    <th className="px-4 py-3">MTTR</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 4 }).map((_, index) => (
                      <tr key={index} className="animate-pulse bg-slate-50">
                        <td className="h-12 px-4" colSpan={5} />
                      </tr>
                    ))
                  ) : circleRanking.length ? (
                    circleRanking.map((row) => (
                      <tr key={row.circle} className="border-b border-slate-100">
                        <td className="px-4 py-4 font-medium text-slate-900">{row.circle}</td>
                        <td className="px-4 py-4">{formatNumber(row.cuts)}</td>
                        <td className="px-4 py-4">{formatNumber(row.ftkm)}</td>
                        <td className="px-4 py-4">{formatNumber(row.mttr)}</td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[row.status] || "bg-slate-100 text-slate-700"}`}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={5}>
                        No circle ranking data available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <section id="cuts-trend" className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Cuts Trend</h3>
                  <p className="text-sm text-slate-500">Weekly cuts trend for selected filters.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  {cutsTrend.length} weeks
                </span>
              </div>
              <div className="h-72">
                {loading ? (
                  <div className="flex h-full items-center justify-center text-slate-400">
                    Loading chart...
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cutsTrend} margin={{ top: 10, right: 12, left: 0, bottom: 6 }}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                      <XAxis dataKey="week" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip wrapperStyle={{ borderRadius: 16, boxShadow: "0 10px 30px rgba(15,23,42,0.12)" }} />
                      <Bar dataKey="cuts" fill="#2563eb" radius={[12, 12, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            <section id="mttr-trend" className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">MTTR Trend</h3>
                  <p className="text-sm text-slate-500">Weekly average MTTR trend.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  {mttrTrend.length} weeks
                </span>
              </div>
              <div className="h-72">
                {loading ? (
                  <div className="flex h-full items-center justify-center text-slate-400">
                    Loading chart...
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mttrTrend} margin={{ top: 10, right: 12, left: 0, bottom: 6 }}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                      <XAxis dataKey="week" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip wrapperStyle={{ borderRadius: 16, boxShadow: "0 10px 30px rgba(15,23,42,0.12)" }} />
                      <Line type="monotone" dataKey="mttr" stroke="#f97316" strokeWidth={3} dot={{ r: 5 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>
          </div>

          <section id="cmp-summary" className="space-y-4 rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">CMP Performance Summary</h3>
                <p className="text-sm text-slate-500">
                  Current week and previous week CMP performance comparison.
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2">
                  <Layers className="h-4 w-4" />
                  {cmpSummary.length} CMPs
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[960px] w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">CMP</th>
                    <th className="px-4 py-3">Scope KM</th>
                    <th className="px-4 py-3">Cuts</th>
                    <th className="px-4 py-3">FTKM</th>
                    <th className="px-4 py-3">MTTR</th>
                    <th className="px-4 py-3">Prev Cuts</th>
                    <th className="px-4 py-3">Prev FTKM</th>
                    <th className="px-4 py-3">Prev MTTR</th>
                    <th className="px-4 py-3">Change %</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 6 }).map((_, index) => (
                      <tr key={index} className="animate-pulse bg-slate-50">
                        <td className="h-12 px-4" colSpan={10} />
                      </tr>
                    ))
                  ) : pagedCmpSummary.length ? (
                    pagedCmpSummary.map((row) => (
                      <tr key={row.cmp} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-4 font-medium text-slate-900">{row.cmp}</td>
                        <td className="px-4 py-4">{row.scope}</td>
                        <td className="px-4 py-4">{formatNumber(row.currentCuts)}</td>
                        <td className="px-4 py-4">{formatNumber(row.currentFTKM)}</td>
                        <td className="px-4 py-4">{formatNumber(row.currentMTTR)}</td>
                        <td className="px-4 py-4">{formatNumber(row.previousCuts)}</td>
                        <td className="px-4 py-4">{formatNumber(row.previousFTKM)}</td>
                        <td className="px-4 py-4">{formatNumber(row.previousMTTR)}</td>
                        <td className="px-4 py-4">{formatChange(row.cutsChangePct)}</td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[row.status] || "bg-slate-100 text-slate-700"}`}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={10}>
                        No CMP records available for the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                Showing {pagedCmpSummary.length} of {cmpSummary.length} CMP rows.
              </p>
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-sm text-slate-600">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  className="rounded-full bg-white px-3 py-2 text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Prev
                </button>
                <span>
                  Page {currentPage} of {cmpPageCount}
                </span>
                <button
                  type="button"
                  disabled={currentPage === cmpPageCount}
                  onClick={() => setCurrentPage((page) => Math.min(cmpPageCount, page + 1))}
                  className="rounded-full bg-white px-3 py-2 text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <section id="reports" className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Weekly Performance Heatmap</h3>
                  <p className="text-sm text-slate-500">Heatmap view of CMP cuts intensity for the last few weeks.</p>
                </div>
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">
                  Good / Warning / Critical
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[640px] w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3">CMP</th>
                      {heatmap.weeks.map((week) => (
                        <th key={week} className="px-4 py-3 text-center">
                          {week}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      Array.from({ length: 4 }).map((_, index) => (
                        <tr key={index} className="animate-pulse bg-slate-50">
                          <td className="h-12 px-4" colSpan={heatmap.weeks.length + 1} />
                        </tr>
                      ))
                    ) : heatmap.rows.length ? (
                      heatmap.rows.map((row) => (
                        <tr key={row.cmp} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-4 font-medium text-slate-900">{row.cmp}</td>
                          {heatmap.weeks.map((week) => (
                            <td key={week} className="px-4 py-4 text-center">
                              <span className={`mx-auto inline-flex h-10 min-w-[2.5rem] items-center justify-center rounded-2xl text-sm font-semibold ${heatmapColor(row.values[week])}`}>
                                {row.values[week] || 0}
                              </span>
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={heatmap.weeks.length + 1}>
                          No heatmap data available.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Good (0-2)
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Warning (3-5)
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Critical (6+)
                </span>
              </div>
            </section>

            <section id="weekly-details" className="space-y-4 rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">CMP Weekly Details</h3>
                  <p className="text-sm text-slate-500">
                    Expand each CMP to inspect weekly cuts, FTKM, and MTTR.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  {weeklyDetails.weeks.length} weeks
                </span>
              </div>

              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="h-24 rounded-3xl bg-slate-100" />
                  ))}
                </div>
              ) : weeklyDetails.rows.length ? (
                weeklyDetails.rows.map((item) => {
                  const expanded = expandedCmps.includes(item.cmp);
                  return (
                    <div
                      key={item.cmp}
                      className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50"
                    >
                      <button
                        type="button"
                        onClick={() => toggleExpandCmp(item.cmp)}
                        className="w-full px-5 py-4 text-left"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h4 className="text-base font-semibold text-slate-900">{item.cmp}</h4>
                            <p className="text-sm text-slate-500">Tap to view weekly cut details.</p>
                          </div>
                          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm">
                            {expanded ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                          </span>
                        </div>
                      </button>
                      {expanded ? (
                        <div className="border-t border-slate-200 bg-white p-5">
                          <div className="grid gap-4 sm:grid-cols-3">
                            {item.details.map((detail) => (
                              <div key={detail.week} className="rounded-3xl border border-slate-200 p-4 bg-slate-50">
                                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{detail.week}</p>
                                <div className="mt-3 space-y-2 text-sm text-slate-700">
                                  <div className="flex items-center justify-between">
                                    <span>Cuts</span>
                                    <strong>{formatNumber(detail.cuts)}</strong>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span>FTKM</span>
                                    <strong>{formatNumber(detail.ftkm)}</strong>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span>MTTR</span>
                                    <strong>{formatNumber(detail.mttr)}</strong>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                  No weekly CMP details found for the selected filters.
                </div>
              )}
            </section>
          </div>

          <section id="upload" className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <ShieldCheck className="h-6 w-6 text-slate-700" />
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Data Upload & Security</h3>
                <p className="text-sm text-slate-500">
                  All KPI data is filtered by circle access from your authenticated user session.
                </p>
              </div>
            </div>
          </section>

          <section id="settings" className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <Settings className="h-6 w-6 text-slate-700" />
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Settings</h3>
                <p className="text-sm text-slate-500">
                  Use the filters above to tune the dashboard to your circle, CMP, year, month and week.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default NsoDashboard;
