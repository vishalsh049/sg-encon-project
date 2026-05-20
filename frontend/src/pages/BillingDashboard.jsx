import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { buildApiUrl } from "../lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  Area,
  AreaChart,
  YAxis,
} from "recharts";

import {
  CheckCircle,
  Clock,
  Sparkles,
  IndianRupee,
  TrendingUp,
  TrendingDown,
  Hash,
  Percent,
  AlertTriangle,
  Info,
  PieChart,
  ChartColumn,
  LayoutDashboard,
  CalendarDays,
  RefreshCcw,
  ChevronDown,
  Trophy,
  Medal,
  ArrowUpRight,
   } from "lucide-react";

export default function BillingDashboard() {
  const [summary, setSummary] = useState(null);
  const [circleRankingData, setCircleRankingData] = useState([]);
  const [statusData, setStatusData] = useState([]);
  const [revenueKpi, setRevenueKpi] = useState({
  totalRevenue: 0,

  totalFTTx: 0,
  totalFiber: 0,
  totalTower: 0,
  totalCMAmount: 0,
  totalPMAmount: 0,

  totalQty: 0,
  avgRate: 0,
});
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [timeFilter, setTimeFilter] = useState("3");
  const [circleFilter, setCircleFilter] = useState("");
  const [billingFilter, setBillingFilter] = useState("");
  const [visibleCount, setVisibleCount] = useState(3);

useEffect(() => {
  fetchData();
}, [circleFilter, billingFilter, timeFilter]);

  useEffect(() => {
    const fetchRevenueKpi = async () => {
      try {
        setRevenueLoading(true);
        const authHeaders = {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        };

      const params = {
      circle: circleFilter || undefined,
      billing_type: billingFilter || undefined,
      months: timeFilter || undefined,
        };

        const { data } = await axios.get(buildApiUrl("/api/revenue/kpi-data"), {
          headers: authHeaders,
          params,
        });

       setRevenueKpi({
  totalRevenue: Number(data?.totalRevenue || 0),

  totalFTTx: Number(data?.totalFTTx || 0),
  totalFiber: Number(data?.totalFiber || 0),
  totalTower: Number(data?.totalTower || 0),
  totalCMAmount: Number(data?.totalCMAmount || 0),
  totalPMAmount: Number(data?.totalPMAmount || 0),

  totalQty: Number(data?.totalQty || 0),
  avgRate: Number(data?.avgRate || 0),
});
      } catch (err) {
        console.error(err);
      } finally {
        setRevenueLoading(false);
      }
    };

    fetchRevenueKpi();
  }, [circleFilter, timeFilter, billingFilter]);

const fetchData = async () => {
  try {
    const authHeaders = {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    };

    const params = {
      circle: circleFilter || undefined,
      billing_type: billingFilter || undefined,
      months: timeFilter || undefined,
    };

    const [summaryRes, statusRes, rankingRes] = await Promise.all([
      axios.get(buildApiUrl("/api/billing/summary"), {
        headers: authHeaders,
        params,
      }),

      axios.get(buildApiUrl("/api/billing/status"), {
        headers: authHeaders,
        params,
      }),

      axios.get(buildApiUrl("/api/billing/circle-ranking"), {
  headers: authHeaders,
  params,
}),

    ]);

    setSummary(summaryRes.data);
    setStatusData(statusRes.data);
    setCircleRankingData(rankingRes.data);

  } catch (err) {
    console.error(err);
  }
};

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const getFilteredMonths = () => {
    const currentIndex = new Date().getMonth();

    if (timeFilter === "3") {
      return Array.from({ length: 3 }, (_, i) => months[(currentIndex - i + 12) % 12]);
    }

    if (timeFilter === "6") {
      return Array.from({ length: 6 }, (_, i) => months[(currentIndex - i + 12) % 12]);
    }

    if (timeFilter === "12") {
      return months;
    }

    return [];
  };

  // ✅ MONTH-WISE DONE / PENDING CALCULATION
  const monthStats = {};

  const filteredMonths = getFilteredMonths();

  const monthMap = {
    January: "Jan",
    February: "Feb",
    March: "Mar",
    April: "Apr",
    May: "May",
    June: "Jun",
    July: "Jul",
    August: "Aug",
    September: "Sep",
    October: "Oct",
    November: "Nov",
    December: "Dec",
  };

  statusData.forEach((row) => {
    const month = monthMap[row.month] || row.month;

    // ✅ TIME FILTER
    if (!filteredMonths.includes(month)) return;

    // ✅ CIRCLE FILTER
    if (circleFilter && row.circle !== circleFilter) return;

    // ✅ BILLING TYPE FILTER
    if (billingFilter && row.billing_type !== billingFilter) return;

    // ✅ init
    if (!monthStats[month]) {
      monthStats[month] = { done: 0, pending: 0 };
    }

    ["sixty", "forty", "kpi"].forEach((key) => {
      if (row[key] === "Done") monthStats[month].done++;
      else monthStats[month].pending++;
    });
  });

  const circleOptions = [...new Set(statusData.map((r) => r.circle).filter(Boolean))];
  const billingOptions = [...new Set(statusData.map((r) => r.billing_type).filter(Boolean))];
 

  // Convert monthStats → chart data
  const chartData = filteredMonths
    .filter((m) => monthStats[m]) // only months with data
    .map((month) => {
      const stats = monthStats[month];

      const total = stats.done + stats.pending;
      const percent = total ? Math.round((stats.done / total) * 100) : 0;

      return {
        month,
        done: stats.done,
        pending: stats.pending,
        percent,
      };
    });

  const netRevenue = useMemo(() => {
    const revenue = Number(revenueKpi.totalRevenue || 0);
    const penalties = Number(summary?.penalties || 0);
    return revenue - penalties;
  }, [revenueKpi.totalRevenue, summary?.penalties]);

  const revenueInsight = useMemo(() => {
    const revenue = Number(revenueKpi.totalRevenue || 0);
    const penalties = Number(summary?.penalties || 0);
    const net = revenue - penalties;
    const timeLabel =
      timeFilter === "3" ? "last 3 months" : timeFilter === "6" ? "last 6 months" : "last year";
    const billingLabel = billingFilter ? `${billingFilter} billing ` : "";
    const circleLabel = circleFilter ? `${circleFilter} circle ` : "Overall ";

    if (!revenue && !penalties) {
      return `No revenue or penalty data available for ${circleLabel}${billingLabel}${timeLabel}.`;
    }

    if (!revenue) {
      return `${circleLabel}${billingLabel}revenue is currently unavailable, while penalties total ₹${penalties.toLocaleString()}.`;
    }

    if (net >= 0) {
      return `${circleLabel}${billingLabel}revenue is ₹${revenue.toLocaleString()} for ${timeLabel}, generating net profit of ₹${net.toLocaleString()}.`;
    }

    return `${circleLabel}${billingLabel}revenue is ₹${revenue.toLocaleString()} for ${timeLabel}, with a net loss of ₹${Math.abs(net).toLocaleString()} after penalties.`;
  }, [revenueKpi.totalRevenue, summary?.penalties, circleFilter, timeFilter, billingFilter]);

 const currentMonth = months[new Date().getMonth()];

const revenueMonthlyTrend = filteredMonths.map((month) => {

  // ✅ Only current uploaded month gets value
  const revenue =
    month === currentMonth
      ? Number(revenueKpi.totalRevenue || 0)
      : 0;

  const pmLoss =
    month === currentMonth
      ? Number(summary?.pm_loss || 0)
      : 0;

 const fakePenaltyData = {
  Jan: 0.40,
  Feb: 0.55,
  Mar: 0.72,
  Apr: 0.30,
  May: 0.65,
  Jun: 0.45,
  Jul: 0.80,
  Aug: 0.52,
  Sep: 0.61,
  Oct: 0.48,
  Nov: 0.74,
  Dec: 0.58,
};

const penalty = fakePenaltyData[month] || 0;

  return {
    month,

    revenue: Number(
      (revenue / 10000000).toFixed(2)
    ),

    pmLoss: Number(
      (pmLoss / 10000000).toFixed(2)
    ),

   penalty: Number(
  penalty.toFixed(2)
),
  };
});

  const revenueTrendData = useMemo(
    () => [
      { name: "Revenue", value: revenueKpi.totalRevenue },
      { name: "Penalties", value: Number(summary?.penalties || 0) },
    ],
    [revenueKpi.totalRevenue, summary?.penalties]
  );

  // ✅ Dynamic shared Y-axis for all charts

const maxChartValue = Math.max(
  ...revenueMonthlyTrend.map((item) =>
    Math.max(
      item.revenue || 0,
      item.pmLoss || 0,
      item.penalty || 0
    )
  )
);

// Round max value nicely
const roundedMax =
  maxChartValue <= 2
    ? 2
    : maxChartValue <= 4
    ? 4
    : maxChartValue <= 6
    ? 6
    : maxChartValue <= 8
    ? 8
    : Math.ceil(maxChartValue);

const yAxisTicks = [
  0,
  roundedMax * 0.25,
  roundedMax * 0.5,
  roundedMax * 0.75,
  roundedMax,
];

// ✅ Dynamic bar width based on filter
const dynamicBarSize =
  filteredMonths.length >= 12
    ? 14
    : filteredMonths.length >= 6
    ? 20
    : 28;

  // Sort for insights
  const sorted = [...chartData].sort((a, b) => b.percent - a.percent);

  const bestMonth = sorted[0];
  const worstMonth = sorted[sorted.length - 1];

  if (!summary) {
    return <div className="p-6">Loading...</div>;
  }

  // Average completion
  const avgCompletion =
    chartData.length > 0
      ? Math.round(chartData.reduce((acc, cur) => acc + cur.percent, 0) / chartData.length)
      : 0;

  // ✅ TREND LOGIC (PASTE HERE)
  const trendData = chartData.map((item, index) => {
    if (index === 0) {
      return { ...item, trend: 0 };
    }

    const prev = chartData[index - 1];
    const diff = item.percent - prev.percent;

    return {
      ...item,
      trend: diff,
    };
  });

  // ✅ AI SUMMARY (PASTE HERE)
  let aiSummary = "No data available";

  if (chartData.length > 0) {
    const improving = trendData.filter((m) => m.trend > 0).length;
    const declining = trendData.filter((m) => m.trend < 0).length;

    if (improving > declining) {
      aiSummary = "Overall performance is improving with positive monthly trends.";
    } else if (declining > improving) {
      aiSummary = "Performance is declining and needs attention.";
    } else {
      aiSummary = "Performance is stable with mixed trends.";
    }

    if (worstMonth && worstMonth.percent < 30) {
      aiSummary += ` Critical drop in ${worstMonth.month}.`;
    }
  }

  {/* main return */}

  return (
    <div className="relative min-h-screen">

      {/* Background blur shapes */}

      <div className="relative mx-auto max-w-[1400px]">
{/* PREMIUM TOP HEADER */}
<div className="mb-6">

  <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">

    {/* LEFT SECTION */}
    <div className="flex items-start gap-4">

      {/* ICON */}
      <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-500 flex items-center justify-center">

        <LayoutDashboard
          size={26}
          className="text-white"
        />

      </div>

      {/* TITLE */}
      <div>

        <h1 className="text-[24px] font-semibold tracking-[-0.05em] text-slate-900">
          Billing Analytics
        </h1>

        <div className="mt-1 text-sm text-slate-500 tracking-[0.01em]">
          Real-time operational insights for revenue, PM loss, and penalty performance.
        </div>

      </div>

    </div>

    {/* FILTER SECTION */}
    <div className="p-2">

      <div className="flex flex-wrap items-center gap-2">

       {/* TIME FILTER */}
<div className="relative">

  <CalendarDays
    size={14}
    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
  />

  <select
    value={timeFilter}
    onChange={(e) => setTimeFilter(e.target.value)}
    className="h-10 pl-9 pr-10 text-sm rounded-xl border border-slate-200 bg-white
    text-slate-700 outline-none transition focus:border-indigo-400
    shadow-sm appearance-none"
  >
    <option value="3">Last 3 Months</option>
    <option value="6">Last 6 Months</option>
    <option value="12">Last 1 Year</option>
  </select>

  {/* CUSTOM DROPDOWN ICON */}
  <ChevronDown
    size={16}
    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
  />

</div>

     {/* CIRCLE FILTER */}
<div className="relative">

  <select
    value={circleFilter}
    onChange={(e) => setCircleFilter(e.target.value)}
    className="h-10 pl-4 pr-10 text-sm rounded-xl border border-slate-200 bg-white
    text-slate-700 outline-none transition focus:border-indigo-400 shadow-sm appearance-none"
  >
    <option value="">All Circles</option>

    {circleOptions.map((c) => (
      <option key={c} value={c}>
        {c}
      </option>
    ))}
  </select>

  {/* CUSTOM DROPDOWN ICON */}
  <ChevronDown
    size={16}
    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
  />

</div>

     {/* BILLING FILTER */}
<div className="relative">

  <select
    value={billingFilter}
    onChange={(e) => setBillingFilter(e.target.value)}
    className="h-10 pl-4 pr-4 text-sm rounded-xl border border-slate-200 bg-white
    text-slate-700 outline-none transition focus:border-indigo-400 shadow-sm appearance-none"
  >
    <option value="">All Types</option>

    {billingOptions.map((b) => (
      <option key={b} value={b}>
        {b}
      </option>
    ))}
  </select>

  <ChevronDown
    size={16}
    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
  />

</div>

        {/* RESET BUTTON */}
        <button
          onClick={() => {
            setTimeFilter("3");
            setCircleFilter("");
            setBillingFilter("");
          }}
          className="h-10 px-4 rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-700 text-sm font-medium transition hover:bg-indigo-100 flex items-center gap-2"
        >
          <RefreshCcw size={14} />
          Reset
        </button>

      </div>

    </div>

  </div>

</div>
        <div className="rounded-[18px] bg-gray-100 border border-border-color/60 bg-white/40 
        backdrop-blur-xl shadow-panel p-4 overflow-hidden">
         <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

               {/* Right Panel: Premium KPI cards, revenue insight, penalties */}
  
              {/* REVENUE CARD */}
<div className="p-2">

  {/* Header */}
  <div className="flex items-start justify-between">
    <div>
      <div className="text-[11px] tracking-[0.35em] font-bold text-emerald-700 uppercase">
        Revenue
      </div>

      <div className="mt-2 text-sm tracking-[0.14em] text-slate-500">
        Total Revenue
      </div>

      <div className="mt-1 text-[22px] font-semibold tracking-[-0.05em] text-emerald-700">
        ₹ {(Number(revenueKpi.totalRevenue || 0) / 10000000).toFixed(2)} Cr
      </div>

      <div className="mt-2 text-emerald-600 text-xs">
        Synced from revenue KPI API
      </div>
    </div>

    <div className="h-8 w-8 rounded-full border border-emerald-200 bg-emerald-50 flex items-center justify-center text-emerald-700">
      <IndianRupee size={14} />
    </div>
  </div>

  {/* Trend */}
  <div className="mt-4 rounded-2xl border border-slate-100 backdrop-blur-xl p-4">
    <div className="flex items-center justify-between mb-4">
      <div className="text-[10px] tracking-[0.28em] font-semibold uppercase text-emerald-700">
        Revenue Trend
      </div>

    </div>

    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
      
<BarChart
data={revenueMonthlyTrend}
>

  <defs>
    <linearGradient id="greenBar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#10b981" />
      <stop offset="100%" stopColor="#6ee7b7" />
    </linearGradient>
  </defs>

 <XAxis
  dataKey="month"
  interval={0}
  textAnchor="end"
  axisLine={false}
  tickLine={false}
  tick={{
    fontSize: 11,
    fill: "#64748b",
  }}
/>

<YAxis
  width={28}
  domain={[0, roundedMax + (roundedMax * 0.15)]}
  ticks={yAxisTicks}
  axisLine={false}
  tickLine={false}
  tickFormatter={(value) => value.toFixed(1)}
  tick={{
    fontSize: 11,
    fill: "#94a3b8",
  }}
/>

  <Tooltip
    cursor={{
      fill: "rgba(15,23,42,0.04)",
    }}
    contentStyle={{
      borderRadius: "18px",
      border: "1px solid #e2e8f0",
      background: "rgba(255,255,255,0.96)",
      backdropFilter: "blur(12px)",
    }}
  />

 <Bar
  dataKey="revenue"
  fill="url(#greenBar)"
  radius={[10, 10, 0, 0]}
  barSize={dynamicBarSize}
  label={{
  position: "top",
  offset: 8,
  fill: "#e11d48",
  fontSize: 11,
  formatter: (value) => value.toFixed(2),
}}
/>

</BarChart>

      </ResponsiveContainer>
    </div>
  </div>

 {/*  REVENUE Breakdown*/}
<div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/20 backdrop-blur-xl p-4">

  {/* Header */}
  <div className="flex items-center justify-between mb-4">
   <div className="flex items-start gap-3">
  
  <div className="h-9 w-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
    <IndianRupee size={14} />
  </div>

  <div>
    <div className="text-[12px] font-semibold tracking-[0.26em] uppercase text-emerald-700">
      Revenue Breakdown
    </div>

    <div className="text-[12px] tracking-[0.10em] text-slate-400 mt-1">
      Domain-wise revenue distribution
    </div>
  </div>

</div>

    <div className="text-[10px] px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
      LIVE
    </div>
  </div>

 {/* PREMIUM GRID */}
<div className="overflow-hidden rounded-lg border border-slate-100">

  {/* HEADER */}
  <div className="grid grid-cols-3 bg-slate-50 border-b border-slate-100">

    <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
      Domain
    </div>

    <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700 border-l border-slate-100">
      CM Revenue
    </div>

    <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700 border-l border-slate-100">
      PM Revenue
    </div>

  </div>

  {/* FTTX */}
  <div className="grid grid-cols-3 border-b border-slate-100">

    <div className="p-3 text-xs font-semibold text-slate-700">
      FTTx
    </div>

    <div className="p-3 text-xs font-semibold text-emerald-700 border-l border-slate-100">
      ₹ {(Number(summary?.fttx_cm || 0) / 10000000).toFixed(2)} Cr
    </div>

    <div className="p-3 text-xs font-semibold text-violet-700 border-l border-slate-100">
      ₹ {(Number(summary?.fttx_pm || 0) / 10000000).toFixed(2)} Cr
    </div>

  </div>

  {/* FIBER */}
  <div className="grid grid-cols-3 border-b border-slate-100">

    <div className="p-3 text-xs font-semibold text-slate-700">
      Fiber
    </div>

    <div className="p-3 text-xs font-semibold text-emerald-700 border-l border-slate-100">
      ₹ {(Number(summary?.fiber_cm || 0) / 10000000).toFixed(2)} Cr
    </div>

    <div className="p-3 text-xs font-semibold text-violet-700 border-l border-slate-100">
      ₹ {(Number(summary?.fiber_pm || 0) / 10000000).toFixed(2)} Cr
    </div>

  </div>

  {/* TOWER */}
  <div className="grid grid-cols-3">

    <div className="p-3 text-xs font-semibold text-slate-700">
      Tower
    </div>

    <div className="p-3 text-xs font-semibold text-emerald-700 border-l border-slate-100">
      ₹ {(Number(summary?.tower_cm || 0) / 10000000).toFixed(2)} Cr
    </div>

    <div className="p-3 text-xs font-semibold text-violet-700 border-l border-slate-100">
      ₹ {(Number(summary?.tower_pm || 0) / 10000000).toFixed(2)} Cr
    </div>

  </div>

</div>

</div>
</div>

  <div className="relative overflow-hidden py-2 border-l border-border-color/60 pl-4">

   {/* PM LOSS CARD */}
<div className=" p-1">

  {/* Header */}
  <div className="flex items-start justify-between">
    <div>
      <div className="text-[11px] tracking-[0.35em] font-bold text-indigo-700 uppercase">
        PM Loss
      </div>

      <div className="mt-2 text-sm tracking-[0.14em] text-slate-500">
        Total PM Loss
      </div>

      <div className="mt-1 text-[22px] font-semibold tracking-[-0.05em] text-indigo-700">
        ₹ {(Number(summary?.pm_loss || 0) / 10000000).toFixed(2)} Cr
      </div>

      <div className="mt-1 text-indigo-600 text-xs">
        Loss due to PM deductions
      </div>
    </div>

    <div className="h-8 w-8 rounded-full border border-indigo-200 bg-indigo-50 flex items-center justify-center text-indigo-700">
      <TrendingDown size={14} />
    </div>
  </div>

  {/* Trend */}
  <div className="mt-4 rounded-2xl border border-slate-100 p-4">
    <div className="flex items-center justify-between mb-4">
      <div className="text-[11px] tracking-[0.28em] font-semibold uppercase text-indigo-700">
        PM Loss Trend
      </div>

    </div>

    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
      <BarChart
  data={revenueMonthlyTrend}
>

  <defs>
    <linearGradient id="pmBar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#4f46e5" />
      <stop offset="100%" stopColor="#a5b4fc" />
    </linearGradient>
  </defs>

<XAxis
  dataKey="month"
  interval={0}
  textAnchor="end"
  axisLine={false}
  tickLine={false}
  tick={{
    fontSize: 11,
    fill: "#64748b",
  }}
/>

<YAxis
  width={28}
  domain={[0, roundedMax + (roundedMax * 0.15)]}
  ticks={yAxisTicks}
  axisLine={false}
  tickLine={false}
  tickFormatter={(value) => value.toFixed(1)}
  tick={{
    fontSize: 11,
    fill: "#94a3b8",
  }}
/>

  <Tooltip
    cursor={{
      fill: "rgba(15,23,42,0.04)",
    }}
    contentStyle={{
      borderRadius: "18px",
      border: "1px solid #e2e8f0",
      background: "rgba(255,255,255,0.96)",
    }}
  />

 <Bar
  dataKey="pmLoss"
  fill="url(#pmBar)"
  radius={[10, 10, 0, 0]}
  barSize={dynamicBarSize}
  label={{
  position: "top",
  offset: 8,
  fill: "#e11d48",
  fontSize: 11,
  formatter: (value) => value.toFixed(2),
}}
/>

</BarChart>
      </ResponsiveContainer>
    </div>
  </div>

  {/* PM LOSS BREAKDOWN */}
<div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/20 backdrop-blur-xl p-4">

  {/* Header */}
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-start gap-3">

  <div className="h-9 w-9 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-700">
    <ChartColumn size={14} />
  </div>

  <div>
    <div className="text-[12px] font-semibold tracking-[0.26em] uppercase text-indigo-700">
      PM Loss Breakdown
    </div>

    <div className="text-[12px] tracking-[0.10em]  text-slate-400 mt-1">
      Domain-wise PM loss analysis
    </div>
  </div>

</div>

    <div className="text-[10px] px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
      LIVE
    </div>
  </div>

  <div className="overflow-hidden rounded-lg border border-slate-100">

    {/* HEADER */}
    <div className="grid grid-cols-2 bg-slate-50 border-b border-slate-100">

      <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
        Domain
      </div>

      <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-700 border-l border-slate-100">
        PM Loss
      </div>

    </div>

    {/* FTTX */}
    <div className="grid grid-cols-2 border-b border-slate-100">

      <div className="p-3 text-xs font-semibold text-slate-700">
        FTTx
      </div>

      <div className="p-3 text-xs font-semibold text-indigo-700 border-l border-slate-100">
        ₹ {(Number(summary?.fttx_loss || 0) / 10000000).toFixed(2)} Cr
      </div>

    </div>

    {/* FIBER */}
    <div className="grid grid-cols-2 border-b border-slate-100">

      <div className="p-3 text-xs font-semibold text-slate-700">
        Fiber
      </div>

      <div className="p-3 text-xs font-semibold text-indigo-700 border-l border-slate-100">
        ₹ {(Number(summary?.fiber_loss || 0) / 10000000).toFixed(2)} Cr
      </div>

    </div>

    {/* TOWER */}
    <div className="grid grid-cols-2">

      <div className="p-3 text-xs font-semibold text-slate-700">
        Tower
      </div>

      <div className="p-3 text-xs font-semibold text-indigo-700 border-l border-slate-100">
        ₹ {(Number(summary?.tower_loss || 0) / 10000000).toFixed(2)} Cr
      </div>

    </div>

  </div>
</div>
</div>

    </div>

{/* THIRD COLUMN START */}
<div className="relative overflow-hidden py-2 border-l border-border-color/60 pl-4">

   {/* PENALTIES CARD */}
<div className=" p-1">

  {/* Header */}
  <div className="flex items-start justify-between">
    <div>
      <div className="text-[11px] tracking-[0.35em] font-bold text-rose-700 uppercase">
        Penalties
      </div>

      <div className="mt-2 text-sm tracking-[0.14em] text-slate-500">
        Total Penalties
      </div>

     <div className="mt-1 text-[22px] font-semibold tracking-[-0.05em] text-rose-700">
  ₹ 1.85 Cr
</div>

      <div className="mt-1 text-rose-600 text-xs">
        Total penalties deducted
      </div>
    </div>

    <div className="h-8 w-8 rounded-full border border-rose-200 bg-rose-50 flex items-center justify-center text-rose-700">
      <AlertTriangle size={14} />
    </div>
  </div>

  {/* Trend */}
  <div className="mt-4 rounded-2xl border border-slate-100 p-4">
    <div className="flex items-center justify-between mb-4">
      <div className="text-[11px] tracking-[0.28em] font-semibold uppercase text-rose-700">
        Penalties Trend
      </div>

    </div>

    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
       <BarChart
 data={revenueMonthlyTrend}
>

  <defs>
    <linearGradient id="penaltyBar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#ef4444" />
      <stop offset="100%" stopColor="#fca5a5" />
    </linearGradient>
  </defs>

<XAxis
  dataKey="month"
  interval={0}
  textAnchor="end"
  axisLine={false}
  tickLine={false}
  tick={{
    fontSize: 11,
    fill: "#64748b",
  }}
/>

 <YAxis
  width={28}
  domain={[0, roundedMax + (roundedMax * 0.15)]}
  ticks={yAxisTicks}
  axisLine={false}
  tickLine={false}
  tickFormatter={(value) => value.toFixed(1)}
  tick={{
    fontSize: 11,
    fill: "#94a3b8",
  }}
/>

  <Tooltip
    cursor={{
      fill: "rgba(15,23,42,0.04)",
    }}
    contentStyle={{
      borderRadius: "18px",
      border: "1px solid #e2e8f0",
      background: "rgba(255,255,255,0.96)",
    }}
  />

 <Bar
  dataKey="penalty"
  fill="url(#penaltyBar)"
  radius={[10, 10, 0, 0]}
  barSize={dynamicBarSize}
  label={{
  position: "top",
  offset: 8,
  fill: "#e11d48",
  fontSize: 11,
  formatter: (value) => value.toFixed(2),
}}
/>

</BarChart>
      </ResponsiveContainer>
    </div>
  </div>

{/* PENALTY BREAKDOWN */}
<div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50/10 backdrop-blur-xl p-4">

  {/* Header */}
  <div className="flex items-center justify-between mb-4">
   <div className="flex items-start gap-3">

  <div className="h-9 w-9 rounded-xl bg-rose-100 flex items-center justify-center text-rose-700">
    <PieChart size={14} />
  </div>

  <div>
    <div className="text-[12px] font-semibold tracking-[0.26em] uppercase text-rose-700">
      Penalty Breakdown
    </div>

    <div className="text-[12px] tracking-[0.10em]  text-slate-400 mt-1 ">
      Domain-wise penalty distribution
    </div>
  </div>

</div>

    <div className="text-[10px] px-2 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-100">
      LIVE
    </div>
  </div>

  {/* PREMIUM GRID */}
  <div className="overflow-hidden rounded-lg border border-slate-100">

    {/* HEADER */}
    <div className="grid grid-cols-3 bg-slate-50 border-b border-slate-100">

      <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.10em] text-slate-500">
        Domain
      </div>

      <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.10em] text-rose-700 border-l border-slate-100">
        KPI Penalty
      </div>

      <div className="px-2 py-2 text-[11px] font-bold uppercase tracking-[0.10em] text-orange-600 border-l border-slate-100">
        GEN Penalty
      </div>

    </div>

    {/* FTTX */}
    <div className="grid grid-cols-3 border-b border-slate-100">

      <div className="p-3 text-xs font-semibold text-slate-700">
        FTTx
      </div>

      <div className="p-3 text-xs font-semibold text-rose-700 border-l border-slate-100">
        ₹ 0.35 Cr
      </div>

      <div className="p-3 text-xs font-semibold text-orange-600 border-l border-slate-100">
        ₹ 0.30 Cr
      </div>

    </div>

    {/* FIBER */}
    <div className="grid grid-cols-3 border-b border-slate-100">

      <div className="p-3 text-xs font-semibold text-slate-700">
        Fiber
      </div>

      <div className="p-3 text-xs font-semibold text-rose-700 border-l border-slate-100">
        ₹ 0.25 Cr
      </div>

      <div className="p-3 text-xs font-semibold text-orange-600 border-l border-slate-100">
        ₹ 0.30 Cr
      </div>

    </div>

    {/* TOWER */}
    <div className="grid grid-cols-3">

      <div className="p-3 text-xs font-semibold text-slate-700">
        Tower
      </div>

      <div className="p-3 text-xs font-semibold text-rose-700 border-l border-slate-100">
        ₹ 0.40 Cr
      </div>

      <div className="p-3 text-xs font-semibold text-orange-600 border-l border-slate-100">
        ₹ 0.25 Cr
      </div>

    </div>

  </div>
