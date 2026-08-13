import { useCallback, useEffect, useState } from "react";
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
  const [uploadsLoading, setUploadsLoading] = useState(true);
  const [uploadsError, setUploadsError] = useState(null);

  const [missing, setMissing] = useState(null);
  const [missingLoading, setMissingLoading] = useState(false);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await axios.get(buildApiUrl("/api/attendance/dashboard/summary"), {
        params: { ...rangeParams(dateRange), circle: filters.circle, cmp: filters.cmp, jobRole: filters.jobRole },
      });
      setSummary(res.data);
      setSummaryError(null);
    } catch (err) {
      console.error(err);
      setSummary(null);
      setSummaryError(errorMessage(err, "Failed to load the attendance summary."));
    } finally {
      setSummaryLoading(false);
    }
  }, [dateRange, filters.circle, filters.cmp, filters.jobRole]);

  const fetchRecords = useCallback(async (page = 1) => {
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
      });
      setRecords(res.data.records || []);
      setPagination(res.data.pagination || { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 });
      setRecordsError(null);
    } catch (err) {
      console.error(err);
      setRecordsError(errorMessage(err, "Failed to load attendance records."));
    } finally {
      setRecordsLoading(false);
    }
  }, [dateRange, filters.circle, filters.cmp, filters.jobRole, filters.status, filters.search, sort.sortBy, sort.sortDir]);

  const fetchUploads = useCallback(async () => {
    setUploadsLoading(true);
    try {
      const res = await axios.get(buildApiUrl("/api/attendance/uploads"));
      setUploads(res.data.uploads || []);
      setUploadsError(null);
    } catch (err) {
      console.error(err);
      setUploadsError(errorMessage(err, "Failed to load upload history."));
    } finally {
      setUploadsLoading(false);
    }
  }, []);

  const fetchMissing = useCallback(async (dateStr) => {
    setMissingLoading(true);
    try {
      const res = await axios.get(buildApiUrl("/api/attendance/dashboard/missing"), {
        params: { date: dateStr, circle: filters.circle, cmp: filters.cmp, jobRole: filters.jobRole },
      });
      setMissing(res.data);
    } catch (err) {
      toast.error(errorMessage(err, "Failed to load missing attendance."));
    } finally {
      setMissingLoading(false);
    }
  }, [filters.circle, filters.cmp, filters.jobRole]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchRecords(1); }, [fetchRecords]);
  useEffect(() => { fetchUploads(); }, [fetchUploads]);

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
