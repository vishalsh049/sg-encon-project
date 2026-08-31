// -----------------------------------------------------------------------------
// Expense Claims — employee reimbursement claim workflow.
//
// PHASE 1 scope: employee raises a claim (1 claim = many expense items), uploads
// a bill per item, saves drafts, and submits. Submission locks the claim, mints
// a permanent claim number (EXP-YYYY-000001) and hands it to L1.
//
// Approval actions (L1/L2/Final), finance processing, export, dashboard, policy
// engine and the matrix admin UI arrive in later phases. The tables and most
// columns for those phases are created here so later phases are additive only.
//
// This module is independent of backend/routes/expenseRoutes.js (the operational
// spend tracker). Nothing is shared.
// -----------------------------------------------------------------------------

const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");

const router = express.Router();

const { db } = require("../config/db");
const { authMiddleware } = require("../middleware/circleAccess");
const { requirePagePermission } = require("../middleware/pagePermission");
const {
  DEFAULT_CATEGORIES,
  DEFAULT_SUB_CATEGORIES,
  DEFAULT_COST_CENTRES,
  EMPLOYEE_EDITABLE_STATUSES,
  ALLOWED_BILL_EXTENSIONS,
  ALLOWED_BILL_MIME_TYPES,
  MAX_BILL_BYTES,
  PAGE_IDS,
} = require("../constants/expenseClaimConstants");

router.use(authMiddleware);

const pool = db.promise();
const PAGE = PAGE_IDS.employee; // "my-expenses"

// ---------------------------------------------------------------------------
// Table setup — idempotent, run once per process. DDL is never issued inside a
// transaction (MySQL/MariaDB implicitly commit on DDL).
// ---------------------------------------------------------------------------

let ensureTablesPromise = null;
function ensureTables() {
  if (!ensureTablesPromise) {
    ensureTablesPromise = ensureTablesOnce().catch((error) => {
      ensureTablesPromise = null;
      throw error;
    });
  }
  return ensureTablesPromise;
}

async function ensureTablesOnce() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_claim_categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      display_order INT NOT NULL DEFAULT 0,
      requires_bill TINYINT(1) NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_claim_sub_categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      category_id INT NOT NULL,
      name VARCHAR(100) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_sub_cat (category_id, name),
      INDEX idx_sub_cat_category (category_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_cost_centres (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE,
      code VARCHAR(40) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_claim_sequences (
      year INT NOT NULL PRIMARY KEY,
      last_no INT NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_claims (
      id INT AUTO_INCREMENT PRIMARY KEY,
      claim_number VARCHAR(30) NULL UNIQUE,
      employee_user_id INT NOT NULL,
      employee_name VARCHAR(160) NULL,
      employee_code VARCHAR(60) NULL,
      department VARCHAR(120) NULL,
      designation VARCHAR(120) NULL,
      circle VARCHAR(120) NULL,
      cost_centre VARCHAR(120) NULL,
      purpose VARCHAR(300) NULL,
      period_from DATE NULL,
      period_to DATE NULL,
      remarks VARCHAR(1000) NULL,
      total_claimed DECIMAL(14,2) NOT NULL DEFAULT 0,
      l1_approved_total DECIMAL(14,2) NULL,
      l2_approved_total DECIMAL(14,2) NULL,
      final_approved_total DECIMAL(14,2) NULL,
      current_status VARCHAR(24) NOT NULL DEFAULT 'draft',
      current_stage VARCHAR(16) NOT NULL DEFAULT 'employee',
      l1_approver_user_id INT NULL,
      l2_approver_user_id INT NULL,
      final_approver_user_id INT NULL,
      current_approver_user_id INT NULL,
      created_by INT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      submitted_at DATETIME NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_claim_employee (employee_user_id),
      INDEX idx_claim_status (current_status),
      INDEX idx_claim_current_approver (current_approver_user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_claim_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      claim_id INT NOT NULL,
      sr_no INT NOT NULL DEFAULT 1,
      expense_date DATE NULL,
      category VARCHAR(100) NOT NULL,
      sub_category VARCHAR(100) NULL,
      description VARCHAR(500) NULL,
      claimed_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      bill_number VARCHAR(120) NULL,
      bill_date DATE NULL,
      l1_approved_amount DECIMAL(12,2) NULL,
      l1_decision VARCHAR(20) NULL,
      l1_reason VARCHAR(500) NULL,
      l2_approved_amount DECIMAL(12,2) NULL,
      l2_decision VARCHAR(20) NULL,
      l2_reason VARCHAR(500) NULL,
      final_approved_amount DECIMAL(12,2) NULL,
      final_decision VARCHAR(20) NULL,
      final_reason VARCHAR(500) NULL,
      policy_exception TINYINT(1) NOT NULL DEFAULT 0,
      status VARCHAR(24) NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_item_claim (claim_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_claim_attachments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      claim_id INT NOT NULL,
      item_id INT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_type VARCHAR(100) NOT NULL,
      file_size INT NOT NULL DEFAULT 0,
      file_data LONGBLOB NOT NULL,
      checksum VARCHAR(64) NULL,
      uploaded_by INT NULL,
      uploaded_by_name VARCHAR(160) NULL,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_att_claim (claim_id),
      INDEX idx_att_item (item_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_claim_audit (
      id INT AUTO_INCREMENT PRIMARY KEY,
      claim_id INT NOT NULL,
      actor_user_id INT NULL,
      actor_name VARCHAR(160) NULL,
      stage VARCHAR(16) NULL,
      action VARCHAR(60) NOT NULL,
      from_status VARCHAR(24) NULL,
      to_status VARCHAR(24) NULL,
      item_id INT NULL,
      old_amount DECIMAL(12,2) NULL,
      new_amount DECIMAL(12,2) NULL,
      reason VARCHAR(1000) NULL,
      meta LONGTEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_claim (claim_id)
    )
  `);

  // Phase 5 — one row per claim, created when the claim reaches final approval.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_claim_finance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      claim_id INT NOT NULL UNIQUE,
      finance_status VARCHAR(16) NOT NULL DEFAULT 'pending',
      payment_reference VARCHAR(120) NULL,
      payment_date DATE NULL,
      finance_remarks VARCHAR(1000) NULL,
      processed_by VARCHAR(160) NULL,
      processed_by_user_id INT NULL,
      processed_at DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_finance_status (finance_status)
    )
  `);

  // Phase 10 — in-portal notifications.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_claim_notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      claim_id INT NULL,
      claim_number VARCHAR(30) NULL,
      type VARCHAR(40) NOT NULL,
      message VARCHAR(400) NOT NULL,
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_notif_user (user_id, is_read),
      INDEX idx_notif_created (created_at)
    )
  `);

  // Phase 8 — policy engine.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_policies (
      id INT AUTO_INCREMENT PRIMARY KEY,
      category VARCHAR(100) NOT NULL,
      sub_category VARCHAR(100) NULL,
      period VARCHAR(10) NOT NULL DEFAULT 'day',
      max_amount DECIMAL(12,2) NOT NULL,
      hard_limit TINYINT(1) NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // Phase 9 — full admin UI later; seeded with a catch-all row so Phase 1
  // submissions can resolve an approver.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_approval_matrix (
      id INT AUTO_INCREMENT PRIMARY KEY,
      category VARCHAR(100) NOT NULL DEFAULT 'ALL',
      min_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      max_amount DECIMAL(14,2) NULL,
      l1_user_id INT NULL,
      l2_user_id INT NULL,
      final_user_id INT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await seedMasters();
}

async function seedMasters() {
  const [catCount] = await pool.query(`SELECT COUNT(*) AS c FROM expense_claim_categories`);
  if (catCount[0].c === 0) {
    const values = DEFAULT_CATEGORIES.map((cat, index) => [cat.name, index, cat.requiresBill]);
    await pool.query(
      `INSERT INTO expense_claim_categories (name, display_order, requires_bill) VALUES ?`,
      [values]
    );
    const [cats] = await pool.query(`SELECT id, name FROM expense_claim_categories`);
    const subRows = [];
    cats.forEach((cat) => {
      (DEFAULT_SUB_CATEGORIES[cat.name] || []).forEach((sub) => subRows.push([cat.id, sub]));
    });
    if (subRows.length) {
      await pool.query(
        `INSERT INTO expense_claim_sub_categories (category_id, name) VALUES ?`,
        [subRows]
      );
    }
  }

  const [ccCount] = await pool.query(`SELECT COUNT(*) AS c FROM expense_cost_centres`);
  if (ccCount[0].c === 0) {
    await pool.query(
      `INSERT INTO expense_cost_centres (name, code) VALUES ?`,
      [DEFAULT_COST_CENTRES.map((cc) => [cc.name, cc.code])]
    );
  }

  const [matrixCount] = await pool.query(`SELECT COUNT(*) AS c FROM expense_approval_matrix`);
  if (matrixCount[0].c === 0) {
    // Seed the catch-all rule with NO approvers — an admin must pick them on the
    // Expense Master Data page. Until then, submitting a claim is blocked with a
    // clear message rather than silently routing to some default person.
    await pool.query(
      `INSERT INTO expense_approval_matrix (category, min_amount, max_amount, l1_user_id, l2_user_id, final_user_id)
       VALUES ('ALL', 0, NULL, NULL, NULL, NULL)`
    );
  }
}

async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.query("SET time_zone = '+05:30'");
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (error) {
    try {
      await conn.rollback();
    } catch (rollbackError) {
      console.error("Expense-claim rollback failed:", rollbackError.message);
    }
    throw error;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isAdmin = (authUser) =>
  String(authUser?.roleName || "").trim().toLowerCase() === "admin";

function httpError(statusCode, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (details) error.details = details;
  return error;
}

function fail(res, error, fallback = "Request failed.") {
  const status = error.statusCode || 500;
  if (status >= 500) console.error("EXPENSE CLAIM API ERROR:", error);
  res.status(status).json({
    success: false,
    message: error.statusCode ? error.message : fallback,
    ...(error.details ? { details: error.details } : {}),
  });
}

function actorName(authUser) {
  return authUser?.name || authUser?.username || authUser?.email || "system";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function normalizeDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim().slice(0, 10);
  if (!DATE_RE.test(text)) return undefined; // sentinel: present but unparseable
  const d = new Date(`${text}T00:00:00`);
  if (Number.isNaN(d.getTime())) return undefined;
  return text;
}

function toMoney(value) {
  const n = Number(String(value ?? "").replace(/[,\s₹]/g, ""));
  return Number.isFinite(n) ? Number(n.toFixed(2)) : NaN;
}

function round2(n) {
  return Number(Number(n || 0).toFixed(2));
}

function formatINR(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

async function loadEmployeeProfile(userId) {
  const [rows] = await pool.query(
    `SELECT id, name, employee_id, department, designation, circle, domain, email, mobile
     FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

// Snapshot of the controlled employee-master fields, taken from the users table
// at create/submit time. The client can never set these.
function employeeSnapshot(profile, authUser) {
  return {
    employee_user_id: authUser.id,
    employee_name: profile?.name || authUser.name || null,
    employee_code: profile?.employee_id || null,
    department: profile?.department || null,
    designation: profile?.designation || authUser.designation || null,
    circle: profile?.circle || authUser.circle || null,
  };
}

async function getActiveCategories() {
  const [rows] = await pool.query(
    `SELECT name, requires_bill FROM expense_claim_categories
     WHERE is_active = 1 ORDER BY display_order ASC, name ASC`
  );
  return rows;
}

// Validate one incoming item. `strict` (submit) also requires a real date and
// a positive amount; draft save is lenient so half-filled rows can be kept.
function validateItem(raw, index, categoryNames, { strict }) {
  const errors = [];
  const label = `Row ${index + 1}`;

  const category = String(raw?.category || "").trim();
  if (!category) {
    errors.push(`${label}: Expense Category is required.`);
  } else if (categoryNames.length && !categoryNames.includes(category)) {
    errors.push(`${label}: "${category}" is not a valid Expense Category.`);
  }

  const expenseDate = normalizeDate(raw?.expenseDate ?? raw?.expense_date);
  if (expenseDate === undefined) {
    errors.push(`${label}: Expense Date is not a valid date.`);
  } else if (strict && !expenseDate) {
    errors.push(`${label}: Expense Date is required.`);
  }

  const billDate = normalizeDate(raw?.billDate ?? raw?.bill_date);
  if (billDate === undefined) errors.push(`${label}: Bill Date is not a valid date.`);

  const amount = toMoney(raw?.claimedAmount ?? raw?.claimed_amount);
  if (Number.isNaN(amount)) {
    errors.push(`${label}: Claimed Amount must be a number.`);
  } else if (amount < 0) {
    errors.push(`${label}: Claimed Amount cannot be negative.`);
  } else if (strict && amount <= 0) {
    errors.push(`${label}: Claimed Amount must be greater than zero.`);
  }

  return {
    errors,
    value: {
      id: Number(raw?.id) || null,
      srNo: Number(raw?.srNo || raw?.sr_no || index + 1),
      expenseDate: expenseDate || null,
      category,
      subCategory: String(raw?.subCategory ?? raw?.sub_category ?? "").trim() || null,
      description: String(raw?.description ?? "").trim() || null,
      claimedAmount: Number.isNaN(amount) ? 0 : amount,
      billNumber: String(raw?.billNumber ?? raw?.bill_number ?? "").trim() || null,
      billDate: billDate || null,
    },
  };
}

function mapClaim(row) {
  return {
    id: row.id,
    claimNumber: row.claim_number,
    employeeUserId: row.employee_user_id,
    employeeName: row.employee_name,
    employeeCode: row.employee_code,
    department: row.department,
    designation: row.designation,
    circle: row.circle,
    costCentre: row.cost_centre,
    purpose: row.purpose,
    periodFrom: row.period_from,
    periodTo: row.period_to,
    remarks: row.remarks,
    totalClaimed: Number(row.total_claimed || 0),
    l1ApprovedTotal: row.l1_approved_total === null ? null : Number(row.l1_approved_total),
    l2ApprovedTotal: row.l2_approved_total === null ? null : Number(row.l2_approved_total),
    finalApprovedTotal: row.final_approved_total === null ? null : Number(row.final_approved_total),
    status: row.current_status,
    stage: row.current_stage,
    l1ApproverUserId: row.l1_approver_user_id,
    l2ApproverUserId: row.l2_approver_user_id,
    finalApproverUserId: row.final_approver_user_id,
    currentApproverUserId: row.current_approver_user_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
  };
}

function mapItem(row) {
  return {
    id: row.id,
    claimId: row.claim_id,
    srNo: row.sr_no,
    expenseDate: row.expense_date,
    category: row.category,
    subCategory: row.sub_category,
    description: row.description,
    claimedAmount: Number(row.claimed_amount || 0),
    billNumber: row.bill_number,
    billDate: row.bill_date,
    l1ApprovedAmount: row.l1_approved_amount === null ? null : Number(row.l1_approved_amount),
    l1Decision: row.l1_decision,
    l1Reason: row.l1_reason,
    l2ApprovedAmount: row.l2_approved_amount === null ? null : Number(row.l2_approved_amount),
    l2Decision: row.l2_decision,
    l2Reason: row.l2_reason,
    finalApprovedAmount: row.final_approved_amount === null ? null : Number(row.final_approved_amount),
    finalDecision: row.final_decision,
    finalReason: row.final_reason,
    policyException: Boolean(row.policy_exception),
    status: row.status,
  };
}

function mapAttachment(row) {
  return {
    id: row.id,
    claimId: row.claim_id,
    itemId: row.item_id,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: row.file_size,
    uploadedBy: row.uploaded_by,
    uploadedByName: row.uploaded_by_name,
    uploadedAt: row.uploaded_at,
  };
}

function mapAudit(row) {
  let meta = null;
  if (row.meta) {
    try {
      meta = JSON.parse(row.meta);
    } catch {
      meta = null;
    }
  }
  return {
    id: row.id,
    claimId: row.claim_id,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    stage: row.stage,
    action: row.action,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    itemId: row.item_id,
    oldAmount: row.old_amount === null ? null : Number(row.old_amount),
    newAmount: row.new_amount === null ? null : Number(row.new_amount),
    reason: row.reason,
    meta,
    createdAt: row.created_at,
  };
}

async function writeAudit(conn, entry) {
  await conn.query(
    `INSERT INTO expense_claim_audit
       (claim_id, actor_user_id, actor_name, stage, action, from_status, to_status,
        item_id, old_amount, new_amount, reason, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.claimId,
      entry.actorUserId ?? null,
      entry.actorName ?? null,
      entry.stage ?? null,
      entry.action,
      entry.fromStatus ?? null,
      entry.toStatus ?? null,
      entry.itemId ?? null,
      entry.oldAmount ?? null,
      entry.newAmount ?? null,
      entry.reason ?? null,
      entry.meta ? JSON.stringify(entry.meta) : null,
    ]
  );
}

// Writes an in-portal notification. No-op when there is no recipient.
async function notify(conn, { userId, claimId, claimNumber, type, message }) {
  if (!userId) return;
  await conn.query(
    `INSERT INTO expense_claim_notifications (user_id, claim_id, claim_number, type, message)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, claimId ?? null, claimNumber ?? null, type, String(message).slice(0, 400)]
  );
}

async function getActivePolicies() {
  const [rows] = await pool.query(
    `SELECT id, category, sub_category, period, max_amount, hard_limit
     FROM expense_policies WHERE is_active = 1`
  );
  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    subCategory: r.sub_category,
    period: r.period,
    maxAmount: Number(r.max_amount),
    hardLimit: Boolean(r.hard_limit),
  }));
}

// Evaluate every item against the active policies. `items` carry
// { category, subCategory, expenseDate, claimedAmount } (camel or snake).
function evaluatePolicies(items, policies) {
  const norm = (v) => String(v ?? "").trim().toLowerCase();
  const results = []; // { index, message, hard }

  items.forEach((raw, index) => {
    const category = raw.category;
    const subCategory = raw.subCategory ?? raw.sub_category ?? null;
    const amount = Number(raw.claimedAmount ?? raw.claimed_amount ?? 0);
    const date = raw.expenseDate ?? raw.expense_date ?? null;

    const matches = policies.filter(
      (p) =>
        norm(p.category) === norm(category) &&
        (!p.subCategory || norm(p.subCategory) === norm(subCategory))
    );

    matches.forEach((p) => {
      let compareValue = amount;
      let scope = "per entry";
      if (p.period === "day") {
        scope = "per day";
        compareValue = items.reduce((sum, other) => {
          const oCat = other.category;
          const oSub = other.subCategory ?? other.sub_category ?? null;
          const oDate = other.expenseDate ?? other.expense_date ?? null;
          if (
            norm(oCat) === norm(category) &&
            (!p.subCategory || norm(oSub) === norm(subCategory)) &&
            String(oDate) === String(date)
          ) {
            return sum + Number(other.claimedAmount ?? other.claimed_amount ?? 0);
          }
          return sum;
        }, 0);
      }
      if (compareValue > p.maxAmount + 0.001) {
        results.push({
          index,
          hard: p.hardLimit,
          message: `Row ${index + 1}: ${category}${
            p.subCategory ? ` / ${p.subCategory}` : ""
          } ${scope} total ${compareValue.toFixed(2)} exceeds the policy limit of ${p.maxAmount.toFixed(2)}.`,
        });
      }
    });
  });

  return results;
}

// Atomic per-year counter. Runs on the transaction's connection so the row lock
// from the UPDATE is held until the claim row is written.
async function nextClaimNumber(conn, year) {
  await conn.query(
    `INSERT INTO expense_claim_sequences (year, last_no) VALUES (?, 1)
     ON DUPLICATE KEY UPDATE last_no = last_no + 1`,
    [year]
  );
  const [rows] = await conn.query(
    `SELECT last_no FROM expense_claim_sequences WHERE year = ?`,
    [year]
  );
  const seq = rows[0].last_no;
  return `EXP-${year}-${String(seq).padStart(6, "0")}`;
}

async function resolveApprovers(conn, category, amount) {
  const [rows] = await conn.query(
    `SELECT l1_user_id, l2_user_id, final_user_id
     FROM expense_approval_matrix
     WHERE is_active = 1
       AND (category = 'ALL' OR category = ?)
       AND min_amount <= ?
       AND (max_amount IS NULL OR max_amount >= ?)
     ORDER BY (category = 'ALL') ASC, min_amount DESC
     LIMIT 1`,
    [category, amount, amount]
  );
  return rows[0] || null;
}

async function fetchClaimBundle(claimId) {
  const [claimRows] = await pool.query(`SELECT * FROM expense_claims WHERE id = ?`, [claimId]);
  const claim = claimRows[0];
  if (!claim) return null;

  const [items] = await pool.query(
    `SELECT * FROM expense_claim_items WHERE claim_id = ? ORDER BY sr_no ASC, id ASC`,
    [claimId]
  );
  const [attachments] = await pool.query(
    `SELECT id, claim_id, item_id, file_name, file_type, file_size, uploaded_by,
            uploaded_by_name, uploaded_at
     FROM expense_claim_attachments WHERE claim_id = ? ORDER BY id ASC`,
    [claimId]
  );
  const [audit] = await pool.query(
    `SELECT * FROM expense_claim_audit WHERE claim_id = ? ORDER BY created_at ASC, id ASC`,
    [claimId]
  );
  const [financeRows] = await pool.query(
    `SELECT * FROM expense_claim_finance WHERE claim_id = ?`,
    [claimId]
  );

  return {
    claim: mapClaim(claim),
    items: items.map(mapItem),
    attachments: attachments.map(mapAttachment),
    audit: audit.map(mapAudit),
    finance: financeRows[0] ? mapFinance(financeRows[0]) : null,
  };
}

function mapFinance(row) {
  return {
    claimId: row.claim_id,
    financeStatus: row.finance_status,
    paymentReference: row.payment_reference,
    paymentDate: row.payment_date,
    financeRemarks: row.finance_remarks,
    processedBy: row.processed_by,
    processedByUserId: row.processed_by_user_id,
    processedAt: row.processed_at,
    updatedAt: row.updated_at,
  };
}

// Can `authUser` see this claim? Phase 1: the owner, an admin, or a user who is
// on the approval chain / assigned as current approver.
function canViewClaim(authUser, claimRow) {
  if (isAdmin(authUser)) return true;
  if (claimRow.employee_user_id === authUser.id) return true;
  return [
    claimRow.current_approver_user_id,
    claimRow.l1_approver_user_id,
    claimRow.l2_approver_user_id,
    claimRow.final_approver_user_id,
  ].includes(authUser.id);
}

// ---------------------------------------------------------------------------
// Upload handling
// ---------------------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BILL_BYTES, files: 1 },
});

