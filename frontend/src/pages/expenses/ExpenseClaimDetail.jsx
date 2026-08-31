import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, FileText, Loader2, Pencil } from "lucide-react";

import { CARD_SHELL } from "../../components/billingDashboard/theme";
import ClaimStatusBadge from "../../components/expenses/ClaimStatusBadge";
import ClaimProgressTracker from "../../components/expenses/ClaimProgressTracker";
import AuditTimeline from "../../components/expenses/AuditTimeline";
import { formatCurrency, formatDate } from "../../utils/penaltyFormat";
import { fetchClaim, openBill } from "../../lib/expenseClaimsApi";

export default function ExpenseClaimDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [bundle, setBundle] = useState(null);

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

  const { claim, items, attachments, audit, finance } = bundle;
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
            {claim.purpose || "No purpose provided"}
          </p>
        </div>
        {editable ? (
          <button
            type="button"
            onClick={() => navigate(`/dashboard/expense-claims/raise/${claim.id}`)}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border-color bg-surface px-4 text-sm font-medium text-text-secondary transition hover:bg-surface-muted"
          >
            <Pencil size={15} /> Edit Claim
          </button>
        ) : null}
      </div>

      {/* Progress tracker */}
      <div className={`${CARD_SHELL} p-4`}>
        <ClaimProgressTracker status={claim.status} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Employee details */}
        <div className={`${CARD_SHELL} p-4`}>
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Employee Details</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            <Detail label="Employee" value={claim.employeeName} />
            <Detail label="Employee ID" value={claim.employeeCode} />
            <Detail label="Department" value={claim.department} />
            <Detail label="Designation" value={claim.designation} />
            <Detail label="Cost Centre" value={claim.costCentre} />
            <Detail label="Circle" value={claim.circle} />
          </dl>
        </div>

        {/* Claim details */}
        <div className={`${CARD_SHELL} p-4`}>
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Claim Details</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            <Detail label="Purpose" value={claim.purpose} />
            <Detail
              label="Expense Period"
              value={
                claim.periodFrom || claim.periodTo
                  ? `${formatDate((claim.periodFrom || "").toString().slice(0, 10))} — ${formatDate(
                      (claim.periodTo || "").toString().slice(0, 10)
                    )}`
                  : "—"
              }
            />
            <Detail label="Remarks" value={claim.remarks} />
            <Detail label="Submitted On" value={claim.submittedAt ? formatDate(claim.submittedAt.toString().slice(0, 10)) : "—"} />
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
                <th className="px-3 py-2.5">Sub Category</th>
                <th className="px-3 py-2.5">Description</th>
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
                      {item.category}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-text-secondary">
                      {item.subCategory || "—"}
                    </td>
                    <td className="max-w-[240px] truncate px-3 py-2 text-text-secondary" title={item.description || ""}>
                      {item.description || "—"}
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
                <td className="px-3 py-2.5" colSpan={5}>
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
