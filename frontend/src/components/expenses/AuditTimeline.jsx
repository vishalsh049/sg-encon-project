import { formatCurrency, formatDateTime } from "../../utils/penaltyFormat";

const ACTION_LABELS = {
  DRAFT_CREATED: "created the draft",
  DRAFT_UPDATED: "updated the draft",
  SUBMITTED: "submitted the claim",
  RESUBMITTED: "resubmitted the claim",
  BILL_UPLOADED: "uploaded a bill",
  BILL_REMOVED: "removed a bill",
  L1_APPROVED: "approved at L1",
  L1_APPROVED_WITH_CHANGES: "approved at L1 with changes",
  L2_APPROVED: "approved at L2",
  L2_APPROVED_WITH_CHANGES: "approved at L2 with changes",
  FINAL_APPROVED: "gave final approval",
  FINAL_APPROVED_WITH_CHANGES: "gave final approval with changes",
  ITEM_APPROVED_FULL: "approved an item in full",
  ITEM_APPROVED_PARTIAL: "partially approved an item",
  ITEM_REJECTED: "rejected an item",
  SENT_BACK: "sent the claim back",
  REJECTED: "rejected the claim",
  MOVED_TO_FINANCE: "forwarded the claim to Finance",
  FINANCE_PENDING: "queued the claim for processing",
  FINANCE_PROCESSING: "marked the claim as processing",
  FINANCE_ON_HOLD: "put the claim on hold",
  FINANCE_PROCESSED: "processed the payment",
};

const STAGE_TAG = { l1: "L1", l2: "L2", final: "Final", finance: "Finance", employee: "Employee" };

function label(action) {
  return ACTION_LABELS[action] || String(action || "").toLowerCase().replace(/_/g, " ");
}

export default function AuditTimeline({ entries = [] }) {
  if (!entries.length) {
    return (
      <p className="rounded-lg border border-dashed border-border-color px-3 py-6 text-center text-xs text-text-muted">
        No history yet.
      </p>
    );
  }

  return (
    <ol className="relative ml-2 space-y-4 border-l border-border-color pl-5">
      {entries.map((entry) => (
        <li key={entry.id} className="relative">
          <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-surface bg-indigo-400" />
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-text-muted">
            {formatDateTime(entry.createdAt)}
            {entry.stage && STAGE_TAG[entry.stage] ? (
              <span className="rounded-full border border-border-color px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-text-secondary">
                {STAGE_TAG[entry.stage]}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 text-sm text-text-primary">
            <span className="font-semibold">{entry.actorName || "System"}</span>{" "}
            {label(entry.action)}
            {entry.newAmount != null ? (
              <span className="font-semibold"> — {formatCurrency(entry.newAmount)}</span>
            ) : null}
          </div>
          {entry.meta?.claimNumber ? (
            <div className="text-xs text-text-secondary">Claim No: {entry.meta.claimNumber}</div>
          ) : null}
          {entry.meta?.fileName ? (
            <div className="text-xs text-text-secondary">{entry.meta.fileName}</div>
          ) : null}
          {entry.reason ? (
            <div className="mt-1 rounded-md bg-surface-muted px-2.5 py-1.5 text-xs text-text-secondary">
              {entry.reason}
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
