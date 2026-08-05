import React, { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, ChevronDown, RefreshCw, Sparkles } from "lucide-react";
import toast from "react-hot-toast";

import { authFetch, buildApiUrl } from "../lib/api";
import { getStoredSession } from "../lib/session";
import { cmpGroups, circleLabelFromTitle } from "../lib/cmpGroups";
import { HrDashboardCircleContext } from "../components/hrDashboard/hrDashboardCircleContext";
import DrilldownModal from "../components/hrDashboard/DrilldownModal";

import KpiCardsRow from "../components/hrAnalyticsV2/KpiCardsRow";
import WorkforceOverviewFunnel from "../components/hrAnalyticsV2/WorkforceOverviewFunnel";
import CircleWorkforcePanel from "../components/hrAnalyticsV2/CircleWorkforcePanel";
import CmpAnalyticsPanel from "../components/hrAnalyticsV2/CmpAnalyticsPanel";
import DesignationAnalytics from "../components/hrAnalyticsV2/DesignationAnalytics";
import ShortageSurplusLists from "../components/hrAnalyticsV2/ShortageSurplusLists";
import JoiningAnalytics from "../components/hrAnalyticsV2/JoiningAnalytics";
import AvailableEmployeeTrend from "../components/hrAnalyticsV2/AvailableEmployeeTrend";
import PayrollAnalytics from "../components/hrAnalyticsV2/PayrollAnalytics";
import SmartInsights from "../components/hrAnalyticsV2/SmartInsights";
import { monthOptions, quarterOptions } from "../components/hrAnalyticsV2/trendUtils";

const ALL_CIRCLE_KEYS = new Set(["", "all", "allcircle", "allcircles"]);
const normalizeCircle = (value = "") =>
  value.replace("Uttar Pradesh (East)", "UP East").replace(/\s+/g, "").toLowerCase().trim();

const allCircleLabels = cmpGroups.map((group) => circleLabelFromTitle(group.title));

const EMPTY_OVERVIEW = { kpis: {}, previous: null, monthlyTrend: [] };

// Temporarily hidden per request — flip back to true to bring the Offered
// Salary Analytics section back. Also skips its API call while hidden.
const SHOW_OFFERED_SALARY_SECTION = false;

