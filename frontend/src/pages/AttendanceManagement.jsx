import { useMemo, useState } from "react";
import axios from "axios";
import { saveAs } from "file-saver";
import toast from "react-hot-toast";
import { Upload } from "lucide-react";

import { buildApiUrl } from "../lib/api";
import useCircleOptions from "../hooks/useCircleOptions";
import useDesignationOptions from "../hooks/useDesignationOptions";
import useAttendanceData from "../hooks/useAttendanceData";
import { todayStr, currentMonthStr } from "../lib/attendanceFormat";

import StatsRow from "../components/attendance/StatsRow";
import FiltersBar from "../components/attendance/FiltersBar";
import MissingPanel from "../components/attendance/MissingPanel";
import RecordsTable from "../components/attendance/RecordsTable";
import UploadHistoryTable from "../components/attendance/UploadHistoryTable";
import UploadModal from "../components/attendance/UploadModal";

// Thin composer: owns filter/tab/modal state and one data hook, and renders
// each page section as its own component (see src/components/attendance/).
// See src/hooks/useAttendanceData.js for all the fetching.
function AttendanceManagement() {
  const { circleOptions, getCmpOptions } = useCircleOptions();
  const { options: jobRoleOptions } = useDesignationOptions();

  const [activeTab, setActiveTab] = useState("records");
  const [month, setMonth] = useState(currentMonthStr());
  const [filters, setFilters] = useState({ circle: "", cmp: "", jobRole: "", status: "", search: "" });
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showMissingPanel, setShowMissingPanel] = useState(false);
  const [missingDate, setMissingDate] = useState(todayStr());

  const cmpOptions = useMemo(() => getCmpOptions(filters.circle), [getCmpOptions, filters.circle]);

  const {
    summary,
    summaryLoading,
    records,
    recordsLoading,
    pagination,
    fetchRecords,
    uploads,
    uploadsLoading,
    missing,
    missingLoading,
    fetchMissing,
    clearMissing,
    refetchAfterUpload,
  } = useAttendanceData({ month, filters });

  const handleFiltersChange = (partial) => setFilters((f) => ({ ...f, ...partial }));

  const handleCheckMissing = () => {
    setShowMissingPanel(true);
    fetchMissing(missingDate);
  };

  const handleMissingDateChange = (date) => {
    setMissingDate(date);
    fetchMissing(date);
  };

  const handleCloseMissing = () => {
    setShowMissingPanel(false);
    clearMissing();
  };

  const handleExport = async () => {
    try {
      const res = await axios.get(buildApiUrl("/api/attendance/report/export"), {
        params: { month, circle: filters.circle, cmp: filters.cmp, jobRole: filters.jobRole, status: filters.status },
        responseType: "blob",
      });
      saveAs(res.data, `attendance_${month}.xlsx`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to export the attendance report.");
    }
  };

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

        <FiltersBar
          month={month}
          onMonthChange={setMonth}
          filters={filters}
          onFiltersChange={handleFiltersChange}
          circleOptions={circleOptions}
          cmpOptions={cmpOptions}
          jobRoleOptions={jobRoleOptions}
          onExport={handleExport}
          onCheckMissing={handleCheckMissing}
        />

        <StatsRow summary={summary} summaryLoading={summaryLoading} />

        {showMissingPanel && (
          <MissingPanel
            date={missingDate}
            onDateChange={handleMissingDateChange}
            missing={missing}
            missingLoading={missingLoading}
            onClose={handleCloseMissing}
          />
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
          <RecordsTable
            records={records}
            recordsLoading={recordsLoading}
            pagination={pagination}
            onPageChange={fetchRecords}
          />
        )}

        {activeTab === "uploads" && (
          <UploadHistoryTable uploads={uploads} uploadsLoading={uploadsLoading} />
        )}
      </div>

      {showUploadModal && (
        <UploadModal
          onClose={() => setShowUploadModal(false)}
          onUploaded={refetchAfterUpload}
        />
      )}
    </div>
  );
}

export default AttendanceManagement;
