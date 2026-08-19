import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { saveAs } from "file-saver";
import toast from "react-hot-toast";
import { Upload } from "lucide-react";

import { buildApiUrl } from "../lib/api";
import { getStoredSession } from "../lib/session";
import useCircleOptions from "../hooks/useCircleOptions";
import useDesignationOptions from "../hooks/useDesignationOptions";
import useAttendanceData from "../hooks/useAttendanceData";
import { todayStr } from "../lib/attendanceFormat";
import { DEFAULT_DATE_RANGE } from "../lib/attendanceDateRange";

import StatsRow from "../components/attendance/StatsRow";
import FiltersBar from "../components/attendance/FiltersBar";
import MissingPanel from "../components/attendance/MissingPanel";
import RecordsTable from "../components/attendance/RecordsTable";
import UploadModal from "../components/attendance/UploadModal";
import EmployeesModal from "../components/attendance/EmployeesModal";
import RecordsDrilldownModal from "../components/attendance/RecordsDrilldownModal";
import AttendanceRateModal from "../components/attendance/AttendanceRateModal";
import UploadCalendarModal from "../components/attendance/UploadCalendarModal";

const DEFAULT_FILTERS = { circle: "", cmp: "", jobRole: "", status: "", search: "" };
const DEFAULT_SORT = { sortBy: "date", sortDir: "desc" };

