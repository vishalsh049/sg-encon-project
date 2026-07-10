import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import Swal from "sweetalert2";
import {
  Activity,
  BadgeCheck,
  FileText,
  Loader2,
  ShieldCheck,
  Trash2,
  UserCheck,
} from "lucide-react";
import {
  convertTrainingEmployee,
  deleteTrainingEmployee,
  fetchEmployeeDocuments,
  fetchEmployeeLogs,
  fetchEmployeeVerifications,
  fetchTrainingEmployee,
  updateTrainingStatus,
  uploadEmployeeDocument,
  fetchDocumentTypes,
} from "../../lib/trainingApi";
import ProfileHeader from "../../components/training/ProfileHeader";
import VerificationChecklist from "../../components/training/VerificationChecklist";
import DocumentViewer from "../../components/training/DocumentViewer";
import UploadProgress from "../../components/training/UploadProgress";
import StatusBadge from "../../components/training/StatusBadge";

const FIELD_GROUPS = [
  {
    title: "Personal",
    fields: [
      ["father_name", "Father Name"],
      ["dob", "Date of Birth"],
      ["gender", "Gender"],
      ["marital_status", "Marital Status"],
      ["blood_group", "Blood Group"],
    ],
  },
  {
    title: "Contact",
    fields: [
      ["mobile", "Mobile"],
      ["alt_mobile", "Alternate Mobile"],
      ["email", "Email"],
      ["permanent_address", "Permanent Address"],
      ["current_address", "Current Address"],
      ["city", "City"],
      ["state", "State"],
      ["pincode", "Pincode"],
    ],
  },
  {
    title: "Identity",
    fields: [
      ["aadhaar_no", "Aadhaar Number"],
      ["pan_no", "PAN Number"],
    ],
  },
  {
    title: "Professional & Training",
    fields: [
      ["qualification", "Qualification"],
      ["experience_years", "Experience (yrs)"],
      ["previous_company", "Previous Company"],
      ["designation_applied", "Designation Applied"],
      ["circle", "Circle"],
      ["training_batch", "Training Batch"],
      ["training_start_date", "Training Start"],
      ["training_end_date", "Training End"],
    ],
  },
  {
    title: "Bank & Emergency",
    fields: [
      ["bank_name", "Bank Name"],
      ["bank_account_no", "Account Number"],
      ["ifsc_code", "IFSC"],
      ["emergency_contact_name", "Emergency Contact"],
      ["emergency_contact_no", "Emergency Number"],
    ],
  },
];

function formatValue(key, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (key.includes("date") || key === "dob") return String(value).slice(0, 10);
  return String(value);
}

