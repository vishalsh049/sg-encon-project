import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Search, UserRound } from "lucide-react";

import { lookupEmployee } from "../../lib/expenseClaimsApi";

const FIELD =
  "h-11 w-full rounded-lg border border-border-color bg-surface px-3 text-sm text-text-primary outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 disabled:bg-surface-muted disabled:text-text-muted";
const LABEL = "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted";

// Compact horizontal panel for the fetched employee master record — a light
// info strip that does not eat vertical space.
function EmployeeInfoPanel({ info }) {
  const cells = [
    ["Name", info.employeeName],
    ["Employee ID", info.employeeCode],
    ["Designation", info.designation],
    ["Circle", info.circle],
    ["CMP", info.cmp],
    ["Bank A/C", info.bankAccount],
    ["IFSC", info.ifsc],
  ].filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "");

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 size={13} /> Employee Information
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
        {cells.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{k}</dt>
            <dd className="truncate text-[13px] font-medium text-text-primary" title={String(v)}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[10px] text-text-muted">
        Applies to every expense item in this claim.
      </p>
    </div>
  );
}

/**
 * Claim-level Employee ID / HRMS ID + Fetch. Entered ONCE per claim; the
 * resolved employee master snapshot is shared by every expense item.
 *
 * `value` is the claim party object; `onChange(patch)` merges fields into it.
 */
export default function EmployeePartyPicker({ value, onChange }) {
  const [empInput, setEmpInput] = useState(value.empRefCode || "");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");

  const fetchEmployee = async (codeArg) => {
    const code = String(codeArg ?? empInput).trim();
    if (!code) return;
    setBusy(true);
    setError("");
    try {
      const res = await lookupEmployee(code);
      const e = res.data;
      setInfo(e);
      setEmpInput(e.employeeCode || code);
      onChange({
        empRefCode: e.employeeCode || code,
        empRefName: e.employeeName || "",
        empRefDesignation: e.designation || "",
        empRefCircle: e.circle || "",
        empRefCmp: e.cmp || "",
        bankAccount: e.bankAccount || "",
        ifsc: e.ifsc || "",
      });
    } catch (err) {
      setInfo(null);
      setError(
        err?.status === 404
          ? "Employee not found. Please check the Employee ID / HRMS ID."
          : err?.message || "Employee lookup failed. Please try again."
      );
      onChange({
        empRefCode: "", empRefName: "", empRefDesignation: "", empRefCircle: "",
        empRefCmp: "", bankAccount: "", ifsc: "",
      });
    } finally {
      setBusy(false);
    }
  };

  // Re-load the master details once when editing a claim that already has an
  // employee fetched, so the info panel shows on open.
  useEffect(() => {
    if (value.empRefCode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchEmployee(value.empRefCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolved = info && info.employeeCode === value.empRefCode;

  return (
    <div className="space-y-3">
      <div>
        <span className={LABEL}>
          Employee ID / HRMS ID <span className="text-rose-500">*</span>
        </span>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className={`${FIELD} sm:max-w-xs ${
              error
                ? "border-rose-400 bg-rose-50 dark:bg-rose-500/10"
                : value.empRefCode
                ? "border-emerald-400"
                : ""
            }`}
            placeholder="Enter Employee ID / HRMS ID"
            value={empInput}
            aria-invalid={Boolean(error)}
            onChange={(e) => setEmpInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                fetchEmployee();
              }
            }}
          />
          <button
            type="button"
            onClick={() => fetchEmployee()}
            disabled={busy || !empInput.trim()}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border-color bg-surface px-5 text-sm font-semibold text-text-secondary transition hover:bg-surface-muted disabled:opacity-50"
          >
            {busy ? <Loader2 className="animate-spin" size={14} /> : <Search size={14} />}
            Fetch
          </button>
        </div>
      </div>
      {error ? (
        <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>
      ) : resolved ? (
        <EmployeeInfoPanel info={info} />
      ) : (
        <div className="flex items-start gap-2.5 rounded-lg border border-dashed border-border-color bg-surface-muted/40 p-3 text-xs text-text-muted">
          <UserRound size={15} className="mt-0.5 shrink-0" />
          <span>
            Enter the Employee ID / HRMS ID and click <strong>Fetch</strong> to load details from
            the employee master. These details apply to every expense item in this claim.
          </span>
        </div>
      )}
    </div>
  );
}
