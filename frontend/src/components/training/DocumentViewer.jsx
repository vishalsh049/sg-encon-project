import { useState } from "react";
import { Download, ExternalLink, FileText, Loader2, X } from "lucide-react";
import toast from "react-hot-toast";
import { downloadDocument } from "../../lib/trainingApi";
import StatusBadge from "./StatusBadge";

function prettyType(type) {
  return String(type || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function prettySize(bytes) {
  const size = Number(bytes);
  if (!size) return "";
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Modal preview for one training document.
 * Drive-hosted files preview via the Drive embed URL; local images/PDFs
 * are opened through the download endpoint.
 */
export default function DocumentViewer({ document: doc, onClose }) {
  const [downloading, setDownloading] = useState(false);

  if (!doc) return null;

  const driveEmbedUrl = doc.drive_file_id
    ? `https://drive.google.com/file/d/${doc.drive_file_id}/preview`
    : null;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadDocument(doc);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[22px] bg-surface shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border-color px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <FileText className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text-primary">
                {prettyType(doc.document_type)}
              </p>
              <p className="truncate text-xs text-text-muted">
                {doc.file_name || "—"} {prettySize(doc.file_size) && `· ${prettySize(doc.file_size)}`}
              </p>
            </div>
            <StatusBadge status={doc.verification_status} />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="flex h-8 items-center gap-1.5 rounded-xl border border-border-color px-2.5 text-xs font-medium text-text-secondary transition hover:bg-surface-muted disabled:opacity-50"
            >
              {downloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Download
            </button>
            {doc.drive_link ? (
              <a
                href={doc.drive_link}
                target="_blank"
                rel="noreferrer noopener"
                className="flex h-8 items-center gap-1.5 rounded-xl border border-border-color px-2.5 text-xs font-medium text-text-secondary transition hover:bg-surface-muted"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Drive
              </a>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-text-muted transition hover:bg-surface-muted hover:text-text-secondary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-[320px] flex-1 overflow-auto bg-surface-muted">
          {driveEmbedUrl ? (
            <iframe
              title={doc.file_name || "Document preview"}
              src={driveEmbedUrl}
              className="h-[65vh] w-full border-0"
              allow="autoplay"
            />
          ) : (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 p-8 text-center">
              <FileText className="h-10 w-10 text-slate-300" />
              <p className="text-sm text-text-muted">
                No inline preview available — use Download to view this file.
              </p>
            </div>
          )}
        </div>

        {doc.remarks ? (
          <div className="border-t border-border-color bg-amber-50 dark:bg-amber-500/10/60 px-5 py-2.5 text-xs text-amber-800 dark:text-amber-300">
            <span className="font-semibold">Remarks:</span> {doc.remarks}
          </div>
        ) : null}
      </div>
    </div>
  );
}
