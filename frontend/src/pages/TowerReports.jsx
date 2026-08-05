import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { buildApiUrl } from "../lib/api";
import { hasPermission } from "../lib/session";
import { getPagePermission } from "../utils/access";
import { useUser } from "../context/UserContext";
import axios from "axios";
import PremiumDatePicker from "../components/PremiumDatePicker";
import ReportUploadErrorDialog from "../components/ReportUploadErrorDialog";
import ConfirmDialog from "../components/ConfirmDialog";
import { Listbox } from "@headlessui/react";
import {
  Activity,
  BarChart3,
  ChevronDown,
  Download,
  FileText,
  Info,
  Layers,
  Pencil,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  Upload,
  User,
  X,
} from "lucide-react";

// Templates that actually exist in frontend/public/formats. Linking a missing
// one falls through to the SPA and downloads index.html renamed as .xlsx.
const availableFormatTemplates = new Set([
  "ag1", "ag2", "enb", "esc", "gnb", "hpodsc", "ila", "isc", "osc",
]);

// Static lookup tables live outside the component so they are not rebuilt on
// every render, and so memos that read them have a stable reference.
const siteTypeMeta = {
  AG2: { label: "AG2", bg: "from-sky-100 to-sky-50", icon: BarChart3 },
  ILA: { label: "ILA", bg: "from-fuchsia-100 to-fuchsia-50", icon: Activity },
  AG1: { label: "AG1", bg: "from-cyan-100 to-cyan-50", icon: ShieldCheck },
  ENB: { label: "ENB", bg: "from-indigo-100 to-indigo-50", icon: Sparkles },
  GNB: { label: "GNB", bg: "from-emerald-100 to-emerald-50", icon: TrendingUp },
  ESC: { label: "ESC", bg: "from-amber-100 to-amber-50", icon: Layers },
  HPODSC: { label: "HPODSC", bg: "from-rose-100 to-rose-50", icon: Activity },
  OSC: { label: "OSC", bg: "from-lime-100 to-lime-50", icon: BarChart3 },
  GSC: { label: "GSC", bg: "from-surface-muted to-surface-muted", icon: Layers },
};

const siteTypeOptions = [
  { value: "AG2", label: "AG2" },
  { value: "ILA", label: "ILA" },
  { value: "AG1", label: "AG1" },
  { value: "ENB", label: "ENB" },
  { value: "GNB", label: "GNB" },
  { value: "ESC", label: "ESC" },
  { value: "HPODSC", label: "HPODSC" },
  { value: "OSC", label: "OSC" },
  { value: "GSC", label: "GSC", permission: "site.GSC" },
];

const reportOptions = [
  { value: "", label: "All Report Types" },
  { value: "Outage", label: "Outage" },
  { value: "Performance", label: "Performance" },
];

const validExtensions = ["xlsx", "xls", "xlsb", "csv"];
// Must stay in step with REPORT_MAX_FILE_MB / REPORT_MAX_BULK_FILES on the server.
const maxFileSizeMb = 60;
const maxBulkFiles = 12;

// Mirrors extractDateFromFileName() on the server: one name part with no dots,
// underscores, spaces or dashes, then _YYYY-MM-DD, then the extension.
const bulkFileNamePattern = /^[^._\s-]+_(\d{4}-\d{2}-\d{2})\.[^.]+$/;

const isValidFile = (file) => {
  if (!file?.name) return false;
  return validExtensions.includes(file.name.split(".").pop().toLowerCase());
};

// Catch oversized files here so the user is not left waiting through a long
// upload that the server will reject anyway.
const isOversized = (file) => file.size > maxFileSizeMb * 1024 * 1024;

const describeSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const toSafeDate = (value, dateOnly = false) => {
  if (!value) return null;

  if (dateOnly && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`);
  }

  const parsed = new Date(
    typeof value === "string" ? value.replace(" ", "T") : value
  );
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
};

const formatTimestamp = (value) => {
  const parsed = toSafeDate(value);
  if (!parsed) return "-";
  return parsed.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
};

const formatDateOnly = (value) => {
  const parsed = toSafeDate(value, true);
  if (!parsed) return "-";
  return parsed.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" });
};

// "YYYY-MM-DD" for the date picker and the API, from whatever the row holds.
const formatDateInput = (value) => {
  const parsed = toSafeDate(value, true);
  if (!parsed) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Server errors arrive as JSON normally, but as a Blob when the request asked
// for a file. Both are unwrapped to the same object so callers see one shape.
const readErrorPayload = async (err) => {
  const data = err?.response?.data;

  if (data instanceof Blob) {
    try {
      return JSON.parse(await data.text());
    } catch {
      return null; // not JSON — a truncated file stream
    }
  }

  return data && typeof data === "object" ? data : null;
};

const readErrorMessage = async (err, fallback) => {
  const payload = await readErrorPayload(err);
  if (typeof payload?.message === "string" && payload.message.trim()) {
    return payload.message;
  }
  // Network-level failures never reach the server, so say that rather than
  // repeating a server-side fallback the user cannot act on.
  if (err?.code === "ERR_NETWORK") {
    return "Could not reach the server.\n\nCheck your connection and try again.";
  }
  return fallback;
};

const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// A file download can resolve with HTTP 200 and still not be a real, complete
// .xlsx — a proxy/timeout can cut the stream after headers already went out,
// or return an HTML/JSON error page with a 200 wrapped around it. Either way
// the browser would otherwise save it under the requested filename and Excel
// reports a "file format or extension is not valid" error when opened. This
// catches that before saveBlob(), so a failed download surfaces as a clear
// error message instead of a corrupt-looking file on disk.
const assertValidXlsxBlob = async (blob, contentType) => {
  if (!blob || blob.size === 0) {
    throw new Error(
      "The download did not complete — the file came back empty.\n\n" +
      "This can happen with a large export on a slow connection. Try a shorter date range, or try again."
    );
  }

  if (!contentType || !contentType.includes(XLSX_MIME_TYPE)) {
    // Not the expected type — see if the server actually sent a JSON error
    // wrapped in a 200 (or a truncated stream, which won't parse as JSON).
    let jsonMessage = null;
    try {
      jsonMessage = JSON.parse(await blob.text())?.message || null;
    } catch {
      jsonMessage = null; // not JSON — a truncated/corrupt stream
    }

    throw new Error(
      jsonMessage ||
      "The download did not complete correctly — the file was not a valid Excel file.\n\n" +
      "This can happen if the connection was interrupted mid-download. Please try again."
    );
  }
};

const EMPTY_TOAST = { message: "", type: "success" };

function TowerReports() {
  const { siteCategory } = useParams();
  const normalizedCategory =
    siteCategory?.toLowerCase() === "fiber" ? "fiber" : "tower";
  const categoryLabel = normalizedCategory === "fiber" ? "Fiber" : "Tower";

  const { user } = useUser();
  const towerReportsPermission = getPagePermission(user, "tower-reports");
  const canUploadReports = towerReportsPermission.edit;
  const canDeleteReports = towerReportsPermission.delete;
  const canDownloadFiles = towerReportsPermission.download;

  const allowedSiteTypes = useMemo(
    () => siteTypeOptions.filter((site) => !site.permission || hasPermission(site.permission)),
    []
  );
  const allowedSiteTypeValues = useMemo(
    () => allowedSiteTypes.map((site) => site.value),
    [allowedSiteTypes]
  );

  // Reports cover a completed day, so uploads default to yesterday.
  const defaultReportDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, []);

  const [rows, setRows] = useState([]);
  const [filterDate, setFilterDate] = useState("");
  const [filterSiteType, setFilterSiteType] = useState("");
  const [filterReportType, setFilterReportType] = useState("");
  const [filterCircle, setFilterCircle] = useState("");
  const [filterUploadedBy, setFilterUploadedBy] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [modalMessage, setModalMessage] = useState("");
  const [modalMessageType, setModalMessageType] = useState("success");
  const [date, setDate] = useState(defaultReportDate);
  const [siteType, setSiteType] = useState("");
  const [reportType, setReportType] = useState("");
  const [uploadedBy, setUploadedBy] = useState("");

  const [uploadType, setUploadType] = useState("single");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [file, setFile] = useState(null);
  const [bulkFiles, setBulkFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  // 0-100 while bytes are in flight; null once the server takes over.
  const [uploadProgress, setUploadProgress] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [availableCircles, setAvailableCircles] = useState([]);
  const [exportPopupOpen, setExportPopupOpen] = useState(false);
  const [exportFromDate, setExportFromDate] = useState("");
  const [exportToDate, setExportToDate] = useState("");
  const [exportSiteType, setExportSiteType] = useState("");
  const [exportCircle, setExportCircle] = useState("");
  const [exportReportType, setExportReportType] = useState("");
  const [exportError, setExportError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [sortKey, setSortKey] = useState("report_date");
  const [sortDirection, setSortDirection] = useState("desc");
  const [modalOpen, setModalOpen] = useState(false);
  const modalRef = useRef(null);
  const previousFocusedElement = useRef(null);
  const firstFocusableRef = useRef(null);

  // Full structured payload from a failed upload, rendered by the error dialog.
  const [uploadErrorPayload, setUploadErrorPayload] = useState(null);
  // { title, description, confirmLabel, onConfirm } — replaces window.confirm.
  const [confirmState, setConfirmState] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const [duplicateDialog, setDuplicateDialog] = useState({
    open: false,
    mode: "single",
    duplicates: [],
  });

  const selectAllRef = useRef(null);

  // Page-level toast, kept separate from the in-modal message so an upload no
  // longer shows the same text twice.
  const [toast, setToast] = useState(EMPTY_TOAST);
  const toastTimer = useRef(null);

  const showToast = useCallback((message, type = "success", durationMs = 3200) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    // Errors need longer to read than "Downloaded successfully".
    toastTimer.current = setTimeout(() => setToast(EMPTY_TOAST), durationMs);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const closeDuplicateDialog = useCallback(() => {
    setDuplicateDialog({ open: false, mode: "single", duplicates: [] });
  }, []);

  const closeUploadModal = useCallback(() => {
    closeDuplicateDialog();
    setModalOpen(false);

setTimeout(() => {
    previousFocusedElement.current?.focus();
},0);
    setModalMessage("");
    setEditingId(null);
    setUploadProgress(null);
  }, [closeDuplicateDialog]);

  useEffect(() => {
  if (modalOpen) {
    setTimeout(() => {
      firstFocusableRef.current?.focus();
    }, 0);
  }
}, [modalOpen]);

  // One lock for every layer. The old effect watched only the upload modal, so
  // the export and duplicate dialogs all let the page scroll behind them.
  const anyDialogOpen =
    modalOpen ||
    exportPopupOpen ||
    duplicateDialog.open ||
    Boolean(uploadErrorPayload) ||
    Boolean(confirmState);

  useEffect(() => {
    if (!anyDialogOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [anyDialogOpen]);

  // Escape closes the topmost layer. Dialogs that own a running request stay
  // open so a half-finished upload or download cannot be dismissed by accident.
  useEffect(() => {
    const handleKey = (event) => {
      if (event.key !== "Escape") return;
      if (uploadErrorPayload || confirmState) return; // owned by those dialogs
      if (duplicateDialog.open) {
        if (!uploading) closeDuplicateDialog();
        return;
      }
      if (exportPopupOpen) {
        if (!downloading) setExportPopupOpen(false);
        return;
      }
      if (modalOpen && !uploading) closeUploadModal();
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [
    modalOpen, exportPopupOpen, duplicateDialog.open,
    uploadErrorPayload, confirmState, uploading, downloading,
    closeDuplicateDialog, closeUploadModal,
  ]);

  // Row order is handled by the sortedRows memo, so no sorting is needed here.
  const fetchReports = useCallback(async () => {
    setTableLoading(true);
    setLoadError("");
    try {
      const response = await axios.get(buildApiUrl("/api/reports"), {
        params: { siteCategory: normalizedCategory },
      });
      setRows(response.data?.rows || []);
    } catch (err) {
      setRows([]);
      setLoadError(
        await readErrorMessage(
          err,
          "Could not load reports. Please check your connection and try again."
        )
      );
    } finally {
      setTableLoading(false);
    }
  }, [normalizedCategory]);

  useEffect(() => {
    // Loading the report list is exactly the "synchronise with an external
    // system" case effects exist for; the setState the rule objects to is the
    // loading flag, which has to be raised before the request goes out.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchReports();
  }, [fetchReports]);

  useEffect(() => {
    axios
      .get(buildApiUrl("/api/reports/circles"))
      .then((response) => setAvailableCircles(response.data?.circles || []))
      .catch(() => setAvailableCircles([]));
  }, []);

  // ── File selection ────────────────────────────────────────────────────────

  const rejectFile = (message, inputEl) => {
    setModalMessageType("error");
    setModalMessage(message);
    if (inputEl) inputEl.value = "";
  };

  const handleFileChange = (event) => {
    const input = event.target;
    const picked = input.files?.[0] || null;

    if (!picked) {
      setFile(null);
      return;
    }
    if (!isValidFile(picked)) {
      setFile(null);
      rejectFile(
        `"${picked.name}" is not a supported file type.\n\n` +
        `Expected: .xlsx, .xls, .xlsb or .csv\n` +
        `Found: .${picked.name.split(".").pop()}\n\n` +
        `Open the file in Excel and use File > Save As to save it as .xlsx.`,
        input
      );
      return;
    }
    if (isOversized(picked)) {
      setFile(null);
      rejectFile(
        `"${picked.name}" is ${describeSize(picked.size)}, over the ${maxFileSizeMb} MB limit.\n\n` +
        `Split the report by date and upload the smaller files.`,
        input
      );
      return;
    }

    setModalMessage("");
    setFile(picked);
    // Clearing the input means re-picking the same file still fires a change
    // event; without it the second attempt looked like a broken dialog.
    input.value = "";
  };

  const handleBulkFilesChange = (event) => {
    const input = event.target;
    const files = Array.from(input.files || []);

    if (files.length === 0) return;

    if (files.length > maxBulkFiles) {
      rejectFile(
        `You selected ${files.length} files, but up to ${maxBulkFiles} can be uploaded at a time.\n\n` +
        `Please upload them in smaller batches.`,
        input
      );
      return;
    }

    const invalidFiles = files.filter((item) => !isValidFile(item));
    if (invalidFiles.length > 0) {
      rejectFile(
        `${invalidFiles.length} file${invalidFiles.length === 1 ? " is" : "s are"} not a supported type:\n\n` +
        `${invalidFiles.map((item) => `• ${item.name}`).join("\n")}\n\n` +
        `Only .xlsx, .xls, .xlsb and .csv files are allowed.`,
        input
      );
      return;
    }

    const oversized = files.filter(isOversized);
    if (oversized.length > 0) {
      rejectFile(
        `${oversized.length} file${oversized.length === 1 ? " is" : "s are"} over the ${maxFileSizeMb} MB limit:\n\n` +
        `${oversized.map((item) => `• ${item.name} (${describeSize(item.size)})`).join("\n")}\n\n` +
        `Split them by date and upload the smaller files.`,
        input
      );
      return;
    }

    const duplicateNames = files
      .map((item) => item.name)
      .filter((name, index, all) => all.indexOf(name) !== index);

    if (duplicateNames.length > 0) {
      rejectFile(
        `The same file was selected more than once:\n\n` +
        `${[...new Set(duplicateNames)].map((name) => `• ${name}`).join("\n")}\n\n` +
        `Remove the duplicates and try again.`,
        input
      );
      return;
    }

    setModalMessage("");
    setBulkFiles(files);
    input.value = "";
  };

  const removeBulkFile = (name) => {
    setBulkFiles((prev) => prev.filter((item) => item.name !== name));
  };

  // Bulk uploads take their report date from the file name, so bad names are
  // flagged in the picker rather than after a full upload round trip.
  const bulkNameIssues = useMemo(
    () =>
      bulkFiles
        .filter((item) => !bulkFileNamePattern.test(item.name))
        .map((item) => item.name),
    [bulkFiles]
  );

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = (row) => {
    const label = row.file_name || `${row.site_type} report`;

    setConfirmState({
      title: "Delete this report?",
      description:
        `"${label}"\n\n` +
        `Report date ${formatDateOnly(row.report_date)} • ${row.site_type} • ` +
        `${Number(row.total_records || 0).toLocaleString("en-IN")} data rows\n\n` +
        `This permanently removes the report and all of its uploaded data. It cannot be undone.`,
      confirmLabel: "Delete report",
      onConfirm: async () => {
        setConfirmBusy(true);
        try {
          await axios.delete(buildApiUrl(`/api/reports/${row.id}`));
          setRows((prev) => prev.filter((item) => item.id !== row.id));
          setSelectedIds((prev) => prev.filter((id) => id !== row.id));
          setConfirmState(null);
          showToast("Report deleted successfully.", "success");
        } catch (err) {
          setConfirmState(null);
          showToast(
            await readErrorMessage(err, "Could not delete this report."),
            "error",
            6000
          );
        } finally {
          setConfirmBusy(false);
        }
      },
    });
  };

  const handleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = () => {
    if (activeSelectedIds.length === 0) return;

    const count = activeSelectedIds.length;
    const affected = rows.filter((row) => activeSelectedSet.has(row.id));
    const totalRecords = affected.reduce(
      (sum, row) => sum + Number(row.total_records || 0),
      0
    );

    setConfirmState({
      title: `Delete ${count} report${count > 1 ? "s" : ""}?`,
      description:
        `${totalRecords.toLocaleString("en-IN")} data rows across ` +
        `${new Set(affected.map((row) => row.site_type)).size} site type(s) will be removed.\n\n` +
        `This permanently removes them and all of their uploaded data. It cannot be undone.`,
      confirmLabel: `Delete ${count} report${count > 1 ? "s" : ""}`,
      onConfirm: async () => {
        setConfirmBusy(true);
        try {
          const response = await axios.post(buildApiUrl("/api/reports/bulk-delete"), {
            ids: activeSelectedIds,
          });
          setRows((prev) => prev.filter((row) => !activeSelectedSet.has(row.id)));
          setSelectedIds([]);
          setConfirmState(null);
          showToast(
            response?.data?.message ||
              `${count} report${count > 1 ? "s" : ""} deleted successfully.`,
            "success"
          );
        } catch (err) {
          setConfirmState(null);
          showToast(
            await readErrorMessage(err, "Could not delete the selected reports."),
            "error",
            6000
          );
        } finally {
          setConfirmBusy(false);
        }
      },
    });
  };

  // ── Download / export ─────────────────────────────────────────────────────

  // Streams a blob response to the browser's download manager.
  const saveBlob = (data, contentType, fileName) => {
    const blob = new Blob([data], contentType ? { type: contentType } : undefined);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  // Streamed responses often omit Content-Length, so report bytes received
  // rather than a percentage that would sit at 0 for the whole download.
  const trackDownload = (setter) => (event) => {
    if (event.total) {
      setter(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      return;
    }
    setter(describeSize(event.loaded));
  };

  const handleExportExcel = async () => {
    // Validate before showing the spinner so mistakes are corrected in place.
    if (!exportSiteType) {
      setExportError("Please select a Site Type to export.");
      return;
    }
    if (!exportFromDate || !exportToDate) {
      setExportError(
        `Please choose both dates.\n\n` +
        `${!exportFromDate ? "• From date is empty\n" : ""}` +
        `${!exportToDate ? "• To date is empty" : ""}`
      );
      return;
    }
    if (exportFromDate > exportToDate) {
      setExportError(
        `The From date must be on or before the To date.\n\n` +
        `From: ${exportFromDate}\nTo: ${exportToDate}\n\n` +
        `Swap the two dates and try again.`
      );
      return;
    }

    setExportError("");
    setDownloading(true);
    setDownloadProgress(null);

    try {
      const response = await axios.get(buildApiUrl("/api/reports/export-excel"), {
        params: {
          siteType: exportSiteType,
          fromDate: exportFromDate,
          toDate: exportToDate,
          // Keep the export request self-contained.  The server still applies
          // the signed-in user's circle restriction and validates every value.
          siteCategory: normalizedCategory,
          ...(exportCircle ? { circle: exportCircle } : {}),
          ...(exportReportType ? { reportType: exportReportType } : {}),
        },
        responseType: "blob",
        onDownloadProgress: trackDownload(setDownloadProgress),
      });

      await assertValidXlsxBlob(response.data, response.headers["content-type"]);

      saveBlob(
        response.data,
        response.headers["content-type"],
        `${exportSiteType.toUpperCase()}_Report.xlsx`
      );

      setExportPopupOpen(false);
      showToast(
        `${exportSiteType} export downloaded (${exportFromDate} to ${exportToDate}).`,
        "success"
      );
    } catch (err) {
      // assertValidXlsxBlob() throws a plain Error with a message meant to be
      // shown as-is; axios errors go through readErrorMessage() to unwrap the
      // server's JSON/blob error body instead.
      setExportError(
        err?.isAxiosError
          ? await readErrorMessage(
              err,
              "Export failed. Please try a shorter date range and try again."
            )
          : err?.message || "Export failed. Please try a shorter date range and try again."
      );
    } finally {
      setDownloading(false);
      setDownloadProgress(null);
    }
  };

  const handleDownload = async (id, fileName) => {
    showToast("Preparing download...", "success", 8000);
    try {
      const response = await axios.get(buildApiUrl(`/api/reports/download/${id}`), {
        responseType: "blob",
      });

      // /download/:id always regenerates the report as a fresh .xlsx workbook
      // from the database, regardless of the original upload's format — so
      // the saved filename must end in .xlsx too, even if the original file
      // was a .xlsb/.xls/.csv. Reusing the original name's extension here
      // produced real xlsx bytes wearing e.g. a ".xlsb" name, which Excel
      // then refuses to open ("file format or file extension is not valid").
      const baseName = (fileName || "report").replace(/\.[^./\\]+$/, "");
      const downloadFileName = `${baseName}.xlsx`;

      await assertValidXlsxBlob(response.data, response.headers["content-type"]);

      saveBlob(
        response.data,
        response.headers["content-type"],
        downloadFileName
      );

      showToast(`"${downloadFileName}" downloaded successfully.`, "success");
    } catch (err) {
      showToast(
        err?.isAxiosError
          ? await readErrorMessage(err, "Download failed. Please try again.")
          : err?.message || "Download failed. Please try again.",
        "error",
        7000
      );
    }
  };

  // ── Upload ────────────────────────────────────────────────────────────────

  const handleEdit = (row) => {
    setDate(formatDateInput(row.report_date));
    setSiteType(row.site_type);
    setReportType(row.report_type);
    setUploadedBy(row.uploaded_by || "");
    // Editing always uses the single-report form; the bulk layout has no date
    // field, so a bulk-uploaded row would open an unusable modal.
    setUploadType("single");
    setFile(null);
    setBulkFiles([]);
    setModalMessage("");
    setUploadProgress(null);
    closeDuplicateDialog();
    setEditingId(row.id);
    setModalOpen(true);
  };

  const openUploadModal = () => {
  previousFocusedElement.current = document.activeElement;

    closeDuplicateDialog();
    setEditingId(null);
    setDate(defaultReportDate);
    setSiteType("");
    setReportType("");
    setUploadedBy("");
    setUploadType("single");
    setFile(null);
    setBulkFiles([]);
    setModalMessage("");
    setUploadProgress(null);
    setModalOpen(true);
  };

  const buildUploadFormData = (duplicateAction = "") => {
    const formData = new FormData();

    formData.append("siteCategory", normalizedCategory);
    formData.append("upload_type", uploadType);
    formData.append("date", date);
    formData.append("site_type", siteType);
    formData.append("report_type", reportType);
    formData.append("uploadedBy", uploadedBy);

    if (duplicateAction) formData.append("duplicateAction", duplicateAction);

    if (uploadType === "single") {
      formData.append("file", file);
    } else {
      bulkFiles.forEach((selectedFile) => formData.append("files", selectedFile));
    }

    return formData;
  };

  const submitUploadRequest = async (duplicateAction = "") => {
    setUploadProgress(0);

    const response = await axios.post(
      buildApiUrl("/api/reports/upload"),
      buildUploadFormData(duplicateAction),
      {
        onUploadProgress: (event) => {
          if (!event.total) return;
          setUploadProgress(Math.round((event.loaded / event.total) * 100));
        },
      }
    );

    setModalMessageType("success");
    setModalMessage(response?.data?.message || "Upload completed successfully.");
    setFile(null);
    setBulkFiles([]);
    closeDuplicateDialog();
    await fetchReports();

    showToast(response?.data?.message || "Upload completed successfully.", "success");
    setTimeout(closeUploadModal, 1100);
  };

  // Everything that must be filled in before the Upload button does anything.
  const missingUploadFields = useMemo(() => {
    if (editingId) {
      return [!reportType && "Report Type", !date && "Report Date"].filter(Boolean);
    }

    return [
      !siteType && "Site Type",
      !reportType && "Report Type",
      uploadType === "single" && !date && "Report Date",
      uploadType === "single" && !file && "a file to upload",
      uploadType === "bulk" && bulkFiles.length === 0 && "at least one file",
    ].filter(Boolean);
  }, [editingId, siteType, reportType, date, file, bulkFiles.length, uploadType]);

  const canSubmitUpload =
    !uploading && missingUploadFields.length === 0 && bulkNameIssues.length === 0;

  const handleUpload = async () => {
    setModalMessage("");
    closeDuplicateDialog();

    if (missingUploadFields.length) {
      setModalMessageType("error");
      setModalMessage(
        `Please fill in ${missingUploadFields.join(", ")} before uploading.`
      );
      return;
    }

    try {
      setUploading(true);

      if (editingId) {
        const response = await axios.put(buildApiUrl(`/api/reports/${editingId}`), {
          site_type: siteType,
          report_type: reportType,
          report_date: date,
          uploaded_by: uploadedBy,
        });
        setModalMessageType("success");
        setModalMessage(response?.data?.message || "Report updated successfully.");
        await fetchReports();
        showToast(response?.data?.message || "Report updated successfully.", "success");
        setTimeout(closeUploadModal, 1100);
      } else {
        await submitUploadRequest();
      }
    } catch (err) {
      const payload = (await readErrorPayload(err)) || {};

      if (err?.response?.status === 409 && payload.duplicate) {
        setDuplicateDialog({
          open: true,
          mode: payload.mode || (uploadType === "bulk" ? "bulk" : "single"),
          duplicates: payload.duplicates || [],
        });
        return;
      }

      // A validation failure carries the full breakdown (sheet, row, column,
      // value, expected, reason) — show it in the dedicated dialog instead of
      // squeezing it into the small in-modal banner.
      if (payload.errors?.length || payload.detectedHeaders?.length) {
        setUploadErrorPayload(payload);
        setModalMessage("");
        return;
      }

      setModalMessageType("error");
      setModalMessage(
        await readErrorMessage(
          err,
          "Upload failed.\n\nPlease check your file and try again."
        )
      );
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDuplicateAction = async (duplicateAction) => {
    try {
      setUploading(true);
      setModalMessage("");
      await submitUploadRequest(duplicateAction);
    } catch (err) {
      const payload = (await readErrorPayload(err)) || {};
      closeDuplicateDialog();

      if (payload.errors?.length || payload.detectedHeaders?.length) {
        setUploadErrorPayload(payload);
        return;
      }

      setModalMessageType("error");
      setModalMessage(await readErrorMessage(err, "Upload failed."));
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  // ── Filtering, sorting, paging ────────────────────────────────────────────

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const normalizedAllowed = allowedSiteTypeValues.map((value) =>
      String(value).toLowerCase()
    );

    return rows.filter((row) => {
      if (!normalizedAllowed.includes(String(row.site_type || "").toLowerCase())) {
        return false;
      }

      const rowDate = formatDateInput(row.report_date);

      return (
        (!normalizedSearch ||
          [
            row.site_type,
            row.report_type,
            row.upload_type,
            row.uploaded_by,
            row.file_name,
            rowDate,
          ]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(normalizedSearch))) &&
        (!filterDate || rowDate === filterDate) &&
        (!filterSiteType || row.site_type === filterSiteType) &&
        (!filterReportType || row.report_type === filterReportType) &&
        // A report file covers several circles, so match against the full list.
        (!filterCircle ||
          (Array.isArray(row.circles)
            ? row.circles.includes(filterCircle)
            : row.circle === filterCircle)) &&
        (!filterUploadedBy || row.uploaded_by === filterUploadedBy)
      );
    });
  }, [
    rows,
    filterDate,
    filterSiteType,
    filterReportType,
    filterCircle,
    filterUploadedBy,
    searchTerm,
    allowedSiteTypeValues,
  ]);

  const sortedRows = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;

    const valueFor = (row) => {
      if (sortKey === "report_date") {
        return toSafeDate(row.report_date, true)?.getTime() ?? 0;
      }
      if (sortKey === "uploaded_at") return toSafeDate(row.uploaded_at)?.getTime() ?? 0;
      return String(row[sortKey] ?? "").toLowerCase();
    };

    return [...filteredRows].sort((a, b) => {
      const left = valueFor(a);
      const right = valueFor(b);
      if (left < right) return -1 * direction;
      if (left > right) return 1 * direction;
      // Stable tie-break so equal keys keep a predictable order across renders.
      return (a.id - b.id) * direction;
    });
  }, [filteredRows, sortKey, sortDirection]);

  const hasActiveFilters = Boolean(
    searchTerm || filterDate || filterSiteType || filterReportType ||
    filterCircle || filterUploadedBy
  );

  const resetFilters = () => {
    setSearchTerm("");
    setFilterDate("");
    setFilterSiteType("");
    setFilterReportType("");
    setFilterCircle("");
    setFilterUploadedBy("");
  };

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "report_date" || key === "uploaded_at" ? "desc" : "asc");
  };

  const totalFiles = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalFiles / pageSize));

  // Changing a filter should send you back to page 1. Adjusting during render
  // (React's documented pattern) instead of in an effect avoids the extra
  // commit that briefly painted page 5 of a 2-page result.
  const filterSignature = [
    filterDate, filterSiteType, filterReportType, filterCircle,
    filterUploadedBy, searchTerm, pageSize, normalizedCategory,
  ].join(" ");
  const [lastFilterSignature, setLastFilterSignature] = useState(filterSignature);

  if (lastFilterSignature !== filterSignature) {
    setLastFilterSignature(filterSignature);
    setCurrentPage(1);
  }

  // Clamping is pure, so it is derived rather than written back to state.
  const activePage = Math.min(currentPage, totalPages);

  const paginatedRows = sortedRows.slice(
    (activePage - 1) * pageSize,
    activePage * pageSize
  );

  const allFilteredIds = useMemo(
    () => filteredRows.map((row) => row.id),
    [filteredRows]
  );

  // Selections are pruned to what is currently visible on read, not by
  // rewriting state in an effect — so a row hidden by a filter is never acted
  // on, and un-filtering restores the selection instead of losing it.
  //
  // These are plain derivations, left un-memoized on purpose: this project's
  // ESLint config enforces React Compiler compatibility
  // (react-hooks/preserve-manual-memoization), and the compiler already
  // memoizes plain derivations like these — wrapping them in a manual useMemo
  // makes the compiler bail out of optimizing the whole component instead.
  const visibleIdSet = new Set(allFilteredIds);
  const activeSelectedIds = selectedIds.filter((id) => visibleIdSet.has(id));
  const activeSelectedSet = new Set(activeSelectedIds);

  const selectedFilteredCount = activeSelectedIds.length;
  const allFilteredSelected =
    allFilteredIds.length > 0 && selectedFilteredCount === allFilteredIds.length;

  // "Some selected" needs the DOM property; there is no React attribute for it.
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        selectedFilteredCount > 0 && !allFilteredSelected;
    }
  }, [selectedFilteredCount, allFilteredSelected]);

  const handleSelectAll = (event) => {
    if (event.target.checked) {
      setSelectedIds((prev) => [...new Set([...prev, ...allFilteredIds])]);
      return;
    }
    setSelectedIds((prev) => prev.filter((id) => !allFilteredIds.includes(id)));
  };

  const kpiCards = useMemo(() => {
    const snapshot = filteredRows.reduce((memo, row) => {
      const type = row.site_type;
      if (!type || !row.report_date || !siteTypeMeta[type]) return memo;

      const currentDate = toSafeDate(row.report_date, true);
      if (!currentDate) return memo;

      const existing = memo[type];
      if (!existing || currentDate > existing.dateRaw) {
        memo[type] = { count: Number(row.total_records || 0), dateRaw: currentDate };
      }
      return memo;
    }, {});

    return allowedSiteTypes.map((site) => {
      const meta = siteTypeMeta[site.value] || {
        label: site.label,
        bg: "from-surface-muted to-surface-muted",
        icon: BarChart3,
      };
      const metric = snapshot[site.value];
      return {
        ...meta,
        type: site.value,
        count: metric?.count || 0,
        date: metric?.dateRaw ? formatDateOnly(metric.dateRaw) : "-",
      };
    });
  }, [filteredRows, allowedSiteTypes]);

  const uploaderOptions = useMemo(
    () => [...new Set(rows.map((row) => row.uploaded_by).filter(Boolean))].sort(),
    [rows]
  );

  // ── Shared class names ────────────────────────────────────────────────────

  const primaryButtonClass =
    "inline-flex h-10 items-center justify-center gap-2 rounded-full border border-transparent px-5 text-sm font-semibold text-white shadow-[0_20px_60px_rgba(76,78,255,0.22)] transition duration-200 disabled:cursor-not-allowed disabled:opacity-50";
  const secondaryButtonClass =
    "inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border-strong bg-surface px-5 text-sm font-medium text-text-secondary shadow-sm transition duration-200 hover:bg-surface-muted disabled:cursor-not-allowed";
  const tableActionClass =
    "inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-border-color bg-surface text-text-secondary shadow-sm transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40";
  const fieldLabelClass =
    "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted";
  const listboxButtonClass =
    "flex h-10 w-full items-center justify-between gap-2 rounded-2xl border border-border-color bg-surface px-4 text-left text-sm text-text-primary shadow-sm transition hover:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100 hover:dark:border-violet-500/30";
  // No "absolute"/"w-full" here — anchor positioning (below) portals the panel
  // to document.body and floats it off the trigger, so it can no longer be
  // clipped by a modal's overflow-y-auto or trapped by a backdrop-blur
  // stacking context the way a plain absolutely-positioned child was.
  // --button-width is set by Headless UI itself to match the trigger width.
  const listboxOptionsClass =
    "z-[70] max-h-60 w-[var(--button-width)] overflow-auto rounded-2xl border border-border-color bg-surface p-1 shadow-[0_20px_60px_rgba(15,23,42,0.12)]";
  const listboxOptionClass = ({ active, selected }) =>
    `cursor-pointer rounded-xl px-3 py-2 text-sm transition ${
      active
        ? "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400"
        : selected
        ? "font-semibold text-text-primary"
        : "text-text-secondary"
    }`;

  const sortableColumns = [
    { key: "report_date", label: "Date" },
    { key: "site_type", label: "Site Type" },
    { key: "circle", label: "Circle" },
    { key: "report_type", label: "Report Type" },
    { key: "upload_type", label: "Upload Type" },
    { key: "uploaded_by", label: "Uploaded By" },
    { key: "file_name", label: "File Name" },
    { key: "uploaded_at", label: "Uploaded At" },
  ];

  const handleFocusTrap = (e) => {

    if (!modalRef.current) return;

    if (e.key !== "Tab") return;

    const focusable = modalRef.current.querySelectorAll(

'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'

    );

    const first = focusable[0];

    const last = focusable[focusable.length-1];

    if (e.shiftKey) {

        if (document.activeElement===first){

            e.preventDefault();

            last.focus();

        }

    }else{

        if(document.activeElement===last){

            e.preventDefault();

            first.focus();

        }

    }

};

  return (
    <div className="min-h-screen w-full pb-32 text-text-primary md:pb-24">

      {/* Toast lives at the page root. Inside the header it was clipped: that
          element sets backdrop-filter, which makes it the containing block for
          fixed-position children, and it also has overflow-hidden. */}
      {toast.message ? (
        <div className="pointer-events-none fixed inset-x-3 top-4 z-[100] flex justify-center sm:inset-x-auto sm:right-5 sm:top-5 sm:justify-end">
          <div
            role={toast.type === "error" ? "alert" : "status"}
            aria-live={toast.type === "error" ? "assertive" : "polite"}
            className={`pointer-events-auto flex max-w-[min(92vw,460px)] items-start gap-3 whitespace-pre-line rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-[0_20px_60px_rgba(15,23,42,0.28)] ${
              toast.type === "error" ? "bg-red-600" : "bg-emerald-600"
            }`}
          >
            <span className="min-w-0 flex-1">{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(EMPTY_TOAST)}
              aria-label="Dismiss notification"
              className="-mr-1 flex-shrink-0 rounded-full p-0.5 opacity-80 transition hover:opacity-100"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div
        className="top-0 z-30 mb-2 overflow-hidden rounded-[22px] px-4 py-4 backdrop-blur-xl sm:px-5
          bg-[linear-gradient(135deg,rgba(219,234,254,0.82),rgba(255,255,255,0.9),rgba(237,233,254,0.9))]
          dark:bg-[linear-gradient(135deg,rgba(30,41,59,0.85),rgba(15,23,42,0.9),rgba(49,46,129,0.65))]"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-[-0.03em] text-text-primary sm:text-xl">
              {categoryLabel} Performance Dashboard
            </h1>
            <p className="text-sm text-text-muted">
              Real-Time Performance Monitoring &amp; Operational Insights
            </p>
          </div>

          {/* Buttons stretch to fill on phones instead of hugging the right
              edge in a ragged wrapped block. */}
          <div className="-mx-1 flex flex-wrap items-center gap-2 px-1 lg:justify-end lg:gap-3">
            {canUploadReports ? (
              <button
                type="button"
                onClick={openUploadModal}
                className={`${primaryButtonClass} flex-1 bg-gradient-to-r from-sky-500 to-indigo-500 sm:flex-none`}
              >
                <Upload size={16} />
                Upload Reports
              </button>
            ) : null}

            <button
              type="button"
              onClick={fetchReports}
              disabled={tableLoading}
              title="Reload the report list"
              className={`${secondaryButtonClass} flex-1 disabled:opacity-40 sm:flex-none`}
            >
              <RotateCcw size={16} className={tableLoading ? "animate-spin" : ""} />
              {tableLoading ? "Refreshing..." : "Refresh"}
            </button>

            {canDeleteReports ? (
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={selectedFilteredCount === 0}
                className={`${secondaryButtonClass} flex-1 border-transparent bg-red-50 text-red-700 shadow-sm hover:bg-red-100 disabled:opacity-40 dark:bg-red-500/10 dark:text-red-400 hover:dark:bg-red-500/15 sm:flex-none`}
              >
                <Trash2 size={16} />
                Delete
                {selectedFilteredCount > 0 ? ` (${selectedFilteredCount})` : ""}
              </button>
            ) : null}

            {canDownloadFiles ? (
              <button
                type="button"
                onClick={() => {
                  setExportError("");
                  // Start the export with the filters currently visible in the
                  // report list, while still allowing them to be changed below.
                  setExportCircle(filterCircle);
                  setExportReportType(filterReportType);
                  setExportPopupOpen(true);
                }}
                disabled={downloading}
                className={`${secondaryButtonClass} flex-1 border-transparent bg-emerald-50 text-emerald-700 shadow-sm hover:bg-emerald-100 disabled:opacity-40 dark:bg-emerald-500/10 dark:text-emerald-400 hover:dark:bg-emerald-500/15 sm:flex-none`}
              >
                {downloading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Export
                  </>
                )}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── KPI cards + filters ──────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[1.85fr_1fr]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {kpiCards.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.type}
                  className="rounded-[18px] border border-white/85 bg-surface/90 px-4 py-2 ring-1 ring-indigo-100 transition duration-200 hover:-translate-y-0.5 hover:shadow-soft dark:border-border-color dark:ring-transparent"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="mt-1 truncate text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                        {item.label}
                      </p>
                      <h2 className="text-lg font-semibold tabular-nums tracking-[-0.03em] text-text-primary">
                        {item.count.toLocaleString("en-IN")}
                      </h2>
                      <p className="truncate text-xs text-text-muted">Date: {item.date}</p>
                    </div>
                    <div
                      className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${item.bg} text-text-primary`}
                    >
                      <Icon size={16} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-[18px] border border-white/80 bg-surface/85 p-4 backdrop-blur-xl dark:border-border-color">
            <div className="space-y-4">
              <div>
                <label htmlFor="report-search" className={fieldLabelClass}>
                  Search reports
                </label>
                <div className="flex h-10 items-center gap-3 overflow-hidden rounded-xl border border-border-color/70 bg-surface px-3 text-sm text-text-secondary transition focus-within:ring-2 focus-within:ring-sky-200">
                  <Search size={16} className="flex-shrink-0 text-text-muted" />
                  <input
                    id="report-search"
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="File name, site type, report type, uploader or date..."
                    className="w-full border-0 bg-transparent text-sm text-text-secondary outline-none placeholder:text-text-muted"
                  />
                  {searchTerm ? (
                    <button
                      type="button"
                      onClick={() => setSearchTerm("")}
                      aria-label="Clear search"
                      className="flex-shrink-0 text-text-muted transition hover:text-text-primary"
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className={fieldLabelClass}>Report date</span>
                  <PremiumDatePicker
                    value={filterDate}
                    onChange={setFilterDate}
                    placeholder="Any date"
                  />
                </div>

                <div>
                  <span className={fieldLabelClass}>Site type</span>
                  <Listbox value={filterSiteType} onChange={setFilterSiteType}>
                    <div className="relative">
                      <Listbox.Button className={listboxButtonClass}>
                        <span className="truncate">
                          {filterSiteType
                            ? allowedSiteTypes.find((site) => site.value === filterSiteType)?.label
                            : "All Site Types"}
                        </span>
                        <ChevronDown size={16} className="flex-shrink-0 text-text-muted" />
                      </Listbox.Button>

                      <Listbox.Options
                        anchor={{ to: "bottom start", gap: "0.5rem" }}
                        className={listboxOptionsClass}
                      >
                        <Listbox.Option value="" className={listboxOptionClass}>
                          All Site Types
                        </Listbox.Option>
                        {allowedSiteTypes.map((site) => (
                          <Listbox.Option
                            key={site.value}
                            value={site.value}
                            className={listboxOptionClass}
                          >
                            {site.label}
                          </Listbox.Option>
                        ))}
                      </Listbox.Options>
                    </div>
                  </Listbox>
                </div>

                <div>
                  <span className={fieldLabelClass}>Circle</span>
                  <Listbox value={filterCircle} onChange={setFilterCircle}>
                    <div className="relative">
                      <Listbox.Button className={listboxButtonClass}>
                        <span className="truncate">{filterCircle || "All Circles"}</span>
                        <ChevronDown size={16} className="flex-shrink-0 text-text-muted" />
                      </Listbox.Button>

                      <Listbox.Options
                        anchor={{ to: "bottom start", gap: "0.5rem" }}
                        className={listboxOptionsClass}
                      >
                        <Listbox.Option value="" className={listboxOptionClass}>
                          All Circles
                        </Listbox.Option>
                        {availableCircles.map((circle) => (
                          <Listbox.Option
                            key={circle}
                            value={circle}
                            className={listboxOptionClass}
                          >
                            {circle}
                          </Listbox.Option>
                        ))}
                      </Listbox.Options>
                    </div>
                  </Listbox>
                </div>

                <div>
                  <span className={fieldLabelClass}>Report type</span>
                  <Listbox value={filterReportType} onChange={setFilterReportType}>
                    <div className="relative">
                      <Listbox.Button className={listboxButtonClass}>
                        <span className="truncate">
                          {reportOptions.find((option) => option.value === filterReportType)?.label}
                        </span>
                        <ChevronDown size={16} className="flex-shrink-0 text-text-muted" />
                      </Listbox.Button>

                      <Listbox.Options
                        anchor={{ to: "bottom start", gap: "0.5rem" }}
                        className={listboxOptionsClass}
                      >
                        {reportOptions.map((option) => (
                          <Listbox.Option
                            key={option.value}
                            value={option.value}
                            className={listboxOptionClass}
                          >
                            {option.label}
                          </Listbox.Option>
                        ))}
                      </Listbox.Options>
                    </div>
                  </Listbox>
                </div>

                <div>
                  <span className={fieldLabelClass}>Uploaded by</span>
                  <Listbox value={filterUploadedBy} onChange={setFilterUploadedBy}>
                    <div className="relative">
                      <Listbox.Button className={listboxButtonClass}>
                        <span className="truncate">{filterUploadedBy || "All Uploaders"}</span>
                        <ChevronDown size={16} className="flex-shrink-0 text-text-muted" />
                      </Listbox.Button>

                      <Listbox.Options
                        anchor={{ to: "bottom start", gap: "0.5rem" }}
                        className={listboxOptionsClass}
                      >
                        <Listbox.Option value="" className={listboxOptionClass}>
                          All Uploaders
                        </Listbox.Option>
                        {uploaderOptions.map((name) => (
                          <Listbox.Option
                            key={name}
                            value={name}
                            className={listboxOptionClass}
                          >
                            {name}
                          </Listbox.Option>
                        ))}
                      </Listbox.Options>
                    </div>
                  </Listbox>
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={resetFilters}
                    disabled={!hasActiveFilters}
                    className={`${secondaryButtonClass} w-full justify-center rounded-2xl border-border-color bg-surface-muted text-text-secondary hover:bg-surface-muted disabled:opacity-40`}
                  >
                    <RotateCcw size={16} />
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Table ──────────────────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-[24px] border border-white/80 bg-surface/90 dark:border-border-color">
          <div className="max-h-[calc(100vh-26rem)] min-h-[240px] overflow-auto">
            <table className="min-w-full text-left text-sm text-text-secondary">
              <thead>
                {/* sticky sits on each th, not the tr — a background on the row
                    does not travel with sticky cells, so the header showed the
                    table body through it while scrolling. */}
                <tr className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                  <th scope="col" className="sticky top-0 z-20 bg-surface-muted px-4 py-3">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      onChange={handleSelectAll}
                      checked={allFilteredSelected}
                      aria-label={`Select all ${allFilteredIds.length} reports`}
                      className="h-4 w-4 rounded border-border-strong"
                    />
                  </th>

                  {sortableColumns.map(({ key, label }) => (
                    <th
                      key={key}
                      scope="col"
                      aria-sort={
                        sortKey === key
                          ? sortDirection === "asc" ? "ascending" : "descending"
                          : "none"
                      }
                      className="sticky top-0 z-20 whitespace-nowrap bg-surface-muted px-4 py-3"
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(key)}
                        className="inline-flex items-center gap-1 uppercase tracking-[0.14em] transition hover:text-text-primary"
                      >
                        {label}
                        <ChevronDown
                          size={12}
                          aria-hidden="true"
                          className={`transition ${
                            sortKey === key
                              ? `opacity-100 ${sortDirection === "asc" ? "rotate-180" : ""}`
                              : "opacity-25"
                          }`}
                        />
                      </button>
                    </th>
                  ))}

                  {/* Matches the sticky-right body cell; without this the header
                      scrolled away from the buttons it labels. */}
                  <th
                    scope="col"
                    className="sticky right-0 top-0 z-30 bg-surface-muted px-4 py-3 text-right"
                  >
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border-color" aria-busy={tableLoading}>
                {tableLoading ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <tr key={`skeleton-${index}`}>
                      <td className="px-4 py-4" colSpan={10}>
                        <div className="h-4 w-full animate-pulse rounded bg-surface-muted" />
                      </td>
                    </tr>
                  ))
                ) : paginatedRows.length ? (
                  paginatedRows.map((row) => (
                    <tr
                      key={row.id}
                      className={`transition duration-150 hover:bg-surface-muted/70 ${
                        activeSelectedSet.has(row.id) ? "bg-sky-50/60 dark:bg-sky-500/5" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={activeSelectedSet.has(row.id)}
                          onChange={() => handleSelect(row.id)}
                          aria-label={`Select ${row.file_name || row.site_type} report`}
                          className="h-4 w-4 rounded border-border-strong"
                        />
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                        {formatDateOnly(row.report_date)}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${
                            row.site_type === "ENB"
                              ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-400"
                              : "bg-surface-muted text-text-secondary ring-1 ring-border-strong"
                          }`}
                        >
                          {row.site_type || "-"}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {row.circles?.length ? (
                          <span title={row.circles.join(", ")}>{row.circle}</span>
                        ) : (
                          <span
                            className="text-amber-700 dark:text-amber-400"
                            title="No data rows found for this report"
                          >
                            No data
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">{row.report_type || "-"}</td>
                      <td className="px-4 py-3 capitalize">{row.upload_type || "-"}</td>
                      <td className="whitespace-nowrap px-4 py-3">{row.uploaded_by || "-"}</td>

                      <td className="max-w-[260px] px-4 py-3">
                        <span className="block truncate" title={row.file_name || ""}>
                          {row.file_name || "-"}
                        </span>
                        {row.file_missing ? (
                          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-400">
                            File missing
                          </div>
                        ) : null}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                        {formatTimestamp(row.uploaded_at)}
                      </td>

                      <td className="sticky right-0 z-10 bg-surface px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {canDownloadFiles ? (
                            <button
                              type="button"
                              onClick={() => handleDownload(row.id, row.file_name)}
                              className={tableActionClass}
                              title={row.file_missing ? "Download unavailable" : "Download"}
                              aria-label={`Download ${row.file_name || "report"}`}
                              disabled={row.file_missing}
                            >
                              <Download size={14} />
                            </button>
                          ) : null}

                          {canUploadReports ? (
                            <button
                              type="button"
                              onClick={() => handleEdit(row)}
                              className={tableActionClass}
                              title="Edit report details"
                              aria-label={`Edit ${row.file_name || "report"}`}
                            >
                              <Pencil size={14} />
                            </button>
                          ) : null}

                          {canDeleteReports ? (
                            <button
                              type="button"
                              onClick={() => handleDelete(row)}
                              className={`${tableActionClass} text-red-500 hover:bg-red-50 dark:text-red-400 hover:dark:bg-red-500/10`}
                              title="Delete report"
                              aria-label={`Delete ${row.file_name || "report"}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-12 text-center text-sm text-text-muted" colSpan={10}>
                      {loadError ? (
                        <div className="mx-auto max-w-md space-y-3">
                          <p className="whitespace-pre-line font-medium text-red-600 dark:text-red-400">
                            {loadError}
                          </p>
                          <button
                            type="button"
                            onClick={fetchReports}
                            className={`${secondaryButtonClass} mx-auto`}
                          >
                            <RotateCcw size={16} />
                            Try again
                          </button>
                        </div>
                      ) : hasActiveFilters ? (
                        <div className="space-y-3">
                          <p>No reports match your filters.</p>
                          <button
                            type="button"
                            onClick={resetFilters}
                            className={`${secondaryButtonClass} mx-auto`}
                          >
                            <RotateCcw size={16} />
                            Clear filters
                          </button>
                        </div>
                      ) : (
                        "No reports uploaded yet."
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Pagination bar ───────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 md:left-[var(--sidebar-width)]">
        <div className="w-full border-t border-border-color/80 bg-surface/95 px-3 py-2 backdrop-blur md:px-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-text-muted">
              {selectedFilteredCount > 0 ? (
                <>
                  <span className="font-medium text-text-primary">
                    {selectedFilteredCount}
                  </span>
                  {" selected of "}
                </>
              ) : (
                "Total files: "
              )}
              <span className="font-medium text-text-primary">{totalFiles}</span>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <label htmlFor="page-size" className="text-sm text-text-muted">
                Show
              </label>
              <select
                id="page-size"
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
                className="h-8 rounded-md border border-border-color bg-surface px-2 text-sm text-text-secondary"
              >
                {[10, 15, 30, 50, 100].map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setCurrentPage(Math.max(1, activePage - 1))}
                disabled={activePage === 1}
                className="inline-flex h-8 items-center rounded-md border border-border-color bg-surface px-3 text-sm text-text-secondary shadow-sm disabled:opacity-50"
              >
                Prev
              </button>

              <span className="text-sm tabular-nums text-text-secondary">
                Page {activePage} of {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage(Math.min(totalPages, activePage + 1))}
                disabled={activePage === totalPages}
                className="inline-flex h-8 items-center rounded-md border border-border-color bg-surface px-3 text-sm text-text-secondary shadow-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Upload / edit modal ──────────────────────────────────────────── */}
      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto px-3 py-6 sm:px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="upload-modal-title"
        >
          <div className="absolute inset-0 bg-overlay/30 backdrop-blur-xl" />

          <div className="animate-modal-enter relative z-10 mx-auto flex max-h-[92vh] w-full max-w-[750px] flex-col overflow-hidden rounded-[20px] border border-border-color/80 bg-surface shadow-[0_30px_90px_rgba(15,23,42,0.12)]">

            <div className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-border-color/70 px-5 py-4 sm:px-6 sm:py-5">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
                  {categoryLabel} Reports
                </p>
                <h2
                  id="upload-modal-title"
                  className="mt-1.5 text-lg font-semibold tracking-[-0.03em] text-text-primary sm:text-xl"
                >
                  {editingId ? "Edit Report Details" : "Upload Reports"}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeUploadModal}
                disabled={uploading}
                className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-border-color bg-surface text-text-secondary shadow-sm transition duration-200 hover:bg-surface-muted disabled:opacity-40"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
              {modalMessage ? (
                <div
                  role={modalMessageType === "error" ? "alert" : "status"}
                  className={`whitespace-pre-line rounded-2xl border px-4 py-3 text-sm shadow-sm ${
                    modalMessageType === "error"
                      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"
                  }`}
                >
                  {modalMessage}
                </div>
              ) : null}

              <section className="rounded-2xl border border-border-color/80 bg-surface-muted px-4 py-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:px-5">

                {/* Editing changes only the report details — the uploaded file
                    cannot be swapped, so the upload-mode tabs are hidden. */}
                {!editingId ? (
                  <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-surface p-1">
                    {[
                      { value: "single", label: "Single Upload", active: "bg-blue-600" },
                      { value: "bulk", label: "Bulk Upload", active: "bg-green-600" },
                    ].map((tab) => (
                      <button
                        key={tab.value}
                        type="button"
                        onClick={() => {
                          setUploadType(tab.value);
                          setFile(null);
                          setBulkFiles([]);
                          setModalMessage("");
                        }}
                        className={`rounded-xl py-2 text-sm font-medium transition ${
                          uploadType === tab.value
                            ? `${tab.active} text-white shadow-sm`
                            : "text-text-secondary hover:bg-surface-muted"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Report date — single upload only. Bulk takes the date from
                      each file name, so showing a picker here would mislead. */}
                  {uploadType === "single" ? (
                    <div>
                      <span className={fieldLabelClass}>Report date</span>
                      <PremiumDatePicker
                        value={date}
                        onChange={setDate}
                        isDateDisabled={(candidate) => {
                          const startOfToday = new Date();
                          startOfToday.setHours(0, 0, 0, 0);
                          const selected = new Date(candidate);
                          selected.setHours(0, 0, 0, 0);
                          return selected >= startOfToday; // blocks today + future
                        }}
                      />
                        </div>
                  ) : null}

                  {/* Uploaded by — defaults to the signed-in account's name,
                      editable in case a report is being filed on someone
                      else's behalf. */}
                  <div>
                    <label htmlFor="uploaded-by" className={fieldLabelClass}>
                      Uploaded by
                    </label>
                    <div className="relative">
                      <User
                        size={15}
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
                      />
                      <input
                        id="uploaded-by"
                        type="text"
                        value={uploadedBy}
                        onChange={(event) => setUploadedBy(event.target.value)}
                        placeholder="Enter uploader name"
                        className="h-10 w-full rounded-2xl border border-border-color bg-surface pl-10 pr-4 text-sm text-text-primary outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                      />
                    </div>
                  </div>

                  <div>
                    <span className={fieldLabelClass}>Site type</span>
                    {/* Site Type decides which table the rows live in, so it is
                        locked once the file has been uploaded. */}
                    <Listbox value={siteType} onChange={setSiteType} disabled={Boolean(editingId)}>
                      <div className="relative">
                        <Listbox.Button
                          title={editingId ? "Site Type cannot be changed after upload" : undefined}
                          className={`${listboxButtonClass} ${
                            editingId ? "cursor-not-allowed opacity-60" : ""
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <Layers size={15} className="flex-shrink-0 text-text-muted" />
                            <span className="truncate">
                              {siteType
                                ? allowedSiteTypes.find((site) => site.value === siteType)?.label ||
                                  siteType
                                : "Select Site Type"}
                            </span>
                          </span>
                          <ChevronDown size={16} className="flex-shrink-0 text-text-muted" />
                        </Listbox.Button>

                        <Listbox.Options
                        anchor={{ to: "bottom start", gap: "0.5rem" }}
                        className={listboxOptionsClass}
                      >
                          {allowedSiteTypes.map((site) => (
                            <Listbox.Option
                              key={site.value}
                              value={site.value}
                              className={listboxOptionClass}
                            >
                              {site.label}
                            </Listbox.Option>
                          ))}
                        </Listbox.Options>
                      </div>
                    </Listbox>
                    {editingId ? (
                      <p className="mt-1 text-[11px] text-text-muted">
                        Locked — the data is stored under this Site Type.
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <span className={fieldLabelClass}>Report type</span>
                    <Listbox value={reportType} onChange={setReportType}>
                      <div className="relative">
                        <Listbox.Button className={listboxButtonClass}>
                          <span className="flex min-w-0 items-center gap-2">
                            <FileText size={15} className="flex-shrink-0 text-text-muted" />
                            <span className="truncate">
                              {reportType || "Select Report Type"}
                            </span>
                          </span>
                          <ChevronDown size={16} className="flex-shrink-0 text-text-muted" />
                        </Listbox.Button>

                        <Listbox.Options
                        anchor={{ to: "bottom start", gap: "0.5rem" }}
                        className={listboxOptionsClass}
                      >
                          <Listbox.Option value="Outage" className={listboxOptionClass}>
                            Outage Report
                          </Listbox.Option>
                          <Listbox.Option value="Performance" className={listboxOptionClass}>
                            Performance Report
                          </Listbox.Option>
                        </Listbox.Options>
                      </div>
                    </Listbox>
                  </div>
                </div>

                {/* Format template — only when one exists, otherwise the link
                    falls through to the SPA and downloads index.html as .xlsx. */}
                {siteType && !editingId && availableFormatTemplates.has(siteType.toLowerCase()) ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-3 dark:border-violet-500/20 dark:bg-violet-500/10">
                    <Info size={16} className="flex-shrink-0 text-violet-600 dark:text-violet-400" />
                    <p className="min-w-0 flex-1 text-xs text-violet-800 dark:text-violet-300">
                      Your file must use the {siteType} column layout, with headings on row 1.
                    </p>
                    <a
                      href={`/formats/${siteType.toLowerCase()}_format.xlsx`}
                      download={`${siteType}_Format.xlsx`}
                      className="inline-flex h-9 items-center gap-2 rounded-xl border border-violet-200 bg-surface px-3 text-sm font-medium text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/20 dark:text-violet-400 hover:dark:bg-violet-500/15"
                    >
                      <Download size={15} />
                      {siteType} format
                    </a>
                  </div>
                ) : null}

                {/* File pickers — hidden while editing, because the edit API
                    updates report details only and would discard a file. */}
                {editingId ? (
                  <div className="mt-4 rounded-2xl border border-border-color bg-surface px-4 py-3 text-sm text-text-secondary">
                    You are editing this report&apos;s details. The uploaded file cannot be
                    replaced here — to load a corrected file, delete this report and upload
                    it again.
                  </div>
                ) : uploadType === "single" ? (
                  <div className="mt-5 space-y-3">
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="text-sm font-semibold text-text-primary">File Upload</div>
                        <p className="text-xs text-text-muted">
                          Drag &amp; drop or browse your Excel / CSV report.
                        </p>
                      </div>
                      <div className="h-px flex-1 bg-border-color" />
                    </div>

                    <div className="relative rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-8 text-center shadow-sm transition duration-200 hover:border-violet-300 hover:dark:border-violet-500/30">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-100 to-indigo-100 text-violet-600 shadow-sm dark:text-violet-400">
                        <Upload size={24} />
                      </div>

                      <div className="mt-3 space-y-1">
                        <p className="text-sm font-semibold text-text-primary">
                          Click or drag a file to upload
                        </p>
                        <p className="text-xs text-text-muted">
                          .xlsx, .xls, .xlsb or .csv — up to {maxFileSizeMb} MB
                        </p>
                      </div>

                      <input
                        type="file"
                        accept=".xlsx,.xls,.xlsb,.csv"
                        onChange={handleFileChange}
                        disabled={uploading}
                        aria-label="Choose a report file"
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                      />
                    </div>

                    {file ? (
                      <div className="flex items-center gap-3 rounded-2xl border border-border-color bg-surface px-4 py-2.5 text-sm">
                        <FileText size={16} className="flex-shrink-0 text-text-muted" />
                        <span
                          className="min-w-0 flex-1 truncate text-text-secondary"
                          title={file.name}
                        >
                          {file.name}
                        </span>
                        <span className="flex-shrink-0 text-xs tabular-nums text-text-muted">
                          {describeSize(file.size)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setFile(null)}
                          disabled={uploading}
                          aria-label={`Remove ${file.name}`}
                          className="flex-shrink-0 text-text-muted transition hover:text-red-500 disabled:opacity-40"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-5 space-y-3">
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="text-sm font-semibold text-text-primary">
                          Bulk File Upload
                        </div>
                        <p className="text-xs text-text-muted">
                          Up to {maxBulkFiles} reports at a time.
                        </p>
                      </div>
                      <div className="h-px flex-1 bg-border-color" />
                    </div>

                    {/* The report date comes from the file name in bulk mode.
                        Stating the rule here saves a failed round trip. */}
                    <div className="flex gap-3 rounded-2xl border border-sky-200 bg-sky-50/70 px-4 py-3 dark:border-sky-500/20 dark:bg-sky-500/10">
                      <Info size={16} className="mt-0.5 flex-shrink-0 text-sky-600 dark:text-sky-400" />
                      <div className="min-w-0 text-xs text-sky-900 dark:text-sky-300">
                        <p className="font-semibold">
                          Each report date is read from its file name.
                        </p>
                        <p className="mt-1">
                          Required format:{" "}
                          <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px]">
                            reporttype_YYYY-MM-DD.xlsx
                          </code>{" "}
                          — for example{" "}
                          <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px]">
                            outage_{defaultReportDate}.xlsx
                          </code>
                        </p>
                        <p className="mt-1 opacity-80">
                          The part before the underscore cannot contain spaces, dots or dashes.
                        </p>
                      </div>
                    </div>

                    <div className="relative rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-8 text-center shadow-sm transition hover:border-violet-300 hover:dark:border-violet-500/30">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-100 to-indigo-100 text-violet-600 dark:text-violet-400">
                        <Upload size={24} />
                      </div>
                      <div className="mt-3 space-y-1">
                        <p className="text-sm font-semibold text-text-primary">
                          Click or drag files to upload
                        </p>
                        <p className="text-xs text-text-muted">
                          .xlsx, .xls, .xlsb or .csv — up to {maxFileSizeMb} MB each
                        </p>
                      </div>

                      <input
                        type="file"
                        multiple
                        accept=".xlsx,.xls,.xlsb,.csv"
                        onChange={handleBulkFilesChange}
                        disabled={uploading}
                        aria-label="Choose report files"
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                      />
                    </div>

                    {bulkNameIssues.length ? (
                      <div
                        role="alert"
                        className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
                      >
                        <p className="font-semibold">
                          {bulkNameIssues.length} file name
                          {bulkNameIssues.length === 1 ? "" : "s"} will be rejected:
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {bulkNameIssues.map((name) => (
                            <li key={name} className="truncate font-mono">• {name}</li>
                          ))}
                        </ul>
                        <p className="mt-1.5">
                          Rename them to reporttype_YYYY-MM-DD.xlsx, or remove them from the list.
                        </p>
                      </div>
                    ) : null}

                    {bulkFiles.length > 0 ? (
                      <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-2xl border border-border-color bg-surface p-2">
                        {bulkFiles.map((selectedFile) => {
                          const nameOk = bulkFileNamePattern.test(selectedFile.name);
                          return (
                            <div
                              key={selectedFile.name}
                              className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm hover:bg-surface-muted"
                            >
                              <FileText size={15} className="flex-shrink-0 text-text-muted" />
                              <span
                                className="min-w-0 flex-1 truncate text-text-secondary"
                                title={selectedFile.name}
                              >
                                {selectedFile.name}
                              </span>
                              <span className="flex-shrink-0 text-xs tabular-nums text-text-muted">
                                {describeSize(selectedFile.size)}
                              </span>
                              <span
                                className={`flex-shrink-0 text-xs font-medium ${
                                  nameOk
                                    ? "text-green-600 dark:text-green-400"
                                    : "text-amber-600 dark:text-amber-400"
                                }`}
                              >
                                {nameOk ? "Ready" : "Bad name"}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeBulkFile(selectedFile.name)}
                                disabled={uploading}
                                aria-label={`Remove ${selectedFile.name}`}
                                className="flex-shrink-0 text-text-muted transition hover:text-red-500 disabled:opacity-40"
                              >
                                <X size={15} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                )}
              </section>
            </div>

            {/* Footer — outside the scroll area so it is always reachable */}
            <div className="flex-shrink-0 border-t border-border-color/70 bg-surface px-4 py-3 sm:px-5">
              {uploading ? (
                <div className="mb-3">
                  <div className="mb-1.5 flex items-center justify-between text-xs text-text-secondary">
                    <span className="min-w-0 truncate">
                      {uploadProgress !== null && uploadProgress < 100
                        ? `Uploading ${
                            uploadType === "bulk"
                              ? `${bulkFiles.length} files`
                              : file?.name || "file"
                          }...`
                        : "Validating and saving on the server..."}
                    </span>
                    <span className="ml-3 flex-shrink-0 tabular-nums">
                      {uploadProgress !== null && uploadProgress < 100
                        ? `${uploadProgress}%`
                        : "Please wait"}
                    </span>
                  </div>
                  <div
                    className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
                    role="progressbar"
                    aria-valuenow={uploadProgress ?? undefined}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Upload progress"
                  >
                    <div
                      className={`h-full rounded-full bg-gradient-to-r from-violet-500 to-sky-500 transition-[width] duration-200 ${
                        uploadProgress !== null && uploadProgress < 100 ? "" : "animate-pulse"
                      }`}
                      style={{ width: `${uploadProgress ?? 100}%` }}
                    />
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                {/* Cancel stays mounted while uploading — removing it made the
                    footer jump and shifted the Upload button under the cursor. */}
                <button
                  type="button"
                  onClick={closeUploadModal}
                  disabled={uploading}
                  className={`${secondaryButtonClass} disabled:opacity-40`}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={!canSubmitUpload}
                  title={
                    bulkNameIssues.length
                      ? "Fix or remove the badly named files first"
                      : missingUploadFields.length
                      ? `Still needed: ${missingUploadFields.join(", ")}`
                      : undefined
                  }
                  className={`${primaryButtonClass} min-w-[150px] bg-gradient-to-r from-violet-500 via-indigo-500 to-sky-500 shadow-[0_20px_60px_rgba(76,78,255,0.24)]`}
                >
                  {uploading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      {editingId ? "Saving..." : "Uploading..."}
                    </>
                  ) : editingId ? (
                    <>
                      <Pencil size={16} />
                      Save Changes
                    </>
                  ) : (
                    <>
                      <Upload size={16} />
                      Upload
                      {uploadType === "bulk" && bulkFiles.length
                        ? ` ${bulkFiles.length} file${bulkFiles.length === 1 ? "" : "s"}`
                        : ""}
                    </>
                  )}
                </button>
              </div>

              {!uploading && missingUploadFields.length ? (
                <p className="mt-2 text-right text-[11px] text-text-muted">
                  Still needed: {missingUploadFields.join(", ")}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Duplicate confirmation ───────────────────────────────────────── */}
      {duplicateDialog.open ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay/45 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="duplicate-title"
        >
          <div className="animate-modal-enter w-full max-w-xl rounded-[20px] border border-border-color bg-surface p-5 shadow-[0_30px_90px_rgba(15,23,42,0.18)] sm:p-6">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
                Duplicate Report Check
              </p>
              <h3
                id="duplicate-title"
                className="text-lg font-semibold text-text-primary sm:text-xl"
              >
                {duplicateDialog.mode === "bulk"
                  ? `${duplicateDialog.duplicates.length} report${
                      duplicateDialog.duplicates.length === 1 ? "" : "s"
                    } already exist`
                  : "A report already exists for this date"}
              </h3>
              <p className="text-sm text-text-secondary">
                {duplicateDialog.mode === "bulk"
                  ? "Replacing deletes the existing data for these dates and loads the new files in its place. Skipping keeps what is already there and uploads only the new dates."
                  : `A ${siteType} ${reportType} report is already stored for this date. Replacing deletes its data and loads the new file in its place.`}
              </p>
            </div>

            <div className="mt-5 max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-border-color bg-surface-muted p-3">
              {duplicateDialog.duplicates.map((item, index) => (
                <div
                  key={`${item.fileName}-${item.report_date}-${index}`}
                  className="rounded-xl border border-border-color bg-surface px-4 py-2.5 text-sm shadow-sm"
                >
                  <div className="truncate font-medium text-text-primary" title={item.fileName}>
                    {item.fileName}
                  </div>
                  <div className="mt-0.5 text-xs text-text-muted">
                    Report date: {item.report_date}
                    {item.existing?.length ? ` • replaces "${item.existing[0].file_name}"` : ""}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDuplicateDialog}
                className={secondaryButtonClass}
                disabled={uploading}
              >
                Cancel
              </button>

              {duplicateDialog.mode === "bulk" ? (
                <button
                  type="button"
                  onClick={() => handleDuplicateAction("skip")}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-amber-200 bg-amber-50 px-5 text-sm font-medium text-amber-700 transition hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400 hover:dark:bg-amber-500/15"
                  disabled={uploading}
                >
                  Skip Existing
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => handleDuplicateAction("replace")}
                className={`${primaryButtonClass} min-w-[150px] bg-gradient-to-r from-rose-500 to-orange-500`}
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Replacing...
                  </>
                ) : duplicateDialog.mode === "bulk" ? (
                  "Replace All"
                ) : (
                  "Replace"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Export ───────────────────────────────────────────────────────── */}
      {exportPopupOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-title"
        >
          <button
            type="button"
            aria-label="Close"
            disabled={downloading}
            onClick={() => !downloading && setExportPopupOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-overlay/40 backdrop-blur-sm"
          />

          <div className="animate-modal-enter relative z-10 flex max-h-[92vh] w-full max-w-[520px] flex-col overflow-hidden rounded-[20px] border border-border-color/80 bg-surface shadow-[0_30px_90px_rgba(15,23,42,0.18)]">
            <div className="flex flex-shrink-0 items-start justify-between gap-4 border-b border-border-color/70 px-5 py-4 sm:px-6 sm:py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
                  {categoryLabel} Reports
                </p>
                <h2
                  id="export-title"
                  className="mt-1.5 text-lg font-semibold tracking-[-0.03em] text-text-primary sm:text-xl"
                >
                  Export by Date Range
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setExportPopupOpen(false)}
                disabled={downloading}
                aria-label="Close"
                className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-border-color bg-surface text-text-secondary shadow-sm transition hover:bg-surface-muted disabled:opacity-40"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
              {exportError ? (
                <div
                  role="alert"
                  className="whitespace-pre-line rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
                >
                  {exportError}
                </div>
              ) : null}

              <div>
                <span className={fieldLabelClass}>Site type</span>
                <Listbox
                  value={exportSiteType}
                  onChange={(value) => {
                    setExportSiteType(value);
                    setExportError("");
                  }}
                >
                  <div className="relative">
                    <Listbox.Button className={listboxButtonClass}>
                      <span className="flex min-w-0 items-center gap-2">
                        <Layers size={15} className="flex-shrink-0 text-text-muted" />
                        <span className="truncate">
                          {exportSiteType || "Select Site Type"}
                        </span>
                      </span>
                      <ChevronDown size={16} className="flex-shrink-0 text-text-muted" />
                    </Listbox.Button>

                    <Listbox.Options
                      anchor={{ to: "bottom start", gap: "0.5rem" }}
                      className={listboxOptionsClass}
                    >
                      {allowedSiteTypes.map((site) => (
                        <Listbox.Option
                          key={site.value}
                          value={site.value}
                          className={listboxOptionClass}
                        >
                          {site.label}
                        </Listbox.Option>
                      ))}
                    </Listbox.Options>
                  </div>
                </Listbox>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <span className={fieldLabelClass}>From date</span>
                  <PremiumDatePicker
                    value={exportFromDate}
                    onChange={(value) => {
                      setExportFromDate(value);
                      setExportError("");
                    }}
                  />
                </div>
                <div>
                  <span className={fieldLabelClass}>To date</span>
                  <PremiumDatePicker
                    value={exportToDate}
                    onChange={(value) => {
                      setExportToDate(value);
                      setExportError("");
                    }}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <span className={fieldLabelClass}>Circle</span>
                  <Listbox
                    value={exportCircle}
                    onChange={(value) => {
                      setExportCircle(value);
                      setExportError("");
                    }}
                  >
                    <div className="relative">
                      <Listbox.Button className={listboxButtonClass}>
                        <span className="truncate">{exportCircle || "All Circles"}</span>
                        <ChevronDown size={16} className="flex-shrink-0 text-text-muted" />
                      </Listbox.Button>
                      <Listbox.Options
                        anchor={{ to: "bottom start", gap: "0.5rem" }}
                        className={listboxOptionsClass}
                      >
                        <Listbox.Option value="" className={listboxOptionClass}>
                          All Circles
                        </Listbox.Option>
                        {availableCircles.map((circle) => (
                          <Listbox.Option key={circle} value={circle} className={listboxOptionClass}>
                            {circle}
                          </Listbox.Option>
                        ))}
                      </Listbox.Options>
                    </div>
                  </Listbox>
                </div>

                <div>
                  <span className={fieldLabelClass}>Report type</span>
                  <Listbox
                    value={exportReportType}
                    onChange={(value) => {
                      setExportReportType(value);
                      setExportError("");
                    }}
                  >
                    <div className="relative">
                      <Listbox.Button className={listboxButtonClass}>
                        <span className="truncate">
                          {reportOptions.find((option) => option.value === exportReportType)?.label}
                        </span>
                        <ChevronDown size={16} className="flex-shrink-0 text-text-muted" />
                      </Listbox.Button>
                      <Listbox.Options
                        anchor={{ to: "bottom start", gap: "0.5rem" }}
                        className={listboxOptionsClass}
                      >
                        {reportOptions.map((option) => (
                          <Listbox.Option key={option.value} value={option.value} className={listboxOptionClass}>
                            {option.label}
                          </Listbox.Option>
                        ))}
                      </Listbox.Options>
                    </div>
                  </Listbox>
                </div>
              </div>

              <p className="text-xs text-text-muted">
                Exports every record for the chosen Site Type between the two dates
                (inclusive), as a single Excel file.
              </p>

              {downloading ? (
                <div className="flex items-center gap-3 rounded-2xl border border-border-color bg-surface-muted px-4 py-3 text-sm text-text-secondary">
                  <span className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  <span className="min-w-0 flex-1">Building your file on the server...</span>
                  {downloadProgress !== null ? (
                    <span className="flex-shrink-0 tabular-nums text-text-muted">
                      {typeof downloadProgress === "number"
                        ? `${downloadProgress}%`
                        : downloadProgress}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex flex-shrink-0 flex-col-reverse gap-2 border-t border-border-color/70 bg-surface px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button
                type="button"
                onClick={() => setExportPopupOpen(false)}
                disabled={downloading}
                className={`${secondaryButtonClass} disabled:opacity-40`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={downloading}
                className={`${primaryButtonClass} min-w-[180px] bg-gradient-to-r from-emerald-500 to-teal-500`}
              >
                {downloading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Preparing file...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Download Excel
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Mounted only while there is a payload, so each failure opens the
          dialog fresh instead of on whatever page the last one was left at. */}
      {uploadErrorPayload ? (
        <ReportUploadErrorDialog
          payload={uploadErrorPayload}
          onClose={() => setUploadErrorPayload(null)}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmState)}
        busy={confirmBusy}
        title={confirmState?.title}
        description={confirmState?.description}
        confirmLabel={confirmState?.confirmLabel}
        onConfirm={confirmState?.onConfirm}
        onCancel={() => {
          if (!confirmBusy) setConfirmState(null);
        }}
      />
    </div>
  );
}

export default TowerReports;
