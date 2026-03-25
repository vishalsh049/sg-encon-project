import { useEffect, useState } from "react";
import axios from "axios";
import { buildApiUrl } from "../lib/api";
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";
import { PieChart as PieIcon, TrendingUp } from "lucide-react";

const initialStats = {
  totalSites: 0,
  totalManpower: 0,
  totalScrum: 0,
  siteBreakdown: [],
  manpowerBreakdown: [],
  uptimeData: [],
  monthlyData: [],
};

const weeklyFallback = [
  { day: "Mon", uptime: 92 },
  { day: "Tue", uptime: 95 },
  { day: "Wed", uptime: 90 },
  { day: "Thu", uptime: 97 },
  { day: "Fri", uptime: 94 },
  { day: "Sat", uptime: 96 },
];

const monthlyFallback = [
  { day: "Week 1", uptime: 93 },
  { day: "Week 2", uptime: 95 },
  { day: "Week 3", uptime: 92 },
  { day: "Week 4", uptime: 96 },
];

const siteData = [
  { value: 20 },
  { value: 25 },
  { value: 18 },
  { value: 30 },
  { value: 28 },
  { value: 35 },
];

const manpowerData = [
  { value: 10 },
  { value: 15 },
  { value: 12 },
  { value: 20 },
  { value: 18 },
  { value: 22 },
];

const scrumData = [
  { value: 30 },
  { value: 28 },
  { value: 35 },
  { value: 40 },
  { value: 38 },
  { value: 45 },
];

const COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#64748b",
];

function isDashboardPayload(data) {
  return (
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    "totalSites" in data &&
    "totalManpower" in data &&
    "totalScrum" in data &&
    Array.isArray(data.siteBreakdown) &&
    Array.isArray(data.manpowerBreakdown)
  );
}