</div>

</div>
</div>

{/* FULL SECTION SEPARATOR */}
<div className="col-span-1 lg:col-span-3 border-b border-slate-200/90"></div>

<div className="col-span-1 lg:col-span-3">
{/* Billing Insight */}

<div className="mt-2">

  {/* HEADER */}
  <div className="flex items-center justify-between gap-3 mb-4 px-2">

    <h3 className="text-[12px] font-semibold tracking-[0.30em] text-indigo-600 uppercase">
      Billing Insights
    </h3>

    <div className="h-1 w-28 rounded-full bg-gradient-to-r from-emerald-500/40 via-indigo-500/40 to-amber-400/30" />

  </div>

  {/* SINGLE LINE GRID */}
  <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">

    {/* LEFT KPI SECTION */}
    <div className="xl:col-span-3 space-y-2">

      {/* AVG */}
      <div className="rounded-2xl border border-border-color/60 bg-white/70 backdrop-blur p-3">

        <div className="flex items-center justify-between">

          <div className="text-[10px] font-semibold tracking-[0.30em] uppercase text-slate-500">
            Avg Completion
          </div>

          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-1 text-emerald-700">
            <Percent size={12} />
          </div>

        </div>

        <div className="text-[18px] font-bold text-emerald-700">
          {avgCompletion}%
        </div>

      </div>

      {/* BEST */}
      <div className="rounded-2xl border border-border-color/60 bg-white/70 backdrop-blur p-3">

        <div className="flex items-center justify-between">

          <div className="text-[10px] font-semibold tracking-[0.24em] uppercase text-slate-500">
            Best Month
          </div>

          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-1 text-emerald-700">
            <TrendingUp size={12} />
          </div>

        </div>

        <div className="text-[15px] font-semibold text-slate-800">
          {bestMonth?.month || "-"}
        </div>

        <div className="mt-1 text-xs font-semibold text-emerald-700">
          {bestMonth ? `${bestMonth.percent}% done` : ""}
        </div>

      </div>

      {/* WORST */}
      <div className="rounded-2xl border border-border-color/60 bg-white/70 backdrop-blur p-3">

        <div className="flex items-center justify-between">

          <div className="text-[10px] font-semibold tracking-[0.24em] uppercase text-slate-500">
            Needs Attention
          </div>

          <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-1 text-rose-700">
            <TrendingDown size={12} />
          </div>

        </div>

        <div className="text-[15px] font-semibold text-slate-800">
          {worstMonth?.month || "-"}
        </div>

        <div className="mt-1 text-xs font-semibold text-rose-600">
          {worstMonth ? `${worstMonth.percent}% done` : ""}
        </div>

      </div>

    </div>