// Multer surfaces errors via next(err), which in Express 5 skips the route's
// own try/catch and lands on the default (HTML 500) handler. Wrap it so a
// too-large / malformed upload returns a clean JSON 400 instead.
function billUpload(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (!err) return next();
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "File exceeds the 10 MB limit."
        : err.message || "Bill upload failed.";
    return res.status(400).json({ success: false, message });
  });
}

function assertValidBill(file) {
  if (!file) throw httpError(400, "Please choose a bill file to upload.");
  const ext = (file.originalname.split(".").pop() || "").toLowerCase();
  if (!ALLOWED_BILL_EXTENSIONS.includes(ext)) {
    throw httpError(
      400,
      `Unsupported file type ".${ext}". Allowed: ${ALLOWED_BILL_EXTENSIONS.join(", ").toUpperCase()}.`
    );
  }
  if (file.mimetype && !ALLOWED_BILL_MIME_TYPES.includes(file.mimetype)) {
    throw httpError(400, `Unsupported file content (${file.mimetype}). Upload a PDF, JPG or PNG.`);
  }
  if (file.size > MAX_BILL_BYTES) {
    throw httpError(400, `File is ${(file.size / 1048576).toFixed(1)} MB — the limit is 10 MB.`);
  }
}

// ---------------------------------------------------------------------------
// Routes — meta
// ---------------------------------------------------------------------------

router.get("/meta", requirePagePermission(PAGE, "view"), async (req, res) => {
  try {
    await ensureTables();

    const [categories, subCatRows, costCentres, profile, policies] = await Promise.all([
      getActiveCategories(),
      pool.query(
        `SELECT s.name, c.name AS category
         FROM expense_claim_sub_categories s
         JOIN expense_claim_categories c ON c.id = s.category_id
         WHERE s.is_active = 1 ORDER BY c.display_order ASC, s.name ASC`
      ),
      pool.query(
        `SELECT name, code FROM expense_cost_centres WHERE is_active = 1 ORDER BY name ASC`
      ),
      loadEmployeeProfile(req.authUser.id),
      getActivePolicies(),
    ]);

    const subCategories = {};
    subCatRows[0].forEach((row) => {
      if (!subCategories[row.category]) subCategories[row.category] = [];
      subCategories[row.category].push(row.name);
    });

    res.json({
      success: true,
      data: {
        categories: categories.map((c) => ({ name: c.name, requiresBill: Boolean(c.requires_bill) })),
        subCategories,
        costCentres: costCentres[0].map((c) => c.name),
        policies: policies.map((p) => ({
          category: p.category,
          subCategory: p.subCategory,
          period: p.period,
          maxAmount: p.maxAmount,
          hardLimit: p.hardLimit,
        })),
        myProfile: {
          employeeName: profile?.name || req.authUser.name || "",
          employeeCode: profile?.employee_id || "",
          department: profile?.department || "",
          designation: profile?.designation || req.authUser.designation || "",
          circle: profile?.circle || req.authUser.circle || "",
          email: profile?.email || req.authUser.email || "",
          mobile: profile?.mobile || "",
        },
        allowedFileTypes: ALLOWED_BILL_EXTENSIONS,
        maxFileBytes: MAX_BILL_BYTES,
      },
    });
  } catch (error) {
    fail(res, error, "Failed to load Expense Claims metadata.");
  }
});

// GET /api/expense-claims/employee-lookup?code=SG15392
// Auto-fills the claim's employee identity from the Physical employee master.
router.get("/employee-lookup", requirePagePermission(PAGE, "view"), async (req, res) => {
  try {
    await ensureTables();
    const code = String(req.query.code || "").trim();
    if (!code) throw httpError(400, "Enter an Employee ID / HRMS ID to look up.");
    const emp = await lookupPhysicalEmployee(code);
    if (!emp) throw httpError(404, `No employee found for ID "${code}".`);
    res.json({ success: true, data: emp });
  } catch (error) {
    fail(res, error, "Employee lookup failed.");
  }
});

// ---------------------------------------------------------------------------
// Routes — list / detail
// ---------------------------------------------------------------------------

const TAB_STATUS_MAP = {
  draft: ["draft"],
  submitted: ["pending_l1", "pending_l2", "pending_final"],
  "pending approval": ["pending_l1", "pending_l2", "pending_final"],
  returned: ["returned"],
  approved: ["final_approved", "pending_finance", "processing", "on_hold"],
  rejected: ["rejected"],
  completed: ["completed"],
};

