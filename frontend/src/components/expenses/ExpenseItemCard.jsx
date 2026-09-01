import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";

import EntitySelect from "./EntitySelect";
import AddVendorModal from "./AddVendorModal";
import { fetchPOs, fetchVendors, lookupEmployee } from "../../lib/expenseClaimsApi";
import { formatCurrency } from "../../utils/penaltyFormat";

const FIELD =
  "h-10 w-full rounded-xl border border-border-color bg-surface px-3 text-sm text-text-primary outline-none transition focus:border-indigo-400 disabled:bg-surface-muted disabled:text-text-muted";
const AREA =
  "w-full rounded-xl border border-border-color bg-surface px-3 py-2 text-sm text-text-primary outline-none transition focus:border-indigo-400";
const LABEL = "mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted";

function Field({ label, required, hint, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className={LABEL}>
        {label} {required ? <span className="text-rose-500">*</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-text-muted">{hint}</span> : null}
    </label>
  );
}

// Radio-card group — clean, touch-friendly, works on mobile.
function ChoiceCards({ label, required, options, value, onChange, cols = 2 }) {
  return (
    <div>
      <span className={LABEL}>
        {label} {required ? <span className="text-rose-500">*</span> : null}
      </span>
      <div className={`grid gap-2 ${cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`flex items-start gap-2 rounded-xl border p-3 text-left transition ${
                active
                  ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10"
                  : "border-border-color bg-surface hover:bg-surface-muted"
              }`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                  active ? "border-indigo-500" : "border-border-color"
                }`}
              >
                {active ? <span className="h-2 w-2 rounded-full bg-indigo-500" /> : null}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                  {o.icon ? <o.icon size={14} /> : null}
                  {o.label}
                </span>
                {o.hint ? (
                  <span className="mt-0.5 block text-xs text-text-muted">{o.hint}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Read-only summary of a fetched master record (employee / vendor).
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

// --- Employee Expense: ID + Fetch, read-only master details -----------------
// Rendered with a stable key so switching party type remounts it clean.
function EmployeeParty({ item, patch }) {
  const [empInput, setEmpInput] = useState(item.empRefCode || "");
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
      patch({ empRefCode: e.employeeCode || code, empRefName: e.employeeName || "" });
    } catch (err) {
      setInfo(null);
      setError(
        err?.status === 404
          ? "Employee not found. Please check the Employee ID / HRMS ID."
          : err?.message || "Employee lookup failed. Please try again."
      );
      patch({ empRefCode: "", empRefName: "" });
    } finally {
      setBusy(false);
    }
  };

  // Load master details once for an already-saved item.
  useEffect(() => {
    if (item.empRefCode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchEmployee(item.empRefCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <Field label="Employee ID / HRMS ID" required>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className={`${FIELD} sm:max-w-xs ${
              error
                ? "border-rose-400 bg-rose-50 dark:bg-rose-500/10"
                : item.empRefCode
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
      </Field>
      {error ? (
        <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>
      ) : info && info.employeeCode === item.empRefCode ? (
        <ReadOnlyInfo
          title="Employee Found"
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
        </p>
      )}
    </div>
  );
}

// --- Vendor Expense: search / select from the vendor master -----------------
function VendorParty({ item, patch, onAddVendor, registerCreated }) {
  const [info, setInfo] = useState(null);

  // Let the parent hand us the vendor it just created via the Add modal.
  useEffect(() => {
    registerCreated(setInfo);
  }, [registerCreated]);

  const shown =
    info ||
    (item.vendorId ? { id: item.vendorId, name: item.vendorName, vendorType: item.vendorType } : null);

  return (
    <div className="space-y-3">
      <Field label="Vendor" required>
        <EntitySelect
          value={item.vendorId ? { id: item.vendorId, name: item.vendorName } : null}
          onChange={(o) => {
            setInfo(o || null);
            patch({
              vendorId: o?.id || null,
              vendorName: o?.name || "",
              vendorType: o?.vendorType || "",
            });
          }}
          fetcher={async (q) => (await fetchVendors({ search: q })).data}
          getLabel={(o) => o.name}
          getSub={(o) => [o.vendorType, o.gstin].filter(Boolean).join(" · ")}
          placeholder="Search / Select Vendor"
          trailing={
            <button
              type="button"
              onClick={onAddVendor}
              className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300"
            >
              + Add
            </button>
          }
        />
      </Field>
      {shown ? (
        <ReadOnlyInfo
          title="Vendor Selected"
          rows={[
            ["Vendor Name", shown.name],
            ["Vendor Code", shown.id],
            ["Vendor Type", shown.vendorType],
            ["GSTIN", shown.gstin],
          ]}
        />
      ) : null}
    </div>
  );
}

export default function ExpenseItemCard({
  item,
  index,
  meta,
  errors = [],
  collapsed,
  onToggle,
  onChange,
  onRemove,
  removable,
  attachments = [],
  uploading,
  onPickFile,
  onOpenBill,
  onRemoveBill,
}) {
  const [addVendorOpen, setAddVendorOpen] = useState(false);
  const patch = (p) => onChange(p);

  // Bridge so the Add-Vendor modal can push its new record into <VendorParty>.
  const vendorCreatedSetterRef = useRef(null);
  const registerCreated = useCallback((fn) => {
    vendorCreatedSetterRef.current = fn;
  }, []);

  const claimTypeOpts = (meta?.claimTypes || []).map((t) => ({ ...t }));
  const billingOpts = (meta?.billingTypes || []).map((t) => ({ ...t }));
  const workCats = meta?.workCategories || ["O&M", "OOS", "Project"];
  const domains = meta?.domains || ["Fiber", "FTTx", "Utility", "Others"];

  const summary = useMemo(() => {
    const bits = [];
    if (item.expenseFor === "vendor") bits.push(item.vendorName ? `Vendor: ${item.vendorName}` : "Vendor");
    else bits.push(item.empRefName ? item.empRefName : "Employee");
    if (item.claimType) bits.push(item.claimType === "advance" ? "Advance" : "Reimbursement");
    if (item.workCategory) bits.push(item.workCategory);
    if (item.claimedAmount) bits.push(formatCurrency(Number(item.claimedAmount) || 0));
    return bits.join("  ·  ");
  }, [item]);

  const isOM = item.workCategory === "O&M";
  const isProject = item.workCategory === "Project";
  const needsPO = ["O&M", "OOS", "Project"].includes(item.workCategory);

  return (
    <div className="rounded-2xl border border-border-color/70 bg-surface/60">
      {/* card header */}
      <div className="flex items-center justify-between gap-2 border-b border-border-color/70 px-4 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-xs font-bold text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
            {index + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-text-primary">Expense Item {index + 1}</span>
            {collapsed && summary ? (
              <span className="block truncate text-xs text-text-muted">{summary}</span>
            ) : null}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {removable ? (
            <button
              type="button"
              onClick={onRemove}
              title="Remove item"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-color text-text-muted transition hover:border-rose-300 hover:text-rose-600"
            >
              <Trash2 size={14} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-muted"
          >
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
      </div>

      {collapsed ? null : (
        <div className="space-y-4 p-4">
          {errors.length ? (
            <ul className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
              {errors.map((e, i) => (
                <li key={i}>• {e}</li>
              ))}
            </ul>
          ) : null}

          {/* Step 1 — expense for */}
          <ChoiceCards
            label="Expense For"
            required
            value={item.expenseFor}
            onChange={(v) =>
              patch(
                v === "employee"
                  ? { expenseFor: v, vendorId: null, vendorName: "", vendorType: "" }
                  : { expenseFor: v, employeeType: "", empRefCode: "", empRefName: "" }
              )
            }
            options={[
              { value: "employee", label: "Employee Expense", icon: UserRound },
              { value: "vendor", label: "Vendor Expense", icon: Building2 },
            ]}
          />

          {/* Step 2 — party details (dynamic, remounts on switch) */}
          {item.expenseFor === "employee" ? (
            <EmployeeParty key="employee-party" item={item} patch={patch} />
          ) : (
            <VendorParty
              key="vendor-party"
              item={item}
              patch={patch}
              vendorTypes={meta?.vendorTypes || []}
              onAddVendor={() => setAddVendorOpen(true)}
              registerCreated={registerCreated}
            />
          )}

          {/* Step 3 — date */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Expense Date" required>
              <input
                type="date"
                className={FIELD}
                value={item.expenseDate}
                onChange={(e) => patch({ expenseDate: e.target.value })}
              />
            </Field>
          </div>

          {/* Step 4 — claim type */}
          <ChoiceCards
            label="Claim Type"
            required
            value={item.claimType}
            onChange={(v) => patch({ claimType: v })}
            options={claimTypeOpts.map((t) => ({ value: t.value, label: t.label, hint: t.hint }))}
          />

          {/* Step 5 — billing type */}
          <div className="space-y-3">
            <ChoiceCards
              label="Billing Type"
              required
              value={item.billingType}
              onChange={(v) => patch(v === "billable" ? { billingType: v } : { billingType: v, clientName: "" })}
              options={billingOpts.map((t) => ({ value: t.value, label: t.label }))}
            />
            {item.billingType === "billable" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Client / Account" required>
                  <input
                    className={FIELD}
                    value={item.clientName}
                    onChange={(e) => patch({ clientName: e.target.value })}
                    placeholder="Client / account this is billed to"
                  />
                </Field>
              </div>
            ) : null}
          </div>

          {/* Step 6 — expense category */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Expense Category" required>
              <select
                className={FIELD}
                value={item.workCategory}
                onChange={(e) => {
                  const v = e.target.value;
                  patch({
                    workCategory: v,
                    // reset category-specific fields
                    domain: v === "O&M" ? item.domain : "",
                    otherDomain: "",
                    estimateWccAmount: v === "Project" ? item.estimateWccAmount : null,
                  });
                }}
              >
                <option value="">Select Expense Category</option>
                {workCats.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {needsPO ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="PO No." required>
                <EntitySelect
                  value={item.poNumber ? { id: item.poNumber, poNumber: item.poNumber } : null}
                  onChange={(o) => {
                    if (!o) return patch({ poNumber: "" });
                    const next = { poNumber: o.poNumber };
                    if (o.domain && !item.domain && isOM) next.domain = o.domain;
                    if (o.clientName && !item.clientName) next.clientName = o.clientName;
                    if (o.siteRoute && !item.siteRoute) next.siteRoute = o.siteRoute;
                    if (isProject && o.estimateWccAmount != null) next.estimateWccAmount = o.estimateWccAmount;
                    patch(next);
                  }}
                  fetcher={async (q) => (await fetchPOs({ category: item.workCategory, search: q })).data}
                  getLabel={(o) => o.poNumber}
                  getSub={(o) => [o.workCategory, o.clientName].filter(Boolean).join(" · ")}
                  placeholder="Search / Select PO"
                />
              </Field>

              {isOM ? (
                <Field label="Domain" required>
                  <select
                    className={FIELD}
                    value={item.domain}
                    onChange={(e) => patch({ domain: e.target.value, otherDomain: "" })}
                  >
                    <option value="">Select Domain</option>
                    {domains.map((dm) => (
                      <option key={dm} value={dm}>
                        {dm}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}

              {isOM && item.domain === "Others" ? (
                <Field label="Other Domain Name" required>
                  <input
                    className={FIELD}
                    value={item.otherDomain}
                    onChange={(e) => patch({ otherDomain: e.target.value })}
                    placeholder="Enter Domain Name"
                  />
                </Field>
              ) : null}

              {isProject ? (
                <Field label="Estimate WCC Amount" hint="Auto-filled from the PO / Project master">
                  <input
                    className={`${FIELD} opacity-80`}
                    readOnly
                    value={item.estimateWccAmount != null && item.estimateWccAmount !== "" ? item.estimateWccAmount : ""}
                    placeholder="From PO"
                  />
                </Field>
              ) : null}
            </div>
          ) : null}

          {/* common tail fields */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Site / Route Details" required className="sm:col-span-2">
              <input
                className={FIELD}
                value={item.siteRoute}
                onChange={(e) => patch({ siteRoute: e.target.value })}
                placeholder="e.g. Node BLR-04 → BLR-11, Sector 21"
              />
            </Field>
            <Field label="Expense Description" required className="sm:col-span-2">
              <textarea
                rows={2}
                className={AREA}
                value={item.description}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="What was the expense for?"
              />
            </Field>
            <Field label="Claimed Amount" required>
              <input
                type="number"
                min="0"
                step="0.01"
                className={FIELD}
                value={item.claimedAmount}
                onChange={(e) => patch({ claimedAmount: e.target.value })}
                placeholder="0.00"
              />
            </Field>
            <Field label="Bill Number">
              <input
                className={FIELD}
                value={item.billNumber}
                onChange={(e) => patch({ billNumber: e.target.value })}
                placeholder="Invoice / bill no."
              />
            </Field>
            <Field
              label={`Attach Bill / Invoice${item.claimType === "reimbursement" ? " *" : ""}`}
              className="sm:col-span-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                {attachments.map((att) => (
                  <span
                    key={att.id}
                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-border-color bg-surface px-2 text-xs"
                  >
                    <FileText size={13} className="text-indigo-500" />
                    <button
                      type="button"
                      onClick={() => onOpenBill(att.id)}
                      className="max-w-[140px] truncate text-indigo-600 hover:underline dark:text-indigo-300"
                      title={att.fileName}
                    >
                      {att.fileName}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveBill(att.id)}
                      className="text-text-muted hover:text-rose-600"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={onPickFile}
                  disabled={uploading}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition disabled:opacity-50 ${
                    item.claimType === "reimbursement" && !attachments.length
                      ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                      : "border-border-color bg-surface text-text-secondary hover:bg-surface-muted"
                  }`}
                >
                  {uploading ? (
                    <Loader2 className="animate-spin" size={12} />
                  ) : attachments.length ? (
                    <Upload size={12} />
                  ) : (
                    <Paperclip size={12} />
                  )}
                  {attachments.length ? "Add another" : "Attach bill"}
                </button>
              </div>
            </Field>
          </div>
        </div>
      )}

      <AddVendorModal
        open={addVendorOpen}
        vendorTypes={meta?.vendorTypes || []}
        defaultType={item.vendorType || ""}
        onClose={() => setAddVendorOpen(false)}
        onCreated={(v) => {
          patch({
            vendorId: v.id,
            vendorName: v.name,
            vendorType: v.vendorType || item.vendorType,
          });
          if (vendorCreatedSetterRef.current) vendorCreatedSetterRef.current(v);
        }}
      />
    </div>
  );
}