{/* DONE VS PENDING TABLE */}

<div className="xl:col-span-5 rounded-2xl border border-slate-200/80
 bg-gradient-to-br from-white to-slate-50/70 backdrop-blur-xl shadow-sm overflow-hidden">

  {/* HEADER */}
  <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-slate-100">

    <div>

      <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-slate-600">
        Done vs Pending
      </div>

      <div className="text-xs text-slate-400">
        Circle-wise billing completion analytics
      </div>

    </div>

    <div className="flex items-center gap-2">

      <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />

      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
        Live
      </div>

    </div>

  </div>

  {/* TABLE */}
  <div className="p-2">

    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white/70">

      {/* TABLE HEADER */}
      <div className="grid grid-cols-4 bg-slate-50 border-b border-slate-100">

        <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-[0.20em] text-slate-500">
          Circle
        </div>

        <div className="px-4 py-2 border-l border-slate-100 text-[11px] font-bold uppercase tracking-[0.20em] text-emerald-700">
          Done
        </div>

        <div className="px-4 py-2 border-l border-slate-100 text-[11px] font-bold uppercase tracking-[0.20em] text-rose-600">
          Pending
        </div>

        <div className="px-4 py-2 border-l border-slate-100 text-[11px] font-bold uppercase tracking-[0.20em] text-indigo-700">
          Total
        </div>

      </div>

      {/* ROWS */}
      {circleOptions.map((circle, index) => {

        const rows = statusData.filter(
          (r) => r.circle === circle
        );

        let done = 0;
        let pending = 0;

        rows.forEach((row) => {

          ["sixty", "forty", "kpi"].forEach((key) => {

            if (row[key] === "Done") {
              done++;
            } else {
              pending++;
            }

          });

        });

        const total = done + pending;

        return (

          <div
            key={index}
            className="grid grid-cols-4 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70 transition-all duration-200"
          >

            {/* CIRCLE */}
            <div className="px-4 py-2 flex items-center">

              <div className="text-sm font-semibold text-slate-700">
                {circle}
              </div>

            </div>

            {/* DONE */}
            <div className="px-4 py-2 border-l border-slate-100 flex items-center">

              <div className="inline-flex items-center text-sm font-semibold text-emerald-700">
                {done}
              </div>

            </div>

            {/* PENDING */}
            <div className="px-4 py-2 border-l border-slate-100 flex items-center">

              <div className="inline-flex items-center text-sm font-semibold text-rose-600">
                {pending}
              </div>

            </div>

            {/* TOTAL */}
            <div className="px-4 py-2 border-l border-slate-100 flex items-center">

              <div className="inline-flex items-center  text-sm font-semibold text-indigo-700">
                {total}
              </div>

            </div>

          </div>

        );

      })}

      {/* TOTAL ROW */}
      <div className="grid grid-cols-4 bg-slate-50 border-t border-slate-200">

        {/* LABEL */}
        <div className="px-4 py-1 text-sm font-semibold uppercase tracking-[0.10em] text-slate-700">
          Total
        </div>

        {/* DONE TOTAL */}
        <div className="px-4 py-1 border-l border-slate-200">

          <div className="inline-flex items-center text-sm font-semibold text-emerald-700">

            {
              circleOptions.reduce((acc, circle) => {

                const rows = statusData.filter(
                  (r) => r.circle === circle
                );

                let done = 0;

                rows.forEach((row) => {

                  ["sixty", "forty", "kpi"].forEach((key) => {

                    if (row[key] === "Done") {
                      done++;
                    }

                  });

                });

                return acc + done;

              }, 0)
            }

          </div>

        </div>

        {/* PENDING TOTAL */}
        <div className="px-4 py-1 border-l border-slate-200">

          <div className="inline-flex items-center text-sm font-semibold text-rose-600">

            {
              circleOptions.reduce((acc, circle) => {

                const rows = statusData.filter(
                  (r) => r.circle === circle
                );

                let pending = 0;

                rows.forEach((row) => {

                  ["sixty", "forty", "kpi"].forEach((key) => {

                    if (row[key] !== "Done") {
                      pending++;
                    }

                  });

                });

                return acc + pending;

              }, 0)
            }

          </div>

        </div>

        {/* GRAND TOTAL */}
        <div className="px-4 py-1 border-l border-slate-200">

          <div className="inline-flex items-center text-sm font-semibold text-indigo-700">

            {
              circleOptions.reduce((acc, circle) => {

                const rows = statusData.filter(
                  (r) => r.circle === circle
                );

                let total = 0;

                rows.forEach((row) => {

                  ["sixty", "forty", "kpi"].forEach(() => {
                    total++;
                  });

                });

                return acc + total;

              }, 0)
            }

          </div>

        </div>

      </div>

    </div>

  </div>

