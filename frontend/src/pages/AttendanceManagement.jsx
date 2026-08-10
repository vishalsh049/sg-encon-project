import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Select from "react-select";
import { saveAs } from "file-saver";
import toast from "react-hot-toast";
import {
  Upload,
  FileSpreadsheet,
  Download,
  Users,
  CheckCircle2,
  XCircle,
  CalendarClock,
  X,
  ClipboardList,
  History,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";

import { buildApiUrl } from "../lib/api";
import PremiumDatePicker from "../components/PremiumDatePicker";
import ValidationErrorModal from "../components/ValidationErrorModal";
import useCircleOptions from "../hooks/useCircleOptions";
import useDesignationOptions from "../hooks/useDesignationOptions";

const selectStyles = {
  control: (provided, state) => ({
    ...provided,
    minHeight: "36px",
    height: "36px",
    borderRadius: "8px",
    borderColor: state.isFocused ? "rgb(var(--color-primary))" : "rgb(var(--color-border))",
    boxShadow: state.isFocused ? "0 0 0 3px rgba(99,102,241,0.15)" : "none",
    fontSize: "13px",
    backgroundColor: "rgb(var(--color-surface))",
  }),
  valueContainer: (provided) => ({ ...provided, height: "32px", padding: "0 12px" }),
  indicatorsContainer: (provided) => ({ ...provided, height: "32px" }),
  menu: (provided) => ({ ...provided, zIndex: 99999, marginTop: 2, backgroundColor: "rgb(var(--color-surface-elevated))" }),
  menuList: (provided) => ({ ...provided, maxHeight: "260px", paddingTop: 0 }),
  input: (provided) => ({ ...provided, fontSize: "12px", color: "rgb(var(--color-text-primary))" }),
  singleValue: (provided) => ({ ...provided, color: "rgb(var(--color-text-primary))" }),
};

const STATUS_OPTIONS = [
  { value: "P", label: "Present" },
  { value: "A", label: "Absent" },
  { value: "L", label: "Leave" },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

function formatDisplayDate(value) {
  if (!value) return "-";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.valueOf())) return "-";
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "-";
  return parsed.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_BADGE = {
  P: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  A: "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400",
  L: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

function StatusBadge({ code }) {
  if (!code) return <span className="text-text-muted">-</span>;
  const label = { P: "Present", A: "Absent", L: "Leave" }[code] || code;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[code] || "bg-surface-muted text-text-secondary"}`}>
      {label}
    </span>
  );
}

function StatCard({ label, value, icon: Icon, tone = "blue" }) {
  const toneClasses = {
    blue: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10",
    green: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10",
    red: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10",
    amber: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10",
    gray: "text-text-secondary bg-surface-muted",
  };
  return (
    <div className="rounded-2xl border border-border-color/70 bg-surface/70 backdrop-blur-xl p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wide text-text-muted">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${toneClasses[tone]}`}>
          <Icon size={16} />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold text-text-primary">{value}</p>
    </div>
  );
}

