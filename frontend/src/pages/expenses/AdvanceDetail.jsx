import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Banknote,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Send,
  Trash2,
  Upload,
} from "lucide-react";

import { CARD_SHELL } from "../../components/billingDashboard/theme";
import ClaimApprovalTimeline from "../../components/expenses/ClaimApprovalTimeline";
import AuditTimeline from "../../components/expenses/AuditTimeline";
import { useUser } from "../../context/UserContext";
import { getPagePermission } from "../../utils/access";
import { formatCurrency, formatDate } from "../../utils/penaltyFormat";
import {
  paymentStatusMeta,
  closureStatusMeta,
  statusMeta,
  billStatusMeta,
} from "../../lib/expenseClaimStatus";
import { openBill } from "../../lib/expenseClaimsApi";
import {
  fetchAdvance,
  recordAdvancePayment,
  createAdvanceBill,
  updateAdvanceBill,
  deleteAdvanceBill,
  submitAdvanceBill,
  uploadAdvanceBillFile,
  deleteAdvanceBillFile,
  finalizeAdvanceBills,
  recordAdvanceRefund,
  recordAdditionalPayment,
} from "../../lib/expenseAdvancesApi";

const ALLOWED_EXT = ["pdf", "jpg", "jpeg", "png"];
const blankBill = () => ({
  id: null,
  poNumber: "",
  jmsId: "",
  sgInvoiceNo: "",
  sgInvoiceDate: "",
  billingAmount: "",
  serviceMonth: "",
  description: "",
  attachments: [],
});

function Badge({ meta }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

function Detail({ label, value, strong }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">
        {label}
      </dt>
      <dd
        className={`mt-0.5 ${
          strong ? "font-semibold text-text-primary" : "text-text-secondary"
        }`}
      >
        {value ?? "—"}
      </dd>
    </div>
  );
}

const emptyPayment = {
  paymentDate: new Date().toISOString().slice(0, 10),
  paidAmount: "",
  paymentReference: "",
  utrReference: "",
  remarks: "",
};

