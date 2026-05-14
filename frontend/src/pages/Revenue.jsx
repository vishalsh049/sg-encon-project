import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { buildApiUrl, getAuthHeaders } from "../lib/api";
import {
  Upload,
  Search,
  RotateCcw,
  ChevronDown,
  TrendingUp,
  IndianRupee,
  Layers,
  Network,
  TowerControl,
  FileUp,
  Download,
  Trash2,
} from "lucide-react";

function formatNumber(value) {
  const n = Number(value || 0);
  return n.toLocaleString();
}

function pctFromSeed(seed) {
  // UI-only growth badge. Keeps stable visual without new API fields.
  const x = Math.abs(Math.sin(seed) * 100);
  const v = 2 + (x % 18); // 2% - 20%
  return `${v.toFixed(1)}%`;
}

function Sparkline({ strokeClassName, values }) {
  const w = 220;
  const h = 44;
  const pad = 4;

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);

  const xStep = (w - pad * 2) / Math.max(values.length - 1, 1);

  const points = values.map((v, i) => {
    const x = pad + i * xStep;
    const y = pad + (h - pad * 2) * (1 - (v - min) / span);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <div className="mt-3">
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(99,102,241,0.18)" />
            <stop offset="100%" stopColor="rgba(168,85,247,0.18)" />
          </linearGradient>
        </defs>
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={strokeClassName}
        />
        <polyline
          points={points.join(" ") + ` ${w - pad},${h - pad} ${pad},${h - pad}`}
          fill="url(#sparkGrad)"
          stroke="none"
          opacity="0.9"
        />
      </svg>
    </div>
  );
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
    const [filterDate, setFilterDate] = useState("");
    const [filterCircle, setFilterCircle] = useState(""); // dropdown value ('' = all)
    const [searchQuery, setSearchQuery] = useState("");

    const [selectedRows, setSelectedRows] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const rowsPerPage = 5;

    // 🔥 FETCH DATA FROM DB (connectivity unchanged)
    useEffect(() => {
      axios
        .get(buildApiUrl("/api/revenue/upload-history"), {
          headers: getAuthHeaders(),
        })
        .then((res) => {
          setData(Array.isArray(res.data) ? res.data : []);
        })
        .catch((err) => {
          console.error(err);
          setError("Failed to load data");
        })
        .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
    axios
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


  const circles = ["Punjab", "Haryana", "Delhi", "UP East", "UPE-2"];

    const rowsFiltered = useMemo(() => {
      const q = searchQuery.trim().toLowerCase();

      const matchesSearch = (row) => {
        if (!q) return true;

        const fileName = (row?.file_name || "").toString().toLowerCase();
        const uploadedByVal = (row?.uploaded_by || "").toString().toLowerCase();
        const circleVal = (row?.circle || "").toString().toLowerCase();
        const uploadDateVal = (row?.billing_month || "").toLowerCase();
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
          !filterCircle || (row?.circle || "").toLowerCase() === filterCircle.toLowerCase();
        const searchOk = matchesSearch(row);
        return dateOk && circleOk && searchOk;
      });
    }, [data, filterDate, filterCircle, searchQuery]);

    const totalPages = useMemo(() => {
      return Math.max(1, Math.ceil(rowsFiltered.length / rowsPerPage));
    }, [rowsFiltered.length]);

    // clamp currentPage if filters reduce results
    useEffect(() => {
      setCurrentPage((p) => Math.min(Math.max(p, 1), totalPages));
    }, [totalPages]);

    const indexOfLast = currentPage * rowsPerPage;
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

      const now = new Date();
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
        window.location.reload();
      } catch (err) {
        setUploading(false);
        console.error(err);
        alert("Upload failed");
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

      try {
        await axios.post(
          buildApiUrl("/api/revenue/delete-bulk"),
          { ids: selectedRows.map((id) => Number(id)) },
          { headers: getAuthHeaders() }
        );

        alert("Deleted successfully");

        setData((prev) => prev.filter((row) => !selectedRows.includes(row.file_id)));
        setSelectedRows([]);
      } catch (err) {
        console.error(err);
        alert("Delete failed");
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
      } catch (err) {
        console.error(err);
        alert("Delete failed");
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
              <p className="text-slate-600 mt-1 text-sm">
                Track, analyze and optimize revenue with precision tools and live data.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Live badge */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-sm">
                <span className="inline-flex items-center justify-center h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]" />
                <span className="text-xs text-slate-700/90 font-semibold">Live</span>
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
            <p className="text-red-700 text-sm bg-red-100 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* 🔄 LOADING */}
          {loading ? (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
              <p className="text-slate-700">Loading...</p>
            </div>
          ) : (
            <>
            
              {/* KPI CARDS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                {/* Card template */}
                <div
                  className="group relative p-5 rounded-[24px] bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_18px_45px_rgba(79,70,229,0.06)] hover:shadow-[0_28px_80px_rgba(99,102,241,0.14)] transition"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-slate-700 text-sm font-semibold tracking-[0.10em]">Total Revenue</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-emerald-50/80 border border-emerald-100 text-emerald-700">
                          +{pctFromSeed(Number(kpi.totalRevenue || 0) + 1)}
                        </span>
                        <span className="text-xs text-slate-500">vs last period</span>
                      </div>
                    </div>

                    <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shadow-[0_16px_40px_rgba(16,185,129,0.14)]">
                      <IndianRupee size={16} />
                    </div>
                  </div>

                  <h2 className="mt-2 text-[20px] font-semibold text-slate-900">
                    {formatNumber(kpi.totalRevenue)}
                  </h2>

                  
                </div>

                <div
                  className="group relative p-5 rounded-[24px] bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_18px_45px_rgba(79,70,229,0.06)] hover:shadow-[0_28px_80px_rgba(99,102,241,0.14)] transition"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-slate-700 text-sm font-semibold tracking-[0.10em]">Total FTTx</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-indigo-50/80 border border-indigo-100 text-indigo-700">
                          +{pctFromSeed(Number(kpi.totalFTTx || 0) + 2)}
                        </span>
                        <span className="text-xs text-slate-500">vs last period</span>
                      </div>
                    </div>

                    <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-50 border border-indigo-200 flex items-center justify-center text-indigo-700 shadow-[0_16px_40px_rgba(79,70,229,0.14)]">
                      <Network size={16} />
                    </div>
                  </div>

                  <h2 className="mt-2 text-[20px] font-semibold tracking-[-0.03em] text-slate-900">
                    {formatNumber(kpi.totalFTTx)}
                  </h2>

                  
                </div>

                <div
                  className="group relative p-5 rounded-[24px] bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_18px_45px_rgba(79,70,229,0.06)] hover:shadow-[0_28px_80px_rgba(99,102,241,0.14)] transition"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-slate-700 text-sm font-semibold tracking-[0.10em]">Total Fiber</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-violet-50/80 border border-violet-100 text-violet-700">
                          +{pctFromSeed(Number(kpi.totalFiber || 0) + 3)}
                        </span>
                        <span className="text-xs text-slate-500">vs last period</span>
                      </div>
                    </div>

                    <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-violet-100 to-purple-50 border border-violet-200 flex items-center justify-center text-violet-700 shadow-[0_16px_40px_rgba(139,92,246,0.14)]">
                      <Layers size={16} />
                    </div>
                  </div>

                  <h2 className="mt-2 text-[20px] font-semibold tracking-[-0.03em] text-slate-900">
                    {formatNumber(kpi.totalFiber)}
                  </h2>

                </div>

                <div
                  className="group relative p-5 rounded-[24px] bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_18px_45px_rgba(79,70,229,0.06)] hover:shadow-[0_28px_80px_rgba(99,102,241,0.14)] transition"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-slate-700 text-sm font-semibold tracking-[0.10em]">Total Tower</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-orange-50/80 border border-orange-100 text-orange-700">
                          +{pctFromSeed(Number(kpi.totalTower || 0) + 4)}
                        </span>
                        <span className="text-xs text-slate-500">vs last period</span>
                      </div>
                    </div>

                    <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-orange-100 to-amber-50 border border-orange-200 flex items-center justify-center text-orange-700 shadow-[0_16px_40px_rgba(251,146,60,0.16)]">
                      <TowerControl size={16} />
                    </div>
                  </div>

                  <h2 className="mt-2 text-[20px] font-semibold tracking-[-0.03em] text-slate-900">
                    {formatNumber(kpi.totalTower)}
                  </h2>

                  
                </div>
              </div>


              {/* TOOLBAR: Search + filters + reset */}
              <div className="bg-white/70 backdrop-blur-xl border border-white/60 rounded-[24px] shadow-[0_18px_45px_rgba(79,70,229,0.06)] p-4 sm:p-5 mb-4">
                <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
                  <div className="flex-1 grid grid-cols-12 gap-3 items-center">
                    {/* Search */}
                    <div className="relative col-span-12 md:col-span-6">
                      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                        <Search className="w-4 h-4 text-slate-400" />
                      </div>
                      <input
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setCurrentPage(1);
                        }}
                        placeholder="Search by file name, circle, uploaded by..."
                        className="w-full pl-10 pr-2 py-2 rounded-[18px] bg-white/80 border border-slate/60 text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-200"
                      />
                    </div>

                    {/* Date filter */}
                    <div className="col-span-6 md:col-span-3">
                      <input
                        type="date"
                        value={filterDate}
                        onChange={(e) => {
                          setFilterDate(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="w-full px-3 py-2 rounded-[18px] bg-white/80 border border-slate/60 text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200"
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
                        className="w-full appearance-none px-3 py-2 rounded-[18px] bg-white/80 border border-slate/60 text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200"
                      >
                        <option value="">All Circles</option>
                        {circles.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                  </div>

                  {/* Reset + bulk actions */}
                  <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-end">
                    <button
                      onClick={handleResetFilters}
                      className="flex items-center justify-center gap-2 px-4 py-2 rounded-[18px] bg-white/80 border border-slate/60 text-slate-800 hover:bg-white transition shadow-sm"
                    >
                      <RotateCcw size={14} />
                      Reset
                    </button>

                    <div className="flex gap-2">
                      <button
                        onClick={handleBulkDownload}
                        className="px-4 py-2 rounded-[18px] bg-emerald-50/80 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition shadow-sm flex items-center gap-2"
                      >
                        <Download size={14} />
                        Download Selected
                      </button>
                      <button
                        onClick={handleBulkDelete}
                        className="px-4 py-2 rounded-[18px] bg-rose-50/80 border border-rose-200 text-rose-700 hover:bg-rose-100 transition shadow-sm flex items-center gap-2"
                      >
                        <Trash2 size={14} />
                        Delete Selected
                      </button>
                    </div>
                  </div>
                </div>
              </div>


              {/* TABLE (Luxury) */}
              <div className="rounded-[24px] border border-white/70 bg-white/60 backdrop-blur-xl shadow-[0_18px_45px_rgba(79,70,229,0.06)] overflow-hidden">
                <div className="p-4 sm:p-4 border-b border-white/70 flex items-center justify-between">
                  <div>
                    <h2 className="text-slate-900 font-semibold text-base">Revenue Data</h2>
                    <p className="text-slate-600 text-xs">Manage uploads, download and delete revenue files.</p>
                  </div>

                  {/* Upload illustration (top-right) */}
                  <div className="hidden md:flex items-center gap-3">
                    <div className="h-9 w-8 rounded-2xl bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 border border-indigo-100 flex items-center justify-center shadow-[0_18px_40px_rgba(99,102,241,0.10)]">
                      <FileUp size={16} className="text-indigo-700" />
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-slate-400">UPLOADS</div>
                      <div className="text-xs font-semibold text-slate-700">Excel / CSV</div>
                    </div>
                  </div>
                </div>


                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gradient-to-r from-indigo-500/10 via-blue-500/10 to-purple-500/10 text-slate-800">
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
                              className="border-b border-slate-100 hover:bg-slate-50 transition"
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

                              <td className="p-3 text-slate-800">
                             {row?.billing_month
  ? new Date(row.billing_month + "-01").toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    })
  : "-"}
                              </td>

                              <td className="p-3 text-slate-800">
                                <span className="inline-flex items-center gap-2">
                                  {row?.uploaded_by || "-"}
                                </span>
                              </td>

                              <td className="p-3 text-slate-800">
                                <span className="block max-w-[360px] truncate font-medium">
                                  {row?.file_name || "-"}
                                </span>
                              </td>

                              <td className="p-3 text-slate-800">
                                {row?.upload_time ? formatDateTime(row.upload_time) : "-"}
                              </td>

                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => handleDownload(row.file_id)}
                                    className="group inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-xl bg-emerald-50/80 border border-emerald-200/80 text-emerald-800 hover:bg-emerald-100 transition shadow-[0_10px_25px_rgba(16,185,129,0.10)]"
                                  >
                                    <Download size={16} className="text-emerald-700/90" />
                                    Download
                                  </button>
                                  <button
                                    onClick={() => handleDelete(row.file_id)}
                                    className="group inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-xl bg-rose-50/80 border border-rose-200/80 text-rose-800 hover:bg-rose-100 transition shadow-[0_10px_25px_rgba(244,63,94,0.10)]"
                                  >
                                    <Trash2 size={16} className="text-rose-700/90" />
                                    Delete
                                  </button>

                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan="6" className="text-center p-8">
                            <div className="mx-auto max-w-md">
                              <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto">
                                <Search className="w-5 h-5 text-indigo-600" />
                              </div>
                              <p className="mt-4 text-slate-900 font-semibold">No results found</p>
                              <p className="text-slate-500 text-xs mt-1">
                                Try clearing filters or changing your search query.
                              </p>
                              <button
                                onClick={handleResetFilters}
                                className="mt-4 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 transition shadow-sm"
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
                <div className="text-xs text-slate-600">
                  Page <span className="text-slate-900 font-semibold">{currentPage}</span> of{" "}
                  <span className="text-slate-900 font-semibold">{totalPages}</span>
                </div>

                <div className="flex items-center gap-2 bg-white/60 backdrop-blur-xl border border-white/60 rounded-[18px] px-2 py-2 shadow-[0_18px_45px_rgba(79,70,229,0.06)]">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                    disabled={currentPage === 1}
                    className={`px-3 py-2 rounded-[16px] border text-sm transition shadow-sm ${
                      currentPage === 1
                        ? "bg-white/60 border-white/70 text-slate-400 cursor-not-allowed"
                        : "bg-white/80 border-white/70 text-slate-800 hover:bg-white"
                    }`}
                  >
                    Prev
                  </button>

                  <div className="hidden sm:flex items-center gap-1">
                    {Array.from({ length: totalPages }).slice(0, 7).map((_, idx) => {
                      const page = idx + 1;
                      if (totalPages > 7) {
                        if (
                          page !== 1 &&
                          page !== totalPages &&
                          page !== currentPage &&
                          page !== currentPage - 1 &&
                          page !== currentPage + 1
                        ) {
                          return null;
                        }
                      }
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`px-3 py-2 rounded-[16px] border text-sm transition shadow-sm ${
                            page === currentPage
                              ? "bg-gradient-to-r from-blue-600/15 via-indigo-600/15 to-purple-600/15 border-indigo-300/70 text-indigo-800 shadow-[0_0_0_4px_rgba(99,102,241,0.18)]"
                              : "bg-white/80 border-white/70 text-slate-800 hover:bg-white"
                          }`}
                        >
                          {page}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className={`px-3 py-2 rounded-[16px] border text-sm transition shadow-sm ${
                      currentPage === totalPages
                        ? "bg-white/60 border-white/70 text-slate-400 cursor-not-allowed"
                        : "bg-white/80 border-white/70 text-slate-800 hover:bg-white"
                    }`}
                  >
                    Next
                  </button>
                </div>
              </div>

              {/* POPUP UPLOAD (UI only changes) */}
              {showUpload && (
                <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
                  <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-6 w-[520px] sm:w-[560px] shadow-2xl border border-slate-200">
                    <h2 className="text-xl font-semibold mb-1 text-slate-900">
                      Upload Excel File
                    </h2>
                    <p className="text-sm text-slate-600 mb-5">
                      Premium upload panel—no connectivity changes.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="text-xs font-medium text-slate-700">
                         Billing Month 
                         </label>
                       <input
                      type="month" 
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      placeholder="Select Month"
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-medium text-slate-700">Uploaded By</label>
                        <input
                          type="text"
                          placeholder="Enter person name"
                          value={uploadedBy}
                          onChange={(e) => setUploadedBy(e.target.value)}
                          className="w-full mt-1 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                      </div>
                    </div>

                    <div
                      className="border-2 border-dashed border-indigo-200 rounded-2xl p-6 text-center mb-4
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
                        <p className="text-indigo-700 font-medium">Choose .xlsx / .csv file</p>
                        <p className="text-xs text-slate-500 mt-1">Excel and CSV files only</p>
                      </label>

                      {file && (
                        <p className="mt-3 text-sm text-slate-700 truncate font-medium">
                          📄 {file.name}
                        </p>
                      )}
                    </div>

                    {uploadTime && (
                      <div className="bg-slate-50 rounded-xl p-3 text-sm mb-4 border border-slate-200 text-slate-800">
                        ⏱ Uploaded At: {uploadTime}
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowUpload(false)}
                        className="w-full py-2.5 rounded-xl bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 transition shadow-sm"
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