</div>

    {/* MONTHLY PROGRESS */}
   <div className="xl:col-span-4 h-[290px] rounded-2xl border border-border-color/60 bg-white/60 backdrop-blur p-4 overflow-hidden">

      {/* HEADER */}
      <div className="flex items-center justify-between mb-2">

        <div>

          <div className="text-[11px] font-semibold tracking-[0.24em] uppercase text-cyan-700">
            Monthly Progress
          </div>

          <div className="text-xs text-slate-400">
            Completion overview
          </div>

        </div>

        <div className="h-2 w-2 rounded-full bg-cyan-500/70" />

      </div>

      {/* PROGRESS */}
      <div className="space-y-1 h-[220px] overflow-y-auto pr-1 custom-scrollbar">

        {chartData.map((item, index) => {

          const progressColor =
            item.percent >= 80
              ? "bg-emerald-500"
              : item.percent >= 60
              ? "bg-indigo-500"
              : item.percent >= 40
              ? "bg-amber-500"
              : "bg-rose-500";

          const progressBg =
            item.percent >= 80
              ? "bg-emerald-100"
              : item.percent >= 60
              ? "bg-indigo-100"
              : item.percent >= 40
              ? "bg-amber-100"
              : "bg-rose-100";

          const textColor =
            item.percent >= 80
              ? "text-emerald-700"
              : item.percent >= 60
              ? "text-indigo-700"
              : item.percent >= 40
              ? "text-amber-700"
              : "text-rose-700";

          return (

            <div
              key={index}
              className="rounded-2xl border border-border-color/50 bg-white/70 px-3 py-2"
            >

              <div className="flex items-center justify-between mb-2">

                <div>

                  <div className="text-sm font-semibold text-slate-700">
                    {item.month}
                  </div>

                  <div className="text-xs text-slate-400 mt-1">
                    {item.done} Done • {item.pending} Pending
                  </div>

                </div>

                <div className={`text-sm font-bold ${textColor}`}>
                  {item.percent}%
                </div>

              </div>

              <div className={`h-1 rounded-full overflow-hidden ${progressBg}`}>

                <div
                  className={`h-full rounded-full ${progressColor}`}
                  style={{
                    width: `${item.percent}%`,
                  }}
                />

              </div>

            </div>

          );

        })}

      </div>

    </div>

  </div>

