import { CheckCircle2, Loader2, UploadCloud, XCircle } from "lucide-react";

/**
 * Inline upload state indicator.
 * state: "idle" | "uploading" | "success" | "error"
 */
export default function UploadProgress({ state, fileName, message }) {
  if (state === "idle" || !state) return null;

  const config = {
    uploading: {
      icon: <Loader2 className="h-4 w-4 animate-spin text-blue-500 dark:text-blue-400" />,
      text: `Uploading ${fileName || "file"}…`,
      className: "border-blue-100 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10/60 text-blue-700 dark:text-blue-400",
    },
    success: {
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />,
      text: message || `${fileName || "File"} uploaded successfully`,
      className: "border-emerald-100 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10/60 text-emerald-700 dark:text-emerald-400",
    },
    error: {
      icon: <XCircle className="h-4 w-4 text-rose-500 dark:text-rose-400" />,
      text: message || "Upload failed",
      className: "border-rose-100 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10/60 text-rose-700 dark:text-rose-400",
    },
  }[state] || {
    icon: <UploadCloud className="h-4 w-4 text-text-muted" />,
    text: message || "",
    className: "border-border-color bg-surface-muted text-text-secondary",
  };

  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${config.className}`}
    >
      {config.icon}
      <span className="truncate">{config.text}</span>
    </div>
  );
}
