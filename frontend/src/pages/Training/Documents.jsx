import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { ChevronLeft, ChevronRight, Download, Eye, FileText, RefreshCw } from "lucide-react";
import { downloadDocument, fetchAllDocuments } from "../../lib/trainingApi";
import DocumentViewer from "../../components/training/DocumentViewer";
import SearchBar from "../../components/training/SearchBar";
import StatusBadge from "../../components/training/StatusBadge";

const STATUS_TABS = ["", "Pending", "Verified", "Rejected"];

function prettyType(type) {
  return String(type || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Documents() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchAllDocuments({ status, search, page, pageSize: 20 });
      setRows(response.data || []);
      setMeta(response.meta);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [status, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDownload = async (doc) => {
    setDownloadingId(doc.id);
    try {
      await downloadDocument(doc);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setDownloadingId(null);
    }
  };

  const total = meta?.total || 0;
  const pageSize = meta?.pageSize || 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-text-primary">
            <FileText className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
            Documents
          </h1>
          <p className="mt-0.5 text-sm text-text-muted">
            All candidate documents from Google Drive and HR uploads.
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

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-2xl border border-border-color bg-surface p-1 shadow-sm">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab || "all"}
              type="button"
              onClick={() => {
                setStatus(tab);
                setPage(1);
              }}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                status === tab
                  ? "bg-indigo-600 text-white shadow"
                  : "text-text-muted hover:bg-surface-muted"
              }`}
            >
              {tab || "All"}
            </button>
          ))}
        </div>
        <SearchBar
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Search candidate name, Aadhaar, mobile…"
        />
      </div>

      <div className="overflow-hidden rounded-[20px] border border-border-color bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-border-color bg-surface-muted/70 text-[11px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-3 font-semibold">Candidate</th>
                <th className="px-4 py-3 font-semibold">Document</th>
                <th className="px-4 py-3 font-semibold">File</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Verified By</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <tr key={index} className="animate-pulse border-b border-border-color">
                    {Array.from({ length: 6 }).map((__, cell) => (
                      <td key={cell} className="px-4 py-3.5">
                        <div className="h-3.5 w-24 rounded bg-surface-muted" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length ? (
                rows.map((doc) => (
                  <tr key={doc.id} className="border-b border-border-color transition hover:bg-blue-50 hover:dark:bg-blue-500/10/40">
                    <td className="px-4 py-3.5">
                      <Link
                        to={`/dashboard/training/employees/${doc.training_employee_id}`}
                        className="font-semibold text-text-primary hover:text-indigo-600 hover:dark:text-indigo-400"
                      >
                        {doc.full_name}
                      </Link>
                      <p className="text-xs text-text-muted">{doc.mobile}</p>
                    </td>
                    <td className="px-4 py-3.5 text-text-secondary">{prettyType(doc.document_type)}</td>
                    <td className="max-w-[220px] truncate px-4 py-3.5 text-xs text-text-muted">
                      {doc.file_name || "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={doc.verification_status} />
                    </td>
                    <td className="px-4 py-3.5 text-xs text-text-muted">
                      {doc.verified_by || "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex justify-end gap-1.5">
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
                          disabled={downloadingId === doc.id}
                          onClick={() => handleDownload(doc)}
                          className="flex h-8 w-8 items-center justify-center rounded-xl border border-border-color text-text-muted transition hover:bg-surface-muted disabled:opacity-50"
                          title="Download"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-14 text-center text-sm text-text-muted">
                    No documents found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-color px-4 py-3 text-sm text-text-muted">
          <span>
            {total
              ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`
              : "0 documents"}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-border-color transition enabled:hover:bg-surface-muted disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[70px] text-center text-xs font-medium">
              Page {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-border-color transition enabled:hover:bg-surface-muted disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {preview ? <DocumentViewer document={preview} onClose={() => setPreview(null)} /> : null}
    </div>
  );
}