function AttendanceManagement() {
  const { circleOptions, getCmpOptions } = useCircleOptions();
  const { options: jobRoleOptions } = useDesignationOptions();

  const [activeTab, setActiveTab] = useState("records");

  const [filters, setFilters] = useState({ circle: "", cmp: "", jobRole: "", status: "" });
  const [month, setMonth] = useState(currentMonthStr());

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, total: 0 });

  const [uploads, setUploads] = useState([]);
  const [uploadsLoading, setUploadsLoading] = useState(true);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [attendanceDate, setAttendanceDate] = useState(todayStr());
  const [file, setFile] = useState(null);
  const [validating, setValidating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState(null); // { batchId, summary, previewRows, attendanceDate }
  const [duplicateAction, setDuplicateAction] = useState("");
  const [errorModalData, setErrorModalData] = useState(null);

  const [missing, setMissing] = useState(null);
  const [missingLoading, setMissingLoading] = useState(false);

  const cmpOptions = useMemo(() => getCmpOptions(filters.circle), [getCmpOptions, filters.circle]);

  const fetchSummary = async () => {
    setSummaryLoading(true);
    try {
      const res = await axios.get(buildApiUrl("/api/attendance/dashboard/summary"), {
        params: { month, circle: filters.circle, cmp: filters.cmp, jobRole: filters.jobRole },
      });
      setSummary(res.data);
    } catch (err) {
      console.error(err);
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  };

  const fetchRecords = async (page = 1) => {
    setRecordsLoading(true);
    try {
      const res = await axios.get(buildApiUrl("/api/attendance/records"), {
        params: {
          page,
          pageSize: pagination.pageSize,
          circle: filters.circle,
          cmp: filters.cmp,
          jobRole: filters.jobRole,
          status: filters.status,
        },
      });
      setRecords(res.data.records || []);
      setPagination(res.data.pagination || { page: 1, pageSize: 50, total: 0 });
    } catch (err) {
      console.error(err);
    } finally {
      setRecordsLoading(false);
    }
  };

  const fetchUploads = async () => {
    setUploadsLoading(true);
    try {
      const res = await axios.get(buildApiUrl("/api/attendance/uploads"));
      setUploads(res.data.uploads || []);
    } catch (err) {
      console.error(err);
    } finally {
      setUploadsLoading(false);
    }
  };

  const fetchMissing = async (dateStr) => {
    setMissingLoading(true);
    try {
      const res = await axios.get(buildApiUrl("/api/attendance/dashboard/missing"), {
        params: { date: dateStr, circle: filters.circle, cmp: filters.cmp, jobRole: filters.jobRole },
      });
      setMissing(res.data);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load missing attendance.");
    } finally {
      setMissingLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, filters.circle, filters.cmp, filters.jobRole]);

  useEffect(() => {
    fetchRecords(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.circle, filters.cmp, filters.jobRole, filters.status]);

  useEffect(() => {
    fetchUploads();
  }, []);

  useEffect(() => {
    document.body.style.overflow = showUploadModal ? "hidden" : "auto";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [showUploadModal]);

  const resetUploadModal = () => {
    setShowUploadModal(false);
    setFile(null);
    setPreview(null);
    setDuplicateAction("");
    setAttendanceDate(todayStr());
  };

  const handleValidate = async (event) => {
    event.preventDefault();
    if (!file) {
      toast.error("Please select an Excel file.");
      return;
    }

    setValidating(true);
    setPreview(null);
    try {
      const formData = new FormData();
      formData.append("attendanceDate", attendanceDate);
      formData.append("file", file);

      const res = await axios.post(buildApiUrl("/api/attendance/upload/validate"), formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const data = res.data;
      setPreview(data);
      setDuplicateAction("");

      if (data.summary.errorRows > 0) {
        setErrorModalData({ errors: data.errors, totalRecords: data.summary.totalRows });
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to validate the attendance file.");
    } finally {
      setValidating(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview?.batchId) return;
    const hasConflicts = preview.summary.conflictRows > 0;
    if (hasConflicts && !duplicateAction) {
      toast.error("Choose Skip or Update for the existing attendance records first.");
      return;
    }

    setConfirming(true);
    try {
      const res = await axios.post(buildApiUrl("/api/attendance/upload/confirm"), {
        batchId: preview.batchId,
        duplicateAction: duplicateAction || undefined,
      });

      toast.success(res.data.message || "Attendance saved successfully.");
      resetUploadModal();
      await Promise.all([fetchSummary(), fetchRecords(1), fetchUploads()]);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save attendance.");
    } finally {
      setConfirming(false);
    }
  };

  const handleCancelPreview = async () => {
    if (preview?.batchId) {
      try {
        await axios.post(buildApiUrl("/api/attendance/upload/cancel"), { batchId: preview.batchId });
      } catch (err) {
        console.error(err);
      }
    }
    setPreview(null);
    setFile(null);
    setDuplicateAction("");
  };

  const handleExport = async () => {
    try {
      const res = await axios.get(buildApiUrl("/api/attendance/report/export"), {
        params: { month, circle: filters.circle, cmp: filters.cmp, jobRole: filters.jobRole, status: filters.status },
        responseType: "blob",
      });
      saveAs(res.data, `attendance_${month}.xlsx`);
    } catch (err) {
      toast.error("Failed to export the attendance report.");
    }
  };

  const previewRows = preview?.previewRows || [];
  const conflictCount = preview?.summary?.conflictRows || 0;
  const canConfirm = preview && preview.summary.errorRows === 0 && (!conflictCount || !!duplicateAction);

  return (
    <div className="relative max-w-full">
      <div className={`relative flex min-w-0 h-full flex-col gap-6 ${showUploadModal ? "blur-sm" : ""}`}>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-[-0.05em] text-text-primary sm:text-xl md:text-[1.2rem]">
              Attendance Management
            </h1>
            <p className="max-w-3xl text-sm text-text-muted md:text-[15px]">
              Upload daily attendance against employees already in the Physical master. Employees not found there
              must be added in Physical first.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 text-sm font-semibold text-white transition hover:-translate-y-1 sm:w-auto"
          >
            <Upload size={16} />
            Upload Attendance
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9 rounded-lg border border-border-color bg-surface px-3 text-sm text-text-primary"
          />
          <div className="w-44">
            <Select
              styles={selectStyles}
              placeholder="Circle"
              isClearable
              options={circleOptions}
              value={circleOptions.find((o) => o.value === filters.circle) || null}
              onChange={(selected) => setFilters((f) => ({ ...f, circle: selected?.value || "", cmp: "" }))}
            />
          </div>
          <div className="w-44">
            <Select
              styles={selectStyles}
              placeholder="CMP"
              isClearable
              options={cmpOptions}
              value={cmpOptions.find((o) => o.value === filters.cmp) || null}
              onChange={(selected) => setFilters((f) => ({ ...f, cmp: selected?.value || "" }))}
            />
          </div>
          <div className="w-52">
            <Select
              styles={selectStyles}
              placeholder="Job Role"
              isClearable
              options={jobRoleOptions}
              value={jobRoleOptions.find((o) => o.value === filters.jobRole) || null}
              onChange={(selected) => setFilters((f) => ({ ...f, jobRole: selected?.value || "" }))}
            />
          </div>
          <div className="w-40">
            <Select
              styles={selectStyles}
              placeholder="Status"
              isClearable
              options={STATUS_OPTIONS}
              value={STATUS_OPTIONS.find((o) => o.value === filters.status) || null}
              onChange={(selected) => setFilters((f) => ({ ...f, status: selected?.value || "" }))}
            />
          </div>
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-color bg-surface px-3 text-sm font-medium text-text-secondary transition hover:text-text-primary"
          >
            <Download size={14} />
            Export Excel
          </button>
          <button
            type="button"
            onClick={() => fetchMissing(todayStr())}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-color bg-surface px-3 text-sm font-medium text-text-secondary transition hover:text-text-primary"
          >
            <AlertTriangle size={14} />
            Missing Today
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="Total Employees" value={summaryLoading ? "..." : summary?.totalEmployees ?? 0} icon={Users} tone="blue" />
          <StatCard label="Present" value={summaryLoading ? "..." : summary?.present ?? 0} icon={CheckCircle2} tone="green" />
          <StatCard label="Absent" value={summaryLoading ? "..." : summary?.absent ?? 0} icon={XCircle} tone="red" />
          <StatCard label="Leave" value={summaryLoading ? "..." : summary?.leave ?? 0} icon={CalendarClock} tone="amber" />
          <StatCard
            label="Days Uploaded"
            value={summaryLoading ? "..." : `${summary?.daysUploaded ?? 0}/${summary?.totalDaysInMonth ?? "-"}`}
            icon={ClipboardList}
            tone="gray"
          />
        </div>

        {missing && (
          <div className="rounded-2xl border border-amber-200/60 bg-amber-50/60 p-4 dark:border-amber-500/20 dark:bg-amber-500/5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                {missing.count} employee(s) missing attendance for {formatDisplayDate(todayStr())}
              </p>
              <button type="button" onClick={() => setMissing(null)} className="text-text-muted hover:text-text-primary">
                <X size={16} />
              </button>
            </div>
            {missingLoading ? (
              <p className="text-sm text-text-muted">Loading...</p>
            ) : missing.count === 0 ? (
              <p className="text-sm text-text-muted">All employees have attendance recorded for today.</p>
            ) : (
              <div className="max-h-56 overflow-y-auto rounded-lg border border-border-color/60">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-muted text-text-muted">
                    <tr>
                      <th className="px-3 py-2">HRMS ID</th>
                      <th className="px-3 py-2">Employee Name</th>
                      <th className="px-3 py-2">Job Role</th>
                      <th className="px-3 py-2">CMP</th>
                      <th className="px-3 py-2">Circle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missing.missing.map((row) => (
                      <tr key={row.employee_code} className="border-t border-border-color/50">
                        <td className="px-3 py-2">{row.employee_code}</td>
                        <td className="px-3 py-2">{row.employee_name}</td>
                        <td className="px-3 py-2">{row.job_role}</td>
                        <td className="px-3 py-2">{row.cmp}</td>
                        <td className="px-3 py-2">{row.circle}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 border-b border-border-color/60">
          {[
            { key: "records", label: "Attendance Records" },
            { key: "uploads", label: "Upload History" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.key
                  ? "border-b-2 border-blue-600 text-blue-600 dark:text-blue-400"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "records" && (
          <div className="overflow-x-auto rounded-2xl border border-border-color/70 bg-surface/70">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-muted text-xs uppercase text-text-muted">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">HRMS ID</th>
                  <th className="px-4 py-3">Employee Name</th>
                  <th className="px-4 py-3">Job Role</th>
                  <th className="px-4 py-3">CMP</th>
                  <th className="px-4 py-3">Circle</th>
                  <th className="px-4 py-3">Attendance</th>
                </tr>
              </thead>
              <tbody>
                {recordsLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-text-muted">Loading...</td>
                  </tr>
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-text-muted">No attendance records found.</td>
                  </tr>
                ) : (
                  records.map((record) => (
                    <tr key={record.id} className="border-t border-border-color/50">
                      <td className="px-4 py-3">{formatDisplayDate(String(record.attendance_date).slice(0, 10))}</td>
                      <td className="px-4 py-3">{record.employee_code}</td>
                      <td className="px-4 py-3">{record.employee_name}</td>
                      <td className="px-4 py-3">{record.job_role}</td>
                      <td className="px-4 py-3">{record.cmp}</td>
                      <td className="px-4 py-3">{record.circle}</td>
                      <td className="px-4 py-3"><StatusBadge code={record.status} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {pagination.total > pagination.pageSize && (
              <div className="flex items-center justify-between border-t border-border-color/50 px-4 py-3 text-xs text-text-muted">
                <span>
                  Page {pagination.page} of {Math.max(1, Math.ceil(pagination.total / pagination.pageSize))} ({pagination.total} records)
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pagination.page <= 1}
                    onClick={() => fetchRecords(pagination.page - 1)}
                    className="rounded-md border border-border-color px-2 py-1 disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={pagination.page * pagination.pageSize >= pagination.total}
                    onClick={() => fetchRecords(pagination.page + 1)}
                    className="rounded-md border border-border-color px-2 py-1 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "uploads" && (
          <div className="overflow-x-auto rounded-2xl border border-border-color/70 bg-surface/70">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-muted text-xs uppercase text-text-muted">
                <tr>
                  <th className="px-4 py-3">Uploaded At</th>
                  <th className="px-4 py-3">Attendance Date</th>
                  <th className="px-4 py-3">File</th>
                  <th className="px-4 py-3">Uploaded By</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Inserted</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3">Skipped</th>
                </tr>
              </thead>
              <tbody>
                {uploadsLoading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-text-muted">Loading...</td>
                  </tr>
                ) : uploads.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-text-muted">No uploads yet.</td>
                  </tr>
                ) : (
                  uploads.map((item) => (
                    <tr key={item.id} className="border-t border-border-color/50">
                      <td className="px-4 py-3">{formatDateTime(item.created_at)}</td>
                      <td className="px-4 py-3">{formatDisplayDate(String(item.attendance_date).slice(0, 10))}</td>
                      <td className="px-4 py-3">{item.original_name}</td>
                      <td className="px-4 py-3">{item.uploaded_by_name || "-"}</td>
                      <td className="px-4 py-3 capitalize">{item.status.replace("_", " ")}</td>
                      <td className="px-4 py-3">{item.total_rows}</td>
                      <td className="px-4 py-3">{item.inserted_rows}</td>
                      <td className="px-4 py-3">{item.updated_rows}</td>
                      <td className="px-4 py-3">{item.skipped_rows}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showUploadModal && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">Upload Attendance</h2>
              <button type="button" onClick={resetUploadModal} className="text-text-muted hover:text-text-primary">
                <X size={18} />
              </button>
            </div>

            {!preview && (
              <form onSubmit={handleValidate} className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-muted">Attendance Date</label>
                  <PremiumDatePicker
                    value={attendanceDate}
                    onChange={setAttendanceDate}
                    isDateDisabled={(date) => date > new Date()}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-text-muted">Excel File (.xlsx, .xls, .csv)</label>
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-color bg-surface-muted px-4 py-8 text-sm text-text-muted hover:border-blue-400">
                    <FileSpreadsheet size={18} />
                    {file ? file.name : "Click to select a file"}
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                  </label>
                  <p className="mt-1 text-[11px] text-text-muted">Required columns: Aadhar No, HRMS ID, Attendance.</p>
                </div>

                <button
                  type="submit"
                  disabled={validating}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {validating ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
                  {validating ? "Validating..." : "Validate & Preview"}
                </button>
              </form>
            )}

            {preview && (
              <div className="space-y-4">
                <div className="grid grid-cols-4 gap-3 text-center text-sm">
                  <div className="rounded-lg bg-surface-muted p-2">
                    <p className="text-text-muted text-[11px]">Total Rows</p>
                    <p className="font-bold text-text-primary">{preview.summary.totalRows}</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 p-2">
                    <p className="text-emerald-600 dark:text-emerald-400 text-[11px]">Valid</p>
                    <p className="font-bold text-emerald-600 dark:text-emerald-400">{preview.summary.validRows}</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 p-2">
                    <p className="text-amber-600 dark:text-amber-400 text-[11px]">Existing</p>
                    <p className="font-bold text-amber-600 dark:text-amber-400">{preview.summary.conflictRows}</p>
                  </div>
                  <div className="rounded-lg bg-rose-50 dark:bg-rose-500/10 p-2">
                    <p className="text-rose-600 dark:text-rose-400 text-[11px]">Errors</p>
                    <p className="font-bold text-rose-600 dark:text-rose-400">{preview.summary.errorRows}</p>
                  </div>
                </div>

                {preview.summary.errorRows > 0 && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400">
                    This file has validation errors and cannot be saved.{" "}
                    <button
                      type="button"
                      className="font-semibold underline"
                      onClick={() => setErrorModalData({ errors: preview.errors, totalRecords: preview.summary.totalRows })}
                    >
                      View errors
                    </button>{" "}
                    and re-upload a corrected file.
                  </div>
                )}

                {conflictCount > 0 && preview.summary.errorRows === 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
                    <p className="mb-2 font-medium text-amber-700 dark:text-amber-400">
                      Attendance already exists for {conflictCount} employee(s) on {formatDisplayDate(preview.attendanceDate)}. Choose what to do:
                    </p>
                    <div className="flex gap-4 text-sm">
                      <label className="flex items-center gap-2">
                        <input type="radio" name="duplicateAction" value="skip" checked={duplicateAction === "skip"} onChange={() => setDuplicateAction("skip")} />
                        Skip Existing
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="radio" name="duplicateAction" value="update" checked={duplicateAction === "update"} onChange={() => setDuplicateAction("update")} />
                        Update Existing
                      </label>
                    </div>
                  </div>
                )}

                <div className="max-h-72 overflow-y-auto rounded-lg border border-border-color/60">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-surface-muted text-text-muted">
                      <tr>
                        <th className="px-3 py-2">Row</th>
                        <th className="px-3 py-2">HRMS ID</th>
                        <th className="px-3 py-2">Employee</th>
                        <th className="px-3 py-2">Attendance</th>
                        <th className="px-3 py-2">Validation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row) => (
                        <tr key={row.row} className="border-t border-border-color/40">
                          <td className="px-3 py-2">{row.row}</td>
                          <td className="px-3 py-2">{row.hrmsId || "-"}</td>
                          <td className="px-3 py-2">{row.employeeName || "-"}</td>
                          <td className="px-3 py-2">{row.attendanceCode || "-"}</td>
                          <td className="px-3 py-2">
                            {row.status === "valid" && <span className="text-emerald-600 dark:text-emerald-400">Valid</span>}
                            {row.status === "conflict" && (
                              <span className="text-amber-600 dark:text-amber-400">Already {row.existingStatus}</span>
                            )}
                            {row.status === "error" && (
                              <span className="text-rose-600 dark:text-rose-400">{row.errorMessages?.[0] || "Invalid"}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleCancelPreview}
                    className="rounded-xl border border-border-color px-4 py-2 text-sm font-medium text-text-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!canConfirm || confirming}
                    onClick={handleConfirm}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {confirming ? <RefreshCw size={16} className="animate-spin" /> : <History size={16} />}
                    {confirming ? "Saving..." : "Confirm & Save"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ValidationErrorModal
        isOpen={!!errorModalData}
        onClose={() => setErrorModalData(null)}
        errorData={errorModalData}
        title="Attendance Upload Validation Failed"
        subtitle="Fix these rows in the Excel file and upload again. No records were saved."
      />
    </div>
  );
}

export default AttendanceManagement;
