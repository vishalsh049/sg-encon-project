// -----------------------------------------------------------------------------
// Advance Payment + Bill Closure — dedicated routes.
//
// An advance REQUEST + its approval live in expense_claims (claim_kind='advance')
// and are handled by routes/expenseClaimRoutes.js, reusing the whole approval
// engine. THIS router owns everything that happens AFTER final approval:
//   * Milestone B — Finance records the actual disbursement(s)  (payments)
//   * Milestone C — the employee submits real bills, verified L1/L2/Final
//   * Milestone D — reconciliation: refunds / additional payments / closure
//
// Mounted at /api/expense-advances, AFTER the global auth middleware (server.js).
// Shared transaction / audit / notification / money helpers are imported from
// expenseClaimRoutes.js so there is exactly one implementation of each.
// -----------------------------------------------------------------------------

const express = require("express");
const router = express.Router();

const { authMiddleware } = require("../middleware/circleAccess");
const { requirePagePermission, hasPagePermission } = require("../middleware/pagePermission");
const { PAGE_IDS } = require("../constants/expenseClaimConstants");
const shared = require("./expenseClaimRoutes");

const {
  ensureTables,
  pool,
  withTransaction,
  writeAudit,
  notify,
  round2,
  formatINR,
  httpError,
  fail,
  actorName,
  isAdmin,
  mapAudit,
  buildApprovalTimeline,
  recomputeAdvance,
  nextAdvanceBillNumber,
  newAccessToken,
  assertValidBill,
  billUpload,
  buildLinkedWorkbook,
} = shared;

router.use(authMiddleware);

