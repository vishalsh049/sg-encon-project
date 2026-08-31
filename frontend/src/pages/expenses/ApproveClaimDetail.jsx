import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Check,
  CornerUpLeft,
  FileText,
  Loader2,
  X,
} from "lucide-react";

import { CARD_SHELL } from "../../components/billingDashboard/theme";
import ConfirmDialog from "../../components/ConfirmDialog";
import ClaimStatusBadge from "../../components/expenses/ClaimStatusBadge";
import ClaimProgressTracker from "../../components/expenses/ClaimProgressTracker";
import AuditTimeline from "../../components/expenses/AuditTimeline";
import ItemClassification from "../../components/expenses/ItemClassification";
import { useUser } from "../../context/UserContext";
import { formatCurrency, formatDate } from "../../utils/penaltyFormat";
import {
  fetchClaim,
  openBill,
  rejectClaim,
  sendBackClaim,
  submitDecision,
} from "../../lib/expenseClaimsApi";

const STAGE_LABEL = { l1: "L1", l2: "L2", final: "Final" };
const PREV_LABEL = { l2: "L1", final: "L2" };
const CELL =
  "w-full rounded-lg border border-border-color bg-surface px-2 py-1.5 text-sm text-text-primary outline-none focus:border-indigo-400";

function ceilingFor(stage, item) {
  const claimed = Number(item.claimedAmount || 0);
  if (stage === "l1") return claimed;
  if (stage === "l2") return item.l1ApprovedAmount != null ? Number(item.l1ApprovedAmount) : claimed;
  if (item.l2ApprovedAmount != null) return Number(item.l2ApprovedAmount);
  if (item.l1ApprovedAmount != null) return Number(item.l1ApprovedAmount);
  return claimed;
}

