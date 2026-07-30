import React from "react";
import {
  LayoutDashboard,
  CalendarDays,
  ChevronDown,
  RefreshCcw,
  Download,
  Radio,
} from "lucide-react";

function formatLastUpdated(date) {
  if (!date) return "—";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function DashboardHeader({
  timeFilter,
  setTimeFilter,
  circleFilter,
  setCircleFilter,
  billingFilter,
  setBillingFilter,
  circleOptions,
  billingOptions,
  onReset,
  lastUpdated,
  autoRefresh,
  onToggleAutoRefresh,
  onRefresh,
  onExport,
  refreshing,
}) {
  return (
    <div className="mb-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        {/* LEFT: TITLE */}
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <LayoutDashboard size={26} className="text-white" />
          </div>

          <div>
            <h1 className="text-[24px] font-semibold tracking-[-0.05em] text-text-primary">
              Billing Dashboard
            </h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-text-muted tracking-[0.01em]">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Billing Analytics
            </div>
          </div>
        </div>

        {/* RIGHT: META + ACTIONS */}
        <div className="flex flex-col items-start gap-3 xl:items-end">
          <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
            <span>
              Last Updated: <span className="font-semibold text-text-secondary">{formatLastUpdated(lastUpdated)}</span>
            </span>

            <button
              type="button"
              onClick={onToggleAutoRefresh}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold transition ${
                autoRefresh
                  ? "border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "border-border-color bg-surface text-text-muted hover:text-text-secondary"
              }`}
            >
              <Radio size={11} />
              Auto Refresh {autoRefresh ? "On" : "Off"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* TIME FILTER */}
            <div className="relative">
              <CalendarDays size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <select
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value)}
                className="h-10 pl-9 pr-10 text-sm rounded-xl border border-border-color bg-surface text-text-secondary outline-none transition focus:border-indigo-400 shadow-sm appearance-none"
              >
                <option value="3">Last 3 Months</option>
                <option value="6">Last 6 Months</option>
                <option value="12">Last 1 Year</option>
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>

            {/* CIRCLE FILTER */}
            <div className="relative">
              <select
                value={circleFilter}
                onChange={(e) => setCircleFilter(e.target.value)}
                className="h-10 pl-4 pr-10 text-sm rounded-xl border border-border-color bg-surface text-text-secondary outline-none transition focus:border-indigo-400 shadow-sm appearance-none"
              >
                <option value="">All Circles</option>
                {circleOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>

            {/* BILLING TYPE FILTER */}
            <div className="relative">
              <select
                value={billingFilter}
                onChange={(e) => setBillingFilter(e.target.value)}
                className="h-10 pl-4 pr-10 text-sm rounded-xl border border-border-color bg-surface text-text-secondary outline-none transition focus:border-indigo-400 shadow-sm appearance-none"
              >
                <option value="">All Types</option>
                {billingOptions.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>

            <button
              onClick={onReset}
              className="h-10 px-4 rounded-xl border border-indigo-100 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 text-sm font-medium transition hover:bg-indigo-100 hover:dark:bg-indigo-500/15 flex items-center gap-2"
            >
              <RefreshCcw size={14} />
              Reset
            </button>

            <button
              onClick={onExport}
              className="h-10 px-4 rounded-xl border border-border-color bg-surface text-text-secondary text-sm font-medium transition hover:bg-surface-muted flex items-center gap-2"
            >
              <Download size={14} />
              Export
            </button>

            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="h-10 px-4 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-sm font-semibold shadow-md shadow-indigo-500/20 transition hover:opacity-90 disabled:opacity-60 flex items-center gap-2"
            >
              <RefreshCcw size={14} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
