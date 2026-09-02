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
  openBill,
  submitClaim,
  updateClaim,
  uploadBill,
} from "../../lib/expenseClaimsApi";

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
    empRefDesignation: "",
    empRefCircle: "",
    empRefCmp: "",
    bankAccount: "",
    ifsc: "",
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
    empRefDesignation: item.empRefDesignation || "",
    empRefCircle: item.empRefCircle || "",
    empRefCmp: item.empRefCmp || "",
    bankAccount: item.bankAccount || "",
    ifsc: item.ifsc || "",
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

  const [rows, setRows] = useState([blankRow()]);
  const [collapsed, setCollapsed] = useState({}); // { [localKey]: true }
  const [itemErrorMap, setItemErrorMap] = useState({}); // { [localKey]: string[] }

  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rowErrors, setRowErrors] = useState([]);
  const [uploadingKey, setUploadingKey] = useState(null);
  const fileInputs = useRef({});

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
        const mapped = rowsFromBundle(b);
        setRows(mapped.length ? mapped : [blankRow()]);
      }
    } catch (error) {
      toast.error(error.message || "Failed to load the Raise Expense form.");
    } finally {
      setLoading(false);
    }
  }, [routeId, navigate]);

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
      empRefDesignation: r.empRefDesignation || null,
      empRefCircle: r.empRefCircle || null,
      empRefCmp: r.empRefCmp || null,
      bankAccount: r.bankAccount || null,
      ifsc: r.ifsc || null,
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
      estimateWccAmount:
        r.estimateWccAmount === "" || r.estimateWccAmount == null ? null : Number(r.estimateWccAmount),
    };
  }

  function buildPayload() {
    // The claim belongs to the signed-in user; each item carries its own
    // Employee / Vendor party. The server resolves the claimant from the token.
    return { items: rows.map(itemPayload) };
  }

  // Persists the current rows. Returns the fresh bundle, and reconciles
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
    [claimId, rows] // eslint-disable-line react-hooks/exhaustive-deps
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
      if (!r.empRefCode) e.push("Enter a valid Employee ID / HRMS ID and click Fetch.");
    } else {
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
    if (r.claimType === "reimbursement" && !r.attachments.length) {
      e.push("Attach a bill/invoice — required for a Reimbursement expense.");
    }
    return e;
  };

  const clientValidate = () => {
    const errs = [];
    const map = {};
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
            Build each expense step by step. One claim can hold many items — each with its own Employee or Vendor.
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
