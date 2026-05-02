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

        <div className="rounded-[26px] bg-gray-100 border border-border-color/60 bg-white/40 backdrop-blur-xl shadow-panel p-5 overflow-hidden">
          <div className="flex flex-col lg:flex-row gap-4">

            {/* Left Panel: Month performance + AI + chart */}

            <div className="flex-1 lg:pr-2 relative overflow-hidden py-2">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-[11px] font-semibold tracking-[0.26em] text-indigo-600 uppercase">
                  Billing Insights
                </h3>
                <div className="h-1 w-24 rounded-full bg-gradient-to-r from-emerald-500/40 via-indigo-500/40 to-amber-400/30" />
              </div>

              {/* KPI row (premium completion summary) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="rounded-2xl border border-border-color/60 bg-white/60 backdrop-blur p-4 transition hover:-translate-y-[2px] hover:shadow-panel">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-semibold tracking-[0.18em] text-text-secondary uppercase">
                      Avg Completion
                    </div>
                    <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2 text-emerald-700">
                      <Percent size={16} />
                    </div>
                  </div>
                  <div className="mt-2 text-[22px] font-extrabold tracking-[-0.03em] text-emerald-800">
                    {avgCompletion}%
                  </div>
                </div>

                <div className="rounded-2xl border border-border-color/60 bg-white/60 backdrop-blur p-4 transition hover:-translate-y-[2px] hover:shadow-panel">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-semibold tracking-[0.18em] text-text-secondary uppercase">
                      Best Month
                    </div>
                    <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2 text-emerald-700">
                      <TrendingUp size={16} />
                    </div>
                  </div>
                  <div className="mt-2 text-[16px] font-bold text-text-primary">
                    {bestMonth?.month || "-"}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-emerald-700">
                    {bestMonth ? `${bestMonth.percent}% done` : ""}
                  </div>
                </div>

                <div className="rounded-2xl border border-border-color/60 bg-white/60 backdrop-blur p-4 transition hover:-translate-y-[2px] hover:shadow-panel">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-semibold tracking-[0.18em] text-text-secondary uppercase">
                      Needs Attention
                    </div>
                    <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-2 text-rose-700">
                      <TrendingDown size={16} />
                    </div>
                  </div>
                  <div className="mt-2 text-[16px] font-bold text-text-primary">
                    {worstMonth?.month || "-"}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-rose-600">
                    {worstMonth ? `${worstMonth.percent}% done` : ""}
                  </div>
                </div>
              </div>

              {/* AI Insight card */}
              <div className="mb-3 rounded-3xl border border-indigo-100 bg-gradient-to-r from-indigo-50/90 via-white/70 to-blue-50/90 backdrop-blur px-4 py-2 transition hover:shadow-panel">
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
                    <div className="text-[11px] font-semibold tracking-[0.26em] text-text-secondary uppercase">
                      Done vs Pending
                    </div>
                    <div className="text-xs text-text-muted mt-1">Smooth completion overview by month</div>
                  </div>
                  <div className="h-2 w-2 rounded-full bg-emerald-500/70" />
                </div>

                <div className="h-40">
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

              {/* Left Panel: Month Performance Widgets */}
              <div className="rounded-3xl border border-border-color/60 bg-white/40 backdrop-blur p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-[11px] font-semibold tracking-[0.26em] text-text-secondary uppercase">
                      Month Performance
                    </div>
                    <div className="text-xs text-text-muted mt-1">Premium progress cards with completion rate</div>
                  </div>
                  <div className="h-8 w-8 rounded-2xl bg-amber-300/10 border border-amber-300/20 flex items-center justify-center">
                    <Hash size={14} />
                  </div>
                </div>

                <div className="space-y-2">
                  {trendData.slice(0, visibleCount).map((item) => (
                    <div
                      key={item.month}
                      className="group rounded-2xl bg-white/60 border border-border-color/60 px-4 py-3 shadow-sm transition-all duration-200 hover:-translate-y-[2px] hover:shadow-panel"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold text-text-primary">{item.month}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-extrabold text-emerald-800">{item.percent}%</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-400/20">
                            Done Rate
                          </span>
                        </div>
                      </div>

                      <div className="mt-1 h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/70">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-indigo-400 transition-all duration-700 ease-out"
                          style={{ width: `${item.percent}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-2 text-emerald-700 text-xs font-semibold">
                          <span className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-1 flex items-center justify-center">
                            <CheckCircle size={14} />
                          </span>
                          <span>{item.done}</span>
                        </div>

                        <div className="flex items-center gap-2 text-amber-600 text-xs font-semibold">
                          <span className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-1 flex items-center justify-center">
                            <Clock size={14} />
                          </span>
                          <span>{item.pending}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {trendData.length > 3 && (
                  <div className="flex justify-center mt-4">
                    <button
                      onClick={() => setVisibleCount(visibleCount === 3 ? trendData.length : 3)}
                      className="text-xs px-4 py-2 rounded-full border border-border-color/70 bg-white/60 backdrop-blur shadow-sm hover:bg-indigo-50 transition-all duration-200 hover:shadow-panel text-indigo-700 font-semibold"
                    >
                      {visibleCount === 3 ? "Show More" : "Show Less"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Panel: Premium KPI cards, revenue insight, penalties */}
            <div className="flex-1 lg:border-l lg:border-r border-border-color/60 px-0 lg:px-4 flex flex-col">
              {/* KPI CARDS (Premium glass cards) */}
              <div className="py-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div className="rounded-3xl border border-border-color/60 bg-white/55 backdrop-blur p-5 transition-all duration-200 hover:-translate-y-[2px] hover:shadow-panel relative overflow-hidden">
                    <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-emerald-500/10 blur-2xl" />
                    <div className="flex items-start justify-between gap-3 relative">
                      <div>
                        <div className="text-[11px] font-semibold tracking-[0.26em] text-text-secondary uppercase">
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

                  <div className="rounded-3xl border border-border-color/60 bg-white/55 backdrop-blur p-5 transition-all duration-200 hover:-translate-y-[2px] hover:shadow-panel relative overflow-hidden">
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

                  <div className="rounded-3xl border border-border-color/60 bg-white/55 backdrop-blur p-5 transition-all duration-200 hover:-translate-y-[2px] hover:shadow-panel">
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

                  <div className="rounded-3xl border border-border-color/60 bg-white/55 backdrop-blur p-5 transition-all duration-200 hover:-translate-y-[2px] hover:shadow-panel">
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

                {/* Penalties (Premium red card) */}
                <div className="rounded-3xl border border-rose-200/60 bg-rose-50/50 backdrop-blur p-4
                 shadow-soft transition-all duration-200 hover:-translate-y-[2px] hover:shadow-panel flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-rose-500/10 border border-rose-500/20 p-2 text-rose-700">
                      <AlertTriangle size={20} />
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold tracking-[0.26em] text-rose-700 uppercase">
                        Penalties
                      </div>
                      <div className="text-sm text-text-secondary mt-1">Total deductions applied</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] font-semibold text-rose-700/80">Highlighted</div>
                    <div className="text-[22px] font-bold tracking-[-0.04em] text-rose-700">
                      ₹{summary.penalties}
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