const FINANCE_PAGE = PAGE_IDS.finance; // "expense-finance"
const ADVANCES_PAGE = PAGE_IDS.advances; // "expense-advances"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function normDate(value) {
  if (value === null || value === undefined || value === "") return undefined;
  const text = String(value).trim().slice(0, 10);
  if (!DATE_RE.test(text)) return undefined;
  const d = new Date(`${text}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : text;
}
function toMoney(value) {
  const n = Number(String(value ?? "").replace(/[,\s₹]/g, ""));
  return Number.isFinite(n) ? Number(n.toFixed(2)) : NaN;
}

// Whoever can see the whole Advance module (or Finance) sees every advance; an
// ordinary employee sees only the advances they are the claimant / submitter of.
function canSeeAllAdvances(authUser) {
  return (
    isAdmin(authUser) ||
    hasPagePermission(authUser, ADVANCES_PAGE, "view") ||
    hasPagePermission(authUser, FINANCE_PAGE, "view")
  );
}

// Per-advance visibility — mirrors canViewClaim() in expenseClaimRoutes.js.
function canViewAdvance(authUser, row) {
  if (canSeeAllAdvances(authUser)) return true;
  if (row.employee_user_id != null && row.employee_user_id === authUser.id) return true;
  if (row.created_by != null && row.created_by === authUser.id) return true;
  return false;
}

const num = (v) => (v === null || v === undefined ? null : Number(v));

// Reconciliation figures derived from the (always-fresh) stored columns.
function reconcile(row) {
  const approved = num(row.approved_amount);
  const totalPaid = Number(row.total_paid || 0);
  const totalRefunded = Number(row.total_refunded || 0);
  const totalAdditional = Number(row.total_additional_paid || 0);
  const totalApprovedBills = Number(row.total_approved_bills || 0);
  const remainingAdvance = round2(totalPaid + totalAdditional - totalApprovedBills - totalRefunded);
  const additionalPayable = round2(Math.max(totalApprovedBills - (totalPaid + totalAdditional), 0));
  return {
    approvedAmount: approved,
    totalPaid: round2(totalPaid),
    totalRefunded: round2(totalRefunded),
    totalAdditionalPaid: round2(totalAdditional),
    totalApprovedBills: round2(totalApprovedBills),
    unpaidApproved: approved == null ? null : round2(Math.max(approved - totalPaid, 0)),
    remainingAdvance,
    additionalPayable,
    refundPending: row.bill_closure_status === "refund_pending" ? Math.max(remainingAdvance, 0) : 0,
  };
}

function mapAdvanceRow(row) {
  return {
    id: row.id,
    claimId: row.claim_id,
    advanceNumber: row.claim_number,
    employeeUserId: row.employee_user_id,
    employeeName: row.employee_name,
    employeeCode: row.employee_code,
    department: row.department,
    circle: row.circle,
    cmp: row.cmp ?? row.cost_centre ?? null,
    purpose: row.purpose ?? null,
    approvalStatus: row.current_status,
    paymentStatus: row.payment_status,
    billClosureStatus: row.bill_closure_status,
    requestedAmount: num(row.requested_amount),
    submittedByUserId: row.created_by,
    submittedByName: row.created_by_name || null,
    billCount: row.bill_count != null ? Number(row.bill_count) : undefined,
    billApprovedCount: row.bill_approved_count != null ? Number(row.bill_approved_count) : undefined,
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
    ...reconcile(row),
  };
}

function mapPayment(row) {
  return {
    id: row.id,
    advanceId: row.advance_id,
    paymentDate: row.payment_date,
    paidAmount: Number(row.paid_amount || 0),
    paymentReference: row.payment_reference,
    utrReference: row.utr_reference,
    remarks: row.remarks,
    isReversal: Boolean(row.is_reversal),
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
  };
}

function mapRefund(row) {
  return {
    id: row.id,
    advanceId: row.advance_id,
    refundAmount: Number(row.refund_amount || 0),
    refundDate: row.refund_date,
    refundReference: row.refund_reference,
    remarks: row.remarks,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
  };
}

function mapAddlPayment(row) {
  return {
    id: row.id,
    advanceId: row.advance_id,
    amount: Number(row.amount || 0),
    paymentDate: row.payment_date,
    paymentReference: row.payment_reference,
    utrReference: row.utr_reference,
    remarks: row.remarks,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
  };
}

function mapBill(row) {
  return {
    id: row.id,
    advanceId: row.advance_id,
    billNumber: row.bill_number,
    poNumber: row.po_number,
    jmsId: row.jms_id,
    sgInvoiceNo: row.sg_invoice_no,
    sgInvoiceDate: row.sg_invoice_date,
    billingAmount: Number(row.billing_amount || 0),
    serviceMonth: row.service_month,
    description: row.description,
    billStatus: row.bill_status,
    currentStage: row.current_stage,
    currentApproverUserId: row.current_approver_user_id,
    l1ApproverUserId: row.l1_approver_user_id,
    l2ApproverUserId: row.l2_approver_user_id,
    finalApproverUserId: row.final_approver_user_id,
    l1ApprovedAmount: num(row.l1_approved_amount),
    l1Decision: row.l1_decision,
    l1Reason: row.l1_reason,
    l2ApprovedAmount: num(row.l2_approved_amount),
    l2Decision: row.l2_decision,
    l2Reason: row.l2_reason,
    finalApprovedAmount: num(row.final_approved_amount),
    finalDecision: row.final_decision,
    finalReason: row.final_reason,
    approvedAmount: num(row.approved_amount),
    submittedBy: row.submitted_by,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attachments: row.attachments || [],
  };
}

// All bills for an advance, each with its attachment metadata.
async function loadBillsForAdvance(advanceId) {
  const [bills] = await pool.query(
    `SELECT * FROM expense_advance_bills WHERE advance_id = ? ORDER BY id ASC`,
    [advanceId]
  );
  if (!bills.length) return [];
  const ids = bills.map((b) => b.id);
  const [atts] = await pool.query(
    `SELECT id, advance_bill_id, file_name, file_type, file_size, uploaded_by, uploaded_by_name, uploaded_at
       FROM expense_claim_attachments
      WHERE advance_bill_id IN (${ids.map(() => "?").join(",")})
      ORDER BY id ASC`,
    ids
  );
  const byBill = new Map();
  for (const at of atts) {
    if (!byBill.has(at.advance_bill_id)) byBill.set(at.advance_bill_id, []);
    byBill.get(at.advance_bill_id).push({
      id: at.id,
      fileName: at.file_name,
      fileType: at.file_type,
      fileSize: at.file_size,
      uploadedByName: at.uploaded_by_name,
      uploadedAt: at.uploaded_at,
    });
  }
  return bills.map((b) => mapBill({ ...b, attachments: byBill.get(b.id) || [] }));
}

const BILL_STAGE_PENDING = { l1: "pending_l1", l2: "pending_l2", final: "pending_final" };
const BILL_STAGE_LABEL = { l1: "L1", l2: "L2", final: "Final" };
const BILL_EDITABLE = ["draft", "returned"];

// Where a bill goes once `stage` has approved it — same skip rules as claims:
// a level with no approver, or whose approver is the claimant, is skipped.
function nextBillStage(stage, bill, claimantUserId) {
  const l2 =
    bill.l2_approver_user_id && bill.l2_approver_user_id !== claimantUserId
      ? bill.l2_approver_user_id
      : null;
  const fin =
    bill.final_approver_user_id && bill.final_approver_user_id !== claimantUserId
      ? bill.final_approver_user_id
      : null;
  if (stage === "l1") {
    if (l2) return { status: "pending_l2", stage: "l2", approverId: l2 };
    if (fin) return { status: "pending_final", stage: "final", approverId: fin };
    return { status: "approved", stage: "done", approverId: null };
  }
  if (stage === "l2") {
    if (fin) return { status: "pending_final", stage: "final", approverId: fin };
    return { status: "approved", stage: "done", approverId: null };
  }
  return { status: "approved", stage: "done", approverId: null };
}

// Max amount this stage may pass — reductions only flow downstream.
function billCeiling(stage, bill) {
  const claimed = Number(bill.billing_amount || 0);
  if (stage === "l1") return claimed;
  if (stage === "l2") return bill.l1_approved_amount == null ? claimed : Number(bill.l1_approved_amount);
  if (bill.l2_approved_amount != null) return Number(bill.l2_approved_amount);
  if (bill.l1_approved_amount != null) return Number(bill.l1_approved_amount);
  return claimed;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// Full server-side validation for submitting a bill (PART 15).
function validateBillForSubmit(bill, attachmentCount) {
  const errors = [];
  if (!(Number(bill.billing_amount) > 0)) errors.push("Billing amount must be greater than zero.");
  if (!String(bill.sg_invoice_no || "").trim()) errors.push("SG Invoice No. is required.");
  if (bill.sg_invoice_date && normDate(bill.sg_invoice_date) === undefined) {
    errors.push("SG Invoice Date is not a valid date.");
  }
  if (!bill.sg_invoice_date) errors.push("SG Invoice Date is required.");
  if (!String(bill.service_month || "").trim()) errors.push("Billing Service Month is required.");
  else if (!MONTH_RE.test(String(bill.service_month))) errors.push("Service Month must be YYYY-MM.");
  if (!attachmentCount) errors.push("Attach the bill / invoice file before submitting.");
  return errors;
}

async function loadBillOr404(billId) {
  const [rows] = await pool.query(
    `SELECT b.*,
            a.employee_user_id AS advance_employee_user_id,
            a.bill_closure_status,
            a.approved_amount AS advance_approved_amount,
            a.requested_amount AS advance_requested_amount,
            a.total_paid AS advance_total_paid,
            c.claim_number AS advance_number,
            c.created_by AS advance_created_by,
            c.employee_name AS advance_employee_name
       FROM expense_advance_bills b
       JOIN expense_advances a ON a.id = b.advance_id
       JOIN expense_claims c ON c.id = a.claim_id
      WHERE b.id = ?`,
    [billId]
  );
  if (!rows.length) throw httpError(404, "Bill not found.");
  return rows[0];
}

function canEditBill(authUser, billRow) {
  return (
    isAdmin(authUser) ||
    billRow.advance_employee_user_id === authUser.id ||
    billRow.advance_created_by === authUser.id
  );
}

// Body -> normalised bill column values (create / edit share this).
function parseBillBody(body) {
  const s = (v) => {
    const t = String(v ?? "").trim();
    return t === "" ? null : t;
  };
  const amt = toMoney(body?.billingAmount ?? body?.billing_amount);
  return {
    po_number: s(body?.poNumber ?? body?.po_number),
    jms_id: s(body?.jmsId ?? body?.jms_id),
    sg_invoice_no: s(body?.sgInvoiceNo ?? body?.sg_invoice_no),
    sg_invoice_date: normDate(body?.sgInvoiceDate ?? body?.sg_invoice_date) || null,
    billing_amount: Number.isNaN(amt) ? 0 : amt,
    service_month: s(body?.serviceMonth ?? body?.service_month),
    description: s(body?.description),
  };
}

// ---------------------------------------------------------------------------
// GET /  — advance list (Expense Advance Payments page)
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    await ensureTables();

    const { search, approvalStatus, paymentStatus, closureStatus, department, cmp, from, to } =
      req.query;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 200);
    const offset = (page - 1) * pageSize;

    const filters = [];
    const params = [];

    if (!canSeeAllAdvances(req.authUser)) {
      filters.push("(a.employee_user_id = ? OR c.created_by = ?)");
      params.push(req.authUser.id, req.authUser.id);
    }
    if (search) {
      filters.push("(c.claim_number LIKE ? OR c.employee_name LIKE ? OR c.department LIKE ?)");
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    if (approvalStatus) {
      filters.push("c.current_status = ?");
      params.push(String(approvalStatus));
    }
    if (paymentStatus) {
      filters.push("a.payment_status = ?");
      params.push(String(paymentStatus));
    }
    if (closureStatus) {
      filters.push("a.bill_closure_status = ?");
      params.push(String(closureStatus));
    }
    if (department) {
      filters.push("c.department = ?");
      params.push(String(department));
    }
    if (cmp) {
      filters.push("c.cost_centre = ?");
      params.push(String(cmp));
    }
    if (from) {
      filters.push("(c.submitted_at IS NULL OR c.submitted_at >= ?)");
      params.push(`${String(from).slice(0, 10)} 00:00:00`);
    }
    if (to) {
      filters.push("(c.submitted_at IS NULL OR c.submitted_at <= ?)");
      params.push(`${String(to).slice(0, 10)} 23:59:59`);
    }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
         FROM expense_advances a JOIN expense_claims c ON c.id = a.claim_id ${where}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT a.*, c.claim_number, c.employee_name, c.employee_code, c.department, c.circle,
              c.cost_centre AS cmp, c.purpose, c.current_status, c.submitted_at, c.created_by,
              su.name AS created_by_name,
              (SELECT COUNT(*) FROM expense_advance_bills b WHERE b.advance_id = a.id) AS bill_count,
              (SELECT COUNT(*) FROM expense_advance_bills b WHERE b.advance_id = a.id AND b.bill_status = 'approved') AS bill_approved_count
         FROM expense_advances a
         JOIN expense_claims c ON c.id = a.claim_id
         LEFT JOIN users su ON su.id = c.created_by
         ${where}
         ORDER BY a.updated_at DESC, a.id DESC
         LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({
      success: true,
      data: rows.map(mapAdvanceRow),
      total: countRows[0].total,
      page,
      pageSize,
    });
  } catch (error) {
    fail(res, error, "Failed to load advances.");
  }
});

// Distinct filter values for the list page.
router.get("/meta", async (req, res) => {
  try {
    await ensureTables();
    const scope = canSeeAllAdvances(req.authUser)
      ? { sql: "", params: [] }
      : {
          sql: "AND (a.employee_user_id = ? OR c.created_by = ?)",
          params: [req.authUser.id, req.authUser.id],
        };
    const [deps] = await pool.query(
      `SELECT DISTINCT c.department d FROM expense_advances a JOIN expense_claims c ON c.id = a.claim_id
        WHERE c.department IS NOT NULL AND c.department <> '' ${scope.sql} ORDER BY d ASC`,
      scope.params
    );
    const [cmps] = await pool.query(
      `SELECT DISTINCT c.cost_centre m FROM expense_advances a JOIN expense_claims c ON c.id = a.claim_id
        WHERE c.cost_centre IS NOT NULL AND c.cost_centre <> '' ${scope.sql} ORDER BY m ASC`,
      scope.params
    );
    res.json({
      success: true,
      data: {
        departments: deps.map((r) => r.d),
        cmps: cmps.map((r) => r.m),
        paymentStatuses: ["not_paid", "partially_paid", "fully_paid"],
        closureStatuses: [
          "na",
          "open",
          "under_verification",
          "refund_pending",
          "additional_payment_pending",
          "closed",
        ],
      },
    });
  } catch (error) {
    fail(res, error, "Failed to load advance filters.");
  }
});

// ---------------------------------------------------------------------------
// GET /:id  — advance detail bundle
// ---------------------------------------------------------------------------
async function loadAdvanceOr404(id) {
  const [rows] = await pool.query(
    `SELECT a.*, c.claim_number, c.employee_name, c.employee_code, c.department, c.designation,
            c.circle, c.cost_centre AS cmp, c.purpose, c.current_status, c.current_stage,
            c.submitted_at, c.created_by, c.employee_user_id AS claim_employee_user_id,
            c.l1_approver_user_id, c.l2_approver_user_id, c.final_approver_user_id,
            c.l1_approved_total, c.l2_approved_total, c.final_approved_total,
            su.name AS created_by_name, su.employee_id AS created_by_code,
            u1.name AS l1_approver_name, u2.name AS l2_approver_name, u3.name AS final_approver_name
       FROM expense_advances a
       JOIN expense_claims c ON c.id = a.claim_id
       LEFT JOIN users su ON su.id = c.created_by
       LEFT JOIN users u1 ON u1.id = c.l1_approver_user_id
       LEFT JOIN users u2 ON u2.id = c.l2_approver_user_id
       LEFT JOIN users u3 ON u3.id = c.final_approver_user_id
      WHERE a.id = ? OR a.claim_id = ?
      LIMIT 1`,
    [id, id]
  );
  if (!rows.length) throw httpError(404, "Advance not found.");
  return rows[0];
}

router.get("/:id", async (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next();
  try {
    await ensureTables();
    const row = await loadAdvanceOr404(req.params.id);
    if (!canViewAdvance(req.authUser, row)) {
      throw httpError(403, "You do not have access to this advance.");
    }

    const [payments] = await pool.query(
      `SELECT * FROM expense_advance_payments WHERE advance_id = ? ORDER BY payment_date ASC, id ASC`,
      [row.id]
    );
    const bills = await loadBillsForAdvance(row.id);
    const [refunds] = await pool.query(
      `SELECT * FROM expense_advance_refunds WHERE advance_id = ? ORDER BY refund_date ASC, id ASC`,
      [row.id]
    );
    const [addlPayments] = await pool.query(
      `SELECT * FROM expense_advance_additional_payments WHERE advance_id = ? ORDER BY payment_date ASC, id ASC`,
      [row.id]
    );
    const [auditRows] = await pool.query(
      `SELECT * FROM expense_claim_audit WHERE claim_id = ? ORDER BY created_at ASC, id ASC`,
      [row.claim_id]
    );

    // Reuse the claim approval-timeline builder — it only reads columns the row
    // above already carries.
    const timeline = buildApprovalTimeline(
      {
        current_status: row.current_status,
        submitted_at: row.submitted_at,
        created_at: row.created_at,
        created_by: row.created_by,
        created_by_name: row.created_by_name,
        employee_user_id: row.claim_employee_user_id,
        employee_name: row.employee_name,
        l1_approver_user_id: row.l1_approver_user_id,
        l2_approver_user_id: row.l2_approver_user_id,
        final_approver_user_id: row.final_approver_user_id,
        l1_approver_name: row.l1_approver_name,
        l2_approver_name: row.l2_approver_name,
        final_approver_name: row.final_approver_name,
        l1_approved_total: row.l1_approved_total,
        l2_approved_total: row.l2_approved_total,
        final_approved_total: row.final_approved_total,
      },
      auditRows
    );

    res.json({
      success: true,
      data: {
        advance: mapAdvanceRow(row),
        payments: payments.map(mapPayment),
        refunds: refunds.map(mapRefund),
        additionalPayments: addlPayments.map(mapAddlPayment),
        bills,
        audit: auditRows.map(mapAudit),
        timeline,
        approvers: {
          l1: row.l1_approver_name || null,
          l2: row.l2_approver_name || null,
          final: row.final_approver_name || null,
        },
      },
    });
  } catch (error) {
    fail(res, error, "Failed to load the advance.");
  }
});

router.get("/:id/payments", async (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next();
  try {
    await ensureTables();
    const row = await loadAdvanceOr404(req.params.id);
    if (!canViewAdvance(req.authUser, row)) {
      throw httpError(403, "You do not have access to this advance.");
    }
    const [payments] = await pool.query(
      `SELECT * FROM expense_advance_payments WHERE advance_id = ? ORDER BY payment_date ASC, id ASC`,
      [row.id]
    );
    res.json({ success: true, data: payments.map(mapPayment) });
  } catch (error) {
    fail(res, error, "Failed to load payments.");
  }
});

// ---------------------------------------------------------------------------
// POST /:id/payments  — Finance records an actual disbursement
// ---------------------------------------------------------------------------
router.post(
  "/:id/payments",
  (req, res, next) => (/^\d+$/.test(req.params.id) ? next() : next("route")),
  requirePagePermission(FINANCE_PAGE, "edit"),
  async (req, res) => {
    try {
      await ensureTables();
      const row = await loadAdvanceOr404(req.params.id);

      if (row.approved_amount == null) {
        throw httpError(
          409,
          "This advance has not completed final approval yet, so no payment can be recorded."
        );
      }

      const paidAmount = toMoney(req.body?.paidAmount);
      if (Number.isNaN(paidAmount) || paidAmount <= 0) {
        throw httpError(400, "Enter a paid amount greater than zero.");
      }
      const paymentDate = normDate(req.body?.paymentDate);
      if (!paymentDate) throw httpError(400, "Enter a valid payment date (YYYY-MM-DD).");

      const alreadyPaid = Number(row.total_paid || 0);
      if (round2(alreadyPaid + paidAmount) > round2(Number(row.approved_amount)) + 0.001) {
        throw httpError(
          400,
          `Paid so far ${formatINR(alreadyPaid)} + this ${formatINR(paidAmount)} would exceed the approved advance ${formatINR(
            Number(row.approved_amount)
          )}.`
        );
      }

      const paymentReference = String(req.body?.paymentReference ?? "").trim() || null;
      const utrReference = String(req.body?.utrReference ?? "").trim() || null;
      const remarks = String(req.body?.remarks ?? "").trim() || null;

      const refreshed = await withTransaction(async (conn) => {
        await conn.query(
          `INSERT INTO expense_advance_payments
             (advance_id, claim_id, payment_date, paid_amount, payment_reference, utr_reference,
              remarks, created_by, created_by_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id, row.claim_id, paymentDate, paidAmount, paymentReference, utrReference,
            remarks, req.authUser.id, actorName(req.authUser),
          ]
        );
        const adv = await recomputeAdvance(conn, row.claim_id);
        await writeAudit(conn, {
          claimId: row.claim_id,
          actorUserId: req.authUser.id,
          actorName: actorName(req.authUser),
          stage: "finance",
          action: adv.payment_status === "fully_paid" ? "ADVANCE_PAID" : "ADVANCE_PARTIAL_PAID",
          newAmount: paidAmount,
          reason: remarks,
          meta: {
            paymentReference,
            utrReference,
            paymentDate,
            totalPaid: adv.total_paid,
            approvedAmount: adv.approved_amount,
            paymentStatus: adv.payment_status,
          },
        });
        const recipients = new Set(
          [row.claim_employee_user_id, row.created_by].filter((v) => v != null)
        );
        for (const uid of recipients) {
          await notify(conn, {
            userId: uid,
            claimId: row.claim_id,
            claimNumber: row.claim_number,
            type: adv.payment_status === "fully_paid" ? "advance_paid" : "advance_partial_paid",
            message:
              adv.payment_status === "fully_paid"
                ? `Advance ${row.claim_number} is fully paid — ${formatINR(adv.total_paid)}.`
                : `Advance ${row.claim_number}: ${formatINR(paidAmount)} paid (total ${formatINR(
                    adv.total_paid
                  )} of ${formatINR(adv.approved_amount)}).`,
          });
        }
        return adv;
      });

      const [payments] = await pool.query(
        `SELECT * FROM expense_advance_payments WHERE advance_id = ? ORDER BY payment_date ASC, id ASC`,
        [row.id]
      );
      res.json({
        success: true,
        data: { advance: mapAdvanceRow({ ...row, ...refreshed }), payments: payments.map(mapPayment) },
      });
    } catch (error) {
      fail(res, error, "Failed to record the payment.");
    }
  }
);

