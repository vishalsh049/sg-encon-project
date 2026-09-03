import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, FileText, Loader2, Pencil, Trash2 } from "lucide-react";

import { CARD_SHELL } from "../../components/billingDashboard/theme";
import ConfirmDialog from "../../components/ConfirmDialog";
import ClaimStatusBadge from "../../components/expenses/ClaimStatusBadge";
import ClaimProgressTracker from "../../components/expenses/ClaimProgressTracker";
import ClaimApprovalTimeline from "../../components/expenses/ClaimApprovalTimeline";
import AuditTimeline from "../../components/expenses/AuditTimeline";
import ItemClassification from "../../components/expenses/ItemClassification";
import { useUser } from "../../context/UserContext";
import { getPagePermission } from "../../utils/access";
import { formatCurrency, formatDate } from "../../utils/penaltyFormat";
import { deleteClaim, fetchClaim, openBill } from "../../lib/expenseClaimsApi";

export default function ExpenseClaimDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useUser();
  const canDelete = getPagePermission(user, "my-expenses").delete;
  const [loading, setLoading] = useState(true);
  const [bundle, setBundle] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteClaim(id);
      toast.success("Claim deleted.");
      navigate("/dashboard/expense-claims/my", { replace: true });
    } catch (error) {
      toast.error(error.message || "Failed to delete the claim.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchClaim(id);
      setBundle(res.data);
    } catch (error) {
      toast.error(error.message || "Failed to load the claim.");
      navigate("/dashboard/expense-claims/my", { replace: true });
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

  const { claim, items, attachments, audit, finance, timeline } = bundle;
  const raisedOnBehalf =
    claim.submittedByUserId != null &&
    claim.employeeUserId != null &&
    claim.submittedByUserId !== claim.employeeUserId;
  const attByItem = new Map();
  attachments.forEach((att) => {
    if (!attByItem.has(att.itemId)) attByItem.set(att.itemId, []);
    attByItem.get(att.itemId).push(att);
  });

  const editable = claim.status === "draft" || claim.status === "returned";
  const showL1 = items.some((i) => i.l1ApprovedAmount != null);
  const showL2 = items.some((i) => i.l2ApprovedAmount != null);
  const showFinal = items.some((i) => i.finalApprovedAmount != null);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => navigate("/dashboard/expense-claims/my")}
            className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft size={14} /> My Expenses
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight text-text-primary sm:text-xl">
              {claim.claimNumber || "Draft Claim"}
            </h1>
            <ClaimStatusBadge status={claim.status} />
          </div>
          <p className="mt-0.5 text-sm text-text-secondary">
            {claim.employeeName ? `${claim.employeeName}${claim.employeeCode ? ` · ${claim.employeeCode}` : ""}` : "Expense claim"}
          </p>
          {raisedOnBehalf && claim.submittedByName ? (
            <p className="mt-0.5 inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              Raised on your behalf by {claim.submittedByName}
              {claim.submittedByEmployeeCode ? ` · ${claim.submittedByEmployeeCode}` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {editable ? (
            <button
              type="button"
              onClick={() => navigate(`/dashboard/expense-claims/raise/${claim.id}`)}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border-color bg-surface px-4 text-sm font-medium text-text-secondary transition hover:bg-surface-muted"
            >
              <Pencil size={15} /> Edit Claim
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-rose-200 bg-surface px-4 text-sm font-medium text-rose-600 transition hover:bg-rose-50 dark:border-rose-500/20 dark:hover:bg-rose-500/10"
            >
              <Trash2 size={15} /> Delete Claim
            </button>
          ) : null}
        </div>
      </div>

      {/* Progress tracker */}
      <div className={`${CARD_SHELL} p-4`}>
        <ClaimProgressTracker status={claim.status} />
      </div>

      {/* Approval status / timeline — real data from the claim's approval trail */}
      <div className={`${CARD_SHELL} p-4`}>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Approval Status</h2>
        <ClaimApprovalTimeline timeline={timeline} claim={claim} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Claimant details */}
        <div className={`${CARD_SHELL} p-4`}>
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Claimant Details</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            <Detail label="Claimant" value={claim.employeeName} />
            <Detail label="Employee ID" value={claim.employeeCode} />
            <Detail label="Department" value={claim.department} />
            <Detail label="Designation" value={claim.designation} />
            <Detail label="Circle" value={claim.circle} />
            <Detail label="CMP" value={claim.cmp} />
            <Detail label="Bank Account" value={claim.bankAccount} />
            <Detail label="IFSC" value={claim.ifsc} />
          </dl>
        </div>

        {/* Claim details */}
        <div className={`${CARD_SHELL} p-4`}>
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Claim Details</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            <Detail label="Submitted On" value={claim.submittedAt ? formatDate(claim.submittedAt.toString().slice(0, 10)) : "—"} />
            <Detail
              label="Raised By"
              value={
                claim.submittedByName
                  ? `${claim.submittedByName}${claim.submittedByEmployeeCode ? ` · ${claim.submittedByEmployeeCode}` : ""}${
                      raisedOnBehalf ? " (on behalf)" : ""
                    }`
                  : "—"
              }
            />
            <Detail label="Total Claimed" value={formatCurrency(claim.totalClaimed)} strong />
            {claim.l1ApprovedTotal != null ? (
              <Detail label="L1 Approved" value={formatCurrency(claim.l1ApprovedTotal)} />
            ) : null}
            {claim.l2ApprovedTotal != null ? (
              <Detail label="L2 Approved" value={formatCurrency(claim.l2ApprovedTotal)} />
            ) : null}
            {claim.finalApprovedTotal != null ? (
              <Detail label="Final Approved" value={formatCurrency(claim.finalApprovedTotal)} strong />
            ) : null}
            {finance?.paymentReference ? (
              <Detail label="Payment Reference" value={finance.paymentReference} />
            ) : null}
            {finance?.paymentDate ? (
              <Detail
                label="Payment Date"
                value={formatDate(finance.paymentDate.toString().slice(0, 10))}
              />
            ) : null}
          </dl>
        </div>
      </div>

      {/* Expense items */}
      <div className={`${CARD_SHELL} overflow-hidden`}>
        <div className="border-b border-border-color/70 px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">
            Expense Items ({items.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead>
              <tr className="bg-surface-muted text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                <th className="px-3 py-2.5">#</th>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Category</th>
                <th className="px-3 py-2.5">Description &amp; Details</th>
                <th className="px-3 py-2.5 text-right">Claimed</th>
                {showL1 ? <th className="px-3 py-2.5 text-right">L1</th> : null}
                {showL2 ? <th className="px-3 py-2.5 text-right">L2</th> : null}
                {showFinal ? <th className="px-3 py-2.5 text-right">Final</th> : null}
                <th className="px-3 py-2.5">Bill</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-color">
              {items.map((item, index) => {
                const bills = attByItem.get(item.id) || [];
                return (
                  <tr key={item.id}>
                    <td className="px-3 py-2 text-text-muted">{index + 1}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-text-secondary">
                      {formatDate((item.expenseDate || "").toString().slice(0, 10))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-text-primary">
                      {item.workCategory || item.category || "—"}
                    </td>
                    <td className="px-3 py-2 text-text-secondary">
                      <div className="max-w-[320px] truncate" title={item.description || ""}>
                        {item.description || "—"}
                      </div>
                      <ItemClassification item={item} className="mt-1" />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-text-primary">
                      {formatCurrency(item.claimedAmount)}
                    </td>
                    {showL1 ? (
                      <td className="whitespace-nowrap px-3 py-2 text-right text-text-secondary">
                        {item.l1ApprovedAmount != null ? formatCurrency(item.l1ApprovedAmount) : "—"}
                      </td>
                    ) : null}
                    {showL2 ? (
                      <td className="whitespace-nowrap px-3 py-2 text-right text-text-secondary">
                        {item.l2ApprovedAmount != null ? formatCurrency(item.l2ApprovedAmount) : "—"}
                      </td>
                    ) : null}
                    {showFinal ? (
                      <td className="whitespace-nowrap px-3 py-2 text-right text-text-secondary">
                        {item.finalApprovedAmount != null ? formatCurrency(item.finalApprovedAmount) : "—"}
                      </td>
                    ) : null}
                    <td className="px-3 py-2">
                      {bills.length ? (
                        <div className="flex flex-wrap gap-1">
                          {bills.map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() =>
                                openBill(b.id).catch((err) => toast.error(err.message))
                              }
                              className="inline-flex items-center gap-1 rounded-md border border-border-color bg-surface px-1.5 py-1 text-xs text-indigo-600 transition hover:bg-surface-muted dark:text-indigo-300"
                              title={b.fileName}
                            >
                              <FileText size={12} />
                              View
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
                <td className="px-3 py-2.5" colSpan={4}>
                  Total
                </td>
                <td className="px-3 py-2.5 text-right">{formatCurrency(claim.totalClaimed)}</td>
                {showL1 ? (
                  <td className="px-3 py-2.5 text-right">
                    {claim.l1ApprovedTotal != null ? formatCurrency(claim.l1ApprovedTotal) : "—"}
                  </td>
                ) : null}
                {showL2 ? (
                  <td className="px-3 py-2.5 text-right">
                    {claim.l2ApprovedTotal != null ? formatCurrency(claim.l2ApprovedTotal) : "—"}
                  </td>
                ) : null}
                {showFinal ? (
                  <td className="px-3 py-2.5 text-right">
                    {claim.finalApprovedTotal != null ? formatCurrency(claim.finalApprovedTotal) : "—"}
                  </td>
                ) : null}
                <td className="px-3 py-2.5" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Audit trail */}
      <div className={`${CARD_SHELL} p-4`}>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Claim History</h2>
        <AuditTimeline entries={audit} />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this claim?"
        description={`This permanently removes ${
          claim.claimNumber ? `claim ${claim.claimNumber}` : "this draft claim"
        }, all of its expense items, bills and approval history. This cannot be undone.`}
        confirmLabel="Delete Claim"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => !deleting && setConfirmDelete(false)}
      />
    </div>
  );
}

function Detail({ label, value, strong }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">{label}</dt>
      <dd className={`mt-0.5 ${strong ? "font-semibold text-text-primary" : "text-text-secondary"}`}>
        {value || "—"}
      </dd>
    </div>
  );
}
