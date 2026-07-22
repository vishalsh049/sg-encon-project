import { useState } from "react";
import { Check, Eye, Loader2, X } from "lucide-react";
import toast from "react-hot-toast";
import { verifyDocument } from "../../lib/trainingApi";
import StatusBadge from "./StatusBadge";

function prettyType(type) {
  return String(type || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Per-candidate document verification list with Verify / Reject actions.
 * Rejection requires remarks (enforced client- and server-side).
 */
export default function VerificationChecklist({ documents, onChanged, onPreview, disabled }) {
  const [busyId, setBusyId] = useState(null);
  const [rejecting, setRejecting] = useState(null); // document being rejected
  const [remarks, setRemarks] = useState("");

  const act = async (doc, status, remarksText) => {
    setBusyId(doc.id);
    try {
      await verifyDocument(doc.id, status, remarksText);
      toast.success(`Document ${status.toLowerCase()}`);
      setRejecting(null);
      setRemarks("");
      onChanged?.();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusyId(null);
    }
  };

  if (!documents?.length) {
    return (
      <p className="rounded-2xl border border-dashed border-border-color py-8 text-center text-sm text-text-muted">
        No documents uploaded yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <div key={doc.id} className="rounded-2xl border border-border-color bg-surface p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text-secondary">
                {prettyType(doc.document_type)}
              </p>
              <p className="truncate text-xs text-text-muted">{doc.file_name || "—"}</p>
            </div>

            <StatusBadge status={doc.verification_status} />

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onPreview?.(doc)}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-border-color text-text-muted transition hover:bg-surface-muted"
                title="Preview"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>

              {!disabled ? (
                <>
                  <button
                    type="button"
                    disabled={busyId === doc.id || doc.verification_status === "Verified"}
                    onClick={() => act(doc, "Verified")}
                    className="flex h-8 items-center gap-1 rounded-xl bg-emerald-500 px-2.5 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-40"
                  >
                    {busyId === doc.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Verify
                  </button>
                  <button
                    type="button"
                    disabled={busyId === doc.id || doc.verification_status === "Rejected"}
                    onClick={() => {
                      setRejecting(rejecting?.id === doc.id ? null : doc);
                      setRemarks("");
                    }}
                    className="flex h-8 items-center gap-1 rounded-xl bg-rose-500 px-2.5 text-xs font-semibold text-white transition hover:bg-rose-600 disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {doc.remarks ? (
            <p className="mt-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-300">
              {doc.remarks}
              {doc.verified_by ? ` — ${doc.verified_by}` : ""}
            </p>
          ) : null}

          {rejecting?.id === doc.id ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="text"
                autoFocus
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
                placeholder="Reason for rejection (required)"
                className="h-9 min-w-[220px] flex-1 rounded-xl border border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10/50 px-3 text-sm outline-none focus:border-rose-300 focus:dark:border-rose-500/30 focus:ring-4 focus:ring-rose-100"
              />
              <button
                type="button"
                disabled={!remarks.trim() || busyId === doc.id}
                onClick={() => act(doc, "Rejected", remarks.trim())}
                className="h-9 rounded-xl bg-rose-600 px-3 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-40"
              >
                Confirm Reject
              </button>
              <button
                type="button"
                onClick={() => setRejecting(null)}
                className="h-9 rounded-xl border border-border-color px-3 text-xs font-medium text-text-muted hover:bg-surface-muted"
              >
                Cancel
              </button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
