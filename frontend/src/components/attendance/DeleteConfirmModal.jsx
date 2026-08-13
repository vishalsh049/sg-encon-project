import { AlertTriangle, RefreshCw, X } from "lucide-react";

// Shared single/bulk delete confirmation, modeled on NewJoining.jsx's
// deleteTarget/confirmDelete state shape. `target` is either
// { type: "single", label } or { type: "bulk", count }.
export default function DeleteConfirmModal({ target, deleting, onConfirm, onClose }) {
  if (!target) return null;

  const message = target.type === "bulk"
    ? `You are about to delete ${target.count} attendance record(s). This cannot be undone.`
    : `You are about to delete the attendance record for ${target.label || "this employee"}. This cannot be undone.`;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
              <AlertTriangle size={18} />
            </span>
            <h2 className="text-base font-semibold text-text-primary">Delete Attendance Record{target.type === "bulk" ? "s" : ""}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={deleting} className="text-text-muted hover:text-text-primary disabled:opacity-40">
            <X size={16} />
          </button>
        </div>

        <p className="mb-5 text-sm text-text-secondary">{message}</p>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-xl border border-border-color px-4 py-2 text-sm font-medium text-text-secondary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
          >
            {deleting ? <RefreshCw size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
