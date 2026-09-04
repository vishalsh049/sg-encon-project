import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";

import EntitySelect from "./EntitySelect";
import AddVendorModal from "./AddVendorModal";
import { fetchPOs, fetchVendors } from "../../lib/expenseClaimsApi";
import { formatCurrency } from "../../utils/penaltyFormat";

const FIELD =
  "h-11 w-full rounded-lg border border-border-color bg-surface px-3 text-sm text-text-primary outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 disabled:bg-surface-muted disabled:text-text-muted";
const AREA =
  "w-full rounded-lg border border-border-color bg-surface px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15";
const LABEL = "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted";
const DESC_SOFT_LIMIT = 500;

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
              aria-pressed={active}
              onClick={() => onChange(o.value)}
              className={`flex items-start gap-2 rounded-lg border p-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${
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

// Read-only summary of a fetched master record (vendor).
function ReadOnlyInfo({ title, rows }) {
  const visible = rows.filter(([, v]) => v !== null && v !== undefined && String(v) !== "");
  if (!visible.length) return null;
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300">
        ✓ {title}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
        {visible.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{k}</dt>
            <dd className="truncate text-[13px] text-text-primary" title={String(v)}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
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
              className="inline-flex h-11 shrink-0 items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300"
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
  party = { expenseFor: "employee" },
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
  onDropFiles,
  onOpenBill,
  onRemoveBill,
}) {
  const [addVendorOpen, setAddVendorOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const patch = (p) => onChange(p);

  // Bridge so the Add-Vendor modal can push its new record into <VendorParty>.
  const vendorCreatedSetterRef = useRef(null);
  const registerCreated = useCallback((fn) => {
    vendorCreatedSetterRef.current = fn;
  }, []);

  const billingOpts = (meta?.billingTypes || []).map((t) => ({ ...t }));
  const workCats = meta?.workCategories || ["O&M", "OOS", "Project"];
  const domains = meta?.domains || ["Fiber", "FTTx", "Utility", "Others"];

  const summary = useMemo(() => {
    const bits = [];
    if (party.expenseFor === "vendor") bits.push(item.vendorName ? item.vendorName : "Vendor");
    else bits.push(party.empRefName ? party.empRefName : "Employee");
    if (item.workCategory) bits.push(item.workCategory);
    if (item.claimedAmount) bits.push(formatCurrency(Number(item.claimedAmount) || 0));
    if (item.expenseDate) {
      const d = new Date(item.expenseDate);
      if (!Number.isNaN(d.getTime())) {
        bits.push(
          d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
        );
      }
    }
    return bits.join("  ·  ");
  }, [item, party]);

  const isOM = item.workCategory === "O&M";
  const isProject = item.workCategory === "Project";
  const needsPO = ["O&M", "OOS", "Project"].includes(item.workCategory);
  const billRequired = item.claimType === "reimbursement";
  const descLen = (item.description || "").length;

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (files && files.length && onDropFiles) onDropFiles(files);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border-color bg-surface">
      {/* card header */}
      <div
        className={`flex items-center justify-between gap-2 px-4 py-3 ${
          collapsed ? "" : "border-b border-border-color/70 bg-surface-muted/30"
        }`}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="flex min-w-0 items-center gap-2.5 text-left"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-xs font-bold text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-text-primary">
              Expense Item {index + 1}
            </span>
            {collapsed && summary ? (
              <span className="block truncate text-xs text-text-muted">{summary}</span>
            ) : (
              <span className="block text-xs text-text-muted">Enter the expense item details below</span>
            )}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {removable ? (
            <button
              type="button"
              onClick={onRemove}
              title="Remove item"
              aria-label={`Remove expense item ${index + 1}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-color text-text-muted transition hover:border-rose-300 hover:text-rose-600"
            >
              <Trash2 size={14} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expand item" : "Collapse item"}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-muted"
          >
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
      </div>

      {collapsed ? null : (
        <div className="space-y-5 p-4">
          {errors.length ? (
            <div
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
            >
              <div className="mb-1 flex items-center gap-1.5 font-semibold">
                <AlertTriangle size={13} /> Please resolve the following
              </div>
              <ul className="list-disc space-y-0.5 pl-5">
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Party — employee identity is claim-level (entered once); only a
              Vendor expense still picks its party per item. */}
          {party.expenseFor === "vendor" ? (
            <VendorParty
              key="vendor-party"
              item={item}
              patch={patch}
              vendorTypes={meta?.vendorTypes || []}
              onAddVendor={() => setAddVendorOpen(true)}
              registerCreated={registerCreated}
            />
          ) : null}

          {/* Expense date */}
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

          {/* Billing type */}
          <div className="space-y-3">
            <ChoiceCards
              label="Billing Type"
              required
              value={item.billingType}
              onChange={(v) =>
                patch(v === "billable" ? { billingType: v } : { billingType: v, clientName: "" })
              }
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

          {/* Expense category + conditional PO / domain */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Expense Category" required>
              <select
                className={FIELD}
                value={item.workCategory}
                onChange={(e) => {
                  const v = e.target.value;
                  patch({
                    workCategory: v,
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

            {needsPO ? (
              <Field label="PO No." required>
                <EntitySelect
                  value={item.poNumber ? { id: item.poNumber, poNumber: item.poNumber } : null}
                  onChange={(o) => {
                    if (!o) return patch({ poNumber: "" });
                    const next = { poNumber: o.poNumber };
                    if (o.domain && !item.domain && isOM) next.domain = o.domain;
                    if (o.clientName && !item.clientName) next.clientName = o.clientName;
                    if (o.siteRoute && !item.siteRoute) next.siteRoute = o.siteRoute;
                    if (isProject && o.estimateWccAmount != null)
                      next.estimateWccAmount = o.estimateWccAmount;
                    patch(next);
                  }}
                  fetcher={async (q) => (await fetchPOs({ category: item.workCategory, search: q })).data}
                  getLabel={(o) => o.poNumber}
                  getSub={(o) => [o.workCategory, o.clientName].filter(Boolean).join(" · ")}
                  placeholder="Search / Select PO"
                />
              </Field>
            ) : null}

            {needsPO && isOM ? (
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

            {needsPO && isOM && item.domain === "Others" ? (
              <Field label="Other Domain Name" required>
                <input
                  className={FIELD}
                  value={item.otherDomain}
                  onChange={(e) => patch({ otherDomain: e.target.value })}
                  placeholder="Enter Domain Name"
                />
              </Field>
            ) : null}

            {needsPO && isProject ? (
              <Field label="Estimate WCC Amount" hint="Auto-filled from the PO / Project master">
                <input
                  className={`${FIELD} opacity-80`}
                  readOnly
                  value={
                    item.estimateWccAmount != null && item.estimateWccAmount !== ""
                      ? item.estimateWccAmount
                      : ""
                  }
                  placeholder="From PO"
                />
              </Field>
            ) : null}
          </div>

          {/* Site / route + description */}
          <div className="grid gap-3">
            <Field label="Site / Route Details" required>
              <input
                className={FIELD}
                value={item.siteRoute}
                onChange={(e) => patch({ siteRoute: e.target.value })}
                placeholder="e.g. Node BLR-04 → BLR-11, Sector 21"
              />
            </Field>
            <Field label="Expense Description" required>
              <textarea
                rows={3}
                className={AREA}
                value={item.description}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="What was the expense for? Provide brief details…"
              />
              <span
                className={`mt-1 block text-right text-[11px] ${
                  descLen > DESC_SOFT_LIMIT ? "text-amber-600 dark:text-amber-400" : "text-text-muted"
                }`}
              >
                {descLen}/{DESC_SOFT_LIMIT}
              </span>
            </Field>
          </div>

          {/* Amounts */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Claimed Amount (₹)" required>
              <div className="flex items-stretch overflow-hidden rounded-lg border border-border-color bg-surface transition focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/15">
                <span className="flex items-center border-r border-border-color bg-surface-muted/50 px-3 text-sm font-semibold text-text-muted">
                  ₹
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  className="h-11 w-full bg-transparent px-3 text-sm text-text-primary outline-none"
                  value={item.claimedAmount}
                  onChange={(e) => patch({ claimedAmount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </Field>
            <Field label="Bill Number">
              <input
                className={FIELD}
                value={item.billNumber}
                onChange={(e) => patch({ billNumber: e.target.value })}
                placeholder="Invoice / bill no."
              />
            </Field>
          </div>

          {/* Supporting documents — drag & drop, per item */}
          <div>
            <span className={LABEL}>
              Supporting Documents {billRequired ? <span className="text-rose-500">*</span> : null}
            </span>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
                dragOver
                  ? "border-indigo-400 bg-indigo-50/60 dark:bg-indigo-500/10"
                  : billRequired && !attachments.length
                  ? "border-amber-300 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/10"
                  : "border-border-color bg-surface-muted/30"
              }`}
            >
              <UploadCloud
                size={22}
                className={dragOver ? "text-indigo-500" : "text-text-muted"}
              />
              <div className="text-sm font-medium text-text-secondary">
                Drag &amp; drop files here or{" "}
                <button
                  type="button"
                  onClick={onPickFile}
                  disabled={uploading}
                  className="font-semibold text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-300"
                >
                  click to upload
                </button>
              </div>
              <div className="text-[11px] text-text-muted">
                PDF, JPG, PNG · max 10&nbsp;MB each · multiple files allowed
              </div>
              {uploading ? (
                <div className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-300">
                  <Loader2 className="animate-spin" size={12} /> Uploading…
                </div>
              ) : null}
            </div>

            {attachments.length ? (
              <ul className="mt-2 space-y-1.5">
                {attachments.map((att) => (
                  <li
                    key={att.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border-color bg-surface px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenBill(att.id)}
                      className="flex min-w-0 items-center gap-2 text-left"
                      title={att.fileName}
                    >
                      <FileText size={15} className="shrink-0 text-indigo-500" />
                      <span className="truncate text-[13px] text-indigo-600 hover:underline dark:text-indigo-300">
                        {att.fileName}
                      </span>
                      {att.fileSize ? (
                        <span className="shrink-0 text-[11px] text-text-muted">
                          {Math.max(1, Math.round(att.fileSize / 1024))} KB
                        </span>
                      ) : null}
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
                        title="Uploaded"
                      >
                        ✓
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemoveBill(att.id)}
                        aria-label={`Remove ${att.fileName}`}
                        className="text-text-muted transition hover:text-rose-600"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
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
