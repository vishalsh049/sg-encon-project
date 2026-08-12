import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";

import { buildApiUrl } from "../lib/api";

const DEFAULT_PAGE_SIZE = 50;

function monthBounds(month) {
  if (!/^\d{4}-\d{2}$/.test(month || "")) return { monthStart: "", monthEnd: "" };
  const [year, mon] = month.split("-").map(Number);
  const lastDay = new Date(year, mon, 0).getDate();
  return {
    monthStart: `${month}-01`,
    monthEnd: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

// Every fetch function the Attendance page needs, in one place. Records are
// scoped to the selected month (the same window /dashboard/summary already
// uses) plus whatever extra filters are active, so switching the month
// actually changes what the Records tab shows instead of only affecting the
// summary card and export like it used to.
export default function useAttendanceData({ month, filters }) {
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 });

  const [uploads, setUploads] = useState([]);
  const [uploadsLoading, setUploadsLoading] = useState(true);

  const [missing, setMissing] = useState(null);
  const [missingLoading, setMissingLoading] = useState(false);

  const fetchSummary = useCallback(async () => {
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
  }, [month, filters.circle, filters.cmp, filters.jobRole]);

  const fetchRecords = useCallback(async (page = 1) => {
    setRecordsLoading(true);
    try {
      const { monthStart, monthEnd } = monthBounds(month);
      const res = await axios.get(buildApiUrl("/api/attendance/records"), {
        params: {
          page,
          pageSize: DEFAULT_PAGE_SIZE,
          circle: filters.circle,
          cmp: filters.cmp,
          jobRole: filters.jobRole,
          status: filters.status,
          search: filters.search,
          dateFrom: monthStart,
          dateTo: monthEnd,
        },
      });
      setRecords(res.data.records || []);
      setPagination(res.data.pagination || { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 });
    } catch (err) {
      console.error(err);
    } finally {
      setRecordsLoading(false);
    }
  }, [month, filters.circle, filters.cmp, filters.jobRole, filters.status, filters.search]);

  const fetchUploads = useCallback(async () => {
    setUploadsLoading(true);
    try {
      const res = await axios.get(buildApiUrl("/api/attendance/uploads"));
      setUploads(res.data.uploads || []);
    } catch (err) {
      console.error(err);
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
      toast.error(err?.response?.data?.message || "Failed to load missing attendance.");
    } finally {
      setMissingLoading(false);
    }
  }, [filters.circle, filters.cmp, filters.jobRole]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchRecords(1); }, [fetchRecords]);
  useEffect(() => { fetchUploads(); }, [fetchUploads]);

  const refetchAfterUpload = useCallback(
    () => Promise.all([fetchSummary(), fetchRecords(1), fetchUploads()]),
    [fetchSummary, fetchRecords, fetchUploads]
  );

  return {
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
    clearMissing: () => setMissing(null),
    refetchAfterUpload,
  };
}
