import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Check, Eye, Loader2, RefreshCw, ShieldCheck, X } from "lucide-react";
import {
  fetchAllDocuments,
  fetchRecentVerifications,
  verifyDocument,
} from "../../lib/trainingApi";
import DocumentViewer from "../../components/training/DocumentViewer";
import StatusBadge from "../../components/training/StatusBadge";

function prettyType(type) {
  return String(type || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Verification queue: every document still Pending, with one-click
 * Verify / Reject (remarks required for rejection).
 */
export default function Verification() {
  const [queue, setQueue] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [preview, setPreview] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [queueRes, recentRes] = await Promise.all([
        fetchAllDocuments({ status: "Pending", pageSize: 50 }),
        fetchRecentVerifications(15),
      ]);
      setQueue(queueRes.data || []);
      setRecent(recentRes.data || []);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (doc, status, remarksText) => {
    setBusyId(doc.id);
    try {
      await verifyDocument(doc.id, status, remarksText);
      toast.success(`Document ${status.toLowerCase()}`);
      setRejecting(null);
      setRemarks("");
      load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-text-primary">
            <ShieldCheck className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
            Document Verification
          </h1>
          <p className="mt-0.5 text-sm text-text-muted">
            {queue.length} document{queue.length === 1 ? "" : "s"} waiting for verification.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="flex h-9 items-center gap-1.5 rounded-2xl border border-border-color bg-surface px-3 text-sm font-medium text-text-secondary shadow-sm transition hover:bg-surface-muted"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Pending queue */}
        <div className="space-y-2.5 lg:col-span-2">
          {loading ? (
            Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-2xl bg-surface-muted" />
            ))
          ) : queue.length ? (
            queue.map((doc) => (
              <div key={doc.id} className="rounded-2xl border border-border-color bg-surface p-3.5 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/dashboard/training/employees/${doc.training_employee_id}`}
                      className="text-sm font-semibold text-text-primary hover:text-indigo-600 hover:dark:text-indigo-400"
                    >
                      {doc.full_name}
                    </Link>
                    <p className="text-xs text-text-muted">
                      {prettyType(doc.document_type)} · {doc.file_name || "no file name"}
                    </p>
                  </div>
                  <StatusBadge status={doc.employee_status} />
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPreview(doc)}
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-border-color text-text-muted transition hover:bg-surface-muted"
                      title="Preview"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={busyId === doc.id}
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
                      disabled={busyId === doc.id}
                      onClick={() => {
                        setRejecting(rejecting?.id === doc.id ? null : doc);
                        setRemarks("");
                      }}
                      className="flex h-8 items-center gap-1 rounded-xl bg-rose-500 px-2.5 text-xs font-semibold text-white transition hover:bg-rose-600 disabled:opacity-40"
                    >
                      <X className="h-3.5 w-3.5" />
                      Reject
                    </button>
                  </div>
                </div>

                {rejecting?.id === doc.id ? (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
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
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-border-color bg-surface py-14 text-center">
              <ShieldCheck className="mx-auto h-8 w-8 text-emerald-400" />
              <p className="mt-2 text-sm font-medium text-text-secondary">All caught up!</p>
              <p className="text-xs text-text-muted">No documents pending verification.</p>
            </div>
          )}
        </div>

        {/* Recent verification activity */}
        <div className="rounded-[20px] border border-border-color bg-surface p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-text-secondary">Recent Verifications</h2>
          <div className="mt-3 space-y-2.5">
            {recent.length ? (
              recent.map((entry) => (
                <div key={entry.id} className="rounded-xl bg-surface-muted p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-text-secondary">{entry.full_name}</span>
                    <StatusBadge status={entry.action} />
                  </div>
                  <p className="mt-0.5 text-text-muted">
                    {entry.document_type ? prettyType(entry.document_type) : "Profile"} ·{" "}
                    {entry.verified_by}
                  </p>
                </div>
              ))
            ) : (
              <p className="py-4 text-center text-xs text-text-muted">
                {loading ? "Loading…" : "No verification activity yet."}
              </p>
            )}
          </div>
        </div>
      </div>

      {preview ? <DocumentViewer document={preview} onClose={() => setPreview(null)} /> : null}
    </div>
  );
}
