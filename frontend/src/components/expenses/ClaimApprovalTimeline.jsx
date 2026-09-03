import { Check, Minus, X } from "lucide-react";
import { formatDate } from "../../utils/penaltyFormat";

// Real, DB-derived approval trail for one claim. Shows — with no invented data —
// the claimant, who raised it on their behalf, and the live status of every
// approval stage (L1 / L2 / Final) plus Finance. Data comes from the
// `timeline` object the claim bundle now returns.
//
// Stage status is one of: approved | pending | rejected | skipped | not_reached.

const STATE_META = {
  approved: {
    label: "Approved",
    dot: "border-emerald-500 bg-emerald-500 text-white",
    text: "text-emerald-600 dark:text-emerald-400",
    Icon: Check,
  },
  in_finance: {
    label: "In Finance",
    dot: "border-emerald-500 bg-emerald-500 text-white",
    text: "text-emerald-600 dark:text-emerald-400",
    Icon: Check,
  },
  pending: {
    label: "Pending",
    dot: "border-amber-400 bg-amber-50 text-amber-600 dark:bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    Icon: null,
  },
  rejected: {
    label: "Rejected",
    dot: "border-rose-400 bg-rose-50 text-rose-500 dark:bg-rose-500/10",
    text: "text-rose-600 dark:text-rose-400",
    Icon: X,
  },
  skipped: {
    label: "Not required",
    dot: "border-border-color bg-surface text-text-muted",
    text: "text-text-muted",
    Icon: Minus,
  },
  not_reached: {
    label: "—",
    dot: "border-border-color bg-surface text-text-muted",
    text: "text-text-muted",
    Icon: null,
  },
};

function Row({ n, title, state, who, when, reason, last }) {
  const meta = STATE_META[state] || STATE_META.not_reached;
  const { Icon } = meta;
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold ${meta.dot}`}
        >
          {Icon ? <Icon size={13} /> : n}
        </span>
        {!last ? <span className="mt-1 w-0.5 flex-1 bg-border-color" /> : null}
      </div>
      <div className={`pb-4 ${last ? "pb-0" : ""}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-text-primary">{title}</span>
          <span className={`text-xs font-semibold ${meta.text}`}>{meta.label}</span>
          {when ? (
            <span className="text-xs text-text-muted">
              · {formatDate(String(when).slice(0, 10))}
            </span>
          ) : null}
        </div>
        {who ? <div className="mt-0.5 text-xs text-text-secondary">{who}</div> : null}
        {reason ? (
          <div className="mt-1 rounded-md bg-surface-muted px-2.5 py-1.5 text-xs text-text-secondary">
            {reason}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export default function ClaimApprovalTimeline({ timeline, claim }) {
  if (!timeline) return null;
  const { raised = {}, l1 = {}, l2 = {}, final = {}, finance = {} } = timeline;

  const claimantName =
    raised.claimantName || claim?.employeeName || claim?.claimantName || "—";
  const claimantCode = claim?.employeeCode || claim?.claimantCode || "";
  const raisedByName = raised.byName || claim?.submittedByName || null;
  const raisedByCode = claim?.submittedByEmployeeCode || "";
  const onBehalf =
    raised.onBehalf ??
    (claim?.submittedByUserId != null &&
      claim?.employeeUserId != null &&
      claim.submittedByUserId !== claim.employeeUserId);

  const approverLine = (stage) => {
    if (stage.status === "skipped") return "No approver in the chain for this level.";
    if (!stage.approverName) return null;
    return `Approver: ${stage.approverName}`;
  };

  return (
    <ol className="mt-1">
      <Row
        n={1}
        title="Claim Raised"
        state="approved"
        when={raised.at}
        who={
          <>
            <span className="font-medium text-text-primary">Claimant:</span>{" "}
            {claimantName}
            {claimantCode ? ` · ${claimantCode}` : ""}
            <br />
            <span className="font-medium text-text-primary">Raised By:</span>{" "}
            {onBehalf && raisedByName
              ? `${raisedByName}${raisedByCode ? ` · ${raisedByCode}` : ""} (on behalf of the claimant)`
              : raisedByName || "Self"}
            {raised.sentBackReason ? (
              <span className="mt-1 block text-amber-600 dark:text-amber-400">
                Last sent back: {raised.sentBackReason}
              </span>
            ) : null}
          </>
        }
      />
      <Row
        n={2}
        title="L1 Approval"
        state={l1.status}
        when={l1.at}
        who={approverLine(l1)}
        reason={l1.status === "rejected" ? l1.reason : null}
      />
      <Row
        n={3}
        title="L2 Approval"
        state={l2.status}
        when={l2.at}
        who={approverLine(l2)}
        reason={l2.status === "rejected" ? l2.reason : null}
      />
      <Row
        n={4}
        title="Final Approval"
        state={final.status}
        when={final.at}
        who={approverLine(final)}
        reason={final.status === "rejected" ? final.reason : null}
      />
      <Row
        n={5}
        title="Finance"
        state={finance.status === "in_finance" ? "in_finance" : "pending"}
        when={finance.at}
        who={
          finance.status === "in_finance"
            ? "Claim is fully approved and available to Finance."
            : "Available to Finance only after Final Approval."
        }
        last
      />
    </ol>
  );
}