// ===========================================================================
// MILESTONE C — Advance Bills (employee submits real bills; L1/L2/Final verify)
// ===========================================================================

// GET /bill-approvals — bills pending the signed-in approver.
// Declared with a non-numeric path so it never collides with /:id.
router.get("/bill-approvals", async (req, res) => {
  try {
    await ensureTables();
    const tab = String(req.query.tab || "pending").trim().toLowerCase();
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 200);
    const offset = (page - 1) * pageSize;

    const filters = [];
    const params = [];
    if (tab === "all") {
      filters.push(
        "(b.l1_approver_user_id = ? OR b.l2_approver_user_id = ? OR b.final_approver_user_id = ?)"
      );
      params.push(req.authUser.id, req.authUser.id, req.authUser.id);
    } else {
      filters.push("b.current_approver_user_id = ?");
      params.push(req.authUser.id);
      filters.push("b.bill_status IN ('pending_l1','pending_l2','pending_final')");
    }
    if (req.query.search) {
      filters.push("(b.bill_number LIKE ? OR c.claim_number LIKE ? OR c.employee_name LIKE ?)");
      const like = `%${req.query.search}%`;
      params.push(like, like, like);
    }
    const where = `WHERE ${filters.join(" AND ")}`;

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
         FROM expense_advance_bills b
         JOIN expense_advances a ON a.id = b.advance_id
         JOIN expense_claims c ON c.id = a.claim_id ${where}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT b.*, c.claim_number AS advance_number, c.employee_name, c.employee_code,
              c.department, c.cost_centre AS cmp,
              a.approved_amount AS advance_approved_amount, a.total_paid AS advance_total_paid
         FROM expense_advance_bills b
         JOIN expense_advances a ON a.id = b.advance_id
         JOIN expense_claims c ON c.id = a.claim_id
         ${where}
         ORDER BY ${tab === "all" ? "b.updated_at DESC" : "b.submitted_at ASC"}, b.id ASC
         LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({
      success: true,
      data: rows.map((r) => ({
        ...mapBill(r),
        advanceNumber: r.advance_number,
        employeeName: r.employee_name,
        employeeCode: r.employee_code,
        department: r.department,
        cmp: r.cmp,
        advanceApprovedAmount: num(r.advance_approved_amount),
        advanceTotalPaid: num(r.advance_total_paid),
        myStage:
          r.bill_status === "pending_l1"
            ? "l1"
            : r.bill_status === "pending_l2"
            ? "l2"
            : r.bill_status === "pending_final"
            ? "final"
            : null,
      })),
      total: countRows[0].total,
      page,
      pageSize,
    });
  } catch (error) {
    fail(res, error, "Failed to load the bill approvals queue.");
  }
});