export default function EmployeeProfile() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [employee, setEmployee] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [verifications, setVerifications] = useState([]);
  const [logs, setLogs] = useState([]);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [uploadState, setUploadState] = useState({ state: "idle" });
  const [uploadType, setUploadType] = useState("other");

  const load = useCallback(async () => {
    try {
      const [employeeRes, documentsRes, verificationsRes, logsRes] = await Promise.all([
        fetchTrainingEmployee(id),
        fetchEmployeeDocuments(id),
        fetchEmployeeVerifications(id),
        fetchEmployeeLogs(id),
      ]);
      setEmployee(employeeRes.data);
      setDocuments(documentsRes.data || []);
      setVerifications(verificationsRes.data || []);
      setLogs(logsRes.data || []);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    fetchDocumentTypes()
      .then((response) => setDocumentTypes(response.data || []))
      .catch(() => {});
  }, [load]);

  const changeStatus = async (status) => {
    setBusy(true);
    try {
      await updateTrainingStatus(id, status);
      toast.success(`Status set to ${status}`);
      load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const handleConvert = async () => {
    const confirmed = await Swal.fire({
      title: "Convert to Employee?",
      text: `${employee.full_name} will be added to the Employee Module with a new SG employee code. This cannot be undone.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Convert",
      confirmButtonColor: "#4f46e5",
    });
    if (!confirmed.isConfirmed) return;

    setBusy(true);
    try {
      const result = await convertTrainingEmployee(id);
      await Swal.fire({
        title: "Converted!",
        text: `Employee Code: ${result.data.employeeCode}`,
        icon: "success",
        confirmButtonColor: "#4f46e5",
      });
      load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = await Swal.fire({
      title: "Delete this record?",
      text: `${employee.full_name} and all uploaded documents will be permanently removed.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#e11d48",
    });
    if (!confirmed.isConfirmed) return;

    setBusy(true);
    try {
      await deleteTrainingEmployee(id);
      toast.success("Training record deleted");
      navigate("/dashboard/training/employees");
    } catch (error) {
      toast.error(error.message);
      setBusy(false);
    }
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploadState({ state: "uploading", fileName: file.name });
    try {
      await uploadEmployeeDocument(id, uploadType, file);
      setUploadState({ state: "success", fileName: file.name });
      load();
    } catch (error) {
      setUploadState({ state: "error", message: error.message });
    }
    setTimeout(() => setUploadState({ state: "idle" }), 4000);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        <div className="h-28 animate-pulse rounded-[22px] bg-slate-100" />
        <div className="h-64 animate-pulse rounded-[22px] bg-slate-100" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="mx-auto max-w-6xl p-6 text-center text-sm text-slate-500">
        Training record not found.
      </div>
    );
  }

  const isConverted = employee.status === "Converted";

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <ProfileHeader employee={employee}>
        {!isConverted ? (
          <>
            {employee.status !== "Under Review" && employee.status !== "Approved" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => changeStatus("Under Review")}
                className="flex h-9 items-center gap-1.5 rounded-2xl bg-sky-500 px-3 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:opacity-50"
              >
                <ShieldCheck className="h-4 w-4" /> Start Review
              </button>
            ) : null}
            {employee.status !== "Approved" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => changeStatus("Approved")}
                className="flex h-9 items-center gap-1.5 rounded-2xl bg-emerald-500 px-3 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
              >
                <BadgeCheck className="h-4 w-4" /> Approve
              </button>
            ) : null}
            {employee.status !== "Rejected" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => changeStatus("Rejected")}
                className="flex h-9 items-center gap-1.5 rounded-2xl bg-rose-500 px-3 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:opacity-50"
              >
                Reject
              </button>
            ) : null}
            {employee.status === "Approved" ? (
              <button
                type="button"
                disabled={busy}
                onClick={handleConvert}
                className="flex h-9 items-center gap-1.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-3 text-sm font-semibold text-white shadow transition hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                Convert to Employee
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={handleDelete}
              className="flex h-9 w-9 items-center justify-center rounded-2xl border border-rose-200 text-rose-500 transition hover:bg-rose-50 disabled:opacity-50"
              title="Delete record"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        ) : null}
      </ProfileHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Details */}
        <div className="space-y-4 lg:col-span-2">
          {FIELD_GROUPS.map((group) => (
            <div key={group.title} className="rounded-[20px] border border-slate-100 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-700">{group.title}</h2>
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
                {group.fields.map(([key, label]) => (
                  <div key={key} className="flex justify-between gap-3 text-sm">
                    <dt className="text-slate-400">{label}</dt>
                    <dd className="text-right font-medium text-slate-700">
                      {formatValue(key, employee[key])}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}

          {/* Documents */}
          <div className="rounded-[20px] border border-slate-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <FileText className="h-4 w-4 text-slate-400" />
                Documents ({documents.length})
              </h2>
              {!isConverted ? (
                <div className="flex items-center gap-2">
                  <select
                    value={uploadType}
                    onChange={(event) => setUploadType(event.target.value)}
                    className="h-8 rounded-xl border border-slate-200 bg-white px-2 text-xs text-slate-600 outline-none"
                  >
                    {(documentTypes.length ? documentTypes : ["other"]).map((type) => (
                      <option key={type} value={type}>
                        {type.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                  <label className="flex h-8 cursor-pointer items-center rounded-xl bg-blue-600 px-2.5 text-xs font-semibold text-white transition hover:bg-blue-700">
                    Upload
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,.pdf"
                      className="hidden"
                      onChange={handleUpload}
                    />
                  </label>
                </div>
              ) : null}
            </div>
            <UploadProgress {...uploadState} />
            <div className={uploadState.state !== "idle" ? "mt-2" : ""}>
              <VerificationChecklist
                documents={documents}
                onChanged={load}
                onPreview={setPreview}
                disabled={isConverted}
              />
            </div>
          </div>
        </div>

        {/* Sidebar: verification history + activity log */}
        <div className="space-y-4">
          <div className="rounded-[20px] border border-slate-100 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700">Verification History</h2>
            <div className="mt-3 space-y-2.5">
              {verifications.length ? (
                verifications.map((entry) => (
                  <div key={entry.id} className="rounded-xl bg-slate-50 p-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-700">
                        {entry.document_type
                          ? entry.document_type.replace(/_/g, " ")
                          : "Profile"}
                      </span>
                      <StatusBadge status={entry.action} />
                    </div>
                    {entry.remarks ? (
                      <p className="mt-1 text-slate-500">{entry.remarks}</p>
                    ) : null}
                    <p className="mt-1 text-slate-400">
                      {entry.verified_by} · {String(entry.created_at || "").replace("T", " ").slice(0, 19)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-xs text-slate-400">No verifications yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-[20px] border border-slate-100 bg-white p-4 shadow-sm">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <Activity className="h-4 w-4 text-slate-400" />
              Activity Log
            </h2>
            <div className="mt-3 space-y-2">
              {logs.length ? (
                logs.map((log) => (
                  <div key={log.id} className="border-l-2 border-indigo-100 pl-2.5 text-xs">
                    <p className="font-semibold text-slate-600">{log.action}</p>
                    <p className="text-slate-400">
                      {log.performed_by} · {String(log.created_at || "").replace("T", " ").slice(0, 19)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-xs text-slate-400">No activity yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {preview ? <DocumentViewer document={preview} onClose={() => setPreview(null)} /> : null}
    </div>
  );
}
