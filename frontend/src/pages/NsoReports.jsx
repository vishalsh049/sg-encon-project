import { useEffect, useMemo, useState } from "react";
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
import { buildApiUrl } from "../lib/api";
import PremiumDatePicker from "../components/PremiumDatePicker";

const reportTypes = ["Outage", "Performance", "Inventory", "Quality", "Audit"];
const uploadTypes = ["single", "bulk"];

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
  const [filterSiteType, setFilterSiteType] = useState("");
  const [filterReportType, setFilterReportType] = useState("");
  const [filterUploadType, setFilterUploadType] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const today = useMemo(() => {
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const [form, setForm] = useState({
    report_date: today,
    site_type: "",
    report_type: "",
    upload_type: "single",
    uploaded_by:
      localStorage.getItem("userName") ||
      localStorage.getItem("name") ||
      localStorage.getItem("username") ||
      "",
    file: null,
  });

  const siteTypes = useMemo(() => {
    const values = new Set();
    rows.forEach((row) => {
      if (row.site_type) values.add(row.site_type);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const formatDateOnly = (value) => {
    if (!value) return "-";
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.valueOf())) return "-";
    return date.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" });
  };

  const formatTimestamp = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return "-";
    return date.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getRowDateValue = (row) => {
    if (!row?.report_date) return "";
    const date = new Date(`${row.report_date}T00:00:00`);
    if (Number.isNaN(date.valueOf())) return "";
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const resetForm = () => {
    setForm({
      report_date: today,
      site_type: "",
      report_type: "",
      upload_type: "single",
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
      const [rowsRes, summaryRes] = await Promise.all([
        axios.get(buildApiUrl("/api/nso")),
        axios.get(buildApiUrl("/api/nso/summary")),
      ]);
      setRows(rowsRes.data?.rows || []);
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

    return rows.filter((row) => {
      const rowDate = getRowDateValue(row);
      const matchesSearch =
        !normalizedSearch ||
        [
          row.site_type,
          row.report_type,
          row.upload_type,
          row.uploaded_by,
          row.original_file_name,
          row.file_name,
          rowDate,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(normalizedSearch)
          );

      return (
        matchesSearch &&
        (!filterDate || rowDate === filterDate) &&
        (!filterSiteType || row.site_type === filterSiteType) &&
        (!filterReportType || row.report_type === filterReportType) &&
        (!filterUploadType || row.upload_type === filterUploadType)
      );
    });
  }, [
    rows,
    searchTerm,
    filterDate,
    filterSiteType,
    filterReportType,
    filterUploadType,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterDate, filterSiteType, filterReportType, filterUploadType, pageSize]);

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
      label: "Total Reports",
      value: summary.totalReports || rows.length,
      helper: "All uploaded NSO files",
      icon: FileSpreadsheet,
    },
    {
      label: "Rows Captured",
      value: summary.totalRecords || 0,
      helper: "Workbook entries ingested",
      icon: ChartColumnBig,
    },
    {
      label: "Site Types",
      value: summary.totalSiteTypes || siteTypes.length,
      helper: "Distinct categories tracked",
      icon: Filter,
    },
    {
      label: "Latest Upload",
      value: summary.latestUploadAt
        ? formatTimestamp(summary.latestUploadAt)
        : "No uploads",
      helper: "Most recent backend sync",
      icon: RefreshCcw,
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
      site_type: row.site_type || "",
      report_type: row.report_type || "",
      upload_type: row.upload_type || "single",
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

    if (!form.report_date || !form.site_type || !form.report_type || !form.upload_type) {
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
          site_type: form.site_type,
          report_type: form.report_type,
          upload_type: form.upload_type,
          uploaded_by: form.uploaded_by.trim(),
        });
        setMessageType("success");
        setMessage("Report updated successfully.");
      } else {
        const formData = new FormData();
        formData.append("file", form.file);
        formData.append("date", form.report_date);
        formData.append("site_type", form.site_type);
        formData.append("report_type", form.report_type);
        formData.append("upload_type", form.upload_type);
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

  const handleDownload = (fileName) => {
    if (!fileName) return;
    const encoded = encodeURIComponent(fileName);
    const link = document.createElement("a");
    link.href = buildApiUrl(`/api/nso/download/${encoded}`);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleBulkDownload = async () => {
    if (!selectedIds.length) return;

    try {
      const response = await fetch(buildApiUrl("/api/nso/bulk-download"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: selectedIds }),
      });

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "nso-reports.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (_error) {
      window.alert("Bulk download failed");
    }
  };

  const handleExport = () => {
    const link = document.createElement("a");
    link.href = buildApiUrl("/api/nso/export");
    link.download = `nso-reports-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="w-full pb-24">
      <div className="mx-auto w-full space-y-3">
        <section className="relative overflow-hidden rounded-[28px] border border-slate-200
         bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.2),_transparent_30%),linear-gradient(135deg,#f8fafc_0%,#eef6ff_45%,#fff8ed_100%)]
          px-5 py-4 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-32 w-32 rounded-full bg-amber-200/30 blur-3xl" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-2 inline-flex items-center rounded-full border border-cyan-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-700">
                Fiber Reports / NSO Console
              </div>
              <h1 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900 md:text-2xl">
                NSO reports with a real operations workflow
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
                Upload, search, export, and manage NSO activity in one place.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleExport}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white/85 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-white"
              >
                <Download size={16} />
                Export CSV
              </button>
              <button
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                <Upload size={16} />
                Upload NSO Report
              </button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="rounded-[24px] border border-slate-200 bg-white px-4 py-2 shadow-[0_12px_36px_rgba(15,23,42,0.05)]"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-medium text-slate-500">
                    {stat.label}
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                    <Icon size={16} />
                  </div>
                </div>
                <div className="text-2xl font-semibold tracking-[-0.03em] text-slate-900">
                  {stat.value}
                </div>
                <div className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">
                  {stat.helper}
                </div>
              </div>
            );
          })}
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_50px_rgba(15,23,42,0.05)] md:p-6">
          <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                Control Panel
              </div>
              <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-slate-700">
                Search, filter, and act on NSO uploads
              </h2>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleBulkDownload}
                disabled={!selectedIds.length}
                className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download size={16} />
                Download ({selectedIds.length})
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={!selectedIds.length}
                className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={16} />
                Delete ({selectedIds.length})
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))]">
            <label className="relative block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                Search
              </span>
              <Search
                size={16}
                className="pointer-events-none absolute left-4 top-[36px] text-slate-400"
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="File name, site, report, uploader, date"
                className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-4
                 text-sm text-slate-800 outline-none transition focus:border-cyan-400 focus:bg-white"
              />
            </label>

            <div>
              <span className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                Date
              </span>
              <PremiumDatePicker
                value={filterDate}
                onChange={setFilterDate}
                className="w-full"
              />
            </div>

            <label className="block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                Site Type
              </span>
              <select
                value={filterSiteType}
                onChange={(event) => setFilterSiteType(event.target.value)}
                className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm
                 text-slate-800 outline-none transition focus:border-cyan-400 focus:bg-white"
              >
                <option value="">All site types</option>
                {siteTypes.map((siteType) => (
                  <option key={siteType} value={siteType}>
                    {siteType}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                Report Type
              </span>
              <select
                value={filterReportType}
                onChange={(event) => setFilterReportType(event.target.value)}
                className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-800 outline-none transition focus:border-cyan-400 focus:bg-white"
              >
                <option value="">All report types</option>
                {Array.from(
                  new Set(
                    [...reportTypes, ...rows.map((row) => row.report_type).filter(Boolean)]
                  )
                ).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end gap-3">
              <label className="block flex-1">
                <span className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                  Upload Type
                </span>
                <select
                  value={filterUploadType}
                  onChange={(event) => setFilterUploadType(event.target.value)}
                  className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-800 outline-none transition focus:border-cyan-400 focus:bg-white"
                >
                  <option value="">All uploads</option>
                  {uploadTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <button
                onClick={() => {
                  setSearchTerm("");
                  setFilterDate("");
                  setFilterSiteType("");
                  setFilterReportType("");
                  setFilterUploadType("");
                }}
                className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Reset
              </button>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                NSO Upload Register
              </h2>
              <p className="text-sm text-slate-500">
                {filteredRows.length} matching report{filteredRows.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span>Rows per page</span>
              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
                className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700"
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
              <thead className="bg-slate-50 text-slate-500">
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
                  <th className="px-5 py-4 font-medium">Site Type</th>
                  <th className="px-5 py-4 font-medium">Report Type</th>
                  <th className="px-5 py-4 font-medium">Upload Type</th>
                  <th className="px-5 py-4 font-medium">Uploaded By</th>
                  <th className="px-5 py-4 font-medium">File</th>
                  <th className="px-5 py-4 font-medium">Rows</th>
                  <th className="px-5 py-4 font-medium">Uploaded At</th>
                  <th className="px-5 py-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="10" className="px-5 py-12 text-center text-slate-400">
                      Loading NSO reports...
                    </td>
                  </tr>
                ) : paginatedRows.length ? (
                  paginatedRows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-slate-100 transition hover:bg-slate-50/80"
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
                      <td className="px-5 py-4 text-slate-700">
                        {formatDateOnly(row.report_date)}
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700">
                          {row.site_type || "-"}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-700">
                        {row.report_type || "-"}
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-medium uppercase text-amber-700">
                          {row.upload_type || "-"}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-700">
                        {row.uploaded_by || "-"}
                      </td>
                      <td className="max-w-[220px] px-5 py-4 text-slate-700">
                        <div className="truncate" title={row.original_file_name || row.file_name}>
                          {row.original_file_name || row.file_name || "-"}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-700">
                        {row.total_records ?? 0}
                      </td>
                      <td className="px-5 py-4 text-slate-700">
                        {formatTimestamp(row.uploaded_at)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-3">
                          <button
                            onClick={() => handleDownload(row.file_name)}
                            className="inline-flex items-center gap-1 text-sm font-medium text-cyan-700 hover:text-cyan-900"
                          >
                            <Download size={15} />
                            Download
                          </button>
                          <button
                            onClick={() => openEditModal(row)}
                            className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-900"
                          >
                            <Pencil size={15} />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(row.id)}
                            className="inline-flex items-center gap-1 text-sm font-medium text-rose-700 hover:text-rose-900"
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
                        <div className="text-lg font-semibold text-slate-800">
                          No NSO reports found
                        </div>
                        <div className="mt-2 text-sm text-slate-500">
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

          <div className="flex flex-col gap-4 border-t border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-slate-500">
              Showing{" "}
              <span className="font-semibold text-slate-800">
                {paginatedRows.length}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-slate-800">
                {filteredRows.length}
              </span>{" "}
              filtered reports
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Prev
              </button>
              <div className="text-sm text-slate-600">
                Page {currentPage} of {totalPages}
              </div>
              <button
                onClick={() =>
                  setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                }
                disabled={currentPage === totalPages}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-[30px] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.2)]">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  NSO workflow
                </div>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-900">
                  {editingId ? "Edit NSO report" : "Upload NSO report"}
                </h2>
                <p className="mt-2 text-sm text-slate-500">
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
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 px-6 py-6">
              {message ? (
                <div
                  className={`rounded-2xl px-4 py-3 text-sm ${
                    messageType === "error"
                      ? "border border-rose-200 bg-rose-50 text-rose-700"
                      : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {message}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                    Report Date
                  </label>
                  <PremiumDatePicker
                    value={form.report_date}
                    onChange={(value) =>
                      setForm((prev) => ({ ...prev, report_date: value }))
                    }
                    className="w-full"
                  />
                </div>

                <label className="block">
                  <span className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                    Site Type
                  </span>
                  <input
                    type="text"
                    value={form.site_type}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        site_type: event.target.value,
                      }))
                    }
                    placeholder="Example: ENB, ESC, HPODSC"
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-800 outline-none transition focus:border-cyan-400 focus:bg-white"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                    Report Type
                  </span>
                  <select
                    value={form.report_type}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        report_type: event.target.value,
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-800 outline-none transition focus:border-cyan-400 focus:bg-white"
                  >
                    <option value="">Select report type</option>
                    {reportTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                    Upload Type
                  </span>
                  <select
                    value={form.upload_type}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        upload_type: event.target.value,
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-800 outline-none transition focus:border-cyan-400 focus:bg-white"
                  >
                    {uploadTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block md:col-span-2">
                  <span className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
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
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-800 outline-none transition focus:border-cyan-400 focus:bg-white"
                  />
                </label>

                {!editingId ? (
                  <label className="block md:col-span-2">
                    <span className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                      Workbook File
                    </span>
                    <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-4">
                      <input
                        type="file"
                        accept=".xlsx,.xls,.xlsb,.csv"
                        onChange={handleFileChange}
                        className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-900 file:px-4 file:py-2.5 file:text-white"
                      />
                      <div className="mt-3 text-sm text-slate-500">
                        {form.file
                          ? form.file.name
                          : "Supported formats: .xlsx, .xls, .xlsb, .csv"}
                      </div>
                    </div>
                  </label>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-5">
              <button
                onClick={() => {
                  setModalOpen(false);
                  resetForm();
                }}
                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
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
