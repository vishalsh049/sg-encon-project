import React, { useEffect, useState } from "react";
import {
  Activity,
  CalendarDays,
  Filter,
  MoreVertical,
  TrendingUp,
  Download,
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
  const [fiberCards, setFiberCards] = useState([]);
  const [circleData, setCircleData] = useState([]);
  const [kpiData, setKpiData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

useEffect(() => {
  const fetchTowerData = async () => {
    try {
      setLoading(true);
      setError(null);

      const url = buildApiUrl("/api/tower-uptime");
      const res = await fetch(url);

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
     const res = await fetch(
      buildApiUrl("/api/nso/kpi-dashboard")
    );

    const data = await res.json();

console.log("NSO KPI DATA", data);

setKpiData(data);
setCircleData(data);
    } catch (err) {
      console.error(err);
    }
  };

  fetchTowerData();
  fetchNsoData();
}, []); 

const handleDownloadReport = () => {
  alert("Download Report Clicked");
};

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

<div className="mb-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

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

<div className="p-1">
<div className="grid grid-cols-6 gap-2">
  {/* Circle Filter */}
  <select
 className="h-9 w-full rounded-xl border border-slate-300 px-4 text-sm font-medium"
>
  <option>Select Circle</option>
  <option>Delhi</option>
  <option>Haryana</option>
  <option>Punjab</option>
  <option>UP East</option>
</select>

  {/* CMP Filter */}
  <select
   className="h-9 w-full rounded-xl border border-slate-300 px-4 text-sm font-medium"

  >
    <option value="">Select CMP</option>

    {/* Delhi */}
    <option>Delhi-1 (West)</option>
    <option>Delhi-2 (South)</option>
    <option>Delhi-3 (Central-East)</option>
    <option>Delhi-4 (North)</option>
    <option>Faridabad (NCR)</option>
    <option>Ghaziabad (NCR)</option>
    <option>Gurgaon (NCR)</option>
    <option>Noida (NCR)</option>

    {/* Haryana */}
    <option>Ambala</option>
    <option>Hissar</option>
    <option>Karnal</option>
    <option>Panipat</option>
    <option>Rewari</option>
    <option>Rohtak</option>

    {/* Punjab */}
    <option>Amritsar</option>
    <option>Bhatinda</option>
    <option>Chandigarh</option>
    <option>Jalandhar</option>
    <option>Ludhiana-1</option>
    <option>Ludhiana-2</option>
    <option>Pathankot</option>
    <option>Patiala</option>
    <option>Sangrur</option>
  </select>

  {/* Week Filter */}
  <select
    className="h-9 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm"
  >
    <option value="">Select Week</option>
    <option>WK-19'26</option>
    <option>WK-20'26</option>
    <option>WK-21'26</option>
    <option>WK-22'26</option>
  </select>

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

  {/* Reset */}
  <button
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
{/* Table Section */}

<div className="mb-4 overflow-auto rounded-2xl border border-slate-200 bg-white shadow-md">

<table className="min-w-full border-collapse text-sm">

<thead>

<tr className="bg-[#0b2f78] text-white">

<th
rowSpan="2"
className="border border-slate-400 px-3 py-2"
>
CMP
</th>

<th
rowSpan="2"
className="border border-slate-400 px-3 py-2"
>
Scope
</th>

<th
colSpan="3"
className="border border-slate-400 px-3 py-2"
>
WK-19'26
</th>

<th
colSpan="3"
className="bg-cyan-500 border border-slate-400 px-3 py-2"
>
WK-20'26
</th>

<th
colSpan="3"
className="border border-slate-400 px-3 py-2"
>
WK-21'26
</th>

<th
colSpan="3"
className="bg-cyan-500 border border-slate-400 px-3 py-2"
>
WK-22'26
</th>

</tr>

<tr className="bg-slate-100">

<th className="border px-2 py-1">Cuts</th>
<th className="border px-2 py-1">FTKM</th>
<th className="border px-2 py-1">MTTR</th>

<th className="border px-2 py-1">Cuts</th>
<th className="border px-2 py-1">FTKM</th>
<th className="border px-2 py-1">MTTR</th>

<th className="border px-2 py-1">Cuts</th>
<th className="border px-2 py-1">FTKM</th>
<th className="border px-2 py-1">MTTR</th>

<th className="border px-2 py-1">Cuts</th>
<th className="border px-2 py-1">FTKM</th>
<th className="border px-2 py-1">MTTR</th>

</tr>

</thead>

<tbody>

<tr>
<td className="border px-3 py-2">Delhi-1 (West)</td>
<td className="border px-3 py-2">1965.94</td>

<td className="border">12</td>
<td className="border">27.03</td>
<td className="border">7.94</td>

<td className="border">10</td>
<td className="border">22.53</td>
<td className="border">8.98</td>

<td className="border">16</td>
<td className="border">36.04</td>
<td className="border">10.58</td>

<td className="border">13</td>
<td className="border">29.28</td>
<td className="border">8.49</td>
</tr>

<tr>
<td className="border px-3 py-2">Delhi-2 (South)</td>
<td className="border px-3 py-2">1499.29</td>

<td className="border">14</td>
<td className="border">41.35</td>
<td className="border">6.87</td>

<td className="border">13</td>
<td className="border">38.40</td>
<td className="border">6.18</td>

<td className="border">3</td>
<td className="border">8.86</td>
<td className="border">4.85</td>

<td className="border">8</td>
<td className="border">23.63</td>
<td className="border">5.62</td>
</tr>

<tr className="bg-[#0b2f78] text-white font-semibold">

<td className="border px-3 py-2">
Delhi Total
</td>

<td className="border px-3 py-2">
13153.05
</td>

<td className="border">56</td>
<td className="border">18.85</td>
<td className="border">8.65</td>

<td className="border">65</td>
<td className="border">21.89</td>
<td className="border">11.68</td>

<td className="border">80</td>
<td className="border">26.94</td>
<td className="border">11.06</td>

<td className="border">66</td>
<td className="border">22.22</td>
<td className="border">10.57</td>

</tr>

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
