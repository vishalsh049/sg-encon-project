import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Download, Loader2, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";

import { CARD_SHELL } from "../../components/billingDashboard/theme";
import { useUser } from "../../context/UserContext";
import { getPagePermission } from "../../utils/access";
import { formatCurrency } from "../../utils/penaltyFormat";
import {
  paymentStatusMeta,
  closureStatusMeta,
  statusMeta,
} from "../../lib/expenseClaimStatus";
import {
  fetchAdvances,
  fetchAdvanceMeta,
  exportAdvancesExcel,
} from "../../lib/expenseAdvancesApi";

const PAGE_SIZE = 20;
const EMPTY = {
  search: "",
  approvalStatus: "",
  paymentStatus: "",
  closureStatus: "",
  department: "",
  cmp: "",
  from: "",
  to: "",
};
const INPUT =
  "w-full rounded-lg border border-border-color bg-surface px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-indigo-400";

function Badge({ meta }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

export default function AdvancePayments() {
  const navigate = useNavigate();
  const { user } = useUser();
  const canDownload =
    getPagePermission(user, "expense-advances").download ||
    getPagePermission(user, "expense-finance").download;
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [filters, setFilters] = useState(EMPTY);
  const [page, setPage] = useState(1);

  const [meta, setMeta] = useState({
    departments: [],
    cmps: [],
    paymentStatuses: [],
    closureStatuses: [],
  });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAdvanceMeta()
      .then((res) => setMeta(res.data))
      .catch(() => {});
  }, []);

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
      const res = await fetchAdvances({
        ...filters,
        search: debounced,
        page,
        pageSize: PAGE_SIZE,
      });
      setRows(res.data || []);
      setTotal(res.total || 0);
    } catch (error) {
      toast.error(error.message || "Failed to load advances.");
    } finally {
      setLoading(false);
    }
  }, [filters, debounced, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const activeCount = Object.entries(filters).filter(
    ([k, v]) => k !== "search" && v
  ).length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-text-primary sm:text-xl">
            Expense Advance Payments
          </h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            Every approved advance — what was requested, approved, paid, billed and what remains.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canDownload ? (
            <button
              type="button"
              disabled={exporting}
              onClick={async () => {
                setExporting(true);
                try {
                  await exportAdvancesExcel();
                } catch (error) {
                  toast.error(error.message || "Export failed.");
                } finally {
                  setExporting(false);
                }
              }}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border-color bg-surface px-4 text-sm font-medium text-text-secondary transition hover:bg-surface-muted disabled:opacity-50"
            >
              {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              Export Excel
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

      {/* Search + filters */}
      <div className={`${CARD_SHELL} p-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-border-color bg-surface px-2.5 py-1.5">
            <Search size={15} className="text-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search advance number, employee, department…"
              className="w-full border-0 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              activeCount
                ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300"
                : "border-border-color bg-surface text-text-secondary hover:bg-surface-muted"
            }`}
          >
            <SlidersHorizontal size={14} />
            Filters{activeCount ? ` (${activeCount})` : ""}
          </button>
        </div>

        {showFilters ? (
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border-color/70 pt-3 sm:grid-cols-3 lg:grid-cols-4">
            <select
              className={INPUT}
              value={draft.paymentStatus}
              onChange={(e) => setDraft({ ...draft, paymentStatus: e.target.value })}
            >
              <option value="">Any Payment Status</option>
              {(meta.paymentStatuses || []).map((s) => (
                <option key={s} value={s}>
                  {paymentStatusMeta(s).label}
                </option>
              ))}
            </select>
            <select
              className={INPUT}
              value={draft.closureStatus}
              onChange={(e) => setDraft({ ...draft, closureStatus: e.target.value })}
            >
              <option value="">Any Bill Closure Status</option>
              {(meta.closureStatuses || []).map((s) => (
                <option key={s} value={s}>
                  {closureStatusMeta(s).label}
                </option>
              ))}
            </select>
            <select
              className={INPUT}
              value={draft.approvalStatus}
              onChange={(e) => setDraft({ ...draft, approvalStatus: e.target.value })}
            >
              <option value="">Any Approval Status</option>
              {["pending_l1", "pending_l2", "pending_final", "pending_finance", "rejected", "returned"].map(
                (s) => (
                  <option key={s} value={s}>
                    {statusMeta(s).label}
                  </option>
                )
              )}
            </select>
            <select
              className={INPUT}
              value={draft.department}
              onChange={(e) => setDraft({ ...draft, department: e.target.value })}
            >
              <option value="">Any Department</option>
              {(meta.departments || []).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              className={INPUT}
              value={draft.cmp}
              onChange={(e) => setDraft({ ...draft, cmp: e.target.value })}
            >
              <option value="">Any CMP</option>
              {(meta.cmps || []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs text-text-muted">
              From
              <input
                type="date"
                className={INPUT}
                value={draft.from}
                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-text-muted">
              To
              <input
                type="date"
                className={INPUT}
                value={draft.to}
                onChange={(e) => setDraft({ ...draft, to: e.target.value })}
              />
            </label>
            <div className="col-span-2 flex items-center gap-2 sm:col-span-3 lg:col-span-4">
              <button
                type="button"
                onClick={() => {
                  setFilters(draft);
                  setPage(1);
                }}
                className="inline-flex h-9 items-center rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-4 text-sm font-semibold text-white"
              >
                Apply Filters
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(EMPTY);
                  setFilters(EMPTY);
                  setPage(1);
                }}
                className="inline-flex h-9 items-center gap-1 rounded-full border border-border-color px-4 text-sm font-medium text-text-secondary hover:bg-surface-muted"
              >
                <X size={13} /> Reset
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Table */}
      <div className={`${CARD_SHELL} overflow-hidden`}>
        {!loading && rows.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-text-muted">
            No advances match this view.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1080px] w-full text-left text-sm">
              <thead>
                <tr className="bg-surface-muted text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                  <th className="px-4 py-2.5">Advance No</th>
                  <th className="px-4 py-2.5">Employee</th>
                  <th className="px-4 py-2.5">Dept / CMP</th>
                  <th className="px-4 py-2.5 text-right">Requested</th>
                  <th className="px-4 py-2.5 text-right">Approved</th>
                  <th className="px-4 py-2.5 text-right">Paid</th>
                  <th className="px-4 py-2.5 text-right">Bills Appr.</th>
                  <th className="px-4 py-2.5 text-right">Remaining</th>
                  <th className="px-4 py-2.5">Payment</th>
                  <th className="px-4 py-2.5">Bill Closure</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-color">
                {loading && rows.length === 0
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={10} className="px-4 py-3">
                          <div className="h-4 w-full animate-pulse rounded bg-surface-muted" />
                        </td>
                      </tr>
                    ))
                  : rows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() =>
                          navigate(`/dashboard/expense-claims/advances/${row.id}`)
                        }
                        className="cursor-pointer transition hover:bg-surface-muted/60"
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 font-semibold text-text-primary">
                          {row.advanceNumber || "—"}
                          <div className="mt-0.5">
                            <Badge meta={statusMeta(row.approvalStatus)} />
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">
                          {row.employeeName || "—"}
                          {row.employeeCode ? (
                            <span className="mt-0.5 block text-[11px] text-text-muted">
                              {row.employeeCode}
                            </span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">
                          {row.department || "—"}
                          {row.cmp ? (
                            <span className="mt-0.5 block text-[11px] text-text-muted">{row.cmp}</span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right text-text-secondary">
                          {formatCurrency(row.requestedAmount || 0)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-text-primary">
                          {row.approvedAmount != null ? formatCurrency(row.approvedAmount) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right text-text-secondary">
                          {formatCurrency(row.totalPaid || 0)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right text-text-secondary">
                          {formatCurrency(row.totalApprovedBills || 0)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-text-primary">
                          {formatCurrency(row.remainingAdvance || 0)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <Badge meta={paymentStatusMeta(row.paymentStatus)} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <Badge meta={closureStatusMeta(row.billClosureStatus)} />
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
            Page {page} of {totalPages} · {total} advances
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