router.get("/claims", requirePagePermission(PAGE, "view"), async (req, res) => {
  try {
    await ensureTables();

    const { tab, search, from, to } = req.query;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 200);
    const offset = (page - 1) * pageSize;

    const filters = ["c.employee_user_id = ?"];
    const params = [req.authUser.id];

    const tabKey = String(tab || "all").trim().toLowerCase();
    if (tabKey !== "all" && TAB_STATUS_MAP[tabKey]) {
      const list = TAB_STATUS_MAP[tabKey];
      filters.push(`c.current_status IN (${list.map(() => "?").join(",")})`);
      params.push(...list);
    }
    if (search) {
      filters.push(
        "(c.claim_number LIKE ? OR c.purpose LIKE ? OR c.remarks LIKE ? OR c.cost_centre LIKE ?)"
      );
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }
    if (from) {
      filters.push("(c.period_to IS NULL OR c.period_to >= ?)");
      params.push(String(from).slice(0, 10));
    }
    if (to) {
      filters.push("(c.period_from IS NULL OR c.period_from <= ?)");
      params.push(String(to).slice(0, 10));
    }

    const whereClause = filters.join(" AND ");

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM expense_claims c WHERE ${whereClause}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM expense_claim_items i WHERE i.claim_id = c.id) AS item_count
       FROM expense_claims c
       WHERE ${whereClause}
       ORDER BY (c.current_status = 'draft') DESC, c.updated_at DESC, c.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({
      success: true,
      data: rows.map((row) => ({ ...mapClaim(row), itemCount: Number(row.item_count || 0) })),
      total: countRows[0].total,
      page,
      pageSize,
    });
  } catch (error) {
    fail(res, error, "Failed to load your expense claims.");
  }
});

router.get("/claims/:id", requirePagePermission(PAGE, "view"), async (req, res) => {
  try {
    await ensureTables();
    const [claimRows] = await pool.query(
      `SELECT * FROM expense_claims WHERE id = ?`,
      [req.params.id]
    );
    if (!claimRows.length) throw httpError(404, "Claim not found.");
    if (!canViewClaim(req.authUser, claimRows[0])) {
      throw httpError(403, "You do not have access to this claim.");
    }
    const bundle = await fetchClaimBundle(req.params.id);
    res.json({ success: true, data: bundle });
  } catch (error) {
    fail(res, error, "Failed to load the claim.");
  }
});

// ---------------------------------------------------------------------------
// Routes — create / update / delete draft
// ---------------------------------------------------------------------------

async function persistItems(conn, claimId, items) {
  const [existing] = await conn.query(
    `SELECT id FROM expense_claim_items WHERE claim_id = ?`,
    [claimId]
  );
  const existingIds = new Set(existing.map((r) => r.id));
  const keepIds = new Set();

  let srNo = 1;
  for (const item of items) {
    if (item.id && existingIds.has(item.id)) {
      await conn.query(
        `UPDATE expense_claim_items SET
           sr_no = ?, expense_date = ?, category = ?, sub_category = ?, description = ?,
           claimed_amount = ?, bill_number = ?, bill_date = ?
         WHERE id = ? AND claim_id = ?`,
        [
          srNo, item.expenseDate, item.category, item.subCategory, item.description,
          item.claimedAmount, item.billNumber, item.billDate, item.id, claimId,
        ]
      );
      keepIds.add(item.id);
    } else {
      const [ins] = await conn.query(
        `INSERT INTO expense_claim_items
           (claim_id, sr_no, expense_date, category, sub_category, description,
            claimed_amount, bill_number, bill_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          claimId, srNo, item.expenseDate, item.category, item.subCategory,
          item.description, item.claimedAmount, item.billNumber, item.billDate,
        ]
      );
      keepIds.add(ins.insertId);
    }
    srNo += 1;
  }

  const toDelete = [...existingIds].filter((id) => !keepIds.has(id));
  if (toDelete.length) {
    await conn.query(
      `DELETE FROM expense_claim_attachments WHERE claim_id = ? AND item_id IN (${toDelete.map(() => "?").join(",")})`,
      [claimId, ...toDelete]
    );
    await conn.query(
      `DELETE FROM expense_claim_items WHERE claim_id = ? AND id IN (${toDelete.map(() => "?").join(",")})`,
      [claimId, ...toDelete]
    );
  }

  const total = round2(items.reduce((sum, i) => sum + Number(i.claimedAmount || 0), 0));
  await conn.query(`UPDATE expense_claims SET total_claimed = ? WHERE id = ?`, [total, claimId]);
  return total;
}

function parseClaimBody(body) {
  const items = Array.isArray(body?.items) ? body.items : [];
  return {
    employeeCode: String(body?.employeeCode ?? "").trim() || null,
    costCentre: String(body?.costCentre ?? "").trim() || null,
    purpose: String(body?.purpose ?? "").trim() || null,
    periodFrom: normalizeDate(body?.periodFrom),
    periodTo: normalizeDate(body?.periodTo),
    remarks: String(body?.remarks ?? "").trim() || null,
    items,
  };
}

// Look up one employee in the Physical employee master (`physical` table) by
// HRMS / Employee ID. Returns null when the id is blank or not found.
async function lookupPhysicalEmployee(employeeCode) {
  const code = String(employeeCode || "").trim();
  if (!code) return null;
  const [rows] = await pool.query(
    `SELECT employee_code, employee_name, function_name, job_role, scrum_job_role,
            circle, cmp, cluster, mobile_number, company_email_id, date_of_joining,
            reporting_manager, employment_status
     FROM physical
     WHERE TRIM(LOWER(employee_code)) = TRIM(LOWER(?)) AND COALESCE(is_deleted, 0) = 0
     LIMIT 1`,
    [code]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    employeeCode: r.employee_code,
    employeeName: r.employee_name || "",
    department: r.function_name || "",
    designation: r.job_role || r.scrum_job_role || "",
    circle: r.circle || "",
    cmp: r.cmp || "",
    cluster: r.cluster || "",
    mobile: r.mobile_number || "",
    email: r.company_email_id || "",
    dateOfJoining: r.date_of_joining ? String(r.date_of_joining).slice(0, 10) : "",
    reportingManager: r.reporting_manager || "",
    employmentStatus: r.employment_status || "",
  };
}

// The controlled employee-master snapshot stored on a claim. An HRMS / Employee
// ID (when supplied) is authoritative and resolved from `physical`; otherwise we
// fall back to the logged-in user's own `users` record.
async function resolveEmployeeSnapshot(authUser, employeeCode) {
  const code = String(employeeCode || "").trim();
  if (code) {
    const emp = await lookupPhysicalEmployee(code);
    if (!emp) {
      throw httpError(400, `Employee ID "${code}" was not found in the employee master.`);
    }
    return {
      employee_user_id: authUser.id,
      employee_name: emp.employeeName || null,
      employee_code: emp.employeeCode,
      department: emp.department || null,
      designation: emp.designation || null,
      circle: emp.circle || null,
    };
  }
  const profile = await loadEmployeeProfile(authUser.id);
  return employeeSnapshot(profile, authUser);
}

router.post("/claims", requirePagePermission(PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const body = parseClaimBody(req.body);
    if (body.periodFrom === undefined || body.periodTo === undefined) {
      throw httpError(400, "Expense period dates are invalid.");
    }
    if (body.periodFrom && body.periodTo && body.periodFrom > body.periodTo) {
      throw httpError(400, "Expense Period From cannot be after Period To.");
    }

    const categoryNames = (await getActiveCategories()).map((c) => c.name);
    const parsedItems = [];
    const errors = [];
    body.items.forEach((raw, index) => {
      const { errors: itemErrors, value } = validateItem(raw, index, categoryNames, { strict: false });
      errors.push(...itemErrors);
      parsedItems.push(value);
    });
    if (errors.length) throw httpError(400, "Please fix the highlighted rows.", { rowErrors: errors });

    const snap = await resolveEmployeeSnapshot(req.authUser, body.employeeCode);

    const result = await withTransaction(async (conn) => {
      const [ins] = await conn.query(
        `INSERT INTO expense_claims
           (employee_user_id, employee_name, employee_code, department, designation, circle,
            cost_centre, purpose, period_from, period_to, remarks,
            current_status, current_stage, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'employee', ?)`,
        [
          snap.employee_user_id, snap.employee_name, snap.employee_code, snap.department,
          snap.designation, snap.circle, body.costCentre, body.purpose,
          body.periodFrom, body.periodTo, body.remarks, req.authUser.id,
        ]
      );
      const claimId = ins.insertId;
      await persistItems(conn, claimId, parsedItems);
      await writeAudit(conn, {
        claimId,
        actorUserId: req.authUser.id,
        actorName: actorName(req.authUser),
        stage: "employee",
        action: "DRAFT_CREATED",
        toStatus: "draft",
        meta: { itemCount: parsedItems.length },
      });
      return claimId;
    });

    const bundle = await fetchClaimBundle(result);
    res.status(201).json({ success: true, data: bundle });
  } catch (error) {
    fail(res, error, "Failed to save the draft.");
  }
});

async function loadOwnEditableClaim(claimId, authUser) {
  const [rows] = await pool.query(`SELECT * FROM expense_claims WHERE id = ?`, [claimId]);
  const claim = rows[0];
  if (!claim) throw httpError(404, "Claim not found.");
  if (claim.employee_user_id !== authUser.id) {
    throw httpError(403, "You can only edit your own claims.");
  }
  if (!EMPLOYEE_EDITABLE_STATUSES.includes(claim.current_status)) {
    throw httpError(
      409,
      "This claim has been submitted and can no longer be edited. It must be returned by an approver first."
    );
  }
  return claim;
}

router.put("/claims/:id", requirePagePermission(PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const claim = await loadOwnEditableClaim(req.params.id, req.authUser);
    const body = parseClaimBody(req.body);
    if (body.periodFrom === undefined || body.periodTo === undefined) {
      throw httpError(400, "Expense period dates are invalid.");
    }
    if (body.periodFrom && body.periodTo && body.periodFrom > body.periodTo) {
      throw httpError(400, "Expense Period From cannot be after Period To.");
    }

    const categoryNames = (await getActiveCategories()).map((c) => c.name);
    const parsedItems = [];
    const errors = [];
    body.items.forEach((raw, index) => {
      const { errors: itemErrors, value } = validateItem(raw, index, categoryNames, { strict: false });
      errors.push(...itemErrors);
      parsedItems.push(value);
    });
    if (errors.length) throw httpError(400, "Please fix the highlighted rows.", { rowErrors: errors });

    const snap = await resolveEmployeeSnapshot(req.authUser, body.employeeCode);

    await withTransaction(async (conn) => {
      await conn.query(
        `UPDATE expense_claims SET
           employee_name = ?, employee_code = ?, department = ?, designation = ?, circle = ?,
           cost_centre = ?, purpose = ?, period_from = ?, period_to = ?, remarks = ?
         WHERE id = ?`,
        [
          snap.employee_name, snap.employee_code, snap.department, snap.designation, snap.circle,
          body.costCentre, body.purpose, body.periodFrom, body.periodTo, body.remarks, claim.id,
        ]
      );
      const total = await persistItems(conn, claim.id, parsedItems);
      await writeAudit(conn, {
        claimId: claim.id,
        actorUserId: req.authUser.id,
        actorName: actorName(req.authUser),
        stage: "employee",
        action: "DRAFT_UPDATED",
        fromStatus: claim.current_status,
        toStatus: claim.current_status,
        newAmount: total,
        meta: { itemCount: parsedItems.length },
      });
    });

    const bundle = await fetchClaimBundle(claim.id);
    res.json({ success: true, data: bundle });
  } catch (error) {
    fail(res, error, "Failed to update the claim.");
  }
});

router.delete("/claims/:id", requirePagePermission(PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const [rows] = await pool.query(`SELECT * FROM expense_claims WHERE id = ?`, [req.params.id]);
    const claim = rows[0];
    if (!claim) throw httpError(404, "Claim not found.");
    if (claim.employee_user_id !== req.authUser.id && !isAdmin(req.authUser)) {
      throw httpError(403, "You can only delete your own claims.");
    }
    if (claim.current_status !== "draft") {
      throw httpError(
        409,
        "Only drafts can be deleted. A submitted claim stays in history permanently."
      );
    }
    await withTransaction(async (conn) => {
      await conn.query(`DELETE FROM expense_claim_attachments WHERE claim_id = ?`, [claim.id]);
      await conn.query(`DELETE FROM expense_claim_items WHERE claim_id = ?`, [claim.id]);
      await conn.query(`DELETE FROM expense_claim_audit WHERE claim_id = ?`, [claim.id]);
      await conn.query(`DELETE FROM expense_claims WHERE id = ?`, [claim.id]);
    });
    res.json({ success: true });
  } catch (error) {
    fail(res, error, "Failed to delete the draft.");
  }
});

// ---------------------------------------------------------------------------
// Routes — submit
// ---------------------------------------------------------------------------

router.post("/claims/:id/submit", requirePagePermission(PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const claim = await loadOwnEditableClaim(req.params.id, req.authUser);

    const [items] = await pool.query(
      `SELECT * FROM expense_claim_items WHERE claim_id = ? ORDER BY sr_no ASC, id ASC`,
      [claim.id]
    );
    if (!items.length) throw httpError(400, "Add at least one expense item before submitting.");

    const categories = await getActiveCategories();
    const categoryNames = categories.map((c) => c.name);
    const requiresBill = new Map(categories.map((c) => [c.name, Boolean(c.requires_bill)]));

    const [attachRows] = await pool.query(
      `SELECT item_id, COUNT(*) AS c FROM expense_claim_attachments WHERE claim_id = ? GROUP BY item_id`,
      [claim.id]
    );
    const billCountByItem = new Map(attachRows.map((r) => [r.item_id, Number(r.c)]));

    const errors = [];
    items.forEach((row, index) => {
      const { errors: itemErrors } = validateItem(
        {
          id: row.id,
          expenseDate: row.expense_date,
          category: row.category,
          subCategory: row.sub_category,
          description: row.description,
          claimedAmount: row.claimed_amount,
          billNumber: row.bill_number,
          billDate: row.bill_date,
        },
        index,
        categoryNames,
        { strict: true }
      );
      errors.push(...itemErrors);
      if (requiresBill.get(row.category) && !billCountByItem.get(row.id)) {
        errors.push(`Row ${index + 1}: a bill/invoice is required for "${row.category}".`);
      }
    });
    if (errors.length) throw httpError(400, "This claim cannot be submitted yet.", { rowErrors: errors });

    // Policy engine — hard limits block submission; soft limits flag the item.
    const policies = await getActivePolicies();
    const policyHits = evaluatePolicies(
      items.map((i) => ({
        category: i.category,
        subCategory: i.sub_category,
        expenseDate: i.expense_date,
        claimedAmount: i.claimed_amount,
      })),
      policies
    );
    const hardHits = policyHits.filter((h) => h.hard);
    if (hardHits.length) {
      throw httpError(400, "This claim exceeds a hard policy limit and cannot be submitted.", {
        rowErrors: hardHits.map((h) => h.message),
      });
    }
    const exceptionItemIds = new Set(policyHits.map((h) => items[h.index]?.id).filter(Boolean));

    const total = round2(items.reduce((sum, i) => sum + Number(i.claimed_amount || 0), 0));
    const year = new Date().getFullYear();

    await withTransaction(async (conn) => {
      const approvers = await resolveApprovers(conn, "ALL", total);
      if (!approvers || !approvers.l1_user_id) {
        throw httpError(
          409,
          "Approvers have not been set up yet. Ask an administrator to open Expense Master Data → Default Approval Chain and choose the L1 / L2 / Final approvers."
        );
      }
      if (approvers.l1_user_id === claim.employee_user_id) {
        throw httpError(
          409,
          "The configured L1 approver is you. An administrator must assign a different approver."
        );
      }

      const claimNumber = claim.claim_number || (await nextClaimNumber(conn, year));

      // Resubmission after a send-back: wipe every prior approval decision so the
      // chain starts clean. History stays intact in expense_claim_audit.
      if (claim.claim_number) {
        await conn.query(
          `UPDATE expense_claim_items SET
             l1_approved_amount = NULL, l1_decision = NULL, l1_reason = NULL,
             l2_approved_amount = NULL, l2_decision = NULL, l2_reason = NULL,
             final_approved_amount = NULL, final_decision = NULL, final_reason = NULL,
             status = 'pending'
           WHERE claim_id = ?`,
          [claim.id]
        );
        await conn.query(
          `UPDATE expense_claims SET
             l1_approved_total = NULL, l2_approved_total = NULL, final_approved_total = NULL
           WHERE id = ?`,
          [claim.id]
        );
      }

      // Stamp / clear policy-exception flags for this submission.
      await conn.query(`UPDATE expense_claim_items SET policy_exception = 0 WHERE claim_id = ?`, [claim.id]);
      if (exceptionItemIds.size) {
        await conn.query(
          `UPDATE expense_claim_items SET policy_exception = 1
           WHERE claim_id = ? AND id IN (${[...exceptionItemIds].map(() => "?").join(",")})`,
          [claim.id, ...exceptionItemIds]
        );
      }

      await conn.query(
        `UPDATE expense_claims SET
           claim_number = ?, total_claimed = ?, current_status = 'pending_l1', current_stage = 'l1',
           l1_approver_user_id = ?, l2_approver_user_id = ?, final_approver_user_id = ?,
           current_approver_user_id = ?, submitted_at = NOW()
         WHERE id = ?`,
        [
          claimNumber, total,
          approvers.l1_user_id, approvers.l2_user_id || null, approvers.final_user_id || null,
          approvers.l1_user_id, claim.id,
        ]
      );

      await writeAudit(conn, {
        claimId: claim.id,
        actorUserId: req.authUser.id,
        actorName: actorName(req.authUser),
        stage: "employee",
        action: claim.claim_number ? "RESUBMITTED" : "SUBMITTED",
        fromStatus: claim.current_status,
        toStatus: "pending_l1",
        newAmount: total,
        reason: policyHits.length ? policyHits.map((h) => h.message).join(" ") : null,
        meta: {
          claimNumber,
          itemCount: items.length,
          l1ApproverUserId: approvers.l1_user_id,
          policyExceptions: policyHits.length,
        },
      });

      await notify(conn, {
        userId: approvers.l1_user_id,
        claimId: claim.id,
        claimNumber,
        type: "approval_pending",
        message: `${claim.employee_name || "An employee"} submitted claim ${claimNumber} (${formatINR(total)}) for your L1 approval.`,
      });
    });

    // Read the committed state on a fresh connection (never inside the txn —
    // an uncommitted write is not visible to another pool connection).
    const bundle = await fetchClaimBundle(claim.id);
    res.json({ success: true, data: bundle });
  } catch (error) {
    fail(res, error, "Failed to submit the claim.");
  }
});

// ---------------------------------------------------------------------------
// Routes — bill attachments
// ---------------------------------------------------------------------------

router.post(
  "/claims/:id/items/:itemId/bill",
  requirePagePermission(PAGE, "edit"),
  billUpload,
  async (req, res) => {
    try {
      await ensureTables();
      const claim = await loadOwnEditableClaim(req.params.id, req.authUser);
      const [itemRows] = await pool.query(
        `SELECT id FROM expense_claim_items WHERE id = ? AND claim_id = ?`,
        [req.params.itemId, claim.id]
      );
      if (!itemRows.length) throw httpError(404, "Expense item not found on this claim.");

      assertValidBill(req.file);

      const [ins] = await pool.query(
        `INSERT INTO expense_claim_attachments
           (claim_id, item_id, file_name, file_type, file_size, file_data, uploaded_by, uploaded_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          claim.id, itemRows[0].id, req.file.originalname,
          req.file.mimetype || "application/octet-stream",
          req.file.size, req.file.buffer, req.authUser.id, actorName(req.authUser),
        ]
      );

      await withTransaction(async (conn) => {
        await writeAudit(conn, {
          claimId: claim.id,
          actorUserId: req.authUser.id,
          actorName: actorName(req.authUser),
          stage: "employee",
          action: "BILL_UPLOADED",
          itemId: itemRows[0].id,
          meta: { attachmentId: ins.insertId, fileName: req.file.originalname, fileSize: req.file.size },
        });
      });

      const [rows] = await pool.query(
        `SELECT id, claim_id, item_id, file_name, file_type, file_size, uploaded_by,
                uploaded_by_name, uploaded_at
         FROM expense_claim_attachments WHERE id = ?`,
        [ins.insertId]
      );
      res.status(201).json({ success: true, data: mapAttachment(rows[0]) });
    } catch (error) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return fail(res, httpError(400, "File exceeds the 10 MB limit."));
      }
      fail(res, error, "Failed to upload the bill.");
    }
  }
);