// GET /bills/:billId — one bill + its advance context + previously approved bills.
router.get("/bills/:billId", async (req, res) => {
  try {
    await ensureTables();
    const bill = await loadBillOr404(req.params.billId);
    const canApprove =
      isAdmin(req.authUser) ||
      [bill.l1_approver_user_id, bill.l2_approver_user_id, bill.final_approver_user_id].includes(
        req.authUser.id
      );
    if (!canEditBill(req.authUser, bill) && !canApprove) {
      throw httpError(403, "You do not have access to this bill.");
    }
    const bills = await loadBillsForAdvance(bill.advance_id);
    const current = bills.find((b) => b.id === bill.id) || mapBill(bill);
    const previousApproved = bills.filter(
      (b) => b.id !== bill.id && b.billStatus === "approved"
    );
    const advRow = await loadAdvanceOr404(bill.advance_id);

    res.json({
      success: true,
      data: {
        bill: current,
        advance: mapAdvanceRow(advRow),
        previousApprovedBills: previousApproved,
        allBills: bills,
      },
    });
  } catch (error) {
    fail(res, error, "Failed to load the bill.");
  }
});

// POST /:id/bills — create a draft bill against an approved advance.
router.post("/:id/bills", async (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next();
  try {
    await ensureTables();
    const adv = await loadAdvanceOr404(req.params.id);
    if (!canViewAdvance(req.authUser, adv)) {
      throw httpError(403, "You do not have access to this advance.");
    }
    if (
      !(
        isAdmin(req.authUser) ||
        adv.claim_employee_user_id === req.authUser.id ||
        adv.created_by === req.authUser.id
      )
    ) {
      throw httpError(403, "Only the advance holder (or who raised it) can add a bill.");
    }
    if (adv.approved_amount == null) {
      throw httpError(409, "This advance is not approved yet — no bill can be added.");
    }
    if (adv.bill_closure_status === "closed") {
      throw httpError(409, "This advance is closed — no further bills can be added.");
    }

    const v = parseBillBody(req.body);
    const [ins] = await pool.query(
      `INSERT INTO expense_advance_bills
         (advance_id, claim_id, po_number, jms_id, sg_invoice_no, sg_invoice_date,
          billing_amount, service_month, description, bill_status, submitted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
      [
        adv.id, adv.claim_id, v.po_number, v.jms_id, v.sg_invoice_no, v.sg_invoice_date,
        v.billing_amount, v.service_month, v.description, req.authUser.id,
      ]
    );
    await withTransaction(async (conn) => {
      await writeAudit(conn, {
        claimId: adv.claim_id,
        advanceBillId: ins.insertId,
        actorUserId: req.authUser.id,
        actorName: actorName(req.authUser),
        stage: "employee",
        action: "BILL_CREATED",
        newAmount: v.billing_amount,
        meta: { billId: ins.insertId },
      });
    });
    const bills = await loadBillsForAdvance(adv.id);
    res.status(201).json({ success: true, data: bills.find((b) => b.id === ins.insertId) });
  } catch (error) {
    fail(res, error, "Failed to create the bill.");
  }
});

// PUT /bills/:billId — edit a draft / returned bill.
router.put("/bills/:billId", async (req, res) => {
  try {
    await ensureTables();
    const bill = await loadBillOr404(req.params.billId);
    if (!canEditBill(req.authUser, bill)) {
      throw httpError(403, "You can only edit bills on your own advance.");
    }
    if (!BILL_EDITABLE.includes(bill.bill_status)) {
      throw httpError(409, "This bill has been submitted and can no longer be edited.");
    }
    const v = parseBillBody(req.body);
    await pool.query(
      `UPDATE expense_advance_bills SET
         po_number = ?, jms_id = ?, sg_invoice_no = ?, sg_invoice_date = ?,
         billing_amount = ?, service_month = ?, description = ?
       WHERE id = ?`,
      [
        v.po_number, v.jms_id, v.sg_invoice_no, v.sg_invoice_date,
        v.billing_amount, v.service_month, v.description, bill.id,
      ]
    );
    const bills = await loadBillsForAdvance(bill.advance_id);
    res.json({ success: true, data: bills.find((b) => b.id === bill.id) });
  } catch (error) {
    fail(res, error, "Failed to update the bill.");
  }
});

// DELETE /bills/:billId — drop a draft / returned bill.
router.delete("/bills/:billId", async (req, res) => {
  try {
    await ensureTables();
    const bill = await loadBillOr404(req.params.billId);
    if (!canEditBill(req.authUser, bill)) {
      throw httpError(403, "You can only delete bills on your own advance.");
    }
    if (!BILL_EDITABLE.includes(bill.bill_status)) {
      throw httpError(409, "A submitted bill cannot be deleted.");
    }
    await withTransaction(async (conn) => {
      await conn.query(`DELETE FROM expense_claim_attachments WHERE advance_bill_id = ?`, [bill.id]);
      await conn.query(`DELETE FROM expense_advance_bills WHERE id = ?`, [bill.id]);
      await writeAudit(conn, {
        claimId: bill.claim_id,
        advanceBillId: bill.id,
        actorUserId: req.authUser.id,
        actorName: actorName(req.authUser),
        stage: "employee",
        action: "BILL_DELETED",
        meta: { billId: bill.id },
      });
      await recomputeAdvance(conn, bill.claim_id);
    });
    res.json({ success: true });
  } catch (error) {
    fail(res, error, "Failed to delete the bill.");
  }
});

// POST /bills/:billId/file — attach the bill/invoice document.
router.post("/bills/:billId/file", billUpload, async (req, res) => {
  try {
    await ensureTables();
    const bill = await loadBillOr404(req.params.billId);
    if (!canEditBill(req.authUser, bill)) {
      throw httpError(403, "You can only attach files to bills on your own advance.");
    }
    if (!BILL_EDITABLE.includes(bill.bill_status)) {
      throw httpError(409, "Files cannot be changed after the bill is submitted.");
    }
    assertValidBill(req.file);
    const [ins] = await pool.query(
      `INSERT INTO expense_claim_attachments
         (claim_id, advance_bill_id, file_name, file_type, file_size, file_data, access_token,
          uploaded_by, uploaded_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bill.claim_id, bill.id, req.file.originalname,
        req.file.mimetype || "application/octet-stream", req.file.size, req.file.buffer,
        newAccessToken(), req.authUser.id, actorName(req.authUser),
      ]
    );
    res.json({
      success: true,
      data: {
        id: ins.insertId,
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
      },
    });
  } catch (error) {
    fail(res, error, "Failed to upload the bill file.");
  }
});

