import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Download, Loader2, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";

import { CARD_SHELL } from "../../components/billingDashboard/theme";
import ClaimStatusBadge from "../../components/expenses/ClaimStatusBadge";
import { getPagePermission } from "../../utils/access";
import { useUser } from "../../context/UserContext";
import { formatCurrency, formatDate } from "../../utils/penaltyFormat";
import { exportFinanceExcel, fetchFinanceClaims, fetchFinanceMeta } from "../../lib/expenseClaimsApi";

const SORTS = [
  { key: "submitted", label: "Submitted date" },
  { key: "claim", label: "Claim number" },
  { key: "claimed", label: "Claimed amount" },
  { key: "approved", label: "Final approved amount" },
];
const PAGE_SIZE = 20;
const EMPTY_FILTERS = {
  claimNumber: "", employee: "", employeeId: "", department: "", cmp: "",
  category: "", dateFrom: "", dateTo: "", claimMin: "", claimMax: "",
  approvedMin: "", approvedMax: "", approver: "",
};
const INPUT =
  "w-full rounded-lg border border-border-color bg-surface px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-indigo-400";

export default function FinanceExpenseProcessing() {
  const navigate = useNavigate();
  const { user } = useUser();
  const canDownload = getPagePermission(user, "expense-finance").download;

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState("submitted");
  const [dir, setDir] = useState("desc");
  const [page, setPage] = useState(1);

  const [meta, setMeta] = useState({ departments: [], cmps: [], categories: [], approvers: [] });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchFinanceMeta()
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
      const res = await fetchFinanceClaims({
        search: debounced, sort, dir, page, pageSize: PAGE_SIZE, ...filters,
      });
      setRows(res.data || []);
      setTotal(res.total || 0);
    } catch (error) {
      toast.error(error.message || "Failed to load the finance list.");
    } finally {
      setLoading(false);
    }
  }, [debounced, sort, dir, page, filters]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const applyFilters = () => {
    setFilters(draft);
    setPage(1);
  };
  const resetFilters = () => {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-text-primary sm:text-xl">
            Finance — Approved Claims
          </h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            Every expense claim that has completed Final Approval. Read-only — open a claim to view
            it and download its bills.
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
                  await exportFinanceExcel({ search: debounced, sort, dir, ...filters });
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

      {/* Search + controls */}
      <div className={`${CARD_SHELL} p-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-border-color bg-surface px-2.5 py-1.5">
            <Search size={15} className="text-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search claim number, employee, department…"
              className="w-full border-0 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
            />
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className={`${INPUT} w-auto`}>
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>Sort: {s.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="rounded-lg border border-border-color bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-muted"
          >
            {dir === "asc" ? "Ascending" : "Descending"}
          </button>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              activeFilterCount
                ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300"
                : "border-border-color bg-surface text-text-secondary hover:bg-surface-muted"
            }`}
          >
            <SlidersHorizontal size={14} />
            Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
          </button>
        </div>

        {showFilters ? (
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border-color/70 pt-3 sm:grid-cols-3 lg:grid-cols-4">
            <input className={INPUT} placeholder="Claim Number" value={draft.claimNumber} onChange={(e) => setDraft({ ...draft, claimNumber: e.target.value })} />
            <input className={INPUT} placeholder="Employee Name" value={draft.employee} onChange={(e) => setDraft({ ...draft, employee: e.target.value })} />
            <input className={INPUT} placeholder="Employee ID" value={draft.employeeId} onChange={(e) => setDraft({ ...draft, employeeId: e.target.value })} />
            <select className={INPUT} value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })}>
              <option value="">Any Department</option>
              {meta.departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select className={INPUT} value={draft.cmp} onChange={(e) => setDraft({ ...draft, cmp: e.target.value })}>
              <option value="">Any CMP</option>
              {meta.cmps.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className={INPUT} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
              <option value="">Any Category</option>
              {meta.categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className={INPUT} value={draft.approver} onChange={(e) => setDraft({ ...draft, approver: e.target.value })}>
              <option value="">Any Approver (L1/L2/Final)</option>
              {meta.approvers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <label className="flex items-center gap-1 text-xs text-text-muted">
              From
              <input type="date" className={INPUT} value={draft.dateFrom} onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })} />
            </label>
            <label className="flex items-center gap-1 text-xs text-text-muted">
              To
              <input type="date" className={INPUT} value={draft.dateTo} onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })} />
            </label>
            <div className="flex gap-1">
              <input className={INPUT} type="number" placeholder="Claim ≥" value={draft.claimMin} onChange={(e) => setDraft({ ...draft, claimMin: e.target.value })} />
              <input className={INPUT} type="number" placeholder="Claim ≤" value={draft.claimMax} onChange={(e) => setDraft({ ...draft, claimMax: e.target.value })} />
            </div>
            <div className="flex gap-1">
              <input className={INPUT} type="number" placeholder="Appr ≥" value={draft.approvedMin} onChange={(e) => setDraft({ ...draft, approvedMin: e.target.value })} />
              <input className={INPUT} type="number" placeholder="Appr ≤" value={draft.approvedMax} onChange={(e) => setDraft({ ...draft, approvedMax: e.target.value })} />
            </div>
            <div className="col-span-2 flex items-center gap-2 sm:col-span-3 lg:col-span-4">
              <button
                type="button"
                onClick={applyFilters}
                className="inline-flex h-9 items-center rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-4 text-sm font-semibold text-white"
              >
                Apply Filters
              </button>
              <button
                type="button"
                onClick={resetFilters}
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
            No fully-approved claims match this view.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[920px] w-full text-left text-sm">
              <thead>
                <tr className="bg-surface-muted text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                  <th className="px-4 py-2.5">Claim No</th>
                  <th className="px-4 py-2.5">Employee</th>
                  <th className="px-4 py-2.5">Employee ID</th>
                  <th className="px-4 py-2.5">Department</th>
                  <th className="px-4 py-2.5">CMP</th>
                  <th className="px-4 py-2.5">Circle</th>
                  <th className="px-4 py-2.5">Submitted</th>
                  <th className="px-4 py-2.5 text-right">Claimed</th>
                  <th className="px-4 py-2.5 text-right">Final Approved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-color">
                {loading && rows.length === 0
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={9} className="px-4 py-3">
                          <div className="h-4 w-full animate-pulse rounded bg-surface-muted" />
                        </td>
                      </tr>
                    ))
                  : rows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => navigate(`/dashboard/expense-claims/finance/${row.id}`)}
                        className="cursor-pointer transition hover:bg-surface-muted/60"
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 font-semibold text-text-primary">
                          {row.claimNumber || "—"}
                          <div className="mt-0.5">
                            <ClaimStatusBadge status={row.status} />
                          </div>
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
                        <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">{row.department || "—"}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">{row.cmp || "—"}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">{row.circle || "—"}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">
                          {formatDate((row.submittedAt || "").toString().slice(0, 10))}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-text-primary">
                          {formatCurrency(row.totalClaimed)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                          {row.finalApprovedTotal != null ? formatCurrency(row.finalApprovedTotal) : "—"}
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
          <span>Page {page} of {totalPages} · {total} claims</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-border-color px-3 py-1.5 font-medium disabled:opacity-40">Previous</button>
            <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded-lg border border-border-color px-3 py-1.5 font-medium disabled:opacity-40">Next</button>
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
