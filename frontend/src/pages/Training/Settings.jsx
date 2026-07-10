import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  CheckCircle2,
  Copy,
  FileText,
  Globe,
  Settings as SettingsIcon,
  XCircle,
} from "lucide-react";
import { buildApiUrl } from "../../lib/api";
import { fetchDocumentTypes } from "../../lib/trainingApi";

const WORKFLOW_STEPS = [
  "Candidate submits the Google Form with details and documents",
  "Google Apps Script posts the submission to the webhook",
  "Candidate appears in New Registrations as Pending",
  "HR reviews the profile and verifies each document",
  "HR approves the candidate",
  "Convert to Employee generates an SG employee code in the Employee Module",
];

export default function Settings() {
  const [health, setHealth] = useState(null); // null=loading, true/false
  const [documentTypes, setDocumentTypes] = useState([]);

  const webhookUrl = buildApiUrl("/api/training-webhook/google-form");

  useEffect(() => {
    fetch(buildApiUrl("/api/training-webhook/health"))
      .then((response) => response.json())
      .then((body) => setHealth(Boolean(body?.configured)))
      .catch(() => setHealth(false));

    fetchDocumentTypes()
      .then((response) => setDocumentTypes(response.data || []))
      .catch(() => {});
  }, []);

  const copyWebhookUrl = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast.success("Webhook URL copied");
    } catch {
      toast.error("Could not copy — copy it manually");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-900">
          <SettingsIcon className="h-5 w-5 text-indigo-500" />
          Training Settings
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Google Form integration status and module configuration.
        </p>
      </div>

      {/* Webhook status */}
      <div className="rounded-[20px] border border-slate-100 bg-white p-4 shadow-sm">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Globe className="h-4 w-4 text-slate-400" />
          Google Form Webhook
        </h2>

        <div className="mt-3 flex items-center gap-2">
          {health === null ? (
            <span className="text-sm text-slate-400">Checking…</span>
          ) : health ? (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Configured — webhook key is set on the server
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
              <XCircle className="h-3.5 w-3.5" />
              Not configured — set TRAINING_WEBHOOK_KEY in the backend .env
            </span>
          )}
        </div>

        <div className="mt-3">
          <label className="mb-1 block px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Webhook URL (paste into Apps Script → Script Properties → WEBHOOK_URL)
          </label>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {webhookUrl}
            </code>
            <button
              type="button"
              onClick={copyWebhookUrl}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
              title="Copy"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-400">
          Full setup instructions are in <code>google-apps-script/README.md</code> in the
          project repository.
        </p>
      </div>

      {/* Document types */}
      <div className="rounded-[20px] border border-slate-100 bg-white p-4 shadow-sm">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <FileText className="h-4 w-4 text-slate-400" />
          Accepted Document Types
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {documentTypes.map((type) => (
            <span
              key={type}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium capitalize text-slate-600"
            >
              {type.replace(/_/g, " ")}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Uploads accept JPG, PNG, WEBP and PDF up to 10 MB per file.
        </p>
      </div>

      {/* Workflow reference */}
      <div className="rounded-[20px] border border-slate-100 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Workflow</h2>
        <ol className="mt-3 space-y-2">
          {WORKFLOW_STEPS.map((step, index) => (
            <li key={step} className="flex items-start gap-2.5 text-sm text-slate-600">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