export default function AdvanceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useUser();
  const canRecordPayment = getPagePermission(user, "expense-finance").edit;

  const [loading, setLoading] = useState(true);
  const [bundle, setBundle] = useState(null);
  const [showPay, setShowPay] = useState(false);
  const [payForm, setPayForm] = useState(emptyPayment);
  const [saving, setSaving] = useState(false);
  const [billForm, setBillForm] = useState(null); // null | blankBill()/loaded bill
  const [billSaving, setBillSaving] = useState(false);
  const [billFileBusy, setBillFileBusy] = useState(false);
  const [closeout, setCloseout] = useState(null); // null | 'refund' | 'additional'
  const [closeoutForm, setCloseoutForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    amount: "",
    reference: "",
    remarks: "",
  });
  const [closeoutSaving, setCloseoutSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAdvance(id);
      setBundle(res.data);
    } catch (error) {
      toast.error(error.message || "Failed to load the advance.");
      navigate("/dashboard/expense-claims/advances", { replace: true });
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const submitPayment = async () => {
    if (!(Number(payForm.paidAmount) > 0)) {
      toast.error("Enter a paid amount greater than zero.");
      return;
    }
    setSaving(true);
    try {
      await recordAdvancePayment(bundle.advance.id, {
        paymentDate: payForm.paymentDate,
        paidAmount: Number(payForm.paidAmount),
        paymentReference: payForm.paymentReference.trim() || undefined,
        utrReference: payForm.utrReference.trim() || undefined,
        remarks: payForm.remarks.trim() || undefined,
      });
      toast.success("Payment recorded.");
      setShowPay(false);
      setPayForm(emptyPayment);
      await load();
    } catch (error) {
      toast.error(error.message || "Failed to record the payment.");
    } finally {
      setSaving(false);
    }
  };

  const saveBill = async () => {
    if (!(Number(billForm.billingAmount) > 0)) {
      toast.error("Enter a billing amount greater than zero.");
      return;
    }
    setBillSaving(true);
    try {
      const payload = {
        poNumber: billForm.poNumber.trim() || undefined,
        jmsId: billForm.jmsId.trim() || undefined,
        sgInvoiceNo: billForm.sgInvoiceNo.trim() || undefined,
        sgInvoiceDate: billForm.sgInvoiceDate || undefined,
        billingAmount: Number(billForm.billingAmount),
        serviceMonth: billForm.serviceMonth || undefined,
        description: billForm.description.trim() || undefined,
      };
      const res = billForm.id
        ? await updateAdvanceBill(billForm.id, payload)
        : await createAdvanceBill(bundle.advance.id, payload);
      toast.success("Bill saved.");
      setBillForm({ ...blankBill(), ...res.data });
      await load();
    } catch (error) {
      toast.error(error.message || "Failed to save the bill.");
    } finally {
      setBillSaving(false);
    }
  };

  const attachBillFile = async (file) => {
    if (!file || !billForm?.id) {
      toast.error("Save the bill before attaching a file.");
      return;
    }
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) return toast.error("Only PDF, JPG, JPEG or PNG allowed.");
    if (file.size > 10 * 1024 * 1024) return toast.error("File exceeds the 10 MB limit.");
    setBillFileBusy(true);
    try {
      const res = await uploadAdvanceBillFile(billForm.id, file);
      setBillForm((b) => ({ ...b, attachments: [...(b.attachments || []), res.data] }));
      toast.success("File attached.");
      await load();
    } catch (error) {
      toast.error(error.message || "Failed to attach the file.");
    } finally {
      setBillFileBusy(false);
    }
  };

  const removeBillFile = async (attId) => {
    try {
      await deleteAdvanceBillFile(billForm.id, attId);
      setBillForm((b) => ({ ...b, attachments: (b.attachments || []).filter((x) => x.id !== attId) }));
      await load();
    } catch (error) {
      toast.error(error.message || "Failed to remove the file.");
    }
  };

  const submitBill = async (billId) => {
    try {
      await submitAdvanceBill(billId);
      toast.success("Bill submitted for verification.");
      setBillForm(null);
      await load();
    } catch (error) {
      const rows = error.details?.rowErrors;
      toast.error(rows?.length ? rows.join(" ") : error.message || "Failed to submit the bill.");
    }
  };

  const removeBill = async (billId) => {
    try {
      await deleteAdvanceBill(billId);
      toast.success("Bill deleted.");
      if (billForm?.id === billId) setBillForm(null);
      await load();
    } catch (error) {
      toast.error(error.message || "Failed to delete the bill.");
    }
  };

  const doFinalize = async () => {
    try {
      await finalizeAdvanceBills(bundle.advance.id);
      toast.success("Bills finalised.");
      await load();
    } catch (error) {
      toast.error(error.message || "Failed to finalise bills.");
    }
  };

  const submitCloseout = async () => {
    if (!(Number(closeoutForm.amount) > 0)) {
      toast.error("Enter an amount greater than zero.");
      return;
    }
    setCloseoutSaving(true);
    try {
      if (closeout === "refund") {
        await recordAdvanceRefund(bundle.advance.id, {
          refundDate: closeoutForm.date,
          refundAmount: Number(closeoutForm.amount),
          refundReference: closeoutForm.reference.trim() || undefined,
          remarks: closeoutForm.remarks.trim() || undefined,
        });
      } else {
        await recordAdditionalPayment(bundle.advance.id, {
          paymentDate: closeoutForm.date,
          amount: Number(closeoutForm.amount),
          paymentReference: closeoutForm.reference.trim() || undefined,
          remarks: closeoutForm.remarks.trim() || undefined,
        });
      }
      toast.success(closeout === "refund" ? "Refund recorded." : "Additional payment recorded.");
      setCloseout(null);
      setCloseoutForm({ date: new Date().toISOString().slice(0, 10), amount: "", reference: "", remarks: "" });
      await load();
    } catch (error) {
      toast.error(error.message || "Failed to record.");
    } finally {
      setCloseoutSaving(false);
    }
  };

  if (loading || !bundle) {
    return (
      <div className="flex items-center justify-center py-24 text-text-muted">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }

  const { advance: a, payments, bills = [], refunds = [], additionalPayments = [], audit, timeline } = bundle;
  const canAddBill =
    a.billClosureStatus && a.billClosureStatus !== "na" && a.billClosureStatus !== "closed";
  const noPendingBills = !bills.some((b) =>
    ["draft", "pending_l1", "pending_l2", "pending_final", "returned"].includes(b.billStatus)
  );
  const canFinalize =
    (a.employeeUserId === user?.id || a.submittedByUserId === user?.id || canRecordPayment) &&
    a.billClosureStatus === "open" &&
    noPendingBills &&
    ((a.totalPaid || 0) > 0 || bills.length > 0);
  const INPUT =
    "w-full rounded-lg border border-border-color bg-surface px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-indigo-400";

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => navigate("/dashboard/expense-claims/advances")}
            className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft size={14} /> Advance Payments
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-text-primary sm:text-xl">
              {a.advanceNumber || "Advance"}
            </h1>
            <Badge meta={statusMeta(a.approvalStatus)} />
            <Badge meta={paymentStatusMeta(a.paymentStatus)} />
            <Badge meta={closureStatusMeta(a.billClosureStatus)} />
          </div>
          <p className="mt-0.5 text-sm text-text-secondary">
            {a.partyKind === "vendor"
              ? `Vendor: ${a.vendorName || "—"}${a.vendorType ? ` · ${a.vendorType}` : ""}`
              : a.employeeName
              ? `${a.employeeName}${a.employeeCode ? ` · ${a.employeeCode}` : ""}`
              : "Advance request"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canRecordPayment && a.approvedAmount != null && a.paymentStatus !== "fully_paid" ? (
            <button
              type="button"
              onClick={() => setShowPay((v) => !v)}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
            >
              <Banknote size={15} /> Record Payment
            </button>
          ) : null}
          {canFinalize ? (
            <button
              type="button"
              onClick={doFinalize}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border-color bg-surface px-4 text-sm font-medium text-text-secondary transition hover:bg-surface-muted"
            >
              Finalise Bills
            </button>
          ) : null}
          {canRecordPayment && a.billClosureStatus === "refund_pending" ? (
            <button
              type="button"
              onClick={() => {
                setCloseout("refund");
                setCloseoutForm((f) => ({ ...f, amount: String(a.remainingAdvance || "") }));
              }}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-4 text-sm font-semibold text-white"
            >
              Record Refund
            </button>
          ) : null}
          {canRecordPayment && a.billClosureStatus === "additional_payment_pending" ? (
            <button
              type="button"
              onClick={() => {
                setCloseout("additional");
                setCloseoutForm((f) => ({ ...f, amount: String(a.additionalPayable || "") }));
              }}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-4 text-sm font-semibold text-white"
            >
              Record Additional Payment
            </button>
          ) : null}
        </div>
      </div>

      {a.billClosureStatus === "closed" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          <span className="font-semibold">This advance is closed.</span> All bills verified and the
          balance is settled{a.closedAt ? ` on ${formatDate(String(a.closedAt).slice(0, 10))}` : ""}.
        </div>
      ) : null}

      {closeout ? (
        <div className={`${CARD_SHELL} space-y-3 p-4`}>
          <h2 className="text-sm font-semibold text-text-primary">
            {closeout === "refund" ? "Record a Refund Received" : "Record an Additional Payment"}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-text-secondary">Date</span>
              <input
                type="date"
                className="w-full rounded-lg border border-border-color bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
                value={closeoutForm.date}
                onChange={(e) => setCloseoutForm({ ...closeoutForm, date: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-text-secondary">Amount (₹)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full rounded-lg border border-border-color bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
                value={closeoutForm.amount}
                onChange={(e) => setCloseoutForm({ ...closeoutForm, amount: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-text-secondary">Reference</span>
              <input
                className="w-full rounded-lg border border-border-color bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
                value={closeoutForm.reference}
                onChange={(e) => setCloseoutForm({ ...closeoutForm, reference: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-text-secondary">Remarks</span>
              <input
                className="w-full rounded-lg border border-border-color bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
                value={closeoutForm.remarks}
                onChange={(e) => setCloseoutForm({ ...closeoutForm, remarks: e.target.value })}
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={closeoutSaving}
              onClick={submitCloseout}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {closeoutSaving ? <Loader2 className="animate-spin" size={14} /> : null} Save
            </button>
            <button
              type="button"
              onClick={() => setCloseout(null)}
              className="inline-flex h-9 items-center rounded-full px-3 text-sm font-medium text-text-secondary hover:bg-surface-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {/* Record payment form */}
      {showPay ? (
        <div className={`${CARD_SHELL} space-y-3 p-4`}>
          <h2 className="text-sm font-semibold text-text-primary">Record an Advance Payment</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-text-secondary">Payment Date</span>
              <input
                type="date"
                className={INPUT}
                value={payForm.paymentDate}
                onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-text-secondary">Paid Amount (₹)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className={INPUT}
                value={payForm.paidAmount}
                onChange={(e) => setPayForm({ ...payForm, paidAmount: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-text-secondary">Payment Reference</span>
              <input
                className={INPUT}
                value={payForm.paymentReference}
                onChange={(e) => setPayForm({ ...payForm, paymentReference: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-text-secondary">UTR / Txn Reference</span>
              <input
                className={INPUT}
                value={payForm.utrReference}
                onChange={(e) => setPayForm({ ...payForm, utrReference: e.target.value })}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-text-secondary">Remarks</span>
              <input
                className={INPUT}
                value={payForm.remarks}
                onChange={(e) => setPayForm({ ...payForm, remarks: e.target.value })}
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={submitPayment}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
              Save Payment
            </button>
            <button
              type="button"
              onClick={() => setShowPay(false)}
              className="inline-flex h-9 items-center rounded-full border border-border-color px-4 text-sm font-medium text-text-secondary hover:bg-surface-muted"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-text-muted">
            Approved advance {formatCurrency(a.approvedAmount || 0)} · already paid{" "}
            {formatCurrency(a.totalPaid || 0)} · unpaid {formatCurrency(a.unpaidApproved || 0)}.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Advance information */}
        <div className={`${CARD_SHELL} p-4`}>
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Advance Information</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            <Detail label="Advance No." value={a.advanceNumber} />
            {a.partyKind === "vendor" ? (
              <>
                <Detail label="Vendor" value={a.vendorName} />
                <Detail label="Vendor Type" value={a.vendorType} />
              </>
            ) : (
              <>
                <Detail label="Employee" value={a.employeeName} />
                <Detail label="Employee ID" value={a.employeeCode} />
              </>
            )}
            <Detail label="Department" value={a.department} />
            <Detail label="CMP" value={a.cmp} />
            <Detail label="Circle" value={a.circle} />
            <Detail
              label="Raised By"
              value={a.submittedByName || "Self"}
            />
            <Detail
              label="Submitted On"
              value={a.submittedAt ? formatDate(String(a.submittedAt).slice(0, 10)) : "—"}
            />
            <div className="col-span-2">
              <Detail label="Purpose" value={a.purpose} />
            </div>
          </dl>
        </div>

        {/* Financial summary */}
        <div className={`${CARD_SHELL} p-4`}>
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Financial Summary</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            <Detail label="Requested Amount" value={formatCurrency(a.requestedAmount || 0)} />
            <Detail
              label="Approved Amount"
              value={a.approvedAmount != null ? formatCurrency(a.approvedAmount) : "Pending approval"}
              strong
            />
            <Detail label="Paid Amount" value={formatCurrency(a.totalPaid || 0)} strong />
            <Detail label="Unpaid Approved" value={formatCurrency(a.unpaidApproved || 0)} />
            <Detail label="Approved Bills" value={formatCurrency(a.totalApprovedBills || 0)} />
            <Detail label="Refunded" value={formatCurrency(a.totalRefunded || 0)} />
            <Detail label="Additional Paid" value={formatCurrency(a.totalAdditionalPaid || 0)} />
            <Detail label="Remaining Advance" value={formatCurrency(a.remainingAdvance || 0)} strong />
            {a.additionalPayable > 0 ? (
              <Detail label="Additional Payable" value={formatCurrency(a.additionalPayable)} strong />
            ) : null}
          </dl>
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border-color/70 pt-3">
            <Badge meta={paymentStatusMeta(a.paymentStatus)} />
            <Badge meta={closureStatusMeta(a.billClosureStatus)} />
          </div>
        </div>
      </div>

      {/* Payment history */}
      <div className={`${CARD_SHELL} overflow-hidden`}>
        <div className="border-b border-border-color/70 px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">
            Payment History ({payments.length})
          </h2>
        </div>
        {payments.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-text-muted">
            No payments recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[640px] w-full text-left text-sm">
              <thead>
                <tr className="bg-surface-muted text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5">Reference</th>
                  <th className="px-4 py-2.5">UTR / Txn</th>
                  <th className="px-4 py-2.5">Recorded By</th>
                  <th className="px-4 py-2.5">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-color">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">
                      {formatDate(String(p.paymentDate).slice(0, 10))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-text-primary">
                      {formatCurrency(p.paidAmount)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">
                      {p.paymentReference || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">
                      {p.utrReference || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">
                      {p.createdByName || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary">{p.remarks || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Refunds + additional payments */}
      {refunds.length || additionalPayments.length ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {refunds.length ? (
            <div className={`${CARD_SHELL} overflow-hidden`}>
              <div className="border-b border-border-color/70 px-4 py-3">
                <h2 className="text-sm font-semibold text-text-primary">
                  Refunds Received ({refunds.length})
                </h2>
              </div>
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-border-color">
                  {refunds.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2 text-text-secondary">
                        {formatDate(String(r.refundDate).slice(0, 10))}
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-text-primary">
                        {formatCurrency(r.refundAmount)}
                      </td>
                      <td className="px-4 py-2 text-text-secondary">{r.refundReference || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {additionalPayments.length ? (
            <div className={`${CARD_SHELL} overflow-hidden`}>
              <div className="border-b border-border-color/70 px-4 py-3">
                <h2 className="text-sm font-semibold text-text-primary">
                  Additional Payments ({additionalPayments.length})
                </h2>
              </div>
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-border-color">
                  {additionalPayments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-2 text-text-secondary">
                        {formatDate(String(p.paymentDate).slice(0, 10))}
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-text-primary">
                        {formatCurrency(p.amount)}
                      </td>
                      <td className="px-4 py-2 text-text-secondary">{p.paymentReference || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Bills against this advance */}
      <div className={`${CARD_SHELL} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-color/70 px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Bills ({bills.length})</h2>
          {canAddBill ? (
            <button
              type="button"
              onClick={() => setBillForm((f) => (f ? null : blankBill()))}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300"
            >
              <Plus size={15} /> Add Bill
            </button>
          ) : null}
        </div>

        {/* Add / edit bill form */}
        {billForm ? (
          <div className="space-y-3 border-b border-border-color/70 bg-surface-muted/30 p-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-text-secondary">PO No.</span>
                <input
                  className={INPUT}
                  value={billForm.poNumber}
                  onChange={(e) => setBillForm({ ...billForm, poNumber: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-text-secondary">JMS ID</span>
                <input
                  className={INPUT}
                  value={billForm.jmsId}
                  onChange={(e) => setBillForm({ ...billForm, jmsId: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-text-secondary">SG Invoice No. *</span>
                <input
                  className={INPUT}
                  value={billForm.sgInvoiceNo}
                  onChange={(e) => setBillForm({ ...billForm, sgInvoiceNo: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-text-secondary">SG Invoice Date *</span>
                <input
                  type="date"
                  className={INPUT}
                  value={billForm.sgInvoiceDate}
                  onChange={(e) => setBillForm({ ...billForm, sgInvoiceDate: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-text-secondary">Billing Amount (₹) *</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={INPUT}
                  value={billForm.billingAmount}
                  onChange={(e) => setBillForm({ ...billForm, billingAmount: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-text-secondary">Service Month * (YYYY-MM)</span>
                <input
                  type="month"
                  className={INPUT}
                  value={billForm.serviceMonth}
                  onChange={(e) => setBillForm({ ...billForm, serviceMonth: e.target.value })}
                />
              </label>
              <label className="block sm:col-span-2 lg:col-span-3">
                <span className="mb-1 block text-xs font-semibold text-text-secondary">Description</span>
                <input
                  className={INPUT}
                  value={billForm.description}
                  onChange={(e) => setBillForm({ ...billForm, description: e.target.value })}
                />
              </label>
            </div>

            {/* attachments */}
            <div className="flex flex-wrap items-center gap-2">
              {(billForm.attachments || []).map((att) => (
                <span
                  key={att.id}
                  className="inline-flex items-center gap-1 rounded-md border border-border-color bg-surface px-2 py-1 text-xs"
                >
                  <FileText size={12} /> {att.fileName || "file"}
                  <button
                    type="button"
                    onClick={() => removeBillFile(att.id)}
                    className="text-rose-500 hover:text-rose-600"
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              ))}
              <label
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border-color px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-surface-muted ${
                  billForm.id ? "" : "pointer-events-none opacity-50"
                }`}
              >
                {billFileBusy ? <Loader2 className="animate-spin" size={12} /> : <Upload size={12} />}
                Attach bill
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={(e) => {
                    attachBillFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              {!billForm.id ? (
                <span className="text-xs text-text-muted">Save the bill first to attach a file.</span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={billSaving}
                onClick={saveBill}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-border-color bg-surface px-4 text-sm font-medium text-text-secondary hover:bg-surface-muted disabled:opacity-50"
              >
                {billSaving ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
                {billForm.id ? "Save Bill" : "Create Bill"}
              </button>
              {billForm.id ? (
                <button
                  type="button"
                  onClick={() => submitBill(billForm.id)}
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-4 text-sm font-semibold text-white"
                >
                  <Send size={14} /> Submit for Verification
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setBillForm(null)}
                className="inline-flex h-9 items-center rounded-full px-3 text-sm font-medium text-text-secondary hover:bg-surface-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {bills.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-text-muted">
            No bills submitted against this advance yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[820px] w-full text-left text-sm">
              <thead>
                <tr className="bg-surface-muted text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                  <th className="px-4 py-2.5">Bill No</th>
                  <th className="px-4 py-2.5">SG Invoice</th>
                  <th className="px-4 py-2.5">Service Month</th>
                  <th className="px-4 py-2.5 text-right">Billed</th>
                  <th className="px-4 py-2.5 text-right">Approved</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Bill File</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-color">
                {bills.map((b) => (
                  <tr key={b.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 font-semibold text-text-primary">
                      {b.billNumber || "Draft"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">
                      {b.sgInvoiceNo || "—"}
                      {b.sgInvoiceDate ? (
                        <span className="mt-0.5 block text-[11px] text-text-muted">
                          {formatDate(String(b.sgInvoiceDate).slice(0, 10))}
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">
                      {b.serviceMonth || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-text-primary">
                      {formatCurrency(b.billingAmount || 0)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-text-secondary">
                      {b.approvedAmount != null ? formatCurrency(b.approvedAmount) : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          billStatusMeta(b.billStatus).className
                        }`}
                      >
                        {billStatusMeta(b.billStatus).label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {(b.attachments || []).length ? (
                        (b.attachments || []).map((att) => (
                          <button
                            key={att.id}
                            type="button"
                            onClick={() =>
                              openBill(att.id).catch((err) => toast.error(err.message))
                            }
                            className="mr-1 inline-flex items-center gap-1 rounded-md border border-border-color bg-surface px-1.5 py-1 text-xs text-indigo-600 hover:bg-surface-muted dark:text-indigo-300"
                          >
                            <FileText size={12} /> View
                          </button>
                        ))
                      ) : (
                        <span className="text-xs text-text-muted">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      {["draft", "returned"].includes(b.billStatus) ? (
                        <span className="inline-flex gap-1">
                          <button
                            type="button"
                            title="Edit"
                            onClick={() => setBillForm({ ...blankBill(), ...b })}
                            className="rounded-md border border-border-color p-1 text-text-secondary hover:bg-surface-muted"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            title="Submit"
                            onClick={() => submitBill(b.id)}
                            className="rounded-md border border-border-color p-1 text-indigo-600 hover:bg-surface-muted dark:text-indigo-300"
                          >
                            <Send size={13} />
                          </button>
                          <button
                            type="button"
                            title="Delete"
                            onClick={() => removeBill(b.id)}
                            className="rounded-md border border-border-color p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                          >
                            <Trash2 size={13} />
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/dashboard/expense-claims/advances/bills/${b.id}`)
                          }
                          className="rounded-md border border-border-color px-2 py-1 text-xs font-medium text-text-secondary hover:bg-surface-muted"
                        >
                          Open
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Approval trail */}
      <div className={`${CARD_SHELL} p-4`}>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Approval Status</h2>
        <ClaimApprovalTimeline timeline={timeline} claim={a} />
      </div>

      {/* Full history */}
      <div className={`${CARD_SHELL} p-4`}>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Advance History</h2>
        <AuditTimeline entries={audit} />
      </div>
    </div>
  );
}
