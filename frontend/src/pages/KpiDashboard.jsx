import React, { useEffect, useState, useRef } from "react";
import {
  Activity,
  CalendarDays,
  Filter,
  MoreVertical,
  TrendingUp,
  Download,
} from "lucide-react";

import {
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import { authFetch, buildApiUrl } from "../lib/api";

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
  const [fiberCards, setFiberCards] = useState([]);
  const [circleData, setCircleData] = useState([]);
  const [kpiData, setKpiData] = useState([]);
  const [selectedCircle, setSelectedCircle] = useState("");
  const [selectedWeeks, setSelectedWeeks] = useState([]);
  const [weekDropdownOpen, setWeekDropdownOpen] = useState(false);
  const [weeks, setWeeks] = useState([]);
  const [years, setYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState("");
  const weekDropdownRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
  const handleClickOutside = (event) => {

    if (
      weekDropdownRef.current &&
      !weekDropdownRef.current.contains(event.target)
    ) {
      setWeekDropdownOpen(false);
    }

  };

  document.addEventListener(
    "mousedown",
    handleClickOutside
  );

  return () => {
    document.removeEventListener(
      "mousedown",
      handleClickOutside
    );
  };
}, []);

useEffect(() => {
  const fetchTowerData = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await authFetch(buildApiUrl("/api/tower-uptime"));

      if (!res.ok) {
        throw new Error(`HTTP Error: ${res.status}`);
      }

      const data = await res.json();
  
      setTowerCards(data);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchNsoData = async () => {
    try {
      const res = await authFetch(buildApiUrl("/api/nso/kpi-dashboard"));

      if (!res.ok) {
        throw new Error(`HTTP Error: ${res.status}`);
      }

    const data = await res.json();

console.log("NSO DATA =", data);

setKpiData(data);
setCircleData(data);
const allWeeks = new Set();
const allYears = new Set();

data.forEach((item) => {

  Object.keys(item.weeks || {}).forEach((week) => {

    allWeeks.add(week);

    const yearMatch = week.match(/'(\d+)/);

    if (yearMatch) {
      allYears.add(`20${yearMatch[1]}`);
    }

  });

});

const sortedWeeks = Array.from(allWeeks)
  .sort((a, b) => {
    const wa = parseInt(a.match(/\d+/)?.[0] || 0);
    const wb = parseInt(b.match(/\d+/)?.[0] || 0);
    return wb - wa;
  });

setWeeks(sortedWeeks);
const sortedYears = Array.from(allYears)
  .sort((a, b) => Number(b) - Number(a));

setYears(sortedYears);

// AUTO SELECT LATEST YEAR
if (sortedYears.length > 0) {
  setSelectedYear(sortedYears[0]);
}
    } catch (err) {
      console.error(err);
      if (!error) {
        setError(err.message);
      }
    }
  };

  fetchTowerData();
  fetchNsoData();
}, []); 

const handleDownloadReport = () => {
  alert("Download Report Clicked");
};

const filteredData = kpiData
  .filter(
    (item) =>
      (!selectedCircle ||
        item.circle === selectedCircle)
  )
  .sort((a, b) =>
    (a.cmp || "").localeCompare(
      b.cmp || ""
    )
  );

const yearFilteredWeeks =
  selectedYear
    ? weeks.filter((week) => {

        const match = week.match(/'(\d{2})$/);

        if (!match) return false;

        return `20${match[1]}` === selectedYear;

      })
    : weeks;

const visibleWeeks =
  selectedWeeks.length > 0
    ? selectedWeeks
    : yearFilteredWeeks.slice(0, 4);
    console.log("Selected Year =", selectedYear);
    console.log("Weeks =", weeks);
    console.log("Year Weeks =", yearFilteredWeeks);

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

{/* Section Separator */}
<div className="my-4 border-t border-slate-300"></div>

{/* NSO KPI Dashboard */}

<div className="mb-1 overflow-visible rounded-2xl border border-slate-200 bg-white shadow-sm">

<div className="bg-gradient-to-r from-blue-900 to-blue-700 px-4 py-3 text-white">

  <div className="flex items-center gap-3">

    <div className="rounded-xl bg-white/20 p-2">
      <Filter className="h-4 w-4" />
    </div>

    <div>
      <h2 className="text-[17px] font-semibold">
        NSO Fiber Performance
      </h2>

      <p className="text-xs text-blue-100">
        Circle-wise and CMP-wise Fiber Network Performance Analysis
      </p>
    </div>

  </div>

</div>

<div className="p-1 overflow-visible">
<div className="grid grid-cols-7 gap-2 relative">
  {/* Circle Filter */}
<select
  value={selectedCircle}
  onChange={(e) => setSelectedCircle(e.target.value)}
  className="h-9 w-full rounded-xl border border-slate-300 px-4 text-sm font-medium"
>
  <option value="">All Circles</option>

  {[...new Set(kpiData.map(item => item.circle))]
    .filter(Boolean)
    .map((circle) => (
      <option key={circle} value={circle}>
        {circle}
      </option>
    ))}
</select>

  {/* CMP Filter */}
 <select
  className="h-9 w-full rounded-xl border border-slate-300 px-4 text-sm font-medium"
>
  <option value="">Select CMP</option>

  {[...new Set(kpiData.map(item => item.cmp))]
    .filter(Boolean)
    .map((cmp) => (
      <option key={cmp} value={cmp}>
        {cmp}
      </option>
    ))}
</select>

  {/* Week Filter */}
  <div
  ref={weekDropdownRef}
  className="relative z-[9999]"
>

 <button
  type="button"
  onClick={() =>
    setWeekDropdownOpen(prev => !prev)
  }
  className="flex h-9 w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium"
>
 <span className="truncate">
  {selectedWeeks.length > 0
    ? selectedWeeks.join(", ")
    : "Select Weeks"}
</span>

  {weekDropdownOpen ? (
    <ChevronUp className="h-4 w-4" />
  ) : (
    <ChevronDown className="h-4 w-4" />
  )}
</button>

  {weekDropdownOpen && (
    <div className="absolute left-0 top-10 z-[99999] max-h-64 w-full overflow-auto rounded-xl border border-slate-300 bg-white shadow-xl">

     {yearFilteredWeeks.map((week) => (

        <label
          key={week}
          className="flex items-center gap-2 px-3 py-2 hover:bg-slate-100"
        >

          <input
            type="checkbox"
            checked={selectedWeeks.includes(week)}
            onChange={(e) => {

              if (e.target.checked) {

              if (selectedWeeks.length < 4) {

  const updated = [
    ...selectedWeeks,
    week
  ];

  setSelectedWeeks(updated);

  if (updated.length === 4) {
    setWeekDropdownOpen(false);
  }

}

              } else {

                setSelectedWeeks(prev =>
                  prev.filter(w => w !== week)
                );

              }

            }}
          />

          {week}

        </label>

      ))}

    </div>
  )}

</div>

  {/* Month Filter */}
  <select
    className="h-9 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm"
  >
    <option value="">Select Month</option>
    <option>January</option>
    <option>February</option>
    <option>March</option>
    <option>April</option>
    <option>May</option>
    <option>June</option>
    <option>July</option>
    <option>August</option>
    <option>September</option>
    <option>October</option>
    <option>November</option>
    <option>December</option>
  </select>

<select
  value={selectedYear}
  onChange={(e) => {
  setSelectedYear(e.target.value);
  setSelectedWeeks([]);
}}
  className="h-9 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm"
>
  <option value="">
    Select Year
  </option>

  {years.map((year) => (
    <option
      key={year}
      value={year}
    >
      {year}
    </option>
  ))}
</select>

  {/* Reset */}
  <button
onClick={() => {
   setSelectedCircle("");
   setSelectedWeeks([]);

   if (years.length > 0) {
      setSelectedYear(years[0]);
   }
}}
   className="h-9 w-full rounded-xl bg-red-500 text-sm font-semibold text-white shadow-sm hover:bg-red-600"
  >
    Reset
  </button>

  {/* Download Report */}
  <button
 className="h-9 w-full rounded-xl bg-blue-900 px-6 text-sm font-semibold text-white shadow-sm hover:bg-blue-800"
  >
    Download Report
  </button>
</div>
</div>
</div>

{/* Table Section */}
<div className="mb-4 rounded-2xl border border-slate-200 bg-white shadow-md overflow-auto max-h-[700px]">

<table className="min-w-full text-sm border-collapse">

<thead className="sticky top-0 z-30">

<tr className="sticky top-0 z-30 bg-[#0b2f78] text-white">

<th
  rowSpan="2"
  className="sticky left-0 top-0 z-40 bg-[#0b2f78] px-4 py-3 text-left min-w-[220px]"
>
  CMP
</th>

<th
  rowSpan="2"
  className="sticky top-0 z-30 bg-[#0b2f78] px-4 py-3 min-w-[100px]"
>
  Scope
</th>

{visibleWeeks.map((week) => (
  <th
    key={week}
    colSpan="3"
    className="border border-slate-400 px-3 py-2"
  >
    {week}
  </th>
))}

</tr>

<tr className="sticky top-[38px] z-20 bg-slate-100">


  {visibleWeeks.map((week) => (
    <React.Fragment key={week}>
      <th className="border px-2 py-1">
        Cuts
      </th>

      <th className="border px-2 py-1">
        FTKM
      </th>

      <th className="border px-2 py-1"> 
        MTTR
      </th>
    </React.Fragment>
  ))}

</tr>

</thead>

<tbody>
  {filteredData.map((row, index) => (
    <tr key={index}>
     <td className="sticky left-0 z-10 border bg-white px-3 py-2 font-medium">
      {row.cmp}
     </td>

      <td className="border px-3 py-2">
        {row.scope}
      </td>

      {visibleWeeks.map((week) => (
        <React.Fragment key={week}>
          <td className="border px-2 py-2 text-center">
            {row.weeks?.[week]?.cuts || 0}
          </td>

         <td className="border px-2 py-2 text-center">
            {row.weeks?.[week]?.ftkm || 0}
          </td>

          <td className="border px-2 py-2 text-center">
            {row.weeks?.[week]?.mttr || 0}
          </td>
        </React.Fragment>
      ))}
    </tr>
  ))}
</tbody>

</table>

</div>


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
