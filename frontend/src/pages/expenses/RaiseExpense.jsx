import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, Banknote, Building2, Loader2, Plus, Receipt, Save, Send, Trash2, UserRound } from "lucide-react";

import { CARD_SHELL } from "../../components/billingDashboard/theme";
import ConfirmDialog from "../../components/ConfirmDialog";
import ClaimProgressTracker from "../../components/expenses/ClaimProgressTracker";
import EmployeePartyPicker from "../../components/expenses/EmployeePartyPicker";
import ExpenseItemCard from "../../components/expenses/ExpenseItemCard";
import EntitySelect from "../../components/expenses/EntitySelect";
import AddVendorModal from "../../components/expenses/AddVendorModal";
import { useUser } from "../../context/UserContext";
import { formatCurrency } from "../../utils/penaltyFormat";
import {
  createClaim,
  deleteBill,
  deleteClaim,
  fetchClaim,
  fetchExpenseMeta,
  fetchVendors,
  openBill,
  submitClaim,
  updateClaim,
  uploadBill,
} from "../../lib/expenseClaimsApi";

const ALLOWED_EXT = ["pdf", "jpg", "jpeg", "png"];
const emptyRowKey = () => `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// Employee identity is entered/fetched ONCE per claim (see EmployeePartyPicker)
// and lives here at claim level — not on each item.
function blankClaimParty() {
  return {
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
  };
}

function blankRow() {
  return {
    localKey: emptyRowKey(),
    id: null,
    expenseDate: "",
    // Vendor is still selected per item (unchanged); employee identity is
    // claim-level and merged in at payload time.
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

// Reconstruct the claim-level party from a saved claim. The employee snapshot is
// carried both on the claim and (duplicated) on each item; prefer the first
// item's values, fall back to the claim header.
function claimPartyFromBundle(bundle) {
  const first = (bundle.items || [])[0] || {};
  const expenseFor = (first.expenseFor || "employee") === "vendor" ? "vendor" : "employee";
  const claim = bundle.claim || {};
  return {
    expenseFor,
    employeeType: first.employeeType || "",
    empRefCode: first.empRefCode || claim.employeeCode || "",
    empRefName: first.empRefName || claim.employeeName || "",
    empRefDesignation: first.empRefDesignation || claim.designation || "",
    empRefCircle: first.empRefCircle || claim.circle || "",
    empRefCmp: first.empRefCmp || claim.cmp || "",
    bankAccount: first.bankAccount || "",
    ifsc: first.ifsc || "",
    vendorId: first.vendorId || null,
    vendorName: first.vendorName || "",
    vendorType: first.vendorType || "",
  };
}

export default function RaiseExpense() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { id: routeId } = useParams();

  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState(null);
  const [claimId, setClaimId] = useState(routeId ? Number(routeId) : null);
  const [status, setStatus] = useState("draft");
  const [claimNumber, setClaimNumber] = useState(null);

  // 'reimbursement' (existing itemised flow) | 'advance' (money before the bill).
  // Locked once the claim exists — a draft cannot flip kind.
  const [claimKind, setClaimKind] = useState("reimbursement");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advancePurpose, setAdvancePurpose] = useState("");
  const [addVendorOpen, setAddVendorOpen] = useState(false);

  const [claimParty, setClaimParty] = useState(blankClaimParty());
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
        setClaimParty(claimPartyFromBundle(b));
        const kind = b.claim.claimKind === "advance" ? "advance" : "reimbursement";
        setClaimKind(kind);
        if (kind === "advance") {
          const amt = b.items?.[0]?.claimedAmount;
          setAdvanceAmount(amt != null ? String(amt) : "");
          setAdvancePurpose(b.claim.purpose || "");
        } else {
          const mapped = rowsFromBundle(b);
          setRows(mapped.length ? mapped : [blankRow()]);
        }
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
    const isEmployee = claimParty.expenseFor !== "vendor";
    return {
      id: r.id || undefined,
      expenseDate: r.expenseDate || null,
      // Party is claim-level: every item carries the same employee snapshot, or
      // its own vendor selection.
      expenseFor: isEmployee ? "employee" : "vendor",
      employeeType: isEmployee ? claimParty.employeeType || null : null,
      empRefCode: isEmployee ? claimParty.empRefCode || null : null,
      empRefName: isEmployee ? claimParty.empRefName || null : null,
      empRefDesignation: isEmployee ? claimParty.empRefDesignation || null : null,
      empRefCircle: isEmployee ? claimParty.empRefCircle || null : null,
      empRefCmp: isEmployee ? claimParty.empRefCmp || null : null,
      bankAccount: isEmployee ? claimParty.bankAccount || null : null,
      ifsc: isEmployee ? claimParty.ifsc || null : null,
      vendorId: isEmployee ? null : r.vendorId || null,
      vendorName: isEmployee ? null : r.vendorName || null,
      vendorType: isEmployee ? null : r.vendorType || null,
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
    // The claim belongs to the signed-in user. Employee identity is entered once
    // at claim level and sent as `employeeCode`; the server resolves the full
    // master snapshot from it. Each item still carries the (shared) employee
    // fields or its own vendor so downstream views need no change.
    if (claimKind === "advance") {
      const isVendor = claimParty.expenseFor === "vendor";
      return {
        claimKind: "advance",
        expenseFor: isVendor ? "vendor" : "employee",
        employeeCode: isVendor ? null : claimParty.empRefCode || null,
        vendorId: isVendor ? claimParty.vendorId || null : null,
        vendorName: isVendor ? claimParty.vendorName || null : null,
        vendorType: isVendor ? claimParty.vendorType || null : null,
        requestedAmount: Number(advanceAmount) || 0,
        purpose: advancePurpose.trim() || null,
      };
    }
    return {
      claimKind: "reimbursement",
      employeeCode:
        claimParty.expenseFor !== "vendor" ? claimParty.empRefCode || null : null,
      items: rows.map(itemPayload),
    };
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
      // Server returns items in the same sr_no order we sent them. (Advance
      // claims carry a single synthetic item the form never renders.)
      if (claimKind !== "advance") {
        setRows((prev) =>
          prev.map((r, index) => {
            const item = b.items[index];
            if (!item) return r;
            const atts = (b.attachments || []).filter((a) => a.itemId === item.id);
            return { ...r, id: item.id, attachments: atts.length ? atts : r.attachments };
          })
        );
      }
      if (!silent) toast.success("Draft saved.");
      return b;
    },
    [claimId, rows, claimParty, claimKind, advanceAmount, advancePurpose] // eslint-disable-line react-hooks/exhaustive-deps
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
    if (claimParty.expenseFor === "vendor" && !r.vendorId) {
      e.push("Select a Vendor.");
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

    if (claimKind === "advance") {
      if (claimParty.expenseFor === "vendor") {
        if (!claimParty.vendorId) errs.push("Select a vendor for this advance.");
      } else if (!claimParty.empRefCode) {
        errs.push("Enter the Employee ID / HRMS ID and click Fetch before submitting.");
      }
      if (!(Number(advanceAmount) > 0)) {
        errs.push("Enter an advance amount greater than zero.");
      }
      setItemErrorMap({});
      return errs;
    }

    if (claimParty.expenseFor !== "vendor" && !claimParty.empRefCode) {
      errs.push("Enter the Employee ID / HRMS ID and click Fetch before submitting.");
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

  // The claim's claimant resolves to the signed-in user when this is an Employee
  // expense and either no Employee ID was entered or it matches the user's own.
  const myCode = String(meta?.myProfile?.employeeCode || "").trim().toLowerCase();
  const enteredCode = String(claimParty.empRefCode || "").trim().toLowerCase();
  const claimantIsSelf =
    claimParty.expenseFor === "employee" && (!enteredCode || enteredCode === myCode);
  // Self-approval guard (spec §4/§5): a user configured as the L1 approver cannot
  // submit their OWN claim. The page stays usable — they can still fix the
  // claimant, save a draft, or ask an admin to change the chain — only Submit is
  // blocked, and the backend enforces the same rule.
  const blockSelfL1 = Boolean(meta?.selfIsL1Approver) && claimantIsSelf;

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
            {claimNumber
              ? `Edit ${claimKind === "advance" ? "Advance" : "Claim"} ${claimNumber}`
              : claimKind === "advance"
              ? "Raise Advance"
              : "Raise Expense"}
          </h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            {claimKind === "advance"
              ? "Request funds before the expense. Approved advances are paid by Finance, then closed against real bills."
              : "Build each expense step by step. One claim can hold many items — each with its own Employee or Vendor."}
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
            disabled={busy || blockSelfL1}
            title={
              blockSelfL1
                ? "You are configured as the L1 approver for your own claim. Ask an administrator to change the L1 approver, then submit."
                : undefined
            }
            className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="animate-spin" size={15} /> : <Send size={15} />}
            Submit {claimKind === "advance" ? "Advance" : "Claim"}
          </button>
        </div>
      </div>

      {blockSelfL1 ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          <div className="font-semibold">You cannot submit your own expense claim</div>
          <p className="mt-0.5">
            You are currently configured as the <strong>L1 approver</strong>, so you would be
            approving your own claim. Ask an administrator to set a different L1 approver in
            <span className="whitespace-nowrap"> Expense Settings → Default Approval Chain</span>,
            or raise this claim on behalf of another employee. You can still save it as a draft in
            the meantime.
          </p>
        </div>
      ) : null}

      {/* Progress */}
      <div className={`${CARD_SHELL} p-4`}>
        <ClaimProgressTracker status={status} />
      </div>

      {/* Claim Type — Reimbursement (default) vs Advance. Locked once created. */}
      <div className={`${CARD_SHELL} space-y-3 p-4`}>
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Claim Type</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            {claimId
              ? "Claim type is fixed for an existing claim."
              : "Reimbursement is for money already spent. Advance is money requested before the bill exists."}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { value: "reimbursement", label: "Reimbursement", icon: Receipt, hint: "Spent already · attach bills" },
            { value: "advance", label: "Advance", icon: Banknote, hint: "Request funds first · bills later" },
          ].map((o) => {
            const active = claimKind === o.value;
            return (
              <button
                key={o.value}
                type="button"
                disabled={Boolean(claimId)}
                onClick={() => setClaimKind(o.value)}
                className={`flex items-start gap-2 rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
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
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                    <o.icon size={14} />
                    {o.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-text-muted">{o.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
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

      {claimKind === "advance" ? (
        <div className={`${CARD_SHELL} space-y-4 p-4`}>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Advance Request</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              Who the advance is for, the amount requested, and why. It runs through the same
              L1 → L2 → Final approval chain; bills are added later, once the advance is paid.
            </p>
          </div>

          {/* Advance for an employee or a vendor */}
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { value: "employee", label: "Employee Advance", icon: UserRound },
              { value: "vendor", label: "Vendor Advance", icon: Building2 },
            ].map((o) => {
              const active = claimParty.expenseFor === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() =>
                    setClaimParty((cp) =>
                      cp.expenseFor === o.value ? cp : { ...blankClaimParty(), expenseFor: o.value }
                    )
                  }
                  className={`flex items-center gap-2 rounded-xl border p-3 text-left transition ${
                    active
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10"
                      : "border-border-color bg-surface hover:bg-surface-muted"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                      active ? "border-indigo-500" : "border-border-color"
                    }`}
                  >
                    {active ? <span className="h-2 w-2 rounded-full bg-indigo-500" /> : null}
                  </span>
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                    <o.icon size={14} />
                    {o.label}
                  </span>
                </button>
              );
            })}
          </div>

          {claimParty.expenseFor === "vendor" ? (
            <div className="space-y-2">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">
                Vendor <span className="text-rose-500">*</span>
              </span>
              <EntitySelect
                value={
                  claimParty.vendorId
                    ? { id: claimParty.vendorId, name: claimParty.vendorName }
                    : null
                }
                onChange={(o) =>
                  setClaimParty((cp) => ({
                    ...cp,
                    vendorId: o?.id || null,
                    vendorName: o?.name || "",
                    vendorType: o?.vendorType || "",
                  }))
                }
                fetcher={async (q) => (await fetchVendors({ search: q })).data}
                getLabel={(o) => o.name}
                getSub={(o) => [o.vendorType, o.gstin].filter(Boolean).join(" · ")}
                placeholder="Search / Select Vendor"
                trailing={
                  <button
                    type="button"
                    onClick={() => setAddVendorOpen(true)}
                    className="inline-flex h-10 shrink-0 items-center rounded-xl border border-border-color bg-surface px-3 text-sm font-medium text-text-secondary hover:bg-surface-muted"
                  >
                    + Add
                  </button>
                }
              />
              {claimParty.vendorName ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-text-secondary dark:border-emerald-500/20 dark:bg-emerald-500/10">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                    ✓ {claimParty.vendorName}
                  </span>
                  {claimParty.vendorType ? ` · ${claimParty.vendorType}` : ""}
                </div>
              ) : null}
            </div>
          ) : (
            <EmployeePartyPicker
              value={claimParty}
              onChange={(p) => setClaimParty((cp) => ({ ...cp, ...p, expenseFor: "employee" }))}
            />
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-text-secondary">
                Advance Amount (₹)
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(e.target.value)}
                placeholder="e.g. 100000"
                className="w-full rounded-xl border border-border-color bg-surface px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
            </label>
            <div className="flex flex-col justify-end">
              <span className="mb-1 block text-xs font-semibold text-text-secondary">Requested</span>
              <div className="rounded-xl border border-border-color bg-surface-muted/50 px-3 py-2 text-sm font-bold text-text-primary">
                {formatCurrency(Number(advanceAmount) || 0)}
              </div>
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-text-secondary">Purpose</span>
            <textarea
              rows={3}
              value={advancePurpose}
              onChange={(e) => setAdvancePurpose(e.target.value)}
              placeholder="Project travel / site activity / material procurement…"
              className="w-full rounded-xl border border-border-color bg-surface px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
          </label>
          <div className="rounded-xl border border-border-color bg-surface-muted/50 p-3 text-xs text-text-secondary">
            <span className="font-semibold text-text-muted">Submitted by:</span> {user?.name || "You"}
          </div>
        </div>
      ) : (
      <>
      {/* Claim party — entered ONCE for the whole claim */}
      <div className={`${CARD_SHELL} space-y-4 p-4`}>
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Expense For</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Choose once for the whole claim. Every expense item below uses this.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { value: "employee", label: "Employee Expense", icon: UserRound },
            { value: "vendor", label: "Vendor Expense", icon: Building2 },
          ].map((o) => {
            const active = claimParty.expenseFor === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() =>
                  setClaimParty((cp) =>
                    cp.expenseFor === o.value
                      ? cp
                      : o.value === "employee"
                      ? { ...blankClaimParty(), expenseFor: "employee" }
                      : { ...blankClaimParty(), expenseFor: "vendor" }
                  )
                }
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
                <span className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                  <o.icon size={14} />
                  {o.label}
                </span>
              </button>
            );
          })}
        </div>

        {claimParty.expenseFor === "employee" ? (
          <>
            <EmployeePartyPicker
              value={claimParty}
              onChange={(p) => setClaimParty((cp) => ({ ...cp, ...p }))}
            />
            <div className="rounded-xl border border-border-color bg-surface-muted/50 p-3 text-xs text-text-secondary">
              <div>
                <span className="font-semibold text-text-muted">Submitted by:</span>{" "}
                {user?.name || "You"}
              </div>
              {claimParty.empRefName ? (
                <div className="mt-0.5">
                  <span className="font-semibold text-text-muted">Expense employee (claimant):</span>{" "}
                  {claimParty.empRefName}
                  {claimParty.empRefCode ? ` · ${claimParty.empRefCode}` : ""}
                </div>
              ) : null}
              {claimParty.empRefName && user?.name && claimParty.empRefName.trim().toLowerCase() !== user.name.trim().toLowerCase() ? (
                <div className="mt-1 text-amber-700 dark:text-amber-400">
                  You are raising this on behalf of another employee — the claim will belong to
                  them, and their approval chain applies. You remain recorded as the submitter.
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <p className="rounded-xl border border-border-color bg-surface-muted/50 p-3 text-xs text-text-muted">
            Each expense item below selects its own Vendor from the vendor master.
          </p>
        )}
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
                party={claimParty}
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
      </>
      )}

      <AddVendorModal
        open={addVendorOpen}
        vendorTypes={meta?.vendorTypes || []}
        defaultType={claimParty.vendorType || ""}
        onClose={() => setAddVendorOpen(false)}
        onCreated={(v) =>
          setClaimParty((cp) => ({
            ...cp,
            vendorId: v.id,
            vendorName: v.name,
            vendorType: v.vendorType || cp.vendorType || "",
          }))
        }
      />

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
