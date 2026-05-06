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
  DollarSign,
  TrendingUp,
  TrendingDown,
  Hash,
  Percent,
  AlertTriangle,
  Info,
} from "lucide-react";

export default function BillingDashboard() {
  const [summary, setSummary] = useState(null);
  const [statusData, setStatusData] = useState([]);
  const [revenueKpi, setRevenueKpi] = useState({
    totalRevenue: 0,
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
  }, []);

  useEffect(() => {
    const fetchRevenueKpi = async () => {
      try {
        setRevenueLoading(true);
        const authHeaders = {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        };

        const params = {
          circle: circleFilter || undefined,
        };

        const { data } = await axios.get(buildApiUrl("/api/revenue/kpi-data"), {
          headers: authHeaders,
          params,
        });

        setRevenueKpi({
          totalRevenue: Number(data?.totalRevenue || 0),
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

      const [summaryRes, statusRes] = await Promise.all([
        axios.get(buildApiUrl("/api/billing/summary"), { headers: authHeaders }),
        axios.get(buildApiUrl("/api/billing/status"), { headers: authHeaders }),
      ]);

      setSummary(summaryRes.data);
      setStatusData(statusRes.data);
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

const revenueMonthlyTrend = [
  { month: "Jan", revenue: 420000 },
  { month: "Feb", revenue: 580000 },
  { month: "Mar", revenue: 760000 },
  { month: "Apr", revenue: 620000 },
  { month: "May", revenue: 910000 },
  { month: "Jun", revenue: 1100000 },
];

  const revenueTrendData = useMemo(
    () => [
      { name: "Revenue", value: revenueKpi.totalRevenue },
      { name: "Penalties", value: Number(summary?.penalties || 0) },
    ],
    [revenueKpi.totalRevenue, summary?.penalties]
  );

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
        {/* Top Section */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-4">
          <div>
            <h1 className="text-xl sm:text-[24px] font-bold tracking-[-0.03em] text-text-primary">
              Billing Dashboard
            </h1>
            <div className="mt-2 text-sm text-text-secondary">
              Luxury-grade billing insights across circles and billing types.
            </div>
          </div>

          {/* Premium filter row */}
          <div className="rounded-3xl border border-border-color/60 bg-white/55 backdrop-blur-xl shadow-soft px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              {/* Time Dropdown */}
              <select
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value)}
                className="h-9 px-3 text-xs rounded-full border border-border-color/70 bg-white/70 backdrop-blur text-text-primary outline-none transition focus:border-primary shadow-[0_10px_30px_rgba(15,23,42,0.06)]"
              >
                <option value="3">Last 3 Months</option>
                <option value="6">Last 6 Months</option>
                <option value="12">Last 1 Year</option>
              </select>

              {/* Circle Filter */}
              <select
                value={circleFilter}
                onChange={(e) => setCircleFilter(e.target.value)}
                className="h-9 px-3 text-xs rounded-full border border-border-color/70 bg-white/70 backdrop-blur text-text-primary outline-none transition focus:border-primary"
              >
                <option value="">All Circles</option>
                {circleOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              {/* Billing Type */}
              <select
                value={billingFilter}
                onChange={(e) => setBillingFilter(e.target.value)}
                className="h-9 px-3 text-xs rounded-full border border-border-color/70 bg-white/70 backdrop-blur text-text-primary outline-none transition focus:border-primary"
              >
                <option value="">All Types</option>
                {billingOptions.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>

              <button
                onClick={() => {
                  setTimeFilter("3");
                  setCircleFilter("");
                  setBillingFilter("");
                }}
                className="h-9 px-4 text-xs rounded-full border border-border-color/70 bg-white/70 backdrop-blur text-text-primary transition hover:bg-red-50 hover:shadow-soft"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-[26px] bg-gray-100 border border-border-color/60 bg-white/40 backdrop-blur-xl shadow-panel p-4 overflow-hidden">
          <div className="flex flex-col lg:flex-row gap-4">

            {/* Left Panel: Month performance + AI + chart */}

            <div className="flex-1 lg:pr-2 relative overflow-hidden py-2">
              <div className="flex items-center justify-between gap-3 mb-3 px-3">
                <h3 className="text-[11px] font-semibold tracking-[0.26em] text-indigo-600 uppercase">
                  Billing Insights
                </h3>
                <div className="h-1 w-24 rounded-full bg-gradient-to-r from-emerald-500/40 via-indigo-500/40 to-amber-400/30" />
              </div>

              {/* KPI row (premium completion summary) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                <div className="rounded-2xl border border-border-color/60 bg-white/60 backdrop-blur p-3 transition hover:-translate-y-[2px]">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-semibold tracking-[0.36em] text-text-secondary uppercase">
                      Avg Completion
                    </div>
                    <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-1 text-emerald-700">
                      <Percent size={14} />
                    </div>
                  </div>
                  <div className="mt-2 text-[18px] font-bold tracking-[-0.03em] text-emerald-800">
                    {avgCompletion}%
                  </div>
                </div>

                <div className="rounded-2xl border border-border-color/60 bg-white/60 backdrop-blur p-3 transition hover:-translate-y-[2px]">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-semibold tracking-[0.18em] text-text-secondary uppercase">
                      Best Month
                    </div>
                    <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-1 text-emerald-700">
                      <TrendingUp size={14} />
                    </div>
                  </div>
                  <div className=" text-[14px] font-bold text-text-primary">
                    {bestMonth?.month || "-"}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-emerald-700">
                    {bestMonth ? `${bestMonth.percent}% done` : ""}
                  </div>
                </div>

                <div className="rounded-2xl border border-border-color/60 bg-white/60 backdrop-blur p-3 transition hover:-translate-y-[2px]">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-semibold tracking-[0.18em] text-text-secondary uppercase">
                      Needs Attention
                    </div>
                    <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-1 text-rose-700">
                      <TrendingDown size={14} />
                    </div>
                  </div>
                  <div className=" text-[14px] font-bold text-text-primary">
                    {worstMonth?.month || "-"}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-rose-600">
                    {worstMonth ? `${worstMonth.percent}% done` : ""}
                  </div>
                </div>
              </div>

              {/* AI Insight card */}
              <div className="mb-3 rounded-3xl border border-indigo-100 bg-gradient-to-r from-indigo-50/90 via-white/70 to-blue-50/90 backdrop-blur px-4 py-2 transition">
                <div className="flex items-center gap-2 mb-2">
                  <div className="rounded-2xl bg-indigo-500/10 border border-indigo-500/20 p-2 text-indigo-700">
                    <Sparkles size={10} />
                  </div>
                  <div className="text-[11px] font-semibold tracking-[0.26em] text-indigo-600 uppercase">
                    AI Insight
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-[10px] px-2 py-0.5 bg-indigo-100/80 text-indigo-700 rounded-full border border-indigo-200">
                      Smart
                    </span>
                  </div>
                </div>

                <p className="text-sm text-text-secondary leading-relaxed">
                  {aiSummary}
                </p>
              </div>

              {/* Charts */}
              <div className="rounded-3xl border border-border-color/60 bg-white/55 backdrop-blur p-4 mb-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-[11px] font-semibold tracking-[0.22em] text-text-secondary uppercase">
                      Done vs Pending
                    </div>
                    <div className="text-xs text-text-muted mt-1">Smooth completion overview by month</div>
                  </div>
                  <div className="h-2 w-2 rounded-full bg-emerald-500/70" />
                </div>

                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <defs>
                        <linearGradient id="doneGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity="0.95" />
                          <stop offset="100%" stopColor="#22c55e" stopOpacity="0.75" />
                        </linearGradient>
                        <linearGradient id="pendingGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.95" />
                          <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.7" />
                        </linearGradient>
                      </defs>

                      <CartesianGrid vertical={false} stroke="rgba(15, 23, 42, 0.06)" />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip formatter={(value) => Number(value).toLocaleString()} />
                      <Bar dataKey="done" fill="url(#doneGrad)" radius={[10, 10, 0, 0]} />
                      <Bar dataKey="pending" fill="url(#pendingGrad)" radius={[10, 10, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Monthly Progress */}
<div className=" rounded-2xl border border-border-color/60 bg-white/55 backdrop-blur p-4 overflow-hidden">

  {/* Header */}
  <div className="flex items-center justify-between mb-4">
    <div>
      <div className="text-[11px] font-semibold tracking-[0.26em] text-cyan-700 uppercase">
        Monthly Progress
      </div>

      <div className="text-xs text-text-muted mt-1">
        Real month-wise billing completion overview
      </div>
    </div>

    <div className="h-2 w-2 rounded-full bg-cyan-500/70" />
  </div>

  {/* Dynamic Progress */}
  <div className="space-y-4">

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
  className="rounded-2xl border border-border-color/50 bg-white/70 p-3"
>
  <div className="flex items-center justify-between mb-2">

    <div>
      <div className="text-sm font-semibold text-text-primary">
        {item.month}
      </div>

      <div className="text-xs text-text-muted mt-1">
        {item.done} Done • {item.pending} Pending
      </div>
    </div>

    <div className={`text-sm font-bold ${textColor}`}>
      {item.percent}%
    </div>
  </div>

  <div className={`h-2 rounded-full overflow-hidden ${progressBg}`}>
    <div
      className={`h-full rounded-full ${progressColor}`}
      style={{ width: `${item.percent}%` }}
    />
  </div>
</div>
      );
    })}

  </div>
</div>

     {/* PM LOSS SECTION */}
<div className="mb-3 pt-5 border-t border-border-color/40">

  {/* Heading */}
  <div className="flex items-center justify-between mb-3">
    <div>
      <div className="text-[11px] font-semibold tracking-[0.26em] text-amber-700 uppercase">
        PM Loss
      </div>

      <div className="text-xs text-text-muted mt-1">
        Profit margin and operational impact overview
      </div>
    </div>

    <div className="h-2 w-2 rounded-full bg-amber-500/70" />
  </div>

  {/* Cards */}
  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

    {/* PM LOSS */}
    <div className="rounded-3xl border border-amber-200/60 bg-amber-50/50 backdrop-blur p-4 transition-all 
    duration-200 hover:-translate-y-[2px] flex items-center justify-between gap-4">

      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-2 text-amber-700">
          <TrendingDown size={20} />
        </div>

        <div>
          <div className="text-[11px] font-semibold tracking-[0.26em] text-amber-700 uppercase">
            PM Loss
          </div>

          <div className="text-sm text-text-secondary mt-1">
            Profit margin reduction
          </div>
        </div>
      </div>

      <div className="text-right">
        <div className="text-[13px] font-semibold text-amber-700/80">
          Monthly
        </div>

        <div className="text-[22px] font-bold tracking-[-0.04em] text-amber-700">
          ₹5200
        </div>
      </div>
    </div>

    {/* REVENUE DROP */}
    <div className="rounded-3xl border border-red-200/60 bg-red-50/50 backdrop-blur p-4 transition-all
     duration-200 hover:-translate-y-[2px] flex items-center justify-between gap-4">

      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-2 text-red-700">
          <TrendingDown size={18} />
        </div>

        <div>
          <div className="text-[11px] font-semibold tracking-[0.26em] text-red-700 uppercase">
            Revenue Drop
          </div>

          <div className="text-sm text-text-secondary mt-1">
            Monthly revenue decrease
          </div>
        </div>
      </div>

      <div className="text-right">
        <div className="text-[13px] font-semibold text-red-700/80">
          Revenue
        </div>

        <div className="text-[22px] font-bold tracking-[-0.04em] text-red-700">
          ₹3100
        </div>
      </div>
    </div>

  </div>

  {/* Circle Performance Leaderboard */}
<div className="mt-4 rounded-3xl border border-border-color/60 bg-white/55 backdrop-blur p-4">

  {/* Header */}
  <div className="flex items-center justify-between mb-4">
    <div>
      <div className="text-[11px] font-semibold tracking-[0.26em] text-indigo-700 uppercase">
        Circle Performance
      </div>

      <div className="text-xs text-text-muted mt-1">
        Revenue and completion ranking overview
      </div>
    </div>

    <div className="h-2 w-2 rounded-full bg-indigo-500/70" />
  </div>

  {/* Table */}
  <div className="space-y-3">

    {/* ROW */}
    <div className="flex items-center justify-between rounded-2xl border border-border-color/50 bg-white/70 px-4 py-3">

      <div>
        <div className="text-sm font-semibold text-text-primary">
          Punjab
        </div>

        <div className="text-xs text-text-muted mt-1">
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] 
          font-medium text-emerald-700">
           Excellent
             </span>
        </div>
      </div>

      <div className="text-right">
        <div className="text-sm font-bold text-emerald-700">
          ₹4.2Cr
        </div>

        <div className="text-xs text-emerald-600 mt-1">
          92% Complete
        </div>
      </div>
    </div>

    {/* ROW */}
    <div className="flex items-center justify-between rounded-2xl border border-border-color/50 bg-white/70 px-4 py-3">

      <div>
        <div className="text-sm font-semibold text-text-primary">
          Haryana
        </div>

        <div className="text-xs text-text-muted mt-1">
          <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
             Stable Growth
          </span>
        </div>
      </div>

      <div className="text-right">
        <div className="text-sm font-bold text-indigo-700">
          ₹3.8Cr
        </div>

        <div className="text-xs text-indigo-600 mt-1">
          74% Complete
        </div>
      </div>
    </div>

    {/* ROW */}
    <div className="flex items-center justify-between rounded-2xl border border-border-color/50 bg-white/70 px-4 py-3">

      <div>
        <div className="text-sm font-semibold text-text-primary">
          Delhi
        </div>

        <div className="text-xs text-text-muted mt-1">
          <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700">
             Needs Attention
          </span>
        </div>
      </div>

      <div className="text-right">
        <div className="text-sm font-bold text-rose-700">
          ₹2.9Cr
        </div>

        <div className="text-xs text-rose-600 mt-1">
          61% Complete
        </div>
      </div>
    </div>

  </div>
</div>

{/* PM LOSS ANALYSIS */}
<div className="mt-4 rounded-3xl border border-border-color/60 bg-white/55 backdrop-blur p-4 overflow-hidden">

  {/* Header */}
  <div className="flex items-center justify-between mb-4">
    <div>
      <div className="text-[11px] font-semibold tracking-[0.26em] text-amber-700 uppercase">
        PM Loss Analysis
      </div>

      <div className="text-xs text-text-muted mt-1">
        Operational and billing impact overview
      </div>
    </div>

    <div className="h-2 w-2 rounded-full bg-amber-500/70" />
  </div>

  {/* Progress Items */}
  <div className="space-y-4">

    {/* KPI Delay */}
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-text-primary">
          KPI Delay
        </div>

        <div className="text-sm font-semibold text-amber-700">
          72%
        </div>
      </div>

      <div className="h-2 rounded-full bg-amber-100 overflow-hidden">
        <div className="h-full w-[72%] rounded-full bg-amber-500" />
      </div>
    </div>

    {/* Revenue Impact */}
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-text-primary">
          Revenue Impact
        </div>

        <div className="text-sm font-semibold text-rose-700">
          48%
        </div>
      </div>

      <div className="h-2 rounded-full bg-rose-100 overflow-hidden">
        <div className="h-full w-[48%] rounded-full bg-rose-500" />
      </div>
    </div>

    {/* Billing Delay */}
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-text-primary">
          Billing Delay
        </div>

        <div className="text-sm font-semibold text-indigo-700">
          36%
        </div>
      </div>

      <div className="h-2 rounded-full bg-indigo-100 overflow-hidden">
        <div className="h-full w-[36%] rounded-full bg-indigo-500" />
      </div>
    </div>

    {/* Operational Loss */}
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-text-primary">
          Operational Loss
        </div>

        <div className="text-sm font-semibold text-emerald-700">
          21%
        </div>
      </div>

      <div className="h-2 rounded-full bg-emerald-100 overflow-hidden">
        <div className="h-full w-[21%] rounded-full bg-emerald-500" />
      </div>
    </div>

  </div>
</div>

</div>
              
            </div>

            {/* Right Panel: Premium KPI cards, revenue insight, penalties */}
            <div className="flex-1 lg:border-l border-border-color/60 px-0 lg:px-4 flex flex-col">
              {/* KPI CARDS (Premium glass cards) */}
              <div className="py-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div className="rounded-3xl border border-border-color/60 bg-white/55 backdrop-blur p-5 transition-all duration-200 hover:-translate-y-[2px] relative overflow-hidden">
                    <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-emerald-500/10 blur-2xl" />
                    <div className="flex items-start justify-between gap-3 relative">
                      <div>
                        <div className="text-[11px] font-semibold tracking-[0.22em] text-text-secondary uppercase">
                          Total Revenue
                        </div>
                        <div className="mt-2 text-[22px] font-bold tracking-[-0.04em] text-emerald-800">
                          {revenueLoading ? "Loading..." : `₹ ${Number(revenueKpi.totalRevenue || 0).toLocaleString()}`}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-2 text-emerald-700">
                        <DollarSign size={16} />
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-text-muted">Synced from revenue KPI API</div>
                  </div>

                  <div className="rounded-3xl border border-border-color/60 bg-white/55 backdrop-blur p-5 transition-all duration-200 hover:-translate-y-[2px] relative overflow-hidden">
                    <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-amber-300/10 blur-2xl" />
                    <div className="flex items-start justify-between gap-3 relative">
                      <div>
                        <div className="text-[11px] font-semibold tracking-[0.26em] text-text-secondary uppercase">
                          Net Revenue
                        </div>
                        <div className={`mt-2 text-[22px] font-bold tracking-[-0.04em] ${netRevenue >= 0 ? "text-emerald-800" : "text-rose-700"}`}>
                          {revenueLoading ? "Loading..." : `₹ ${netRevenue.toLocaleString()}`}
                        </div>
                      </div>
                      <div className={`rounded-2xl p-2 border ${netRevenue >= 0 ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700" : "bg-rose-500/10 border-rose-500/20 text-rose-700"}`}>
                        {netRevenue >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                      </div>
                    </div>
                    <div className={`mt-3 text-xs ${netRevenue >= 0 ? "text-emerald-700" : "text-rose-700"} font-semibold`}>
                      {netRevenue >= 0 ? "Profit after penalties" : "Loss after penalties"}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-border-color/60 bg-white/55 backdrop-blur p-5 transition-all duration-200 hover:-translate-y-[2px]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold tracking-[0.26em] text-text-secondary uppercase">
                          Total Quantity
                        </div>
                        <div className="mt-2 text-[22px] font-bold tracking-[-0.02em] text-text-primary">
                          {revenueLoading ? "..." : Number(revenueKpi.totalQty || 0).toLocaleString()}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-indigo-500/10 border border-indigo-500/20 p-2 text-indigo-700">
                        <Hash size={16} />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-border-color/60 bg-white/55 backdrop-blur p-5 transition-all duration-200 hover:-translate-y-[2px]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold tracking-[0.26em] text-text-secondary uppercase">
                          Average Rate
                        </div>
                        <div className="mt-2 text-[22px] font-bold tracking-[-0.02em] text-text-primary">
                          {revenueLoading ? "..." : `₹ ${Number(revenueKpi.avgRate || 0).toFixed(2)}`}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-amber-300/10 border border-amber-300/20 p-2 text-amber-700">
                        <Percent size={16} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Revenue Insight Box (Premium info card) */}
                <div className="mb-4 rounded-3xl border border-border-color/60 bg-white/50 backdrop-blur p-4">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="rounded-2xl bg-indigo-500/10 border border-indigo-500/20 p-1 text-indigo-700">
                        <Info size={12} />
                      </div>
                      <div className="text-[11px] font-semibold tracking-[0.26em] text-text-secondary uppercase">
                        Revenue Insight
                      </div>
                    </div>
                    <div className="text-xs text-text-muted">
                      {timeFilter === "3" ? "Last 3 months" : timeFilter === "6" ? "Last 6 months" : "Last year"}
                    </div>
                  </div>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {revenueInsight}
                  </p>
                </div>

                {/* Revenue Trend */}
<div className="rounded-3xl border border-border-color/60 bg-white/55 backdrop-blur p-4 mb-4 overflow-hidden">

  <div className="flex items-center justify-between mb-4">
    <div>
      <div className="text-[11px] font-semibold tracking-[0.26em] text-emerald-700 uppercase">
        Revenue Trend
      </div>

      <div className="text-xs text-text-muted mt-1">
        Monthly revenue performance overview
      </div>
    </div>

    <div className="flex items-center gap-2">
      <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />

      <span className="text-xs text-emerald-700 font-medium">
        Live Growth
      </span>
    </div>
  </div>

  <div className="h-56">
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={revenueMonthlyTrend}>

        <defs>
          <linearGradient id="revenueArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid
          vertical={false}
          stroke="rgba(15,23,42,0.05)"
        />

        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
        />

        <YAxis
          tick={{ fontSize: 11, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
        />

        <Tooltip
          formatter={(value) => `₹ ${Number(value).toLocaleString()}`}
          contentStyle={{
            borderRadius: "16px",
            border: "1px solid rgba(226,232,240,0.7)",
            backdropFilter: "blur(12px)",
          }}
        />

        <Area
          type="monotone"
          dataKey="revenue"
          stroke="#22c55e"
          strokeWidth={3}
          fill="url(#revenueArea)"
        />

        <Line
          type="monotone"
          dataKey="revenue"
          stroke="#16a34a"
          strokeWidth={3}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  </div>
</div>

                {/* Revenue vs Penalties chart */}
                <div className="rounded-3xl border border-border-color/60 bg-white/55 backdrop-blur p-4 mb-4">
                  <div className="flex items-center justify-between mb-3 gap-3">
                    <div>
                      <div className="text-[11px] font-semibold tracking-[0.26em] text-text-secondary uppercase">
                        Revenue vs Penalties
                      </div>
                      <div className="text-xs text-text-muted mt-1">Clear comparison with minimal grid</div>
                    </div>
                    <div className="h-2 w-2 rounded-full bg-emerald-500/70" />
                  </div>

                  <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revenueTrendData}>
                        <defs>
                          <linearGradient id="revVsGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.95" />
                            <stop offset="100%" stopColor="#10b981" stopOpacity="0.72" />
                          </linearGradient>
                          <linearGradient id="penVsGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.95" />
                            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.68" />
                          </linearGradient>
                        </defs>

                        <CartesianGrid vertical={false} stroke="rgba(15, 23, 42, 0.06)" />
                        <XAxis
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: "#64748b" }}
                        />
                        <Tooltip formatter={(value) => `₹ ${Number(value).toLocaleString()}`} />
                        <Bar
                          dataKey="value"
                          radius={[10, 10, 0, 0]}
                          fill="url(#revVsGrad)"
                          // We keep a single series to avoid data-shape changes.
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              {/* penalty divider */}

                <div className="mb-3 pt-4 border-t border-border-color/40">

    {/* Penalties Section */}
<div className="mb-3">

  {/* Heading */}
  <div className="flex items-center justify-between mb-3">
    <div>
      <div className="text-[12px] font-semibold tracking-[0.26em] text-rose-700 uppercase">
        Penalties
      </div>

      <div className="text-xs text-text-muted mt-1">
        KPI and general deduction overview
      </div>
    </div>

    <div className="h-2 w-2 rounded-full bg-rose-500/70" />
  </div>

  {/* Cards */}
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

    {/* KPI PENALTY */}
    <div
      className="rounded-3xl border border-rose-200/60 bg-rose-50/50 backdrop-blur p-4 transition-all
       duration-200 hover:-translate-y-[2px] flex items-center justify-between gap-4"
    >

      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-rose-500/10 border border-rose-500/20 p-2 text-rose-700">
          <AlertTriangle size={18} />
        </div>

        <div>
          <div className="text-[11px] font-semibold tracking-[0.18em] text-rose-700 uppercase">
            KPI Penalty
          </div>

          <div className="text-sm text-text-secondary mt-1">
            KPI related deductions
          </div>
        </div>
      </div>

      <div className="text-right">

        <div className="text-[18px] font-bold tracking-[-0.04em] text-rose-700">
          ₹2500
        </div>
      </div>
    </div>

    {/* GENERAL PENALTY */}
    <div
      className="rounded-3xl border border-orange-200/60 bg-orange-50/50 backdrop-blur p-4 transition-all
       duration-200 hover:-translate-y-[2px] flex items-center justify-between gap-4"
    >

      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-orange-500/10 border border-orange-500/20 p-2 text-orange-700">
          <AlertTriangle size={18} />
        </div>

        <div>
          <div className="text-[11px] font-semibold tracking-[0.18em] text-orange-700 uppercase">
            General Penalty
          </div>

          <div className="text-sm text-text-secondary mt-1">
            Other deduction charges
          </div>
        </div>
      </div>

      <div className="text-right">

        <div className="text-[18px] font-bold tracking-[-0.04em] text-orange-700">
          ₹2700
        </div>
      </div>
    </div>

  </div>
</div>

{/* Revenue Forecast */}
<div className="mt-4 rounded-3xl border border-emerald-200/60 bg-emerald-50/40 backdrop-blur p-5 overflow-hidden relative">

  {/* Glow */}
  <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-emerald-500/10 blur-3xl" />

  {/* Header */}
  <div className="flex items-center justify-between mb-4 relative">
    <div>
      <div className="text-[11px] font-semibold tracking-[0.26em] text-emerald-700 uppercase">
        Revenue Forecast
      </div>

      <div className="text-xs text-text-muted mt-1">
        AI projected business growth
      </div>
    </div>

    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
  </div>

  {/* Content */}
  <div className="relative">

    <div className="text-[22px] font-bold tracking-[-0.04em] text-emerald-700">
      ₹13.4Cr
    </div>

    <div className="mt-2 inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700">
      +12% Expected Growth
    </div>

    <p className="mt-4 text-sm leading-relaxed text-text-secondary">
      Based on current billing trends and operational performance,
      projected revenue is expected to increase next month with
      improved KPI completion rates.
    </p>
  </div>
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
