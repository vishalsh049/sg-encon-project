import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, Check, FileText, Loader2, RotateCcw, X } from "lucide-react";

import { CARD_SHELL } from "../../components/billingDashboard/theme";
import { useUser } from "../../context/UserContext";
import { formatCurrency, formatDate } from "../../utils/penaltyFormat";
import { billStatusMeta } from "../../lib/expenseClaimStatus";
import { openBill } from "../../lib/expenseClaimsApi";
import {
  fetchAdvanceBill,
  advanceBillDecision,
  sendBackAdvanceBill,
  rejectAdvanceBill,
} from "../../lib/expenseAdvancesApi";

const STAGE_LABEL = { l1: "L1", l2: "L2", final: "Final" };

function Detail({ label, value, strong }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">{label}</dt>
      <dd className={`mt-0.5 ${strong ? "font-semibold text-text-primary" : "text-text-secondary"}`}>
        {value ?? "—"}
      </dd>
    </div>
  );
}

export default function VerifyAdvanceBill() {
  const { billId } = useParams();
  const navigate = useNavigate();
  const { user } = useUser();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [mode, setMode] = useState(null); // 'partial' | 'reject' | 'sendback'
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAdvanceBill(billId);
      setData(res.data);
    } catch (error) {
      toast.error(error.message || "Failed to load the bill.");
      navigate("/dashboard/expense-claims/approvals", { replace: true });
    } finally {
      setLoading(false);
    }
  }, [billId, navigate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const stage = data?.bill?.billStatus
    ? { pending_l1: "l1", pending_l2: "l2", pending_final: "final" }[data.bill.billStatus]
    : null;

  const ceiling = useMemo(() => {
    const b = data?.bill;
    if (!b) return 0;
    if (stage === "l1") return Number(b.billingAmount || 0);
    if (stage === "l2") return b.l1ApprovedAmount != null ? Number(b.l1ApprovedAmount) : Number(b.billingAmount || 0);
    if (b.l2ApprovedAmount != null) return Number(b.l2ApprovedAmount);
    if (b.l1ApprovedAmount != null) return Number(b.l1ApprovedAmount);
    return Number(b.billingAmount || 0);
  }, [data, stage]);

  const isMyTurn =
    data?.bill && stage && data.bill.currentApproverUserId === user?.id;

  const act = async (fn, successMsg) => {
    setBusy(true);
    try {
      await fn();
      toast.success(successMsg);
      setMode(null);
      setAmount("");
      setReason("");
      await load();
    } catch (error) {
      toast.error(error.message || "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-24 text-text-muted">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }

  const { bill: b, advance: a, previousApprovedBills = [] } = data;
  const prevApproved = previousApprovedBills.reduce((s, x) => s + Number(x.approvedAmount || 0), 0);
  const projApprove = mode === "partial" ? Number(amount) || 0 : ceiling;
  const projTotalBills = prevApproved + projApprove;
  const projRemaining = Number(a.totalPaid || 0) + Number(a.totalAdditionalPaid || 0) - projTotalBills - Number(a.totalRefunded || 0);

  return (
    <div className="space-y-3">
      <div>
        <button
          type="button"
          onClick={() => navigate("/dashboard/expense-claims/approvals")}
          className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft size={14} /> Approvals
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight text-text-primary sm:text-xl">
            Verify Bill {b.billNumber || ""}
          </h1>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
              billStatusMeta(b.billStatus).className
            }`}
          >
            {billStatusMeta(b.billStatus).label}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-text-secondary">
          On advance {a.advanceNumber} · {a.employeeName}
          {a.employeeCode ? ` · ${a.employeeCode}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Original advance */}
        <div className={`${CARD_SHELL} p-4`}>
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Original Advance</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            <Detail label="Advance No." value={a.advanceNumber} />
            <Detail label="Requested" value={formatCurrency(a.requestedAmount || 0)} />
            <Detail label="Approved" value={a.approvedAmount != null ? formatCurrency(a.approvedAmount) : "—"} strong />
            <Detail label="Paid" value={formatCurrency(a.totalPaid || 0)} strong />
          </dl>
        </div>

        {/* Current bill */}
        <div className={`${CARD_SHELL} p-4`}>
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Current Bill</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            <Detail label="PO No." value={b.poNumber} />
            <Detail label="JMS ID" value={b.jmsId} />
            <Detail label="SG Invoice No." value={b.sgInvoiceNo} />
            <Detail
              label="SG Invoice Date"
              value={b.sgInvoiceDate ? formatDate(String(b.sgInvoiceDate).slice(0, 10)) : "—"}
            />
            <Detail label="Service Month" value={b.serviceMonth} />
            <Detail label="Billing Amount" value={formatCurrency(b.billingAmount || 0)} strong />
            <div className="col-span-2">
              <Detail label="Description" value={b.description} />
            </div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border-color/70 pt-3">
            {(b.attachments || []).length ? (
              (b.attachments || []).map((att) => (
                <button
                  key={att.id}
                  type="button"
                  onClick={() => openBill(att.id).catch((err) => toast.error(err.message))}
                  className="inline-flex items-center gap-1 rounded-md border border-border-color bg-surface px-2 py-1 text-xs text-indigo-600 hover:bg-surface-muted dark:text-indigo-300"
                >
                  <FileText size={12} /> {att.fileName || "View bill"}
                </button>
              ))
            ) : (
              <span className="text-xs text-text-muted">No bill file attached.</span>
            )}
          </div>
        </div>
      </div>

      {/* Previous bills */}
      {previousApprovedBills.length ? (
        <div className={`${CARD_SHELL} overflow-hidden`}>
          <div className="border-b border-border-color/70 px-4 py-3">
            <h2 className="text-sm font-semibold text-text-primary">
              Previously Approved Bills ({previousApprovedBills.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[520px] w-full text-left text-sm">
              <thead>
                <tr className="bg-surface-muted text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                  <th className="px-4 py-2.5">Bill No</th>
                  <th className="px-4 py-2.5">SG Invoice</th>
                  <th className="px-4 py-2.5 text-right">Billed</th>
                  <th className="px-4 py-2.5 text-right">Approved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-color">
                {previousApprovedBills.map((x) => (
                  <tr key={x.id}>
                    <td className="px-4 py-2 font-medium text-text-primary">{x.billNumber}</td>
                    <td className="px-4 py-2 text-text-secondary">{x.sgInvoiceNo || "—"}</td>
                    <td className="px-4 py-2 text-right text-text-secondary">
                      {formatCurrency(x.billingAmount || 0)}
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(x.approvedAmount || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Reconciliation */}
      <div className={`${CARD_SHELL} p-4`}>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Reconciliation</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm sm:grid-cols-3">
          <Detail label="Advance Paid" value={formatCurrency(a.totalPaid || 0)} />
          <Detail label="Previously Approved Bills" value={formatCurrency(prevApproved)} />
          <Detail
            label={`This Bill (handed to ${STAGE_LABEL[stage] || "you"})`}
            value={formatCurrency(ceiling)}
          />
          <Detail
            label={mode === "partial" ? "If approved (entered)" : "If approved in full"}
            value={formatCurrency(projApprove)}
            strong
          />
          <Detail label="Total Approved Bills (proj.)" value={formatCurrency(projTotalBills)} strong />
          <Detail
            label={projRemaining >= 0 ? "Remaining Advance (proj.)" : "Additional Payable (proj.)"}
            value={formatCurrency(Math.abs(projRemaining))}
            strong
          />
        </dl>
      </div>

      {/* Actions */}
      {isMyTurn ? (
        <div className={`${CARD_SHELL} space-y-3 p-4`}>
          <h2 className="text-sm font-semibold text-text-primary">
            Your {STAGE_LABEL[stage]} Verification
          </h2>
          {mode === "partial" ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-text-secondary">
                  Approved amount (max {formatCurrency(ceiling)})
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-48 rounded-lg border border-border-color bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
                />
              </label>
              <input
                placeholder="Reason for reduction (required)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="min-w-[240px] flex-1 rounded-lg border border-border-color bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
              />
            </div>
          ) : null}
          {mode === "reject" || mode === "sendback" ? (
            <input
              placeholder={`Reason to ${mode === "reject" ? "reject" : "send back"} (required)`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-border-color bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
          ) : null}

          <div className="flex flex-wrap gap-2">
            {mode === null ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    act(
                      () => advanceBillDecision(b.id, { decision: "approve_full" }),
                      "Bill verified."
                    )
                  }
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <Check size={15} /> Approve Full
                </button>
                <button
                  type="button"
                  onClick={() => setMode("partial")}
                  className="inline-flex h-9 items-center rounded-full border border-border-color px-4 text-sm font-medium text-text-secondary hover:bg-surface-muted"
                >
                  Approve Partial
                </button>
                <button
                  type="button"
                  onClick={() => setMode("sendback")}
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-amber-300 px-4 text-sm font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-500/30 dark:text-amber-300 dark:hover:bg-amber-500/10"
                >
                  <RotateCcw size={14} /> Send Back
                </button>
                <button
                  type="button"
                  onClick={() => setMode("reject")}
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-rose-300 px-4 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:hover:bg-rose-500/10"
                >
                  <X size={14} /> Reject
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (mode === "partial") {
                      act(
                        () =>
                          advanceBillDecision(b.id, {
                            decision: "approve_partial",
                            approvedAmount: Number(amount),
                            reason,
                          }),
                        "Bill verified with changes."
                      );
                    } else if (mode === "reject") {
                      act(() => rejectAdvanceBill(b.id, reason), "Bill rejected.");
                    } else {
                      act(() => sendBackAdvanceBill(b.id, reason), "Bill sent back.");
                    }
                  }}
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? <Loader2 className="animate-spin" size={14} /> : null}
                  Confirm{" "}
                  {mode === "partial" ? "Partial Approval" : mode === "reject" ? "Rejection" : "Send Back"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode(null);
                    setReason("");
                    setAmount("");
                  }}
                  className="inline-flex h-9 items-center rounded-full px-3 text-sm font-medium text-text-secondary hover:bg-surface-muted"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className={`${CARD_SHELL} p-4 text-sm text-text-muted`}>
          {["approved", "rejected"].includes(b.billStatus)
            ? `This bill is ${billStatusMeta(b.billStatus).label.toLowerCase()}.`
            : "This bill is not currently assigned to you for verification."}
        </div>
      )}
    </div>
  );
}