router.get("/attachments/:attId", requirePagePermission(PAGE, "view"), async (req, res) => {
  try {
    await ensureTables();
    const [rows] = await pool.query(
      `SELECT a.*, c.employee_user_id, c.current_approver_user_id, c.l1_approver_user_id,
              c.l2_approver_user_id, c.final_approver_user_id
       FROM expense_claim_attachments a
       JOIN expense_claims c ON c.id = a.claim_id
       WHERE a.id = ?`,
      [req.params.attId]
    );
    const att = rows[0];
    if (!att) throw httpError(404, "Attachment not found.");
    if (!canViewClaim(req.authUser, att)) {
      throw httpError(403, "You do not have access to this bill.");
    }
    res.setHeader("Content-Type", att.file_type || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(att.file_name || `bill-${att.id}`)}"`
    );
    res.setHeader("Cache-Control", "private, max-age=0, no-store");
    res.send(att.file_data);
  } catch (error) {
    fail(res, error, "Failed to open the bill.");
  }
});

router.delete("/attachments/:attId", requirePagePermission(PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const [rows] = await pool.query(
      `SELECT a.id, a.claim_id, a.item_id, a.file_name, c.employee_user_id, c.current_status
       FROM expense_claim_attachments a
       JOIN expense_claims c ON c.id = a.claim_id
       WHERE a.id = ?`,
      [req.params.attId]
    );
    const att = rows[0];
    if (!att) throw httpError(404, "Attachment not found.");
    if (att.employee_user_id !== req.authUser.id && !isAdmin(req.authUser)) {
      throw httpError(403, "You can only change bills on your own claims.");
    }
    if (!EMPLOYEE_EDITABLE_STATUSES.includes(att.current_status)) {
      throw httpError(409, "Bills cannot be changed after the claim has been submitted.");
    }
    await withTransaction(async (conn) => {
      await conn.query(`DELETE FROM expense_claim_attachments WHERE id = ?`, [att.id]);
      await writeAudit(conn, {
        claimId: att.claim_id,
        actorUserId: req.authUser.id,
        actorName: actorName(req.authUser),
        stage: "employee",
        action: "BILL_REMOVED",
        itemId: att.item_id,
        meta: { attachmentId: att.id, fileName: att.file_name },
      });
    });
    res.json({ success: true });
  } catch (error) {
    fail(res, error, "Failed to remove the bill.");
  }
});

// ===========================================================================
// PHASE 2 — Approvals (L1). Written generically so L2 and Final reuse it by
// passing stage = "l2" / "final".
// ===========================================================================

const APPROVALS_PAGE = PAGE_IDS.approvals; // "expense-approvals"

const STAGE_PENDING_STATUS = {
  l1: "pending_l1",
  l2: "pending_l2",
  final: "pending_final",
};
const STAGE_COL_PREFIX = { l1: "l1", l2: "l2", final: "final" };
const STAGE_LABEL = { l1: "L1", l2: "L2", final: "Final" };

// Ceiling this approver may pass for an item: reductions only flow downstream
// (business rule #5). L1's ceiling is the claimed amount.
function itemCeiling(stage, item) {
  const claimed = Number(item.claimed_amount || 0);
  if (stage === "l1") return claimed;
  if (stage === "l2") {
    return item.l1_approved_amount === null ? claimed : Number(item.l1_approved_amount);
  }
  // final
  if (item.l2_approved_amount !== null) return Number(item.l2_approved_amount);
  if (item.l1_approved_amount !== null) return Number(item.l1_approved_amount);
  return claimed;
}

// Where a claim goes once `stage` has approved it. Levels with no configured
// approver (or where the only candidate is the employee) are skipped.
function nextAfterStage(stage, claim) {
  const l2 =
    claim.l2_approver_user_id && claim.l2_approver_user_id !== claim.employee_user_id
      ? claim.l2_approver_user_id
      : null;
  const fin =
    claim.final_approver_user_id && claim.final_approver_user_id !== claim.employee_user_id
      ? claim.final_approver_user_id
      : null;

  if (stage === "l1") {
    if (l2) return { status: "pending_l2", stage: "l2", approverId: l2 };
    if (fin) return { status: "pending_final", stage: "final", approverId: fin };
    return { status: "pending_finance", stage: "finance", approverId: null };
  }
  if (stage === "l2") {
    if (fin) return { status: "pending_final", stage: "final", approverId: fin };
    return { status: "pending_finance", stage: "finance", approverId: null };
  }
  return { status: "pending_finance", stage: "finance", approverId: null };
}

// GET /api/expense-claims/approvals — the approver's queue.
router.get("/approvals", requirePagePermission(APPROVALS_PAGE, "view"), async (req, res) => {
  try {
    await ensureTables();

    const tab = String(req.query.tab || "pending").trim().toLowerCase();
    const search = req.query.search;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 200);
    const offset = (page - 1) * pageSize;

    const filters = [];
    const params = [];

    if (tab === "all") {
      filters.push(
        "(c.l1_approver_user_id = ? OR c.l2_approver_user_id = ? OR c.final_approver_user_id = ?)"
      );
      params.push(req.authUser.id, req.authUser.id, req.authUser.id);
    } else {
      filters.push("c.current_approver_user_id = ?");
      params.push(req.authUser.id);
      filters.push("c.current_status IN ('pending_l1', 'pending_l2', 'pending_final')");
    }

    if (search) {
      filters.push(
        "(c.claim_number LIKE ? OR c.purpose LIKE ? OR c.employee_name LIKE ? OR c.department LIKE ?)"
      );
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }

    const whereClause = filters.join(" AND ");
    const orderBy =
      tab === "all"
        ? "c.updated_at DESC, c.id DESC"
        : "c.submitted_at ASC, c.id ASC"; // FIFO queue

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM expense_claims c WHERE ${whereClause}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM expense_claim_items i WHERE i.claim_id = c.id) AS item_count
       FROM expense_claims c
       WHERE ${whereClause}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({
      success: true,
      data: rows.map((row) => ({
        ...mapClaim(row),
        itemCount: Number(row.item_count || 0),
        myStage:
          row.current_status === "pending_l1"
            ? "l1"
            : row.current_status === "pending_l2"
            ? "l2"
            : row.current_status === "pending_final"
            ? "final"
            : null,
      })),
      total: countRows[0].total,
      page,
      pageSize,
    });
  } catch (error) {
    fail(res, error, "Failed to load the approvals queue.");
  }
});

