import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, FileText, Loader2, Save } from "lucide-react";

import { CARD_SHELL } from "../../components/billingDashboard/theme";
import ClaimStatusBadge from "../../components/expenses/ClaimStatusBadge";
import ClaimProgressTracker from "../../components/expenses/ClaimProgressTracker";
import AuditTimeline from "../../components/expenses/AuditTimeline";
import { financeStatusMeta } from "../../lib/expenseClaimStatus";
import { useUser } from "../../context/UserContext";
import { formatCurrency, formatDate } from "../../utils/penaltyFormat";
import { fetchFinanceClaim, openBill, saveFinance } from "../../lib/expenseClaimsApi";

const FINANCE_OPTIONS = [
  { key: "pending", label: "Pending Processing" },
  { key: "processing", label: "Processing" },
  { key: "processed", label: "Processed" },
  { key: "on_hold", label: "On Hold" },
];
const INPUT =
  "w-full rounded-xl border border-border-color bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-indigo-400 disabled:bg-surface-muted disabled:text-text-muted";

export default function FinanceClaimDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useUser();

  const [loading, setLoading] = useState(true);
  const [bundle, setBundle] = useState(null);
  const [form, setForm] = useState({
    financeStatus: "processing",
    paymentReference: "",
    paymentDate: "",
    financeRemarks: "",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchFinanceClaim(id);
      setBundle(res.data);
      const fin = res.data.finance;
      setForm({
        financeStatus: fin?.financeStatus && fin.financeStatus !== "pending" ? fin.financeStatus : "processing",
        paymentReference: fin?.paymentReference || "",
        paymentDate: fin?.paymentDate ? String(fin.paymentDate).slice(0, 10) : "",
        financeRemarks: fin?.financeRemarks || "",
      });
    } catch (error) {
      toast.error(error.message || "Failed to load the claim.");
      navigate("/dashboard/expense-claims/finance", { replace: true });
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (loading || !bundle) {
    return (
      <div className="flex items-center justify-center py-24 text-text-muted">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }

  const { claim, items, attachments, audit, finance, approvers } = bundle;
  const attByItem = new Map();
  attachments.forEach((a) => {
    if (!attByItem.has(a.itemId)) attByItem.set(a.itemId, []);
    attByItem.get(a.itemId).push(a);
  });

  const canProcess = ["pending_finance", "completed"].includes(claim.status);
  const needsPayment = form.financeStatus === "processed";

  const save = async () => {
    if (needsPayment && !form.paymentReference.trim()) {
      toast.error("Enter a Payment Reference Number to mark the claim Processed.");
      return;
    }
    if (needsPayment && !form.paymentDate) {
      toast.error("Enter a Payment Date to mark the claim Processed.");
      return;
    }
    setSaving(true);
    try {
      const res = await saveFinance(claim.id, {
        financeStatus: form.financeStatus,
        paymentReference: form.paymentReference.trim() || null,
        paymentDate: form.paymentDate || null,
        financeRemarks: form.financeRemarks.trim() || null,
      });
      setBundle(res.data);
      toast.success(
        form.financeStatus === "processed"
          ? "Claim marked Processed and completed."
          : `Finance status set to ${financeStatusMeta(form.financeStatus).label}.`
      );
    } catch (error) {
      toast.error(error.message || "Failed to save finance processing.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <button
          type="button"
          onClick={() => navigate("/dashboard/expense-claims/finance")}
          className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft size={14} /> Finance queue
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight text-text-primary sm:text-xl">
            {claim.claimNumber}
          </h1>
          <ClaimStatusBadge status={claim.status} />
          {finance ? (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${financeStatusMeta(finance.financeStatus).className}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${financeStatusMeta(finance.financeStatus).dot}`} />
              {financeStatusMeta(finance.financeStatus).label}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-sm text-text-secondary">{claim.purpose || "No purpose provided"}</p>
      </div>

      <div className={`${CARD_SHELL} p-4`}>
        <ClaimProgressTracker status={claim.status} />
      </div>

      {/* Amount ladder */}
      <div className={`${CARD_SHELL} grid grid-cols-2 gap-3 p-4 sm:grid-cols-4`}>
        <Stat label="Claimed Amount" value={formatCurrency(claim.totalClaimed)} />
        <Stat label="L1 Approved" value={claim.l1ApprovedTotal != null ? formatCurrency(claim.l1ApprovedTotal) : "—"} />
        <Stat label="L2 Approved" value={claim.l2ApprovedTotal != null ? formatCurrency(claim.l2ApprovedTotal) : "—"} />
        <Stat
          label="Final Approved"
          value={claim.finalApprovedTotal != null ? formatCurrency(claim.finalApprovedTotal) : "—"}
          tone="text-emerald-600 dark:text-emerald-400"
          strong
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Employee + approvers */}
        <div className={`${CARD_SHELL} p-4`}>
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Employee & Approval Chain</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            <Detail label="Employee" value={claim.employeeName} />
            <Detail label="Employee ID" value={claim.employeeCode} />
            <Detail label="Department" value={claim.department} />
            <Detail label="Cost Centre" value={claim.costCentre} />
            <Detail label="L1 Approver" value={approvers?.l1} />
            <Detail label="L2 Approver" value={approvers?.l2} />
            <Detail label="Final Approver" value={approvers?.final} />
            <Detail
              label="Submitted"
              value={claim.submittedAt ? formatDate(claim.submittedAt.toString().slice(0, 10)) : "—"}
            />
          </dl>
        </div>

        {/* Finance processing form */}
        <div className={`${CARD_SHELL} p-4`}>
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Finance Processing</h2>
          {!canProcess ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
              This claim is not in the finance queue (status: {claim.status}). Processing is disabled.
            </p>
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">
                  Finance Status
                </span>
                <select
                  className={INPUT}
                  value={form.financeStatus}
                  onChange={(e) => setForm((f) => ({ ...f, financeStatus: e.target.value }))}
                >
                  {FINANCE_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">
                    Payment Reference {needsPayment ? <span className="text-rose-500">*</span> : null}
                  </span>
                  <input
                    className={INPUT}
                    placeholder="UTR / cheque / voucher no."
                    value={form.paymentReference}
                    onChange={(e) => setForm((f) => ({ ...f, paymentReference: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">
                    Payment Date {needsPayment ? <span className="text-rose-500">*</span> : null}
                  </span>
                  <input
                    type="date"
                    className={INPUT}
                    value={form.paymentDate}
                    onChange={(e) => setForm((f) => ({ ...f, paymentDate: e.target.value }))}
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">
                  Finance Remarks
                </span>
                <textarea
                  rows={2}
                  className={INPUT}
                  placeholder="Optional note"
                  value={form.financeRemarks}
                  onChange={(e) => setForm((f) => ({ ...f, financeRemarks: e.target.value }))}
                />
              </label>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">
                  Processed by: {finance?.processedBy || user?.name || "—"}
                  {finance?.processedAt ? ` · ${formatDate(finance.processedAt.toString().slice(0, 10))}` : ""}
                </span>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
                  Save
                </button>
              </div>
              <p className="text-[11px] text-text-muted">
                Approval amounts are locked to Finance — changes must go back through the approval chain.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Items */}
      <div className={`${CARD_SHELL} overflow-hidden`}>
        <div className="border-b border-border-color/70 px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Expense Items ({items.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead>
              <tr className="bg-surface-muted text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                <th className="px-3 py-2.5">#</th>
                <th className="px-3 py-2.5">Category</th>
                <th className="px-3 py-2.5">Description</th>
                <th className="px-3 py-2.5 text-right">Claimed</th>
                <th className="px-3 py-2.5 text-right">Final Approved</th>
                <th className="px-3 py-2.5">Bill</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-color">
              {items.map((it, index) => {
                const bills = attByItem.get(it.id) || [];
                const finalAmt =
                  it.finalApprovedAmount ?? it.l2ApprovedAmount ?? it.l1ApprovedAmount ?? null;
                return (
                  <tr key={it.id}>
                    <td className="px-3 py-2 text-text-muted">{index + 1}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-text-primary">{it.category}</td>
                    <td className="max-w-[240px] truncate px-3 py-2 text-text-secondary" title={it.description || ""}>
                      {it.description || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-text-primary">
                      {formatCurrency(it.claimedAmount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-emerald-600 dark:text-emerald-400">
                      {finalAmt != null ? formatCurrency(finalAmt) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {bills.length ? (
                        <div className="flex flex-wrap gap-1">
                          {bills.map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => openBill(b.id).catch((err) => toast.error(err.message))}
                              className="inline-flex items-center gap-1 rounded-md border border-border-color bg-surface px-1.5 py-1 text-xs text-indigo-600 transition hover:bg-surface-muted dark:text-indigo-300"
                              title={b.fileName}
                            >
                              <FileText size={12} /> View
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-text-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-surface-muted/60 font-semibold text-text-primary">
                <td className="px-3 py-2.5" colSpan={3}>Total</td>
                <td className="px-3 py-2.5 text-right">{formatCurrency(claim.totalClaimed)}</td>
                <td className="px-3 py-2.5 text-right text-emerald-600 dark:text-emerald-400">
                  {claim.finalApprovedTotal != null ? formatCurrency(claim.finalApprovedTotal) : "—"}
                </td>
                <td className="px-3 py-2.5" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className={`${CARD_SHELL} p-4`}>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Claim History</h2>
        <AuditTimeline entries={audit} />
      </div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">{label}</dt>
      <dd className="mt-0.5 text-text-secondary">{value || "—"}</dd>
    </div>
  );
}

function Stat({ label, value, tone = "text-text-primary", strong }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">{label}</div>
      <div className={`${strong ? "text-lg" : "text-base"} font-bold ${tone}`}>{value}</div>
    </div>
  );
}