function Dashboard() {
  const [stats, setStats] = useState(initialStats);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("weekly");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    axios
      .get(buildApiUrl("/api/dashboard/stats"))
      .then((res) => {
        if (!isMounted) return;

        if (!isDashboardPayload(res.data)) {
          setErrorMessage(
            "Dashboard API is not returning valid JSON data. Your frontend domain is likely serving HTML instead of the backend /api route."
          );
          return;
        }

        setStats({
          ...initialStats,
          ...res.data,
        });
      })
      .catch(() => {
        if (!isMounted) return;

        setErrorMessage(
          "Unable to load dashboard data from the backend API. Check your backend URL, Node app, and database settings."
        );
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const totalManpowerCount = (stats.manpowerBreakdown || []).reduce(
    (sum, item) => sum + Number(item.count || 0),
    0
  );

  return (
    <div className="space-y-6">
      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        <div className="flex items-center justify-between rounded-xl border-t-[3px] border-blue-500 bg-white p-5 shadow-sm">
          <div>
            <p className="mb-1 text-sm text-gray-500">Total Active Sites</p>
            <h2 className="text-2xl font-bold text-gray-800">
              {loading ? "..." : stats.totalSites}
            </h2>
          </div>

          <LineChart width={80} height={40} data={siteData}>
            <Line
              type="monotone"
              dataKey="value"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </div>

        <div className="flex items-center justify-between rounded-xl border-t-[3px] border-blue-500 bg-white p-5 shadow-sm">
          <div>
            <p className="mb-1 text-sm text-gray-500">Total Active Manpower</p>
            <h2 className="text-2xl font-bold text-gray-800">
              {loading ? "..." : stats.totalManpower}
            </h2>
          </div>

          <LineChart width={80} height={40} data={manpowerData}>
            <Line
              type="monotone"
              dataKey="value"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </div>

        <div className="flex items-center justify-between rounded-xl border-t-[3px] border-green-500 bg-white p-5 shadow-sm">
          <div>
            <p className="mb-1 text-sm text-gray-500">
              Total Manpower (Scrum Based)
            </p>
            <h2 className="text-2xl font-bold text-gray-800">
              {loading ? "..." : stats.totalScrum}
            </h2>
          </div>

          <LineChart width={80} height={40} data={scrumData}>
            <Line
              type="monotone"
              dataKey="value"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        <div className="flex h-[300px] flex-col rounded-xl border bg-white p-5 shadow-sm transition duration-300 hover:shadow-md">
          <h4 className="mb-4 flex items-center justify-between text-md font-semibold text-gray-700">
            Site Types
            <span className="text-xs text-gray-400">Overview</span>
          </h4>

          <div className="hide-scrollbar max-h-48 space-y-3 overflow-y-auto pr-1">
            {(stats.siteBreakdown || []).map((item, index) => (
              <div
                key={index}
                className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 transition hover:bg-gray-100"
              >
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500"></div>
                  <span className="text-sm font-medium text-gray-700">
                    {item.type}
                  </span>
                </div>

                <span className="rounded-md bg-green-100 px-2 py-1 text-xs font-semibold text-green-600">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex h-[300px] flex-col rounded-xl border bg-white p-5 shadow-sm transition duration-300 hover:shadow-md">
          <h4 className="mb-4 flex items-center justify-between text-md font-semibold text-gray-700">
            Manpower Roles
            <span className="text-xs text-gray-400">Active</span>
          </h4>

          <div className="hide-scrollbar max-h-64 space-y-3 overflow-y-auto pr-2">
            {(stats.manpowerBreakdown || []).map((item, index) => (
              <div
                key={index}
                className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 transition hover:bg-gray-100"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-700">
                    {item.role}
                  </span>
                  <span className="text-xs text-gray-400">Active Role</span>
                </div>

                <span className="rounded-md bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-600">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex h-[300px] flex-col justify-between rounded-xl border bg-white p-5 shadow-sm transition duration-300 hover:shadow-md">
          <h4 className="mb-4 text-md font-semibold text-gray-700">
            Dashboard Summary
          </h4>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Total Sites</span>
              <span className="font-semibold text-blue-600">
                {stats.totalSites}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Total Manpower</span>
              <span className="font-semibold text-green-600">
                {stats.totalManpower}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Scrum Manpower</span>
              <span className="font-semibold text-purple-600">
                {stats.totalScrum}
              </span>
            </div>
          </div>

          <div className="mt-4 text-xs text-gray-400">Live Overview</div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-5 shadow-sm md:col-span-1">
          <h4 className="mb-4 flex items-center gap-2 text-md font-semibold text-gray-700">
            <PieIcon size={18} />
            Manpower Distribution
          </h4>

          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={stats.manpowerBreakdown || []}
                dataKey="count"
                nameKey="role"
                cx="50%"
                cy="50%"
                outerRadius={90}
                innerRadius={60}
                paddingAngle={2}
                activeIndex={activeIndex}
                onMouseEnter={(_, index) => setActiveIndex(index)}
              >
                {(stats.manpowerBreakdown || []).map((entry, index) => (
                  <Cell
                    key={index}
                    fill={COLORS[index % COLORS.length]}
                    stroke="#fff"
                    strokeWidth={2}
                    opacity={index === activeIndex ? 1 : 0.6}
                  />
                ))}
              </Pie>

              <text
                x="50%"
                y="48%"
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ fontSize: "20px", fontWeight: "600", fill: "#374151" }}
              >
                {totalManpowerCount}
              </text>

              <text
                x="50%"
                y="60%"
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ fontSize: "12px", fill: "#9ca3af" }}
              >
                Total
              </text>

              <Legend
                layout="horizontal"
                align="center"
                verticalAlign="bottom"
                wrapperStyle={{
                  fontSize: "12px",
                  lineHeight: "20px",
                  paddingTop: "10px",
                  maxWidth: "90%",
                  margin: "0 auto",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm md:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-md font-semibold text-gray-700">
              <TrendingUp size={18} />
              Uptime Trend
            </h4>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilter("weekly")}
                className={`rounded-md px-3 py-1 text-xs ${
                  filter === "weekly"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                Weekly
              </button>

              <button
                onClick={() => setFilter("monthly")}
                className={`rounded-md px-3 py-1 text-xs ${
                  filter === "monthly"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                Monthly
              </button>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={250}>
            <AreaChart
              data={
                filter === "weekly"
                  ? stats.uptimeData?.length
                    ? stats.uptimeData
                    : weeklyFallback
                  : stats.monthlyData?.length
                  ? stats.monthlyData
                  : monthlyFallback
              }
            >
              <defs>
                <linearGradient id="colorUptime" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis
                domain={[0, 40]}
                tick={{ fontSize: 12 }}
                label={{ value: "Uptime %", angle: -90, position: "insideLeft" }}
              />
              <Tooltip
                formatter={(value) => [`${value}%`, "Uptime"]}
                contentStyle={{
                  borderRadius: "10px",
                  border: "none",
                  boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
                }}
              />
              <Area
                type="monotone"
                dataKey="uptime"
                stroke="#3b82f6"
                strokeWidth={3}
                fill="url(#colorUptime)"
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