// Shared guard for the three approver actions.
async function loadClaimForApprover(claimId, authUser, { requirePending = true } = {}) {
  const [rows] = await pool.query(`SELECT * FROM expense_claims WHERE id = ?`, [claimId]);
  const claim = rows[0];
  if (!claim) throw httpError(404, "Claim not found.");
  if (claim.employee_user_id === authUser.id) {
    throw httpError(403, "You cannot act on your own claim.");
  }
  if (requirePending && !["pending_l1", "pending_l2", "pending_final"].includes(claim.current_status)) {
    throw httpError(409, "This claim is not awaiting approval right now.");
  }
  const isCurrentApprover = claim.current_approver_user_id === authUser.id;
  if (!isCurrentApprover && !isAdmin(authUser)) {
    throw httpError(403, "This claim is not assigned to you for approval.");
  }
  return claim;
}

// POST /api/expense-claims/claims/:id/decision — approve every item, then forward.
router.post("/claims/:id/decision", requirePagePermission(APPROVALS_PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const claim = await loadClaimForApprover(req.params.id, req.authUser);

    const stage = String(req.body?.stage || "").trim().toLowerCase();
    if (!STAGE_PENDING_STATUS[stage]) throw httpError(400, "A valid approval stage is required.");
    if (claim.current_stage !== stage || claim.current_status !== STAGE_PENDING_STATUS[stage]) {
      throw httpError(
        409,
        `This claim is at the ${STAGE_LABEL[claim.current_stage] || claim.current_stage} stage, not ${STAGE_LABEL[stage]}.`
      );
    }

    const decisions = Array.isArray(req.body?.items) ? req.body.items : [];
    const remarks = String(req.body?.remarks ?? "").trim() || null;

    const [items] = await pool.query(
      `SELECT * FROM expense_claim_items WHERE claim_id = ? ORDER BY sr_no ASC, id ASC`,
      [claim.id]
    );
    if (!items.length) throw httpError(400, "This claim has no expense items.");

    const byId = new Map(decisions.map((d) => [Number(d.itemId), d]));
    const errors = [];
    const prepared = [];

    items.forEach((item, index) => {
      const label = `Row ${index + 1} (${item.category})`;
      const d = byId.get(item.id);
      if (!d) {
        errors.push(`${label}: a decision is required.`);
        return;
      }
      const ceiling = itemCeiling(stage, item);
      const kind = String(d.decision || "").trim().toLowerCase();
      const reason = String(d.reason ?? "").trim();

      let approved;
      if (kind === "approve_full") {
        approved = round2(ceiling);
      } else if (kind === "reject") {
        approved = 0;
      } else if (kind === "approve_partial") {
        approved = toMoney(d.approvedAmount);
        if (Number.isNaN(approved)) {
          errors.push(`${label}: enter a valid approved amount.`);
          return;
        }
        if (approved < 0) {
          errors.push(`${label}: approved amount cannot be negative.`);
          return;
        }
        if (approved > ceiling + 0.001) {
          errors.push(
            `${label}: approved amount cannot exceed ${
              stage === "l1" ? "the claimed amount" : `the ${STAGE_LABEL[stage === "l2" ? "l1" : "l2"]} approved amount`
            } (${ceiling.toFixed(2)}).`
          );
          return;
        }
      } else {
        errors.push(`${label}: choose Approve Full, Approve Partial or Reject.`);
        return;
      }

      approved = round2(Math.min(approved, ceiling));
      const normalized =
        approved <= 0 ? "rejected" : approved < ceiling - 0.001 ? "approved_partial" : "approved_full";

      // Reason is mandatory only when THIS approver actually reduces the amount
      // below the ceiling handed down to them. If an upstream level already
      // rejected the item (ceiling 0), passing that 0 through needs no new
      // reason — the original reason is already on record.
      const reducedHere = approved < ceiling - 0.001;
      if (reducedHere && !reason) {
        errors.push(
          `${label}: a reason is required for a ${approved <= 0 ? "rejection" : "partial approval"}.`
        );
        return;
      }
      // Approving (in full or part) an item flagged as a policy exception also
      // needs a reason on record (business rule #15).
      if (item.policy_exception && normalized !== "rejected" && !reason) {
        errors.push(`${label}: this item exceeds a policy limit — a reason is required to approve it.`);
        return;
      }

      prepared.push({
        item,
        approved,
        normalized,
        reason: reason || null,
        itemStatus: approved <= 0 ? "rejected" : "approved",
      });
    });

    if (byId.size > items.length) {
      errors.push("The request contains items that do not belong to this claim.");
    }
    if (errors.length) throw httpError(400, "This decision cannot be saved yet.", { rowErrors: errors });

    const prefix = STAGE_COL_PREFIX[stage];
    const stageTotal = round2(prepared.reduce((sum, p) => sum + p.approved, 0));
    const claimed = round2(items.reduce((sum, i) => sum + Number(i.claimed_amount || 0), 0));
    const reduced = round2(claimed - stageTotal);
    const next = nextAfterStage(stage, claim);

    await withTransaction(async (conn) => {
      for (const p of prepared) {
        await conn.query(
          `UPDATE expense_claim_items SET
             ${prefix}_approved_amount = ?, ${prefix}_decision = ?, ${prefix}_reason = ?, status = ?
           WHERE id = ? AND claim_id = ?`,
          [p.approved, p.normalized, p.reason, p.itemStatus, p.item.id, claim.id]
        );
        await writeAudit(conn, {
          claimId: claim.id,
          actorUserId: req.authUser.id,
          actorName: actorName(req.authUser),
          stage,
          action:
            p.normalized === "rejected"
              ? "ITEM_REJECTED"
              : p.normalized === "approved_partial"
              ? "ITEM_APPROVED_PARTIAL"
              : "ITEM_APPROVED_FULL",
          itemId: p.item.id,
          oldAmount: Number(p.item.claimed_amount || 0),
          newAmount: p.approved,
          reason: p.reason,
        });
      }

      const reachedFinance = next.status === "pending_finance";

      const claimUpdates = [`${prefix}_approved_total = ?`];
      const claimParams = [stageTotal];
      if (reachedFinance && prefix !== "final") {
        // This level was the last approver (no final approver configured), so
        // its total IS the final approved amount.
        claimUpdates.push("final_approved_total = ?");
        claimParams.push(stageTotal);
      }
      claimUpdates.push("current_status = ?", "current_stage = ?", "current_approver_user_id = ?");
      claimParams.push(next.status, next.stage, next.approverId);

      await conn.query(
        `UPDATE expense_claims SET ${claimUpdates.join(", ")} WHERE id = ?`,
        [...claimParams, claim.id]
      );

      await writeAudit(conn, {
        claimId: claim.id,
        actorUserId: req.authUser.id,
        actorName: actorName(req.authUser),
        stage,
        action: reduced > 0.001 ? `${STAGE_LABEL[stage].toUpperCase()}_APPROVED_WITH_CHANGES` : `${STAGE_LABEL[stage].toUpperCase()}_APPROVED`,
        fromStatus: claim.current_status,
        toStatus: next.status,
        newAmount: stageTotal,
        reason: remarks,
        meta: { claimed, approved: stageTotal, reduced, nextApproverUserId: next.approverId },
      });

      if (reachedFinance) {
        // Open the finance record (idempotent — a resubmitted claim may already
        // have one from a previous run).
        await conn.query(
          `INSERT INTO expense_claim_finance (claim_id, finance_status)
           VALUES (?, 'pending')
           ON DUPLICATE KEY UPDATE finance_status = 'pending', payment_reference = NULL,
             payment_date = NULL, processed_by = NULL, processed_by_user_id = NULL, processed_at = NULL`,
          [claim.id]
        );
        await writeAudit(conn, {
          claimId: claim.id,
          actorUserId: req.authUser.id,
          actorName: actorName(req.authUser),
          stage: "finance",
          action: "MOVED_TO_FINANCE",
          fromStatus: claim.current_status,
          toStatus: "pending_finance",
          newAmount: stageTotal,
          meta: { finalApproved: stageTotal },
        });
      }

      // Notify the employee of the outcome, and the next approver if there is one.
      const verb = reduced > 0.001 ? "approved with changes" : "approved";
      await notify(conn, {
        userId: claim.employee_user_id,
        claimId: claim.id,
        claimNumber: claim.claim_number,
        type: reachedFinance ? "final_approved" : `${stage}_approved`,
        message: reachedFinance
          ? `Claim ${claim.claim_number} is fully approved (${formatINR(stageTotal)}) and is now with Finance.`
          : `${STAGE_LABEL[stage]} ${verb} claim ${claim.claim_number} — ${formatINR(stageTotal)}. Now pending ${STAGE_LABEL[next.stage] || next.stage} approval.`,
      });
      if (!reachedFinance && next.approverId) {
        await notify(conn, {
          userId: next.approverId,
          claimId: claim.id,
          claimNumber: claim.claim_number,
          type: "approval_pending",
          message: `Claim ${claim.claim_number} (${formatINR(stageTotal)}) is pending your ${STAGE_LABEL[next.stage] || next.stage} approval.`,
        });
      }
    });

    const bundle = await fetchClaimBundle(claim.id);
    res.json({ success: true, data: bundle });
  } catch (error) {
    fail(res, error, "Failed to record the approval decision.");
  }
});

// POST /api/expense-claims/claims/:id/send-back — return to the employee.
router.post("/claims/:id/send-back", requirePagePermission(APPROVALS_PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const claim = await loadClaimForApprover(req.params.id, req.authUser);
    const reason = String(req.body?.reason ?? "").trim();
    if (!reason) throw httpError(400, "A reason is required when sending a claim back.");

    await withTransaction(async (conn) => {
      await conn.query(
        `UPDATE expense_claims SET
           current_status = 'returned', current_stage = 'employee', current_approver_user_id = NULL
         WHERE id = ?`,
        [claim.id]
      );
      await writeAudit(conn, {
        claimId: claim.id,
        actorUserId: req.authUser.id,
        actorName: actorName(req.authUser),
        stage: claim.current_stage,
        action: "SENT_BACK",
        fromStatus: claim.current_status,
        toStatus: "returned",
        reason,
      });
      await notify(conn, {
        userId: claim.employee_user_id,
        claimId: claim.id,
        claimNumber: claim.claim_number,
        type: "returned",
        message: `Claim ${claim.claim_number} was sent back by ${actorName(req.authUser)}: ${reason}`,
      });
    });

    const bundle = await fetchClaimBundle(claim.id);
    res.json({ success: true, data: bundle });
  } catch (error) {
    fail(res, error, "Failed to send the claim back.");
  }
});

// POST /api/expense-claims/claims/:id/reject — terminal rejection (kept in history).
router.post("/claims/:id/reject", requirePagePermission(APPROVALS_PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const claim = await loadClaimForApprover(req.params.id, req.authUser);
    const reason = String(req.body?.reason ?? "").trim();
    if (!reason) throw httpError(400, "A reason is required to reject a claim.");

    const stage = claim.current_stage;
    const prefix = STAGE_COL_PREFIX[stage] || null;

    await withTransaction(async (conn) => {
      if (prefix) {
        await conn.query(
          `UPDATE expense_claim_items SET
             ${prefix}_approved_amount = 0, ${prefix}_decision = 'rejected', ${prefix}_reason = ?, status = 'rejected'
           WHERE claim_id = ?`,
          [reason, claim.id]
        );
        await conn.query(
          `UPDATE expense_claims SET ${prefix}_approved_total = 0 WHERE id = ?`,
          [claim.id]
        );
      }
      await conn.query(
        `UPDATE expense_claims SET current_status = 'rejected', current_approver_user_id = NULL WHERE id = ?`,
        [claim.id]
      );
      await writeAudit(conn, {
        claimId: claim.id,
        actorUserId: req.authUser.id,
        actorName: actorName(req.authUser),
        stage,
        action: "REJECTED",
        fromStatus: claim.current_status,
        toStatus: "rejected",
        newAmount: 0,
        reason,
      });
      await notify(conn, {
        userId: claim.employee_user_id,
        claimId: claim.id,
        claimNumber: claim.claim_number,
        type: "rejected",
        message: `Claim ${claim.claim_number} was rejected by ${actorName(req.authUser)} at ${STAGE_LABEL[stage] || stage}: ${reason}`,
      });
    });

    const bundle = await fetchClaimBundle(claim.id);
    res.json({ success: true, data: bundle });
  } catch (error) {
    fail(res, error, "Failed to reject the claim.");
  }
});

// ===========================================================================
// PHASE 5 — Finance processing. Picks up claims that reached final approval
// (current_status = 'pending_finance') and records payment.
// ===========================================================================

const FINANCE_PAGE = PAGE_IDS.finance; // "expense-finance"
const FINANCE_STATUSES = ["pending", "processing", "processed", "on_hold"];

const FINANCE_SORT_COLUMNS = {
  submitted: "c.submitted_at",
  claim: "c.claim_number",
  claimed: "c.total_claimed",
  approved: "c.final_approved_total",
  processed: "f.processed_at",
};