export default function HrAnalyticsV2() {
  const sessionUser = useMemo(() => getStoredSession(), []);
  const rawUserCircle = sessionUser?.circle || "";
  const isAllCircleUser = ALL_CIRCLE_KEYS.has(normalizeCircle(rawUserCircle));

  const userCircleLabel = useMemo(() => {
    if (isAllCircleUser) return null;
    const userKey = normalizeCircle(rawUserCircle);
    return allCircleLabels.find((label) => normalizeCircle(label) === userKey) || null;
  }, [rawUserCircle, isAllCircleUser]);

  const allowedCircleLabels = useMemo(
    () => (isAllCircleUser ? allCircleLabels : userCircleLabel ? [userCircleLabel] : []),
    [isAllCircleUser, userCircleLabel]
  );

  const [selectedCircle, setSelectedCircle] = useState("");
  const [selectedCmp, setSelectedCmp] = useState("");
  const [selectedDesignation, setSelectedDesignation] = useState("");
  const [trendMonths, setTrendMonths] = useState("18");
  // Mutually exclusive: picking a Month clears Quarter and vice versa. Scopes
  // the New Joining / Resignation Analytics panels to that specific period
  // (client-side, from the already-fetched trend rows) instead of always
  // showing Today/This Week/This Month/etc relative to right now.
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedQuarter, setSelectedQuarter] = useState("");
  const monthOptionsList = useMemo(() => monthOptions(24), []);
  const quarterOptionsList = useMemo(() => quarterOptions(8), []);

  useEffect(() => {
    if (!isAllCircleUser && userCircleLabel) setSelectedCircle(userCircleLabel);
  }, [isAllCircleUser, userCircleLabel]);

  const cmpOptions = useMemo(
    () =>
      cmpGroups
        .filter((group) =>
          selectedCircle ? group.title.toLowerCase().includes(selectedCircle.toLowerCase()) : true
        )
        .flatMap((group) => group.items),
    [selectedCircle]
  );

  const [designationOptions, setDesignationOptions] = useState([]);
  const [overview, setOverview] = useState(EMPTY_OVERVIEW);
  const [circles, setCircles] = useState([]);
  const [cmps, setCmps] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [joiningRows, setJoiningRows] = useState([]);
  const [resignationRows, setResignationRows] = useState([]);
  const [payroll, setPayroll] = useState(null);
  const [insights, setInsights] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);

  const [drilldown, setDrilldown] = useState(null);

  const abortRef = useRef(null);

  const fetchJson = async (path, signal) => {
    const response = await authFetch(buildApiUrl(path), { signal });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : null;
    if (!response.ok) throw new Error(payload?.message || "Failed to load HR Analytics data.");
    return payload;
  };

  useEffect(() => {
    let cancelled = false;
    fetchJson("/api/hr-analytics-v2/designation-options")
      .then((res) => {
        if (!cancelled && res?.success) setDesignationOptions(res.data || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = async ({ silent = false } = {}) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!silent) setRefreshing(true);

    const params = new URLSearchParams();
    if (selectedCircle) params.set("circle", selectedCircle);
    if (selectedCmp) params.set("cmp", selectedCmp);
    if (selectedDesignation) params.set("designation", selectedDesignation);
    const query = params.toString();
    const trendParams = new URLSearchParams(params);
    trendParams.set("months", trendMonths);

    try {
      const [
        overviewRes,
        circlesRes,
        cmpsRes,
        designationsRes,
        joiningRes,
        resignationRes,
        payrollRes,
        insightsRes,
      ] = await Promise.all([
        fetchJson(`/api/hr-analytics-v2/overview?${query}`, controller.signal),
        fetchJson(`/api/hr-analytics-v2/circles?${query}`, controller.signal),
        fetchJson(`/api/hr-analytics-v2/cmps?${query}`, controller.signal),
        fetchJson(`/api/hr-analytics-v2/designations?${query}`, controller.signal),
        fetchJson(`/api/hr-analytics-v2/joining-trend?${trendParams.toString()}`, controller.signal),
        fetchJson(`/api/hr-analytics-v2/resignation-trend?${trendParams.toString()}`, controller.signal),
        SHOW_OFFERED_SALARY_SECTION ? fetchJson(`/api/hr-analytics-v2/payroll?${query}`, controller.signal) : Promise.resolve(null),
        fetchJson(`/api/hr-analytics-v2/insights?${query}`, controller.signal),
      ]);

      setOverview(overviewRes?.success ? overviewRes.data : EMPTY_OVERVIEW);
      setCircles(circlesRes?.success ? circlesRes.data || [] : []);
      setCmps(cmpsRes?.success ? cmpsRes.data || [] : []);
      setDesignations(designationsRes?.success ? designationsRes.data || [] : []);
      setJoiningRows(joiningRes?.success ? joiningRes.data || [] : []);
      setResignationRows(resignationRes?.success ? resignationRes.data || [] : []);
      setPayroll(payrollRes?.success ? payrollRes.data : null);
      setInsights(insightsRes?.success ? insightsRes.data || [] : []);
      setLastRefreshedAt(new Date());
    } catch (error) {
      if (error?.name === "AbortError") return;
      console.error(error);
      toast.error("Unable to refresh HR Analytics. Please try again.", { id: "hr-analytics-v2-error" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void refresh();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCircle, selectedCmp, selectedDesignation, trendMonths]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refresh({ silent: true });
    }, 60000);
    return () => window.clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCircle, selectedCmp, selectedDesignation, trendMonths]);

  const resetFilters = () => {
    setSelectedCircle(isAllCircleUser ? "" : userCircleLabel || "");
    setSelectedCmp("");
    setSelectedDesignation("");
    setTrendMonths("18");
    setSelectedMonth("");
    setSelectedQuarter("");
  };

  const periodFilter = selectedMonth ? { month: selectedMonth } : selectedQuarter ? { quarter: selectedQuarter } : null;
  const periodLabel = selectedMonth
    ? monthOptionsList.find((o) => o.value === selectedMonth)?.label
    : selectedQuarter
    ? quarterOptionsList.find((o) => o.value === selectedQuarter)?.label
    : "";

  const circleContextValue = useMemo(
    () => ({ isAllCircleUser, userCircleLabel, allowedCircleLabels }),
    [isAllCircleUser, userCircleLabel, allowedCircleLabels]
  );

  return (
    <HrDashboardCircleContext.Provider value={circleContextValue}>
      <div className="min-h-screen space-y-4">
        {/* HEADER */}
        <div className="relative overflow-hidden rounded-[14px] border border-white/70 bg-[linear-gradient(96deg,_#0f172a_0%,_#4f46e5_55%,_#7c3aed_100%)] px-4 py-3 text-white">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.18),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.12),_transparent_24%)]" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] border border-white/20 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] backdrop-blur-xl">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <h1 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] md:text-sm">
                  HR Analytics V2 <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                </h1>
                <p className="text-xs text-white/85 md:text-sm">
                  Real-Time Workforce Intelligence & Decision Support Platform
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-white/85">
              <span>
                Last Refreshed:{" "}
                <span className="font-semibold text-white">
                  {lastRefreshedAt ? lastRefreshedAt.toLocaleTimeString() : "--"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 disabled:opacity-70"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                Refresh Page
              </button>
            </div>
          </div>
        </div>

        {/* FILTER BAR */}
        <div className="rounded-[12px] border border-border-color/70 bg-surface/90 p-2 backdrop-blur-xl">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_0.8fr_0.6fr]">
            <div className="relative">
              <select
                value={selectedCircle}
                onChange={(e) => {
                  setSelectedCircle(e.target.value);
                  setSelectedCmp("");
                }}
                disabled={!isAllCircleUser}
                className="h-9 w-full appearance-none rounded-[10px] border border-border-color bg-surface px-3 pr-8 text-[13px] text-text-secondary outline-none transition focus:border-indigo-300 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isAllCircleUser && <option value="">All Circles</option>}
                {allowedCircleLabels.map((label) => (
                  <option key={label} value={label}>{label}</option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            </div>

            <div className="relative">
              <select
                value={selectedCmp}
                onChange={(e) => setSelectedCmp(e.target.value)}
                className="h-9 w-full appearance-none rounded-[10px] border border-border-color bg-surface px-3 pr-8 text-[13px] text-text-secondary outline-none transition focus:border-indigo-300"
              >
                <option value="">All CMPs</option>
                {cmpOptions.map((cmp) => (
                  <option key={cmp} value={cmp}>{cmp}</option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            </div>

            <div className="relative">
              <select
                value={selectedDesignation}
                onChange={(e) => setSelectedDesignation(e.target.value)}
                className="h-9 w-full appearance-none rounded-[10px] border border-border-color bg-surface px-3 pr-8 text-[13px] text-text-secondary outline-none transition focus:border-indigo-300"
              >
                <option value="">All Designations</option>
                {designationOptions.map((option) => (
                  <option key={option.roleKey} value={option.roleKey}>{option.roleLabel}</option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            </div>

            <div className="relative">
              <select
                value={trendMonths}
                onChange={(e) => setTrendMonths(e.target.value)}
                className="h-9 w-full appearance-none rounded-[10px] border border-border-color bg-surface px-3 pr-8 text-[13px] text-text-secondary outline-none transition focus:border-indigo-300"
              >
                <option value="6">Trend: 6 Months</option>
                <option value="12">Trend: 12 Months</option>
                <option value="18">Trend: 18 Months</option>
                <option value="36">Trend: 36 Months</option>
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            </div>

            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-[10px] bg-[linear-gradient(96deg,_#3b82f6_0%,_#7c3aed_100%)] px-3 text-sm font-semibold text-white transition hover:brightness-105"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>

          <div className="mt-2 flex flex-col gap-2 border-t border-border-color/60 pt-2 sm:flex-row sm:flex-wrap sm:items-center">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              Period (New Joining &amp; Resignation panels):
            </span>

            <div className="relative">
              <select
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(e.target.value);
                  if (e.target.value) setSelectedQuarter("");
                }}
                className="h-8 w-full appearance-none rounded-[10px] border border-border-color bg-surface px-3 pr-8 text-[12px] text-text-secondary outline-none transition focus:border-indigo-300 sm:w-40"
              >
                <option value="">Month: Live</option>
                {monthOptionsList.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            </div>

            <div className="relative">
              <select
                value={selectedQuarter}
                onChange={(e) => {
                  setSelectedQuarter(e.target.value);
                  if (e.target.value) setSelectedMonth("");
                }}
                className="h-8 w-full appearance-none rounded-[10px] border border-border-color bg-surface px-3 pr-8 text-[12px] text-text-secondary outline-none transition focus:border-indigo-300 sm:w-36"
              >
                <option value="">Quarter: Live</option>
                {quarterOptionsList.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            </div>

            {periodFilter && (
              <button
                type="button"
                onClick={() => {
                  setSelectedMonth("");
                  setSelectedQuarter("");
                }}
                className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Clear period
              </button>
            )}
          </div>
        </div>

        <KpiCardsRow overview={overview} loading={loading} showOfferedSalary={SHOW_OFFERED_SALARY_SECTION} />
        <WorkforceOverviewFunnel overview={overview} loading={loading} showOfferedSalary={SHOW_OFFERED_SALARY_SECTION} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
 <div className="lg:col-span-2">
            <CircleWorkforcePanel
              circles={circles}
              loading={loading}
              selectedCircle={selectedCircle}
              onSelectCircle={(circle) => isAllCircleUser && setSelectedCircle(circle)}
              showOfferedSalary={SHOW_OFFERED_SALARY_SECTION}
            />
          </div>
          
        </div>
        <CmpAnalyticsPanel
          cmps={cmps}
          loading={loading}
          onOpenDrilldown={(scope) =>
            setDrilldown({ panel: "physical", clickedMetric: "designation", ...scope })
          }
          showOfferedSalary={SHOW_OFFERED_SALARY_SECTION}
        />

        <DesignationAnalytics designations={designations} loading={loading} />

        <ShortageSurplusLists cmps={cmps} loading={loading} />

        <JoiningAnalytics rows={joiningRows} loading={loading} periodFilter={periodFilter} periodLabel={periodLabel} />
        <AvailableEmployeeTrend monthlyTrend={overview?.monthlyTrend} loading={loading} />

        {SHOW_OFFERED_SALARY_SECTION && <PayrollAnalytics payroll={payroll} loading={loading} />}

        <SmartInsights insights={insights} loading={loading} />

        <DrilldownModal isOpen={Boolean(drilldown)} scope={drilldown} onClose={() => setDrilldown(null)} />
      </div>
    </HrDashboardCircleContext.Provider>
  );
}
