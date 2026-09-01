import { useMemo, useState } from "react";
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
import { fetchPOs, fetchVendors, searchEmployees } from "../../lib/expenseClaimsApi";
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

          {/* Step 1 — date */}
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

          {/* Step 2 — expense for */}
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

          {item.expenseFor === "employee" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Employee Type" required>
                <select
                  className={FIELD}
                  value={item.employeeType}
                  onChange={(e) => patch({ employeeType: e.target.value })}
                >
                  <option value="">Select Employee Type</option>
                  {(meta?.employeeTypes || []).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Employee" required>
                <EntitySelect
                  value={item.empRefCode ? { id: item.empRefCode, employeeName: item.empRefName, employeeCode: item.empRefCode } : null}
                  onChange={(o) =>
                    patch({
                      empRefCode: o?.employeeCode || "",
                      empRefName: o?.employeeName || "",
                    })
                  }
                  fetcher={async (q) => (await searchEmployees(q)).data}
                  getLabel={(o) => o.employeeName || o.employeeCode}
                  getSub={(o) => [o.employeeCode, o.designation, o.circle].filter(Boolean).join(" · ")}
                  placeholder="Search / Select Employee"
                />
              </Field>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Vendor Type" required>
                <select
                  className={FIELD}
                  value={item.vendorType}
                  onChange={(e) => patch({ vendorType: e.target.value, vendorId: null, vendorName: "" })}
                >
                  <option value="">Select Vendor Type</option>
                  {(meta?.vendorTypes || []).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Vendor" required>
                <EntitySelect
                  value={item.vendorId ? { id: item.vendorId, name: item.vendorName } : null}
                  onChange={(o) =>
                    patch({
                      vendorId: o?.id || null,
                      vendorName: o?.name || "",
                    })
                  }
                  fetcher={async (q) => (await fetchVendors({ type: item.vendorType || undefined, search: q })).data}
                  getLabel={(o) => o.name}
                  getSub={(o) => [o.vendorType, o.gstin].filter(Boolean).join(" · ")}
                  placeholder="Search / Select Vendor"
                  trailing={
                    <button
                      type="button"
                      onClick={() => setAddVendorOpen(true)}
                      className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300"
                    >
                      + Add
                    </button>
                  }
                />
              </Field>
            </div>
          )}

          {/* Step 3 — claim type */}
          <ChoiceCards
            label="Claim Type"
            required
            value={item.claimType}
            onChange={(v) => patch({ claimType: v })}
            options={claimTypeOpts.map((t) => ({ value: t.value, label: t.label, hint: t.hint }))}
          />

          {/* Step 4 — billing type */}
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

          {/* Step 5 — expense category */}
          <ChoiceCards
            label="Expense Category"
            required
            cols={3}
            value={item.workCategory}
            onChange={(v) =>
              patch({
                workCategory: v,
                // reset category-specific fields
                domain: v === "O&M" ? item.domain : "",
                otherDomain: "",
                estimateWccAmount: v === "Project" ? item.estimateWccAmount : null,
              })
            }
            options={workCats.map((c) => ({ value: c, label: c }))}
          />

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
        onCreated={(v) =>
          patch({
            vendorId: v.id,
            vendorName: v.name,
            vendorType: v.vendorType || item.vendorType,
          })
        }
      />
    </div>
  );
}