// DELETE /bills/:billId/attachments/:attId
router.delete("/bills/:billId/attachments/:attId", async (req, res) => {
  try {
    await ensureTables();
    const bill = await loadBillOr404(req.params.billId);
    if (!canEditBill(req.authUser, bill)) {
      throw httpError(403, "You can only change bills on your own advance.");
    }
    if (!BILL_EDITABLE.includes(bill.bill_status)) {
      throw httpError(409, "Files cannot be changed after the bill is submitted.");
    }
    await pool.query(
      `DELETE FROM expense_claim_attachments WHERE id = ? AND advance_bill_id = ?`,
      [req.params.attId, bill.id]
    );
    res.json({ success: true });
  } catch (error) {
    fail(res, error, "Failed to remove the file.");
  }
});

// POST /bills/:billId/submit — send the bill into L1/L2/Final verification.
router.post("/bills/:billId/submit", async (req, res) => {
  try {
    await ensureTables();
    const bill = await loadBillOr404(req.params.billId);
    if (!canEditBill(req.authUser, bill)) {
      throw httpError(403, "You can only submit bills on your own advance.");
    }
    if (!BILL_EDITABLE.includes(bill.bill_status)) {
      throw httpError(409, "This bill has already been submitted.");
    }

    const [[attCount]] = await pool.query(
      `SELECT COUNT(*) AS c FROM expense_claim_attachments WHERE advance_bill_id = ?`,
      [bill.id]
    );
    const errors = validateBillForSubmit(bill, Number(attCount.c));
    if (errors.length) {
      throw httpError(400, "This bill cannot be submitted yet.", { rowErrors: errors });
    }

    // Freeze the verification chain from the advance's claim (frozen at its own
    // submit). L1 is required; L2 / Final may legitimately be absent.
    const [[claimRow]] = await pool.query(
      `SELECT l1_approver_user_id, l2_approver_user_id, final_approver_user_id, employee_user_id
         FROM expense_claims WHERE id = ?`,
      [bill.claim_id]
    );
    if (!claimRow || !claimRow.l1_approver_user_id) {
      throw httpError(409, "This advance has no approval chain, so its bills cannot be verified.");
    }
    if (claimRow.l1_approver_user_id === claimRow.employee_user_id) {
      throw httpError(
        409,
        "The advance holder is configured as the L1 verifier for their own bill. Ask an administrator to change the chain."
      );
    }

    const year = new Date().getFullYear();
    const refreshed = await withTransaction(async (conn) => {
      const billNumber = bill.bill_number || (await nextAdvanceBillNumber(conn, year));
      // Resubmit after a send-back: wipe prior decisions.
      await conn.query(
        `UPDATE expense_advance_bills SET
           bill_number = ?, bill_status = 'pending_l1', current_stage = 'l1',
           current_approver_user_id = ?,
           l1_approver_user_id = ?, l2_approver_user_id = ?, final_approver_user_id = ?,
           l1_approved_amount = NULL, l1_decision = NULL, l1_reason = NULL,
           l2_approved_amount = NULL, l2_decision = NULL, l2_reason = NULL,
           final_approved_amount = NULL, final_decision = NULL, final_reason = NULL,
           approved_amount = NULL, submitted_by = ?, submitted_at = NOW()
         WHERE id = ?`,
        [
          billNumber, claimRow.l1_approver_user_id,
          claimRow.l1_approver_user_id, claimRow.l2_approver_user_id, claimRow.final_approver_user_id,
          req.authUser.id, bill.id,
        ]
      );
      await writeAudit(conn, {
        claimId: bill.claim_id,
        advanceBillId: bill.id,
        actorUserId: req.authUser.id,
        actorName: actorName(req.authUser),
        stage: "employee",
        action: bill.bill_number ? "BILL_RESUBMITTED" : "BILL_SUBMITTED",
        fromStatus: bill.bill_status,
        toStatus: "pending_l1",
        newAmount: Number(bill.billing_amount || 0),
        meta: { billNumber, billId: bill.id },
      });
      const adv = await recomputeAdvance(conn, bill.claim_id);
      await notify(conn, {
        userId: claimRow.l1_approver_user_id,
        claimId: bill.claim_id,
        claimNumber: bill.advance_number,
        type: "advance_bill_pending",
        message: `Bill ${billNumber} (${formatINR(bill.billing_amount)}) on advance ${bill.advance_number} is pending your L1 verification.`,
      });
      return adv;
    });

    const bills = await loadBillsForAdvance(bill.advance_id);
    res.json({
      success: true,
      data: { bill: bills.find((b) => b.id === bill.id), advanceClosureStatus: refreshed.bill_closure_status },
    });
  } catch (error) {
    fail(res, error, "Failed to submit the bill.");
  }
});