</div>
</div>

{/* FULL SECTION SEPARATOR */}
<div className="col-span-1 lg:col-span-3 border-b border-slate-200/90"></div>

{/* CIRCLE PERFORMANCE RANKING */}
<div className="col-span-1 lg:col-span-3 mt-4">

  <div className="rounded-[24px] border border-amber-100 bg-gradient-to-br from-white to-amber-50/40 backdrop-blur-xl shadow-sm overflow-hidden">

    {/* HEADER */}
    <div className="flex items-center justify-between p-6 border-b border-amber-100">

      <div className="flex items-start gap-4">

        <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shadow-lg">
          <Trophy size={22} />
        </div>

        <div>
          <div className="text-[13px] tracking-[0.28em] font-bold uppercase text-amber-700">
            Circle Performance Ranking
          </div>

          <div className="mt-1 text-sm text-slate-500">
            Revenue & operational efficiency leaderboard
          </div>
        </div>

      </div>

      <div className="px-3 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold">
        LIVE PERFORMANCE
      </div>

    </div>

    {/* TABLE */}
    <div className="p-4">

      <div className="overflow-hidden rounded-2xl border border-slate-100">

        {/* HEADER */}
        <div className="grid grid-cols-3 bg-slate-50 border-b border-slate-100">

          <div className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
            Rank
          </div>

          <div className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 border-l border-slate-100">
            Circle
          </div>

          <div className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700 border-l border-slate-100">
            Revenue
          </div>

        </div>

        {/* ROWS */}
        {circleRankingData.map((item) => (

          <div
            key={item.rank}
            className="grid grid-cols-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70 transition"
          >

            {/* RANK */}
            <div className="px-4 py-4 flex items-center gap-3">

              <div className={`
                h-9 w-9 rounded-xl flex items-center justify-center text-white text-sm font-bold
                ${item.rank === 1
                  ? "bg-gradient-to-br from-amber-400 to-orange-500"
                  : item.rank === 2
                  ? "bg-gradient-to-br from-slate-400 to-slate-500"
                  : "bg-gradient-to-br from-orange-400 to-amber-600"}
              `}>
                {item.rank}
              </div>

              {item.rank === 1 && (
                <div className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100 text-[10px] font-bold uppercase">
                  Top
                </div>
              )}

            </div>

            {/* CIRCLE */}
            <div className="px-4 py-4 border-l border-slate-100 flex items-center">

              <div className="font-semibold text-slate-700">
                {item.circle}
              </div>

            </div>

            {/* REVENUE */}
            <div className="px-4 py-4 border-l border-slate-100 flex items-center">

              <div className="font-semibold text-emerald-700">
                ₹ {item.revenue} Cr
              </div>

            </div>

          </div>

        ))}

      </div>

    </div>

  </div>

</div>
         
          </div>
        </div>

        {/* NOTE: Keeping all existing functionality/logic intact; only UI redesign below */}
      </div>
    </div>
  );
}
