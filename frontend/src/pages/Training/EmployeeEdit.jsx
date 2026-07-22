import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, PencilLine } from "lucide-react";
import { fetchTrainingEmployee, updateTrainingEmployee } from "../../lib/trainingApi";
import EmployeeForm from "../../components/training/EmployeeForm";

export default function EmployeeEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchTrainingEmployee(id)
      .then((response) => setEmployee(response.data))
      .catch((error) => toast.error(error.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (data) => {
    setSubmitting(true);
    try {
      await updateTrainingEmployee(id, data);
      toast.success("Candidate updated");
      navigate(`/dashboard/training/employees/${id}`);
    } catch (error) {
      toast.error(error.message);
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <div className="h-16 animate-pulse rounded-[20px] bg-surface-muted" />
        <div className="h-96 animate-pulse rounded-[20px] bg-surface-muted" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="mx-auto max-w-5xl p-6 text-center text-sm text-text-muted">
        Training record not found.
      </div>
    );
  }

  if (employee.status === "Converted") {
    return (
      <div className="mx-auto max-w-5xl p-6 text-center text-sm text-text-muted">
        This record has been converted to an employee and can no longer be edited.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-2xl border border-border-color bg-surface text-text-muted transition hover:bg-surface-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-text-primary">
            <PencilLine className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
            Edit — {employee.full_name}
          </h1>
          <p className="mt-0.5 text-sm text-text-muted">
            All changes are recorded in the activity log.
          </p>
        </div>
      </div>

      <EmployeeForm
        initial={employee}
        onSubmit={handleSubmit}
        submitting={submitting}
        submitLabel="Save Changes"
      />
    </div>
  );
}