export default function ApproveClaimDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useUser();

  const [loading, setLoading] = useState(true);
  const [bundle, setBundle] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [errors, setErrors] = useState([]);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [reasonModal, setReasonModal] = useState(null); // "send_back" | "reject"
  const [reasonText, setReasonText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchClaim(id);
      setBundle(res.data);
      const seed = {};
      (res.data.items || []).forEach((it) => {
        seed[it.id] = { kind: "approve_full", approvedAmount: "", reason: "" };
      });
      setDecisions(seed);
    } catch (error) {
      toast.error(error.message || "Failed to load the claim.");
      navigate("/dashboard/expense-claims/approvals", { replace: true });
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const claim = bundle?.claim || null;
  const items = useMemo(() => bundle?.items || [], [bundle]);
  const stage = claim?.stage;
  const isMyPending =
    claim &&
    ["pending_l1", "pending_l2", "pending_final"].includes(claim.status) &&
    (claim.currentApproverUserId === user?.id ||
      String(user?.roleName || "").toLowerCase() === "admin");

  const attByItem = useMemo(() => {
    const map = new Map();
    (bundle?.attachments || []).forEach((a) => {
      if (!map.has(a.itemId)) map.set(a.itemId, []);
      map.get(a.itemId).push(a);
    });
    return map;
  }, [bundle]);

  const computed = useMemo(() => {
    if (!claim) return { rows: [], claimed: 0, approved: 0, reduced: 0 };
    const rows = items.map((it) => {
      const d = decisions[it.id] || { kind: "approve_full", approvedAmount: "", reason: "" };
      const ceiling = ceilingFor(stage, it);
      let approved;
      if (d.kind === "reject") approved = 0;
      else if (d.kind === "approve_partial") approved = Number(d.approvedAmount) || 0;
      else approved = ceiling;
      approved = Math.max(0, Math.min(approved, ceiling));
      const reduced = Number(it.claimedAmount || 0) - approved;
      const needsReason = d.kind === "reject" || approved < ceiling - 0.001;
      return { item: it, decision: d, ceiling, approved, reduced, needsReason };
    });
    const claimed = rows.reduce((s, r) => s + Number(r.item.claimedAmount || 0), 0);
    const approved = rows.reduce((s, r) => s + r.approved, 0);
    return { rows, claimed, approved, reduced: claimed - approved };
  }, [claim, items, decisions, stage]);

  const setDecision = (itemId, patch) =>
    setDecisions((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));

  const validate = () => {
    const errs = [];
    computed.rows.forEach((r, i) => {
      const n = i + 1;
      if (r.decision.kind === "approve_partial") {
        const v = Number(r.decision.approvedAmount);
        if (!(v >= 0)) errs.push(`Row ${n}: enter a valid approved amount.`);
        else if (v > r.ceiling + 0.001)
          errs.push(`Row ${n}: approved amount cannot exceed ${formatCurrency(r.ceiling)}.`);
      }
      if (r.needsReason && !r.decision.reason.trim()) {
        errs.push(
          `Row ${n}: a reason is required for a ${
            r.approved <= 0 ? "rejection" : "partial approval"
          }.`
        );
      }
    });
    return errs;
  };

  const doApprove = async () => {
    setBusy(true);
    setErrors([]);
    try {
      const payload = {
        stage,
        remarks: "",
        items: computed.rows.map((r) => ({
          itemId: r.item.id,
          decision: r.decision.kind,
          approvedAmount: r.decision.kind === "approve_partial" ? Number(r.decision.approvedAmount) || 0 : undefined,
          reason: r.decision.reason.trim() || undefined,
        })),
      };
      const res = await submitDecision(claim.id, payload);
      toast.success(
        `${STAGE_LABEL[stage]} approval recorded — ${formatCurrency(res.data.claim[`${stage}ApprovedTotal`] ?? computed.approved)} forwarded.`
      );
      navigate("/dashboard/expense-claims/approvals", { replace: true });
    } catch (error) {
      setErrors(error.details?.rowErrors || [error.message || "Failed to record the decision."]);
      toast.error(error.message || "Failed to record the decision.");
    } finally {
      setBusy(false);
      setConfirmApprove(false);
    }
  };

  const handleApproveClick = () => {
    const errs = validate();
    if (errs.length) {
      setErrors(errs);
      toast.error("Please resolve the highlighted rows.");
      return;
    }
    setErrors([]);
    setConfirmApprove(true);
  };

  const submitReason = async () => {
    if (!reasonText.trim()) {
      toast.error("A reason is required.");
      return;
    }
    setBusy(true);
    try {
      if (reasonModal === "send_back") {
        await sendBackClaim(claim.id, reasonText.trim());
        toast.success("Claim sent back to the employee.");
      } else {
        await rejectClaim(claim.id, reasonText.trim());
        toast.success("Claim rejected.");
      }
      navigate("/dashboard/expense-claims/approvals", { replace: true });
    } catch (error) {
      toast.error(error.message || "Action failed.");
    } finally {
      setBusy(false);
      setReasonModal(null);
      setReasonText("");
    }
  };

  if (loading || !claim) {
    return (
      <div className="flex items-center justify-center py-24 text-text-muted">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }

  const showPrev = stage === "l2" || stage === "final";
  const prevAmountKey = stage === "final" ? "l2ApprovedAmount" : "l1ApprovedAmount";
  const prevReasonKey = stage === "final" ? "l2Reason" : "l1Reason";

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => navigate("/dashboard/expense-claims/approvals")}
            className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft size={14} /> Approvals
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight text-text-primary sm:text-xl">
              {claim.claimNumber}
            </h1>
            <ClaimStatusBadge status={claim.status} />
            {stage ? (
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
                {STAGE_LABEL[stage]} review
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-text-secondary">
            {claim.employeeName}
            {claim.employeeCode ? ` · ${claim.employeeCode}` : ""}
            {claim.department ? ` · ${claim.department}` : ""}
          </p>
        </div>
      </div>

      <div className={`${CARD_SHELL} p-4`}>
        <ClaimProgressTracker status={claim.status} />
      </div>

      {!isMyPending ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
          This claim is not awaiting your approval right now — showing it read-only.{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => navigate(`/dashboard/expense-claims/my/${claim.id}`)}
          >
            Open full detail
          </button>
        </div>
      ) : null}

      {/* Employee + claim summary */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className={`${CARD_SHELL} p-4`}>
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Employee Details</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            <Detail label="Employee" value={claim.employeeName} />
            <Detail label="Employee ID" value={claim.employeeCode} />
            <Detail label="Department" value={claim.department} />
            <Detail label="Designation" value={claim.designation} />
            <Detail label="Circle" value={claim.circle} />
            <Detail label="CMP" value={claim.cmp} />
          </dl>
        </div>
        <div className={`${CARD_SHELL} p-4`}>
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Claim Details</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            <Detail
              label="Submitted On"
              value={claim.submittedAt ? formatDate(claim.submittedAt.toString().slice(0, 10)) : "—"}
            />
            <Detail label="Total Claimed" value={formatCurrency(claim.totalClaimed)} strong />
            {claim.l1ApprovedTotal != null ? (
              <Detail label="L1 Approved" value={formatCurrency(claim.l1ApprovedTotal)} />
            ) : null}
            {claim.l2ApprovedTotal != null ? (
              <Detail label="L2 Approved" value={formatCurrency(claim.l2ApprovedTotal)} />
            ) : null}
          </dl>
        </div>
      </div>

      {errors.length ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          <div className="mb-1 font-semibold">Please resolve the following:</div>
          <ul className="list-disc space-y-0.5 pl-5">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Decision table */}
      <div className={`${CARD_SHELL} overflow-hidden`}>
        <div className="border-b border-border-color/70 px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">
            Expense Items ({items.length}){isMyPending ? ` — ${STAGE_LABEL[stage]} Decision` : ""}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead>
              <tr className="bg-surface-muted text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                <th className="px-3 py-2.5">#</th>
                <th className="px-3 py-2.5">Category</th>
                <th className="px-3 py-2.5">Description</th>
                <th className="px-3 py-2.5 text-right">Claimed</th>
                {showPrev ? (
                  <>
                    <th className="px-3 py-2.5 text-right">{PREV_LABEL[stage]} Approved</th>
                    <th className="px-3 py-2.5">{PREV_LABEL[stage]} Reason</th>
                  </>
                ) : null}
                <th className="px-3 py-2.5">Bill</th>
                {isMyPending ? (
                  <>
                    <th className="px-3 py-2.5">Decision</th>
                    <th className="px-3 py-2.5 text-right">Approved</th>
                    <th className="px-3 py-2.5">Reason</th>
                  </>
                ) : (
                  <th className="px-3 py-2.5 text-right">{stage ? STAGE_LABEL[stage] : ""} Approved</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-color">
              {computed.rows.map((r, index) => {
                const it = r.item;
                const bills = attByItem.get(it.id) || [];
                return (
                  <tr key={it.id} className="align-top">
                    <td className="px-3 py-2 text-text-muted">{index + 1}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-text-primary">
                      {it.workCategory || it.category}
                    </td>
                    <td className="px-3 py-2 text-text-secondary">
                      <div className="max-w-[280px] truncate" title={it.description || ""}>
                        {it.description || "—"}
                      </div>
                      <span className="block text-xs text-text-muted">
                        {formatDate((it.expenseDate || "").toString().slice(0, 10))}
                      </span>
                      <ItemClassification item={it} className="mt-1" />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-text-primary">
                      {formatCurrency(it.claimedAmount)}
                    </td>
                    {showPrev ? (
                      <>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-text-secondary">
                          {it[prevAmountKey] != null ? formatCurrency(it[prevAmountKey]) : "—"}
                        </td>
                        <td className="max-w-[180px] truncate px-3 py-2 text-xs text-text-secondary" title={it[prevReasonKey] || ""}>
                          {it[prevReasonKey] || "—"}
                        </td>
                      </>
                    ) : null}
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

                    {isMyPending ? (
                      <>
                        <td className="px-3 py-2">
                          <select
                            className={CELL}
                            value={r.decision.kind}
                            onChange={(e) => setDecision(it.id, { kind: e.target.value })}
                          >
                            <option value="approve_full">Approve Full</option>
                            <option value="approve_partial">Approve Partial</option>
                            <option value="reject">Reject</option>
                          </select>
                          <span className="mt-0.5 block text-[11px] text-text-muted">
                            Max {formatCurrency(r.ceiling)}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className={`${CELL} text-right ${
                              r.decision.kind === "approve_partial" ? "" : "opacity-60"
                            }`}
                            value={
                              r.decision.kind === "approve_partial"
                                ? r.decision.approvedAmount
                                : r.approved
                            }
                            disabled={r.decision.kind !== "approve_partial"}
                            onChange={(e) => setDecision(it.id, { approvedAmount: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className={`${CELL} ${
                              r.needsReason && !r.decision.reason.trim()
                                ? "border-rose-300 bg-rose-50 dark:bg-rose-500/10"
                                : ""
                            }`}
                            placeholder={r.needsReason ? "Reason (required)" : "Reason (optional)"}
                            value={r.decision.reason}
                            onChange={(e) => setDecision(it.id, { reason: e.target.value })}
                          />
                        </td>
                      </>
                    ) : (
                      <td className="whitespace-nowrap px-3 py-2 text-right text-text-secondary">
                        {it[`${stage}ApprovedAmount`] != null
                          ? formatCurrency(it[`${stage}ApprovedAmount`])
                          : "—"}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            {isMyPending ? (
              <tfoot>
                <tr className="bg-surface-muted/60 font-semibold text-text-primary">
                  <td className="px-3 py-2.5" colSpan={showPrev ? 5 : 3}>
                    Totals
                  </td>
                  <td className="px-3 py-2.5 text-right">{formatCurrency(computed.claimed)}</td>
                  <td className="px-3 py-2.5" colSpan={showPrev ? 1 : 1} />
                  <td className="px-3 py-2.5 text-right text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(computed.approved)}
                  </td>
                  <td className="px-3 py-2.5 text-rose-600 dark:text-rose-400">
                    − {formatCurrency(computed.reduced)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>

        {isMyPending ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-color/70 bg-surface-muted/40 px-4 py-3">
            <div className="flex flex-wrap gap-4 text-sm">
              <Stat label="Total Claimed" value={formatCurrency(computed.claimed)} />
              <Stat
                label={`${STAGE_LABEL[stage]} Approved`}
                value={formatCurrency(computed.approved)}
                tone="text-emerald-600 dark:text-emerald-400"
              />
              <Stat
                label={`${STAGE_LABEL[stage]} Reduced / Rejected`}
                value={formatCurrency(computed.reduced)}
                tone="text-rose-600 dark:text-rose-400"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setReasonModal("send_back");
                  setReasonText("");
                }}
                disabled={busy}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border-color bg-surface px-4 text-sm font-medium text-text-secondary transition hover:bg-surface-muted disabled:opacity-50"
              >
                <CornerUpLeft size={15} /> Send Back
              </button>
              <button
                type="button"
                onClick={() => {
                  setReasonModal("reject");
                  setReasonText("");
                }}
                disabled={busy}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-rose-200 bg-surface px-4 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-500/20 dark:hover:bg-rose-500/10"
              >
                <X size={15} /> Reject Claim
              </button>
              <button
                type="button"
                onClick={handleApproveClick}
                disabled={busy}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
              >
                {busy ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}
                Approve &amp; Forward
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* History */}
      <div className={`${CARD_SHELL} p-4`}>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Claim History</h2>
        <AuditTimeline entries={bundle.audit} />
      </div>

      <ConfirmDialog
        open={confirmApprove}
        title={`Forward this claim after ${STAGE_LABEL[stage] || ""} approval?`}
        description={`Total Claimed ${formatCurrency(computed.claimed)}\n${STAGE_LABEL[stage] || ""} Approved ${formatCurrency(
          computed.approved
        )}\nReduced / Rejected ${formatCurrency(computed.reduced)}`}
        confirmLabel="Approve & Forward"
        tone="primary"
        busy={busy}
        onConfirm={doApprove}
        onCancel={() => setConfirmApprove(false)}
      />

      {reasonModal ? (
        <ReasonModal
          mode={reasonModal}
          value={reasonText}
          onChange={setReasonText}
          busy={busy}
          onSubmit={submitReason}
          onCancel={() => {
            setReasonModal(null);
            setReasonText("");
          }}
        />
      ) : null}
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

function Stat({ label, value, tone = "text-text-primary" }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">{label}</div>
      <div className={`text-base font-bold ${tone}`}>{value}</div>
    </div>
  );
}

function ReasonModal({ mode, value, onChange, busy, onSubmit, onCancel }) {
  const isReject = mode === "reject";
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Cancel"
        disabled={busy}
        onClick={onCancel}
        className="absolute inset-0 h-full w-full cursor-default bg-overlay/45 backdrop-blur-sm"
      />
      <div className="relative z-10 w-full max-w-[460px] overflow-hidden rounded-[20px] border border-border-color/80 bg-surface shadow-[0_30px_90px_rgba(15,23,42,0.2)]">
        <div className="px-6 pt-6">
          <h2 className="text-lg font-semibold text-text-primary">
            {isReject ? "Reject this claim" : "Send this claim back"}
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            {isReject
              ? "The claim is closed as rejected and kept in history. A reason is mandatory."
              : "The claim returns to the employee for correction. A reason is mandatory."}
          </p>
          <textarea
            rows={4}
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={isReject ? "Why is this claim being rejected?" : "What does the employee need to fix?"}
            className="mt-3 w-full rounded-xl border border-border-color bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-indigo-400"
          />
        </div>
        <div className="mt-4 flex flex-col-reverse gap-2 border-t border-border-color/70 bg-surface-muted/40 px-6 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-10 items-center justify-center rounded-full border border-border-color bg-surface px-5 text-sm font-medium text-text-secondary transition hover:bg-surface-muted disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy || !value.trim()}
            className={`inline-flex h-10 min-w-[140px] items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50 ${
              isReject
                ? "bg-gradient-to-r from-rose-500 to-red-500"
                : "bg-gradient-to-r from-amber-500 to-orange-500"
            }`}
          >
            {busy ? <Loader2 className="animate-spin" size={15} /> : null}
            {isReject ? "Reject Claim" : "Send Back"}
          </button>
        </div>
      </div>
    </div>
  );
}
