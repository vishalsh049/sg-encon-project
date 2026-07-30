import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { buildApiUrl, getAuthHeaders } from "../lib/api";
import {
  Upload,
  Search,
  RotateCcw,
  ChevronDown,
  IndianRupee,
  Layers,
  Network,
  TowerControl,
  FileUp,
  Download,
  Trash2,
  Table2,
  ListFilter,
} from "lucide-react";

function formatNumber(value) {
  const n = Number(value || 0);
  return n.toLocaleString();
}

export default function RevenuePage() {
  const [data, setData] = useState([]);
  const [uploadedBy, setUploadedBy] = useState("");
  const [uploadTime, setUploadTime] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [file, setFile] = useState(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [kpi, setKpi] = useState({});
  const [uploading, setUploading] = useState(false);


    // Filters / UI state
    const [filterDate, setFilterDate] = useState(""); // YYYY-MM, matches billing_month
    const [filterCircle, setFilterCircle] = useState(""); // dropdown value ('' = all)
    const [searchQuery, setSearchQuery] = useState("");
    const [circleList, setCircleList] = useState([]);

    const [selectedRows, setSelectedRows] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const rowsPerPage = 5;

    // Revenue Data tab: actual line items (circle/location/CO type/amounts...),
    // server-paginated since the underlying table can grow large.
    const [activeTab, setActiveTab] = useState("uploads"); // 'uploads' | 'data'
    const [dataRows, setDataRows] = useState([]);
    const [dataTotal, setDataTotal] = useState(0);
    const [dataPage, setDataPage] = useState(1);
    const dataPageSize = 25;
    const [dataLoading, setDataLoading] = useState(true);
    const [dataError, setDataError] = useState(null);
    const [dataSearchInput, setDataSearchInput] = useState("");
    const [dataSearch, setDataSearch] = useState("");
    const [dataBillingMonth, setDataBillingMonth] = useState("");
    const [dataCircle, setDataCircle] = useState("");
    const [dataDomain, setDataDomain] = useState("");
    const [exportingData, setExportingData] = useState(false);

    const fetchUploadHistory = useCallback(() => {
      return axios
        .get(buildApiUrl("/api/revenue/upload-history"), {
          headers: getAuthHeaders(),
        })
        .then((res) => {
          setData(Array.isArray(res.data) ? res.data : []);
          setError(null);
        })
        .catch((err) => {
          console.error(err);
          setError("Failed to load data");
        })
        .finally(() => setLoading(false));
    }, []);

    const fetchKpi = useCallback(() => {
      return axios
        .get(buildApiUrl("/api/revenue/kpi-data"), {
          headers: getAuthHeaders(),
          params: {
            circle: filterCircle || undefined,
          },
        })
        .then((res) => {
          setKpi(res.data);
        })
        .catch((err) => {
          console.error(err);
        });
    }, [filterCircle]);

    useEffect(() => {
      fetchUploadHistory();
    }, [fetchUploadHistory]);

    useEffect(() => {
      fetchKpi();
    }, [fetchKpi]);

    // Circle list comes from real uploaded data, not a hardcoded guess.
    useEffect(() => {
      axios
        .get(buildApiUrl("/api/revenue/circles"), { headers: getAuthHeaders() })
        .then((res) => {
          setCircleList(Array.isArray(res.data?.circles) ? res.data.circles : []);
        })
        .catch((err) => {
          console.error(err);
          setCircleList([]);
        });
    }, []);

    // Debounce free-text search before it drives a server request.
    useEffect(() => {
      const timer = setTimeout(() => {
        setDataSearch(dataSearchInput.trim());
        setDataPage(1);
      }, 400);
      return () => clearTimeout(timer);
    }, [dataSearchInput]);

    const fetchRevenueData = useCallback(() => {
      return axios
        .get(buildApiUrl("/api/revenue/data"), {
          headers: getAuthHeaders(),
          params: {
            page: dataPage,
            pageSize: dataPageSize,
            search: dataSearch || undefined,
            billingMonth: dataBillingMonth || undefined,
            circle: dataCircle || undefined,
            domain: dataDomain || undefined,
          },
        })
        .then((res) => {
          setDataRows(Array.isArray(res.data?.rows) ? res.data.rows : []);
          setDataTotal(Number(res.data?.total) || 0);
          setDataError(null);
        })
        .catch((err) => {
          console.error(err);
          setDataError("Failed to load revenue data");
        })
        .finally(() => setDataLoading(false));
    }, [dataPage, dataSearch, dataBillingMonth, dataCircle, dataDomain]);

    useEffect(() => {
      if (activeTab === "data") {
        fetchRevenueData();
      }
    }, [activeTab, fetchRevenueData]);

    const dataTotalPages = Math.max(1, Math.ceil(dataTotal / dataPageSize));

    const handleResetDataFilters = () => {
      setDataSearchInput("");
      setDataSearch("");
      setDataBillingMonth("");
      setDataCircle("");
      setDataDomain("");
      setDataPage(1);
    };

    const handleExportData = async () => {
      setExportingData(true);
      try {
        const response = await axios.get(buildApiUrl("/api/revenue/data/export"), {
          headers: getAuthHeaders(),
          responseType: "blob",
          params: {
            search: dataSearch || undefined,
            billingMonth: dataBillingMonth || undefined,
            circle: dataCircle || undefined,
            domain: dataDomain || undefined,
          },
        });

        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", "revenue_data_export.xlsx");
        document.body.appendChild(link);
        link.click();
        link.remove();
      } catch (err) {
        console.error(err);
        alert("Export failed");
      } finally {
        setExportingData(false);
      }
    };

    const rowsFiltered = useMemo(() => {
      const q = searchQuery.trim().toLowerCase();

      const matchesSearch = (row) => {
        if (!q) return true;

        const fileName = (row?.file_name || "").toString().toLowerCase();
        const uploadedByVal = (row?.uploaded_by || "").toString().toLowerCase();
        const circleVal = (row?.circles || "").toString().toLowerCase();
        const uploadDateVal = (row?.billing_month || "").toString().toLowerCase();
        const uploadTimeVal = (row?.upload_time || "").toString().toLowerCase();

        return (
          fileName.includes(q) ||
          uploadedByVal.includes(q) ||
          circleVal.includes(q) ||
          uploadDateVal.includes(q) ||
          uploadTimeVal.includes(q)
        );
      };

      return data.filter((row) => {
        const dateOk = !filterDate || row.billing_month === filterDate;
        const circleOk =
          !filterCircle ||
          (row?.circles || "").toLowerCase().includes(filterCircle.toLowerCase());
        const searchOk = matchesSearch(row);
        return dateOk && circleOk && searchOk;
      });
    }, [data, filterDate, filterCircle, searchQuery]);

    const totalPages = useMemo(() => {
      return Math.max(1, Math.ceil(rowsFiltered.length / rowsPerPage));
    }, [rowsFiltered.length]);

    // Clamp derived at render time (not via effect) so a filter that shrinks
    // totalPages doesn't leave currentPage pointing past the last page for
    // one extra render.
    const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);

    // Windowed page numbers: first, last, and the current page +/- 1 -
    // computed over the full page range so it stays correct past page 7.
    const pageNumbers = useMemo(() => {
      const pages = [];
      for (let page = 1; page <= totalPages; page += 1) {
        if (
          totalPages <= 7 ||
          page === 1 ||
          page === totalPages ||
          page === safeCurrentPage ||
          page === safeCurrentPage - 1 ||
          page === safeCurrentPage + 1
        ) {
          pages.push(page);
        }
      }
      return pages;
    }, [totalPages, safeCurrentPage]);

    const indexOfLast = safeCurrentPage * rowsPerPage;
    const indexOfFirst = indexOfLast - rowsPerPage;

    const currentData = useMemo(() => {
      return rowsFiltered.slice(indexOfFirst, indexOfLast);
    }, [rowsFiltered, indexOfFirst, indexOfLast]);

    const rowsToDisplay = currentData;

    // Reset button (UI-only)
    const handleResetFilters = () => {
      setSearchQuery("");
      setFilterDate("");
      setFilterCircle("");
      setSelectedRows([]);
      setCurrentPage(1);
    };

    const handleUpload = async () => {
      if (!file) {
        alert("Please select file");
        return;
      }

      if (!selectedDate) {
        alert("Please select a billing month");
        return;
      }

      if (!uploadedBy.trim()) {
        alert("Please enter who is uploading this file");
        return;
      }

      const istTime = new Date()
        .toLocaleString("sv-SE", {
          timeZone: "Asia/Kolkata",
        })
        .replace(" ", "T");

      setUploadTime(istTime);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("uploadedBy", uploadedBy);
      formData.append("billingMonth", selectedDate);
      formData.append("uploadTime", istTime);
       setUploading(true);
      try {
        await axios.post(buildApiUrl("/api/revenue/upload"), formData, {
          headers: {
            ...getAuthHeaders(),
            "Content-Type": "multipart/form-data",
          },
        });
  
        setUploading(false);
        alert("Uploaded!");
        setShowUpload(false);
        setFile(null);
        setUploadedBy("");
        setSelectedDate("");
        fetchUploadHistory();
        fetchKpi();
      } catch (err) {
        setUploading(false);
        console.error(err);
        alert(err.response?.data?.message || "Upload failed");
      }
    };

    const handleDownload = async (fileId) => {
      try {
        const response = await axios.get(buildApiUrl(`/api/revenue/download/${fileId}`), {
          headers: getAuthHeaders(),
          responseType: "blob",
        });

        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement("a");

        link.href = url;
        link.setAttribute("download", `revenue_${fileId}.xlsx`);
        document.body.appendChild(link);
        link.click();

        link.remove();
      } catch (err) {
        console.error(err);
        alert("Download failed");
      }
    };

    const handleBulkDownload = async () => {
      if (selectedRows.length === 0) {
        alert("No rows selected");
        return;
      }

      try {
        const response = await axios.post(
          buildApiUrl("/api/revenue/download-bulk"),
          { ids: selectedRows },
          {
            headers: getAuthHeaders(),
            responseType: "blob",
          }
        );

        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement("a");

        link.href = url;
        link.setAttribute("download", "revenue_files.zip");
        document.body.appendChild(link);
        link.click();
        link.remove();
      } catch (err) {
        console.error(err);
        alert("Bulk download failed");
      }
    };

    const handleBulkDelete = async () => {
      if (selectedRows.length === 0) {
        alert("No rows selected");
        return;
      }

      const confirmDelete = window.confirm(
        `Delete ${selectedRows.length} selected upload(s) and their revenue rows? This cannot be undone.`
      );
      if (!confirmDelete) return;

      try {
        await axios.post(
          buildApiUrl("/api/revenue/delete-bulk"),
          { ids: selectedRows.map((id) => Number(id)) },
          { headers: getAuthHeaders() }
        );

        alert("Deleted successfully");

        setData((prev) => prev.filter((row) => !selectedRows.includes(row.file_id)));
        setSelectedRows([]);
        fetchKpi();
      } catch (err) {
        console.error(err);
        alert(err.response?.data?.message || "Delete failed");
      }
    };

    const handleDelete = async (fileId) => {
      if (!fileId) return;

      const confirmDelete = window.confirm("Delete this uploaded file and its revenue rows?");
      if (!confirmDelete) return;

      try {
        await axios.post(
          buildApiUrl("/api/revenue/delete-bulk"),
          { ids: [Number(fileId)] },
          { headers: getAuthHeaders() }
        );

        alert("Deleted successfully");
        setData((prev) => prev.filter((row) => Number(row.file_id) !== Number(fileId)));
        setSelectedRows((prev) => prev.filter((id) => Number(id) !== Number(fileId)));
        fetchKpi();
      } catch (err) {
        console.error(err);
        alert(err.response?.data?.message || "Delete failed");
      }
    };

    const formatDateTime = (value) => {
      if (!value) return "-";
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toLocaleString("en-GB", {
          timeZone: "Asia/Kolkata",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
      }
      return value;
    };

    const rangeLabel = useMemo(() => {
      const total = rowsFiltered.length;
      if (!total) return "0 of 0";
      const from = Math.min(indexOfFirst + 1, total);
      const to = Math.min(indexOfLast, total);
      return `${from}–${to} of ${total}`;
    }, [rowsFiltered.length, indexOfFirst, indexOfLast]);

    return (
      <div className="min-h-screen">
        <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-2 py-2">
          {/* HEADER */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-5">
            <div>
              <h1 className="text-2xl sm:text-2xl font-bold bg-gradient-to-r from-blue-700 via-indigo-600 to-purple-700 text-transparent bg-clip-text">
                Revenue Dashboard
              </h1>
              <p className="text-text-secondary mt-1 text-sm">
                Track, analyze and optimize revenue with precision tools and live data.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Live badge */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-2xl bg-surface/70 backdrop-blur-xl border border-white/60 shadow-sm">
                <span className="inline-flex items-center justify-center h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]" />
                <span className="text-xs text-text-secondary/90 font-semibold">Live</span>
              </div>

              {/* Upload Excel */}
              <button
                onClick={() => {
                  setShowUpload(true);
                  const now = new Date();
                  const ist = now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
                  setUploadTime(ist);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white shadow-[0_18px_45px_rgba(79,70,229,0.18)] hover:shadow-[0_22px_55px_rgba(79,70,229,0.25)] hover:scale-[1.02] transition"
              >
                <Upload size={16} />
                <span className="font-semibold">Upload Excel</span>
              </button>
            </div>
          </div>

          {/* ❌ ERROR */}
          {error && (
            <p className="text-red-700 dark:text-red-400 text-sm bg-red-100 dark:bg-red-500/15 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* 🔄 LOADING */}
          {loading ? (
            <div className="bg-surface border border-border-color rounded-2xl shadow-sm p-6">
              <p className="text-text-secondary">Loading...</p>
            </div>
          ) : (
            <>
            
              {/* KPI CARDS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                {/* Card template */}
                <div
                  className="group relative p-5 rounded-[24px] bg-surface/70 backdrop-blur-xl border border-white/60 shadow-[0_18px_45px_rgba(79,70,229,0.06)] hover:shadow-[0_28px_80px_rgba(99,102,241,0.14)] transition"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-text-secondary text-sm font-semibold tracking-[0.10em]">Total Revenue</p>
                    </div>

                    <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-50 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-center text-emerald-700 dark:text-emerald-400 shadow-[0_16px_40px_rgba(16,185,129,0.14)]">
                      <IndianRupee size={16} />
                    </div>
                  </div>

                  <h2 className="mt-2 text-[20px] font-semibold text-text-primary">
                    {formatNumber(kpi.totalRevenue)}
                  </h2>

                  
                </div>

                <div
                  className="group relative p-5 rounded-[24px] bg-surface/70 backdrop-blur-xl border border-white/60 shadow-[0_18px_45px_rgba(79,70,229,0.06)] hover:shadow-[0_28px_80px_rgba(99,102,241,0.14)] transition"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-text-secondary text-sm font-semibold tracking-[0.10em]">Total FTTx</p>
                    </div>

                    <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-50 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-center text-indigo-700 dark:text-indigo-400 shadow-[0_16px_40px_rgba(79,70,229,0.14)]">
                      <Network size={16} />
                    </div>
                  </div>

                  <h2 className="mt-2 text-[20px] font-semibold tracking-[-0.03em] text-text-primary">
                    {formatNumber(kpi.totalFTTx)}
                  </h2>

                  
                </div>

                <div
                  className="group relative p-5 rounded-[24px] bg-surface/70 backdrop-blur-xl border border-white/60 shadow-[0_18px_45px_rgba(79,70,229,0.06)] hover:shadow-[0_28px_80px_rgba(99,102,241,0.14)] transition"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-text-secondary text-sm font-semibold tracking-[0.10em]">Total Fiber</p>
                    </div>

                    <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-violet-100 to-purple-50 border border-violet-200 dark:border-violet-500/20 flex items-center justify-center text-violet-700 dark:text-violet-400 shadow-[0_16px_40px_rgba(139,92,246,0.14)]">
                      <Layers size={16} />
                    </div>
                  </div>

                  <h2 className="mt-2 text-[20px] font-semibold tracking-[-0.03em] text-text-primary">
                    {formatNumber(kpi.totalFiber)}
                  </h2>

                </div>

                <div
                  className="group relative p-5 rounded-[24px] bg-surface/70 backdrop-blur-xl border border-white/60 shadow-[0_18px_45px_rgba(79,70,229,0.06)] hover:shadow-[0_28px_80px_rgba(99,102,241,0.14)] transition"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-text-secondary text-sm font-semibold tracking-[0.10em]">Total Tower</p>
                    </div>

                    <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-orange-100 to-amber-50 border border-orange-200 dark:border-orange-500/20 flex items-center justify-center text-orange-700 dark:text-orange-400 shadow-[0_16px_40px_rgba(251,146,60,0.16)]">
                      <TowerControl size={16} />
                    </div>
                  </div>

                  <h2 className="mt-2 text-[20px] font-semibold tracking-[-0.03em] text-text-primary">
                    {formatNumber(kpi.totalTower)}
                  </h2>

                  
                </div>
              </div>


              {/* TAB SWITCHER */}
              <div className="inline-flex items-center gap-1 p-1 mb-4 rounded-2xl bg-surface/70 backdrop-blur-xl border border-white/60 shadow-sm">
                <button
                  onClick={() => setActiveTab("uploads")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
                    activeTab === "uploads"
                      ? "bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white shadow-sm"
                      : "text-text-secondary hover:bg-surface-muted"
                  }`}
                >
                  <FileUp size={14} />
                  Uploaded Files
                </button>
                <button
                  onClick={() => setActiveTab("data")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
                    activeTab === "data"
                      ? "bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white shadow-sm"
                      : "text-text-secondary hover:bg-surface-muted"
                  }`}
                >
                  <Table2 size={14} />
                  Revenue Data
                </button>
              </div>

              {activeTab === "uploads" && (
              <>
              {/* TOOLBAR: Search + filters + reset */}
              <div className="bg-surface/70 backdrop-blur-xl border border-white/60 rounded-[24px] shadow-[0_18px_45px_rgba(79,70,229,0.06)] p-4 sm:p-5 mb-4">
                <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
                  <div className="flex-1 grid grid-cols-12 gap-3 items-center">
                    {/* Search */}
                    <div className="relative col-span-12 md:col-span-6">
                      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                        <Search className="w-4 h-4 text-text-muted" />
                      </div>
                      <input
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setCurrentPage(1);
                        }}
                        placeholder="Search by file name, circle, uploaded by..."
                        className="w-full pl-10 pr-2 py-2 rounded-[18px] bg-surface/80 border border-slate/60 text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-indigo-200"
                      />
                    </div>

                    {/* Billing month filter */}
                    <div className="col-span-6 md:col-span-3">
                      <input
                        type="month"
                        value={filterDate}
                        onChange={(e) => {
                          setFilterDate(e.target.value);
                          setCurrentPage(1);
                        }}
                        title="Filter by billing month"
                        className="w-full px-3 py-2 rounded-[18px] bg-surface/80 border border-slate/60 text-text-primary outline-none focus:ring-2 focus:ring-indigo-200"
                      />
                    </div>

                    {/* Circle dropdown filter */}
                    <div className="relative col-span-6 md:col-span-3">
                      <select
                        value={filterCircle}
                        onChange={(e) => {
                          setFilterCircle(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="w-full appearance-none px-3 py-2 rounded-[18px] bg-surface/80 border border-slate/60 text-text-primary outline-none focus:ring-2 focus:ring-indigo-200"
                      >
                        <option value="">All Circles</option>
                        {circleList.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                        <ChevronDown className="w-4 h-4 text-text-muted" />
                      </div>
                    </div>
                  </div>

                  {/* Reset + bulk actions */}
                  <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-end">
                    <button
                      onClick={handleResetFilters}
                      className="flex items-center justify-center gap-2 px-4 py-2 rounded-[18px] bg-surface/80 border border-slate/60 text-text-primary hover:bg-surface transition shadow-sm"
                    >
                      <RotateCcw size={14} />
                      Reset
                    </button>

                    <div className="flex gap-2">
                      <button
                        onClick={handleBulkDownload}
                        className="px-4 py-2 rounded-[18px] bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/15 transition shadow-sm flex items-center gap-2"
                      >
                        <Download size={14} />
                        Download Selected
                      </button>
                      <button
                        onClick={handleBulkDelete}
                        className="px-4 py-2 rounded-[18px] bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/15 transition shadow-sm flex items-center gap-2"
                      >
                        <Trash2 size={14} />
                        Delete Selected
                      </button>
                    </div>
                  </div>
                </div>
              </div>


              {/* TABLE (Luxury) */}
              <div className="rounded-[24px] border border-white/70 bg-surface/60 backdrop-blur-xl shadow-[0_18px_45px_rgba(79,70,229,0.06)] overflow-hidden">
                <div className="p-4 sm:p-4 border-b border-white/70 flex items-center justify-between">
                  <div>
                    <h2 className="text-text-primary font-semibold text-base">Revenue Data</h2>
                    <p className="text-text-secondary text-xs">Manage uploads, download and delete revenue files.</p>
                  </div>

                  {/* Upload illustration (top-right) */}
                  <div className="hidden md:flex items-center gap-3">
                    <div className="h-9 w-8 rounded-2xl bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 border border-indigo-100 dark:border-indigo-500/20 flex items-center justify-center shadow-[0_18px_40px_rgba(99,102,241,0.10)]">
                      <FileUp size={16} className="text-indigo-700 dark:text-indigo-400" />
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-text-muted">UPLOADS</div>
                      <div className="text-xs font-semibold text-text-secondary">Excel / CSV</div>
                    </div>
                  </div>
                </div>


                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gradient-to-r from-indigo-500/10 via-blue-500/10 to-purple-500/10 text-text-primary">
                      <tr>
                        <th className="p-3 text-left w-[52px]">
                          <input
                            type="checkbox"
                            aria-label="Select all visible"
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedRows(currentData.map((row) => row.file_id));
                              } else {
                                setSelectedRows([]);
                              }
                            }}
                            className="accent-indigo-600"
                          />
                        </th>
                        <th className="p-3 text-left font-medium">Billing Month</th>
                        <th className="p-3 text-left font-medium">Circle</th>
                        <th className="p-3 text-left font-medium">Uploaded By</th>
                        <th className="p-3 text-left font-medium">File Name</th>
                        <th className="p-3 text-left font-medium">Uploaded At</th>
                        <th className="p-3 text-center font-medium w-[220px]">Action</th>
                      </tr>
                    </thead>

                    <tbody>
                      {rowsToDisplay.length > 0 ? (
                        rowsToDisplay.map((row) => {
                          return (
                            <tr
                              key={row.file_id}
                              className="border-b border-border-color hover:bg-surface-muted transition"
                            >
                              <td className="p-3">
                                <input
                                  type="checkbox"
                                  checked={selectedRows.includes(row.file_id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedRows([...selectedRows, row.file_id]);
                                    } else {
                                      setSelectedRows(selectedRows.filter((id) => id !== row.file_id));
                                    }
                                  }}
                                  className="accent-indigo-600"
                                />
                              </td>

                              <td className="p-3 text-text-primary">
                             {row?.billing_month
  ? new Date(row.billing_month + "-01").toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    })
  : "-"}
                              </td>

                              <td className="p-3 text-text-primary">
                                <span className="block max-w-[220px] truncate">
                                  {row?.circles || "-"}
                                </span>
                              </td>

                              <td className="p-3 text-text-primary">
                                <span className="inline-flex items-center gap-2">
                                  {row?.uploaded_by || "-"}
                                </span>
                              </td>

                              <td className="p-3 text-text-primary">
                                <span className="block max-w-[360px] truncate font-medium">
                                  {row?.file_name || "-"}
                                </span>
                              </td>

                              <td className="p-3 text-text-primary">
                                {row?.upload_time ? formatDateTime(row.upload_time) : "-"}
                              </td>

                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => handleDownload(row.file_id)}
                                    className="group inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/15 transition shadow-[0_10px_25px_rgba(16,185,129,0.10)]"
                                  >
                                    <Download size={16} className="text-emerald-700 dark:text-emerald-400/90" />
                                    Download
                                  </button>
                                  <button
                                    onClick={() => handleDelete(row.file_id)}
                                    className="group inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-800 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/15 transition shadow-[0_10px_25px_rgba(244,63,94,0.10)]"
                                  >
                                    <Trash2 size={16} className="text-rose-700 dark:text-rose-400/90" />
                                    Delete
                                  </button>

                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan="7" className="text-center p-8">
                            <div className="mx-auto max-w-md">
                              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 flex items-center justify-center mx-auto">
                                <Search className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                              </div>
                              <p className="mt-4 text-text-primary font-semibold">No results found</p>
                              <p className="text-text-muted text-xs mt-1">
                                Try clearing filters or changing your search query.
                              </p>
                              <button
                                onClick={handleResetFilters}
                                className="mt-4 px-4 py-2 rounded-xl bg-surface border border-border-color text-text-primary hover:bg-surface-muted transition shadow-sm"
                              >
                                Reset filters
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination (Luxury) */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
                <div className="text-xs text-text-secondary">
                  Showing <span className="text-text-primary font-semibold">{rangeLabel}</span>
                  <span className="mx-1.5">·</span>
                  Page <span className="text-text-primary font-semibold">{safeCurrentPage}</span> of{" "}
                  <span className="text-text-primary font-semibold">{totalPages}</span>
                </div>

                <div className="flex items-center gap-2 bg-surface/60 backdrop-blur-xl border border-white/60 rounded-[18px] px-2 py-2 shadow-[0_18px_45px_rgba(79,70,229,0.06)]">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                    disabled={safeCurrentPage === 1}
                    className={`px-3 py-2 rounded-[16px] border text-sm transition shadow-sm ${
                      safeCurrentPage === 1
                        ? "bg-surface/60 border-white/70 text-text-muted cursor-not-allowed"
                        : "bg-surface/80 border-white/70 text-text-primary hover:bg-surface"
                    }`}
                  >
                    Prev
                  </button>

                  <div className="hidden sm:flex items-center gap-1">
                    {pageNumbers.map((page, idx) => {
                      const prevPage = pageNumbers[idx - 1];
                      const showEllipsis = prevPage !== undefined && page - prevPage > 1;

                      return (
                        <span key={page} className="flex items-center gap-1">
                          {showEllipsis && (
                            <span className="px-1 text-text-muted select-none">…</span>
                          )}
                          <button
                            onClick={() => setCurrentPage(page)}
                            className={`px-3 py-2 rounded-[16px] border text-sm transition shadow-sm ${
                              page === safeCurrentPage
                                ? "bg-gradient-to-r from-blue-600/15 via-indigo-600/15 to-purple-600/15 border-indigo-300 dark:border-indigo-500/30 text-indigo-800 dark:text-indigo-300 shadow-[0_0_0_4px_rgba(99,102,241,0.18)]"
                                : "bg-surface/80 border-white/70 text-text-primary hover:bg-surface"
                            }`}
                          >
                            {page}
                          </button>
                        </span>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                    disabled={safeCurrentPage === totalPages}
                    className={`px-3 py-2 rounded-[16px] border text-sm transition shadow-sm ${
                      safeCurrentPage === totalPages
                        ? "bg-surface/60 border-white/70 text-text-muted cursor-not-allowed"
                        : "bg-surface/80 border-white/70 text-text-primary hover:bg-surface"
                    }`}
                  >
                    Next
                  </button>
                </div>
              </div>
              </>
              )}

              {activeTab === "data" && (
                <>
                  {/* TOOLBAR: search + filters + reset + export */}
                  <div className="bg-surface/70 backdrop-blur-xl border border-white/60 rounded-[24px] shadow-[0_18px_45px_rgba(79,70,229,0.06)] p-4 sm:p-5 mb-4">
                    <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
                      <div className="flex-1 grid grid-cols-12 gap-3 items-center">
                        <div className="relative col-span-12 md:col-span-5">
                          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                            <Search className="w-4 h-4 text-text-muted" />
                          </div>
                          <input
                            value={dataSearchInput}
                            onChange={(e) => setDataSearchInput(e.target.value)}
                            placeholder="Search location, description, CO type..."
                            className="w-full pl-10 pr-2 py-2 rounded-[18px] bg-surface/80 border border-slate/60 text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-indigo-200"
                          />
                        </div>

                        <div className="col-span-6 md:col-span-2">
                          <input
                            type="month"
                            value={dataBillingMonth}
                            onChange={(e) => {
                              setDataBillingMonth(e.target.value);
                              setDataPage(1);
                            }}
                            title="Filter by billing month"
                            className="w-full px-3 py-2 rounded-[18px] bg-surface/80 border border-slate/60 text-text-primary outline-none focus:ring-2 focus:ring-indigo-200"
                          />
                        </div>

                        <div className="relative col-span-6 md:col-span-2">
                          <select
                            value={dataCircle}
                            onChange={(e) => {
                              setDataCircle(e.target.value);
                              setDataPage(1);
                            }}
                            className="w-full appearance-none px-3 py-2 rounded-[18px] bg-surface/80 border border-slate/60 text-text-primary outline-none focus:ring-2 focus:ring-indigo-200"
                          >
                            <option value="">All Circles</option>
                            {circleList.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                            <ChevronDown className="w-4 h-4 text-text-muted" />
                          </div>
                        </div>

                        <div className="relative col-span-6 md:col-span-2">
                          <select
                            value={dataDomain}
                            onChange={(e) => {
                              setDataDomain(e.target.value);
                              setDataPage(1);
                            }}
                            className="w-full appearance-none px-3 py-2 rounded-[18px] bg-surface/80 border border-slate/60 text-text-primary outline-none focus:ring-2 focus:ring-indigo-200"
                          >
                            <option value="">All Domains</option>
                            <option value="FTTx">FTTx</option>
                            <option value="Fiber">Fiber</option>
                            <option value="Tower">Tower</option>
                          </select>
                          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                            <ChevronDown className="w-4 h-4 text-text-muted" />
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 sm:justify-end">
                        <button
                          onClick={handleResetDataFilters}
                          className="flex items-center justify-center gap-2 px-4 py-2 rounded-[18px] bg-surface/80 border border-slate/60 text-text-primary hover:bg-surface transition shadow-sm"
                        >
                          <RotateCcw size={14} />
                          Reset
                        </button>
                        <button
                          onClick={handleExportData}
                          disabled={exportingData}
                          className={`flex items-center justify-center gap-2 px-4 py-2 rounded-[18px] border transition shadow-sm ${
                            exportingData
                              ? "bg-surface/60 border-white/70 text-text-muted cursor-not-allowed"
                              : "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/15"
                          }`}
                        >
                          <Download size={14} />
                          {exportingData ? "Exporting..." : "Export"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {dataError && (
                    <p className="text-red-700 dark:text-red-400 text-sm bg-red-100 dark:bg-red-500/15 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2 mb-4">
                      {dataError}
                    </p>
                  )}

                  {/* TABLE: revenue line items */}
                  <div className="rounded-[24px] border border-white/70 bg-surface/60 backdrop-blur-xl shadow-[0_18px_45px_rgba(79,70,229,0.06)] overflow-hidden">
                    <div className="p-4 sm:p-4 border-b border-white/70 flex items-center justify-between">
                      <div>
                        <h2 className="text-text-primary font-semibold text-base">Revenue Data</h2>
                        <p className="text-text-secondary text-xs">All uploaded revenue line items, live from the database.</p>
                      </div>
                      <div className="hidden md:flex items-center gap-2 text-text-muted">
                        <ListFilter size={14} />
                        <span className="text-xs font-semibold">{formatNumber(dataTotal)} rows</span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gradient-to-r from-indigo-500/10 via-blue-500/10 to-purple-500/10 text-text-primary">
                          <tr>
                            <th className="p-3 text-left font-medium">Billing Month</th>
                            <th className="p-3 text-left font-medium">Circle</th>
                            <th className="p-3 text-left font-medium">Location</th>
                            <th className="p-3 text-left font-medium">CO Type</th>
                            <th className="p-3 text-left font-medium">Domain</th>
                            <th className="p-3 text-right font-medium">CM Amount</th>
                            <th className="p-3 text-right font-medium">PM Amount</th>
                            <th className="p-3 text-right font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dataLoading ? (
                            <tr>
                              <td colSpan="8" className="text-center p-8 text-text-secondary">
                                Loading...
                              </td>
                            </tr>
                          ) : dataRows.length > 0 ? (
                            dataRows.map((row) => (
                              <tr
                                key={row.id}
                                className="border-b border-border-color hover:bg-surface-muted transition"
                              >
                                <td className="p-3 text-text-primary">
                                  {row?.billing_month
                                    ? new Date(row.billing_month + "-01").toLocaleString("en-US", {
                                        month: "long",
                                        year: "numeric",
                                      })
                                    : "-"}
                                </td>
                                <td className="p-3 text-text-primary">{row?.circle || "-"}</td>
                                <td className="p-3 text-text-primary">
                                  <span className="block max-w-[220px] truncate">{row?.location || "-"}</span>
                                </td>
                                <td className="p-3 text-text-primary">
                                  <span className="block max-w-[180px] truncate">{row?.co_type || "-"}</span>
                                </td>
                                <td className="p-3 text-text-primary">{row?.domain || "-"}</td>
                                <td className="p-3 text-right text-text-primary">{formatNumber(row?.cm_amount)}</td>
                                <td className="p-3 text-right text-text-primary">{formatNumber(row?.pm_amount)}</td>
                                <td className="p-3 text-right font-semibold text-text-primary">
                                  {formatNumber(Number(row?.cm_amount || 0) + Number(row?.pm_amount || 0))}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="8" className="text-center p-8">
                                <div className="mx-auto max-w-md">
                                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 flex items-center justify-center mx-auto">
                                    <Search className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                  </div>
                                  <p className="mt-4 text-text-primary font-semibold">No results found</p>
                                  <p className="text-text-muted text-xs mt-1">
                                    Try clearing filters or changing your search query.
                                  </p>
                                  <button
                                    onClick={handleResetDataFilters}
                                    className="mt-4 px-4 py-2 rounded-xl bg-surface border border-border-color text-text-primary hover:bg-surface-muted transition shadow-sm"
                                  >
                                    Reset filters
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Pagination */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
                    <div className="text-xs text-text-secondary">
                      Page <span className="text-text-primary font-semibold">{dataPage}</span> of{" "}
                      <span className="text-text-primary font-semibold">{dataTotalPages}</span>
                      <span className="mx-1.5">·</span>
                      <span className="text-text-primary font-semibold">{formatNumber(dataTotal)}</span> total rows
                    </div>

                    <div className="flex items-center gap-2 bg-surface/60 backdrop-blur-xl border border-white/60 rounded-[18px] px-2 py-2 shadow-[0_18px_45px_rgba(79,70,229,0.06)]">
                      <button
                        onClick={() => setDataPage((p) => Math.max(p - 1, 1))}
                        disabled={dataPage === 1}
                        className={`px-3 py-2 rounded-[16px] border text-sm transition shadow-sm ${
                          dataPage === 1
                            ? "bg-surface/60 border-white/70 text-text-muted cursor-not-allowed"
                            : "bg-surface/80 border-white/70 text-text-primary hover:bg-surface"
                        }`}
                      >
                        Prev
                      </button>
                      <button
                        onClick={() => setDataPage((p) => Math.min(p + 1, dataTotalPages))}
                        disabled={dataPage === dataTotalPages}
                        className={`px-3 py-2 rounded-[16px] border text-sm transition shadow-sm ${
                          dataPage === dataTotalPages
                            ? "bg-surface/60 border-white/70 text-text-muted cursor-not-allowed"
                            : "bg-surface/80 border-white/70 text-text-primary hover:bg-surface"
                        }`}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* POPUP UPLOAD (UI only changes) */}
              {showUpload && (
                <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
                  <div className="bg-surface/95 backdrop-blur-xl rounded-2xl p-6 w-[520px] sm:w-[560px] shadow-2xl border border-border-color">
                    <h2 className="text-xl font-semibold mb-1 text-text-primary">
                      Upload Excel File
                    </h2>
                    <p className="text-sm text-text-secondary mb-5">
                      Premium upload panel—no connectivity changes.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="text-xs font-medium text-text-secondary">
                         Billing Month 
                         </label>
                       <input
                      type="month" 
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      placeholder="Select Month"
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-surface border border-border-color text-text-primary outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-medium text-text-secondary">Uploaded By</label>
                        <input
                          type="text"
                          placeholder="Enter person name"
                          value={uploadedBy}
                          onChange={(e) => setUploadedBy(e.target.value)}
                          className="w-full mt-1 px-3 py-2 rounded-xl bg-surface border border-border-color text-text-primary outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                      </div>
                    </div>

                    <div
                      className="border-2 border-dashed border-indigo-200 dark:border-indigo-500/20 rounded-2xl p-6 text-center mb-4
                      bg-gradient-to-b from-indigo-50 to-white hover:from-indigo-100 transition"
                    >
                      <input
                        type="file"
                        accept=".xlsx, .xls, .csv"
                        onChange={(e) => setFile(e.target.files[0])}
                        className="hidden"
                        id="fileUpload"
                      />

                      <label htmlFor="fileUpload" className="cursor-pointer">
                        <p className="text-indigo-700 dark:text-indigo-400 font-medium">Choose .xlsx / .csv file</p>
                        <p className="text-xs text-text-muted mt-1">Excel and CSV files only</p>
                      </label>

                      {file && (
                        <p className="mt-3 text-sm text-text-secondary truncate font-medium">
                          📄 {file.name}
                        </p>
                      )}
                    </div>

                    {uploadTime && (
                      <div className="bg-surface-muted rounded-xl p-3 text-sm mb-4 border border-border-color text-text-primary">
                        ⏱ Uploaded At: {uploadTime}
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowUpload(false)}
                        className="w-full py-2.5 rounded-xl bg-surface border border-border-color text-text-primary hover:bg-surface-muted transition shadow-sm"
                      >
                        Cancel
                      </button>

                     <button
  onClick={handleUpload}
  disabled={uploading}
  className={`w-full py-2.5 rounded-xl text-white transition shadow-lg ${
    uploading
      ? "bg-gray-400 cursor-not-allowed"
      : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:brightness-110"
  }`}
>
  {uploading ? "Uploading..." : "Upload File"}
</button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }
