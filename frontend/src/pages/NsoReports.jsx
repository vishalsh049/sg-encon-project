import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  ChartColumnBig,
  Download,
  FileSpreadsheet,
  Filter,
  Pencil,
  RefreshCcw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { buildApiUrl, authFetch } from "../lib/api";
import PremiumDatePicker from "../components/PremiumDatePicker";

// Saves an already-fetched file response as a download. Shared by every
// download/export path below so they all behave identically.
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

// Reads the server's JSON error message out of a failed response, whether
// it's a normal JSON error body or one wrapped in a downloaded-file-shaped
// response (Content-Type json but requested via blob-adjacent code paths).
async function readNsoErrorMessage(response, fallback) {
  try {
    const payload = await response.clone().json();
    if (typeof payload?.message === "string" && payload.message.trim()) {
      return payload.message;
    }
  } catch {
    // not JSON — fall through to the generic message
  }
  return fallback;
}

const EMPTY_TOAST = { message: "", type: "success" };

function NsoReports() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({
    totalReports: 0,
    totalRecords: 0,
    totalSiteTypes: 0,
    latestUploadAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
 const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Page-level toast for download/export progress — none of the three
  // download paths (single, bulk, CSV export) gave any feedback while a
  // file was being generated, so a slow request looked identical to a
  // broken button. Same self-contained pattern already used in
  // TowerReports.jsx (state + timer + a fixed-position banner rendered at
  // the page root).
  const [toast, setToast] = useState(EMPTY_TOAST);
  const toastTimer = useRef(null);

  const showToast = useCallback((toastMessage, type = "success", durationMs = 3200) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message: toastMessage, type });
    toastTimer.current = setTimeout(() => setToast(EMPTY_TOAST), durationMs);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);
  const [circleCounts, setCircleCounts] = useState([]);

const today = useMemo(() => {
  const date = new Date();

  date.setDate(date.getDate() - 1);

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}, []);

  const [form, setForm] = useState({
    report_date: today,
    uploaded_by:
      localStorage.getItem("userName") ||
      localStorage.getItem("name") ||
      localStorage.getItem("username") ||
      "",
    file: null,
  });

 const toSafeDate = (value, dateOnly = false) => {
  if (!value) return null;

  if (
    dateOnly &&
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return new Date(`${value}T00:00:00`);
  }

  const date = new Date(
    typeof value === "string" ? value.replace(" ", "T") : value
  );

  return Number.isNaN(date.valueOf()) ? null : date;
 };

 const formatDateOnly = (value) => {

  if (!value) return "-";

  const date = toSafeDate(value, true);

  if (!date) return "-";

  return date.toLocaleDateString("en-GB", {
    timeZone: "Asia/Kolkata",
  });

};

const formatTimestamp = (value) => {

  if (!value) return "-";

  const date = toSafeDate(value);

  if (!date) return "-";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);

};

 const getRowDateValue = (row) => {

  if (!row?.report_date) return "";

  const date = toSafeDate(row.report_date, true);

  if (!date) return "";

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;

};

  const resetForm = () => {
    setForm({
      report_date: today,
      uploaded_by:
        localStorage.getItem("userName") ||
        localStorage.getItem("name") ||
        localStorage.getItem("username") ||
        "",
      file: null,
    });
    setEditingId(null);
    setMessage("");
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rowsRes, summaryRes, circleRes] = await Promise.all([
        axios.get(buildApiUrl("/api/nso")),
        axios.get(buildApiUrl("/api/nso/summary")),
        axios.get(buildApiUrl("/api/nso/circle-count")),
      ]);
     setRows(rowsRes.data?.rows || []);

setCircleCounts(circleRes.data || []);