function financeRow(row) {
  return {
    id: row.id,
    claimNumber: row.claim_number,
    employeeUserId: row.employee_user_id,
    employeeName: row.employee_name,
    employeeCode: row.employee_code,
    department: row.department,
    designation: row.designation,
    circle: row.circle,
    costCentre: row.cost_centre,
    purpose: row.purpose,
    periodFrom: row.period_from,
    periodTo: row.period_to,
    submittedAt: row.submitted_at,
    totalClaimed: Number(row.total_claimed || 0),
    l1ApprovedTotal: row.l1_approved_total === null ? null : Number(row.l1_approved_total),
    l2ApprovedTotal: row.l2_approved_total === null ? null : Number(row.l2_approved_total),
    finalApprovedTotal: row.final_approved_total === null ? null : Number(row.final_approved_total),
    status: row.current_status,
    stage: row.current_stage,
    l1ApproverName: row.l1_approver_name || null,
    l2ApproverName: row.l2_approver_name || null,
    finalApproverName: row.final_approver_name || null,
    itemCount: Number(row.item_count || 0),
    finance: {
      financeStatus: row.finance_status || (row.current_status === "completed" ? "processed" : "pending"),
      paymentReference: row.payment_reference || null,
      paymentDate: row.payment_date || null,
      financeRemarks: row.finance_remarks || null,
      processedBy: row.processed_by || null,
      processedAt: row.processed_at || null,
    },
  };
}

function buildFinanceFilters(req) {
  const q = req.query;
  const filters = [];
  const params = [];

  const tab = String(q.tab || "pending").trim().toLowerCase();
  if (tab === "pending") filters.push("c.current_status = 'pending_finance'");
  else if (tab === "processed") filters.push("c.current_status = 'completed'");
  else if (tab === "rejected") filters.push("c.current_status = 'rejected'");
  else filters.push("c.claim_number IS NOT NULL"); // "all"

  const like = (v) => `%${v}%`;
  if (q.search) {
    filters.push(
      "(c.claim_number LIKE ? OR c.employee_name LIKE ? OR c.employee_code LIKE ? OR c.purpose LIKE ? OR c.department LIKE ? OR c.cost_centre LIKE ?)"
    );
    params.push(like(q.search), like(q.search), like(q.search), like(q.search), like(q.search), like(q.search));
  }
  if (q.claimNumber) {
    filters.push("c.claim_number LIKE ?");
    params.push(like(q.claimNumber));
  }
  if (q.employee) {
    filters.push("c.employee_name LIKE ?");
    params.push(like(q.employee));
  }
  if (q.employeeId) {
    filters.push("c.employee_code LIKE ?");
    params.push(like(q.employeeId));
  }
  if (q.department) {
    filters.push("c.department = ?");
    params.push(q.department);
  }
  if (q.costCentre) {
    filters.push("c.cost_centre = ?");
    params.push(q.costCentre);
  }
  if (q.category) {
    filters.push(
      "EXISTS (SELECT 1 FROM expense_claim_items i WHERE i.claim_id = c.id AND i.category = ?)"
    );
    params.push(q.category);
  }
  if (q.dateFrom) {
    filters.push("DATE(c.submitted_at) >= ?");
    params.push(String(q.dateFrom).slice(0, 10));
  }
  if (q.dateTo) {
    filters.push("DATE(c.submitted_at) <= ?");
    params.push(String(q.dateTo).slice(0, 10));
  }
  if (q.claimMin) {
    filters.push("c.total_claimed >= ?");
    params.push(Number(q.claimMin) || 0);
  }
  if (q.claimMax) {
    filters.push("c.total_claimed <= ?");
    params.push(Number(q.claimMax) || 0);
  }
  if (q.approvedMin) {
    filters.push("c.final_approved_total >= ?");
    params.push(Number(q.approvedMin) || 0);
  }
  if (q.approvedMax) {
    filters.push("c.final_approved_total <= ?");
    params.push(Number(q.approvedMax) || 0);
  }
  if (q.status) {
    filters.push("c.current_status = ?");
    params.push(q.status);
  }
  if (q.financeStatus) {
    filters.push("COALESCE(f.finance_status, 'pending') = ?");
    params.push(q.financeStatus);
  }
  if (q.approver) {
    filters.push(
      "(c.l1_approver_user_id = ? OR c.l2_approver_user_id = ? OR c.final_approver_user_id = ?)"
    );
    const a = Number(q.approver) || 0;
    params.push(a, a, a);
  }
  if (q.l1) {
    filters.push("c.l1_approver_user_id = ?");
    params.push(Number(q.l1) || 0);
  }
  if (q.l2) {
    filters.push("c.l2_approver_user_id = ?");
    params.push(Number(q.l2) || 0);
  }
  if (q.final) {
    filters.push("c.final_approver_user_id = ?");
    params.push(Number(q.final) || 0);
  }

  return { filters: filters.length ? filters.join(" AND ") : "1=1", params, tab };
}

const FINANCE_BASE_FROM = `
  FROM expense_claims c
  LEFT JOIN expense_claim_finance f ON f.claim_id = c.id
  LEFT JOIN users u1 ON u1.id = c.l1_approver_user_id
  LEFT JOIN users u2 ON u2.id = c.l2_approver_user_id
  LEFT JOIN users u3 ON u3.id = c.final_approver_user_id
`;

router.get("/finance-meta", requirePagePermission(FINANCE_PAGE, "view"), async (req, res) => {
  try {
    await ensureTables();
    const [departments] = await pool.query(
      `SELECT DISTINCT department FROM expense_claims
       WHERE department IS NOT NULL AND department <> '' ORDER BY department ASC`
    );
    const [costCentres] = await pool.query(
      `SELECT DISTINCT cost_centre FROM expense_claims
       WHERE cost_centre IS NOT NULL AND cost_centre <> '' ORDER BY cost_centre ASC`
    );
    const [categories] = await pool.query(
      `SELECT name FROM expense_claim_categories WHERE is_active = 1 ORDER BY display_order ASC, name ASC`
    );
    const [approvers] = await pool.query(
      `SELECT u.id, u.name FROM users u
       WHERE u.id IN (
         SELECT l1_approver_user_id FROM expense_claims WHERE l1_approver_user_id IS NOT NULL
         UNION SELECT l2_approver_user_id FROM expense_claims WHERE l2_approver_user_id IS NOT NULL
         UNION SELECT final_approver_user_id FROM expense_claims WHERE final_approver_user_id IS NOT NULL
       )
       ORDER BY u.name ASC`
    );
    res.json({
      success: true,
      data: {
        departments: departments.map((r) => r.department),
        costCentres: costCentres.map((r) => r.cost_centre),
        categories: categories.map((r) => r.name),
        approvers: approvers.map((r) => ({ id: r.id, name: r.name })),
        financeStatuses: FINANCE_STATUSES,
      },
    });
  } catch (error) {
    fail(res, error, "Failed to load finance filters.");
  }
});

router.get("/finance", requirePagePermission(FINANCE_PAGE, "view"), async (req, res) => {
  try {
    await ensureTables();
    const { filters, params, tab } = buildFinanceFilters(req);

    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 200);
    const offset = (page - 1) * pageSize;

    const sortKey = String(req.query.sort || "").toLowerCase();
    const sortCol = FINANCE_SORT_COLUMNS[sortKey];
    const dir = String(req.query.dir || "").toLowerCase() === "asc" ? "ASC" : "DESC";
    const orderBy = sortCol
      ? `${sortCol} ${dir}, c.id DESC`
      : tab === "pending"
      ? "c.submitted_at ASC, c.id ASC"
      : "c.updated_at DESC, c.id DESC";

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total ${FINANCE_BASE_FROM} WHERE ${filters}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT c.*, f.finance_status, f.payment_reference, f.payment_date, f.finance_remarks,
              f.processed_by, f.processed_at,
              u1.name AS l1_approver_name, u2.name AS l2_approver_name, u3.name AS final_approver_name,
              (SELECT COUNT(*) FROM expense_claim_items i WHERE i.claim_id = c.id) AS item_count
       ${FINANCE_BASE_FROM}
       WHERE ${filters}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    // Tab counters for the header chips.
    const [tally] = await pool.query(
      `SELECT
         SUM(current_status = 'pending_finance') AS pending,
         SUM(current_status = 'completed') AS processed,
         SUM(current_status = 'rejected') AS rejected,
         SUM(claim_number IS NOT NULL) AS total
       FROM expense_claims`
    );

    res.json({
      success: true,
      data: rows.map(financeRow),
      total: countRows[0].total,
      page,
      pageSize,
      counts: {
        pending: Number(tally[0].pending || 0),
        processed: Number(tally[0].processed || 0),
        rejected: Number(tally[0].rejected || 0),
        all: Number(tally[0].total || 0),
      },
    });
  } catch (error) {
    fail(res, error, "Failed to load the finance queue.");
  }
});

async function approverNames(claim) {
  const ids = [claim.l1_approver_user_id, claim.l2_approver_user_id, claim.final_approver_user_id].filter(Boolean);
  if (!ids.length) return { l1: null, l2: null, final: null };
  const [rows] = await pool.query(
    `SELECT id, name FROM users WHERE id IN (${ids.map(() => "?").join(",")})`,
    ids
  );
  const byId = new Map(rows.map((r) => [r.id, r.name]));
  return {
    l1: byId.get(claim.l1_approver_user_id) || null,
    l2: byId.get(claim.l2_approver_user_id) || null,
    final: byId.get(claim.final_approver_user_id) || null,
  };
}

router.get("/finance/:id", requirePagePermission(FINANCE_PAGE, "view"), async (req, res) => {
  try {
    await ensureTables();
    const [claimRows] = await pool.query(`SELECT * FROM expense_claims WHERE id = ?`, [req.params.id]);
    if (!claimRows.length) throw httpError(404, "Claim not found.");
    const bundle = await fetchClaimBundle(req.params.id);
    bundle.approvers = await approverNames(claimRows[0]);
    res.json({ success: true, data: bundle });
  } catch (error) {
    fail(res, error, "Failed to load the claim.");
  }
});

router.post("/finance/:id", requirePagePermission(FINANCE_PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const [claimRows] = await pool.query(`SELECT * FROM expense_claims WHERE id = ?`, [req.params.id]);
    const claim = claimRows[0];
    if (!claim) throw httpError(404, "Claim not found.");
    if (!["pending_finance", "completed"].includes(claim.current_status)) {
      throw httpError(409, "Finance can only process a claim that has completed final approval.");
    }

    const financeStatus = String(req.body?.financeStatus || "").trim().toLowerCase();
    if (!FINANCE_STATUSES.includes(financeStatus)) {
      throw httpError(400, `Finance status must be one of: ${FINANCE_STATUSES.join(", ")}.`);
    }
    const paymentReference = String(req.body?.paymentReference ?? "").trim() || null;
    const financeRemarks = String(req.body?.financeRemarks ?? "").trim() || null;
    const paymentDate = normalizeDate(req.body?.paymentDate);
    if (paymentDate === undefined) throw httpError(400, "Payment Date is not a valid date.");

    if (financeStatus === "processed") {
      if (!paymentReference) throw httpError(400, "A Payment Reference Number is required to mark a claim Processed.");
      if (!paymentDate) throw httpError(400, "A Payment Date is required to mark a claim Processed.");
    }

    const nextClaimStatus = financeStatus === "processed" ? "completed" : "pending_finance";
    const nextStage = financeStatus === "processed" ? "completed" : "finance";
    const processedBy = financeStatus === "processed" ? actorName(req.authUser) : null;
    const processedByUserId = financeStatus === "processed" ? req.authUser.id : null;

    await withTransaction(async (conn) => {
      await conn.query(
        `INSERT INTO expense_claim_finance
           (claim_id, finance_status, payment_reference, payment_date, finance_remarks,
            processed_by, processed_by_user_id, processed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ${financeStatus === "processed" ? "NOW()" : "NULL"})
         ON DUPLICATE KEY UPDATE
           finance_status = VALUES(finance_status),
           payment_reference = VALUES(payment_reference),
           payment_date = VALUES(payment_date),
           finance_remarks = VALUES(finance_remarks),
           processed_by = VALUES(processed_by),
           processed_by_user_id = VALUES(processed_by_user_id),
           processed_at = ${financeStatus === "processed" ? "NOW()" : "NULL"}`,
        [claim.id, financeStatus, paymentReference, paymentDate, financeRemarks, processedBy, processedByUserId]
      );

      await conn.query(
        `UPDATE expense_claims SET current_status = ?, current_stage = ?, current_approver_user_id = NULL
         WHERE id = ?`,
        [nextClaimStatus, nextStage, claim.id]
      );

      await writeAudit(conn, {
        claimId: claim.id,
        actorUserId: req.authUser.id,
        actorName: actorName(req.authUser),
        stage: "finance",
        action: `FINANCE_${financeStatus.toUpperCase()}`,
        fromStatus: claim.current_status,
        toStatus: nextClaimStatus,
        newAmount: claim.final_approved_total === null ? null : Number(claim.final_approved_total),
        reason: financeRemarks,
        meta: { financeStatus, paymentReference, paymentDate },
      });

      if (financeStatus === "processed") {
        await notify(conn, {
          userId: claim.employee_user_id,
          claimId: claim.id,
          claimNumber: claim.claim_number,
          type: "finance_processed",
          message: `Claim ${claim.claim_number} has been processed by Finance. Payment reference: ${paymentReference}.`,
        });
      } else if (financeStatus === "on_hold") {
        await notify(conn, {
          userId: claim.employee_user_id,
          claimId: claim.id,
          claimNumber: claim.claim_number,
          type: "finance_on_hold",
          message: `Claim ${claim.claim_number} was put on hold by Finance${financeRemarks ? `: ${financeRemarks}` : "."}`,
        });
      }

    });

    const bundle = await fetchClaimBundle(claim.id);
    bundle.approvers = await approverNames(claim);
    res.json({ success: true, data: bundle });
  } catch (error) {
    fail(res, error, "Failed to update finance processing.");
  }
});

