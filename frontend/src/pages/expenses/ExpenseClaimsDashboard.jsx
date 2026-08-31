import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CheckCircle2,
  Clock3,
  FileStack,
  Landmark,
  RefreshCw,
  ThumbsDown,
  Wallet,
} from "lucide-react";

import { CARD_SHELL } from "../../components/billingDashboard/theme";
import KpiCard from "../../components/billingDashboard/KpiCard";
import { formatIndianCompact } from "../../utils/penaltyFormat";
import { fetchExpenseDashboard } from "../../lib/expenseClaimsApi";

const INPUT =
  "rounded-lg border border-border-color bg-surface px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-indigo-400";

export default function ExpenseClaimsDashboard() {
  const [range, setRange] = useState({ dateFrom: "", dateTo: "" });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchExpenseDashboard(range);
      setData(res.data);
    } catch (error) {
      toast.error(error.message || "Failed to load the dashboard.");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const c = data?.cards || {};

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-text-primary sm:text-xl">
            Expense Claims Dashboard
          </h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            Claim volume, approval funnel, spend by category and department, and pending-approval aging.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className={INPUT} value={range.dateFrom} onChange={(e) => setRange((r) => ({ ...r, dateFrom: e.target.value }))} />
          <span className="text-text-muted">–</span>
          <input type="date" className={INPUT} value={range.dateTo} onChange={(e) => setRange((r) => ({ ...r, dateTo: e.target.value }))} />
          <button
            type="button"
            onClick={load}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-border-color bg-surface px-4 text-sm font-medium text-text-secondary transition hover:bg-surface-muted"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 xl:grid-cols-6">
        <KpiCard compact accentKey="neutral" icon={FileStack} label="Total Claims" value={loading ? "…" : c.totalClaims ?? 0} />
        <KpiCard compact accentKey="pending" icon={Clock3} label="Pending L1" value={loading ? "…" : c.pendingL1 ?? 0} />
        <KpiCard compact accentKey="pending" icon={Clock3} label="Pending L2" value={loading ? "…" : c.pendingL2 ?? 0} />
        <KpiCard compact accentKey="pending" icon={Clock3} label="Pending Final" value={loading ? "…" : c.pendingFinal ?? 0} />
        <KpiCard compact accentKey="pmLoss" icon={Landmark} label="Pending Finance" value={loading ? "…" : c.pendingFinance ?? 0} />
        <KpiCard compact accentKey="completed" icon={CheckCircle2} label="Completed" value={loading ? "…" : c.completed ?? 0} />
        <KpiCard compact accentKey="completed" icon={CheckCircle2} label="Approved" value={loading ? "…" : c.approved ?? 0} />
        <KpiCard compact accentKey="penalty" icon={ThumbsDown} label="Rejected" value={loading ? "…" : c.rejected ?? 0} />
        <KpiCard compact accentKey="neutral" icon={Wallet} label="Total Claimed" value={loading ? "…" : formatIndianCompact(c.totalClaimed ?? 0)} />
        <KpiCard compact accentKey="completed" icon={Wallet} label="Total Approved" value={loading ? "…" : formatIndianCompact(c.totalApproved ?? 0)} />
        <KpiCard compact accentKey="penalty" icon={Wallet} label="Total Reduced" value={loading ? "…" : formatIndianCompact(c.totalReduced ?? 0)} />
        <KpiCard compact accentKey="revenue" icon={Wallet} label="Total Processed" value={loading ? "…" : formatIndianCompact(c.totalProcessed ?? 0)} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard title="Claimed vs Approved by Category">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data?.byCategory || []} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatIndianCompact(v)} width={70} />
              <RTooltip formatter={(v) => formatIndianCompact(v)} />
              <Legend />
              <Bar dataKey="claimed" name="Claimed" fill="#6366f1" radius={[3, 3, 0, 0]} />
              <Bar dataKey="approved" name="Approved" fill="#10b981" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Claimed vs Approved by Department">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data?.byDepartment || []} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatIndianCompact(v)} width={70} />
              <RTooltip formatter={(v) => formatIndianCompact(v)} />
              <Legend />
              <Bar dataKey="claimed" name="Claimed" fill="#6366f1" radius={[3, 3, 0, 0]} />
              <Bar dataKey="approved" name="Approved" fill="#10b981" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Monthly Expense Trend">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data?.byMonth || []} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatIndianCompact(v)} width={70} />
              <RTooltip formatter={(v) => formatIndianCompact(v)} />
              <Legend />
              <Line type="monotone" dataKey="claimed" name="Claimed" stroke="#6366f1" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="approved" name="Approved" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Pending Approval Aging">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data?.aging || []} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border))" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={40} />
              <RTooltip />
              <Bar dataKey="count" name="Claims" fill="#f59e0b" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className={`${CARD_SHELL} p-4`}>
      <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.2em] text-text-muted">{title}</div>
      {children}
    </div>
  );
}