setSummary(
  summaryRes.data || {
    totalReports: 0,
    totalRecords: 0,
    totalSiteTypes: 0,
    latestUploadAt: null,
  }
);
    } catch (_error) {
      setRows([]);
      setSummary({
        totalReports: 0,
        totalRecords: 0,
        totalSiteTypes: 0,
        latestUploadAt: null,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

 const filteredRows = useMemo(() => {

  const normalizedSearch = searchTerm.trim().toLowerCase();

  return rows
    .filter((row) => {

      const rowDate = getRowDateValue(row);

      const matchesSearch =
        !normalizedSearch ||
        [
          row.uploaded_by,
          row.original_name,
          row.file_name,
          rowDate,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(normalizedSearch)
          );

      return (
        matchesSearch &&
        (!filterDate || rowDate === filterDate)
      );

    })

    .sort((a, b) => {

      const dateA = toSafeDate(a.report_date, true);
      const dateB = toSafeDate(b.report_date, true);

      return (dateB?.valueOf() || 0) - (dateA?.valueOf() || 0);

    });

}, [
  rows,
  searchTerm,
  filterDate,
]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));

 useEffect(() => {
  setCurrentPage(1);
}, [searchTerm, filterDate, pageSize]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setSelectedIds((prev) =>
      prev.filter((id) => filteredRows.some((row) => row.id === id))
    );
  }, [filteredRows]);

  const paginatedRows = filteredRows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const allFilteredIds = filteredRows.map((row) => row.id);
  const allSelected =
    allFilteredIds.length > 0 &&
    allFilteredIds.every((id) => selectedIds.includes(id));

  const stats = [
   
    {
      label: "Total Fiber Cut",
      value: summary.totalRecords || 0,
      helper: "Latest report fiber cut count",
      icon: ChartColumnBig,
    },
  
  ];

  const openCreateModal = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEditModal = (row) => {
    setEditingId(row.id);
    setForm({
      report_date: getRowDateValue(row) || today,
      uploaded_by: row.uploaded_by || "",
      file: null,
    });
    setMessage("");
    setModalOpen(true);
  };

  const handleFileChange = (event) => {
    const nextFile = event.target.files?.[0] || null;
    setForm((prev) => ({ ...prev, file: nextFile }));
  };

  const handleSubmit = async () => {
    setMessage("");

    if (!form.report_date) {
      setMessageType("error");
      setMessage("Please complete all required fields.");
      return;
    }

    if (!form.uploaded_by.trim()) {
      setMessageType("error");
      setMessage("Uploaded By is required.");
      return;
    }

    if (!editingId && !form.file) {
      setMessageType("error");
      setMessage("Please choose a file to upload.");
      return;
    }

    try {
      setSubmitting(true);

      if (editingId) {
        await axios.put(buildApiUrl(`/api/nso/${editingId}`), {
          report_date: form.report_date,
          uploaded_by: form.uploaded_by.trim(),
        });
        setMessageType("success");
        setMessage("Report updated successfully.");
      } else {
        const formData = new FormData();
        formData.append("file", form.file);
        formData.append("date", form.report_date);
        formData.append("uploadedBy", form.uploaded_by.trim());

        await axios.post(buildApiUrl("/api/nso/upload"), formData);
        setMessageType("success");
        setMessage("Report uploaded successfully.");
      }

      await fetchData();
      setTimeout(() => {
        setModalOpen(false);
        resetForm();
      }, 900);
    } catch (error) {
      setMessageType("error");
      setMessage(error.response?.data?.message || "Request failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this NSO report?")) return;

    try {
      await axios.delete(buildApiUrl(`/api/nso/${id}`));
      await fetchData();
    } catch (_error) {
      window.alert("Delete failed");
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return;
    if (!window.confirm("Delete selected NSO reports?")) return;

    try {
      await axios.post(buildApiUrl("/api/nso/bulk-delete"), {
        ids: selectedIds,
      });
      setSelectedIds([]);
      await fetchData();
    } catch (_error) {
      window.alert("Bulk delete failed");
    }
  };

const handleDownload = async (row) => {

  showToast("Your file is being prepared. Please wait...", "success", 8000);

  try {

    // Was plain fetch() with no auth header — every request the app
    // actually needs a login for goes through axios (which attaches the
    // token via a global interceptor) or authFetch(). Plain fetch() here
    // meant this always got rejected with 401 "Authentication required",
    // which the code below correctly detected and reported as a generic
    // "Download failed" — the button never worked, for anyone.
    const response = await authFetch(
      buildApiUrl(`/api/nso/download/${row.id}`)
    );

    if (!response.ok) {
      throw new Error(await readNsoErrorMessage(response, "Download failed."));
    }

    const blob = await response.blob();

    const sanitizedName = row.original_name
      ? `${row.original_name.replace(/\.[^/.]+$/, "")}.xlsx`
      : `nso_report_${row.id}.xlsx`;

    saveBlob(blob, response.headers.get("content-type"), sanitizedName);

    showToast(`"${sanitizedName}" downloaded successfully.`, "success");

  } catch (error) {

    console.log(error);

    showToast(error.message || "Download failed", "error", 5000);

  }

};

  const handleBulkDownload = async () => {
    if (!selectedIds.length) return;

    showToast(
      `Preparing ${selectedIds.length} file${selectedIds.length === 1 ? "" : "s"} for download. Please wait...`,
      "success",
      8000
    );

    try {
      // Same missing-auth bug as handleDownload, plus this never checked
      // response.ok before saving — a failed request's JSON error body was
      // being saved to disk as "nso-reports.zip" with no indication anything
      // was wrong.
      const response = await authFetch(buildApiUrl("/api/nso/bulk-download"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: selectedIds }),
      });

      if (!response.ok) {
        throw new Error(await readNsoErrorMessage(response, "Bulk download failed."));
      }

      const blob = await response.blob();
      saveBlob(blob, response.headers.get("content-type"), "nso-reports.zip");
      showToast("Bulk download complete.", "success");
    } catch (error) {
      showToast(error.message || "Bulk download failed", "error", 5000);
    }
  };

  const handleExport = async () => {
    showToast("File download is in progress. Please wait...", "success", 8000);

    try {
      // Was a plain <a href> click — a browser navigation like that can
      // never carry the Authorization header this app's login uses, so
      // every export was silently downloading the server's 401 error body
      // renamed to a .csv file instead of real data.
      const response = await authFetch(buildApiUrl("/api/nso/export"));

      if (!response.ok) {
        throw new Error(await readNsoErrorMessage(response, "Export failed."));
      }

      const blob = await response.blob();
      saveBlob(blob, response.headers.get("content-type"), `nso-reports-${Date.now()}.csv`);
      showToast("CSV export downloaded.", "success");
    } catch (error) {
      showToast(error.message || "Export failed", "error", 5000);
    }
  };

  {/* main return */}

  return (
   <div className="w-full pb-24">
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
    <div className="mx-auto w-full space-y-2">
     <section className="relative overflow-hidden rounded-[18px] border border-border-color px-4 py-3
      bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.2),_transparent_30%),linear-gradient(135deg,#f8fafc_0%,#eef6ff_45%,#fff8ed_100%)]">
     <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" />
      <div className="absolute bottom-0 left-1/3 h-32 w-32 rounded-full bg-amber-200/30 blur-3xl" />

     <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
      
        <h1 className="text-sm font-semibold tracking-[-0.03em] text-text-primary md:text-lg">
                NSO reports with a real operations workflow
        </h1>
          <p className=" max-w-2xl text-sm leading-6 text-text-secondary md:text-md">
                Upload, search, export, and manage NSO activity in one place.
          </p>
      </div>

       <div className="flex flex-wrap gap-3">
         <button onClick={handleExport}
          className="inline-flex items-center gap-2 rounded-2xl border border-border-strong bg-surface/85
           px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-surface">
            <Download size={16} />
               Export CSV
         </button>
         <button onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm
           font-medium text-white transition hover:bg-slate-800">
             <Upload size={16} />
                Upload NSO Report
          </button>
        </div>
       </div>
    </section>

  <section className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_920px]">
   <div className="grid grid-cols-1 gap-2 md:grid-cols-1">
     {stats.map((stat) => {
     const Icon = stat.icon;
    return (
     <div key={stat.label}
       className="rounded-[22px] border border-border-color bg-surface px-4 py-2
        ">
        <div className=" flex items-center justify-between">
         <div className="text-sm font-medium text-text-muted">
             {stat.label}
         </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-surface-muted text-text-secondary">
             <Icon size={14} />
        </div>
      </div>
    <div className="text-lg font-semibold tracking-[-0.03em] text-text-primary">
            {stat.value}
      </div>
     <div className="mt-1 text-xs uppercase tracking-[0.1em] text-text-muted">
          {stat.helper}
      </div>
     </div>
    )
   })}
 </div>

    {/* circle wise count */}
  <div className="rounded-[22px] border border-border-color bg-surface px-4 py-3">

  <div className="mb-2 flex items-center">
    <h2 className="text-sm font-medium text-text-primary tracking-[-0.03em]">
      Circle Wise Fiber Cut
    </h2>
   <div className="ml-auto mr-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-400">
  Current Month - MTD
