import React, { useEffect, useMemo, useState, useCallback } from "react";
import axios from "axios";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { buildApiUrl } from "../lib/api";

import DashboardHeader from "../components/billingDashboard/DashboardHeader";
import RevenueAnalyticsCard from "../components/billingDashboard/RevenueAnalyticsCard";
import PmLossAnalyticsCard from "../components/billingDashboard/PmLossAnalyticsCard";
import PenaltyPlaceholder from "../components/billingDashboard/PenaltyPlaceholder";
import DomainPerformance from "../components/billingDashboard/DomainPerformance";
import CircleLeaderboard from "../components/billingDashboard/CircleLeaderboard";
import QuickInsights from "../components/billingDashboard/QuickInsights";
import MonthlyProgressPanel from "../components/billingDashboard/MonthlyProgressPanel";
import { CARD_SHELL } from "../components/billingDashboard/theme";

const AUTO_REFRESH_INTERVAL_MS = 60000;

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
  const [lastUpdated, setLastUpdated] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // "YYYY-MM" of the most recently uploaded revenue file — the ONLY reliable
  // source for which real-world month /api/billing/summary and
  // /api/revenue/kpi-data actually describe, since neither endpoint returns
  // that month in its response (both just silently use MAX(billing_month)).
  const [latestBillingMonth, setLatestBillingMonth] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const authHeaders = { Authorization: `Bearer ${localStorage.getItem("token")}` };

      const params = {
        circle: circleFilter || undefined,
        billing_type: billingFilter || undefined,
        months: timeFilter || undefined,
      };

      const [summaryRes, statusRes, rankingRes] = await Promise.all([
        axios.get(buildApiUrl("/api/billing/summary"), { headers: authHeaders, params }),
        axios.get(buildApiUrl("/api/billing/status"), { headers: authHeaders, params }),
        axios.get(buildApiUrl("/api/billing/circle-ranking"), { headers: authHeaders, params }),
      ]);

      setSummary(summaryRes.data);
      setStatusData(statusRes.data);
      setCircleRankingData(rankingRes.data);
    } catch (err) {
      console.error(err);
    }
  }, [circleFilter, billingFilter, timeFilter]);

  const fetchRevenueKpi = useCallback(async () => {
    try {
      setRevenueLoading(true);
      const authHeaders = { Authorization: `Bearer ${localStorage.getItem("token")}` };

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
  }, [circleFilter, timeFilter, billingFilter]);

  const fetchLatestBillingMonth = useCallback(async () => {
    try {
      const authHeaders = { Authorization: `Bearer ${localStorage.getItem("token")}` };
      // No circle param: /api/billing/summary's MAX(billing_month) is global,
      // not scoped to the circle filter, so this must match that same scope.
      const { data } = await axios.get(buildApiUrl("/api/revenue/upload-history"), { headers: authHeaders });
      const uploadedMonths = (Array.isArray(data) ? data : [])
        .map((row) => row?.billing_month)
        .filter(Boolean)
        .sort(); // "YYYY-MM" strings sort correctly lexicographically
      setLatestBillingMonth(uploadedMonths.length ? uploadedMonths[uploadedMonths.length - 1] : null);
    } catch (err) {
      console.error(err);
      setLatestBillingMonth(null);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchData(), fetchRevenueKpi(), fetchLatestBillingMonth()]);
    setLastUpdated(new Date());
    setRefreshing(false);
  }, [fetchData, fetchRevenueKpi, fetchLatestBillingMonth]);

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circleFilter, billingFilter, timeFilter]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const id = setInterval(refreshAll, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoRefresh, refreshAll]);

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

  const monthMap = {
    January: "Jan", February: "Feb", March: "Mar", April: "Apr",
    May: "May", June: "Jun", July: "Jul", August: "Aug",
    September: "Sep", October: "Oct", November: "Nov", December: "Dec",
  };

  const filteredMonths = getFilteredMonths();

  // Which visible month label (if any) the latest upload actually belongs to.
  // Matches by real calendar offset, not just month name, so a stale upload
  // from a prior year can never be mistaken for "this Jul" in a rolling
  // window. Returns null (not a guess) whenever we can't be certain.
  const resolveDataMonth = () => {
    if (!latestBillingMonth) return null;
    const [yearStr, monthStr] = latestBillingMonth.split("-");
    const latestYear = Number(yearStr);
    const latestMonthIdx = Number(monthStr) - 1; // 0-11
    if (!Number.isInteger(latestYear) || latestMonthIdx < 0 || latestMonthIdx > 11) return null;

    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonthIdx = today.getMonth();

    if (timeFilter === "12") {
      // The 12-month view is a static Jan..Dec label set with no year
      // markers — only safe to match when the upload is from this year.
      return latestYear === todayYear ? months[latestMonthIdx] : null;
    }

    // Rolling 3/6-month window: filteredMonths[i] unambiguously means
    // "i months before today" — require an exact offset match.
    const offset = (todayYear * 12 + todayMonthIdx) - (latestYear * 12 + latestMonthIdx);
    return offset >= 0 && offset < filteredMonths.length ? filteredMonths[offset] : null;
  };

  const currentMonth = resolveDataMonth();

  const latestBillingMonthLabel = latestBillingMonth
    ? new Date(`${latestBillingMonth}-01`).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null;

  // Revenue/PM Loss only have a real figure for the latest uploaded month (the
  // backend always queries MAX(billing_month), ignoring the months filter) —
  // every other month in the selected range has no data, not a real zero.
  const revenueTrendSeries = filteredMonths.map((month) => ({
    month,
    hasData: month === currentMonth,
    value: month === currentMonth ? Number((Number(revenueKpi.totalRevenue || 0) / 10000000).toFixed(2)) : null,
  }));

  const pmLossTrendSeries = filteredMonths.map((month) => ({
    month,
    hasData: month === currentMonth,
    value: month === currentMonth ? Number((Number(summary?.pm_loss || 0) / 10000000).toFixed(2)) : null,
  }));

  // No penalty API yet — every month is "no data".
  const penaltyTrendSeries = filteredMonths.map((month) => ({ month, hasData: false, value: null }));

  // ✅ MONTH-WISE DONE / PENDING CALCULATION (unchanged formula)
  const monthStats = {};
  statusData.forEach((row) => {
    const month = monthMap[row.month] || row.month;
    if (!filteredMonths.includes(month)) return;
    if (circleFilter && row.circle !== circleFilter) return;
    if (billingFilter && row.billing_type !== billingFilter) return;

    if (!monthStats[month]) monthStats[month] = { done: 0, pending: 0 };
    ["sixty", "forty", "kpi"].forEach((key) => {
      if (row[key] === "Done") monthStats[month].done++;
      else monthStats[month].pending++;
    });
  });

  const circleOptions = [...new Set(statusData.map((r) => r.circle).filter(Boolean))];
  const billingOptions = [...new Set(statusData.map((r) => r.billing_type).filter(Boolean))];

  const chartData = filteredMonths
    .filter((m) => monthStats[m])
    .map((month) => {
      const stats = monthStats[month];
      const total = stats.done + stats.pending;
      const percent = total ? Math.round((stats.done / total) * 100) : 0;
      return { month, done: stats.done, pending: stats.pending, percent };
    });

  const revenueInsight = useMemo(() => {
    const revenue = Number(revenueKpi.totalRevenue || 0);
    const penalties = Number(summary?.penalties || 0);
    const net = revenue - penalties;
    const timeLabel = timeFilter === "3" ? "last 3 months" : timeFilter === "6" ? "last 6 months" : "last year";
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

  // Average completion
  const avgCompletion =
    chartData.length > 0
      ? Math.round(chartData.reduce((acc, cur) => acc + cur.percent, 0) / chartData.length)
      : 0;

  // ✅ TREND LOGIC (unchanged)
  const trendData = chartData.map((item, index) => {
    if (index === 0) return { ...item, trend: 0 };
    const prev = chartData[index - 1];
    return { ...item, trend: item.percent - prev.percent };
  });

  const sorted = [...chartData].sort((a, b) => b.percent - a.percent);
  const bestMonth = sorted[0];
  const worstMonth = sorted[sorted.length - 1];

  // ✅ AI SUMMARY (unchanged)
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

  // ✅ Per-circle Done/Pending/Total — computed once (was duplicated 4x inline before)
  const circleStats = useMemo(
    () =>
      circleOptions.map((circle) => {
        const rows = statusData.filter((r) => r.circle === circle);
        let done = 0;
        let pending = 0;
        rows.forEach((row) => {
          ["sixty", "forty", "kpi"].forEach((key) => {
            if (row[key] === "Done") done++;
            else pending++;
          });
        });
        const total = done + pending;
        const percent = total ? Math.round((done / total) * 100) : 0;
        return { circle, done, pending, total, percent };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statusData, circleOptions.join("|")]
  );

  // ✅ Domain performance — real billing_type rows matched against domain names, honoring active filters
  const domainCompletion = useMemo(() => {
    const domains = ["FTTx", "Fiber", "Tower"];
    const result = {};
    domains.forEach((domain) => {
      let done = 0;
      let pending = 0;
      statusData.forEach((row) => {
        if (row.billing_type !== domain) return;
        const month = monthMap[row.month] || row.month;
        if (!filteredMonths.includes(month)) return;
        if (circleFilter && row.circle !== circleFilter) return;
        if (billingFilter && row.billing_type !== billingFilter) return;
        ["sixty", "forty", "kpi"].forEach((key) => {
          if (row[key] === "Done") done++;
          else pending++;
        });
      });
      const total = done + pending;
      result[domain] = { done, pending, percent: total ? Math.round((done / total) * 100) : 0 };
    });
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusData, filteredMonths.join("|"), circleFilter, billingFilter]);

  const handleReset = () => {
    setTimeFilter("3");
    setCircleFilter("");
    setBillingFilter("");
  };

  const handleExport = () => {
    const wb = XLSX.utils.book_new();

    const monthlySheet = XLSX.utils.json_to_sheet(
      chartData.map((m) => ({ Month: m.month, Done: m.done, Pending: m.pending, "Completion %": m.percent }))
    );
    XLSX.utils.book_append_sheet(wb, monthlySheet, "Monthly Completion");

    const circleSheet = XLSX.utils.json_to_sheet(
      circleStats.map((c) => ({
        Circle: c.circle,
        Done: c.done,
        Pending: c.pending,
        Total: c.total,
        "Completion %": c.percent,
      }))
    );
    XLSX.utils.book_append_sheet(wb, circleSheet, "Circle Progress");

    const rankingSheet = XLSX.utils.json_to_sheet(
      circleRankingData.map((r) => ({
        Rank: r.rank,
        Circle: r.circle,
        "Revenue (Cr)": r.revenue,
        "Billing %": r.efficiency ?? "",
      }))
    );
    XLSX.utils.book_append_sheet(wb, rankingSheet, "Circle Ranking");

    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    saveAs(
      new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      `Billing_Dashboard_${stamp}.xlsx`
    );
  };

  if (!summary) {
    return <div className="p-6 text-sm text-text-muted">Loading billing dashboard...</div>;
  }

  return (
    <div className="relative min-h-screen">
      <div className="relative mx-auto max-w-[1400px] space-y-8 pb-8">
        <DashboardHeader
          timeFilter={timeFilter}
          setTimeFilter={setTimeFilter}
          circleFilter={circleFilter}
          setCircleFilter={setCircleFilter}
          billingFilter={billingFilter}
          setBillingFilter={setBillingFilter}
          circleOptions={circleOptions}
          billingOptions={billingOptions}
          onReset={handleReset}
          lastUpdated={lastUpdated}
          autoRefresh={autoRefresh}
          onToggleAutoRefresh={() => setAutoRefresh((v) => !v)}
          onRefresh={refreshAll}
          onExport={handleExport}
          refreshing={refreshing}
        />

        <div className={`${CARD_SHELL} overflow-hidden`}>
          <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border-color/60">
            <RevenueAnalyticsCard
              revenueKpi={revenueKpi}
              summary={summary}
              insight={revenueInsight}
              loading={revenueLoading}
              trendSeries={revenueTrendSeries}
              latestBillingMonthLabel={latestBillingMonthLabel}
            />
            <PmLossAnalyticsCard summary={summary} trendSeries={pmLossTrendSeries} latestBillingMonthLabel={latestBillingMonthLabel} />
            <PenaltyPlaceholder trendSeries={penaltyTrendSeries} />
          </div>
        </div>

        <DomainPerformance summary={summary} domainCompletion={domainCompletion} />

        <MonthlyProgressPanel
          chartData={chartData}
          avgCompletion={avgCompletion}
          aiSummary={aiSummary}
          bestMonth={bestMonth}
          worstMonth={worstMonth}
          circleStats={circleStats}
        />

        <CircleLeaderboard circleRankingData={circleRankingData} />

        <QuickInsights circleRankingData={circleRankingData} summary={summary} circleStats={circleStats} />
      </div>
    </div>
  );
}