// Shared guard for the three approver actions on a bill.
async function loadBillForApprover(billId, authUser) {
  const bill = await loadBillOr404(billId);
  if (bill.advance_employee_user_id === authUser.id) {
    throw httpError(403, "You cannot verify a bill on your own advance.");
  }
  if (!["pending_l1", "pending_l2", "pending_final"].includes(bill.bill_status)) {
    throw httpError(409, "This bill is not awaiting verification right now.");
  }
  if (bill.current_approver_user_id !== authUser.id && !isAdmin(authUser)) {
    throw httpError(403, "This bill is not assigned to you for verification.");
  }
  return bill;
}

const BILL_STATUS_TO_STAGE = {
  pending_l1: "l1",
  pending_l2: "l2",
  pending_final: "final",
};

// POST /bills/:billId/decision — approve full / partial / reject the bill amount.
router.post("/bills/:billId/decision", async (req, res) => {
  try {
    await ensureTables();
    const bill = await loadBillForApprover(req.params.billId, req.authUser);
    const stage = BILL_STATUS_TO_STAGE[bill.bill_status];
    const prefix = stage;
    const ceiling = round2(billCeiling(stage, bill));

    const kind = String(req.body?.decision || "").trim().toLowerCase();
    const reason = String(req.body?.reason ?? "").trim();
    let approved;
    if (kind === "approve_full") {
      approved = ceiling;
    } else if (kind === "reject") {
      approved = 0;
    } else if (kind === "approve_partial") {
      approved = toMoney(req.body?.approvedAmount);
      if (Number.isNaN(approved) || approved < 0) {
        throw httpError(400, "Enter a valid approved amount.");
      }
      if (approved > ceiling + 0.001) {
        throw httpError(400, `Approved amount cannot exceed ${ceiling.toFixed(2)}.`);
      }
    } else {
      throw httpError(400, "Choose Approve Full, Approve Partial or Reject.");
    }
    approved = round2(Math.min(approved, ceiling));
    const reducedHere = approved < ceiling - 0.001;
    if (reducedHere && !reason) {
      throw httpError(
        400,
        `A reason is required for a ${approved <= 0 ? "rejection" : "partial approval"}.`
      );
    }
    const normalized =
      approved <= 0 ? "rejected" : approved < ceiling - 0.001 ? "approved_partial" : "approved_full";
    const next = nextBillStage(stage, bill, bill.advance_employee_user_id);
    const finalised = next.status === "approved";

    const refreshed = await withTransaction(async (conn) => {
      const sets = [
        `${prefix}_approved_amount = ?`,
        `${prefix}_decision = ?`,
        `${prefix}_reason = ?`,
        `bill_status = ?`,
        `current_stage = ?`,
        `current_approver_user_id = ?`,
      ];
      const vals = [approved, normalized, reason || null, next.status, next.stage, next.approverId];
      if (finalised) {
        sets.push(`approved_amount = ?`);
        vals.push(approved);
      }
      await conn.query(
        `UPDATE expense_advance_bills SET ${sets.join(", ")} WHERE id = ?`,
        [...vals, bill.id]
      );
      await writeAudit(conn, {
        claimId: bill.claim_id,
        advanceBillId: bill.id,
        actorUserId: req.authUser.id,
        actorName: actorName(req.authUser),
        stage,
        action: `BILL_${BILL_STAGE_LABEL[stage].toUpperCase()}_${
          normalized === "rejected" ? "REJECTED" : "APPROVED"
        }`,
        fromStatus: bill.bill_status,
        toStatus: next.status,
        oldAmount: Number(bill.billing_amount || 0),
        newAmount: approved,
        reason: reason || null,
        meta: { billNumber: bill.bill_number, finalised, nextApproverUserId: next.approverId },
      });
      const adv = await recomputeAdvance(conn, bill.claim_id);

      // notify employee + next approver
      await notify(conn, {
        userId: bill.advance_employee_user_id,
        claimId: bill.claim_id,
        claimNumber: bill.advance_number,
        type: finalised ? "advance_bill_approved" : `advance_bill_${stage}_verified`,
        message: finalised
          ? `Bill ${bill.bill_number} on advance ${bill.advance_number} is verified — approved ${formatINR(
              approved
            )}. Remaining advance ${formatINR(adv.remaining_advance)}.`
          : `${BILL_STAGE_LABEL[stage]} verified bill ${bill.bill_number} (${formatINR(
              approved
            )}). Now pending ${BILL_STAGE_LABEL[next.stage] || next.stage} verification.`,
      });
      if (!finalised && next.approverId) {
        await notify(conn, {
          userId: next.approverId,
          claimId: bill.claim_id,
          claimNumber: bill.advance_number,
          type: "advance_bill_pending",
          message: `Bill ${bill.bill_number} (${formatINR(approved)}) is pending your ${
            BILL_STAGE_LABEL[next.stage] || next.stage
          } verification.`,
        });
      }
      return adv;
    });

    const bundle = await loadBillsForAdvance(bill.advance_id);
    res.json({
      success: true,
      data: {
        bill: bundle.find((b) => b.id === bill.id),
        advanceClosureStatus: refreshed.bill_closure_status,
        remainingAdvance: refreshed.remaining_advance,
        additionalPayable: refreshed.additional_payable,
      },
    });
  } catch (error) {
    fail(res, error, "Failed to record the verification decision.");
  }
});

// POST /bills/:billId/send-back — return the bill to the employee.
router.post("/bills/:billId/send-back", async (req, res) => {
  try {
    await ensureTables();
    const bill = await loadBillForApprover(req.params.billId, req.authUser);
    const reason = String(req.body?.reason ?? "").trim();
    if (!reason) throw httpError(400, "A reason is required when sending a bill back.");
    await withTransaction(async (conn) => {
      await conn.query(
        `UPDATE expense_advance_bills SET bill_status = 'returned', current_stage = 'employee',
           current_approver_user_id = NULL WHERE id = ?`,
        [bill.id]
      );
      await writeAudit(conn, {
        claimId: bill.claim_id,
        advanceBillId: bill.id,
        actorUserId: req.authUser.id,
        actorName: actorName(req.authUser),
        stage: BILL_STATUS_TO_STAGE[bill.bill_status],
        action: "BILL_RETURNED",
        fromStatus: bill.bill_status,
        toStatus: "returned",
        reason,
        meta: { billNumber: bill.bill_number },
      });
      await recomputeAdvance(conn, bill.claim_id);
      await notify(conn, {
        userId: bill.advance_employee_user_id,
        claimId: bill.claim_id,
        claimNumber: bill.advance_number,
        type: "advance_bill_returned",
        message: `Bill ${bill.bill_number} on advance ${bill.advance_number} was sent back: ${reason}`,
      });
    });
    const bills = await loadBillsForAdvance(bill.advance_id);
    res.json({ success: true, data: { bill: bills.find((b) => b.id === bill.id) } });
  } catch (error) {
    fail(res, error, "Failed to send the bill back.");
  }
});