</div>

<div className="rounded-xl bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-100 dark:border-cyan-500/20 px-3 py-1 text-xs font-semibold text-cyan-700 dark:text-cyan-400">

  {
    new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    ).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
    })
  }

  {" - "}

  {
    new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
    })
  }

</div>
  </div>

<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">

  {circleCounts.map((item, index) => (

    <div
      key={index}
      className="rounded-xl border border-border-color bg-gradient-to-br from-surface-muted to-white px-3 py-2"
    >

   <div className="flex items-center justify-between text-sm font-medium text-text-muted">
  
  <span>
    {item.circle}
  </span>

  <span className="font-semibold text-text-primary">
    {item.total}
  </span>

</div>

    </div>

  ))}

</div>

</div>

        </section>

        <section className="rounded-[18px] border border-border-color bg-surface/90 backdrop-blur-xl p-2 md:p-2">

          <div className="flex flex-wrap items-center gap-3">
            <label className="relative block">
              <Search
                size={16}
                className="pointer-events-none absolute left-4 top-[14px] text-text-muted"
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="File name, site, report, uploader, date"
                className="h-10 w-[580px] rounded-2xl border border-border-color bg-surface-muted pl-10 pr-4
                 text-sm text-text-primary outline-none transition focus:border-cyan-400 focus:bg-surface"
              />
            </label>

            <div className="w-[220px] rounded-lg border border-border-color">
              <PremiumDatePicker
                value={filterDate}
                onChange={setFilterDate}
                className="w-full "
              />
            </div>

                <div className="ml-auto flex flex-wrap gap-3">
              <button
                onClick={handleBulkDownload}
                disabled={!selectedIds.length}
                className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download size={14} />
                Download ({selectedIds.length})
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={!selectedIds.length}
                className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-700 dark:text-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={14} />
                Delete ({selectedIds.length})
              </button>
            </div>

            <div className="flex items-end gap-3">

              <button
                onClick={() => {
                  setSearchTerm("");
                  setFilterDate("");
                  
                }}
                className="inline-flex items-center justify-center rounded-2xl border border-border-color bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-surface-muted"
              >
                Reset
              </button>
            </div>
          </div>
        </section>

    
        <section className="overflow-hidden rounded-[22px] border border-border-color bg-surface shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-3 border-b border-border-color px-5 py-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">
                NSO Upload Register
              </h2>
            </div>

            <div className="flex items-center gap-3 text-sm text-text-muted">
              <span>Rows per page</span>
              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
                className="h-6 rounded-xl border border-border-color bg-surface-muted px-2 text-sm text-text-secondary"
              >
                {[10, 20, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-surface-muted text-text-muted">
                <tr>
                  <th className="px-5 py-4">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setSelectedIds((prev) => [
                            ...new Set([...prev, ...allFilteredIds]),
                          ]);
                          return;
                        }
                        setSelectedIds((prev) =>
                          prev.filter((id) => !allFilteredIds.includes(id))
                        );
                      }}
                    />
                  </th>
                  <th className="px-5 py-4 font-medium">Date</th>
                  <th className="px-5 py-4 font-medium">Uploaded By</th>
                  <th className="px-5 py-4 font-medium">File Name</th>
                  <th className="px-5 py-4 font-medium">Uploaded At</th>
                  <th className="px-5 py-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="10" className="px-5 py-12 text-center text-text-muted">
                      Loading NSO reports...
                    </td>
                  </tr>
                ) : paginatedRows.length ? (
                  paginatedRows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-border-color transition hover:bg-surface-muted/80"
                    >
                      <td className="px-5 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(row.id)}
                          onChange={() =>
                            setSelectedIds((prev) =>
                              prev.includes(row.id)
                                ? prev.filter((id) => id !== row.id)
                                : [...prev, row.id]
                            )
                          }
                        />
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        {formatDateOnly(row.report_date)}
                      </td>
                      
                      <td className="px-5 py-4 text-text-secondary">
                        {row.uploaded_by || "-"}
                      </td>
                      <td className="max-w-[220px] px-5 py-4 text-text-secondary">
                        <div className="truncate" title={row.original_name || row.file_name}>
                          {row.original_name || row.file_name || "-"}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-text-secondary">
                        {formatTimestamp(row.uploaded_at)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="ml-auto flex flex-wrap gap-3">
                          <button
                            onClick={() => handleDownload(row)}
                            className="inline-flex items-center gap-1 text-sm font-medium text-cyan-700 dark:text-cyan-400 hover:text-cyan-900"
                            title="Download"
                          >
                            <Download size={15} />
                            Download
                          </button>
                          <button
                            onClick={() => openEditModal(row)}
                            className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-900"
                          >
                            <Pencil size={15} />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(row.id)}
                            className="inline-flex items-center gap-1 text-sm font-medium text-rose-700 dark:text-rose-400 hover:text-rose-900"
                          >
                            <Trash2 size={15} />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="10" className="px-5 py-14 text-center">
                      <div className="mx-auto max-w-md">
                        <div className="text-lg font-semibold text-text-primary">
                          No NSO reports found
                        </div>
                        <div className="mt-2 text-sm text-text-muted">
                          Try adjusting your filters or upload a new file to
                          start building the register.
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-4 border-t border-border-color px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-text-muted">
              Showing{" "}
              <span className="font-semibold text-text-primary">
                {paginatedRows.length}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-text-primary">
                {filteredRows.length}
              </span>{" "}
              filtered reports
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="rounded-xl border border-border-color px-4 py-2 text-sm font-medium text-text-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Prev
              </button>
              <div className="text-sm text-text-secondary">
                Page {currentPage} of {totalPages}
              </div>
              <button
                onClick={() =>
                  setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                }
                disabled={currentPage === totalPages}
                className="rounded-xl border border-border-color px-4 py-2 text-sm font-medium text-text-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-[30px] border border-border-color bg-surface shadow-[0_30px_80px_rgba(15,23,42,0.2)]">
            <div className="flex items-start justify-between border-b border-border-color px-6 py-5">
              <div>
                <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-text-primary">
                  {editingId ? "Edit NSO report" : "Upload NSO report"}
                </h2>
                <p className="mt-1 text-sm text-text-muted">
                  {editingId
                    ? "Update metadata for an existing report."
                    : "Add a fresh workbook and capture its tracking details."}
                </p>
              </div>

              <button
                onClick={() => {
                  setModalOpen(false);
                  resetForm();
                }}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border-color text-text-muted transition hover:bg-surface-muted hover:text-text-secondary"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 px-6 py-6">
              {message ? (
                <div
                  className={`rounded-2xl px-4 py-3 text-sm ${
                    messageType === "error"
                      ? "border border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400"
                      : "border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  }`}
                >
                  {message}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-text-muted">
                    Report Date
                  </label>
                 <PremiumDatePicker
  value={form.report_date}
  onChange={(value) =>
    setForm((prev) => ({
      ...prev,
      report_date: value,
    }))
  }
  isDateDisabled={(d) => {
    // Was comparing against "yesterday" (>= yesterday disabled), which
    // disabled yesterday itself — the exact date the form defaults to
    // (`today` above is actually computed as yesterday). Opening the modal
    // pre-filled a date the picker wouldn't let you click. Compare against
    // today instead: today/future disabled, yesterday and earlier allowed.
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const selected = new Date(d);
    selected.setHours(0, 0, 0, 0);

    return selected >= today;
  }}
  className="w-full"
/>
                </div>

                <label className="block">
                  <span className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-text-muted">
                    Uploaded By
                  </span>
                  <input
                    type="text"
                    value={form.uploaded_by}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        uploaded_by: event.target.value,
                      }))
                    }
                    placeholder="Team member name"
                    className="h-10 w-full rounded-2xl border border-border-color bg-surface-muted px-4 text-sm text-text-primary outline-none transition focus:border-cyan-400 focus:bg-surface"
                  />
                </label>

                {!editingId ? (
                  <label className="block md:col-span-2">
                    <span className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-text-muted">
                      Workbook File
                    </span>
                    <div className="rounded-[24px] border border-dashed border-border-strong bg-surface-muted p-4">
                      <input
                        type="file"
                        accept=".xlsx,.xls,.xlsb,.csv"
                        onChange={handleFileChange}
                        className="block w-full text-sm text-text-secondary file:mr-4 file:rounded-xl file:border-0 file:bg-slate-900 file:px-4 file:py-2.5 file:text-white"
                      />
                      <div className="mt-3 text-sm text-text-muted">
                        {form.file
                          ? form.file.name
                          : "Supported formats: .xlsx, .xls, .xlsb, .csv"}
                      </div>
                    </div>
                  </label>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border-color px-6 py-5">
              <button
                onClick={() => {
                  setModalOpen(false);
                  resetForm();
                }}
                className="rounded-2xl border border-border-color px-4 py-2.5 text-sm font-medium text-text-secondary transition hover:bg-surface-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Saving..." : editingId ? "Save Changes" : "Upload Report"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default NsoReports;
