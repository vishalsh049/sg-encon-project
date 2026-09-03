import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { lookupEmployee } from "../../lib/expenseClaimsApi";

const FIELD =
  "h-10 w-full rounded-xl border border-border-color bg-surface px-3 text-sm text-text-primary outline-none transition focus:border-indigo-400 disabled:bg-surface-muted disabled:text-text-muted";
const LABEL = "mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted";

// Read-only summary of the fetched employee master record.
function ReadOnlyInfo({ title, rows }) {
  const visible = rows.filter(([, v]) => v !== null && v !== undefined && String(v) !== "");
  if (!visible.length) return null;
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
      <div className="mb-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">✓ {title}</div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{k}</dt>
            <dd className="truncate text-sm text-text-primary" title={String(v)}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
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
  // employee fetched, so the read-only card shows on open.
  useEffect(() => {
    if (value.empRefCode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchEmployee(value.empRefCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <label className="block">
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
            className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border-color bg-surface px-5 text-sm font-medium text-text-secondary transition hover:bg-surface-muted disabled:opacity-50"
          >
            {busy ? <Loader2 className="animate-spin" size={14} /> : null}
            Fetch
          </button>
        </div>
      </label>
      {error ? (
        <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>
      ) : info && info.employeeCode === value.empRefCode ? (
        <ReadOnlyInfo
          title="Employee Found — used for every expense item in this claim"
          rows={[
            ["Employee Name", info.employeeName],
            ["Employee ID / HRMS ID", info.employeeCode],
            ["Designation", info.designation],
            ["Circle", info.circle],
            ["CMP", info.cmp],
            ["Bank Account No.", info.bankAccount],
            ["IFSC Code", info.ifsc],
          ]}
        />
      ) : (
        <p className="text-xs text-text-muted">
          Enter the Employee ID / HRMS ID and click Fetch to load details from the employee master.
          These details apply to every expense item in this claim.
        </p>
      )}
    </div>
  );
}
