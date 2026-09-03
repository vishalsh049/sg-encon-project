import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Loader2, Pencil, Plus, RefreshCw, Search, Trash2, Wallet } from "lucide-react";

import { CARD_SHELL } from "../../components/billingDashboard/theme";
import ConfirmDialog from "../../components/ConfirmDialog";
import ClaimStatusBadge from "../../components/expenses/ClaimStatusBadge";
import NotificationsCard from "../../components/expenses/NotificationsCard";
import { useUser } from "../../context/UserContext";
import { getPagePermission } from "../../utils/access";
import { formatCurrency, formatDate } from "../../utils/penaltyFormat";
import { deleteClaim, fetchMyClaims } from "../../lib/expenseClaimsApi";

const TABS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "submitted", label: "Submitted" },
  { key: "pending approval", label: "Pending Approval" },
  { key: "returned", label: "Returned" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "completed", label: "Completed" },
];

const PAGE_SIZE = 20;

// Earliest–latest expense date across the claim's items.
function expenseDateRange(row) {
  const from = (row.expenseDateFrom || "").toString().slice(0, 10);
  const to = (row.expenseDateTo || "").toString().slice(0, 10);
  if (!from && !to) return "—";
  if (!to || from === to) return formatDate(from || to);
  return `${formatDate(from)} – ${formatDate(to)}`;
}

export default function MyExpenses() {
  const navigate = useNavigate();
  const { user } = useUser();
  const canDelete = getPagePermission(user, "my-expenses").delete;
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchMyClaims({
        tab,
        search: debouncedSearch,
        page,
        pageSize: PAGE_SIZE,
      });
      setRows(res.data || []);
      setTotal(res.total || 0);
    } catch (error) {
      toast.error(error.message || "Failed to load your expense claims.");
    } finally {
      setLoading(false);
    }
  }, [tab, debouncedSearch, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isEmpty = !loading && rows.length === 0;

  const openClaim = (row) => {
    if (row.status === "draft" || row.status === "returned") {
      navigate(`/dashboard/expense-claims/raise/${row.id}`);
    } else {
      navigate(`/dashboard/expense-claims/my/${row.id}`);
    }
  };

  const approvedValue = (row) => {
    const v = row.finalApprovedTotal ?? row.l2ApprovedTotal ?? row.l1ApprovedTotal;
    return v == null ? "—" : formatCurrency(v);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteClaim(deleteTarget.id);
      toast.success("Claim deleted.");
      setDeleteTarget(null);
      load();
    } catch (error) {
      toast.error(error.message || "Failed to delete the claim.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-text-primary sm:text-xl">
            My Expenses
          </h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            Every claim you have raised, with its live approval status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border-color bg-surface px-4 text-sm font-medium text-text-secondary transition hover:bg-surface-muted"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button
            type="button"
            onClick={() => navigate("/dashboard/expense-claims/raise")}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
          >
            <Plus size={16} /> Raise Expense
          </button>
        </div>
      </div>

      <NotificationsCard />

      {/* Tabs */}
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

      {/* Search */}
      <div className={`${CARD_SHELL} flex items-center gap-2 px-3 py-2`}>
        <Search size={15} className="text-text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search claim number, employee, CMP…"
          className="w-full border-0 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
        />
      </div>

      {/* Table */}
      <div className={`${CARD_SHELL} overflow-hidden`}>
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
              <Wallet size={26} />
            </div>
            <h3 className="text-base font-semibold text-text-primary">No claims here yet</h3>
            <p className="max-w-sm text-sm text-text-muted">
              {tab === "all"
                ? "Raise your first expense claim — add one or many expense items, attach bills, and submit."
                : "Nothing in this tab right now."}
            </p>
            {tab === "all" ? (
              <button
                type="button"
                onClick={() => navigate("/dashboard/expense-claims/raise")}
                className="mt-1 inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-5 text-sm font-semibold text-white shadow-sm hover:opacity-95"
              >
                <Plus size={16} /> Raise Expense
              </button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="bg-surface-muted text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                  <th className="px-4 py-2.5">Claim No</th>
                  <th className="px-4 py-2.5">Expense Date</th>
                  <th className="px-4 py-2.5">Submitted</th>
                  <th className="px-4 py-2.5">Items</th>
                  <th className="px-4 py-2.5 text-right">Claimed</th>
                  <th className="px-4 py-2.5 text-right">Approved</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-color">
                {loading && rows.length === 0
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={8} className="px-4 py-3">
                          <div className="h-4 w-full animate-pulse rounded bg-surface-muted" />
                        </td>
                      </tr>
                    ))
                  : rows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => openClaim(row)}
                        className="cursor-pointer transition hover:bg-surface-muted/60"
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 font-semibold text-text-primary">
                          {row.claimNumber || (
                            <span className="italic text-text-muted">Draft</span>
                          )}
                          {user?.id && row.employeeUserId && row.employeeUserId !== user.id ? (
                            <span className="ml-1.5 rounded border border-amber-300 bg-amber-50 px-1 text-[10px] font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                              for {row.employeeName || "another employee"}
                            </span>
                          ) : user?.id &&
                            row.submittedByUserId &&
                            row.submittedByUserId !== user.id &&
                            row.employeeUserId === user.id ? (
                            <span className="ml-1.5 rounded border border-sky-300 bg-sky-50 px-1 text-[10px] font-medium text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                              raised by {row.submittedByName || "another employee"}
                            </span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">
                          {expenseDateRange(row)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">
                          {formatDate(
                            (row.submittedAt || row.createdAt || "").toString().slice(0, 10)
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">
                          {row.itemCount} item{row.itemCount === 1 ? "" : "s"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-text-primary">
                          {formatCurrency(row.totalClaimed)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right text-text-secondary">
                          {approvedValue(row)}
                        </td>
                        <td className="px-4 py-2.5">
                          <ClaimStatusBadge status={row.status} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {row.status === "draft" || row.status === "returned" ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/dashboard/expense-claims/raise/${row.id}`);
                                }}
                                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-color px-2.5 text-xs font-semibold text-text-secondary transition hover:bg-surface-muted"
                              >
                                <Pencil size={13} /> Edit
                              </button>
                            ) : (
                              <span className="text-xs text-text-muted">View</span>
                            )}
                            {canDelete ? (
                              <button
                                type="button"
                                title="Delete claim"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTarget(row);
                                }}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 text-rose-600 transition hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10"
                              >
                                <Trash2 size={14} />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
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

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this claim?"
        description={`This permanently removes ${
          deleteTarget?.claimNumber ? `claim ${deleteTarget.claimNumber}` : "this draft claim"
        }, all of its expense items, bills and approval history. This cannot be undone.`}
        confirmLabel="Delete Claim"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />
    </div>
  );
}
