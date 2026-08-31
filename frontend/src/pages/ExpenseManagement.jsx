import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CreditCard,
  ChevronDown,
  Download,
  Eye,
  FileSpreadsheet,
  Filter,
  Info,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Target,
  Trash2,
  UploadCloud,
  Wallet,
  X,
  XCircle,
} from "lucide-react";

import { useUser } from "../context/UserContext";
import { getPagePermission } from "../utils/access";
import { authFetch, buildApiUrl } from "../lib/api";
import { fetchCircles } from "../lib/circles";
import KpiCard from "../components/billingDashboard/KpiCard";
import TrendChart from "../components/billingDashboard/TrendChart";
import { CARD_SHELL, statusColor } from "../components/billingDashboard/theme";
import ConfirmDialog from "../components/ConfirmDialog";
import ReportUploadErrorDialog from "../components/ReportUploadErrorDialog";
import PremiumDatePicker from "../components/PremiumDatePicker";
import {
  buildQuery,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatIndianCompact,
  todayIso,
} from "../utils/penaltyFormat";

const PAGE_ID = "expense-management";
const PAGE_SIZE = 50;

const EMPTY_UPLOAD_FORM = { date: todayIso(), uploadedBy: "", file: null };
const EMPTY_FILTERS = {
  month: "", circle: "", cmp: "", category: "", status: "", search: "",
};

const FILTER_LABELS = {
  month: "Month", circle: "Circle", cmp: "CMP",
  category: "Category", status: "Status", search: "Search",
};

