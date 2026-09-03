import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { CheckCheck, Inbox, Loader2, RefreshCw, Search } from "lucide-react";

import { CARD_SHELL } from "../../components/billingDashboard/theme";
import ConfirmDialog from "../../components/ConfirmDialog";
import ClaimStatusBadge from "../../components/expenses/ClaimStatusBadge";
import NotificationsCard from "../../components/expenses/NotificationsCard";
import { useUser } from "../../context/UserContext";
import { getPagePermission } from "../../utils/access";
import { formatCurrency, formatDate } from "../../utils/penaltyFormat";
import { bulkApproveClaims, fetchApprovals } from "../../lib/expenseClaimsApi";

const TABS = [
  { key: "pending", label: "Pending My Approval" },
  { key: "all", label: "All Assigned To Me" },
];
const PAGE_SIZE = 20;
const STAGE_LABEL = { l1: "L1", l2: "L2", final: "Final" };
const PENDING = ["pending_l1", "pending_l2", "pending_final"];

// A row can be bulk-approved only if it is currently sitting at this user's
// approval stage (the backend re-checks, but keep the UI honest).
const isActionable = (row) => Boolean(row.myStage) && PENDING.includes(row.status);

export default function ExpenseApprovals() {
  const navigate = useNavigate();
  const { user } = useUser();
  const perm = getPagePermission(user, "expense-approvals");
  const canApprove = perm.edit;
  const [tab, setTab] = useState("pending");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const colCount = 10 + (canApprove ? 1 : 0);
  const actionableRows = rows.filter(isActionable);
  const allSelected = actionableRows.length > 0 && actionableRows.every((r) => selected.has(r.id));

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
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

  const toggleRow = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => {
      if (actionableRows.every((r) => prev.has(r.id))) return new Set();
      return new Set(actionableRows.map((r) => r.id));
    });

  const handleBulkApprove = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    setBulkBusy(true);
    try {
      const res = await bulkApproveClaims(ids);
      const { approved = 0, failed = 0, results = [] } = res || {};
      if (approved) {
        toast.success(
          `${approved} claim${approved === 1 ? "" : "s"} approved and forwarded${
            failed ? `. ${failed} could not be approved.` : "."
          }`
        );
      }
      if (failed && !approved) {
        const firstErr = results.find((r) => !r.ok)?.error;
        toast.error(firstErr || `${failed} claim${failed === 1 ? "" : "s"} could not be approved.`);
      }
      setBulkOpen(false);
      load();
    } catch (error) {
      toast.error(error.message || "Bulk approval failed.");
    } finally {
      setBulkBusy(false);
    }
  };

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
        <div className="flex flex-wrap items-center gap-2">
          {canApprove && selected.size > 0 ? (
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              disabled={bulkBusy}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
            >
              {bulkBusy ? <Loader2 className="animate-spin" size={15} /> : <CheckCheck size={16} />}
              Approve {selected.size} Selected
            </button>
          ) : null}
          <button
            type="button"
            onClick={load}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border-color bg-surface px-4 text-sm font-medium text-text-secondary transition hover:bg-surface-muted"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
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
                  {canApprove ? (
                    <th className="w-10 px-3 py-2.5">
                      <input
                        type="checkbox"
                        aria-label="Select all approvable claims on this page"
                        className="h-4 w-4 cursor-pointer accent-emerald-600"
                        checked={allSelected}
                        disabled={actionableRows.length === 0}
                        onChange={toggleAll}
                      />
                    </th>
                  ) : null}
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
                        <td colSpan={colCount} className="px-4 py-3">
                          <div className="h-4 w-full animate-pulse rounded bg-surface-muted" />
                        </td>
                      </tr>
                    ))
                  : rows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => navigate(`/dashboard/expense-claims/approvals/${row.id}`)}
                        className={`cursor-pointer transition hover:bg-surface-muted/60 ${
                          selected.has(row.id) ? "bg-emerald-50/60 dark:bg-emerald-500/10" : ""
                        }`}
                      >
                        {canApprove ? (
                          <td className="w-10 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                            {isActionable(row) ? (
                              <input
                                type="checkbox"
                                aria-label={`Select claim ${row.claimNumber || row.id}`}
                                className="h-4 w-4 cursor-pointer accent-emerald-600"
                                checked={selected.has(row.id)}
                                onChange={() => toggleRow(row.id)}
                              />
                            ) : null}
                          </td>
                        ) : null}
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
                          {row.submittedByName &&
                          row.submittedByUserId !== row.employeeUserId ? (
                            <span className="mt-0.5 block text-[11px] text-text-muted">
                              raised by {row.submittedByName}
                            </span>
                          ) : null}
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

      <ConfirmDialog
        open={bulkOpen}
        title={`Approve ${selected.size} claim${selected.size === 1 ? "" : "s"}?`}
        description={
          `Every expense item on ${selected.size === 1 ? "this claim" : "these claims"} will be approved in full ` +
          `at the amount handed to your stage, and each claim moves to the next stage (or Finance). ` +
          `Items an earlier approver already reduced or rejected pass through unchanged. This cannot be undone.`
        }
        confirmLabel={`Approve ${selected.size}`}
        tone="primary"
        busy={bulkBusy}
        onConfirm={handleBulkApprove}
        onCancel={() => !bulkBusy && setBulkOpen(false)}
      />
    </div>
  );
}