// Thin composer: owns filter/tab/modal state and one data hook, and renders
// each page section as its own component (see src/components/attendance/).
// See src/hooks/useAttendanceData.js for all the fetching.
function AttendanceManagement() {
  const { circleOptions, getCmpOptions } = useCircleOptions();
  const { options: jobRoleOptions } = useDesignationOptions();

  const [dateRange, setDateRange] = useState(DEFAULT_DATE_RANGE);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showMissingPanel, setShowMissingPanel] = useState(false);
  const [missingDateFrom, setMissingDateFrom] = useState(todayStr());
  const [missingDateTo, setMissingDateTo] = useState(todayStr());
  // Which StatsRow card popup (if any) is open: "employees" | "present" |
  // "absent" | "leave" | "rate" | "records" | "calendar" | null.
  const [activeCard, setActiveCard] = useState(null);

  const cmpOptions = useMemo(() => getCmpOptions(filters.circle), [getCmpOptions, filters.circle]);

  // Per-page delete flag from pagePermissions, same convention as
  // NewJoining.jsx: an empty/missing list means an unrestricted (admin)
  // user; otherwise the "attendance" page entry must explicitly grant delete.
  const canDelete = useMemo(() => {
    const perms = getStoredSession()?.pagePermissions;
    if (!Array.isArray(perms) || perms.length === 0) return true;
    const entry = perms.find((p) => String(p?.page || "").trim().toLowerCase() === "attendance");
    return Boolean(entry?.delete);
  }, []);

  const {
    summary,
    summaryLoading,
    summaryError,
    fetchSummary,
    records,
    recordsLoading,
    recordsError,
    pagination,
    fetchRecords,
    missing,
    missingLoading,
    fetchMissing,
    clearMissing,
    refetchAfterUpload,
    deleteRecord,
    bulkDeleteRecords,
  } = useAttendanceData({ dateRange, filters, sort });

  // Shared scope passed to every card popup / calendar — deliberately
  // excludes Status/search so each popup can apply its own on top. Memoized
  // by primitive value so popups' fetch effects (keyed on this object) don't
  // re-fire on every unrelated parent re-render.
  const scope = useMemo(
    () => ({ dateRange, circle: filters.circle, cmp: filters.cmp, jobRole: filters.jobRole }),
    [dateRange, filters.circle, filters.cmp, filters.jobRole]
  );

  // The Missing Attendance panel previously kept showing results for
  // whatever Circle/CMP/Job Role was selected the moment it was opened —
  // changing those filters while the panel stayed open silently left it
  // stale. Re-check the same range under the new scope whenever it changes.
  useEffect(() => {
    if (!showMissingPanel) return;
    fetchMissing(missingDateFrom, missingDateTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.circle, filters.cmp, filters.jobRole]);

  const handleFiltersChange = (partial) => setFilters((f) => ({ ...f, ...partial }));

  const handleSortChange = (sortBy) => {
    setSort((s) => (s.sortBy === sortBy ? { sortBy, sortDir: s.sortDir === "asc" ? "desc" : "asc" } : { sortBy, sortDir: "asc" }));
  };

  const handleClearAllFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setDateRange(DEFAULT_DATE_RANGE);
  };

  const handleCheckMissing = () => {
    setShowMissingPanel(true);
    fetchMissing(missingDateFrom, missingDateTo);
  };

  const handleMissingDateFromChange = (date) => {
    setMissingDateFrom(date);
    fetchMissing(date, missingDateTo);
  };

  const handleMissingDateToChange = (date) => {
    setMissingDateTo(date);
    fetchMissing(missingDateFrom, date);
  };

  const handleCloseMissing = () => {
    setShowMissingPanel(false);
    clearMissing();
  };

  const handleExportMissing = async () => {
    try {
      const res = await axios.get(buildApiUrl("/api/attendance/dashboard/missing/export"), {
        params: {
          dateFrom: missingDateFrom,
          dateTo: missingDateTo,
          circle: filters.circle,
          cmp: filters.cmp,
          jobRole: filters.jobRole,
        },
        responseType: "blob",
      });
      const rangeSuffix = missingDateFrom === missingDateTo ? missingDateFrom : `${missingDateFrom}_to_${missingDateTo}`;
      saveAs(res.data, `missing_attendance_${rangeSuffix}.xlsx`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to export missing attendance.");
    }
  };

  // Toolbar Export Excel: the day-grid muster roll by default, but switches
  // to the flat filtered row-list (same endpoint every popup uses) whenever
  // a Status filter is active, since a day-grid can't represent "only
  // Present rows" — this keeps the export always matching what's on screen.
  const handleExport = async () => {
    try {
      const rangeParams = {
        range: dateRange.range,
        from: dateRange.range === "custom" ? dateRange.from : undefined,
        to: dateRange.range === "custom" ? dateRange.to : undefined,
      };
      const rangeSuffix = dateRange.range === "custom" && dateRange.from && dateRange.to
        ? `${dateRange.from}_to_${dateRange.to}`
        : dateRange.range;

      if (filters.status) {
        const res = await axios.get(buildApiUrl("/api/attendance/records/export"), {
          params: { ...rangeParams, circle: filters.circle, cmp: filters.cmp, jobRole: filters.jobRole, status: filters.status, search: filters.search },
          responseType: "blob",
        });
        saveAs(res.data, `attendance_records_${rangeSuffix}.xlsx`);
        return;
      }

      const res = await axios.get(buildApiUrl("/api/attendance/report/export"), {
        params: { ...rangeParams, circle: filters.circle, cmp: filters.cmp, jobRole: filters.jobRole },
        responseType: "blob",
      });
      saveAs(res.data, `attendance_${rangeSuffix}.xlsx`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to export the attendance report.");
    }
  };

  // Calendar "View Attendance Records": jump Attendance Records to that
  // single date and close whatever popup triggered it.
  const handleViewRecordsForDate = (dateStr) => {
    setDateRange({ range: "custom", from: dateStr, to: dateStr });
    setActiveCard(null);
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
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onClearAll={handleClearAllFilters}
          circleOptions={circleOptions}
          cmpOptions={cmpOptions}
          jobRoleOptions={jobRoleOptions}
          onExport={handleExport}
          onCheckMissing={handleCheckMissing}
        />

        <StatsRow
          summary={summary}
          summaryLoading={summaryLoading}
          summaryError={summaryError}
          onRetry={fetchSummary}
          onCardClick={setActiveCard}
        />

        {showMissingPanel && (
          <MissingPanel
            dateFrom={missingDateFrom}
            dateTo={missingDateTo}
            onDateFromChange={handleMissingDateFromChange}
            onDateToChange={handleMissingDateToChange}
            missing={missing}
            missingLoading={missingLoading}
            onClose={handleCloseMissing}
            onExport={handleExportMissing}
            scope={{ circle: filters.circle, cmp: filters.cmp, jobRole: filters.jobRole }}
          />
        )}

        <h2 className="text-sm font-semibold text-text-primary">Attendance Records</h2>

        <RecordsTable
          records={records}
          recordsLoading={recordsLoading}
          recordsError={recordsError}
          onRetry={() => fetchRecords(pagination.page)}
          pagination={pagination}
          onPageChange={fetchRecords}
          sort={sort}
          onSortChange={handleSortChange}
          canDelete={canDelete}
          deleteRecord={deleteRecord}
          bulkDeleteRecords={bulkDeleteRecords}
        />
      </div>

      {showUploadModal && (
        <UploadModal
          onClose={() => setShowUploadModal(false)}
          onUploaded={refetchAfterUpload}
        />
      )}

      <EmployeesModal
        open={activeCard === "employees"}
        onClose={() => setActiveCard(null)}
        scope={scope}
      />

      <RecordsDrilldownModal
        open={activeCard === "present"}
        onClose={() => setActiveCard(null)}
        title="Present Records"
        statusOverride="P"
        scope={scope}
        allowDelete={false}
        canDelete={canDelete}
        deleteRecord={deleteRecord}
        bulkDeleteRecords={bulkDeleteRecords}
      />
      <RecordsDrilldownModal
        open={activeCard === "absent"}
        onClose={() => setActiveCard(null)}
        title="Absent Records"
        statusOverride="A"
        scope={scope}
        allowDelete={false}
        canDelete={canDelete}
        deleteRecord={deleteRecord}
        bulkDeleteRecords={bulkDeleteRecords}
      />
      <RecordsDrilldownModal
        open={activeCard === "leave"}
        onClose={() => setActiveCard(null)}
        title="Leave Records"
        statusOverride="L"
        scope={scope}
        allowDelete={false}
        canDelete={canDelete}
        deleteRecord={deleteRecord}
        bulkDeleteRecords={bulkDeleteRecords}
      />
      <RecordsDrilldownModal
        open={activeCard === "records"}
        onClose={() => setActiveCard(null)}
        title="Total Records"
        statusOverride={null}
        scope={scope}
        allowDelete
        canDelete={canDelete}
        deleteRecord={deleteRecord}
        bulkDeleteRecords={bulkDeleteRecords}
      />

      <AttendanceRateModal
        open={activeCard === "rate"}
        onClose={() => setActiveCard(null)}
        summary={summary}
        dateRange={dateRange}
        circleLabel={circleOptions.find((o) => o.value === filters.circle)?.label}
        cmpLabel={cmpOptions.find((o) => o.value === filters.cmp)?.label}
      />

      <UploadCalendarModal
        open={activeCard === "calendar"}
        onClose={() => setActiveCard(null)}
        scope={scope}
        onViewRecords={handleViewRecordsForDate}
      />
    </div>
  );
}

export default AttendanceManagement;
