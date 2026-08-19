import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  Download,
  Eye,
  FileSpreadsheet,
  Filter,
  Info,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";

import { useUser } from "../context/UserContext";
import { getPagePermission } from "../utils/access";
import { authFetch, buildApiUrl } from "../lib/api";
import { fetchCircles } from "../lib/circles";
import KpiCard from "../components/billingDashboard/KpiCard";
import { CARD_SHELL } from "../components/billingDashboard/theme";
import ConfirmDialog from "../components/ConfirmDialog";
import ReportUploadErrorDialog from "../components/ReportUploadErrorDialog";
import PremiumDatePicker from "../components/PremiumDatePicker";
import {
  buildQuery,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  todayIso,
} from "../utils/penaltyFormat";

const PAGE_ID = "kpis-penalty";
const PAGE_SIZE = 50;

const EMPTY_UPLOAD_FORM = { date: todayIso(), uploadedBy: "", file: null };

function KpiPenalty() {
  const { user } = useUser();
  const permission = useMemo(() => getPagePermission(user, PAGE_ID), [user]);

  // --- master data -----------------------------------------------------
  const [categories, setCategories] = useState([]);
  const [circleData, setCircleData] = useState({ circles: [], circleCmpMap: {} });
  const [monthOptions, setMonthOptions] = useState([]);

  // --- filters -----------------------------------------------------------
  const [filters, setFilters] = useState({
    month: "",
    circle: "",
    cmp: "",
    kpi: "",
    uploadedBy: "",
    dateFrom: "",
    dateTo: "",
    search: "",
  });
  const [page, setPage] = useState(1);

  // --- data ----------------------------------------------------------------
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [records, setRecords] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [uploads, setUploads] = useState([]);
  const [loadingUploads, setLoadingUploads] = useState(false);

  // --- upload modal ----------------------------------------------------
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState(EMPTY_UPLOAD_FORM);
  const [uploading, setUploading] = useState(false);
  const [uploadErrorPayload, setUploadErrorPayload] = useState(null);
  const [duplicatePrompt, setDuplicatePrompt] = useState(null);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  // --- view / delete modals --------------------------------------------
  const [viewModal, setViewModal] = useState(null); // { id, fileName, rows, loading }
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, fileName }
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // --- tabs --------------------------------------------------------------
  const [activeTab, setActiveTab] = useState("data"); // "data" | "files"

  // --- fetchers ------------------------------------------------------------
  const fetchMeta = useCallback(async () => {
    try {
      const response = await authFetch(buildApiUrl("/api/kpi-penalty/meta"));
      const payload = await response.json();
      if (payload.success) setCategories(payload.data.categories || []);
    } catch {
      // Non-fatal — the filter dropdown just stays empty.
    }
  }, []);

  const loadCircles = useCallback(async () => {
    try {
      const data = await fetchCircles();
      setCircleData(data);
    } catch {
      // Non-fatal — Circle/CMP dropdowns fall back to free text via uploads.
    }
  }, []);

  const fetchUploads = useCallback(async () => {
    setLoadingUploads(true);
    try {
      const response = await authFetch(buildApiUrl("/api/kpi-penalty/uploads"));
      const payload = await response.json();
      if (payload.success) setUploads(payload.data || []);
    } catch {
      toast.error("Failed to load uploaded files.");
    } finally {
      setLoadingUploads(false);
    }
  }, []);

  const fetchRecords = useCallback(async () => {
    setLoadingRecords(true);
    try {
      const qs = buildQuery({ ...filters, page, pageSize: PAGE_SIZE });
      const response = await authFetch(buildApiUrl(`/api/kpi-penalty/records?${qs}`));
      const payload = await response.json();
      if (payload.success) {
        setRecords(payload.data || []);
        setTotalRecords(payload.total || 0);
        setMonthOptions((prev) => {
          const set = new Set(prev);
          (payload.data || []).forEach((row) => set.add(row.month_label));
          return [...set].sort();
        });
      }
    } catch {
      toast.error("Failed to load KPI Penalty data.");
    } finally {
      setLoadingRecords(false);
    }
  }, [filters, page]);

  const fetchSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const qs = buildQuery(filters);
      const response = await authFetch(buildApiUrl(`/api/kpi-penalty/summary?${qs}`));
      const payload = await response.json();
      if (payload.success) setSummary(payload.data);
    } catch {
      // Summary cards just keep showing the last known values.
    } finally {
      setLoadingSummary(false);
    }
  }, [filters]);

  useEffect(() => {
    // Initial master-data + upload-history load. Raising the loading flag
    // before the request goes out is exactly what fetchUploads does.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMeta();
    loadCircles();
    fetchUploads();
  }, [fetchMeta, loadCircles, fetchUploads]);

  useEffect(() => {
    // Re-runs whenever filters/page change — the fetch itself is the sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRecords();
  }, [fetchRecords]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSummary();
  }, [fetchSummary]);

  const refreshAll = () => {
    fetchUploads();
    fetchRecords();
    fetchSummary();
  };

  // --- derived options -----------------------------------------------------
  const cmpOptions = useMemo(() => {
    if (filters.circle && circleData.circleCmpMap[filters.circle]) {
      return circleData.circleCmpMap[filters.circle];
    }
    return [...new Set(Object.values(circleData.circleCmpMap).flat())].sort();
  }, [filters.circle, circleData]);

  const uploadedByOptions = useMemo(
    () => [...new Set(uploads.map((row) => row.uploaded_by).filter(Boolean))].sort(),
    [uploads]
  );

  const updateFilter = (key, value) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setPage(1);
    setFilters({ month: "", circle: "", cmp: "", kpi: "", uploadedBy: "", dateFrom: "", dateTo: "", search: "" });
  };

  const hasActiveFilters = Object.values(filters).some(Boolean);
  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));

  // --- upload modal handlers -------------------------------------------
  const openUploadModal = () => {
    setUploadForm({ date: todayIso(), uploadedBy: user?.name || user?.username || "", file: null });
    setUploadErrorPayload(null);
    setDuplicatePrompt(null);
    setAttemptedSubmit(false);
    setUploadModalOpen(true);
  };

  const closeUploadModal = () => {
    if (uploading) return;
    setUploadModalOpen(false);
    setDuplicatePrompt(null);
  };

  const missingUploadFields = useMemo(() => {
    const missing = [];
    if (!uploadForm.date) missing.push("Date");
    if (!uploadForm.uploadedBy || !uploadForm.uploadedBy.trim()) missing.push("Uploaded By");
    if (!uploadForm.file) missing.push("File");
    return missing;
  }, [uploadForm]);

  const submitUpload = async (duplicateAction) => {
    setAttemptedSubmit(true);
    if (missingUploadFields.length) return;

    setUploading(true);
    setUploadErrorPayload(null);
    try {
      const formData = new FormData();
      formData.append("date", uploadForm.date);
      formData.append("uploadedBy", uploadForm.uploadedBy.trim());
      formData.append("file", uploadForm.file);
      if (duplicateAction) formData.append("duplicateAction", duplicateAction);

      const response = await authFetch(buildApiUrl("/api/kpi-penalty/upload"), {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));

      if (response.status === 409 && payload.duplicate) {
        setDuplicatePrompt({
          count: payload.duplicates?.length || 0,
          message: payload.message,
        });
        return;
      }

      if (!response.ok) {
        if (payload.errors?.length || payload.detectedHeaders?.length) {
          setUploadErrorPayload(payload);
        } else {
          toast.error(payload.message || "Upload failed. Please try again.");
        }
        return;
      }

      if (payload.upload) {
        toast.success(
          `Uploaded ${payload.upload.totalRecords} record${payload.upload.totalRecords === 1 ? "" : "s"} successfully.`
        );
      } else {
        toast.success("Nothing new to import — every row already existed and was skipped.");
      }
      setUploadModalOpen(false);
      setDuplicatePrompt(null);
      refreshAll();
    } catch {
      toast.error("Upload failed. Please check your connection and try again.");
    } finally {
      setUploading(false);
    }
  };

  // --- row actions -----------------------------------------------------
  const openView = async (row) => {
    setViewModal({ id: row.id, fileName: row.file_name, rows: [], loading: true });
    try {
      const qs = buildQuery({ fileId: row.id, pageSize: 500 });
      const response = await authFetch(buildApiUrl(`/api/kpi-penalty/records?${qs}`));
      const payload = await response.json();
      setViewModal({
        id: row.id,
        fileName: row.file_name,
        rows: payload.success ? payload.data : [],
        loading: false,
      });
    } catch {
      toast.error("Failed to load records for this file.");
      setViewModal(null);
    }
  };

  const downloadBlob = async (url, fallbackName) => {
    const response = await authFetch(url);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      toast.error(payload.message || "Failed to download file.");
      return;
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fallbackName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  };

  const handleDownload = async (row) => {
    try {
      await downloadBlob(
        buildApiUrl(`/api/kpi-penalty/download/${row.id}`),
        row.file_name || `kpi_penalty_${row.id}.xlsx`
      );
    } catch {
      toast.error("Failed to download file.");
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const qs = buildQuery(filters);
      await downloadBlob(
        buildApiUrl(`/api/kpi-penalty/export?${qs}`),
        `kpi_penalty_export_${todayIso()}.xlsx`
      );
    } catch {
      toast.error("Failed to export data.");
    } finally {
      setExporting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await authFetch(buildApiUrl(`/api/kpi-penalty/uploads/${deleteTarget.id}`), {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(payload.message || "Failed to delete upload.");
        return;
      }
      toast.success("Upload deleted.");
      setDeleteTarget(null);
      refreshAll();
    } catch {
      toast.error("Failed to delete upload.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          
          <h1 className="text-md font-semibold tracking-tight text-text-primary sm:text-xl">KPI Penalty</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">
            Upload, validate and track KPI penalty/reward performance by Circle, CMP and month.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button 
            type="button"
            onClick={refreshAll}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border-color bg-surface px-4 text-sm font-medium text-text-secondary transition hover:bg-surface-muted"
          >
            <RefreshCw size={15} className={loadingRecords || loadingUploads ? "animate-spin" : ""} />
            Refresh Page
          </button>
          {permission.edit ? (
            <button
              type="button"
              onClick={openUploadModal}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-red-500 px-5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
            >
              <Plus size={16} />
              Upload KPI Penalty
            </button>
          ) : null}
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-3 inline-flex items-center gap-1 rounded-xl border border-border-color bg-surface p-1">
        <button
          type="button"
          onClick={() => setActiveTab("data")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            activeTab === "data"
              ? "bg-gradient-to-r from-rose-500 to-red-500 text-white shadow-sm"
              : "text-text-secondary hover:bg-surface-muted"
          }`}
        >
          KPI Penalty Data ({totalRecords})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("files")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            activeTab === "files"
              ? "bg-gradient-to-r from-rose-500 to-red-500 text-white shadow-sm"
              : "text-text-secondary hover:bg-surface-muted"
          }`}
        >
          Uploaded Files ({uploads.length})
        </button>
      </div>

      {activeTab === "data" ? (
        <>
        {/* Filters */}
      <div className={`${CARD_SHELL} mt-2 p-4`}>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
          <Filter size={14} />
          Filters
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto inline-flex items-center gap-1 rounded-full border border-border-color px-2.5 py-1 text-[11px] font-medium normal-case tracking-normal text-text-secondary hover:bg-surface-muted"
            >
              <X size={12} />
              Clear filters
            </button>
          ) : null}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
          <select
            value={filters.month}
            onChange={(e) => updateFilter("month", e.target.value)}
            className="app-select"
          >
            <option value="">All Months</option>
            {monthOptions.map((month) => (
              <option key={month} value={month}>{month}</option>
            ))}
          </select>

          <select
            value={filters.circle}
            onChange={(e) => updateFilter("circle", e.target.value)}
            className="app-select"
          >
            <option value="">All Circles</option>
            {circleData.circles.map((circle) => (
              <option key={circle} value={circle}>{circle}</option>
            ))}
          </select>

          <select
            value={filters.cmp}
            onChange={(e) => updateFilter("cmp", e.target.value)}
            className="app-select"
          >
            <option value="">All CMPs</option>
            {cmpOptions.map((cmp) => (
              <option key={cmp} value={cmp}>{cmp}</option>
            ))}
          </select>

          <select
            value={filters.kpi}
            onChange={(e) => updateFilter("kpi", e.target.value)}
            className="app-select"
          >
            <option value="">All KPIs</option>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>

          <select
            value={filters.uploadedBy}
            onChange={(e) => updateFilter("uploadedBy", e.target.value)}
            className="app-select"
          >
            <option value="">All Uploaded By</option>
            {uploadedByOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>

          <PremiumDatePicker
            value={filters.dateFrom}
            onChange={(value) => updateFilter("dateFrom", value)}
            placeholder="From date"
          />
          <PremiumDatePicker
            value={filters.dateTo}
            onChange={(value) => updateFilter("dateTo", value)}
            placeholder="To date"
          />

          <div className="flex h-10 items-center gap-2 rounded-xl border border-border-color bg-surface px-3">
            <Search size={14} className="text-text-muted" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => updateFilter("search", e.target.value)}
              placeholder="Search circle/CMP/KPI..."
              className="w-full border-0 bg-transparent text-sm text-text-secondary outline-none placeholder:text-text-muted"
            />
          </div>
        </div>
      </div>


      {/* Summary cards */}
      <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <KpiCard
          accentKey="neutral"
          icon={FileSpreadsheet}
          label="Total Records"
          value={loadingSummary ? "…" : formatNumber(summary?.totalRecords ?? 0)}
          loading={loadingSummary && !summary}
        />
        <KpiCard
          accentKey="revenue"
          icon={FileSpreadsheet}
          label="Total CM Billing"
          value={loadingSummary ? "…" : formatCurrency(summary?.totalCmBilling ?? 0)}
          loading={loadingSummary && !summary}
        />
        <KpiCard
          accentKey="penalty"
          icon={AlertTriangle}
          label="Total Penalty Amount"
          value={loadingSummary ? "…" : formatCurrency(summary?.totalPenaltyAmount ?? 0)}
          loading={loadingSummary && !summary}
        />
        <KpiCard
          accentKey="completed"
          icon={FileSpreadsheet}
          label="Total Reward Amount"
          value={loadingSummary ? "…" : formatCurrency(summary?.totalRewardAmount ?? 0)}
          loading={loadingSummary && !summary}
        />
      </div>
        </>
      ) : null}

      {activeTab === "files" ? (
      <div className={`${CARD_SHELL} mt-2 overflow-hidden`}>
        <div className="flex items-center justify-between border-b border-border-color/70 px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Uploaded Files</h2>
          <span className="text-xs text-text-muted">{uploads.length} file{uploads.length === 1 ? "" : "s"}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="bg-surface-muted text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">
                <th className="whitespace-nowrap px-4 py-2.5">Date</th>
                <th className="whitespace-nowrap px-4 py-2.5">Circle</th>
                <th className="whitespace-nowrap px-4 py-2.5">Uploaded By</th>
                <th className="whitespace-nowrap px-4 py-2.5">Uploaded At</th>
                <th className="whitespace-nowrap px-4 py-2.5">File Name</th>
                <th className="whitespace-nowrap px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-color">
              {loadingUploads ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={6} className="px-4 py-3">
                      <div className="h-4 w-full animate-pulse rounded bg-surface-muted" />
                    </td>
                  </tr>
                ))
              ) : uploads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                    No files uploaded yet.
                  </td>
                </tr>
              ) : (
                uploads.map((row) => (
                  <tr key={row.id} className="transition hover:bg-surface-muted/60">
                    <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">{formatDate(row.upload_date)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">
                      {row.circles?.length ? row.circles.join(", ") : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">{row.uploaded_by || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">{formatDateTime(row.uploaded_at)}</td>
                    <td className="max-w-[220px] truncate px-4 py-2.5 text-text-secondary" title={row.file_name}>
                      {row.file_name || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {permission.view ? (
                          <button
                            type="button"
                            onClick={() => openView(row)}
                            title="View"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-color text-text-secondary transition hover:bg-surface-muted"
                          >
                            <Eye size={14} />
                          </button>
                        ) : null}
                        {permission.download ? (
                          <button
                            type="button"
                            onClick={() => handleDownload(row)}
                            title="Download"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-color text-text-secondary transition hover:bg-surface-muted"
                          >
                            <Download size={14} />
                          </button>
                        ) : null}
                        {permission.delete ? (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget({ id: row.id, fileName: row.file_name })}
                            title="Delete"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 transition hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      ) : null}

      {activeTab === "data" ? (
      <>
      {/* KPI Penalty Data */}
      <div className={`${CARD_SHELL} mt-2 overflow-hidden`}>
        <div className="flex items-center justify-between gap-3 border-b border-border-color/70 px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">KPI Penalty Data</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-muted">{totalRecords} record{totalRecords === 1 ? "" : "s"}</span>
            {permission.download ? (
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-color px-3 text-xs font-semibold text-text-secondary transition hover:bg-surface-muted disabled:opacity-50"
              >
                <Download size={13} />
                {exporting ? "Exporting..." : "Export Excel"}
              </button>
            ) : null}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="sticky top-0 bg-surface-muted text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">
                <th className="whitespace-nowrap px-3 py-2.5">Month</th>
                <th className="whitespace-nowrap px-3 py-2.5">Circle</th>
                <th className="whitespace-nowrap px-3 py-2.5">CMP</th>
                <th className="whitespace-nowrap px-3 py-2.5">KPI Penalty</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right">Total CM Billing</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right">Score Required</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right">Score Achieved</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right">% Penalty</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right">Penalty Amount</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right">% Reward</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right">Reward Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-color">
              {loadingRecords ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={11} className="px-3 py-3">
                      <div className="h-4 w-full animate-pulse rounded bg-surface-muted" />
                    </td>
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-10 text-center text-text-muted">
                    {hasActiveFilters ? "No records match the selected filters." : "No KPI Penalty data yet — upload a file to get started."}
                  </td>
                </tr>
              ) : (
                records.map((row) => (
                  <tr key={row.id} className="transition hover:bg-surface-muted/60">
                    <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{row.month_label}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{row.circle}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{row.cmp}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-text-primary">{row.kpi_category}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-text-secondary">{formatCurrency(row.total_cm_billing)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-text-secondary">{formatNumber(row.score_required)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-text-secondary">{formatNumber(row.score_achieved)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-text-secondary">{formatPercent(row.percent_penalty)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-rose-600 dark:text-rose-400">{formatCurrency(row.penalty_amount)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-text-secondary">{formatPercent(row.percent_reward)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-emerald-700 dark:text-emerald-400">{formatCurrency(row.reward_amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-border-color px-4 py-3">
            <span className="text-xs text-text-muted">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page === 1}
                className="inline-flex h-8 items-center rounded-lg border border-border-color px-3 text-xs font-medium text-text-secondary disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page === totalPages}
                className="inline-flex h-8 items-center rounded-lg border border-border-color px-3 text-xs font-medium text-text-secondary disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
      </>
      ) : null}

      {/* Upload modal */}
      {uploadModalOpen ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close"
            onClick={closeUploadModal}
            className="absolute inset-0 h-full w-full cursor-default bg-overlay/50 backdrop-blur-sm"
          />

          <div className="animate-modal-enter relative z-10 w-full max-w-[560px] overflow-hidden rounded-[22px] border border-border-color/80 bg-surface shadow-[0_30px_90px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between gap-3 border-b border-border-color/70 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Upload KPI Penalty</h2>
                <p className="mt-1 text-xs text-text-muted">
                  Excel columns expected: Month, Circle, CMP, KPIs Penalty, Total CM Billing, Score Required, Score Achieved, % Penalty, Penalty Amount, % Reward, Reward Amount.
                </p>
              </div>
              <button
                type="button"
                onClick={closeUploadModal}
                disabled={uploading}
                className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-border-color bg-surface text-text-secondary hover:bg-surface-muted disabled:opacity-40"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              {duplicatePrompt ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                  <div className="flex items-start gap-2">
                    <Info size={16} className="mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">{duplicatePrompt.message}</p>
                      <p className="mt-1 text-xs opacity-80">
                        Replace will overwrite the matching Month/Circle/CMP/KPI rows. Skip will import only the new rows.
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setDuplicatePrompt(null)}
                      disabled={uploading}
                      className="inline-flex h-9 items-center rounded-full border border-border-strong bg-surface px-4 text-xs font-medium text-text-secondary hover:bg-surface-muted disabled:opacity-40"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => submitUpload("skip")}
                      disabled={uploading}
                      className="inline-flex h-9 items-center rounded-full border border-border-strong bg-surface px-4 text-xs font-semibold text-text-primary hover:bg-surface-muted disabled:opacity-40"
                    >
                      Skip duplicates
                    </button>
                    <button
                      type="button"
                      onClick={() => submitUpload("replace")}
                      disabled={uploading}
                      className="inline-flex h-9 items-center rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-4 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-40"
                    >
                      Replace duplicates
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Date</label>
                    <PremiumDatePicker
                      value={uploadForm.date}
                      onChange={(value) => setUploadForm((prev) => ({ ...prev, date: value }))}
                    />
                    {attemptedSubmit && !uploadForm.date ? (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">Date is required.</p>
                    ) : null}
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Uploaded By</label>
                    <input
                      type="text"
                      value={uploadForm.uploadedBy}
                      onChange={(e) => setUploadForm((prev) => ({ ...prev, uploadedBy: e.target.value }))}
                      placeholder="Person uploading this file"
                      className="app-input w-full"
                    />
                    {attemptedSubmit && !uploadForm.uploadedBy.trim() ? (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">Uploaded By is required.</p>
                    ) : null}
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">Upload File</label>
                      <a
                        href="/formats/kpi_penalty_format.xlsx"
                        download
                        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        <Download size={12} />
                        Download format
                      </a>
                    </div>
                    <div className="relative flex h-28 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-border-color bg-surface-muted/40 text-center">
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={(e) => setUploadForm((prev) => ({ ...prev, file: e.target.files?.[0] || null }))}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      />
                      <UploadCloud size={22} className="text-text-muted" />
                      <p className="text-xs text-text-secondary">
                        {uploadForm.file ? uploadForm.file.name : "Click or drag an .xlsx, .xls or .csv file"}
                      </p>
                    </div>
                    {attemptedSubmit && !uploadForm.file ? (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">Please choose a file to upload.</p>
                    ) : null}
                  </div>
                </>
              )}
            </div>

            {!duplicatePrompt ? (
              <div className="flex items-center justify-end gap-2 border-t border-border-color/70 bg-surface-muted/40 px-5 py-4">
                <button
                  type="button"
                  onClick={closeUploadModal}
                  disabled={uploading}
                  className="inline-flex h-10 items-center rounded-full border border-border-strong bg-surface px-5 text-sm font-medium text-text-secondary hover:bg-surface-muted disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => submitUpload()}
                  disabled={uploading}
                  className="inline-flex h-10 min-w-[120px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-red-500 px-5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uploading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Uploading...
                    </>
                  ) : (
                    "Upload"
                  )}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Upload validation error dialog (structured row-level errors) */}
      {uploadErrorPayload ? (
        <ReportUploadErrorDialog payload={uploadErrorPayload} onClose={() => setUploadErrorPayload(null)} />
      ) : null}

      {/* View file modal */}
      {viewModal ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setViewModal(null)}
            className="absolute inset-0 h-full w-full cursor-default bg-overlay/50 backdrop-blur-sm"
          />
          <div className="animate-modal-enter relative z-10 flex max-h-[85vh] w-full max-w-[1000px] flex-col overflow-hidden rounded-[22px] border border-border-color/80 bg-surface shadow-[0_30px_90px_rgba(15,23,42,0.22)]">
            <div className="flex items-center justify-between border-b border-border-color/70 px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-text-primary">Records in this file</h2>
                <p className="truncate text-xs text-text-muted">{viewModal.fileName}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewModal(null)}
                className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-border-color bg-surface text-text-secondary hover:bg-surface-muted"
              >
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="sticky top-0 bg-surface-muted font-semibold uppercase tracking-wide text-text-muted">
                    <th className="whitespace-nowrap px-3 py-2">Month</th>
                    <th className="whitespace-nowrap px-3 py-2">Circle</th>
                    <th className="whitespace-nowrap px-3 py-2">CMP</th>
                    <th className="whitespace-nowrap px-3 py-2">KPI</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">Total CM Billing</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">Penalty Amount</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">Reward Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-color">
                  {viewModal.loading ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-text-muted">Loading…</td>
                    </tr>
                  ) : viewModal.rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-text-muted">No records found.</td>
                    </tr>
                  ) : (
                    viewModal.rows.map((row) => (
                      <tr key={row.id}>
                        <td className="whitespace-nowrap px-3 py-2">{row.month_label}</td>
                        <td className="whitespace-nowrap px-3 py-2">{row.circle}</td>
                        <td className="whitespace-nowrap px-3 py-2">{row.cmp}</td>
                        <td className="whitespace-nowrap px-3 py-2">{row.kpi_category}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">{formatCurrency(row.total_cm_billing)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">{formatCurrency(row.penalty_amount)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">{formatCurrency(row.reward_amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this upload?"
        description={`This will permanently delete "${deleteTarget?.fileName || ""}" and every KPI Penalty record that came from it. This cannot be undone.`}
        confirmLabel="Delete"
        tone="danger"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />
    </div>
  );
}

export default KpiPenalty;
