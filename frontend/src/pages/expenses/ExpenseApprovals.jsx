import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Inbox, Loader2, RefreshCw, Search } from "lucide-react";

import { CARD_SHELL } from "../../components/billingDashboard/theme";
import ClaimStatusBadge from "../../components/expenses/ClaimStatusBadge";
import NotificationsCard from "../../components/expenses/NotificationsCard";
import { formatCurrency, formatDate } from "../../utils/penaltyFormat";
import { fetchApprovals } from "../../lib/expenseClaimsApi";

const TABS = [
  { key: "pending", label: "Pending My Approval" },
  { key: "all", label: "All Assigned To Me" },
];
const PAGE_SIZE = 20;
const STAGE_LABEL = { l1: "L1", l2: "L2", final: "Final" };

export default function ExpenseApprovals() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("pending");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApprovals({ tab, search: debounced, page, pageSize: PAGE_SIZE });
      setRows(res.data || []);
      setTotal(res.total || 0);
    } catch (error) {
      toast.error(error.message || "Failed to load the approvals queue.");
    } finally {
      setLoading(false);
    }
  }, [tab, debounced, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isEmpty = !loading && rows.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-text-primary sm:text-xl">
            Expense Approvals
          </h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            Claims waiting on your L1, L2 or Final approval.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-border-color bg-surface px-4 text-sm font-medium text-text-secondary transition hover:bg-surface-muted"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <NotificationsCard />

      <div className="flex flex-wrap gap-1 rounded-xl border border-border-color bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setTab(t.key);
              setPage(1);
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              tab === t.key
                ? "bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-sm"
                : "text-text-secondary hover:bg-surface-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={`${CARD_SHELL} flex items-center gap-2 px-3 py-2`}>
        <Search size={15} className="text-text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search claim number, employee, designation…"
          className="w-full border-0 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
        />
      </div>

      <div className={`${CARD_SHELL} overflow-hidden`}>
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
              <Inbox size={26} />
            </div>
            <h3 className="text-base font-semibold text-text-primary">Nothing to approve</h3>
            <p className="max-w-sm text-sm text-text-muted">
              {tab === "pending"
                ? "You're all caught up — no claims are waiting on you right now."
                : "No claims have been routed to you yet."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1040px] w-full text-left text-sm">
              <thead>
                <tr className="bg-surface-muted text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                  <th className="px-4 py-2.5">Claim No</th>
                  <th className="px-4 py-2.5">Employee</th>
                  <th className="px-4 py-2.5">Employee ID</th>
                  <th className="px-4 py-2.5">Designation</th>
                  <th className="px-4 py-2.5">Circle</th>
                  <th className="px-4 py-2.5">CMP</th>
                  <th className="px-4 py-2.5">Items</th>
                  <th className="px-4 py-2.5 text-right">Total Claimed</th>
                  <th className="px-4 py-2.5">Submitted</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-color">
                {loading && rows.length === 0
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={10} className="px-4 py-3">
                          <div className="h-4 w-full animate-pulse rounded bg-surface-muted" />
                        </td>
                      </tr>
                    ))
                  : rows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => navigate(`/dashboard/expense-claims/approvals/${row.id}`)}
                        className="cursor-pointer transition hover:bg-surface-muted/60"
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 font-semibold text-text-primary">
                          {row.claimNumber || "—"}
                          {row.myStage ? (
                            <span className="ml-1.5 rounded border border-border-color px-1 text-[10px] font-medium text-text-secondary">
                              {STAGE_LABEL[row.myStage] || row.myStage}
                            </span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">
                          {row.employeeName || "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">
                          {row.employeeCode || "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">
                          {row.designation || "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">
                          {row.circle || "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">
                          {row.cmp || "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">
                          {row.itemCount} item{row.itemCount === 1 ? "" : "s"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-text-primary">
                          {formatCurrency(row.totalClaimed)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">
                          {formatDate((row.submittedAt || "").toString().slice(0, 10))}
                        </td>
                        <td className="px-4 py-2.5">
                          <ClaimStatusBadge status={row.status} />
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {total > PAGE_SIZE ? (
        <div className="flex items-center justify-between text-sm text-text-secondary">
          <span>
            Page {page} of {totalPages} · {total} claims
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-border-color px-3 py-1.5 font-medium disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-border-color px-3 py-1.5 font-medium disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {loading && rows.length > 0 ? (
        <div className="flex items-center justify-center gap-2 text-xs text-text-muted">
          <Loader2 className="animate-spin" size={13} /> Updating…
        </div>
      ) : null}
    </div>
  );
}