// ===========================================================================
// PHASE 6 — Excel export (respects the finance filter set). Two sheets.
// ===========================================================================

// Path is deliberately NOT "/finance/export" — that collides with "/finance/:id".
router.get("/finance-export", requirePagePermission(FINANCE_PAGE, "download"), async (req, res) => {
  try {
    await ensureTables();
    const { filters, params } = buildFinanceFilters(req);

    const [claims] = await pool.query(
      `SELECT c.*, f.finance_status, f.payment_reference, f.payment_date, f.finance_remarks, f.processed_by,
              u1.name AS l1_name, u2.name AS l2_name, u3.name AS final_name
       ${FINANCE_BASE_FROM}
       WHERE ${filters}
       ORDER BY c.submitted_at DESC, c.id DESC
       LIMIT 5000`,
      params
    );

    const summarySheet = claims.map((c) => ({
      "Claim Number": c.claim_number || "",
      "Employee ID": c.employee_code || "",
      "Employee Name": c.employee_name || "",
      Department: c.department || "",
      Designation: c.designation || "",
      "Cost Centre": c.cost_centre || "",
      Purpose: c.purpose || "",
      "Expense Period": [c.period_from, c.period_to].filter(Boolean).join(" to "),
      "Submission Date": c.submitted_at ? String(c.submitted_at).slice(0, 10) : "",
      "Total Claimed": Number(c.total_claimed || 0),
      "L1 Approved": c.l1_approved_total === null ? "" : Number(c.l1_approved_total),
      "L2 Approved": c.l2_approved_total === null ? "" : Number(c.l2_approved_total),
      "Final Approved": c.final_approved_total === null ? "" : Number(c.final_approved_total),
      "L1 Approver": c.l1_name || "",
      "L2 Approver": c.l2_name || "",
      "Final Approver": c.final_name || "",
      Status: c.current_status,
      "Finance Status": c.finance_status || (c.current_status === "completed" ? "processed" : "pending"),
      "Payment Reference": c.payment_reference || "",
      "Payment Date": c.payment_date ? String(c.payment_date).slice(0, 10) : "",
    }));

    let detailSheet = [];
    if (claims.length) {
      const ids = claims.map((c) => c.id);
      const [items] = await pool.query(
        `SELECT i.*, c.claim_number, c.employee_code, c.employee_name
         FROM expense_claim_items i JOIN expense_claims c ON c.id = i.claim_id
         WHERE i.claim_id IN (${ids.map(() => "?").join(",")})
         ORDER BY i.claim_id ASC, i.sr_no ASC`,
        ids
      );
      detailSheet = items.map((i) => ({
        "Claim Number": i.claim_number || "",
        "Employee ID": i.employee_code || "",
        "Employee Name": i.employee_name || "",
        "Expense Date": i.expense_date ? String(i.expense_date).slice(0, 10) : "",
        Category: i.category,
        "Sub Category": i.sub_category || "",
        Description: i.description || "",
        "Bill Number": i.bill_number || "",
        "Bill Date": i.bill_date ? String(i.bill_date).slice(0, 10) : "",
        "Claimed Amount": Number(i.claimed_amount || 0),
        "L1 Approved": i.l1_approved_amount === null ? "" : Number(i.l1_approved_amount),
        "L1 Reason": i.l1_reason || "",
        "L2 Approved": i.l2_approved_amount === null ? "" : Number(i.l2_approved_amount),
        "L2 Reason": i.l2_reason || "",
        "Final Approved": i.final_approved_amount === null ? "" : Number(i.final_approved_amount),
        "Final Reason": i.final_reason || "",
        "Policy Exception": i.policy_exception ? "Yes" : "No",
      }));
    }

    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(
      wb,
      xlsx.utils.json_to_sheet(summarySheet.length ? summarySheet : [{ "Claim Number": "No data" }]),
      "Claim Summary"
    );
    xlsx.utils.book_append_sheet(
      wb,
      xlsx.utils.json_to_sheet(detailSheet.length ? detailSheet : [{ "Claim Number": "No data" }]),
      "Expense Details"
    );
    const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", `attachment; filename="expense_claims_${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (error) {
    fail(res, error, "Failed to export claims.");
  }
});

// ===========================================================================
// PHASE 7 — Dashboard.
// ===========================================================================

const DASH_PAGE = PAGE_IDS.dashboard; // "expense-claims-dashboard"

function dashboardFilters(req) {
  const filters = ["c.claim_number IS NOT NULL"];
  const params = [];
  if (req.query.dateFrom) {
    filters.push("DATE(c.submitted_at) >= ?");
    params.push(String(req.query.dateFrom).slice(0, 10));
  }
  if (req.query.dateTo) {
    filters.push("DATE(c.submitted_at) <= ?");
    params.push(String(req.query.dateTo).slice(0, 10));
  }
  if (req.query.department) {
    filters.push("c.department = ?");
    params.push(req.query.department);
  }
  if (req.query.costCentre) {
    filters.push("c.cost_centre = ?");
    params.push(req.query.costCentre);
  }
  return { where: filters.join(" AND "), params };
}

router.get("/dashboard", requirePagePermission(DASH_PAGE, "view"), async (req, res) => {
  try {
    await ensureTables();
    const { where, params } = dashboardFilters(req);

    const [[cards]] = await pool.query(
      `SELECT
         COUNT(*) AS totalClaims,
         SUM(c.current_status = 'pending_l1') AS pendingL1,
         SUM(c.current_status = 'pending_l2') AS pendingL2,
         SUM(c.current_status = 'pending_final') AS pendingFinal,
         SUM(c.current_status = 'pending_finance') AS pendingFinance,
         SUM(c.current_status IN ('final_approved','pending_finance','processing','completed')) AS approvedCount,
         SUM(c.current_status = 'rejected') AS rejectedCount,
         SUM(c.current_status = 'returned') AS returnedCount,
         SUM(c.current_status = 'completed') AS completedCount,
         COALESCE(SUM(c.total_claimed), 0) AS totalClaimed,
         COALESCE(SUM(COALESCE(c.final_approved_total, c.l2_approved_total, c.l1_approved_total, 0)), 0) AS totalApproved,
         COALESCE(SUM(CASE WHEN c.current_status = 'completed' THEN COALESCE(c.final_approved_total,0) ELSE 0 END), 0) AS totalProcessed
       FROM expense_claims c WHERE ${where}`,
      params
    );
    const totalReduced = Number(cards.totalClaimed) - Number(cards.totalApproved);

    const [byCategory] = await pool.query(
      `SELECT i.category AS name,
              COALESCE(SUM(i.claimed_amount),0) AS claimed,
              COALESCE(SUM(COALESCE(i.final_approved_amount, i.l2_approved_amount, i.l1_approved_amount, 0)),0) AS approved,
              COUNT(*) AS entries
       FROM expense_claim_items i JOIN expense_claims c ON c.id = i.claim_id
       WHERE ${where}
       GROUP BY i.category ORDER BY claimed DESC`,
      params
    );
    const [byDepartment] = await pool.query(
      `SELECT COALESCE(NULLIF(c.department,''),'(unset)') AS name,
              COUNT(*) AS claims,
              COALESCE(SUM(c.total_claimed),0) AS claimed,
              COALESCE(SUM(COALESCE(c.final_approved_total, c.l2_approved_total, c.l1_approved_total, 0)),0) AS approved
       FROM expense_claims c WHERE ${where}
       GROUP BY name ORDER BY claimed DESC`,
      params
    );
    const [byMonth] = await pool.query(
      `SELECT DATE_FORMAT(c.submitted_at, '%Y-%m') AS month,
              COUNT(*) AS claims,
              COALESCE(SUM(c.total_claimed),0) AS claimed,
              COALESCE(SUM(COALESCE(c.final_approved_total, c.l2_approved_total, c.l1_approved_total, 0)),0) AS approved
       FROM expense_claims c WHERE ${where} AND c.submitted_at IS NOT NULL
       GROUP BY month ORDER BY month ASC`,
      params
    );
    const [[aging]] = await pool.query(
      `SELECT
         SUM(CASE WHEN DATEDIFF(NOW(), c.submitted_at) <= 2 THEN 1 ELSE 0 END) AS d0_2,
         SUM(CASE WHEN DATEDIFF(NOW(), c.submitted_at) BETWEEN 3 AND 5 THEN 1 ELSE 0 END) AS d3_5,
         SUM(CASE WHEN DATEDIFF(NOW(), c.submitted_at) BETWEEN 6 AND 10 THEN 1 ELSE 0 END) AS d6_10,
         SUM(CASE WHEN DATEDIFF(NOW(), c.submitted_at) > 10 THEN 1 ELSE 0 END) AS d10_plus
       FROM expense_claims c
       WHERE ${where} AND c.current_status IN ('pending_l1','pending_l2','pending_final','pending_finance')`,
      params
    );

    const num = (v) => Number(v || 0);
    res.json({
      success: true,
      data: {
        cards: {
          totalClaims: num(cards.totalClaims),
          pendingL1: num(cards.pendingL1),
          pendingL2: num(cards.pendingL2),
          pendingFinal: num(cards.pendingFinal),
          pendingFinance: num(cards.pendingFinance),
          approved: num(cards.approvedCount),
          rejected: num(cards.rejectedCount),
          returned: num(cards.returnedCount),
          completed: num(cards.completedCount),
          totalClaimed: num(cards.totalClaimed),
          totalApproved: num(cards.totalApproved),
          totalReduced: totalReduced > 0 ? Number(totalReduced.toFixed(2)) : 0,
          totalProcessed: num(cards.totalProcessed),
        },
        byCategory: byCategory.map((r) => ({ name: r.name, claimed: num(r.claimed), approved: num(r.approved), entries: num(r.entries) })),
        byDepartment: byDepartment.map((r) => ({ name: r.name, claims: num(r.claims), claimed: num(r.claimed), approved: num(r.approved) })),
        byMonth: byMonth.map((r) => ({ month: r.month, claims: num(r.claims), claimed: num(r.claimed), approved: num(r.approved) })),
        aging: [
          { bucket: "0–2 days", count: num(aging.d0_2) },
          { bucket: "3–5 days", count: num(aging.d3_5) },
          { bucket: "6–10 days", count: num(aging.d6_10) },
          { bucket: "10+ days", count: num(aging.d10_plus) },
        ],
      },
    });
  } catch (error) {
    fail(res, error, "Failed to load the dashboard.");
  }
});

// ===========================================================================
// PHASE 8/9 — Admin: categories, sub-categories, cost centres, policies,
// approval matrix. All guarded by the expense-claims-admin page permission.
// ===========================================================================

const ADMIN_PAGE = PAGE_IDS.admin; // "expense-claims-admin"
const POLICY_PERIODS = ["day", "claim"];

router.get("/admin/config", requirePagePermission(ADMIN_PAGE, "view"), async (req, res) => {
  try {
    await ensureTables();
    const [categories] = await pool.query(
      `SELECT id, name, display_order, requires_bill, is_active FROM expense_claim_categories ORDER BY display_order ASC, name ASC`
    );
    const [subCategories] = await pool.query(
      `SELECT s.id, s.category_id, s.name, s.is_active, c.name AS category
       FROM expense_claim_sub_categories s JOIN expense_claim_categories c ON c.id = s.category_id
       ORDER BY c.name ASC, s.name ASC`
    );
    const [costCentres] = await pool.query(
      `SELECT id, name, code, is_active FROM expense_cost_centres ORDER BY name ASC`
    );
    const [policies] = await pool.query(
      `SELECT id, category, sub_category, period, max_amount, hard_limit, is_active FROM expense_policies ORDER BY category ASC, id ASC`
    );
    const [matrix] = await pool.query(
      `SELECT m.*, u1.name AS l1_name, u2.name AS l2_name, u3.name AS final_name
       FROM expense_approval_matrix m
       LEFT JOIN users u1 ON u1.id = m.l1_user_id
       LEFT JOIN users u2 ON u2.id = m.l2_user_id
       LEFT JOIN users u3 ON u3.id = m.final_user_id
       ORDER BY (m.category = 'ALL') DESC, m.category ASC, m.min_amount ASC`
    );
    const [users] = await pool.query(
      `SELECT id, name, designation FROM users WHERE LOWER(COALESCE(status,'active')) = 'active' ORDER BY name ASC`
    );

    res.json({
      success: true,
      data: {
        categories: categories.map((c) => ({
          id: c.id, name: c.name, displayOrder: c.display_order,
          requiresBill: Boolean(c.requires_bill), isActive: Boolean(c.is_active),
        })),
        subCategories: subCategories.map((s) => ({
          id: s.id, categoryId: s.category_id, category: s.category, name: s.name, isActive: Boolean(s.is_active),
        })),
        costCentres: costCentres.map((c) => ({ id: c.id, name: c.name, code: c.code, isActive: Boolean(c.is_active) })),
        policies: policies.map((p) => ({
          id: p.id, category: p.category, subCategory: p.sub_category, period: p.period,
          maxAmount: Number(p.max_amount), hardLimit: Boolean(p.hard_limit), isActive: Boolean(p.is_active),
        })),
        matrix: matrix.map((m) => ({
          id: m.id, category: m.category, minAmount: Number(m.min_amount),
          maxAmount: m.max_amount === null ? null : Number(m.max_amount),
          l1UserId: m.l1_user_id, l2UserId: m.l2_user_id, finalUserId: m.final_user_id,
          l1Name: m.l1_name, l2Name: m.l2_name, finalName: m.final_name, isActive: Boolean(m.is_active),
        })),
        users: users.map((u) => ({ id: u.id, name: u.name, designation: u.designation })),
      },
    });
  } catch (error) {
    fail(res, error, "Failed to load admin configuration.");
  }
});

// --- categories ---
router.post("/admin/categories", requirePagePermission(ADMIN_PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const name = String(req.body?.name ?? "").trim();
    if (!name) throw httpError(400, "Category name is required.");
    const [[max]] = await pool.query(`SELECT COALESCE(MAX(display_order), 0) AS m FROM expense_claim_categories`);
    await pool.query(
      `INSERT INTO expense_claim_categories (name, display_order, requires_bill) VALUES (?, ?, ?)`,
      [name, Number(max.m) + 1, req.body?.requiresBill ? 1 : 0]
    );
    res.json({ success: true });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return fail(res, httpError(409, "That category already exists."));
    fail(res, error, "Failed to add the category.");
  }
});

router.put("/admin/categories/:id", requirePagePermission(ADMIN_PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const sets = [];
    const params = [];
    if (req.body?.name !== undefined) { sets.push("name = ?"); params.push(String(req.body.name).trim()); }
    if (req.body?.requiresBill !== undefined) { sets.push("requires_bill = ?"); params.push(req.body.requiresBill ? 1 : 0); }
    if (req.body?.isActive !== undefined) { sets.push("is_active = ?"); params.push(req.body.isActive ? 1 : 0); }
    if (!sets.length) throw httpError(400, "Nothing to update.");
    await pool.query(`UPDATE expense_claim_categories SET ${sets.join(", ")} WHERE id = ?`, [...params, req.params.id]);
    res.json({ success: true });
  } catch (error) {
    fail(res, error, "Failed to update the category.");
  }
});

