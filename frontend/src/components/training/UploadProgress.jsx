import { CheckCircle2, Loader2, UploadCloud, XCircle } from "lucide-react";

/**
 * Inline upload state indicator.
 * state: "idle" | "uploading" | "success" | "error"
 */
export default function UploadProgress({ state, fileName, message }) {
  if (state === "idle" || !state) return null;

  const config = {
    uploading: {
      icon: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
      text: `Uploading ${fileName || "file"}…`,
      className: "border-blue-100 bg-blue-50/60 text-blue-700",
    },
    success: {
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
      text: message || `${fileName || "File"} uploaded successfully`,
      className: "border-emerald-100 bg-emerald-50/60 text-emerald-700",
    },
    error: {
      icon: <XCircle className="h-4 w-4 text-rose-500" />,
      text: message || "Upload failed",
      className: "border-rose-100 bg-rose-50/60 text-rose-700",
    },
  }[state] || {
    icon: <UploadCloud className="h-4 w-4 text-slate-400" />,
    text: message || "",
    className: "border-slate-100 bg-slate-50 text-slate-600",
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
