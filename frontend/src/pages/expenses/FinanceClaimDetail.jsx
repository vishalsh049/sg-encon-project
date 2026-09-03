import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, Download, FileText, Loader2 } from "lucide-react";

import { CARD_SHELL } from "../../components/billingDashboard/theme";
import ClaimStatusBadge from "../../components/expenses/ClaimStatusBadge";
import ClaimProgressTracker from "../../components/expenses/ClaimProgressTracker";
import ClaimApprovalTimeline from "../../components/expenses/ClaimApprovalTimeline";
import AuditTimeline from "../../components/expenses/AuditTimeline";
import ItemClassification from "../../components/expenses/ItemClassification";
import { formatCurrency, formatDate } from "../../utils/penaltyFormat";
import { downloadBill, fetchFinanceClaim, openBill } from "../../lib/expenseClaimsApi";

// Read-only view of a fully final-approved claim held in Finance. There is no
// finance-processing action here — Finance can only view the claim and its
// documents. All approval data is display-only.
export default function FinanceClaimDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [bundle, setBundle] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchFinanceClaim(id);
      setBundle(res.data);
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

  const { claim, items, attachments, audit, approvers, timeline } = bundle;
  const raisedOnBehalf =
    claim.submittedByUserId != null &&
    claim.employeeUserId != null &&
    claim.submittedByUserId !== claim.employeeUserId;
  const attByItem = new Map();
  attachments.forEach((a) => {
    if (!attByItem.has(a.itemId)) attByItem.set(a.itemId, []);
    attByItem.get(a.itemId).push(a);
  });

  // Approval timestamps come from the audit trail (no dedicated columns).
  const apprDate = { l1: null, l2: null, final: null };
  (audit || []).forEach((e) => {
    if (["l1", "l2", "final"].includes(e.stage) && /_APPROVED/.test(e.action || "")) {
      apprDate[e.stage] = e.createdAt;
    }
  });
  const withDate = (name, at) =>
    name ? `${name}${at ? ` · ${formatDate(String(at).slice(0, 10))}` : ""}` : null;

  return (
    <div className="space-y-3">
      <div>
        <button
          type="button"
          onClick={() => navigate("/dashboard/expense-claims/finance")}
          className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft size={14} /> Finance
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight text-text-primary sm:text-xl">
            {claim.claimNumber}
          </h1>
          <ClaimStatusBadge status={claim.status} />
        </div>
        <p className="mt-0.5 text-sm text-text-secondary">
          {claim.employeeName}
          {claim.employeeCode ? ` · ${claim.employeeCode}` : ""}
          {claim.department ? ` · ${claim.department}` : ""}
        </p>
      </div>

      <div className={`${CARD_SHELL} p-4`}>
        <ClaimProgressTracker status={claim.status} />
      </div>

      {/* Read-only banner */}
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
        <span className="text-sm font-bold uppercase tracking-[0.14em]">Fully Approved</span>
        <span className="text-xs text-emerald-700/80 dark:text-emerald-300/80">
          This claim has completed L1, L2 and Final approval. Finance can view the claim and
          download its documents — this is a read-only record.
        </span>
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

      {/* Real approval trail */}
      <div className={`${CARD_SHELL} p-4`}>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Approval Status</h2>
        <ClaimApprovalTimeline timeline={timeline} claim={claim} />
      </div>

      {/* Employee + approval chain */}
      <div className={`${CARD_SHELL} p-4`}>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Claimant &amp; Approval Chain</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm sm:grid-cols-3 lg:grid-cols-4">
          <Detail label="Claim Number" value={claim.claimNumber} />
          <Detail label="Claimant" value={claim.employeeName} />
          <Detail label="Employee ID" value={claim.employeeCode} />
          <Detail
            label="Raised By"
            value={
              claim.submittedByName
                ? `${claim.submittedByName}${
                    claim.submittedByEmployeeCode ? ` · ${claim.submittedByEmployeeCode}` : ""
                  }${raisedOnBehalf ? " (on behalf)" : ""}`
                : "—"
            }
          />
          <Detail label="Department" value={claim.department} />
          <Detail label="CMP" value={claim.cmp} />
          <Detail label="Circle" value={claim.circle} />
          <Detail label="Bank Account" value={claim.bankAccount} />
          <Detail label="IFSC" value={claim.ifsc} />
          <Detail
            label="Submitted"
            value={claim.submittedAt ? formatDate(claim.submittedAt.toString().slice(0, 10)) : "—"}
          />
          <Detail label="L1 Approver" value={withDate(approvers?.l1, apprDate.l1)} />
          <Detail label="L2 Approver" value={withDate(approvers?.l2, apprDate.l2)} />
          <Detail label="Final Approver" value={withDate(approvers?.final, apprDate.final)} />
        </dl>
      </div>

      {/* Items */}
      <div className={`${CARD_SHELL} overflow-hidden`}>
        <div className="border-b border-border-color/70 px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Expense Items ({items.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[920px] w-full text-left text-sm">
            <thead>
              <tr className="bg-surface-muted text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                <th className="px-3 py-2.5">#</th>
                <th className="px-3 py-2.5">Category</th>
                <th className="px-3 py-2.5">Description</th>
                <th className="px-3 py-2.5">Expense Date</th>
                <th className="px-3 py-2.5 text-right">Claimed</th>
                <th className="px-3 py-2.5 text-right">L1 Approved</th>
                <th className="px-3 py-2.5 text-right">L2 Approved</th>
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
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-text-primary">
                      {it.workCategory || it.category}
                    </td>
                    <td className="px-3 py-2 text-text-secondary">
                      <div className="max-w-[300px] truncate" title={it.description || ""}>
                        {it.description || "—"}
                      </div>
                      <ItemClassification item={it} className="mt-1" />
                      {it.l1Reason || it.l2Reason || it.finalReason ? (
                        <div className="mt-1 space-y-0.5 text-[11px] text-text-muted">
                          {it.l1Reason ? <div><span className="font-semibold">L1:</span> {it.l1Reason}</div> : null}
                          {it.l2Reason ? <div><span className="font-semibold">L2:</span> {it.l2Reason}</div> : null}
                          {it.finalReason ? <div><span className="font-semibold">Final:</span> {it.finalReason}</div> : null}
                        </div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-text-secondary">
                      {it.expenseDate ? formatDate(String(it.expenseDate).slice(0, 10)) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-text-primary">
                      {formatCurrency(it.claimedAmount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-text-secondary">
                      {it.l1ApprovedAmount != null ? formatCurrency(it.l1ApprovedAmount) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-text-secondary">
                      {it.l2ApprovedAmount != null ? formatCurrency(it.l2ApprovedAmount) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-emerald-600 dark:text-emerald-400">
                      {finalAmt != null ? formatCurrency(finalAmt) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {bills.length ? (
                        <div className="flex flex-col gap-1">
                          {bills.map((b) => (
                            <div key={b.id} className="flex items-center gap-1" title={b.fileName}>
                              <button
                                type="button"
                                onClick={() => openBill(b.id).catch((err) => toast.error(err.message))}
                                className="inline-flex items-center gap-1 rounded-md border border-border-color bg-surface px-1.5 py-1 text-xs text-indigo-600 transition hover:bg-surface-muted dark:text-indigo-300"
                              >
                                <FileText size={12} /> View
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  downloadBill(b.id, b.fileName).catch((err) => toast.error(err.message))
                                }
                                className="inline-flex items-center gap-1 rounded-md border border-border-color bg-surface px-1.5 py-1 text-xs text-text-secondary transition hover:bg-surface-muted"
                              >
                                <Download size={12} /> Download
                              </button>
                            </div>
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
                <td className="px-3 py-2.5" colSpan={4}>Total</td>
                <td className="px-3 py-2.5 text-right">{formatCurrency(claim.totalClaimed)}</td>
                <td className="px-3 py-2.5 text-right text-text-secondary">
                  {claim.l1ApprovedTotal != null ? formatCurrency(claim.l1ApprovedTotal) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right text-text-secondary">
                  {claim.l2ApprovedTotal != null ? formatCurrency(claim.l2ApprovedTotal) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right text-emerald-600 dark:text-emerald-400">
                  {claim.finalApprovedTotal != null ? formatCurrency(claim.finalApprovedTotal) : "—"}
                </td>
                <td className="px-3 py-2.5" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Approval history */}
      <div className={`${CARD_SHELL} p-4`}>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Approval History</h2>
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
