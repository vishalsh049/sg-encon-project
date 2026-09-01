import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, Loader2, Plus, Save, Send, Trash2 } from "lucide-react";

import { CARD_SHELL } from "../../components/billingDashboard/theme";
import ConfirmDialog from "../../components/ConfirmDialog";
import ClaimProgressTracker from "../../components/expenses/ClaimProgressTracker";
import ExpenseItemCard from "../../components/expenses/ExpenseItemCard";
import { formatCurrency } from "../../utils/penaltyFormat";
import {
  createClaim,
  deleteBill,
  deleteClaim,
  fetchClaim,
  fetchExpenseMeta,
  lookupEmployee as lookupEmployeeApi,
  openBill,
  submitClaim,
  updateClaim,
  uploadBill,
} from "../../lib/expenseClaimsApi";

const INPUT =
  "h-10 w-full rounded-xl border border-border-color bg-surface px-3 text-sm text-text-primary outline-none transition focus:border-indigo-400 disabled:bg-surface-muted disabled:text-text-muted";

const ALLOWED_EXT = ["pdf", "jpg", "jpeg", "png"];
const emptyRowKey = () => `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function blankRow() {
  return {
    localKey: emptyRowKey(),
    id: null,
    expenseDate: "",
    expenseFor: "employee",
    employeeType: "",
    empRefCode: "",
    empRefName: "",
    vendorId: null,
    vendorName: "",
    vendorType: "",
    claimType: "",
    billingType: "",
    clientName: "",
    workCategory: "",
    poNumber: "",
    domain: "",
    otherDomain: "",
    siteRoute: "",
    description: "",
    claimedAmount: "",
    billNumber: "",
    bankAccount: "",
    ifsc: "",
    estimateWccAmount: null,
    attachments: [],
  };
}

function rowsFromBundle(bundle) {
  const byItem = new Map();
  (bundle.attachments || []).forEach((att) => {
    if (!byItem.has(att.itemId)) byItem.set(att.itemId, []);
    byItem.get(att.itemId).push(att);
  });
  return (bundle.items || []).map((item) => ({
    localKey: emptyRowKey(),
    id: item.id,
    expenseDate: item.expenseDate ? String(item.expenseDate).slice(0, 10) : "",
    expenseFor: item.expenseFor || "employee",
    employeeType: item.employeeType || "",
    empRefCode: item.empRefCode || "",
    empRefName: item.empRefName || "",
    vendorId: item.vendorId || null,
    vendorName: item.vendorName || "",
    vendorType: item.vendorType || "",
    claimType: item.claimType || "",
    billingType: item.billingType || "",
    clientName: item.clientName || "",
    workCategory: item.workCategory || "",
    poNumber: item.poNumber || "",
    domain: item.domain || "",
    otherDomain: item.otherDomain || "",
    siteRoute: item.siteRoute || "",
    description: item.description || "",
    claimedAmount: item.claimedAmount != null ? String(item.claimedAmount) : "",
    billNumber: item.billNumber || "",
    bankAccount: item.bankAccount || "",
    ifsc: item.ifsc || "",
    estimateWccAmount: item.estimateWccAmount != null ? item.estimateWccAmount : null,
    attachments: byItem.get(item.id) || [],
  }));
}

export default function RaiseExpense() {
  const navigate = useNavigate();
  const { id: routeId } = useParams();

  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState(null);
  const [claimId, setClaimId] = useState(routeId ? Number(routeId) : null);
  const [status, setStatus] = useState("draft");
  const [claimNumber, setClaimNumber] = useState(null);

  const [form, setForm] = useState({ employeeCode: "" });
  const [rows, setRows] = useState([blankRow()]);
  const [collapsed, setCollapsed] = useState({}); // { [localKey]: true }
  const [itemErrorMap, setItemErrorMap] = useState({}); // { [localKey]: string[] }

  // Employee identity resolved from the Physical employee master by HRMS ID.
  const [emp, setEmp] = useState(null); // { employeeName, department, designation, circle, mobile, email, ... }
  const [empLookup, setEmpLookup] = useState({ status: "idle", message: "" }); // idle | loading | found | notfound | error

  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rowErrors, setRowErrors] = useState([]);
  const [uploadingKey, setUploadingKey] = useState(null);
  const fileInputs = useRef({});

  const runEmployeeLookup = useCallback(async (code) => {
    const trimmed = String(code || "").trim();
    if (!trimmed) {
      setEmp(null);
      setEmpLookup({ status: "idle", message: "" });
      return null;
    }
    setEmpLookup({ status: "loading", message: "" });
    try {
      const res = await lookupEmployeeApi(trimmed);
      setEmp(res.data);
      setEmpLookup({ status: "found", message: res.data.employeeName || "Employee found" });
      return res.data;
    } catch (error) {
      setEmp(null);
      setEmpLookup({
        status: error.status === 404 ? "notfound" : "error",
        message: error.message || "Lookup failed",
      });
      return null;
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const metaRes = await fetchExpenseMeta();
      setMeta(metaRes.data);

      if (routeId) {
        const res = await fetchClaim(routeId);
        const b = res.data;
        if (!["draft", "returned"].includes(b.claim.status)) {
          toast.error("This claim can no longer be edited.");
          navigate(`/dashboard/expense-claims/my/${routeId}`, { replace: true });
          return;
        }
        setClaimId(b.claim.id);
        setStatus(b.claim.status);
        setClaimNumber(b.claim.claimNumber);
        setForm({ employeeCode: b.claim.employeeCode || "" });
        const mapped = rowsFromBundle(b);
        setRows(mapped.length ? mapped : [blankRow()]);
        if (b.claim.employeeCode) {
          runEmployeeLookup(b.claim.employeeCode);
        } else if (b.claim.employeeName) {
          // Older claim saved before HRMS lookup existed — show the stored snapshot.
          setEmp({
            employeeCode: "",
            employeeName: b.claim.employeeName,
            department: b.claim.department || "",
            designation: b.claim.designation || "",
            circle: b.claim.circle || "",
          });
          setEmpLookup({ status: "found", message: b.claim.employeeName });
        }
      } else {
        // New claim — prefill with the signed-in user's own HRMS id if we have one.
        const myCode = metaRes.data?.myProfile?.employeeCode || "";
        if (myCode) {
          setForm((f) => ({ ...f, employeeCode: myCode }));
          runEmployeeLookup(myCode);
        }
      }
    } catch (error) {
      toast.error(error.message || "Failed to load the Raise Expense form.");
    } finally {
      setLoading(false);
    }
  }, [routeId, navigate, runEmployeeLookup]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const totalClaimed = useMemo(
    () => rows.reduce((sum, r) => sum + (Number(r.claimedAmount) || 0), 0),
    [rows]
  );

  const setRow = (localKey, patch) =>
    setRows((prev) => prev.map((r) => (r.localKey === localKey ? { ...r, ...patch } : r)));

  const addRow = () => {
    setRows((prev) => [...prev, blankRow()]);
    setCollapsed({});
  };

  const removeRow = (localKey) =>
    setRows((prev) => (prev.length === 1 ? [blankRow()] : prev.filter((r) => r.localKey !== localKey)));

  function itemPayload(r) {
    return {
      id: r.id || undefined,
      expenseDate: r.expenseDate || null,
      expenseFor: r.expenseFor || "employee",
      employeeType: r.employeeType || null,
      empRefCode: r.empRefCode || null,
      empRefName: r.empRefName || null,
      vendorId: r.vendorId || null,
      vendorName: r.vendorName || null,
      vendorType: r.vendorType || null,
      claimType: r.claimType || null,
      billingType: r.billingType || null,
      clientName: r.clientName || null,
      workCategory: r.workCategory || null,
      poNumber: r.poNumber || null,
      domain: r.domain || null,
      otherDomain: r.otherDomain || null,
      siteRoute: r.siteRoute || null,
      description: r.description || null,
      claimedAmount: Number(r.claimedAmount) || 0,
      billNumber: r.billNumber || null,
      bankAccount: r.bankAccount?.trim() || null,
      ifsc: r.ifsc?.trim().toUpperCase() || null,
      estimateWccAmount:
        r.estimateWccAmount === "" || r.estimateWccAmount == null ? null : Number(r.estimateWccAmount),
    };
  }

  function buildPayload() {
    return {
      employeeCode: form.employeeCode.trim() || null,
      items: rows.map(itemPayload),
    };
  }

  // Persists the current form + rows. Returns the fresh bundle, and reconciles
  // server-assigned item ids back onto local rows (needed before a bill upload).
  const persistDraft = useCallback(
    async ({ silent } = {}) => {
      const payload = buildPayload();
      const res = claimId ? await updateClaim(claimId, payload) : await createClaim(payload);
      const b = res.data;
      setClaimId(b.claim.id);
      setStatus(b.claim.status);
      setClaimNumber(b.claim.claimNumber);
      // Server returns items in the same sr_no order we sent them.
      setRows((prev) =>
        prev.map((r, index) => {
          const item = b.items[index];
          if (!item) return r;
          const atts = (b.attachments || []).filter((a) => a.itemId === item.id);
          return { ...r, id: item.id, attachments: atts.length ? atts : r.attachments };
        })
      );
      if (!silent) toast.success("Draft saved.");
      return b;
    },
    [claimId, form, rows] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    setRowErrors([]);
    try {
      await persistDraft({});
    } catch (error) {
      setRowErrors(error.details?.rowErrors || []);
      toast.error(error.message || "Failed to save the draft.");
    } finally {
      setSavingDraft(false);
    }
  };

  // Per-item conditional validation — mirrors the server. Only fields relevant
  // to each item's own selections are checked.
  const validateItemRow = (r) => {
    const e = [];
    if (!r.expenseDate) e.push("Expense Date is required.");
    if (!(Number(r.claimedAmount) > 0)) e.push("Claimed Amount must be greater than zero.");
    if (r.expenseFor === "employee") {
      if (!r.employeeType) e.push("Employee Type is required.");
      if (!r.empRefCode) e.push("Select an Employee.");
    } else {
      if (!r.vendorType) e.push("Vendor Type is required.");
      if (!r.vendorId) e.push("Select a Vendor.");
    }
    if (!r.claimType) e.push("Claim Type is required.");
    if (!r.billingType) e.push("Billing Type is required.");
    if (r.billingType === "billable" && !r.clientName?.trim()) e.push("Client / Account is required for a Billable expense.");
    if (!r.workCategory) e.push("Expense Category is required.");
    if (["O&M", "OOS", "Project"].includes(r.workCategory) && !r.poNumber) {
      e.push(`PO No. is required for ${r.workCategory}.`);
    }
    if (r.workCategory === "O&M") {
      if (!r.domain) e.push("Domain is required for O&M.");
      if (r.domain === "Others" && !r.otherDomain?.trim()) e.push('Other Domain Name is required when Domain is "Others".');
    }
    if (!r.siteRoute?.trim()) e.push("Site / Route Details is required.");
    if (!r.description?.trim()) e.push("Expense Description is required.");
    if (!r.bankAccount?.trim()) e.push("Bank Account Number is required.");
    if (!r.ifsc?.trim()) e.push("IFSC Code is required.");
    else if (!/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(r.ifsc.trim())) e.push("IFSC Code looks invalid (11 chars, e.g. HDFC0001234).");
    if (r.claimType === "reimbursement" && !r.attachments.length) {
      e.push("Attach a bill/invoice — required for a Reimbursement expense.");
    }
    return e;
  };

  const clientValidate = () => {
    const errs = [];
    const map = {};
    if (form.employeeCode.trim() && empLookup.status !== "found") {
      errs.push(`Employee ID "${form.employeeCode.trim()}" is not verified — click Fetch and make sure the details load.`);
    }
    if (!form.employeeCode.trim() && !emp?.employeeName) {
      errs.push("Enter the Claimant's Employee ID / HRMS ID and fetch the details.");
    }
    if (!rows.length) errs.push("Add at least one expense item.");
    rows.forEach((r, i) => {
      const rowErrs = validateItemRow(r);
      if (rowErrs.length) {
        map[r.localKey] = rowErrs;
        errs.push(`Item ${i + 1}: ${rowErrs.length} field(s) need attention.`);
      }
    });
    setItemErrorMap(map);
    // expand any card with errors
    setCollapsed((prev) => {
      const next = { ...prev };
      Object.keys(map).forEach((k) => { next[k] = false; });
      return next;
    });
    return errs;
  };

  const handleSubmit = async () => {
    const clientErrs = clientValidate();
    if (clientErrs.length) {
      setRowErrors(clientErrs);
      toast.error("Please fix the highlighted items before submitting.");
      return;
    }
    setSubmitting(true);
    setRowErrors([]);
    try {
      const b = await persistDraft({ silent: true });
      const res = await submitClaim(b.claim.id);
      toast.success(`Claim ${res.data.claim.claimNumber} submitted for L1 approval.`);
      navigate(`/dashboard/expense-claims/my/${b.claim.id}`, { replace: true });
    } catch (error) {
      setRowErrors(error.details?.rowErrors || []);
      toast.error(error.message || "Failed to submit the claim.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!claimId) {
      navigate("/dashboard/expense-claims/my");
      return;
    }
    setDeleting(true);
    try {
      await deleteClaim(claimId);
      toast.success("Draft deleted.");
      navigate("/dashboard/expense-claims/my", { replace: true });
    } catch (error) {
      toast.error(error.message || "Failed to delete the draft.");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const pickFile = (localKey) => fileInputs.current[localKey]?.click();

  const handleFileChosen = async (row, file) => {
    if (!file) return;
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      toast.error("Only PDF, JPG, JPEG or PNG files are allowed.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File exceeds the 10 MB limit.");
      return;
    }
    setUploadingKey(row.localKey);
    try {
      let itemId = row.id;
      let effectiveClaimId = claimId;
      if (!effectiveClaimId || !itemId) {
        const b = await persistDraft({ silent: true });
        effectiveClaimId = b.claim.id;
        const index = rows.findIndex((r) => r.localKey === row.localKey);
        itemId = b.items[index]?.id;
      }
      if (!effectiveClaimId || !itemId) {
        throw new Error("Save the row before attaching a bill.");
      }
      const res = await uploadBill(effectiveClaimId, itemId, file);
      setRows((prev) =>
        prev.map((r) =>
          r.localKey === row.localKey ? { ...r, attachments: [...r.attachments, res.data] } : r
        )
      );
      toast.success("Bill attached.");
    } catch (error) {
      toast.error(error.message || "Failed to upload the bill.");
    } finally {
      setUploadingKey(null);
    }
  };

  const handleRemoveBill = async (row, attachmentId) => {
    try {
      await deleteBill(attachmentId);
      setRows((prev) =>
        prev.map((r) =>
          r.localKey === row.localKey
            ? { ...r, attachments: r.attachments.filter((a) => a.id !== attachmentId) }
            : r
        )
      );
      toast.success("Bill removed.");
    } catch (error) {
      toast.error(error.message || "Failed to remove the bill.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-text-muted">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }

  const busy = savingDraft || submitting || deleting;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => navigate("/dashboard/expense-claims/my")}
            className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft size={14} /> My Expenses
          </button>
          <h1 className="text-lg font-semibold tracking-tight text-text-primary sm:text-xl">
            {claimNumber ? `Edit Claim ${claimNumber}` : "Raise Expense"}
          </h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            Build each expense step by step. One claim can hold many items — the total is calculated for you.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {claimId ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border-color bg-surface px-4 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:hover:bg-rose-500/10"
            >
              <Trash2 size={15} /> Delete Draft
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border-color bg-surface px-4 text-sm font-medium text-text-secondary transition hover:bg-surface-muted disabled:opacity-50"
          >
            {savingDraft ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
            Save as Draft
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="animate-spin" size={15} /> : <Send size={15} />}
            Submit Claim
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className={`${CARD_SHELL} p-4`}>
        <ClaimProgressTracker status={status} />
      </div>

      {/* Validation summary */}
      {rowErrors.length ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          <div className="mb-1 font-semibold">Please resolve the following:</div>
          <ul className="list-disc space-y-0.5 pl-5">
            {rowErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Claim Information */}
      <div className={`${CARD_SHELL} p-4`}>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Claimant Details</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Claimant Employee ID / HRMS ID" className="sm:col-span-2 lg:col-span-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                className={`${INPUT} sm:max-w-xs ${
                  empLookup.status === "notfound" || empLookup.status === "error"
                    ? "border-rose-400 bg-rose-50 dark:bg-rose-500/10"
                    : empLookup.status === "found"
                    ? "border-emerald-400"
                    : ""
                }`}
                placeholder="e.g. SG15392"
                value={form.employeeCode}
                onChange={(e) => setForm((f) => ({ ...f, employeeCode: e.target.value }))}
                onBlur={(e) => runEmployeeLookup(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    runEmployeeLookup(e.currentTarget.value);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => runEmployeeLookup(form.employeeCode)}
                disabled={empLookup.status === "loading" || !form.employeeCode.trim()}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border-color bg-surface px-4 text-sm font-medium text-text-secondary transition hover:bg-surface-muted disabled:opacity-50"
              >
                {empLookup.status === "loading" ? <Loader2 className="animate-spin" size={14} /> : null}
                Fetch
              </button>
              {empLookup.status === "found" ? (
                <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  ✓ {empLookup.message}
                </span>
              ) : empLookup.status === "notfound" || empLookup.status === "error" ? (
                <span className="text-sm font-medium text-rose-600 dark:text-rose-400">{empLookup.message}</span>
              ) : (
                <span className="text-xs text-text-muted">
                  The person raising this claim. Details fill in from the employee master.
                </span>
              )}
            </div>
          </Field>
          <Field label="Employee Name">
            <input className={INPUT} value={emp?.employeeName || ""} disabled placeholder="—" />
          </Field>
          <Field label="Department">
            <input className={INPUT} value={emp?.department || "—"} disabled />
          </Field>
          <Field label="Designation">
            <input className={INPUT} value={emp?.designation || "—"} disabled />
          </Field>
          <Field label="Circle">
            <input className={INPUT} value={emp?.circle || "—"} disabled />
          </Field>
          <Field label="CMP">
            <input className={INPUT} value={emp?.cmp || "—"} disabled />
          </Field>
          {emp?.mobile || emp?.email || emp?.reportingManager ? (
            <Field label="Contact / Reporting" className="sm:col-span-2 lg:col-span-1">
              <input
                className={INPUT}
                disabled
                value={[emp?.mobile, emp?.email, emp?.reportingManager ? `RM: ${emp.reportingManager}` : ""]
                  .filter(Boolean)
                  .join("  ·  ")}
              />
            </Field>
          ) : null}
        </div>
      </div>

      {/* Expense Items — one editable card per item, progressive disclosure */}
      <div className={`${CARD_SHELL} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-color/70 px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">
            Expense Items ({rows.length})
          </h2>
          <button
            type="button"
            onClick={addRow}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300"
          >
            <Plus size={15} /> Add Expense
          </button>
        </div>

        <div className="space-y-3 p-3 sm:p-4">
          {rows.map((row, index) => (
            <div key={row.localKey}>
              <ExpenseItemCard
                item={row}
                index={index}
                meta={meta}
                errors={itemErrorMap[row.localKey] || []}
                collapsed={Boolean(collapsed[row.localKey])}
                onToggle={() =>
                  setCollapsed((p) => ({ ...p, [row.localKey]: !p[row.localKey] }))
                }
                onChange={(p) => setRow(row.localKey, p)}
                onRemove={() => removeRow(row.localKey)}
                removable={rows.length > 1}
                attachments={row.attachments}
                uploading={uploadingKey === row.localKey}
                onPickFile={() => pickFile(row.localKey)}
                onOpenBill={(attId) => openBill(attId).catch((err) => toast.error(err.message))}
                onRemoveBill={(attId) => handleRemoveBill(row, attId)}
              />
              <input
                ref={(el) => (fileInputs.current[row.localKey] = el)}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                className="hidden"
                onChange={(e) => {
                  handleFileChosen(row, e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-color/70 bg-surface-muted/50 px-4 py-3">
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-300"
          >
            <Plus size={15} /> Add Expense
          </button>
          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              Total Expense Claimed
            </div>
            <div className="text-xl font-bold text-text-primary">{formatCurrency(totalClaimed)}</div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this draft?"
        description="The draft claim and its items will be permanently removed. This cannot be undone."
        confirmLabel="Delete Draft"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function Field({ label, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