// POST /bills/:billId/reject — terminal rejection (advance stays open for a new bill).
router.post("/bills/:billId/reject", async (req, res) => {
  try {
    await ensureTables();
    const bill = await loadBillForApprover(req.params.billId, req.authUser);
    const reason = String(req.body?.reason ?? "").trim();
    if (!reason) throw httpError(400, "A reason is required to reject a bill.");
    const stage = BILL_STATUS_TO_STAGE[bill.bill_status];
    await withTransaction(async (conn) => {
      await conn.query(
        `UPDATE expense_advance_bills SET
           bill_status = 'rejected', current_stage = 'done', current_approver_user_id = NULL,
           ${stage}_approved_amount = 0, ${stage}_decision = 'rejected', ${stage}_reason = ?,
           approved_amount = 0
         WHERE id = ?`,
        [reason, bill.id]
      );
      await writeAudit(conn, {
        claimId: bill.claim_id,
        advanceBillId: bill.id,
        actorUserId: req.authUser.id,
        actorName: actorName(req.authUser),
        stage,
        action: "BILL_REJECTED",
        fromStatus: bill.bill_status,
        toStatus: "rejected",
        reason,
        meta: { billNumber: bill.bill_number },
      });
      await recomputeAdvance(conn, bill.claim_id);
      await notify(conn, {
        userId: bill.advance_employee_user_id,
        claimId: bill.claim_id,
        claimNumber: bill.advance_number,
        type: "advance_bill_rejected",
        message: `Bill ${bill.bill_number} on advance ${bill.advance_number} was rejected: ${reason}. You can submit a corrected bill.`,
      });
    });
    const bills = await loadBillsForAdvance(bill.advance_id);
    res.json({ success: true, data: { bill: bills.find((b) => b.id === bill.id) } });
  } catch (error) {
    fail(res, error, "Failed to reject the bill.");
  }
});

// ===========================================================================
// MILESTONE D — Reconciliation close-out: refunds, additional payments,
// explicit closure, export, dashboard.
// ===========================================================================

// POST /:id/refunds — Finance records money the employee returned.
router.post(
  "/:id/refunds",
  (req, res, next) => (/^\d+$/.test(req.params.id) ? next() : next("route")),
  requirePagePermission(FINANCE_PAGE, "edit"),
  async (req, res) => {
    try {
      await ensureTables();
      const row = await loadAdvanceOr404(req.params.id);
      if (row.approved_amount == null) {
        throw httpError(409, "This advance is not approved — no refund can be recorded.");
      }
      const refundAmount = toMoney(req.body?.refundAmount);
      if (Number.isNaN(refundAmount) || refundAmount <= 0) {
        throw httpError(400, "Enter a refund amount greater than zero.");
      }
      const refundDate = normDate(req.body?.refundDate);
      if (!refundDate) throw httpError(400, "Enter a valid refund date (YYYY-MM-DD).");

      const rec = reconcile(row);
      if (round2(refundAmount) > round2(Math.max(rec.remainingAdvance, 0)) + 0.001) {
        throw httpError(
          400,
          `Refund ${formatINR(refundAmount)} exceeds the unspent advance ${formatINR(
            Math.max(rec.remainingAdvance, 0)
          )}.`
        );
      }

      const refundReference = String(req.body?.refundReference ?? "").trim() || null;
      const remarks = String(req.body?.remarks ?? "").trim() || null;

      const adv = await withTransaction(async (conn) => {
        await conn.query(
          `INSERT INTO expense_advance_refunds
             (advance_id, claim_id, refund_amount, refund_date, refund_reference, remarks,
              created_by, created_by_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id, row.claim_id, refundAmount, refundDate, refundReference, remarks,
            req.authUser.id, actorName(req.authUser),
          ]
        );
        const a = await recomputeAdvance(conn, row.claim_id);
        await writeAudit(conn, {
          claimId: row.claim_id,
          actorUserId: req.authUser.id,
          actorName: actorName(req.authUser),
          stage: "finance",
          action: a.bill_closure_status === "closed" ? "REFUND_RECORDED_CLOSED" : "REFUND_RECORDED",
          newAmount: refundAmount,
          reason: remarks,
          meta: { refundReference, refundDate, totalRefunded: a.total_refunded, remaining: a.remaining_advance },
        });
        await notify(conn, {
          userId: row.claim_employee_user_id,
          claimId: row.claim_id,
          claimNumber: row.claim_number,
          type: "advance_refund_recorded",
          message:
            a.bill_closure_status === "closed"
              ? `Refund of ${formatINR(refundAmount)} received on advance ${row.claim_number} — now closed.`
              : `Refund of ${formatINR(refundAmount)} recorded on advance ${row.claim_number}. Remaining ${formatINR(
                  a.remaining_advance
                )}.`,
        });
        return a;
      });

      res.json({ success: true, data: { advance: mapAdvanceRow({ ...row, ...adv }) } });
    } catch (error) {
      fail(res, error, "Failed to record the refund.");
    }
  }
);

// POST /:id/additional-payments — Finance pays the employee more when approved
// bills exceeded the advance.
router.post(
  "/:id/additional-payments",
  (req, res, next) => (/^\d+$/.test(req.params.id) ? next() : next("route")),
  requirePagePermission(FINANCE_PAGE, "edit"),
  async (req, res) => {
    try {
      await ensureTables();
      const row = await loadAdvanceOr404(req.params.id);
      const rec = reconcile(row);
      if (rec.additionalPayable <= 0.001) {
        throw httpError(409, "No additional payment is due on this advance.");
      }
      const amount = toMoney(req.body?.amount);
      if (Number.isNaN(amount) || amount <= 0) {
        throw httpError(400, "Enter an amount greater than zero.");
      }
      const paymentDate = normDate(req.body?.paymentDate);
      if (!paymentDate) throw httpError(400, "Enter a valid payment date (YYYY-MM-DD).");
      if (round2(amount) > round2(rec.additionalPayable) + 0.001) {
        throw httpError(
          400,
          `Amount ${formatINR(amount)} exceeds the additional payable ${formatINR(rec.additionalPayable)}.`
        );
      }
      const paymentReference = String(req.body?.paymentReference ?? "").trim() || null;
      const utrReference = String(req.body?.utrReference ?? "").trim() || null;
      const remarks = String(req.body?.remarks ?? "").trim() || null;

      const adv = await withTransaction(async (conn) => {
        await conn.query(
          `INSERT INTO expense_advance_additional_payments
             (advance_id, claim_id, amount, payment_date, payment_reference, utr_reference,
              remarks, created_by, created_by_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id, row.claim_id, amount, paymentDate, paymentReference, utrReference,
            remarks, req.authUser.id, actorName(req.authUser),
          ]
        );
        const a = await recomputeAdvance(conn, row.claim_id);
        await writeAudit(conn, {
          claimId: row.claim_id,
          actorUserId: req.authUser.id,
          actorName: actorName(req.authUser),
          stage: "finance",
          action:
            a.bill_closure_status === "closed"
              ? "ADDITIONAL_PAYMENT_RECORDED_CLOSED"
              : "ADDITIONAL_PAYMENT_RECORDED",
          newAmount: amount,
          reason: remarks,
          meta: { paymentReference, utrReference, paymentDate, totalAdditionalPaid: a.total_additional_paid },
        });
        await notify(conn, {
          userId: row.claim_employee_user_id,
          claimId: row.claim_id,
          claimNumber: row.claim_number,
          type: "advance_additional_payment",
          message: `Additional payment of ${formatINR(amount)} on advance ${row.claim_number}${
            a.bill_closure_status === "closed" ? " — now closed." : "."
          }`,
        });
        return a;
      });

      res.json({ success: true, data: { advance: mapAdvanceRow({ ...row, ...adv }) } });
    } catch (error) {
      fail(res, error, "Failed to record the additional payment.");
    }
  }
);

