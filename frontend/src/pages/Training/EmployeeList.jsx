import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Download, Loader2, RefreshCw, Users } from "lucide-react";
import {
  exportTrainingEmployees,
  fetchTrainingBatches,
  fetchTrainingEmployees,
} from "../../lib/trainingApi";
import EmployeeTable from "../../components/training/EmployeeTable";
import SearchBar from "../../components/training/SearchBar";
import Filters from "../../components/training/Filters";

const EMPTY_FILTERS = { status: "", batch: "", dateFrom: "", dateTo: "" };

export default function EmployeeList() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [batches, setBatches] = useState([]);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sortBy, setSortBy] = useState("id");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);

  const queryParams = {
    search,
    status: filters.status,
    batch: filters.batch,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    sortBy,
    sortDir,
    page,
    pageSize: 20,
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchTrainingEmployees(queryParams);
      setRows(response.data || []);
      setMeta(response.meta);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filters, sortBy, sortDir, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetchTrainingBatches()
      .then((response) => setBatches(response.data || []))
      .catch(() => {});
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportTrainingEmployees(queryParams);
      toast.success("Excel export downloaded");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-text-primary">
            <Users className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
            Training Employees
          </h1>
          <p className="mt-0.5 text-sm text-text-muted">
            Search, filter and manage all registered candidates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="flex h-9 items-center gap-1.5 rounded-2xl border border-border-color bg-surface px-3 text-sm font-medium text-text-secondary shadow-sm transition hover:bg-surface-muted"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="flex h-9 items-center gap-1.5 rounded-2xl bg-emerald-600 px-3.5 text-sm font-semibold text-white shadow transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export Excel
          </button>
        </div>
      </div>

      <div className="space-y-3 rounded-[20px] border border-border-color bg-surface/70 p-4 shadow-sm">
        <SearchBar value={search} onChange={(value) => { setSearch(value); setPage(1); }} />
        <Filters
          value={filters}
          batches={batches}
          onChange={(next) => {
            setFilters(next);
            setPage(1);
          }}
          onReset={() => {
            setFilters(EMPTY_FILTERS);
            setSearch("");
            setPage(1);
          }}
        />
      </div>

      <EmployeeTable
        rows={rows}
        meta={meta}
        loading={loading}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={(column, direction) => {
          setSortBy(column);
          setSortDir(direction);
          setPage(1);
        }}
        onPageChange={setPage}
      />
    </div>
  );
}
