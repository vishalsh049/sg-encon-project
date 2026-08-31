import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  FileText,
  Loader2,
  Paperclip,
  Plus,
  Save,
  Send,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { CARD_SHELL } from "../../components/billingDashboard/theme";
import ConfirmDialog from "../../components/ConfirmDialog";
import ClaimProgressTracker from "../../components/expenses/ClaimProgressTracker";
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
  "w-full rounded-xl border border-border-color bg-surface px-3 py-2 text-sm text-text-primary outline-none transition focus:border-indigo-400 disabled:bg-surface-muted disabled:text-text-muted";
const CELL_INPUT =
  "h-9 w-full rounded-lg border border-border-color bg-surface px-2.5 text-sm text-text-primary outline-none transition focus:border-indigo-400 disabled:bg-surface-muted disabled:text-text-muted";

const ALLOWED_EXT = ["pdf", "jpg", "jpeg", "png"];
const emptyRowKey = () => `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function blankRow() {
  return {
    localKey: emptyRowKey(),
    id: null,
    expenseDate: "",
    category: "",
    subCategory: "",
    description: "",
    claimedAmount: "",
    billNumber: "",
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
    category: item.category || "",
    subCategory: item.subCategory || "",
    description: item.description || "",
    claimedAmount: item.claimedAmount != null ? String(item.claimedAmount) : "",
    billNumber: item.billNumber || "",
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

  const subCategoriesFor = (category) => (meta?.subCategories?.[category] || []);
  const categoryRequiresBill = (category) =>
    Boolean(meta?.categories?.find((c) => c.name === category)?.requiresBill);

  const setRow = (localKey, patch) =>
    setRows((prev) => prev.map((r) => (r.localKey === localKey ? { ...r, ...patch } : r)));

  const addRow = () => setRows((prev) => [...prev, blankRow()]);

  const removeRow = (localKey) =>
    setRows((prev) => (prev.length === 1 ? [blankRow()] : prev.filter((r) => r.localKey !== localKey)));

  function buildPayload() {
    return {
      employeeCode: form.employeeCode.trim() || null,
      items: rows.map((r) => ({
        id: r.id || undefined,
        expenseDate: r.expenseDate || null,
        category: r.category,
        subCategory: r.subCategory || null,
        description: r.description || null,
        claimedAmount: Number(r.claimedAmount) || 0,
        billNumber: r.billNumber || null,
      })),
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

  const clientValidate = () => {
    const errs = [];
    if (form.employeeCode.trim() && empLookup.status !== "found") {
      errs.push(`Employee ID "${form.employeeCode.trim()}" is not verified — click Fetch and make sure the details load.`);
    }
    if (!form.employeeCode.trim() && !emp?.employeeName) {
      errs.push("Enter your Employee ID / HRMS ID and fetch the details.");
    }
    if (!rows.length) errs.push("Add at least one expense item.");
    rows.forEach((r, i) => {
      const n = i + 1;
      if (!r.category) errs.push(`Row ${n}: choose an Expense Category.`);
      if (!r.expenseDate) errs.push(`Row ${n}: enter the Expense Date.`);
      if (!(Number(r.claimedAmount) > 0)) errs.push(`Row ${n}: enter a Claimed Amount greater than zero.`);
      if (r.category && categoryRequiresBill(r.category) && !r.attachments.length) {
        errs.push(`Row ${n}: attach a bill/invoice for "${r.category}".`);
      }
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
            One claim can hold many expense items. The total is calculated for you.
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
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Claim Information</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Employee ID / HRMS ID" className="sm:col-span-2 lg:col-span-3">
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
                  Enter the ID and the rest fills in from the employee master.
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

      {/* Expense Items */}
      <div className={`${CARD_SHELL} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-color/70 px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Expense Items</h2>
          <button
            type="button"
            onClick={addRow}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300"
          >
            <Plus size={15} /> Add Expense
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[960px] w-full text-left text-sm">
            <thead>
              <tr className="bg-surface-muted text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                <th className="px-3 py-2.5">#</th>
                <th className="px-3 py-2.5">Expense Date</th>
                <th className="px-3 py-2.5">Category</th>
                <th className="px-3 py-2.5">Sub Category</th>
                <th className="px-3 py-2.5">Description</th>
                <th className="px-3 py-2.5 text-right">Claimed Amount</th>
                <th className="px-3 py-2.5">Bill / Invoice</th>
                <th className="px-3 py-2.5">Bill Number</th>
                <th className="px-3 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-color">
              {rows.map((row, index) => (
                <tr key={row.localKey} className="align-middle">
                  <td className="px-3 py-2 text-text-muted">{index + 1}</td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      className={CELL_INPUT}
                      value={row.expenseDate}
                      onChange={(e) => setRow(row.localKey, { expenseDate: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className={CELL_INPUT}
                      value={row.category}
                      onChange={(e) =>
                        setRow(row.localKey, { category: e.target.value, subCategory: "" })
                      }
                    >
                      <option value="">Select…</option>
                      {(meta?.categories || []).map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className={CELL_INPUT}
                      value={row.subCategory}
                      onChange={(e) => setRow(row.localKey, { subCategory: e.target.value })}
                      disabled={!row.category}
                    >
                      <option value="">—</option>
                      {subCategoriesFor(row.category).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={CELL_INPUT}
                      placeholder="Details"
                      value={row.description}
                      onChange={(e) => setRow(row.localKey, { description: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={`${CELL_INPUT} text-right`}
                      placeholder="0.00"
                      value={row.claimedAmount}
                      onChange={(e) => setRow(row.localKey, { claimedAmount: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <BillCell
                      row={row}
                      uploading={uploadingKey === row.localKey}
                      requiresBill={categoryRequiresBill(row.category)}
                      onPick={() => pickFile(row.localKey)}
                      onOpen={(attId) =>
                        openBill(attId).catch((err) => toast.error(err.message))
                      }
                      onRemove={(attId) => handleRemoveBill(row, attId)}
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
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={CELL_INPUT}
                      placeholder="Invoice #"
                      value={row.billNumber}
                      onChange={(e) => setRow(row.localKey, { billNumber: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeRow(row.localKey)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-color text-text-muted transition hover:border-rose-300 hover:text-rose-600"
                      title="Remove row"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

function BillCell({ row, uploading, requiresBill, onPick, onOpen, onRemove }) {
  return (
    <div className="min-w-[160px] space-y-1">
      {row.attachments.map((att) => (
        <div
          key={att.id}
          className="flex h-9 items-center gap-1 rounded-lg border border-border-color bg-surface px-2 text-xs"
        >
          <FileText size={13} className="shrink-0 text-indigo-500" />
          <button
            type="button"
            onClick={() => onOpen(att.id)}
            className="min-w-0 flex-1 truncate text-left text-indigo-600 hover:underline dark:text-indigo-300"
            title={att.fileName}
          >
            {att.fileName}
          </button>
          <button
            type="button"
            onClick={() => onRemove(att.id)}
            className="shrink-0 text-text-muted hover:text-rose-600"
            title="Remove bill"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={onPick}
        disabled={uploading}
        className={`inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition disabled:opacity-50 ${
          requiresBill && !row.attachments.length
            ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
            : "border-border-color bg-surface text-text-secondary hover:bg-surface-muted"
        }`}
      >
        {uploading ? (
          <Loader2 className="animate-spin" size={12} />
        ) : row.attachments.length ? (
          <Upload size={12} />
        ) : (
          <Paperclip size={12} />
        )}
        {row.attachments.length ? "Add another" : requiresBill ? "Bill required" : "Attach bill"}
      </button>
    </div>
  );
}
