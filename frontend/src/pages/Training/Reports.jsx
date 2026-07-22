import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import {
  exportTrainingEmployees,
  fetchTrainingBatches,
  fetchTrainingStats,
} from "../../lib/trainingApi";
import Filters from "../../components/training/Filters";
import TrainingStats from "../../components/training/TrainingStats";

const EMPTY_FILTERS = { status: "", batch: "", dateFrom: "", dateTo: "" };

const PRESETS = [
  { label: "All Candidates", filters: {} },
  { label: "Pending Review", filters: { status: "Pending" } },
  { label: "Approved (Ready to Convert)", filters: { status: "Approved" } },
  { label: "Converted Employees", filters: { status: "Converted" } },
  { label: "Rejected Candidates", filters: { status: "Rejected" } },
];

export default function Reports() {
  const [stats, setStats] = useState(null);
  const [batches, setBatches] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(null); // preset label or "custom"

  useEffect(() => {
    Promise.all([fetchTrainingStats(), fetchTrainingBatches()])
      .then(([statsRes, batchesRes]) => {
        setStats(statsRes.data);
        setBatches(batchesRes.data || []);
      })
      .catch((error) => toast.error(error.message))
      .finally(() => setLoading(false));
  }, []);

  const runExport = async (label, exportFilters) => {
    setExporting(label);
    try {
      await exportTrainingEmployees(exportFilters);
      toast.success("Excel report downloaded");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-text-primary">
          <FileSpreadsheet className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
          Reports
        </h1>
        <p className="mt-0.5 text-sm text-text-muted">
          Export training data to Excel with any combination of filters.
        </p>
      </div>

      <TrainingStats stats={stats} loading={loading} />

      {/* One-click presets */}
      <div className="rounded-[20px] border border-border-color bg-surface p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-text-secondary">Quick Reports</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              disabled={exporting !== null}
              onClick={() => runExport(preset.label, preset.filters)}
              className="flex h-9 items-center gap-1.5 rounded-2xl border border-border-color bg-surface px-3.5 text-sm font-medium text-text-secondary shadow-sm transition hover:border-emerald-300 hover:dark:border-emerald-500/30 hover:bg-emerald-50 hover:dark:bg-emerald-500/10 hover:text-emerald-700 hover:dark:text-emerald-400 disabled:opacity-50"
            >
              {exporting === preset.label ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom report */}
      <div className="rounded-[20px] border border-border-color bg-surface p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-text-secondary">Custom Report</h2>
        <div className="mt-3 space-y-3">
          <Filters
            value={filters}
            batches={batches}
            onChange={setFilters}
            onReset={() => setFilters(EMPTY_FILTERS)}
          />
          <button
            type="button"
            disabled={exporting !== null}
            onClick={() => runExport("custom", filters)}
            className="flex h-10 items-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {exporting === "custom" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export Filtered Excel
          </button>
        </div>
      </div>
    </div>
  );
}