// --- sub-categories ---
router.post("/admin/sub-categories", requirePagePermission(ADMIN_PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const categoryId = Number(req.body?.categoryId);
    const name = String(req.body?.name ?? "").trim();
    if (!categoryId || !name) throw httpError(400, "Category and sub-category name are required.");
    await pool.query(
      `INSERT INTO expense_claim_sub_categories (category_id, name) VALUES (?, ?)`,
      [categoryId, name]
    );
    res.json({ success: true });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return fail(res, httpError(409, "That sub-category already exists."));
    fail(res, error, "Failed to add the sub-category.");
  }
});

router.delete("/admin/sub-categories/:id", requirePagePermission(ADMIN_PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    await pool.query(`DELETE FROM expense_claim_sub_categories WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    fail(res, error, "Failed to delete the sub-category.");
  }
});

// --- cost centres ---
router.post("/admin/cost-centres", requirePagePermission(ADMIN_PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const name = String(req.body?.name ?? "").trim();
    if (!name) throw httpError(400, "Cost centre name is required.");
    await pool.query(
      `INSERT INTO expense_cost_centres (name, code) VALUES (?, ?)`,
      [name, String(req.body?.code ?? "").trim() || null]
    );
    res.json({ success: true });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return fail(res, httpError(409, "That cost centre already exists."));
    fail(res, error, "Failed to add the cost centre.");
  }
});

router.put("/admin/cost-centres/:id", requirePagePermission(ADMIN_PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const sets = [];
    const params = [];
    if (req.body?.name !== undefined) { sets.push("name = ?"); params.push(String(req.body.name).trim()); }
    if (req.body?.code !== undefined) { sets.push("code = ?"); params.push(String(req.body.code).trim() || null); }
    if (req.body?.isActive !== undefined) { sets.push("is_active = ?"); params.push(req.body.isActive ? 1 : 0); }
    if (!sets.length) throw httpError(400, "Nothing to update.");
    await pool.query(`UPDATE expense_cost_centres SET ${sets.join(", ")} WHERE id = ?`, [...params, req.params.id]);
    res.json({ success: true });
  } catch (error) {
    fail(res, error, "Failed to update the cost centre.");
  }
});

router.delete("/admin/cost-centres/:id", requirePagePermission(ADMIN_PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    await pool.query(`DELETE FROM expense_cost_centres WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    fail(res, error, "Failed to delete the cost centre.");
  }
});

// --- policies ---
router.post("/admin/policies", requirePagePermission(ADMIN_PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const category = String(req.body?.category ?? "").trim();
    const period = String(req.body?.period ?? "day").trim().toLowerCase();
    const maxAmount = toMoney(req.body?.maxAmount);
    if (!category) throw httpError(400, "Category is required.");
    if (!POLICY_PERIODS.includes(period)) throw httpError(400, "Period must be 'day' or 'claim'.");
    if (Number.isNaN(maxAmount) || maxAmount <= 0) throw httpError(400, "Max amount must be a positive number.");
    await pool.query(
      `INSERT INTO expense_policies (category, sub_category, period, max_amount, hard_limit)
       VALUES (?, ?, ?, ?, ?)`,
      [category, String(req.body?.subCategory ?? "").trim() || null, period, maxAmount, req.body?.hardLimit ? 1 : 0]
    );
    res.json({ success: true });
  } catch (error) {
    fail(res, error, "Failed to add the policy.");
  }
});

router.put("/admin/policies/:id", requirePagePermission(ADMIN_PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const sets = [];
    const params = [];
    if (req.body?.category !== undefined) { sets.push("category = ?"); params.push(String(req.body.category).trim()); }
    if (req.body?.subCategory !== undefined) { sets.push("sub_category = ?"); params.push(String(req.body.subCategory).trim() || null); }
    if (req.body?.period !== undefined) {
      const p = String(req.body.period).toLowerCase();
      if (!POLICY_PERIODS.includes(p)) throw httpError(400, "Period must be 'day' or 'claim'.");
      sets.push("period = ?"); params.push(p);
    }
    if (req.body?.maxAmount !== undefined) {
      const m = toMoney(req.body.maxAmount);
      if (Number.isNaN(m) || m <= 0) throw httpError(400, "Max amount must be a positive number.");
      sets.push("max_amount = ?"); params.push(m);
    }
    if (req.body?.hardLimit !== undefined) { sets.push("hard_limit = ?"); params.push(req.body.hardLimit ? 1 : 0); }
    if (req.body?.isActive !== undefined) { sets.push("is_active = ?"); params.push(req.body.isActive ? 1 : 0); }
    if (!sets.length) throw httpError(400, "Nothing to update.");
    await pool.query(`UPDATE expense_policies SET ${sets.join(", ")} WHERE id = ?`, [...params, req.params.id]);
    res.json({ success: true });
  } catch (error) {
    fail(res, error, "Failed to update the policy.");
  }
});

router.delete("/admin/policies/:id", requirePagePermission(ADMIN_PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    await pool.query(`DELETE FROM expense_policies WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    fail(res, error, "Failed to delete the policy.");
  }
});

// --- default approval chain (the single catch-all rule) -------------------
// A friendly wrapper over the catch-all matrix row (category = 'ALL',
// min_amount = 0, max_amount = NULL). This is the "Expense Settings" simple
// path: an admin just picks L1 / L2 / Final by name.

async function getCatchAllRule() {
  const [rows] = await pool.query(
    `SELECT m.*, u1.name AS l1_name, u2.name AS l2_name, u3.name AS final_name
     FROM expense_approval_matrix m
     LEFT JOIN users u1 ON u1.id = m.l1_user_id
     LEFT JOIN users u2 ON u2.id = m.l2_user_id
     LEFT JOIN users u3 ON u3.id = m.final_user_id
     WHERE m.category = 'ALL'
     ORDER BY m.min_amount ASC, m.id ASC
     LIMIT 1`
  );
  return rows[0] || null;
}

router.get("/admin/approval-chain", requirePagePermission(ADMIN_PAGE, "view"), async (req, res) => {
  try {
    await ensureTables();
    const rule = await getCatchAllRule();
    res.json({
      success: true,
      data: {
        l1UserId: rule?.l1_user_id ?? null,
        l2UserId: rule?.l2_user_id ?? null,
        finalUserId: rule?.final_user_id ?? null,
        l1Name: rule?.l1_name ?? null,
        l2Name: rule?.l2_name ?? null,
        finalName: rule?.final_name ?? null,
        configured: Boolean(rule?.l1_user_id),
      },
    });
  } catch (error) {
    fail(res, error, "Failed to load the approval chain.");
  }
});

router.put("/admin/approval-chain", requirePagePermission(ADMIN_PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v) || null);
    const l1 = num(req.body?.l1UserId);
    const l2 = num(req.body?.l2UserId);
    const fin = num(req.body?.finalUserId);
    if (!l1) throw httpError(400, "Pick an L1 approver — it is required.");
    if (l2 && l2 === l1) throw httpError(400, "L2 approver must be different from L1.");
    if (fin && (fin === l1 || fin === l2)) throw httpError(400, "Final approver must be different from L1 and L2.");

    const rule = await getCatchAllRule();
    if (rule) {
      await pool.query(
        `UPDATE expense_approval_matrix
         SET l1_user_id = ?, l2_user_id = ?, final_user_id = ?, is_active = 1
         WHERE id = ?`,
        [l1, l2, fin, rule.id]
      );
    } else {
      await pool.query(
        `INSERT INTO expense_approval_matrix (category, min_amount, max_amount, l1_user_id, l2_user_id, final_user_id)
         VALUES ('ALL', 0, NULL, ?, ?, ?)`,
        [l1, l2, fin]
      );
    }
    res.json({ success: true });
  } catch (error) {
    fail(res, error, "Failed to save the approval chain.");
  }
});

// --- approval matrix ---
function parseMatrixBody(body) {
  const category = String(body?.category ?? "ALL").trim() || "ALL";
  const minAmount = toMoney(body?.minAmount ?? 0);
  const maxRaw = body?.maxAmount;
  const maxAmount = maxRaw === null || maxRaw === undefined || maxRaw === "" ? null : toMoney(maxRaw);
  if (Number.isNaN(minAmount) || minAmount < 0) throw httpError(400, "Min amount must be zero or more.");
  if (maxAmount !== null && (Number.isNaN(maxAmount) || maxAmount < minAmount)) {
    throw httpError(400, "Max amount must be blank or greater than the min amount.");
  }
  const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
  return {
    category,
    minAmount,
    maxAmount,
    l1: num(body?.l1UserId),
    l2: num(body?.l2UserId),
    final: num(body?.finalUserId),
  };
}

router.post("/admin/matrix", requirePagePermission(ADMIN_PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const m = parseMatrixBody(req.body);
    if (!m.l1) throw httpError(400, "An L1 approver is required.");
    await pool.query(
      `INSERT INTO expense_approval_matrix (category, min_amount, max_amount, l1_user_id, l2_user_id, final_user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [m.category, m.minAmount, m.maxAmount, m.l1, m.l2, m.final]
    );
    res.json({ success: true });
  } catch (error) {
    fail(res, error, "Failed to add the matrix rule.");
  }
});

router.put("/admin/matrix/:id", requirePagePermission(ADMIN_PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const m = parseMatrixBody(req.body);
    const sets = ["category = ?", "min_amount = ?", "max_amount = ?", "l1_user_id = ?", "l2_user_id = ?", "final_user_id = ?"];
    const params = [m.category, m.minAmount, m.maxAmount, m.l1, m.l2, m.final];
    if (req.body?.isActive !== undefined) { sets.push("is_active = ?"); params.push(req.body.isActive ? 1 : 0); }
    await pool.query(`UPDATE expense_approval_matrix SET ${sets.join(", ")} WHERE id = ?`, [...params, req.params.id]);
    res.json({ success: true });
  } catch (error) {
    fail(res, error, "Failed to update the matrix rule.");
  }
});

router.delete("/admin/matrix/:id", requirePagePermission(ADMIN_PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const [[row]] = await pool.query(`SELECT COUNT(*) AS c FROM expense_approval_matrix`);
    if (Number(row.c) <= 1) throw httpError(409, "At least one approval matrix rule must remain.");
    await pool.query(`DELETE FROM expense_approval_matrix WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    fail(res, error, "Failed to delete the matrix rule.");
  }
});

// ===========================================================================
// PHASE 10 — Notifications (personal; any signed-in user reads their own).
// ===========================================================================

router.get("/notifications", async (req, res) => {
  try {
    await ensureTables();
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const unreadOnly = String(req.query.unreadOnly || "") === "1";
    const [rows] = await pool.query(
      `SELECT id, claim_id, claim_number, type, message, is_read, created_at
       FROM expense_claim_notifications
       WHERE user_id = ? ${unreadOnly ? "AND is_read = 0" : ""}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [req.authUser.id, limit]
    );
    const [[count]] = await pool.query(
      `SELECT COUNT(*) AS unread FROM expense_claim_notifications WHERE user_id = ? AND is_read = 0`,
      [req.authUser.id]
    );
    res.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id, claimId: r.claim_id, claimNumber: r.claim_number, type: r.type,
        message: r.message, isRead: Boolean(r.is_read), createdAt: r.created_at,
      })),
      unread: Number(count.unread || 0),
    });
  } catch (error) {
    fail(res, error, "Failed to load notifications.");
  }
});

router.post("/notifications/:id/read", async (req, res) => {
  try {
    await ensureTables();
    await pool.query(
      `UPDATE expense_claim_notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
      [req.params.id, req.authUser.id]
    );
    res.json({ success: true });
  } catch (error) {
    fail(res, error, "Failed to update the notification.");
  }
});

router.post("/notifications/read-all", async (req, res) => {
  try {
    await ensureTables();
    await pool.query(
      `UPDATE expense_claim_notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`,
      [req.authUser.id]
    );
    res.json({ success: true });
  } catch (error) {
    fail(res, error, "Failed to update notifications.");
  }
});

module.exports = router;
