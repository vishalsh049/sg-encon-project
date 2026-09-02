import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, CornerUpLeft, FileText, Loader2, Save } from "lucide-react";

import { CARD_SHELL } from "../../components/billingDashboard/theme";
import ClaimStatusBadge from "../../components/expenses/ClaimStatusBadge";
import ClaimProgressTracker from "../../components/expenses/ClaimProgressTracker";
import AuditTimeline from "../../components/expenses/AuditTimeline";
import ItemClassification from "../../components/expenses/ItemClassification";
import { financeStatusMeta } from "../../lib/expenseClaimStatus";
import { getPagePermission } from "../../utils/access";
import { useUser } from "../../context/UserContext";
import { formatCurrency, formatDate } from "../../utils/penaltyFormat";
import { fetchFinanceClaim, financeSendBack, openBill, saveFinance } from "../../lib/expenseClaimsApi";

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
    paymentAmount: "",
    paymentDate: "",
    financeRemarks: "",
  });
  const [saving, setSaving] = useState(false);
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [sendBackReason, setSendBackReason] = useState("");
  const [sendingBack, setSendingBack] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchFinanceClaim(id);
      setBundle(res.data);
      const fin = res.data.finance;
      setForm({
        financeStatus: fin?.financeStatus && fin.financeStatus !== "pending" ? fin.financeStatus : "processing",
        paymentReference: fin?.paymentReference || "",
        paymentAmount: fin?.paymentAmount != null ? String(fin.paymentAmount) : "",
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

  const finPerm = getPagePermission(user, "expense-finance");
  const canProcess = ["pending_finance", "completed"].includes(claim.status) && finPerm.edit;
  const canSendBack = claim.status === "pending_finance" && finPerm.edit;
  const needsPayment = form.financeStatus === "processed";
  const finalApproved = claim.finalApprovedTotal != null ? Number(claim.finalApprovedTotal) : null;

  // Approval timestamps come from the audit trail (no dedicated columns).
  const apprDate = { l1: null, l2: null, final: null };
  (audit || []).forEach((e) => {
    if (["l1", "l2", "final"].includes(e.stage) && /_APPROVED/.test(e.action || "")) {
      apprDate[e.stage] = e.createdAt;
    }
  });
  const withDate = (name, at) =>
    name ? `${name}${at ? ` · ${formatDate(String(at).slice(0, 10))}` : ""}` : null;

  const save = async () => {
    if (needsPayment && !form.paymentReference.trim()) {
      toast.error("Enter a Payment Reference Number to mark the claim Processed.");
      return;
    }
    if (needsPayment && !form.paymentDate) {
      toast.error("Enter a Payment Date to mark the claim Processed.");
      return;
    }
    if (needsPayment && !String(form.paymentAmount).trim()) {
      toast.error("Enter the Payment Amount to mark the claim Processed.");
      return;
    }
    const amt = String(form.paymentAmount).trim() === "" ? null : Number(form.paymentAmount);
    if (amt != null && Number.isNaN(amt)) {
      toast.error("Payment Amount must be a valid number.");
      return;
    }
    if (amt != null && amt < 0) {
      toast.error("Payment Amount cannot be negative.");
      return;
    }
    if (amt != null && finalApproved != null && amt > finalApproved + 0.001) {
      toast.error(`Payment Amount cannot exceed the Final Approved amount (${formatCurrency(finalApproved)}).`);
      return;
    }
    setSaving(true);
    try {
      const res = await saveFinance(claim.id, {
        financeStatus: form.financeStatus,
        paymentReference: form.paymentReference.trim() || null,
        paymentAmount: amt,
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

  const doSendBack = async () => {
    if (!sendBackReason.trim()) {
      toast.error("A reason is required to send the claim back.");
      return;
    }
    setSendingBack(true);
    try {
      await financeSendBack(claim.id, sendBackReason.trim());
      toast.success("Claim sent back to the employee for correction.");
      navigate("/dashboard/expense-claims/finance", { replace: true });
    } catch (error) {
      toast.error(error.message || "Failed to send the claim back.");
    } finally {
      setSendingBack(false);
      setSendBackOpen(false);
      setSendBackReason("");
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
        <p className="mt-0.5 text-sm text-text-secondary">
          {claim.employeeName}
          {claim.employeeCode ? ` · ${claim.employeeCode}` : ""}
          {claim.department ? ` · ${claim.department}` : ""}
        </p>
      </div>

      <div className={`${CARD_SHELL} p-4`}>
        <ClaimProgressTracker status={claim.status} />
      </div>

      {/* Stage banner */}
      <div className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sky-800 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300">
        <span className="text-sm font-bold uppercase tracking-[0.14em]">Finance Verification</span>
        <span className="text-xs text-sky-700/80 dark:text-sky-300/80">
          {canProcess
            ? "Review the full claim and every bill, then record payment or send it back."
            : "This claim is not in the finance queue — read-only."}
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

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Employee + approvers */}
        <div className={`${CARD_SHELL} p-4`}>
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Employee & Approval Chain</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            <Detail label="Employee" value={claim.employeeName} />
            <Detail label="Employee ID" value={claim.employeeCode} />
            <Detail label="Department" value={claim.department} />
            <Detail label="CMP" value={claim.cmp} />
            <Detail label="Circle" value={claim.circle} />
            <Detail label="Bank Account" value={claim.bankAccount} />
            <Detail label="IFSC" value={claim.ifsc} />
            <Detail label="L1 Approver" value={withDate(approvers?.l1, apprDate.l1)} />
            <Detail label="L2 Approver" value={withDate(approvers?.l2, apprDate.l2)} />
            <Detail label="Final Approver" value={withDate(approvers?.final, apprDate.final)} />
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
              {!finPerm.edit
                ? "You have view-only access to Expense Finance. Recording payment, sending back and changing finance status require Edit permission."
                : `This claim is not in the finance queue (status: ${claim.status}). Processing is disabled.`}
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
                    Payment Amount {needsPayment ? <span className="text-rose-500">*</span> : null}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={INPUT}
                    placeholder={finalApproved != null ? `Max ${formatCurrency(finalApproved)}` : "0.00"}
                    value={form.paymentAmount}
                    onChange={(e) => setForm((f) => ({ ...f, paymentAmount: e.target.value }))}
                  />
                  <span className="mt-0.5 block text-[11px] text-text-muted">
                    Cannot exceed Final Approved{finalApproved != null ? ` (${formatCurrency(finalApproved)})` : ""}
                  </span>
                </label>
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-text-muted">
                  Processed by: {finance?.processedBy || user?.name || "—"}
                  {finance?.processedAt ? ` · ${formatDate(finance.processedAt.toString().slice(0, 10))}` : ""}
                </span>
                <div className="flex flex-wrap gap-2">
                  {canSendBack ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSendBackReason("");
                        setSendBackOpen(true);
                      }}
                      disabled={saving || sendingBack}
                      className="inline-flex h-10 items-center gap-2 rounded-full border border-amber-300 bg-surface px-4 text-sm font-medium text-amber-700 transition hover:bg-amber-50 disabled:opacity-50 dark:border-amber-500/20 dark:text-amber-300 dark:hover:bg-amber-500/10"
                    >
                      <CornerUpLeft size={15} /> Send Back
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving || sendingBack}
                    className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
                    Save
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-text-muted">
                Approval amounts are locked to Finance — changes must go back through the approval chain.
                Send Back returns the claim to the employee; on resubmission it restarts at L1.
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
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-text-primary">{it.workCategory || it.category}</td>
                    <td className="px-3 py-2 text-text-secondary">
                      <div className="max-w-[300px] truncate" title={it.description || ""}>
                        {it.description || "—"}
                      </div>
                      <ItemClassification item={it} className="mt-1" />
                      {(it.l1Reason || it.l2Reason || it.finalReason) ? (
                        <div className="mt-1 space-y-0.5 text-[11px] text-text-muted">
                          {it.l1Reason ? <div><span className="font-semibold">L1:</span> {it.l1Reason}</div> : null}
                          {it.l2Reason ? <div><span className="font-semibold">L2:</span> {it.l2Reason}</div> : null}
                          {it.finalReason ? <div><span className="font-semibold">Final:</span> {it.finalReason}</div> : null}
                        </div>
                      ) : null}
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

      {sendBackOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
          <button
            type="button"
            aria-label="Cancel"
            disabled={sendingBack}
            onClick={() => setSendBackOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-overlay/45 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full max-w-[460px] overflow-hidden rounded-[20px] border border-border-color/80 bg-surface shadow-[0_30px_90px_rgba(15,23,42,0.2)]">
            <div className="px-6 pt-6">
              <h2 className="text-lg font-semibold text-text-primary">Send this claim back</h2>
              <p className="mt-1 text-sm text-text-secondary">
                The claim returns to the employee for correction. When they resubmit it, it
                restarts at L1 and all previous approvals are cleared. A reason is mandatory.
              </p>
              <textarea
                rows={4}
                autoFocus
                value={sendBackReason}
                onChange={(e) => setSendBackReason(e.target.value)}
                placeholder="e.g. missing bill, wrong bank details, amount mismatch, PO issue…"
                className="mt-3 w-full rounded-xl border border-border-color bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-indigo-400"
              />
            </div>
            <div className="mt-4 flex flex-col-reverse gap-2 border-t border-border-color/70 bg-surface-muted/40 px-6 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setSendBackOpen(false)}
                disabled={sendingBack}
                className="inline-flex h-10 items-center justify-center rounded-full border border-border-color bg-surface px-5 text-sm font-medium text-text-secondary transition hover:bg-surface-muted disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={doSendBack}
                disabled={sendingBack || !sendBackReason.trim()}
                className="inline-flex h-10 min-w-[140px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
              >
                {sendingBack ? <Loader2 className="animate-spin" size={15} /> : null}
                Send Back
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
