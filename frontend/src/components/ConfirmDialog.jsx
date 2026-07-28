import { useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";

/**
 * Confirmation dialog matching the app's surface styling.
 *
 * Replaces window.confirm, which cannot be styled, ignores the dark theme,
 * blocks the whole browser tab, and is suppressible by the user's "prevent
 * this page from creating more dialogs" checkbox — after which destructive
 * actions would silently proceed.
 */
function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}) {
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    // Focus the confirm button so Enter/Escape both work without a mouse.
    confirmRef.current?.focus();

    const handleKey = (event) => {
      if (event.key === "Escape" && !busy) onCancel?.();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const confirmClass =
    tone === "danger"
      ? "bg-gradient-to-r from-rose-500 to-red-500"
      : "bg-gradient-to-r from-sky-500 to-indigo-500";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center px-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
    >
      <button
        type="button"
        aria-label="Cancel"
        disabled={busy}
        onClick={() => !busy && onCancel?.()}
        className="absolute inset-0 h-full w-full cursor-default bg-overlay/45 backdrop-blur-sm"
      />

      <div className="animate-modal-enter relative z-10 w-full max-w-[480px] overflow-hidden rounded-[20px] border border-border-color/80 bg-surface shadow-[0_30px_90px_rgba(15,23,42,0.2)]">
        <div className="flex items-start gap-4 px-6 pb-2 pt-6">
          <div
            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl ${
              tone === "danger"
                ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
                : "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400"
            }`}
          >
            <AlertTriangle size={20} />
          </div>

          <div className="min-w-0 flex-1">
            <h2
              id="confirm-dialog-title"
              className="text-lg font-semibold tracking-[-0.02em] text-text-primary"
            >
              {title}
            </h2>
            <p
              id="confirm-dialog-description"
              className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-text-secondary"
            >
              {description}
            </p>
          </div>

          <button
            type="button"
            onClick={() => !busy && onCancel?.()}
            disabled={busy}
            aria-label="Cancel"
            className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-border-color bg-surface text-text-secondary transition hover:bg-surface-muted disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-border-color/70 bg-surface-muted/40 px-6 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-10 items-center justify-center rounded-full border border-border-strong bg-surface px-5 text-sm font-medium text-text-secondary transition hover:bg-surface-muted disabled:opacity-40"
          >
            {cancelLabel}
          </button>

          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex h-10 min-w-[140px] items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60 ${confirmClass}`}
          >
            {busy ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Working...
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