const STATUS_META = {
  pending: { label: "Pending", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-500/10", border: "border-amber-200 dark:border-amber-500/20" },
  approved: { label: "Approved", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10", border: "border-emerald-200 dark:border-emerald-500/20" },
  rejected: { label: "Rejected", dot: "bg-rose-500", text: "text-rose-700 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-500/10", border: "border-rose-200 dark:border-rose-500/20" },
  paid: { label: "Paid", dot: "bg-blue-500", text: "text-blue-700 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-500/10", border: "border-blue-200 dark:border-blue-500/20" },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold ${meta.bg} ${meta.border} ${meta.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

const DETAIL_COLUMNS = [
  { key: "sr_no", label: "Sr No", align: "left", defaultVisible: false },
  { key: "month_label", label: "Month", align: "left", defaultVisible: true },
  { key: "circle", label: "Circle", align: "left", defaultVisible: true },
  { key: "cmp", label: "CMP", align: "left", defaultVisible: true },
  { key: "domain", label: "Domain", align: "left", defaultVisible: true },
  { key: "expense_category", label: "Category", align: "left", defaultVisible: true },
  { key: "expense_type", label: "Expense Type", align: "left", defaultVisible: true },
  { key: "description", label: "Description", align: "left", defaultVisible: false },
  { key: "vendor", label: "Vendor", align: "left", defaultVisible: true },
  { key: "bill_no", label: "Bill No", align: "left", defaultVisible: true },
  { key: "expense_date", label: "Expense Date", align: "left", defaultVisible: true },
  { key: "amount", label: "Amount", align: "right", defaultVisible: true },
  { key: "gst", label: "GST", align: "right", defaultVisible: false },
  { key: "total_amount", label: "Total Amount", align: "right", defaultVisible: true },
  { key: "status", label: "Status", align: "left", defaultVisible: true },
  { key: "remarks", label: "Remarks", align: "left", defaultVisible: false },
];

const DEFAULT_COLUMN_VISIBILITY = DETAIL_COLUMNS.reduce((acc, col) => {
  acc[col.key] = col.defaultVisible;
  return acc;
}, {});

function renderCell(row, key) {
  switch (key) {
    case "expense_date":
      return formatDate(row.expense_date);
    case "amount":
      return formatCurrency(row.amount);
    case "gst":
      return formatCurrency(row.gst);
    case "total_amount":
      return formatCurrency(row.total_amount);
    case "status":
      return <StatusBadge status={row.status} />;
    default:
      return row[key] || "—";
  }
}

function useOutsideClick(onOutside) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onOutside();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onOutside]);
  return ref;
}

function ExpenseManagement() {
  const { user } = useUser();
  const permission = useMemo(() => getPagePermission(user, PAGE_ID), [user]);

  // --- master data -------------------------------------------------------
  const [meta, setMeta] = useState({ categories: [], domains: [], statuses: [], vendors: [], expenseTypes: [] });
  const [circleData, setCircleData] = useState({ circles: [], circleCmpMap: {} });
  const [monthOptions, setMonthOptions] = useState([]);

  // --- filters -------------------------------------------------------------
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  // --- data ------------------------------------------------------------------
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [records, setRecords] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [uploads, setUploads] = useState([]);
  const [loadingUploads, setLoadingUploads] = useState(false);
  const [activeTab, setActiveTab] = useState("data");

  // --- upload modal ------------------------------------------------------
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState(EMPTY_UPLOAD_FORM);
  const [uploading, setUploading] = useState(false);
  const [uploadErrorPayload, setUploadErrorPayload] = useState(null);
  const [duplicatePrompt, setDuplicatePrompt] = useState(null);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);

  // --- view / edit / delete modals ---------------------------------------
  const [viewModal, setViewModal] = useState(null);
  const [editRecord, setEditRecord] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteRecordTarget, setDeleteRecordTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // --- export menu ---------------------------------------------------------
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportMenuRef = useOutsideClick(() => setExportMenuOpen(false));

  // --- column visibility ---------------------------------------------------
  const [columnVisibility, setColumnVisibility] = useState(DEFAULT_COLUMN_VISIBILITY);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const columnMenuRef = useOutsideClick(() => setColumnMenuOpen(false));

  // --- budget modal --------------------------------------------------------
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [budgetForm, setBudgetForm] = useState({ monthDate: "", budgetAmount: "" });
  const [savingBudget, setSavingBudget] = useState(false);

  // --- fetchers --------------------------------------------------------------
  const fetchMeta = useCallback(async () => {
    try {
      const response = await authFetch(buildApiUrl("/api/expenses/meta"));
      const payload = await response.json();
      if (payload.success) setMeta(payload.data);
    } catch {
      // Non-fatal — the filter dropdowns just stay empty.
    }
  }, []);

  const loadCircles = useCallback(async () => {
    try {
      const data = await fetchCircles();
      setCircleData(data);
    } catch {
      // Non-fatal.
    }
  }, []);

  const fetchUploads = useCallback(async () => {
    setLoadingUploads(true);
    try {
      const response = await authFetch(buildApiUrl("/api/expenses/uploads"));
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
      const response = await authFetch(buildApiUrl(`/api/expenses/records?${qs}`));
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
      toast.error("Failed to load Expense data.");
    } finally {
      setLoadingRecords(false);
    }
  }, [filters, page]);

  const fetchSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const qs = buildQuery(filters);
      const response = await authFetch(buildApiUrl(`/api/expenses/summary?${qs}`));
      const payload = await response.json();
      if (payload.success) setSummary(payload.data);
    } catch {
      // Summary cards just keep showing the last known values.
    } finally {
      setLoadingSummary(false);
    }
  }, [filters]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMeta();
    loadCircles();
    fetchUploads();
  }, [fetchMeta, loadCircles, fetchUploads]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRecords();
  }, [fetchRecords]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSummary();
  }, [fetchSummary]);

  const refreshAll = () => {
    fetchMeta();
    fetchUploads();
    fetchRecords();
    fetchSummary();
  };

  // --- derived options -----------------------------------------------------
  const cmpOptions = useMemo(() => {
    if (draftFilters.circle && circleData.circleCmpMap[draftFilters.circle]) {
      return circleData.circleCmpMap[draftFilters.circle];
    }
    return [...new Set(Object.values(circleData.circleCmpMap).flat())].sort();
  }, [draftFilters.circle, circleData]);

  const updateDraft = (key, value) => setDraftFilters((prev) => ({ ...prev, [key]: value }));

  const resetFilters = () => {
    setPage(1);
    setDraftFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
  };

  const removeFilter = (key) => {
    setPage(1);
    setDraftFilters((prev) => ({ ...prev, [key]: "" }));
    setFilters((prev) => ({ ...prev, [key]: "" }));
  };

  const setFilterAndApply = (key, value) => {
    setPage(1);
    setDraftFilters((prev) => ({ ...prev, [key]: value }));
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const hasActiveFilters = Object.values(filters).some(Boolean);
  const activeFilterChips = Object.entries(filters)
    .filter(([, value]) => value)
    .map(([key, value]) => ({ key, label: FILTER_LABELS[key], value }));
  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));

  // --- upload modal handlers -------------------------------------------
  const openUploadModal = () => {
    setUploadForm({ date: todayIso(), uploadedBy: user?.name || user?.username || "", file: null });
    setUploadErrorPayload(null);
    setDuplicatePrompt(null);
    setAttemptedSubmit(false);
    setUploadResult(null);
    setUploadModalOpen(true);
  };

  const closeUploadModal = () => {
    if (uploading) return;
    setUploadModalOpen(false);
    setDuplicatePrompt(null);
    if (uploadResult) refreshAll();
    setUploadResult(null);
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

      const response = await authFetch(buildApiUrl("/api/expenses/upload"), {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));

      if (response.status === 409 && payload.duplicate) {
        setDuplicatePrompt({ count: payload.duplicates?.length || 0, message: payload.message });
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

      setDuplicatePrompt(null);
      setUploadResult({
        totalRows: payload.totalRows || 0,
        importedRows: payload.importedRows || payload.upload?.totalRecords || 0,
        duplicateRows: payload.duplicateRows || 0,
        invalidRows: payload.invalidRows || 0,
        totalAmount: payload.upload?.totalAmount || 0,
      });
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
      const response = await authFetch(buildApiUrl(`/api/expenses/records?${qs}`));
      const payload = await response.json();
      setViewModal({ id: row.id, fileName: row.file_name, rows: payload.success ? payload.data : [], loading: false });
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
      await downloadBlob(buildApiUrl(`/api/expenses/download/${row.id}`), row.file_name || `expense_${row.id}.xlsx`);
    } catch {
      toast.error("Failed to download file.");
    }
  };

  const handleExport = async (type) => {
    setExportMenuOpen(false);
    setExporting(true);
    try {
      const qs = buildQuery({ ...(type === "filtered" || type === "summary" || type === "report" ? filters : {}), type });
      await downloadBlob(buildApiUrl(`/api/expenses/export?${qs}`), `expense_${type}_${todayIso()}.xlsx`);
    } catch {
      toast.error("Failed to export data.");
    } finally {
      setExporting(false);
    }
  };

  const confirmDeleteUpload = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await authFetch(buildApiUrl(`/api/expenses/uploads/${deleteTarget.id}`), { method: "DELETE" });
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

  const confirmDeleteRecord = async () => {
    if (!deleteRecordTarget) return;
    setDeleting(true);
    try {
      const response = await authFetch(buildApiUrl(`/api/expenses/records/${deleteRecordTarget.id}`), { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(payload.message || "Failed to delete record.");
        return;
      }
      toast.success("Record deleted.");
      setDeleteRecordTarget(null);
      refreshAll();
    } catch {
      toast.error("Failed to delete record.");
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = (row) => {
    setEditRecord(row);
    setEditForm({
      expenseCategory: row.expense_category,
      expenseType: row.expense_type,
      description: row.description || "",
      vendor: row.vendor || "",
      billNo: row.bill_no || "",
      amount: row.amount,
      gst: row.gst || 0,
      status: row.status,
      remarks: row.remarks || "",
    });
  };

  const saveEdit = async () => {
    if (!editRecord) return;
    setSavingEdit(true);
    try {
      const response = await authFetch(buildApiUrl(`/api/expenses/records/${editRecord.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(payload.message || "Failed to update record.");
        return;
      }
      toast.success("Record updated.");
      setEditRecord(null);
      setEditForm(null);
      refreshAll();
    } catch {
      toast.error("Failed to update record.");
    } finally {
      setSavingEdit(false);
    }
  };

  const openBudgetModal = () => {
    const now = new Date();
    setBudgetForm({
      monthDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
      budgetAmount: "",
    });
    setBudgetModalOpen(true);
  };

  const saveBudget = async () => {
    if (!budgetForm.monthDate || budgetForm.budgetAmount === "") {
      toast.error("Please fill in Month and Budget Amount.");
      return;
    }
    setSavingBudget(true);
    try {
      const response = await authFetch(buildApiUrl("/api/expenses/budgets"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthDate: `${budgetForm.monthDate}-01`,
          budgetAmount: Number(budgetForm.budgetAmount),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(payload.message || "Failed to save budget.");
        return;
      }
      toast.success("Budget saved.");
      setBudgetModalOpen(false);
      fetchSummary();
    } catch {
      toast.error("Failed to save budget.");
    } finally {
      setSavingBudget(false);
    }
  };

  // --- insights (derived purely from summary, nothing hard-coded) --------
  const insights = useMemo(() => {
    if (!summary) return null;
    const topCategory = summary.byCategory?.[0];
    const topCircle = summary.byCircle?.[0];
    const topCmp = summary.byCmp?.[0];
    const momChange =
      summary.previousMonth > 0
        ? Number((((summary.thisMonth - summary.previousMonth) / summary.previousMonth) * 100).toFixed(1))
        : null;
    return { topCategory, topCircle, topCmp, momChange, budget: summary.budget };
  }, [summary]);

  const trendSeries = useMemo(
    () =>
      (summary?.byMonth || []).map((row) => ({
        month: row.monthLabel,
        hasData: true,
        value: Number((Number(row.amount || 0) / 100000).toFixed(2)),
      })),
    [summary]
  );

  const isEmpty = !loadingRecords && !loadingSummary && totalRecords === 0 && !hasActiveFilters;

  return (
    <div className="">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-md font-semibold tracking-tight text-text-primary sm:text-xl">Expense Management</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">
            Track, analyse and manage telecom operational expenses
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={refreshAll}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border-color bg-surface px-4 text-sm font-medium text-text-secondary transition hover:bg-surface-muted"
          >
            <RefreshCw size={15} className={loadingRecords || loadingSummary ? "animate-spin" : ""} />
            Refresh
          </button>
          <a
            href="/formats/expense_management_format.xlsx"
            download
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border-color bg-surface px-4 text-sm font-medium text-text-secondary transition hover:bg-surface-muted"
          >
            <Download size={15} />
            Template
          </a>
          {permission.download ? (
            <div ref={exportMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setExportMenuOpen((prev) => !prev)}
                disabled={exporting}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border-color bg-surface px-4 text-sm font-medium text-text-secondary transition hover:bg-surface-muted disabled:opacity-50"
              >
                <Download size={15} />
                {exporting ? "Exporting..." : "Export"}
                <ChevronDown size={14} />
              </button>
              {exportMenuOpen ? (
                <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-border-color bg-surface shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
                  {[
                    { type: "filtered", label: "Current Filtered Data" },
                    { type: "all", label: "All Expense Data" },
                    { type: "summary", label: "Expense Summary" },
                    { type: "report", label: "Expense Report" },
                  ].map((option) => (
                    <button
                      key={option.type}
                      type="button"
                      onClick={() => handleExport(option.type)}
                      className="block w-full px-4 py-2.5 text-left text-sm text-text-secondary transition hover:bg-surface-muted"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {permission.edit ? (
            <button
              type="button"
              onClick={openUploadModal}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-red-500 px-5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
            >
              <Plus size={16} />
              Upload Expense File
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
            activeTab === "data" ? "bg-gradient-to-r from-rose-500 to-red-500 text-white shadow-sm" : "text-text-secondary hover:bg-surface-muted"
          }`}
        >
          Expense Data ({totalRecords})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("files")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            activeTab === "files" ? "bg-gradient-to-r from-rose-500 to-red-500 text-white shadow-sm" : "text-text-secondary hover:bg-surface-muted"
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
                  onClick={resetFilters}
                  className="ml-auto inline-flex items-center gap-1 rounded-full border border-border-color px-2.5 py-1 text-[11px] font-medium normal-case tracking-normal text-text-secondary hover:bg-surface-muted"
                >
                  <X size={12} />
                  Reset filters
                </button>
              ) : null}
            </div>

            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <select value={draftFilters.month} onChange={(e) => setFilterAndApply("month", e.target.value)} className="app-select">
                <option value="">All Months</option>
                {monthOptions.map((month) => (<option key={month} value={month}>{month}</option>))}
              </select>

              <select value={draftFilters.circle} onChange={(e) => setFilterAndApply("circle", e.target.value)} className="app-select">
                <option value="">All Circles</option>
                {circleData.circles.map((circle) => (<option key={circle} value={circle}>{circle}</option>))}
              </select>

              <select value={draftFilters.cmp} onChange={(e) => setFilterAndApply("cmp", e.target.value)} className="app-select">
                <option value="">All CMPs</option>
                {cmpOptions.map((cmp) => (<option key={cmp} value={cmp}>{cmp}</option>))}
              </select>

              <select value={draftFilters.category} onChange={(e) => setFilterAndApply("category", e.target.value)} className="app-select">
                <option value="">All Categories</option>
                {meta.categories.map((category) => (<option key={category} value={category}>{category}</option>))}
              </select>

              <select value={draftFilters.status} onChange={(e) => setFilterAndApply("status", e.target.value)} className="app-select">
                <option value="">All Statuses</option>
                {meta.statuses.map((status) => (
                  <option key={status} value={status}>{STATUS_META[status]?.label || status}</option>
                ))}
              </select>

              <div className="flex h-10 items-center gap-2 rounded-xl border border-border-color bg-surface px-3">
                <Search size={14} className="text-text-muted" />
                <input
                  type="text"
                  value={draftFilters.search}
                  onChange={(e) => updateDraft("search", e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") setFilterAndApply("search", draftFilters.search); }}
                  onBlur={() => { if (draftFilters.search !== filters.search) setFilterAndApply("search", draftFilters.search); }}
                  placeholder="Search vendor/bill/description... (Enter)"
                  className="w-full border-0 bg-transparent text-sm text-text-secondary outline-none placeholder:text-text-muted"
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex h-9 items-center justify-center rounded-full border border-border-color bg-surface px-5 text-xs font-medium text-text-secondary hover:bg-surface-muted"
              >
                Reset Filters
              </button>
            </div>

            {activeFilterChips.length ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-color/70 pt-3">
                {activeFilterChips.map((chip) => (
                  <span
                    key={chip.key}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border-color bg-surface-muted px-3 py-1 text-[11px] font-medium text-text-secondary"
                  >
                    {chip.label}: {chip.value}
                    <button type="button" onClick={() => removeFilter(chip.key)} className="text-text-muted hover:text-text-primary">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {isEmpty ? (
            <div className={`${CARD_SHELL} mt-2 flex flex-col items-center justify-center gap-3 px-6 py-16 text-center`}>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
                <Wallet size={26} />
              </div>
              <h3 className="text-base font-semibold text-text-primary">No Expense Data Available</h3>
              <p className="max-w-sm text-sm text-text-muted">
                Upload an Expense Excel file to start managing telecom expenses.
              </p>
              {permission.edit ? (
                <button
                  type="button"
                  onClick={openUploadModal}
                  className="mt-2 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-red-500 px-5 text-sm font-semibold text-white shadow-sm hover:opacity-95"
                >
                  <Plus size={16} />
                  Upload Expense File
                </button>
              ) : null}
            </div>
          ) : (
            <>
              {/* KPI cards */}
              <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-5">
                <KpiCard compact accentKey="neutral" icon={Wallet} label="Total Expense" value={loadingSummary ? "…" : formatIndianCompact(summary?.total ?? 0)} loading={loadingSummary && !summary} />
                <KpiCard compact accentKey="completed" icon={CheckCircle2} label="Approved Expense" value={loadingSummary ? "…" : formatIndianCompact(summary?.approved ?? 0)} loading={loadingSummary && !summary} />
                <KpiCard compact accentKey="pending" icon={Clock} label="Pending Expense" value={loadingSummary ? "…" : formatIndianCompact(summary?.pending ?? 0)} loading={loadingSummary && !summary} />
                <KpiCard compact accentKey="penalty" icon={XCircle} label="Rejected Expense" value={loadingSummary ? "…" : formatIndianCompact(summary?.rejected ?? 0)} loading={loadingSummary && !summary} />
                <KpiCard compact accentKey="pmLoss" icon={CreditCard} label="Paid Expense" value={loadingSummary ? "…" : formatIndianCompact(summary?.paid ?? 0)} loading={loadingSummary && !summary} />
              </div>

              {/* Monthly Expense Trend */}
              <div className={`${CARD_SHELL} mt-2 p-5`}>
                <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-text-muted">Monthly Expense Trend</div>
                {trendSeries.length ? (
                  <div className="mt-3">
                    <TrendChart series={trendSeries} color="#ef4444" unit="L" />
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-dashed border-border-color px-3 py-8 text-center text-xs text-text-muted">
                    No trend data for the selected filters.
                  </div>
                )}
              </div>

              {/* Breakdown grids: Category / Circle / CMP */}
              <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-3">
                <BreakdownCard title="Expense by Category" rows={summary?.byCategory} onSelect={(name) => setFilterAndApply("category", name)} />
                <BreakdownCard title="Expense by Circle" rows={summary?.byCircle} onSelect={(name) => setFilterAndApply("circle", name)} />
                <BreakdownCard title="Expense by CMP" rows={summary?.byCmp} onSelect={(name) => setFilterAndApply("cmp", name)} />
              </div>

              {/* Budget vs Actual */}
              <div className={`${CARD_SHELL} mt-2 p-5`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-text-muted">Budget vs Actual</div>
                  {permission.edit ? (
                    <button
                      type="button"
                      onClick={openBudgetModal}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-color px-3 text-xs font-semibold text-text-secondary transition hover:bg-surface-muted"
                    >
                      <Target size={13} />
                      Set Budget
                    </button>
                  ) : null}
                </div>

                {summary?.budget?.budgetTotal ? (
                  <div className="mt-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <BudgetStat label="Budget" value={formatIndianCompact(summary.budget.budgetTotal)} />
                      <BudgetStat label="Actual" value={formatIndianCompact(summary.budget.actualTotal)} />
                      <BudgetStat
                        label="Remaining"
                        value={formatIndianCompact(summary.budget.remaining)}
                        tone={summary.budget.remaining < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}
                      />
                      <BudgetStat label="Utilization" value={`${summary.budget.utilizationPercent}%`} />
                    </div>
                    <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className={`h-full rounded-full ${statusColor(100 - Math.min(summary.budget.utilizationPercent, 100)).bar}`}
                        style={{ width: `${Math.min(summary.budget.utilizationPercent, 100)}%` }}
                      />
                    </div>
                    {summary.budget.overBudget ? (
                      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400">
                        <AlertTriangle size={13} />
                        Over Budget
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-dashed border-border-color px-3 py-6 text-center text-xs text-text-muted">
                    No budget configured for the selected filters yet.
                  </div>
                )}
              </div>

              {/* Insights */}
              {insights ? (
                <div className={`${CARD_SHELL} mt-2 p-5`}>
                  <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-text-muted">Expense Insights</div>
                  <ul className="mt-3 space-y-2 text-sm text-text-secondary">
                    {insights.topCategory ? (
                      <li>
                        <span className="font-semibold text-text-primary">Highest Expense Category:</span>{" "}
                        {insights.topCategory.name} — {formatIndianCompact(insights.topCategory.amount)}
                      </li>
                    ) : null}
                    {insights.topCircle ? (
                      <li>
                        <span className="font-semibold text-text-primary">Highest Expense Circle:</span>{" "}
                        {insights.topCircle.name} — {formatIndianCompact(insights.topCircle.amount)}
                      </li>
                    ) : null}
                    {insights.topCmp ? (
                      <li>
                        <span className="font-semibold text-text-primary">Highest Expense CMP:</span>{" "}
                        {insights.topCmp.name} — {formatIndianCompact(insights.topCmp.amount)}
                      </li>
                    ) : null}
                    {insights.momChange !== null ? (
                      <li>
                        <span className="font-semibold text-text-primary">Month-on-Month Change:</span>{" "}
                        Expense {insights.momChange >= 0 ? "increased" : "decreased"} by {Math.abs(insights.momChange)}%.
                      </li>
                    ) : null}
                    {insights.budget?.budgetTotal ? (
                      <li>
                        <span className="font-semibold text-text-primary">Budget Status:</span>{" "}
                        {insights.budget.remaining >= 0
                          ? `${formatIndianCompact(insights.budget.remaining)} remaining.`
                          : `${formatIndianCompact(Math.abs(insights.budget.remaining))} over budget.`}
                      </li>
                    ) : null}
                    {!insights.topCategory ? (
                      <li className="text-text-muted">Not enough data yet to compute insights.</li>
                    ) : null}
                  </ul>
                </div>
              ) : null}

              {/* Top 10 Expenses */}
              <div className={`${CARD_SHELL} mt-2 overflow-hidden`}>
                <div className="border-b border-border-color/70 px-4 py-3">
                  <h2 className="text-sm font-semibold text-text-primary">Top 10 Expenses</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="bg-surface-muted text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">
                        <th className="whitespace-nowrap px-3 py-2.5">Category</th>
                        <th className="whitespace-nowrap px-3 py-2.5">Expense Type</th>
                        <th className="whitespace-nowrap px-3 py-2.5">Circle</th>
                        <th className="whitespace-nowrap px-3 py-2.5">CMP</th>
                        <th className="whitespace-nowrap px-3 py-2.5">Vendor</th>
                        <th className="whitespace-nowrap px-3 py-2.5">Bill No</th>
                        <th className="whitespace-nowrap px-3 py-2.5 text-right">Amount</th>
                        <th className="whitespace-nowrap px-3 py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-color">
                      {(summary?.topExpenses || []).length === 0 ? (
                        <tr><td colSpan={8} className="px-3 py-8 text-center text-text-muted">No expenses yet.</td></tr>
                      ) : (
                        summary.topExpenses.map((row) => (
                          <tr key={row.id} className="transition hover:bg-surface-muted/60">
                            <td className="whitespace-nowrap px-3 py-2 font-medium text-text-primary">{row.expense_category}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{row.expense_type}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{row.circle}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{row.cmp}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{row.vendor || "—"}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{row.bill_no || "—"}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-text-primary">{formatCurrency(row.total_amount)}</td>
                            <td className="whitespace-nowrap px-3 py-2"><StatusBadge status={row.status} /></td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pending Expenses */}
              <div className={`${CARD_SHELL} mt-2 overflow-hidden`}>
                <div className="border-b border-border-color/70 px-4 py-3">
                  <h2 className="text-sm font-semibold text-text-primary">Pending Expenses</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="bg-surface-muted text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">
                        <th className="whitespace-nowrap px-3 py-2.5">Bill No</th>
                        <th className="whitespace-nowrap px-3 py-2.5">Vendor</th>
                        <th className="whitespace-nowrap px-3 py-2.5">Circle</th>
                        <th className="whitespace-nowrap px-3 py-2.5">CMP</th>
                        <th className="whitespace-nowrap px-3 py-2.5">Category</th>
                        <th className="whitespace-nowrap px-3 py-2.5 text-right">Amount</th>
                        <th className="whitespace-nowrap px-3 py-2.5">Expense Date</th>
                        <th className="whitespace-nowrap px-3 py-2.5">Status</th>
                        <th className="whitespace-nowrap px-3 py-2.5">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-color">
                      {(summary?.pendingExpenses || []).length === 0 ? (
                        <tr><td colSpan={9} className="px-3 py-8 text-center text-text-muted">No pending expenses.</td></tr>
                      ) : (
                        summary.pendingExpenses.map((row) => (
                          <tr key={row.id} className="transition hover:bg-surface-muted/60">
                            <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{row.bill_no || "—"}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{row.vendor || "—"}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{row.circle}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{row.cmp}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{row.expense_category}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-text-primary">{formatCurrency(row.total_amount)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{formatDate(row.expense_date)}</td>
                            <td className="whitespace-nowrap px-3 py-2"><StatusBadge status={row.status} /></td>
                            <td className="max-w-[180px] truncate px-3 py-2 text-text-secondary" title={row.remarks}>{row.remarks || "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Detailed Expense Data */}
              <div className={`${CARD_SHELL} mt-2 overflow-hidden`}>
                <div className="flex items-center justify-between gap-3 border-b border-border-color/70 px-4 py-3">
                  <h2 className="text-sm font-semibold text-text-primary">Detailed Expense Data</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted">{totalRecords} record{totalRecords === 1 ? "" : "s"}</span>
                    <div ref={columnMenuRef} className="relative">
                      <button
                        type="button"
                        onClick={() => setColumnMenuOpen((prev) => !prev)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-color px-3 text-xs font-semibold text-text-secondary transition hover:bg-surface-muted"
                      >
                        <SlidersHorizontal size={13} />
                        Columns
                      </button>
                      {columnMenuOpen ? (
                        <div className="absolute right-0 z-20 mt-2 max-h-72 w-48 overflow-y-auto rounded-2xl border border-border-color bg-surface p-2 shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
                          {DETAIL_COLUMNS.map((col) => (
                            <label key={col.key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-text-secondary hover:bg-surface-muted">
                              <input
                                type="checkbox"
                                checked={columnVisibility[col.key]}
                                onChange={() => setColumnVisibility((prev) => ({ ...prev, [col.key]: !prev[col.key] }))}
                              />
                              {col.label}
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {permission.download ? (
                      <button
                        type="button"
                        onClick={() => handleExport("filtered")}
                        disabled={exporting}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-color px-3 text-xs font-semibold text-text-secondary transition hover:bg-surface-muted disabled:opacity-50"
                      >
                        <Download size={13} />
                        Export
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="sticky top-0 bg-surface-muted text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">
                        {DETAIL_COLUMNS.filter((col) => columnVisibility[col.key]).map((col) => (
                          <th key={col.key} className={`whitespace-nowrap px-3 py-2.5 ${col.align === "right" ? "text-right" : "text-left"}`}>
                            {col.label}
                          </th>
                        ))}
                        <th className="whitespace-nowrap px-3 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-color">
                      {loadingRecords ? (
                        Array.from({ length: 6 }).map((_, index) => (
                          <tr key={index}>
                            <td colSpan={DETAIL_COLUMNS.filter((c) => columnVisibility[c.key]).length + 1} className="px-3 py-3">
                              <div className="h-4 w-full animate-pulse rounded bg-surface-muted" />
                            </td>
                          </tr>
                        ))
                      ) : records.length === 0 ? (
                        <tr>
                          <td colSpan={DETAIL_COLUMNS.filter((c) => columnVisibility[c.key]).length + 1} className="px-3 py-10 text-center text-text-muted">
                            {hasActiveFilters ? "No records match the selected filters." : "No Expense data yet — upload a file to get started."}
                          </td>
                        </tr>
                      ) : (
                        records.map((row) => (
                          <tr key={row.id} className="transition hover:bg-surface-muted/60">
                            {DETAIL_COLUMNS.filter((col) => columnVisibility[col.key]).map((col) => (
                              <td key={col.key} className={`whitespace-nowrap px-3 py-2 text-text-secondary ${col.align === "right" ? "text-right" : "text-left"}`}>
                                {renderCell(row, col.key)}
                              </td>
                            ))}
                            <td className="whitespace-nowrap px-3 py-2">
                              <div className="flex items-center justify-end gap-1.5">
                                {permission.view ? (
                                  <button type="button" onClick={() => setViewModal({ id: row.id, fileName: row.file_name, rows: [row], loading: false })} title="View" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-color text-text-secondary transition hover:bg-surface-muted">
                                    <Eye size={14} />
                                  </button>
                                ) : null}
                                {permission.edit ? (
                                  <button type="button" onClick={() => openEdit(row)} title="Edit" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-color text-text-secondary transition hover:bg-surface-muted">
                                    <Pencil size={14} />
                                  </button>
                                ) : null}
                                {permission.delete ? (
                                  <button type="button" onClick={() => setDeleteRecordTarget({ id: row.id, label: row.bill_no || row.vendor || `record #${row.id}` })} title="Delete" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 transition hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10">
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

                {totalPages > 1 ? (
                  <div className="flex items-center justify-between gap-3 border-t border-border-color px-4 py-3">
                    <span className="text-xs text-text-muted">Page {page} of {totalPages}</span>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page === 1} className="inline-flex h-8 items-center rounded-lg border border-border-color px-3 text-xs font-medium text-text-secondary disabled:opacity-40">Previous</button>
                      <button type="button" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={page === totalPages} className="inline-flex h-8 items-center rounded-lg border border-border-color px-3 text-xs font-medium text-text-secondary disabled:opacity-40">Next</button>
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          )}
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
                  <th className="whitespace-nowrap px-4 py-2.5 text-right">Total Amount</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-color">
                {loadingUploads ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <tr key={index}><td colSpan={7} className="px-4 py-3"><div className="h-4 w-full animate-pulse rounded bg-surface-muted" /></td></tr>
                  ))
                ) : uploads.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-text-muted">No files uploaded yet.</td></tr>
                ) : (
                  uploads.map((row) => (
                    <tr key={row.id} className="transition hover:bg-surface-muted/60">
                      <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">{formatDate(row.upload_date)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">{row.circles?.length ? row.circles.join(", ") : "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">{row.uploaded_by || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">{formatDateTime(row.uploaded_at)}</td>
                      <td className="max-w-[220px] truncate px-4 py-2.5 text-text-secondary" title={row.file_name}>{row.file_name || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-text-primary">{formatCurrency(row.total_amount)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          {permission.view ? (
                            <button type="button" onClick={() => openView(row)} title="View" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-color text-text-secondary transition hover:bg-surface-muted"><Eye size={14} /></button>
                          ) : null}
                          {permission.download ? (
                            <button type="button" onClick={() => handleDownload(row)} title="Download" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-color text-text-secondary transition hover:bg-surface-muted"><Download size={14} /></button>
                          ) : null}
                          {permission.delete ? (
                            <button type="button" onClick={() => setDeleteTarget({ id: row.id, fileName: row.file_name })} title="Delete" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 transition hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"><Trash2 size={14} /></button>
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

      {/* Upload modal */}
      {uploadModalOpen ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true">
          <button type="button" aria-label="Close" onClick={closeUploadModal} className="absolute inset-0 h-full w-full cursor-default bg-overlay/50 backdrop-blur-sm" />
          <div className="animate-modal-enter relative z-10 w-full max-w-[560px] overflow-hidden rounded-[22px] border border-border-color/80 bg-surface shadow-[0_30px_90px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between gap-3 border-b border-border-color/70 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Upload Expense File</h2>
                <p className="mt-1 text-xs text-text-muted">
                  Required columns: Month, Circle, CMP, Domain, Expense Category, Expense Type, Expense Date, Amount, Status.
                </p>
              </div>
              <button type="button" onClick={closeUploadModal} disabled={uploading} className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-border-color bg-surface text-text-secondary hover:bg-surface-muted disabled:opacity-40"><X size={16} /></button>
            </div>

            <div className="space-y-4 px-5 py-4">
              {uploadResult ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <div className="flex items-center gap-2 text-base font-semibold">
                    <CheckCircle2 size={18} />
                    Upload Completed
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    <div><div className="text-emerald-600/80 dark:text-emerald-400/70">Total Records</div><div className="text-sm font-semibold">{uploadResult.totalRows}</div></div>
                    <div><div className="text-emerald-600/80 dark:text-emerald-400/70">Successfully Imported</div><div className="text-sm font-semibold">{uploadResult.importedRows}</div></div>
                    <div><div className="text-emerald-600/80 dark:text-emerald-400/70">Duplicate Records</div><div className="text-sm font-semibold">{uploadResult.duplicateRows}</div></div>
                    <div><div className="text-emerald-600/80 dark:text-emerald-400/70">Total Expense Amount</div><div className="text-sm font-semibold">{formatCurrency(uploadResult.totalAmount)}</div></div>
                  </div>
                </div>
              ) : duplicatePrompt ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                  <div className="flex items-start gap-2">
                    <Info size={16} className="mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">{duplicatePrompt.message}</p>
                      <p className="mt-1 text-xs opacity-80">Replace will overwrite the matching rows. Skip will import only the new rows.</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={() => setDuplicatePrompt(null)} disabled={uploading} className="inline-flex h-9 items-center rounded-full border border-border-strong bg-surface px-4 text-xs font-medium text-text-secondary hover:bg-surface-muted disabled:opacity-40">Cancel</button>
                    <button type="button" onClick={() => submitUpload("skip")} disabled={uploading} className="inline-flex h-9 items-center rounded-full border border-border-strong bg-surface px-4 text-xs font-semibold text-text-primary hover:bg-surface-muted disabled:opacity-40">Skip duplicates</button>
                    <button type="button" onClick={() => submitUpload("replace")} disabled={uploading} className="inline-flex h-9 items-center rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-4 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-40">Replace duplicates</button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Date</label>
                    <PremiumDatePicker value={uploadForm.date} onChange={(value) => setUploadForm((prev) => ({ ...prev, date: value }))} />
                    {attemptedSubmit && !uploadForm.date ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">Date is required.</p> : null}
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Uploaded By</label>
                    <input type="text" value={uploadForm.uploadedBy} onChange={(e) => setUploadForm((prev) => ({ ...prev, uploadedBy: e.target.value }))} placeholder="Person uploading this file" className="app-input w-full" />
                    {attemptedSubmit && !uploadForm.uploadedBy.trim() ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">Uploaded By is required.</p> : null}
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">Upload File</label>
                      <a href="/formats/expense_management_format.xlsx" download className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                        <Download size={12} />
                        Download Sample Template
                      </a>
                    </div>
                    <div className="relative flex h-28 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-border-color bg-surface-muted/40 text-center">
                      <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setUploadForm((prev) => ({ ...prev, file: e.target.files?.[0] || null }))} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                      <UploadCloud size={22} className="text-text-muted" />
                      <p className="text-xs text-text-secondary">{uploadForm.file ? uploadForm.file.name : "Click or drag an .xlsx, .xls or .csv file"}</p>
                    </div>
                    {attemptedSubmit && !uploadForm.file ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">Please choose a file to upload.</p> : null}
                  </div>
                </>
              )}
            </div>

            {!duplicatePrompt ? (
              <div className="flex items-center justify-end gap-2 border-t border-border-color/70 bg-surface-muted/40 px-5 py-4">
                {uploadResult ? (
                  <button type="button" onClick={closeUploadModal} className="inline-flex h-10 items-center rounded-full bg-gradient-to-r from-rose-500 to-red-500 px-5 text-sm font-semibold text-white shadow-sm hover:opacity-95">Done</button>
                ) : (
                  <>
                    <button type="button" onClick={closeUploadModal} disabled={uploading} className="inline-flex h-10 items-center rounded-full border border-border-strong bg-surface px-5 text-sm font-medium text-text-secondary hover:bg-surface-muted disabled:opacity-40">Cancel</button>
                    <button type="button" onClick={() => submitUpload()} disabled={uploading} className="inline-flex h-10 min-w-[120px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-red-500 px-5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60">
                      {uploading ? (<><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />Uploading...</>) : "Upload"}
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {uploadErrorPayload ? <ReportUploadErrorDialog payload={uploadErrorPayload} onClose={() => setUploadErrorPayload(null)} /> : null}

      {/* View modal */}
      {viewModal ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true">
          <button type="button" aria-label="Close" onClick={() => setViewModal(null)} className="absolute inset-0 h-full w-full cursor-default bg-overlay/50 backdrop-blur-sm" />
          <div className="animate-modal-enter relative z-10 flex max-h-[85vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-[22px] border border-border-color/80 bg-surface shadow-[0_30px_90px_rgba(15,23,42,0.22)]">
            <div className="flex items-center justify-between border-b border-border-color/70 px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-text-primary">Expense Records</h2>
                <p className="truncate text-xs text-text-muted">{viewModal.fileName}</p>
              </div>
              <button type="button" onClick={() => setViewModal(null)} className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-border-color bg-surface text-text-secondary hover:bg-surface-muted"><X size={16} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="sticky top-0 bg-surface-muted font-semibold uppercase tracking-wide text-text-muted">
                    <th className="whitespace-nowrap px-3 py-2">Month</th>
                    <th className="whitespace-nowrap px-3 py-2">Circle</th>
                    <th className="whitespace-nowrap px-3 py-2">CMP</th>
                    <th className="whitespace-nowrap px-3 py-2">Category</th>
                    <th className="whitespace-nowrap px-3 py-2">Vendor</th>
                    <th className="whitespace-nowrap px-3 py-2">Bill No</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">Total Amount</th>
                    <th className="whitespace-nowrap px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-color">
                  {viewModal.loading ? (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-text-muted">Loading…</td></tr>
                  ) : viewModal.rows.length === 0 ? (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-text-muted">No records found.</td></tr>
                  ) : (
                    viewModal.rows.map((row) => (
                      <tr key={row.id}>
                        <td className="whitespace-nowrap px-3 py-2">{row.month_label}</td>
                        <td className="whitespace-nowrap px-3 py-2">{row.circle}</td>
                        <td className="whitespace-nowrap px-3 py-2">{row.cmp}</td>
                        <td className="whitespace-nowrap px-3 py-2">{row.expense_category}</td>
                        <td className="whitespace-nowrap px-3 py-2">{row.vendor || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2">{row.bill_no || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">{formatCurrency(row.total_amount)}</td>
                        <td className="whitespace-nowrap px-3 py-2"><StatusBadge status={row.status} /></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {/* Edit modal */}
      {editRecord && editForm ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true">
          <button type="button" aria-label="Close" onClick={() => !savingEdit && setEditRecord(null)} className="absolute inset-0 h-full w-full cursor-default bg-overlay/50 backdrop-blur-sm" />
          <div className="animate-modal-enter relative z-10 w-full max-w-[560px] overflow-hidden rounded-[22px] border border-border-color/80 bg-surface shadow-[0_30px_90px_rgba(15,23,42,0.22)]">
            <div className="flex items-center justify-between gap-3 border-b border-border-color/70 px-5 py-4">
              <h2 className="text-lg font-semibold text-text-primary">Edit Expense Record</h2>
              <button type="button" onClick={() => !savingEdit && setEditRecord(null)} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border-color bg-surface text-text-secondary hover:bg-surface-muted"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Category</label>
                <select value={editForm.expenseCategory} onChange={(e) => setEditForm((prev) => ({ ...prev, expenseCategory: e.target.value }))} className="app-select w-full">
                  {meta.categories.map((category) => (<option key={category} value={category}>{category}</option>))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Status</label>
                <select value={editForm.status} onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))} className="app-select w-full">
                  {meta.statuses.map((status) => (<option key={status} value={status}>{STATUS_META[status]?.label || status}</option>))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Expense Type</label>
                <input type="text" value={editForm.expenseType} onChange={(e) => setEditForm((prev) => ({ ...prev, expenseType: e.target.value }))} className="app-input w-full" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Description</label>
                <input type="text" value={editForm.description} onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))} className="app-input w-full" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Vendor</label>
                <input type="text" value={editForm.vendor} onChange={(e) => setEditForm((prev) => ({ ...prev, vendor: e.target.value }))} className="app-input w-full" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Bill No</label>
                <input type="text" value={editForm.billNo} onChange={(e) => setEditForm((prev) => ({ ...prev, billNo: e.target.value }))} className="app-input w-full" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Amount</label>
                <input type="number" value={editForm.amount} onChange={(e) => setEditForm((prev) => ({ ...prev, amount: e.target.value }))} className="app-input w-full" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">GST</label>
                <input type="number" value={editForm.gst} onChange={(e) => setEditForm((prev) => ({ ...prev, gst: e.target.value }))} className="app-input w-full" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Remarks</label>
                <input type="text" value={editForm.remarks} onChange={(e) => setEditForm((prev) => ({ ...prev, remarks: e.target.value }))} className="app-input w-full" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border-color/70 bg-surface-muted/40 px-5 py-4">
              <button type="button" onClick={() => setEditRecord(null)} disabled={savingEdit} className="inline-flex h-10 items-center rounded-full border border-border-strong bg-surface px-5 text-sm font-medium text-text-secondary hover:bg-surface-muted disabled:opacity-40">Cancel</button>
              <button type="button" onClick={saveEdit} disabled={savingEdit} className="inline-flex h-10 min-w-[100px] items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-red-500 px-5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-60">{savingEdit ? "Saving..." : "Save"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Set Budget modal */}
      {budgetModalOpen ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true">
          <button type="button" aria-label="Close" onClick={() => !savingBudget && setBudgetModalOpen(false)} className="absolute inset-0 h-full w-full cursor-default bg-overlay/50 backdrop-blur-sm" />
          <div className="animate-modal-enter relative z-10 w-full max-w-[440px] overflow-hidden rounded-[22px] border border-border-color/80 bg-surface shadow-[0_30px_90px_rgba(15,23,42,0.22)]">
            <div className="flex items-center justify-between gap-3 border-b border-border-color/70 px-5 py-4">
              <h2 className="text-lg font-semibold text-text-primary">Set Budget</h2>
              <button type="button" onClick={() => !savingBudget && setBudgetModalOpen(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border-color bg-surface text-text-secondary hover:bg-surface-muted"><X size={16} /></button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Month</label>
                <input type="month" value={budgetForm.monthDate} onChange={(e) => setBudgetForm((prev) => ({ ...prev, monthDate: e.target.value }))} className="app-input w-full" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Budget Amount</label>
                <input type="number" value={budgetForm.budgetAmount} onChange={(e) => setBudgetForm((prev) => ({ ...prev, budgetAmount: e.target.value }))} placeholder="e.g. 500000" className="app-input w-full" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border-color/70 bg-surface-muted/40 px-5 py-4">
              <button type="button" onClick={() => setBudgetModalOpen(false)} disabled={savingBudget} className="inline-flex h-10 items-center rounded-full border border-border-strong bg-surface px-5 text-sm font-medium text-text-secondary hover:bg-surface-muted disabled:opacity-40">Cancel</button>
              <button type="button" onClick={saveBudget} disabled={savingBudget} className="inline-flex h-10 min-w-[100px] items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-red-500 px-5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-60">{savingBudget ? "Saving..." : "Save Budget"}</button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this upload?"
        description={`This will permanently delete "${deleteTarget?.fileName || ""}" and every Expense record that came from it. This cannot be undone.`}
        confirmLabel="Delete"
        tone="danger"
        busy={deleting}
        onConfirm={confirmDeleteUpload}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteRecordTarget)}
        title="Delete this record?"
        description={`This will permanently delete "${deleteRecordTarget?.label || ""}". This cannot be undone.`}
        confirmLabel="Delete"
        tone="danger"
        busy={deleting}
        onConfirm={confirmDeleteRecord}
        onCancel={() => !deleting && setDeleteRecordTarget(null)}
      />
    </div>
  );
}

function BreakdownCard({ title, rows, onSelect }) {
  const list = rows || [];
  const maxAmount = Math.max(1, ...list.map((row) => Number(row.amount || 0)));

  return (
    <div className={`${CARD_SHELL} p-5`}>
      <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-text-muted">{title}</div>
      {list.length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-border-color px-3 py-6 text-center text-xs text-text-muted">No data for the selected filters.</div>
      ) : (
        <div className="mt-3 space-y-2.5">
          {list.slice(0, 8).map((row) => (
            <button
              key={row.name}
              type="button"
              onClick={() => onSelect(row.name)}
              className="block w-full rounded-xl border border-transparent px-2 py-1.5 text-left transition hover:border-border-color hover:bg-surface-muted"
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-medium text-text-secondary">{row.name}</span>
                <span className="whitespace-nowrap font-semibold text-text-primary">{formatIndianCompact(row.amount)}</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                <div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-red-500" style={{ width: `${(Number(row.amount || 0) / maxAmount) * 100}%` }} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BudgetStat({ label, value, tone }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">{label}</div>
      <div className={`mt-1 text-base font-semibold ${tone || "text-text-primary"}`}>{value}</div>
    </div>
  );
}

export default ExpenseManagement;
