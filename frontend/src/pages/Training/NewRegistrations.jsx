import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Inbox, Plus, RefreshCw, X } from "lucide-react";
import {
  createTrainingEmployee,
  fetchTrainingEmployees,
  updateTrainingStatus,
} from "../../lib/trainingApi";
import EmployeeTable from "../../components/training/EmployeeTable";
import EmployeeForm from "../../components/training/EmployeeForm";
import SearchBar from "../../components/training/SearchBar";

/**
 * Intake queue: candidates still in "Pending" (fresh Google Form submissions),
 * plus manual registration for walk-in candidates.
 */
export default function NewRegistrations() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchTrainingEmployees({
        status: "Pending",
        search,
        page,
        pageSize: 20,
        sortBy: "id",
        sortDir: "desc",
      });
      setRows(response.data || []);
      setMeta(response.meta);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    load();
  }, [load]);

  const startReview = async (row) => {
    setBusyId(row.id);
    try {
      await updateTrainingStatus(row.id, "Under Review");
      toast.success(`${row.full_name} moved to Under Review`);
      load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleCreate = async (data) => {
    setSubmitting(true);
    try {
      await createTrainingEmployee(data);
      toast.success("Candidate registered");
      setShowForm(false);
      load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-900">
            <Inbox className="h-5 w-5 text-indigo-500" />
            New Registrations
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Pending candidates from the Google Form, waiting for HR review.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="flex h-9 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex h-9 items-center gap-1.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3.5 text-sm font-semibold text-white shadow transition hover:from-blue-700 hover:to-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Add Candidate
          </button>
        </div>
      </div>

      <SearchBar value={search} onChange={(value) => { setSearch(value); setPage(1); }} />

      <EmployeeTable
        rows={rows}
        meta={meta}
        loading={loading}
        sortBy="id"
        sortDir="desc"
        onSortChange={() => {}}
        onPageChange={setPage}
        actions={(row) => (
          <button
            type="button"
            disabled={busyId === row.id}
            onClick={() => startReview(row)}
            className="rounded-xl bg-sky-500 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-600 disabled:opacity-50"
          >
            Start Review
          </button>
        )}
      />

      {/* Manual registration modal */}
      {showForm ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm"
          onClick={() => setShowForm(false)}
        >
          <div
            className="my-6 w-full max-w-3xl rounded-[22px] bg-slate-50 p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800">
                Register Candidate Manually
              </h2>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-200 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <EmployeeForm
              onSubmit={handleCreate}
              submitting={submitting}
              submitLabel="Register Candidate"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
