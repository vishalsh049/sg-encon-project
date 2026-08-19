import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";

import { buildApiUrl } from "../lib/api";

const DEFAULT_PAGE_SIZE = 50;

function rangeParams(dateRange) {
  const params = { range: dateRange.range };
  if (dateRange.range === "custom") {
    params.from = dateRange.from;
    params.to = dateRange.to;
  }
  return params;
}

function errorMessage(err, fallback) {
  return err?.response?.data?.message || fallback;
}

// Every fetch function the Attendance page needs, in one place. Records,
// summary and export all resolve the same `dateRange` (range/from/to) on the
// backend via resolveAttendanceDateRange, so switching Today/This Week/
// Custom Range etc. changes every card, table and export consistently.
export default function useAttendanceData({ dateRange, filters, sort }) {
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(null);

  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 });

  const [uploads, setUploads] = useState([]);
  // Starts true (not fetched yet) but harmlessly so — UploadHistoryTable
  // isn't rendered until its tab opens, at which point fetchUploads runs
  // (see AttendanceManagement.jsx). Never fetched on initial page mount.
  const [uploadsLoading, setUploadsLoading] = useState(true);
  const [uploadsError, setUploadsError] = useState(null);

  const [missing, setMissing] = useState(null);
  const [missingLoading, setMissingLoading] = useState(false);

  // One AbortController ref per fetch kind, so a fast filter change cancels
  // whatever request it just made obsolete instead of letting a slower,
  // now-stale response land after a fresher one and clobber the screen.
  const summaryAbortRef = useRef(null);
  const recordsAbortRef = useRef(null);
  const uploadsAbortRef = useRef(null);
  const missingAbortRef = useRef(null);

  const fetchSummary = useCallback(async () => {
    summaryAbortRef.current?.abort();
    const controller = new AbortController();
    summaryAbortRef.current = controller;
    setSummaryLoading(true);
    try {
      const res = await axios.get(buildApiUrl("/api/attendance/dashboard/summary"), {
        params: { ...rangeParams(dateRange), circle: filters.circle, cmp: filters.cmp, jobRole: filters.jobRole },
        signal: controller.signal,
      });
      setSummary(res.data);
      setSummaryError(null);
    } catch (err) {
      if (axios.isCancel(err)) return;
      console.error(err);
      setSummary(null);
      setSummaryError(errorMessage(err, "Failed to load the attendance summary."));
    } finally {
      if (summaryAbortRef.current === controller) setSummaryLoading(false);
    }
  }, [dateRange, filters.circle, filters.cmp, filters.jobRole]);

  const fetchRecords = useCallback(async (page = 1) => {
    recordsAbortRef.current?.abort();
    const controller = new AbortController();
    recordsAbortRef.current = controller;
    setRecordsLoading(true);
    try {
      const res = await axios.get(buildApiUrl("/api/attendance/records"), {
        params: {
          page,
          pageSize: DEFAULT_PAGE_SIZE,
          circle: filters.circle,
          cmp: filters.cmp,
          jobRole: filters.jobRole,
          status: filters.status,
          search: filters.search,
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
          ...rangeParams(dateRange),
        },
        signal: controller.signal,
      });
      setRecords(res.data.records || []);
      setPagination(res.data.pagination || { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 });
      setRecordsError(null);
    } catch (err) {
      if (axios.isCancel(err)) return;
      console.error(err);
      setRecordsError(errorMessage(err, "Failed to load attendance records."));
    } finally {
      if (recordsAbortRef.current === controller) setRecordsLoading(false);
    }
  }, [dateRange, filters.circle, filters.cmp, filters.jobRole, filters.status, filters.search, sort.sortBy, sort.sortDir]);

  const fetchUploads = useCallback(async () => {
    uploadsAbortRef.current?.abort();
    const controller = new AbortController();
    uploadsAbortRef.current = controller;
    setUploadsLoading(true);
    try {
      const res = await axios.get(buildApiUrl("/api/attendance/uploads"), { signal: controller.signal });
      setUploads(res.data.uploads || []);
      setUploadsError(null);
    } catch (err) {
      if (axios.isCancel(err)) return;
      console.error(err);
      setUploadsError(errorMessage(err, "Failed to load upload history."));
    } finally {
      if (uploadsAbortRef.current === controller) setUploadsLoading(false);
    }
  }, []);

  const fetchMissing = useCallback(async (dateStr) => {
    missingAbortRef.current?.abort();
    const controller = new AbortController();
    missingAbortRef.current = controller;
    setMissingLoading(true);
    try {
      const res = await axios.get(buildApiUrl("/api/attendance/dashboard/missing"), {
        params: { date: dateStr, circle: filters.circle, cmp: filters.cmp, jobRole: filters.jobRole },
        signal: controller.signal,
      });
      setMissing(res.data);
    } catch (err) {
      if (axios.isCancel(err)) return;
      toast.error(errorMessage(err, "Failed to load missing attendance."));
    } finally {
      if (missingAbortRef.current === controller) setMissingLoading(false);
    }
  }, [filters.circle, filters.cmp, filters.jobRole]);

  // Only summary + page-1 records are needed for the page to open — Upload
  // History is fetched lazily (see AttendanceManagement.jsx) when its tab is
  // actually opened, not here, so it never blocks/competes on initial load.
  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchRecords(1); }, [fetchRecords]);

  const refetchAfterUpload = useCallback(
    () => Promise.all([fetchSummary(), fetchRecords(pagination.page), fetchUploads()]),
    [fetchSummary, fetchRecords, fetchUploads, pagination.page]
  );

  // Single/bulk delete both re-run summary + the current records page +
  // uploads afterward (same refetchAfterUpload shape) so cards, table and
  // Upload History never show stale post-delete counts.
  const deleteRecord = useCallback(async (id) => {
    await axios.delete(buildApiUrl(`/api/attendance/records/${id}`));
    await refetchAfterUpload();
  }, [refetchAfterUpload]);

  const bulkDeleteRecords = useCallback(async (ids) => {
    const res = await axios.post(buildApiUrl("/api/attendance/records/bulk-delete"), { ids });
    await refetchAfterUpload();
    return res.data;
  }, [refetchAfterUpload]);

  return {
    summary,
    summaryLoading,
    summaryError,
    fetchSummary,
    records,
    recordsLoading,
    recordsError,
    pagination,
    fetchRecords,
    uploads,
    uploadsLoading,
    uploadsError,
    fetchUploads,
    missing,
    missingLoading,
    fetchMissing,
    clearMissing: () => setMissing(null),
    refetchAfterUpload,
    deleteRecord,
    bulkDeleteRecords,
  };
}