// POST /:id/finalize-bills — the advance holder declares "no more bills".
router.post("/:id/finalize-bills", async (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next();
  try {
    await ensureTables();
    const row = await loadAdvanceOr404(req.params.id);
    if (
      !(
        isAdmin(req.authUser) ||
        row.claim_employee_user_id === req.authUser.id ||
        row.created_by === req.authUser.id
      )
    ) {
      throw httpError(403, "Only the advance holder (or who raised it) can finalise bills.");
    }
    if (row.approved_amount == null) throw httpError(409, "This advance is not approved yet.");
    if (row.bill_closure_status === "closed") throw httpError(409, "This advance is already closed.");

    const [[open]] = await pool.query(
      `SELECT COUNT(*) AS c FROM expense_advance_bills
        WHERE advance_id = ? AND bill_status IN ('draft','pending_l1','pending_l2','pending_final','returned')`,
      [row.id]
    );
    if (Number(open.c) > 0) {
      throw httpError(409, "Submit or remove every draft / pending bill before finalising.");
    }

    const adv = await withTransaction(async (conn) => {
      await conn.query(`UPDATE expense_advances SET bills_finalized = 1 WHERE id = ?`, [row.id]);
      const a = await recomputeAdvance(conn, row.claim_id);
      await writeAudit(conn, {
        claimId: row.claim_id,
        actorUserId: req.authUser.id,
        actorName: actorName(req.authUser),
        stage: "finance",
        action: "BILLS_FINALIZED",
        toStatus: a.bill_closure_status,
        meta: { remaining: a.remaining_advance, additionalPayable: a.additional_payable },
      });
      return a;
    });
    res.json({ success: true, data: { advance: mapAdvanceRow({ ...row, ...adv }) } });
  } catch (error) {
    fail(res, error, "Failed to finalise bills.");
  }
});

// GET /export — advance-level + bill-level Excel with secure bill hyperlinks.
router.get("/export", async (req, res, next) => {
  if (req.params.id) return next();
  try {
    await ensureTables();
    if (
      !(
        isAdmin(req.authUser) ||
        hasPagePermission(req.authUser, ADVANCES_PAGE, "download") ||
        hasPagePermission(req.authUser, FINANCE_PAGE, "download")
      )
    ) {
      return res
        .status(403)
        .json({ success: false, message: "You do not have permission to export advances." });
    }

    const baseUrl = process.env.PUBLIC_API_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const docUrl = (token) => `${baseUrl}/api/expense-documents/${token}`;

    const [advs] = await pool.query(
      `SELECT a.*, c.claim_number, c.employee_name, c.employee_code, c.department,
              c.cost_centre AS cmp, c.submitted_at
         FROM expense_advances a JOIN expense_claims c ON c.id = a.claim_id
        ORDER BY a.id DESC`
    );
    const [bills] = await pool.query(
      `SELECT b.*, c.claim_number AS advance_number,
              (SELECT att.access_token FROM expense_claim_attachments att
                WHERE att.advance_bill_id = b.id ORDER BY att.id ASC LIMIT 1) AS token
         FROM expense_advance_bills b JOIN expense_claims c ON c.id = b.claim_id
        ORDER BY b.id DESC`
    );

    const advSheet = {
      name: "Advances",
      headers: [
        "Advance No", "Employee", "Employee ID", "Department", "CMP", "Requested", "Approved",
        "Paid", "Approved Bills", "Refunded", "Additional Paid", "Remaining", "Payment Status",
        "Bill Closure", "Created", "Closed",
      ],
      rows: advs.map((a) => ({
        cells: [
          a.claim_number, a.employee_name, a.employee_code, a.department, a.cmp,
          Number(a.requested_amount || 0),
          a.approved_amount == null ? "" : Number(a.approved_amount),
          Number(a.total_paid || 0), Number(a.total_approved_bills || 0),
          Number(a.total_refunded || 0), Number(a.total_additional_paid || 0),
          round2(Number(a.total_paid || 0) + Number(a.total_additional_paid || 0) -
            Number(a.total_approved_bills || 0) - Number(a.total_refunded || 0)),
          a.payment_status, a.bill_closure_status,
          a.created_at ? String(a.created_at).slice(0, 10) : "",
          a.closed_at ? String(a.closed_at).slice(0, 10) : "",
        ],
      })),
    };
    const billSheet = {
      name: "Advance Bills",
      headers: [
        "Advance No", "Bill No", "PO No", "JMS ID", "SG Invoice No", "SG Invoice Date",
        "Service Month", "Billing Amount", "Approved Amount", "Bill Status", "Document",
      ],
      rows: bills.map((b) => ({
        cells: [
          b.advance_number, b.bill_number, b.po_number, b.jms_id, b.sg_invoice_no,
          b.sg_invoice_date ? String(b.sg_invoice_date).slice(0, 10) : "",
          b.service_month, Number(b.billing_amount || 0),
          b.approved_amount == null ? "" : Number(b.approved_amount),
          b.bill_status, b.token ? "Open document" : "",
        ],
        links: b.token ? { 10: { name: "Open document", url: docUrl(b.token) } } : {},
      })),
    };

    const buf = await buildLinkedWorkbook([advSheet, billSheet]);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="advances_${new Date().toISOString().slice(0, 10)}.xlsx"`
    );
    res.send(Buffer.from(buf));
  } catch (error) {
    fail(res, error, "Failed to export advances.");
  }
});

// GET /dashboard — aggregate cards for the Expense Dashboard "Advances" block.
router.get("/dashboard", async (req, res, next) => {
  if (req.params.id) return next();
  try {
    await ensureTables();
    const [[cards]] = await pool.query(
      `SELECT
         COUNT(*) AS totalAdvances,
         SUM(payment_status = 'not_paid') AS notPaid,
         SUM(payment_status = 'partially_paid') AS partiallyPaid,
         SUM(payment_status = 'fully_paid') AS fullyPaid,
         SUM(bill_closure_status = 'open') AS closureOpen,
         SUM(bill_closure_status = 'under_verification') AS underVerification,
         SUM(bill_closure_status = 'refund_pending') AS refundPending,
         SUM(bill_closure_status = 'additional_payment_pending') AS additionalPending,
         SUM(bill_closure_status = 'closed') AS closed,
         COALESCE(SUM(requested_amount), 0) AS totalRequested,
         COALESCE(SUM(approved_amount), 0) AS totalApproved,
         COALESCE(SUM(total_paid), 0) AS totalPaid,
         COALESCE(SUM(total_approved_bills), 0) AS totalBilled,
         COALESCE(SUM(total_refunded), 0) AS totalRefunded,
         COALESCE(SUM(total_additional_paid), 0) AS totalAdditional
       FROM expense_advances`
    );
    const n = (v) => Number(v || 0);
    res.json({
      success: true,
      data: {
        totalAdvances: n(cards.totalAdvances),
        payment: {
          notPaid: n(cards.notPaid),
          partiallyPaid: n(cards.partiallyPaid),
          fullyPaid: n(cards.fullyPaid),
        },
        closure: {
          open: n(cards.closureOpen),
          underVerification: n(cards.underVerification),
          refundPending: n(cards.refundPending),
          additionalPending: n(cards.additionalPending),
          closed: n(cards.closed),
        },
        money: {
          requested: n(cards.totalRequested),
          approved: n(cards.totalApproved),
          paid: n(cards.totalPaid),
          billed: n(cards.totalBilled),
          refunded: n(cards.totalRefunded),
          additional: n(cards.totalAdditional),
        },
      },
    });
  } catch (error) {
    fail(res, error, "Failed to load the advances dashboard.");
  }
});

module.exports = router;
