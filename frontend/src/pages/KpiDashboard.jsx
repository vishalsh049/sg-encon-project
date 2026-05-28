import React, { useEffect, useState } from "react";
import {
  Activity,
  CalendarDays,
  Filter,
  MoreVertical,
  TrendingUp,
} from "lucide-react";
import { buildApiUrl } from "../lib/api";

const colorStyles = {
  blue: {
    bg: "bg-blue-50",
    text: "text-blue-600",
    border: "border-blue-100",
    line: "bg-blue-500",
  },
  emerald: {
    bg: "bg-emerald-50",
    text: "text-emerald-600",
    border: "border-emerald-100",
    line: "bg-emerald-500",
  },
  violet: {
    bg: "bg-violet-50",
    text: "text-violet-600",
    border: "border-violet-100",
    line: "bg-violet-500",
  },
  orange: {
    bg: "bg-orange-50",
    text: "text-orange-600",
    border: "border-orange-100",
    line: "bg-orange-500",
  },
  cyan: {
    bg: "bg-cyan-50",
    text: "text-cyan-600",
    border: "border-cyan-100",
    line: "bg-cyan-500",
  },
  rose: {
    bg: "bg-rose-50",
    text: "text-rose-600",
    border: "border-rose-100",
    line: "bg-rose-500",
  },
};

const getBarHeight = (value) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 8;
  }

  const normalizedValue = Math.min(Math.max(numericValue, 0), 100);
  return Math.max(8, Math.round((normalizedValue / 100) * 140));
};

function KpiDashboard() {
  const [towerCards, setTowerCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTowerData = async () => {
      try {
        setLoading(true);
        setError(null);
        const url = buildApiUrl("/api/tower-uptime");
        console.log("Fetching from:", url);
        const res = await fetch(url);
        
        if (!res.ok) {
          throw new Error(`HTTP Error: ${res.status}`);
        }
        
        const data = await res.json();
        console.log("Tower data received:", data);
        setTowerCards(data);
      } catch (err) {
        console.error("Error fetching tower data:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTowerData();
  }, []);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg">
            <Activity className="h-4 w-4 text-white" />
          </div>

          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              Uptime Overview
            </h1>

            <p className=" text-sm text-slate-500">
              Real-time uptime trend of all monitored tower systems.
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <button className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm">
            <CalendarDays className="h-3 w-4" />
            Last 7 Days
          </button>

          <button className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm">
            <Filter className="h-3 w-4" />
            Filter
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-600">
            <strong>Error loading data:</strong> {error}
          </p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <p className="text-slate-500">Loading tower uptime data...</p>
        </div>
      )}

      {/* Cards */}
      {!loading && (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {towerCards.map((card, index) => {
          const style = colorStyles[card.color] || colorStyles.blue;

          return (
            <div
              key={index}
              className={`rounded-[14px] border ${style.border} bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl`}
            >
              {/* Top */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* Icon */}
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-2xl ${style.bg}`}
                  >
                    <Activity className={`h-4 w-4 ${style.text}`} />
                  </div>

                  {/* Title */}
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-slate-900">
                        {card.name}
                      </h2>
                    </div>

                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">
                      UPTIME
                    </p>
                  </div>
                </div>

                {/* Menu */}
                <button className="text-slate-400">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>

              {/* Stats */}
              <div className="mt-1 flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-semibold text-slate-900">
                    {card.uptime}
                  </h1>
                </div>

                <div className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-1">
                  <TrendingUp className="h-3 w-4 text-green-600" />

                  <span className="text-xs font-semibold text-green-600">
                    {card.increase}
                  </span>
                </div>
              </div>

              {/* Chart */}
           <div className="mt-2">

  <div className="relative flex h-56 items-end justify-between overflow-hidden rounded-2xl bg-slate-50 px-3 pb-4 pt-6">

    {(card.bars || []).map((height, i) => (

      <div
        key={i}
        className="flex flex-1 flex-col items-center justify-end gap-3"
      >

        {/* TOP PERCENTAGE */}
        <span className="text-[10px] font-semibold text-slate-600">
          {height}%
        </span>

        {/* BAR */}
        <div
          className={`w-4 rounded-full ${style.line}`}
          style={{
           height: `${getBarHeight(height)}px`,
            minHeight: "8px",
            opacity: 0.9,
          }}
        />

        {/* DATE */}
        <span className="text-[10px] text-slate-400">
          {card.dates?.[i]}
        </span>

      </div>

    ))}

  </div>

</div>
            </div>
          );
        })}
      </div>
      )}

      {/* Empty State */}
      {!loading && towerCards.length === 0 && !error && (
        <div className="flex items-center justify-center py-12">
          <p className="text-slate-500">No tower data available</p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-10 flex items-center justify-center gap-2 text-sm text-slate-500">
        <Activity className="h-4 w-4" />

        <p>
          Uptime percentage is calculated based on successful tower checks over
          the selected time period.
        </p>
      </div>
    </div>
  );
}

export default KpiDashboard;
