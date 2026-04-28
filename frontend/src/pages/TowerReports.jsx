  import { useMemo, useState, useEffect } from "react";
  import { useParams } from "react-router-dom";
  import { buildApiUrl } from "../lib/api";
  import { hasPermission } from "../lib/session";
  import axios from "axios";
  import PremiumDatePicker from "../components/PremiumDatePicker";
  import { Listbox } from "@headlessui/react";
  import { ChevronDown } from "lucide-react";

import {
  Activity,
  BarChart3,
  Download,
  Layers,
  Pencil,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  Upload,
} from "lucide-react";

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

  const reportOptions = [
  { value: "", label: "All Report Types" },
  { value: "Outage", label: "Outage" },
  { value: "Performance", label: "Performance" },
];

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

  setDate(row.report_date);
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

// ✅ FIX DATE
const safeDate = (() => {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
})();

if (uploadType === "single") {
  formData.append("file", file);
  formData.append("date", safeDate);
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

const kpiCards = useMemo(() => {
  const cardOrder = [
    { type: "AG2", label: "AG2", bg: "from-sky-100 to-sky-50", icon: BarChart3 },
    { type: "ILA", label: "ILA", bg: "from-fuchsia-100 to-fuchsia-50", icon: Activity },
    { type: "AG1", label: "AG1", bg: "from-cyan-100 to-cyan-50", icon: ShieldCheck },
    { type: "ENB", label: "ENB", bg: "from-indigo-100 to-indigo-50", icon: Sparkles, highlight: true },
    { type: "GNB", label: "GNB", bg: "from-emerald-100 to-emerald-50", icon: TrendingUp },
    { type: "ESC", label: "ESC", bg: "from-amber-100 to-amber-50", icon: Layers },
    { type: "HPODSC", label: "HPODSC", bg: "from-rose-100 to-rose-50", icon: Activity },
    { type: "OSC", label: "OSC", bg: "from-lime-100 to-lime-50", icon: BarChart3 },
    { type: "ISC", label: "ISC", bg: "from-violet-100 to-violet-50", icon: ShieldCheck },
  ];

  const snapshot = rows.reduce((memo, row) => {
    const type = row.site_type;
    const dateValue = row.report_date;
    if (!type || !dateValue || !cardOrder.some((card) => card.type === type)) return memo;

    const currentDate = new Date(dateValue);
    const existing = memo[type];
    if (!existing || currentDate > existing.dateRaw) {
      memo[type] = {
        count: Number(row.total_records || 0),
        dateRaw: currentDate,
      };
    }
    return memo;
  }, {});

  return cardOrder.map((card) => {
    const metric = snapshot[card.type];
    return {
      ...card,
      count: metric?.count || 0,
      date: metric?.dateRaw ? formatDateOnly(metric.dateRaw) : "-",
    };
  });
}, [rows]);

  const primaryButtonClass =
    "inline-flex h-10 items-center gap-2 rounded-2xl border border-transparent px-4 text-sm font-semibold text-white shadow-soft transition disabled:cursor-not-allowed disabled:opacity-50";
  const secondaryButtonClass =
    "inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white/90 px-4 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-100";
  const tableActionClass =
    "inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 shadow-sm";

{/* main return */}

    return (
      <div className="min-h-screen w-full pb-28 text-slate-900 -mt-4">
        <div className="sticky top-0 z-30 mb-4 overflow-hidden rounded-[22px] bg-slate-50 px-5 py-4 
        shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 space-y-3">
              <div className="space-y-0">
                <h1 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                  Tower Reports
                </h1>
                <p className="text-sm pt-1 text-slate-500">
                  Category: <span className="font-semibold text-slate-900">{categoryLabel}</span>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                onClick={() => {
                  setEditingId(null);
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
                className={`${primaryButtonClass} bg-gradient-to-r from-sky-500 to-indigo-500 shadow-[0_16px_40px_rgba(56,189,248,0.24)]`}
              >
                <Upload size={16} />
                Upload Reports
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={selectedIds.length === 0}
                className={`${secondaryButtonClass} border-transparent bg-red-50 text-red-700 shadow-sm hover:bg-red-100 disabled:opacity-40`}
              >
                <Trash2 size={16} />
                Delete
              </button>
              <button
                onClick={handleBulkDownload}
                disabled={selectedIds.length === 0}
                className={`${secondaryButtonClass} border-transparent bg-emerald-50 text-emerald-700 shadow-sm hover:bg-emerald-100 disabled:opacity-40`}
              >
                <Download size={16} />
                Download
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="grid gap-4 xl:grid-cols-[1.85fr_1fr]">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {kpiCards.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.type}
                    className={`rounded-[20px] border border-white/85 bg-white/90 px-4 py-2 shadow-soft transition duration-200 
                    hover:-translate-y-0.5 hover:shadow-[0_20px_60px_rgba(15,23,42,0.09)] ${item.highlight ? "ring-1 ring-indigo-100" : ""}`}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-2">
                        <p className="text-[11px] mt-1 font-semibold uppercase tracking-[0.2em] text-slate-500">
                          {item.label}
                        </p>
                        <h2 className={`text-xl font-semibold tracking-[-0.03em] ${item.highlight ? "text-slate-950" : "text-slate-900"}`}>
                          {item.count}
                        </h2>
                        <p className="text-xs text-slate-400">Date: {item.date}</p>
                      </div>
                      <div className={`flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${item.bg} text-slate-900 shadow-[0_12px_30px_rgba(15,23,42,0.08)]`}>
                        <Icon size={16} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-[24px] border border-white/80 bg-white/85 p-5 shadow-soft backdrop-blur-xl">
              <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-slate-500">
                <Search size={14} />
                Search & Filters
              </div>
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Search Reports
                  </label>
                  <div className="flex h-11 items-center gap-3 overflow-hidden rounded-2xl border border-slate-200/70 bg-white px-3 text-sm text-slate-700 shadow-[0_14px_30px_rgba(15,23,42,0.06)] transition focus-within:ring-2 focus-within:ring-sky-200">
                    <Search size={16} className="text-slate-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search by file name, site type, report type..."
                      className="w-full border-0 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
    Date
  </label>

  <div className="relative">
    <PremiumDatePicker
      value={filterDate}
      onChange={setFilterDate}
      isDateDisabled={(d) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const selected = new Date(d);
        selected.setHours(0, 0, 0, 0);
        return selected >= today;
      }}
      
    />
  </div>
</div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Site Type
                    </label>
                    <Listbox value={filterSiteType} onChange={setFilterSiteType}>
               <div className="relative">

    {/* Button */}
    <Listbox.Button className="w-full h-11 rounded-2xl border border-slate-200 bg-white px-4
     text-sm text-left shadow-sm flex items-center justify-between hover:border-sky-300 focus:ring-2 focus:ring-sky-100 transition">
      <span className="truncate">
        {filterSiteType
          ? allowedSiteTypes.find((s) => s.value === filterSiteType)?.label
          : "All Site Types"}
      </span>
      <ChevronDown size={16} className="text-slate-400" />
    </Listbox.Button>

    {/* Dropdown */}
    <Listbox.Options className="absolute z-50 mt-2 w-full rounded-2xl bg-white border border-slate-200 shadow-[0_20px_60px_rgba(15,23,42,0.12)] p-1">

      {/* Default Option */}
      <Listbox.Option
        value=""
        className={({ active }) =>
          `cursor-pointer rounded-xl px-3 py-2 text-sm ${
            active ? "bg-slate-100 text-slate-900" : "text-slate-600"
          }`
        }
      >
        All Site Types
      </Listbox.Option>

      {/* Dynamic Options */}
      {allowedSiteTypes.map((site) => (
        <Listbox.Option
          key={site.value}
          value={site.value}
          className={({ active }) =>
            `cursor-pointer rounded-xl px-3 py-2 text-sm ${
              active ? "bg-slate-100 text-slate-900" : "text-slate-600"
            }`
          }
        >
          {site.label}
        </Listbox.Option>
      ))}
    </Listbox.Options>

  </div>
</Listbox>
        </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Report Type
                    </label>
                   <Listbox value={filterReportType} onChange={setFilterReportType}>
  <div className="relative">
    
    {/* Button */}
    <Listbox.Button className="w-full h-11 rounded-2xl bg-white border border-slate-200 px-4 text-sm text-left shadow-sm flex items-center 
    justify-between hover:border-sky-300 focus:ring-2 focus:ring-sky-100 transition">
      {reportOptions.find(o => o.value === filterReportType)?.label || "All Report Types"}
      <ChevronDown size={16} className="text-slate-400" />
    </Listbox.Button>

    {/* Dropdown */}
    <Listbox.Options className="absolute z-50 mt-2 w-full rounded-2xl bg-white shadow-[0_20px_60px_rgba(0,0,0,0.08)] p-1">
      {reportOptions.map((option) => (
        <Listbox.Option
          key={option.value}
          value={option.value}
          className={({ active }) =>
            `cursor-pointer rounded-xl px-3 py-2 text-sm ${
              active ? "bg-slate-100 text-slate-900" : "text-slate-600"
            }`
          }
        >
          {option.label}
        </Listbox.Option>
      ))}
    </Listbox.Options>

  </div>
</Listbox>
                  </div>

                  <div className="flex items-end">
                    <button
                      onClick={() => {
                        setSearchTerm("");
                        setFilterDate("");
                        setFilterSiteType("");
                        setFilterReportType("");
                      }}
                      className={`${secondaryButtonClass} w-full justify-center border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100`}
                    >
                      <RotateCcw size={16} />
                      Reset
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[24px] border border-white/80 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.1)]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-600">
                <thead>
                  <tr className="bg-slate-50/90 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <th className="px-4 py-3">
                      <input
                        type="checkbox"
                        onChange={handleSelectAll}
                        checked={allFilteredSelected}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Site Type</th>
                    <th className="px-4 py-3">Report Type</th>
                    <th className="px-4 py-3">Upload Type</th>
                    <th className="px-4 py-3">Uploaded By</th>
                    <th className="px-4 py-3">File Name</th>
                    <th className="px-4 py-3">Uploaded At</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tableLoading ? (
                    <tr>
                      <td className="px-4 py-8 text-sm text-slate-500" colSpan={9}>
                        Loading...
                      </td>
                    </tr>
                  ) : filteredRows.length ? (
                    paginatedRows.map((row) => (
                      <tr key={row.id} className="transition duration-150 hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(row.id)}
                            onChange={() => handleSelect(row.id)}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {formatDateOnly(row.report_date)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${
                              row.site_type === "ENB"
                                ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-100"
                                : "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
                            }`}>
                            {row.site_type || "-"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {row.report_type || "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {row.upload_type || "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {row.uploaded_by || "-"}
                        </td>
                        <td className="max-w-[260px] px-4 py-3 text-sm text-slate-700">
                          <span className="block truncate">{row.file_name || "-"}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">
                          {formatTimestamp(row.uploaded_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {canDownloadFiles ? (
                              <button
                                onClick={() => handleDownload(row.file_name)}
                                className={tableActionClass}
                                title="Download"
                              >
                                <Download size={14} />
                              </button>
                            ) : null}
                            {canUploadReports ? (
                              <button
                                onClick={() => handleEdit(row)}
                                className={tableActionClass}
                                title="Edit"
                              >
                                <Pencil size={14} />
                              </button>
                            ) : null}
                            {canDeleteReports ? (
                              <button
                                onClick={() => handleDelete(row.id)}
                                className={`${tableActionClass} text-red-500 hover:bg-red-50`}
                                title="Delete"
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
                      <td className="px-4 py-8 text-sm text-slate-500" colSpan={9}>
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
          <div className="w-full border-t border-slate-200/80 bg-white/90 px-3 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.04)] backdrop-blur md:px-4">

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">

          {/* LEFT */}
          <div className="text-sm text-slate-500">
            Total files:
            <span className="ml-1 font-medium text-slate-900">
              {totalFiles}
            </span>
          </div>

          {/* RIGHT */}
          <div className="flex flex-wrap items-center justify-end gap-2 rounded-lg bg-white/70 px-3 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.05)] ring-1 ring-slate-200/70">

            <span className="text-sm text-slate-500">Show</span>

            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700"
            >
              {[10, 15, 30, 50, 100].map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>

            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-600 shadow-sm disabled:opacity-50"
            >
              Prev
            </button>

            <span className="text-sm text-slate-600">
              Page {currentPage} of {totalPages}
            </span>

            <button
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
              disabled={currentPage === totalPages}
              className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-600 shadow-sm disabled:opacity-50"
            >
              Next
            </button>

          </div>
        </div>
    </div>
  </div>

        {modalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-950/30 p-3 backdrop-blur-sm">
            <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                    {categoryLabel} Reports
                  </div>
                  <h2 className="mt-1 text-lg font-medium text-slate-900">
    {editingId ? "Edit Report" : "Upload Reports"}
  </h2>
                </div>
                <button
                  onClick={() => setModalOpen(false)}
                  className="rounded-md border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
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
                <div className="mb-3 h-4 text-xs text-slate-500">
                {modalLoadingText || ""}
              </div>
              ) : null}

              <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {uploadType === "single" ? (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-slate-500">Date</label>
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
                      <label className="text-xs text-slate-500">Site Type</label>
                      <select
                        value={siteType}
                        onChange={(e) => setSiteType(e.target.value)}
                        className={`h-9 rounded-md border border-slate-200 px-3 text-sm text-slate-700 focus:outline-none ${accent.ring}`}
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
                      <label className="text-xs text-slate-500">Report Type</label>
                      <select
                        value={reportType}
                        onChange={(e) => setReportType(e.target.value)}
                        className={`h-9 rounded-md border border-slate-200 px-3 text-sm text-slate-700 focus:outline-none ${accent.ring}`}
                      >
                        <option value="">Select Report Type</option>
                        <option value="Outage">Outage Report</option>
                        <option value="Performance">Performance Report</option>
                      </select>
                    </div>
                  </>
                ) : null}

                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Upload Type</label>
                  <div className="flex h-9 items-center gap-3 rounded-md border border-slate-200 px-3 text-sm text-slate-700">
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
                  <label className="text-xs text-slate-500">Uploaded By</label>
                  <input
                    type="text"
                    value={uploadedBy}
                    onChange={(e) => setUploadedBy(e.target.value)}
                    placeholder="Enter name"
                    className={`h-9 rounded-md border border-slate-200 px-3 text-sm text-slate-700 focus:outline-none ${accent.ring}`}
                  />
                </div>

                {uploadType === "bulk" ? (
                  <div className="md:col-span-2">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm text-slate-600">
                        Bulk rows (each row = one file + one record)
                      </div>
                      <button
                        type="button"
                        onClick={addBulkRow}
                        className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        + Add Row
                      </button>
                    </div>

                  <div className="relative max-h-[50vh] space-y-3 overflow-y-auto pr-2">
                      {bulkRows.map((row, index) => (
                        <div
                          key={index}
                          className="relative grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 md:grid-cols-8"
                          >
                          <div className="md:col-span-2">
                            <label className="text-xs text-slate-500">Date</label>
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
                            <label className="text-xs text-slate-500">
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
                              className={`h-9 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-700 focus:outline-none ${accent.ring}`}
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
                            <label className="text-xs text-slate-500">
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
                              className={`h-9 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-700 focus:outline-none ${accent.ring}`}
                            >
                              <option value="">Select Report Type</option>
                              <option value="Outage">Outage Report</option>
                              <option value="Performance">Performance Report</option>
                            </select>
                          </div>

                          <div className="md:col-span-2">
                            <label className="text-xs text-slate-500">File</label>
                            <input
                              type="file"
                              accept=".xlsx,.xls,.xlsb,.csv"
                              onChange={(e) =>
                                handleBulkFileChange(
                                  index,
                                  e.target.files?.[0] || null
                                )
                              }
                              className={`block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-2 file:text-white ${accent.file}`}
                            />
                            {row.file ? (
                              <div className="mt-1 truncate text-xs text-slate-500">
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
                    <label className="text-xs text-slate-500">Excel/CSV File</label>
                    <div className="flex items-center gap-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-3">
                      <input
                        type="file"
                        accept=".xlsx,.xls,.xlsb,.csv"
                        onChange={handleFileChange}
                        className={`block w-full text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:px-3 file:py-2 file:text-white ${accent.file}`}
                      />
                      {file ? (
                        <span className="truncate text-xs text-slate-500">
                          {file.name}
                        </span>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-4">
                <button
                  onClick={() => setModalOpen(false)}
                  className="inline-flex h-9 items-center rounded-md border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              <button
    onClick={handleUpload}
    disabled={uploading}
    className={`${primaryButtonClass} min-w-[112px] justify-center ${accent.button}`}
  >
                    <Upload size={14} />
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
