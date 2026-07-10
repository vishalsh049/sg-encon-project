import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowRight,
  Activity,
  GraduationCap,
  Layers,
  RefreshCw,
  UserPlus2,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchRecentLogs, fetchTrainingStats } from "../../lib/trainingApi";
import TrainingStats from "../../components/training/TrainingStats";

const ACTION_LABELS = {
  REGISTERED: "New registration",
  UPDATED: "Profile updated",
  STATUS_CHANGED: "Status changed",
  REJECTED: "Candidate rejected",
  CONVERTED: "Converted to employee",
  DOCUMENT_UPLOADED: "Document uploaded",
  DOCUMENT_REPLACED: "Document replaced",
  DOCUMENT_VERIFIED: "Document verified",
  DOCUMENT_REJECTED: "Document rejected",
  DOCUMENT_DELETED: "Document deleted",
  DELETED: "Record deleted",
  EXPORTED: "Report exported",
  DUPLICATE_SUBMISSION_BLOCKED: "Duplicate submission blocked",
};

export default function TrainingDashboard() {
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [statsRes, logsRes] = await Promise.all([
        fetchTrainingStats(),
        fetchRecentLogs(12),
      ]);
      setStats(statsRes.data);
      setLogs(logsRes.data || []);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const chartData = (stats?.registrationsLast30Days || []).map((row) => ({
    day: String(row.day).slice(5),
    count: row.count,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-900">
            <GraduationCap className="h-5 w-5 text-indigo-500" />
            Training Dashboard
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Candidates registered via Google Form and manual entry.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="flex h-9 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <Link
            to="/dashboard/training/registrations"
            className="flex h-9 items-center gap-1.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3.5 text-sm font-semibold text-white shadow transition hover:from-blue-700 hover:to-indigo-700"
          >
            <UserPlus2 className="h-4 w-4" />
            New Registrations
          </Link>
        </div>
      </div>

      <TrainingStats stats={stats} loading={loading} />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Registrations chart */}
        <div className="rounded-[20px] border border-slate-100 bg-white p-4 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-700">
            Registrations — last 30 days
          </h2>
          <div className="mt-3 h-56">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -22 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "rgba(59,130,246,0.06)" }} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="count" name="Registrations" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                {loading ? "Loading…" : "No registrations in the last 30 days."}
              </div>
            )}
          </div>
        </div>

        {/* Top batches */}
        <div className="rounded-[20px] border border-slate-100 bg-white p-4 shadow-sm">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <Layers className="h-4 w-4 text-slate-400" />
            Top Training Batches
          </h2>
          <div className="mt-3 space-y-2">
            {(stats?.topBatches || []).length ? (
              stats.topBatches.map((batch) => (
                <div
                  key={batch.training_batch}
                  className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"
                >
                  <span className="truncate font-medium text-slate-700">
                    {batch.training_batch}
                  </span>
                  <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                    {batch.count}
                  </span>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-slate-400">
                {loading ? "Loading…" : "No batches yet."}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="rounded-[20px] border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <Activity className="h-4 w-4 text-slate-400" />
            Recent Activity
          </h2>
          <Link
            to="/dashboard/training/employees"
            className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            View all candidates <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="mt-3 divide-y divide-slate-50">
          {logs.length ? (
            logs.map((log) => (
              <div key={log.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-slate-700">
                    <span className="font-semibold">
                      {ACTION_LABELS[log.action] || log.action}
                    </span>
                    {log.full_name ? ` — ${log.full_name}` : ""}
                  </p>
                  <p className="text-xs text-slate-400">
                    {log.performed_by} · {String(log.created_at || "").replace("T", " ").slice(0, 19)}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <p className="py-6 text-center text-sm text-slate-400">
              {loading ? "Loading…" : "No activity yet."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
