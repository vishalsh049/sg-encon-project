import { useMemo, useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { buildApiUrl } from "../lib/api";
import { hasPermission } from "../lib/session";
import axios from "axios";
import PremiumDatePicker from "../components/PremiumDatePicker";

function TowerReports() {
  const { siteCategory } = useParams();
  const normalizedCategory =
    siteCategory?.toLowerCase() === "fiber" ? "fiber" : "tower";
  const categoryLabel = normalizedCategory === "fiber" ? "Fiber" : "Tower";
  const accent =
    normalizedCategory === "fiber"
      ? {
          badge: "bg-emerald-50 text-emerald-700",
          button: "bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300",
          ring: "focus:border-emerald-400",
          file: "file:bg-emerald-600 hover:file:bg-emerald-700",
        }
      : {
          badge: "bg-indigo-50 text-indigo-700",
          button: "bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300",
          ring: "focus:border-indigo-400",
          file: "file:bg-indigo-600 hover:file:bg-indigo-700",
        };
  const canUploadReports = true;
const canDeleteReports = true;
const canDownloadFiles = true;
  const allowedSiteTypes = useMemo(
    () =>
      [
        { value: "AG2", label: "AG2" },
        { value: "ILA", label: "ILA" },
        { value: "AG1", label: "AG1" },
        { value: "ENB", label: "ENB" },
        { value: "GNB", label: "GNB" },
        { value: "ESC", label: "ESC" },
        { value: "HPODSC", label: "HPODSC" },
        { value: "OSC", label: "OSC" },
        { value: "GSC", label: "GSC", permission: "site.GSC" },
        { value: "ISC", label: "ISC" },
        { value: "WIFI", label: "WIFI", permission: "site.WIFI" },
      ].filter((site) => !site.permission || hasPermission(site.permission)),
    []
  );
  const allowedSiteTypeValues = useMemo(
    () => allowedSiteTypes.map((site) => site.value),
    [allowedSiteTypes]
  );

 const today = useMemo(() => {
  const d = new Date();
  d.setDate(d.getDate() - 1); // 🔥 yesterday only

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}, []);

  const [rows, setRows] = useState([]);
  const [filterDate, setFilterDate] = useState("");
const [filterSiteType, setFilterSiteType] = useState("");
const [filterReportType, setFilterReportType] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const [modalMessageType, setModalMessageType] = useState("success");
  const [modalLoadingText, setModalLoadingText] = useState("");
  const [date, setDate] = useState(today);
  const [siteType, setSiteType] = useState("");
  const [reportType, setReportType] = useState("");
  const [uploadType, setUploadType] = useState("single");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [uploadedBy, setUploadedBy] = useState(
    localStorage.getItem("userName") ||
      localStorage.getItem("name") ||
      localStorage.getItem("username") ||
      ""
  );
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [bulkRows, setBulkRows] = useState([
    { date: today, site_type: "", report_type: "", file: null },
  ]);

const [modalOpen, setModalOpen] = useState(false);
useEffect(() => {
  if (modalOpen) {
    document.body.style.overflow = "hidden"; // 🔥 lock background
  } else {
    document.body.style.overflow = "auto"; // 🔥 unlock
  }

  return () => {
    document.body.style.overflow = "auto";
  };
}, [modalOpen]);

const toSafeDate = (value, dateOnly = false) => {
  if (!value) return null;

  if (
    dateOnly &&
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return new Date(`${value}T00:00:00`);
  }

 const d = new Date(
  typeof value === "string"
    ? value.replace(" ", "T")  
    : value
);  
  return Number.isNaN(d.valueOf()) ? null : d;
};

  const formatTimestamp = (value) => {
    const d = toSafeDate(value);
    if (!d) return "-";
    return d.toLocaleString("en-IN", {
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
    const d = toSafeDate(value, true);
    if (!d) return "-";
    return d.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" });
  };

  const validExtensions = ["xlsx", "xls", "xlsb", "csv"];
  const isValidFile = (f) => {
    if (!f?.name) return false;
    const ext = f.name.split(".").pop().toLowerCase();
    return validExtensions.includes(ext);
  };

  const fetchReports = async () => {
    setTableLoading(true);
    try {
      const res = await axios.get(buildApiUrl("/api/reports"), {
        params: { siteCategory: normalizedCategory },
      });
      const sortedRows = (res.data?.rows || []).sort((a, b) => {
  const dateA = new Date(a.report_date);
  const dateB = new Date(b.report_date);
  return dateB - dateA; // latest first
});

setRows(sortedRows);
    } catch {
      setRows([]);
    } finally {
      setTableLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedCategory]);

  useEffect(() => {
    if (uploadType === "bulk") {
      setSiteType("");
      setReportType("");
      setBulkRows([{ date: today, site_type: "", report_type: "", file: null }]);
    }
  }, [uploadType, today]);

  const handleFileChange = (e) => {
    const picked = e.target.files?.[0] || null;
    if (!picked) {
      setFile(null);
      return;
    }
    if (!isValidFile(picked)) {
      setModalMessageType("error");
      setModalMessage(
        "Invalid file type. Please upload .xlsx, .xls, .xlsb, or .csv"
      );
      setFile(null);
      e.target.value = "";
      return;
    }
    setModalMessage("");
    setFile(picked);
  };

  const handleDelete = async (id) => {
  if (!window.confirm("Are you sure to delete?")) return;

  try {
    await axios.delete(buildApiUrl(`/api/reports/${id}`));
    fetchReports();
  } catch {
    alert("Delete failed");
  }
};
// SELECT SINGLE
const handleSelect = (id) => {
  if (selectedIds.includes(id)) {
    setSelectedIds(selectedIds.filter((i) => i !== id));
  } else {
    setSelectedIds([...selectedIds, id]);
  }
};

// BULK DELETE
const handleBulkDelete = async () => {
  if (selectedIds.length === 0) return;

  if (!window.confirm("Delete selected reports?")) return;

  try {
    await axios.post(buildApiUrl("/api/reports/bulk-delete"), {
      ids: selectedIds,
    });

    setRows(rows.filter((row) => !selectedIds.includes(row.id)));
    setSelectedIds([]);
  } catch {
    alert("Bulk delete failed");
  }
};

const handleBulkDownload = async () => {
  if (selectedIds.length === 0) return;

  try {
    const response = await fetch(
      buildApiUrl("/api/reports/bulk-download"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: selectedIds }),
      }
    );

    const blob = await response.blob();

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reports.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();

  } catch (error) {
    console.error(error);
    alert("Download failed");
  }
};

const handleDownload = (fileName) => {
  if (!fileName) return;
  const encoded = encodeURIComponent(fileName);
  const url = buildApiUrl(`/api/reports/download/${encoded}`);

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const handleEdit = (row) => {
  const formatDate = (dateString) => {
  const d = new Date(dateString);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

setDate(formatDate(row.report_date));
  setSiteType(row.site_type);
  setReportType(row.report_type);
  setUploadType(row.upload_type);
  setUploadedBy(row.uploaded_by || "");
  setModalOpen(true);
  setEditingId(row.id);
};

const handleBulkRowChange = (index, field, value) => {
  setBulkRows((prev) =>
    prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
  );
};

const handleBulkFileChange = (index, fileValue) => {
  setBulkRows((prev) =>
    prev.map((row, i) =>
      i === index ? { ...row, file: fileValue || null } : row
    )
  );
};

const addBulkRow = () => {
  setBulkRows((prev) => [
    ...prev,
    { date: today, site_type: "", report_type: "", file: null },
  ]);
};

const removeBulkRow = (index) => {
  setBulkRows((prev) => prev.filter((_, i) => i !== index));
};

  const handleUpload = async () => {
    setModalMessage("");
    setModalLoadingText("Uploading...");
    if (uploadType === "single") {
      if (!date || !siteType || !reportType || !uploadType) {
        setModalMessageType("error");
        setModalMessage("Please fill all required fields.");
        setModalLoadingText("");
        return;
      }
      if (!uploadedBy.trim()) {
        setModalMessageType("error");
        setModalMessage("Please enter Uploaded By.");
        setModalLoadingText("");
        return;
      }
    }

    if (uploadType === "single") {
      if (!file && !editingId) {
        setModalMessageType("error");
        setModalMessage("Please select a valid file to upload.");
        return;
      }
    } else {
      if (!bulkRows.length) {
        setModalMessageType("error");
        setModalMessage("Please add at least one row.");
        return;
      }
      const invalidRow = bulkRows.findIndex(
        (row) => !row.date || !row.site_type || !row.report_type || !row.file
      );
      if (invalidRow !== -1) {
        setModalMessageType("error");
        setModalMessage(
          `Please complete all fields in row ${invalidRow + 1}.`
        );
        return;
      }
    }


  const formData = new FormData();
formData.append("siteCategory", normalizedCategory);
formData.append("upload_type", uploadType);
formData.append("uploadedBy", uploadedBy.trim());

if (uploadType === "single") {
  formData.append("file", file);
  formData.append("date", date);
  formData.append("site_type", siteType);
  formData.append("report_type", reportType);
} else {
  const rowsPayload = bulkRows.map((row, index) => ({
    date: row.date,
    site_type: row.site_type,
    report_type: row.report_type,
    fileIndex: index,
  }));

  formData.append("rows", JSON.stringify(rowsPayload));

  bulkRows.forEach((row) => {
    formData.append("files", row.file);
  });
}

    try {
      setUploading(true);
      let response;
      if (editingId) {
        response = await axios.put(buildApiUrl(`/api/reports/${editingId}`), {
          site_type: siteType,
          report_type: reportType,
          upload_type: uploadType,
          uploaded_by: uploadedBy,
          report_date: date,
        });
      } 
      
      else if (uploadType === "bulk") {
  response = await axios.post(
    buildApiUrl("/api/reports/upload-bulk"),
    formData
  );
}
      
      else {
        response = await axios.post(buildApiUrl("/api/reports/upload"), formData);
      }
      setModalMessageType("success");
      setModalMessage(
        response?.data?.message || "Upload completed successfully."
      );
      setFile(null);
      setBulkRows([{ date: today, site_type: "", report_type: "", file: null }]);
      await fetchReports();
      setTimeout(() => {
        setModalOpen(false);
        setModalMessage("");
      }, 1200);
    } catch (err) {
      setModalMessageType("error");
      setModalMessage(err.response?.data?.message || "Upload failed");
    } finally {
      setUploading(false);
      setModalLoadingText("");
    }
  };

  const filteredRows = useMemo(() => rows.filter((row) => {
  const normalizedSearch = searchTerm.trim().toLowerCase();
  if (!allowedSiteTypeValues.includes(row.site_type)) return false;

  const rowDate = (() => {
    const d = toSafeDate(row.report_date, true);
    if (!d) return "";
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  })();

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
    (!filterReportType || row.report_type === filterReportType)
  );
}), [rows, filterDate, filterSiteType, filterReportType, searchTerm, allowedSiteTypeValues]);

// 👉 PAGINATION LOGIC
  const totalFiles = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalFiles / pageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [filterDate, filterSiteType, filterReportType, searchTerm, pageSize, normalizedCategory]);

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
  const allFilteredSelected =
    allFilteredIds.length > 0 &&
    allFilteredIds.every((id) => selectedIds.includes(id));

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds((prev) => [...new Set([...prev, ...allFilteredIds])]);
      return;
    }

    setSelectedIds((prev) => prev.filter((id) => !allFilteredIds.includes(id)));
  };

  return (
    <div className="w-full pb-32 text-text-primary md:pb-36">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-text-secondary">
              {categoryLabel} Reports
            </div>
            <h1 className="text-xl text-text-primary">{categoryLabel} Reports</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className={`rounded-full px-3 py-1 text-xs ${accent.badge}`}>
              Category: {categoryLabel}
            </div>
            {canUploadReports ? (
            <button
              onClick={() => {
  setEditingId(null); // reset edit mode

  setDate(today);
  setSiteType("");
  setReportType("");
  setUploadType("single");
  setUploadedBy(
    localStorage.getItem("userName") ||
    localStorage.getItem("name") ||
    localStorage.getItem("username") ||
    ""
  );
  setFile(null);
  setBulkRows([{ date: today, site_type: "", report_type: "", file: null }]);

  setModalOpen(true);
}}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-white transition ${accent.button}`}
            >
              Upload Reports
            </button>
            ) : null}

            {canDeleteReports ? (
  <button
    onClick={handleBulkDelete}
    disabled={selectedIds.length === 0}
    className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:bg-red-300"
  >
    Delete ({selectedIds.length})
  </button>
            ) : null}

{canDownloadFiles ? (
<button
  onClick={handleBulkDownload}
  disabled={selectedIds.length === 0}
  className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white disabled:bg-green-300"
>
  Download ({selectedIds.length})
</button>
            ) : null}

          </div>
        </div>

        <div className="app-surface p-4">

  {/* 🔥 ADD FILTER UI HERE */}
  <div className="mb-5">
    <label className="mb-1 block text-xs text-text-secondary">Search Reports</label>
    <input
      type="text"
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      placeholder="Search by file name, site type, report type, upload type, uploaded by, or date"
      className="app-input-lg w-full"
    />
  </div>

  <div className="mb-5 grid grid-cols-1 md:grid-cols-4 gap-4">

  {/* DATE */}
  <div className="flex flex-col gap-1">
    <label className="text-xs text-text-secondary">Date</label>
    <PremiumDatePicker
  value={filterDate}
  onChange={setFilterDate}
  isDateDisabled={(d) => {
    const today = new Date();
    today.setHours(0,0,0,0);

    const selected = new Date(d);
    selected.setHours(0,0,0,0);

    return selected >= today;
  }}
/>
  </div>

  {/* SITE TYPE */}
  <div className="flex flex-col gap-1">
    <label className="text-xs text-text-secondary">Site Type</label>
    <select
      value={filterSiteType}
      onChange={(e) => setFilterSiteType(e.target.value)}
      className="app-select"
    >
      <option value="">Select Site Type</option>
      {allowedSiteTypes.map((site) => (
        <option key={site.value} value={site.value}>
          {site.label}
        </option>
      ))}
    </select>
  </div>

  {/* REPORT TYPE */}
  <div className="flex flex-col gap-1">
    <label className="text-xs text-text-secondary">Report Type</label>
    <select
      value={filterReportType}
      onChange={(e) => setFilterReportType(e.target.value)}
      className="app-select"
    >
      <option value="">All Reports</option>
      <option value="Outage">Outage</option>
      <option value="Performance">Performance</option>
    </select>
  </div>

  {/* RESET BUTTON */}
  <div className="flex items-end">
    <button
      onClick={() => {
        setSearchTerm("");
        setFilterDate("");
        setFilterSiteType("");
        setFilterReportType("");
      }}
      className="app-button-ghost h-10 w-full"
    >
      Reset Filters
    </button>
  </div>

</div>

  {/* EXISTING CODE */}
  <div className="overflow-x-auto rounded-2xl border border-border-color">
            <table className="app-table">
              <thead>
                <tr>
                  <th className="py-3 pr-4">
  <input
    type="checkbox"
    onChange={handleSelectAll}
    checked={allFilteredSelected}
  />
</th>
                  <th className="py-3 pr-4">Date</th>
                  <th className="py-3 pr-4">Site Type</th>
                  <th className="py-3 pr-4">Report Type</th>
                  <th className="py-3 pr-4">Upload Type</th>
                  <th className="py-3 pr-4">Uploaded By</th>
                  <th className="py-3 pr-4">File Name</th>
                  <th className="py-3 pr-4">Uploaded At</th>
                  <th className="py-3 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tableLoading ? (
                  <tr>
                    <td className="py-6 text-text-secondary" colSpan={6}>
                      Loading...
                    </td>
                  </tr>
                ) : filteredRows.length ? (
                  paginatedRows.map((row) => (
                    <tr key={row.id}>
                      <td className="py-3 pr-4">
  <input
    type="checkbox"
    checked={selectedIds.includes(row.id)}
    onChange={() => handleSelect(row.id)}
  />
</td>
                      <td className="py-3 pr-4 text-text-primary">
                        {formatDateOnly(row.report_date)}
                      </td>
                      <td className="py-3 pr-4 text-text-primary">
                        {row.site_type || "-"}
                      </td>
                      <td className="py-3 pr-4 text-text-primary">
                        {row.report_type || "-"}
                      </td>
                      <td className="py-3 pr-4 text-text-primary">
                        {row.upload_type || "-"}
                      </td>
                      <td className="py-3 pr-4 text-text-primary">
                        {row.uploaded_by || "-"}
                      </td>
                      <td className="py-3 pr-4 text-text-primary">
                        {row.file_name || "-"}
                      </td>
                      <td className="py-3 pr-4 text-text-primary">
                     {formatTimestamp(row.uploaded_at)}
                      </td>

<td className="py-3 pr-4">
  <div className="flex items-center gap-3">

  {canDownloadFiles ? (
  <button
  onClick={() => handleDownload(row.file_name)}
  className="text-blue-600 hover:underline"
>
  Download
</button>
  ) : null}

  {canUploadReports ? (
  <button
    onClick={() => handleEdit(row)}
    className="text-green-600 hover:underline"
  >
    Edit
  </button>
  ) : null}

  {canDeleteReports ? (
  <button
    onClick={() => handleDelete(row.id)}
    className="text-red-600 hover:underline"
  >
    Delete
  </button>
  ) : null}
</div>
</td>

                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="py-6 text-text-secondary" colSpan={9}>
                      No reports uploaded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-50 md:left-[var(--sidebar-width)]">
        <div className="w-full border-t border-border-color bg-surface px-4 py-3 shadow-soft md:px-6">

      <div className="flex justify-between items-center">

        {/* LEFT */}
        <div className="text-sm text-text-secondary">
          Total files:
          <span className="ml-1 font-semibold text-text-primary">
            {totalFiles}
          </span>
        </div>

        {/* RIGHT */}
        <div className="flex items-center gap-3">

          <span className="text-sm text-text-secondary">Show</span>

          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="h-9 border rounded px-2 text-sm"
          >
            {[10, 15, 30, 50, 100].map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>

          <button
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 border rounded text-sm disabled:opacity-50"
          >
            Prev
          </button>

          <span className="text-sm">
            Page {currentPage} of {totalPages}
          </span>

          <button
            onClick={() =>
              setCurrentPage((prev) => Math.min(totalPages, prev + 1))
            }
            disabled={currentPage === totalPages}
            className="px-3 py-1 border rounded text-sm disabled:opacity-50"
          >
            Next
          </button>

        </div>
      </div>
  </div>
</div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm overflow-hidden">
          <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-white p-8 shadow-[0_20px_60px_rgba(15,23,42,0.2)] overflow-hidden">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-500">
                  {categoryLabel} Reports
                </div>
                <h2 className="text-lg text-gray-800">
  {editingId ? "Edit Report" : "Upload Reports"}
</h2>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-md border border-gray-200 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>

            {modalMessage ? (
              <div
                className={`mb-4 rounded-lg px-3 py-2 text-sm ${
                  modalMessageType === "error"
                    ? "border border-red-200 bg-red-50 text-red-700"
                    : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
              >
                {modalMessage}
              </div>
            ) : null}

            {modalLoadingText ? (
              <div className="mb-3 text-xs text-gray-500 h-4">
              {modalLoadingText || ""}
             </div>
            ) : null}

            <div className="flex-1 overflow-y-auto px-8 py-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {uploadType === "single" ? (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-600">Date</label>
                    <PremiumDatePicker
                   value={date}
                     onChange={setDate}
                     isDateDisabled={(d) => {
                      const today = new Date();
                      today.setHours(0,0,0,0);
                      const selected = new Date(d);
                        selected.setHours(0,0,0,0);
                       return selected >= today; // ❌ block today + future
                        }}
                      />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-600">Site Type</label>
                    <select
                      value={siteType}
                      onChange={(e) => setSiteType(e.target.value)}
                      className={`h-10 rounded-lg border border-gray-200 px-3 text-sm text-gray-800 focus:outline-none ${accent.ring}`}
                    >

                      <option value="">Select Site Type</option>
                      {allowedSiteTypes.map((site) => (
                        <option key={site.value} value={site.value}>
                          {site.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-600">Report Type</label>
                    <select
                      value={reportType}
                      onChange={(e) => setReportType(e.target.value)}
                      className={`h-10 rounded-lg border border-gray-200 px-3 text-sm text-gray-800 focus:outline-none ${accent.ring}`}
                    >
                      <option value="">Select Report Type</option>
                      <option value="Outage">Outage Report</option>
                      <option value="Performance">Performance Report</option>
                    </select>
                  </div>
                </>
              ) : null}

              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-600">Upload Type</label>
                <div className="flex items-center gap-4 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="uploadType"
                      value="single"
                      checked={uploadType === "single"}
                      onChange={(e) => setUploadType(e.target.value)}
                      className={
                        normalizedCategory === "fiber"
                          ? "text-emerald-600"
                          : "text-indigo-600"
                      }
                    />
                    Single Upload
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="uploadType"
                      value="bulk"
                      checked={uploadType === "bulk"}
                      onChange={(e) => setUploadType(e.target.value)}
                      className={
                        normalizedCategory === "fiber"
                          ? "text-emerald-600"
                          : "text-indigo-600"
                      }
                    />
                    Bulk Upload
                  </label>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-600">Uploaded By</label>
                <input
                  type="text"
                  value={uploadedBy}
                  onChange={(e) => setUploadedBy(e.target.value)}
                  placeholder="Enter name"
                  className={`h-10 rounded-lg border border-gray-200 px-3 text-sm text-gray-800 focus:outline-none ${accent.ring}`}
                />
              </div>

              {uploadType === "bulk" ? (
                <div className="md:col-span-2">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      Bulk rows (each row = one file + one record)
                    </div>
                    <button
                      type="button"
                      onClick={addBulkRow}
                      className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      + Add Row
                    </button>
                  </div>

                 <div className="max-h-[50vh] overflow-y-auto pr-2 space-y-6 relative">
                    {bulkRows.map((row, index) => (
                      <div
                         key={index}
                         className="relative grid grid-cols-1 gap-4 rounded-xl border border-gray-200 p-4 md:grid-cols-8"
                        >
                        <div className="md:col-span-2">
                          <label className="text-sm text-gray-600">Date</label>
                          <PremiumDatePicker
                          value={row.date}
                          onChange={(nextValue) =>
                             handleBulkRowChange(index, "date", nextValue)
                             }
                               isDateDisabled={(d) => {
                               const today = new Date();
                               today.setHours(0,0,0,0);
                                  const selected = new Date(d);
                                 selected.setHours(0,0,0,0);
                                    return selected >= today;
                                   }}
                               />
                        </div>

                        <div className="md:col-span-2">
                          <label className="text-sm text-gray-600">
                            Site Type
                          </label>
                          <select
                            value={row.site_type}
                            onChange={(e) =>
                              handleBulkRowChange(
                                index,
                                "site_type",
                                e.target.value
                              )
                            }
                            className={`h-12 w-full rounded-lg border border-gray-200 px-4 text-base text-gray-800 focus:outline-none ${accent.ring}`}
                          >

                            <option value="">All Site Types</option>
                            {allowedSiteTypes.map((site) => (
                              <option key={site.value} value={site.value}>
                                {site.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="md:col-span-2">
                          <label className="text-sm text-gray-600">
                            Report Type
                          </label>
                          <select
                            value={row.report_type}
                            onChange={(e) =>
                              handleBulkRowChange(
                                index,
                                "report_type",
                                e.target.value
                              )
                            }
                            className={`h-12 w-full rounded-lg border border-gray-200 px-4 text-base text-gray-800 focus:outline-none ${accent.ring}`}
                          >
                            <option value="">Select Report Type</option>
                            <option value="Outage">Outage Report</option>
                            <option value="Performance">Performance Report</option>
                          </select>
                        </div>

                        <div className="md:col-span-2">
                          <label className="text-sm text-gray-600">File</label>
                          <input
                            type="file"
                            accept=".xlsx,.xls,.xlsb,.csv"
                            onChange={(e) =>
                              handleBulkFileChange(
                                index,
                                e.target.files?.[0] || null
                              )
                            }
                            className={`block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-2 file:text-white ${accent.file}`}
                          />
                          {row.file ? (
                            <div className="mt-1 truncate text-sm text-gray-500">
                              {row.file.name}
                            </div>
                          ) : null}
                        </div>

                        <div className="md:col-span-8">
                          <button
                            type="button"
                            onClick={() => removeBulkRow(index)}
                            className="text-sm text-red-600 hover:underline"
                          >
                            Remove Row
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-xs text-gray-600">Excel/CSV File</label>
                  <div className="flex items-center gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-3">
                    <input
                      type="file"
                      accept=".xlsx,.xls,.xlsb,.csv"
                      onChange={handleFileChange}
                      className={`block w-full text-sm text-gray-700 file:mr-4 file:rounded-md file:border-0 file:px-3 file:py-2 file:text-white ${accent.file}`}
                    />
                    {file ? (
                      <span className="text-xs text-gray-500 truncate">
                        {file.name}
                      </span>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
            </div>

            <div className="mt-4 pt-4 border-t flex items-center justify-end gap-2 bg-white">
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
             <button
  onClick={handleUpload}
  disabled={uploading}
  className={`inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2 text-sm text-white transition disabled:cursor-not-allowed min-w-[120px] ${accent.button}`}
>
                   {uploading ? "Uploading..." : "Upload"}
                   </button>
            </div>
          </div>


        </div>
      ) : null}
    </div>
  );
}

export default TowerReports;