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

const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const ExcelJS = require("exceljs");

// 256-bit opaque capability token for a single document. Used to build the
// secure, session-less URLs embedded in the Excel export (see
// backend/routes/expenseDocumentRoutes.js). The DB id is never exposed there.
const newAccessToken = () => crypto.randomBytes(32).toString("hex"); // 64 hex chars

const router = express.Router();

const { db } = require("../config/db");
const { authMiddleware } = require("../middleware/circleAccess");
const { requirePagePermission, hasPagePermission } = require("../middleware/pagePermission");
const {
  DEFAULT_CATEGORIES,
  DEFAULT_SUB_CATEGORIES,
  DEFAULT_COST_CENTRES,
  EMPLOYEE_EDITABLE_STATUSES,
  EXPENSE_FOR,
  CLAIM_TYPES,
  BILLING_TYPES,
  WORK_CATEGORIES,
  EXPENSE_CLAIM_DOMAINS,
  DEFAULT_VENDOR_TYPES,
  DEFAULT_EMPLOYEE_TYPES,
  ALLOWED_BILL_EXTENSIONS,
  ALLOWED_BILL_MIME_TYPES,
  MAX_BILL_BYTES,
  PAGE_IDS,
} = require("../constants/expenseClaimConstants");

const CLAIM_TYPE_VALUES = CLAIM_TYPES.map((t) => t.value);
const BILLING_TYPE_VALUES = BILLING_TYPES.map((t) => t.value);

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
      access_token CHAR(64) NULL,
      token_expires_at DATETIME NULL,
      uploaded_by INT NULL,
      uploaded_by_name VARCHAR(160) NULL,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_att_claim (claim_id),
      INDEX idx_att_item (item_id),
      UNIQUE KEY uq_att_access_token (access_token)
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

  // ------------------------------------------------------------------------
  // Dynamic Raise Expense — small admin-managed masters (enhancement).
  // ------------------------------------------------------------------------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_vendor_types (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_employee_types (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_vendors (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      vendor_type VARCHAR(120) NULL,
      gstin VARCHAR(20) NULL,
      phone VARCHAR(20) NULL,
      email VARCHAR(150) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_by INT NULL,
      created_by_name VARCHAR(160) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_vendor_name_type (name, vendor_type),
      INDEX idx_vendor_type (vendor_type)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_pos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      po_number VARCHAR(80) NOT NULL UNIQUE,
      work_category VARCHAR(20) NULL,
      domain VARCHAR(60) NULL,
      client_name VARCHAR(200) NULL,
      site_route VARCHAR(300) NULL,
      estimate_wcc_amount DECIMAL(14,2) NULL,
      description VARCHAR(500) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_po_category (work_category)
    )
  `);

  // Additive columns on expense_claim_items for the dynamic form. All optional,
  // backward-compatible (no existing rows depend on them).
  await ensureColumn("expense_claim_items", "expense_for", "VARCHAR(12) NULL");
  await ensureColumn("expense_claim_items", "employee_type", "VARCHAR(120) NULL");
  await ensureColumn("expense_claim_items", "emp_ref_code", "VARCHAR(60) NULL");
  await ensureColumn("expense_claim_items", "emp_ref_name", "VARCHAR(160) NULL");
  await ensureColumn("expense_claim_items", "emp_ref_designation", "VARCHAR(120) NULL");
  await ensureColumn("expense_claim_items", "emp_ref_circle", "VARCHAR(120) NULL");
  await ensureColumn("expense_claim_items", "emp_ref_cmp", "VARCHAR(120) NULL");
  await ensureColumn("expense_claim_items", "vendor_id", "INT NULL");
  await ensureColumn("expense_claim_items", "vendor_name", "VARCHAR(200) NULL");
  await ensureColumn("expense_claim_items", "vendor_type", "VARCHAR(120) NULL");
  await ensureColumn("expense_claim_items", "claim_type", "VARCHAR(20) NULL");
  await ensureColumn("expense_claim_items", "billing_type", "VARCHAR(20) NULL");
  await ensureColumn("expense_claim_items", "client_name", "VARCHAR(200) NULL");
  await ensureColumn("expense_claim_items", "work_category", "VARCHAR(20) NULL");
  await ensureColumn("expense_claim_items", "po_number", "VARCHAR(80) NULL");
  await ensureColumn("expense_claim_items", "domain", "VARCHAR(60) NULL");
  await ensureColumn("expense_claim_items", "other_domain", "VARCHAR(120) NULL");
  await ensureColumn("expense_claim_items", "site_route", "VARCHAR(500) NULL");
  await ensureColumn("expense_claim_items", "estimate_wcc_amount", "DECIMAL(14,2) NULL");
  await ensureColumn("expense_claim_items", "bank_account", "VARCHAR(40) NULL");
  await ensureColumn("expense_claim_items", "ifsc", "VARCHAR(20) NULL");
  await ensureColumn("expense_vendors", "bank_account", "VARCHAR(40) NULL");
  await ensureColumn("expense_vendors", "ifsc", "VARCHAR(20) NULL");

  // Finance records the exact amount actually paid (<= final approved). Additive
  // and null-safe for existing finance rows.
  await ensureColumn("expense_claim_finance", "payment_amount", "DECIMAL(14,2) NULL");

  // Secure, session-less document links. `access_token` is a 256-bit random
  // capability id used by GET /api/expense-documents/:token; `token_expires_at`
  // is optional (NULL = the link is valid until the attachment is deleted).
  await ensureColumn("expense_claim_attachments", "access_token", "CHAR(64) NULL");
  await ensureColumn("expense_claim_attachments", "token_expires_at", "DATETIME NULL");
  await backfillAttachmentTokens();
  await ensureUniqueIndex("expense_claim_attachments", "uq_att_access_token", "access_token");

  // employee_user_id is the CLAIMANT's portal user id. It is now nullable so a
  // claim can be raised on behalf of an employee who has no portal login (their
  // identity then lives in employee_code / employee_name). The submitter is
  // always expense_claims.created_by. Safe/idempotent to run every boot.
  await pool.query(`ALTER TABLE expense_claims MODIFY employee_user_id INT NULL`).catch(() => {});

  await seedMasters();
}

// Add a column only if it isn't already there (safe to run every boot).
async function ensureColumn(table, column, definition) {
  try {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") throw error;
  }
}

// Add a unique index only if it isn't already there (safe to run every boot).
async function ensureUniqueIndex(table, indexName, columns) {
  try {
    await pool.query(`ALTER TABLE ${table} ADD UNIQUE KEY ${indexName} (${columns})`);
  } catch (error) {
    if (error.code !== "ER_DUP_KEYNAME") throw error;
  }
}

// One-time migration: give every pre-existing attachment a capability token so
// its Excel links work. Idempotent — after the first run no rows match.
async function backfillAttachmentTokens() {
  const [rows] = await pool.query(
    `SELECT id FROM expense_claim_attachments WHERE access_token IS NULL OR access_token = ''`
  );
  for (const r of rows) {
    await pool.query(`UPDATE expense_claim_attachments SET access_token = ? WHERE id = ?`, [
      newAccessToken(),
      r.id,
    ]);
  }
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

  // The three operational categories always exist and stay active — the
  // PO / Domain / WCC rules key off these exact names. Admins may add or
  // remove any other category.
  await pool.query(
    `INSERT IGNORE INTO expense_claim_categories (name, display_order, requires_bill) VALUES ?`,
    [WORK_CATEGORIES.map((name, i) => [name, i, 0])]
  );
  await pool.query(
    `UPDATE expense_claim_categories SET is_active = 1 WHERE name IN (?)`,
    [WORK_CATEGORIES]
  );

  const [vtCount] = await pool.query(`SELECT COUNT(*) AS c FROM expense_vendor_types`);
  if (vtCount[0].c === 0) {
    await pool.query(
      `INSERT INTO expense_vendor_types (name) VALUES ?`,
      [DEFAULT_VENDOR_TYPES.map((n) => [n])]
    );
  }
  const [etCount] = await pool.query(`SELECT COUNT(*) AS c FROM expense_employee_types`);
  if (etCount[0].c === 0) {
    await pool.query(
      `INSERT INTO expense_employee_types (name) VALUES ?`,
      [DEFAULT_EMPLOYEE_TYPES.map((n) => [n])]
    );
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

// Holding the "delete" permission on any of these Expense Claims screens grants
// the privileged capability to remove a claim in any status. Finance is
// deliberately excluded — the Finance module is strictly read-only, so a
// Finance user can never delete a claim (only an admin, or a My Expenses /
// Approvals / Dashboard / Admin delete grant, can). Kept in sync with PAGE_IDS
// and the frontend permission map (frontend/src/utils/access.js).
const EXPENSE_CLAIM_PAGES = [
  PAGE_IDS.employee,
  PAGE_IDS.approvals,
  PAGE_IDS.dashboard,
  PAGE_IDS.admin,
];
const canDeleteAnyClaim = (authUser) =>
  isAdmin(authUser) ||
  EXPENSE_CLAIM_PAGES.some((page) => hasPagePermission(authUser, page, "delete"));

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

// Validate one incoming expense item for the dynamic form. `strict` (submit)
// enforces every conditionally-required field; a draft save is lenient so
// half-filled cards can be kept. Only fields relevant to the item's own
// selections are ever validated.
// `categoryNames` is kept for signature compatibility with older callers.
function validateItem(raw, index, categoryNames, { strict }) {
  const errors = [];
  const label = `Item ${index + 1}`;
  const s = (v) => String(v ?? "").trim();

  const expenseFor = s(raw?.expenseFor ?? raw?.expense_for).toLowerCase() || "employee";
  const employeeType = s(raw?.employeeType ?? raw?.employee_type);
  const empRefCode = s(raw?.empRefCode ?? raw?.emp_ref_code);
  const empRefName = s(raw?.empRefName ?? raw?.emp_ref_name);
  const empRefDesignation = s(raw?.empRefDesignation ?? raw?.emp_ref_designation);
  const empRefCircle = s(raw?.empRefCircle ?? raw?.emp_ref_circle);
  const empRefCmp = s(raw?.empRefCmp ?? raw?.emp_ref_cmp);
  const vendorId = Number(raw?.vendorId ?? raw?.vendor_id) || null;
  const vendorName = s(raw?.vendorName ?? raw?.vendor_name);
  const vendorType = s(raw?.vendorType ?? raw?.vendor_type);
  const claimType = s(raw?.claimType ?? raw?.claim_type).toLowerCase();
  const billingType = s(raw?.billingType ?? raw?.billing_type).toLowerCase();
  const clientName = s(raw?.clientName ?? raw?.client_name);
  const category = s(raw?.category);
  const workCategory = s(raw?.workCategory ?? raw?.work_category);
  const poNumber = s(raw?.poNumber ?? raw?.po_number);
  const domain = s(raw?.domain);
  const otherDomain = s(raw?.otherDomain ?? raw?.other_domain);
  const siteRoute = s(raw?.siteRoute ?? raw?.site_route);
  const description = s(raw?.description);
  const bankAccount = s(raw?.bankAccount ?? raw?.bank_account);
  const ifsc = s(raw?.ifsc).toUpperCase();
  const wccRaw = raw?.estimateWccAmount ?? raw?.estimate_wcc_amount;
  const estimateWcc =
    wccRaw === null || wccRaw === undefined || wccRaw === "" ? null : toMoney(wccRaw);

  const expenseDate = normalizeDate(raw?.expenseDate ?? raw?.expense_date);
  if (expenseDate === undefined) errors.push(`${label}: Expense Date is not a valid date.`);
  else if (strict && !expenseDate) errors.push(`${label}: Expense Date is required.`);

  const amount = toMoney(raw?.claimedAmount ?? raw?.claimed_amount);
  if (Number.isNaN(amount)) errors.push(`${label}: Claimed Amount must be a number.`);
  else if (amount < 0) errors.push(`${label}: Claimed Amount cannot be negative.`);
  else if (strict && amount <= 0) errors.push(`${label}: Claimed Amount must be greater than zero.`);

  if (!EXPENSE_FOR.includes(expenseFor)) errors.push(`${label}: choose whether this is an Employee or Vendor expense.`);

  if (strict) {
    if (expenseFor === "employee") {
      if (!empRefCode) errors.push(`${label}: enter and fetch a valid Employee ID / HRMS ID.`);
    } else if (expenseFor === "vendor") {
      if (!vendorId) errors.push(`${label}: select a Vendor.`);
    }
    if (!claimType) errors.push(`${label}: Claim Type is required.`);
    if (!billingType) errors.push(`${label}: Billing Type is required.`);
    if (!workCategory) errors.push(`${label}: Expense Category is required.`);
    if (!siteRoute) errors.push(`${label}: Site / Route Details is required.`);
    if (!description) errors.push(`${label}: Expense Description is required.`);

    if (billingType === "billable" && !clientName) {
      errors.push(`${label}: Client / Account is required for a Billable expense.`);
    }
    if (["O&M", "OOS", "Project"].includes(workCategory) && !poNumber) {
      errors.push(`${label}: PO No. is required for ${workCategory}.`);
    }
    if (workCategory === "O&M") {
      if (!domain) errors.push(`${label}: Domain is required for O&M.`);
      if (domain === "Others" && !otherDomain) {
        errors.push(`${label}: Other Domain Name is required when Domain is "Others".`);
      }
    }
  }
  if (claimType && !CLAIM_TYPE_VALUES.includes(claimType)) errors.push(`${label}: invalid Claim Type.`);
  if (billingType && !BILLING_TYPE_VALUES.includes(billingType)) errors.push(`${label}: invalid Billing Type.`);
  if (estimateWcc !== null && Number.isNaN(estimateWcc)) errors.push(`${label}: Estimate WCC Amount must be a number.`);

  return {
    errors,
    value: {
      id: Number(raw?.id) || null,
      srNo: Number(raw?.srNo || raw?.sr_no || index + 1),
      expenseDate: expenseDate || null,
      // admin-managed expense head (dropdown on each item); falls back for legacy rows
      category: category || workCategory || "General",
      subCategory: null,
      description: description || null,
      claimedAmount: Number.isNaN(amount) ? 0 : amount,
      billNumber: String(raw?.billNumber ?? raw?.bill_number ?? "").trim() || null,
      // dynamic-form fields
      expenseFor: EXPENSE_FOR.includes(expenseFor) ? expenseFor : "employee",
      employeeType: employeeType || null,
      empRefCode: empRefCode || null,
      empRefName: empRefName || null,
      empRefDesignation: empRefDesignation || null,
      empRefCircle: empRefCircle || null,
      empRefCmp: empRefCmp || null,
      vendorId,
      vendorName: vendorName || null,
      vendorType: vendorType || null,
      claimType: claimType || null,
      billingType: billingType || null,
      clientName: billingType === "billable" ? clientName || null : null,
      workCategory: workCategory || null,
      poNumber: poNumber || null,
      domain: workCategory === "O&M" ? domain || null : domain || null,
      otherDomain: domain === "Others" ? otherDomain || null : null,
      siteRoute: siteRoute || null,
      estimateWccAmount: estimateWcc,
      bankAccount: bankAccount || null,
      ifsc: ifsc || null,
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
    cmp: row.cost_centre, // `cost_centre` column now holds the employee's CMP
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
    // Alias: the logged-in user who raised/submitted the claim. May differ from
    // employeeUserId (the claimant) when raised on someone else's behalf.
    submittedByUserId: row.created_by,
    submittedByName: row.created_by_name || null, // present only when the query joins it
    submittedByEmployeeCode: row.created_by_code || null, // present only when the query joins it
    // Per-stage approver names + approval timestamps — present only when the
    // query / bundle builder joins them (claim detail, approvals detail, finance).
    l1ApproverName: row.l1_approver_name || null,
    l2ApproverName: row.l2_approver_name || null,
    finalApproverName: row.final_approver_name || null,
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
    expenseFor: row.expense_for || "employee",
    employeeType: row.employee_type || null,
    empRefCode: row.emp_ref_code || null,
    empRefName: row.emp_ref_name || null,
    empRefDesignation: row.emp_ref_designation || null,
    empRefCircle: row.emp_ref_circle || null,
    empRefCmp: row.emp_ref_cmp || null,
    vendorId: row.vendor_id || null,
    vendorName: row.vendor_name || null,
    vendorType: row.vendor_type || null,
    claimType: row.claim_type || null,
    billingType: row.billing_type || null,
    clientName: row.client_name || null,
    workCategory: row.work_category || null,
    poNumber: row.po_number || null,
    domain: row.domain || null,
    otherDomain: row.other_domain || null,
    siteRoute: row.site_route || null,
    estimateWccAmount: row.estimate_wcc_amount === null || row.estimate_wcc_amount === undefined ? null : Number(row.estimate_wcc_amount),
    bankAccount: row.bank_account || null,
    ifsc: row.ifsc || null,
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

// Actions in the audit trail that timestamp the completion of an approval stage.
const STAGE_DONE_ACTIONS = {
  l1: ["L1_APPROVED", "L1_APPROVED_WITH_CHANGES"],
  l2: ["L2_APPROVED", "L2_APPROVED_WITH_CHANGES"],
  final: ["FINAL_APPROVED", "FINAL_APPROVED_WITH_CHANGES"],
};

// Build the per-stage approval summary the claim-detail timeline renders. Uses
// only real data: the frozen approver ids/names, the claim's current status, the
// per-stage approved totals, and the audit trail for timestamps. Every stage is
// one of: approved | rejected | pending | skipped (no approver in the chain).
function buildApprovalTimeline(claim, auditRows) {
  const stageAt = (stage) => {
    const acts = STAGE_DONE_ACTIONS[stage] || [];
    const hit = [...auditRows].reverse().find(
      (a) => a.stage === stage && acts.includes(a.action)
    );
    return hit ? hit.created_at : null;
  };
  const rejected = [...auditRows].reverse().find((a) => a.action === "REJECTED") || null;
  const sentBack = [...auditRows].reverse().find((a) => a.action === "SENT_BACK") || null;
  const status = claim.current_status;

  const stageState = (stage, approverId, approvedTotal) => {
    if (rejected && rejected.stage === stage) {
      return { status: "rejected", at: rejected.created_at, reason: rejected.reason || null };
    }
    if (!approverId) return { status: "skipped", at: null };
    if (approvedTotal != null) return { status: "approved", at: stageAt(stage) };
    if (status === "rejected") return { status: "not_reached", at: null };
    if (status === STAGE_PENDING_STATUS[stage]) return { status: "pending", at: null };
    // Claim has moved past this stage without a recorded total (legacy) — or has
    // not reached it yet.
    const order = ["pending_l1", "pending_l2", "pending_final", "pending_finance"];
    const stageIdx = { l1: 0, l2: 1, final: 2 }[stage];
    const curIdx = order.indexOf(status);
    if (curIdx > stageIdx) return { status: "approved", at: stageAt(stage) };
    return { status: "pending", at: null };
  };

  return {
    raised: {
      at: claim.submitted_at || claim.created_at || null,
      byUserId: claim.created_by || null,
      byName: claim.created_by_name || null,
      claimantUserId: claim.employee_user_id || null,
      claimantName: claim.employee_name || null,
      onBehalf: claim.employee_user_id != null && claim.employee_user_id !== claim.created_by,
      sentBackAt: sentBack ? sentBack.created_at : null,
      sentBackReason: sentBack ? sentBack.reason || null : null,
    },
    l1: {
      approverUserId: claim.l1_approver_user_id || null,
      approverName: claim.l1_approver_name || null,
      ...stageState("l1", claim.l1_approver_user_id, claim.l1_approved_total),
    },
    l2: {
      approverUserId: claim.l2_approver_user_id || null,
      approverName: claim.l2_approver_name || null,
      ...stageState("l2", claim.l2_approver_user_id, claim.l2_approved_total),
    },
    final: {
      approverUserId: claim.final_approver_user_id || null,
      approverName: claim.final_approver_name || null,
      ...stageState("final", claim.final_approver_user_id, claim.final_approved_total),
    },
  };
}

async function fetchClaimBundle(claimId) {
  const [claimRows] = await pool.query(
    `SELECT c.*, su.name AS created_by_name, su.employee_id AS created_by_code,
            u1.name AS l1_approver_name, u2.name AS l2_approver_name, u3.name AS final_approver_name
     FROM expense_claims c
     LEFT JOIN users su ON su.id = c.created_by
     LEFT JOIN users u1 ON u1.id = c.l1_approver_user_id
     LEFT JOIN users u2 ON u2.id = c.l2_approver_user_id
     LEFT JOIN users u3 ON u3.id = c.final_approver_user_id
     WHERE c.id = ?`,
    [claimId]
  );
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

  // The Employee Details card reflects the expense's employee — the first
  // employee item's frozen master snapshot — not whoever raised the claim.
  // Bank account / IFSC live only on the item; surface the first one here too.
  const mappedClaim = mapClaim(claim);
  const firstEmp = items.find(
    (i) => (i.expense_for || "employee") === "employee" && i.emp_ref_code
  );
  if (firstEmp) {
    mappedClaim.employeeCode = firstEmp.emp_ref_code || mappedClaim.employeeCode || null;
    mappedClaim.employeeName = firstEmp.emp_ref_name || mappedClaim.employeeName || null;
    mappedClaim.designation = firstEmp.emp_ref_designation || mappedClaim.designation || null;
    mappedClaim.circle = firstEmp.emp_ref_circle || mappedClaim.circle || null;
    mappedClaim.cmp = firstEmp.emp_ref_cmp || mappedClaim.cmp || null;
    mappedClaim.bankAccount = firstEmp.bank_account || null;
    mappedClaim.ifsc = firstEmp.ifsc || null;
  }

  // Real, DB-derived approval timeline for the claim-detail / approvals /
  // finance screens. `financeStatus` is "in_finance" once the claim has cleared
  // final approval (or a legacy finance row says otherwise).
  const timeline = buildApprovalTimeline(claim, audit);
  const financeStatus = financeRows[0]?.finance_status
    ? financeRows[0].finance_status
    : ["pending_finance", "processing", "on_hold", "completed", "final_approved"].includes(
        claim.current_status
      )
    ? "in_finance"
    : "pending";
  mappedClaim.financeStatus = financeStatus;
  timeline.finance = {
    status: financeStatus === "pending" ? "pending" : "in_finance",
    at: financeStatus === "pending" ? null : timeline.final.at || timeline.l2.at || timeline.l1.at,
  };

  return {
    claim: mappedClaim,
    items: items.map(mapItem),
    attachments: attachments.map(mapAttachment),
    audit: audit.map(mapAudit),
    finance: financeRows[0] ? mapFinance(financeRows[0]) : null,
    timeline,
  };
}

function mapFinance(row) {
  return {
    claimId: row.claim_id,
    financeStatus: row.finance_status,
    paymentReference: row.payment_reference,
    paymentDate: row.payment_date,
    paymentAmount:
      row.payment_amount === null || row.payment_amount === undefined
        ? null
        : Number(row.payment_amount),
    financeRemarks: row.finance_remarks,
    processedBy: row.processed_by,
    processedByUserId: row.processed_by_user_id,
    processedAt: row.processed_at,
    updatedAt: row.updated_at,
  };
}

// Can `authUser` see this claim? The owner, an admin, or a user who is on the
// approval chain / assigned as current approver. Finance / dashboard / admin
// page holders can see any claim's documents (they review claims they were never
// personally assigned to).
function canViewClaim(authUser, claimRow) {
  if (isAdmin(authUser)) return true;
  if (claimRow.employee_user_id != null && claimRow.employee_user_id === authUser.id) return true;
  if (claimRow.created_by != null && claimRow.created_by === authUser.id) return true; // submitter
  if (
    [
      claimRow.current_approver_user_id,
      claimRow.l1_approver_user_id,
      claimRow.l2_approver_user_id,
      claimRow.final_approver_user_id,
    ].includes(authUser.id)
  ) {
    return true;
  }
  return (
    hasPagePermission(authUser, PAGE_IDS.finance, "view") ||
    hasPagePermission(authUser, PAGE_IDS.dashboard, "view") ||
    hasPagePermission(authUser, PAGE_IDS.admin, "view")
  );
}

// A bill/document is reachable by anyone who can open some part of the Expense
// Claims module; the per-claim check (canViewClaim) still runs afterwards.
function requireExpenseModuleView(req, res, next) {
  const u = req.authUser;
  const ok =
    hasPagePermission(u, PAGE_IDS.employee, "view") ||
    hasPagePermission(u, PAGE_IDS.approvals, "view") ||
    hasPagePermission(u, PAGE_IDS.finance, "view") ||
    hasPagePermission(u, PAGE_IDS.dashboard, "view") ||
    hasPagePermission(u, PAGE_IDS.admin, "view");
  if (!ok) {
    return res
      .status(403)
      .json({ success: false, message: "You do not have access to Expense Claims documents." });
  }
  return next();
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

    const [categories, profile, vtRows, etRows, chainRule] = await Promise.all([
      getActiveCategories(),
      loadEmployeeProfile(req.authUser.id),
      pool.query(`SELECT name FROM expense_vendor_types WHERE is_active = 1 ORDER BY name ASC`),
      pool.query(`SELECT name FROM expense_employee_types WHERE is_active = 1 ORDER BY name ASC`),
      getCatchAllRule(),
    ]);

    // Lets the Raise Expense form warn a user, before they submit, that they are
    // the configured L1 approver for their own claim (self-approval is blocked
    // for the claimant). Admin-managed global chain — see Expense Settings.
    const selfIsL1Approver = Boolean(
      chainRule?.l1_user_id && chainRule.l1_user_id === req.authUser.id
    );

    res.json({
      success: true,
      data: {
        // legacy — kept so nothing that still reads it breaks
        categories: categories.map((c) => ({ name: c.name, requiresBill: Boolean(c.requires_bill) })),
        // dynamic Raise Expense form
        expenseFor: EXPENSE_FOR,
        claimTypes: CLAIM_TYPES,
        billingTypes: BILLING_TYPES,
        workCategories: categories.map((c) => c.name),
        domains: EXPENSE_CLAIM_DOMAINS,
        vendorTypes: vtRows[0].map((r) => r.name),
        employeeTypes: etRows[0].map((r) => r.name),
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
        selfIsL1Approver,
        approvalChain: {
          l1UserId: chainRule?.l1_user_id ?? null,
          l2UserId: chainRule?.l2_user_id ?? null,
          finalUserId: chainRule?.final_user_id ?? null,
        },
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

// GET /api/expense-claims/employees?search=  — searchable employee picker
// (reuses the Physical employee master; no new employee table).
router.get("/employees", requirePagePermission(PAGE, "view"), async (req, res) => {
  try {
    await ensureTables();
    const search = String(req.query.search || "").trim();
    const params = [];
    let where = "COALESCE(is_deleted, 0) = 0 AND employee_code IS NOT NULL AND employee_code <> ''";
    if (search) {
      where += " AND (employee_code LIKE ? OR employee_name LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }
    const [rows] = await pool.query(
      `SELECT employee_code, employee_name, function_name, job_role, scrum_job_role,
              circle, cmp, employment_status, bank_account_no, ifsc_code
       FROM physical WHERE ${where}
       ORDER BY employee_name ASC LIMIT 30`,
      params
    );
    res.json({
      success: true,
      data: rows.map((r) => ({
        employeeCode: r.employee_code,
        employeeName: r.employee_name || "",
        designation: r.job_role || r.scrum_job_role || "",
        department: r.function_name || "",
        circle: r.circle || "",
        cmp: r.cmp || "",
        status: r.employment_status || "",
        bankAccount: r.bank_account_no || "",
        ifsc: r.ifsc_code || "",
      })),
    });
  } catch (error) {
    fail(res, error, "Employee search failed.");
  }
});

function mapVendor(r) {
  return {
    id: r.id,
    name: r.name,
    vendorType: r.vendor_type || null,
    gstin: r.gstin || null,
    phone: r.phone || null,
    email: r.email || null,
    bankAccount: r.bank_account || null,
    ifsc: r.ifsc || null,
    isActive: Boolean(r.is_active),
  };
}

// GET /api/expense-claims/vendors?type=&search=
router.get("/vendors", requirePagePermission(PAGE, "view"), async (req, res) => {
  try {
    await ensureTables();
    const type = String(req.query.type || "").trim();
    const search = String(req.query.search || "").trim();
    const where = ["is_active = 1"];
    const params = [];
    if (type) { where.push("vendor_type = ?"); params.push(type); }
    if (search) { where.push("name LIKE ?"); params.push(`%${search}%`); }
    const [rows] = await pool.query(
      `SELECT * FROM expense_vendors WHERE ${where.join(" AND ")} ORDER BY name ASC LIMIT 50`,
      params
    );
    res.json({ success: true, data: rows.map(mapVendor) });
  } catch (error) {
    fail(res, error, "Vendor list failed.");
  }
});

// POST /api/expense-claims/vendors  — used by the "+ Add Vendor" modal.
router.post("/vendors", requirePagePermission(PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const name = String(req.body?.name || "").trim();
    const vendorType = String(req.body?.vendorType || "").trim() || null;
    if (!name) throw httpError(400, "Vendor name is required.");
    const [ins] = await pool.query(
      `INSERT INTO expense_vendors (name, vendor_type, gstin, phone, email, bank_account, ifsc, created_by, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, vendorType,
        String(req.body?.gstin || "").trim() || null,
        String(req.body?.phone || "").trim() || null,
        String(req.body?.email || "").trim() || null,
        String(req.body?.bankAccount || "").trim() || null,
        String(req.body?.ifsc || "").trim().toUpperCase() || null,
        req.authUser.id, actorName(req.authUser),
      ]
    );
    const [rows] = await pool.query(`SELECT * FROM expense_vendors WHERE id = ?`, [ins.insertId]);
    res.status(201).json({ success: true, data: mapVendor(rows[0]) });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return fail(res, httpError(409, "A vendor with that name and type already exists."));
    }
    fail(res, error, "Failed to add the vendor.");
  }
});

function mapPO(r) {
  return {
    id: r.id,
    poNumber: r.po_number,
    workCategory: r.work_category || null,
    domain: r.domain || null,
    clientName: r.client_name || null,
    siteRoute: r.site_route || null,
    estimateWccAmount: r.estimate_wcc_amount === null || r.estimate_wcc_amount === undefined ? null : Number(r.estimate_wcc_amount),
    description: r.description || null,
    isActive: Boolean(r.is_active),
  };
}

// GET /api/expense-claims/pos?category=&search=
router.get("/pos", requirePagePermission(PAGE, "view"), async (req, res) => {
  try {
    await ensureTables();
    const category = String(req.query.category || "").trim();
    const search = String(req.query.search || "").trim();
    const where = ["is_active = 1"];
    const params = [];
    if (category) { where.push("(work_category = ? OR work_category IS NULL)"); params.push(category); }
    if (search) { where.push("(po_number LIKE ? OR client_name LIKE ?)"); params.push(`%${search}%`, `%${search}%`); }
    const [rows] = await pool.query(
      `SELECT * FROM expense_pos WHERE ${where.join(" AND ")} ORDER BY po_number ASC LIMIT 50`,
      params
    );
    res.json({ success: true, data: rows.map(mapPO) });
  } catch (error) {
    fail(res, error, "PO list failed.");
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

    // "My Expenses" = claims that belong to me (I am the claimant) OR that I
    // raised on someone else's behalf (I am the submitter). The frontend tags
    // the latter as "raised for <name>" so they don't read as my own expense.
    const filters = ["(c.employee_user_id = ? OR c.created_by = ?)"];
    const params = [req.authUser.id, req.authUser.id];

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
              su.name AS created_by_name, su.employee_id AS created_by_code,
              (SELECT COUNT(*) FROM expense_claim_items i WHERE i.claim_id = c.id) AS item_count,
              (SELECT MIN(i.expense_date) FROM expense_claim_items i WHERE i.claim_id = c.id) AS expense_date_from,
              (SELECT MAX(i.expense_date) FROM expense_claim_items i WHERE i.claim_id = c.id) AS expense_date_to
       FROM expense_claims c
       LEFT JOIN users su ON su.id = c.created_by
       WHERE ${whereClause}
       ORDER BY (c.current_status = 'draft') DESC, c.updated_at DESC, c.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({
      success: true,
      data: rows.map((row) => ({
        ...mapClaim(row),
        itemCount: Number(row.item_count || 0),
        expenseDateFrom: row.expense_date_from || null,
        expenseDateTo: row.expense_date_to || null,
      })),
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

  // Column list shared by INSERT and UPDATE (dynamic form + legacy columns).
  const dynCols = [
    "expense_date", "category", "sub_category", "description", "claimed_amount", "bill_number",
    "expense_for", "employee_type", "emp_ref_code", "emp_ref_name",
    "emp_ref_designation", "emp_ref_circle", "emp_ref_cmp",
    "vendor_id", "vendor_name", "vendor_type", "claim_type", "billing_type", "client_name",
    "work_category", "po_number", "domain", "other_domain", "site_route", "estimate_wcc_amount",
    "bank_account", "ifsc",
  ];
  const dynVals = (item) => [
    item.expenseDate, item.category, item.subCategory, item.description, item.claimedAmount, item.billNumber,
    item.expenseFor, item.employeeType, item.empRefCode, item.empRefName,
    item.empRefDesignation, item.empRefCircle, item.empRefCmp,
    item.vendorId, item.vendorName, item.vendorType, item.claimType, item.billingType, item.clientName,
    item.workCategory, item.poNumber, item.domain, item.otherDomain, item.siteRoute, item.estimateWccAmount,
    item.bankAccount, item.ifsc,
  ];

  let srNo = 1;
  for (const item of items) {
    if (item.id && existingIds.has(item.id)) {
      await conn.query(
        `UPDATE expense_claim_items SET sr_no = ?, ${dynCols.map((c) => `${c} = ?`).join(", ")}
         WHERE id = ? AND claim_id = ?`,
        [srNo, ...dynVals(item), item.id, claimId]
      );
      keepIds.add(item.id);
    } else {
      const [ins] = await conn.query(
        `INSERT INTO expense_claim_items (claim_id, sr_no, ${dynCols.join(", ")})
         VALUES (?, ?, ${dynCols.map(() => "?").join(", ")})`,
        [claimId, srNo, ...dynVals(item)]
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
            reporting_manager, employment_status, bank_account_no, ifsc_code
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
    bankAccount: r.bank_account_no || "",
    ifsc: r.ifsc_code || "",
  };
}

// Find the portal login that belongs to an employee-master record, if one exists.
// Returns a numeric users.id, or null when that employee has no portal account.
// Primary match is on users.employee_id; when that column is not populated we
// fall back to the employee master's company email -> users.email so a claim
// raised on behalf of that employee still lands in their "My Expenses".
async function findUserByEmployeeCode(employeeCode, email) {
  const code = String(employeeCode || "").trim();
  const mail = String(email || "").trim();
  if (!code && !mail) return null;
  if (code) {
    const [rows] = await pool.query(
      `SELECT id FROM users
       WHERE TRIM(LOWER(employee_id)) = TRIM(LOWER(?))
         AND LOWER(COALESCE(status, 'active')) = 'active'
       LIMIT 1`,
      [code]
    );
    if (rows[0]?.id != null) return rows[0].id;
  }
  if (mail) {
    const [rows] = await pool.query(
      `SELECT id FROM users
       WHERE TRIM(LOWER(email)) = TRIM(LOWER(?))
         AND LOWER(COALESCE(status, 'active')) = 'active'
       LIMIT 1`,
      [mail]
    );
    if (rows[0]?.id != null) return rows[0].id;
  }
  return null;
}

// The controlled employee-master snapshot stored on a claim, PLUS the claimant's
// portal user id. `employee_user_id` is the CLAIMANT (whose expense this is),
// which is NOT necessarily the logged-in user filling the form:
//   * no Employee ID supplied  -> claimant is the logged-in user
//   * Employee ID supplied     -> claimant is that employee: their portal user
//                                 id if they have a login, otherwise null (the
//                                 claimant is identified by employee_code alone)
// The submitter is recorded separately as expense_claims.created_by.
async function resolveEmployeeSnapshot(authUser, employeeCode) {
  const code = String(employeeCode || "").trim();
  if (code) {
    const emp = await lookupPhysicalEmployee(code);
    if (!emp) {
      throw httpError(400, `Employee ID "${code}" was not found in the employee master.`);
    }
    const resolvedCode = emp.employeeCode || code;
    let claimantUserId = await findUserByEmployeeCode(resolvedCode, emp.email);
    if (claimantUserId == null) {
      // No portal login matched by employee code. If the fetched employee IS the
      // logged-in user (raising their own claim), fall back to their id so
      // self-approval protection still applies even when users.employee_id is
      // not populated. A genuinely different employee with no login stays null.
      const me = await loadEmployeeProfile(authUser.id);
      const myCode = String(me?.employee_id || "").trim().toLowerCase();
      if (myCode && myCode === resolvedCode.trim().toLowerCase()) {
        claimantUserId = authUser.id;
      }
    }
    return {
      employee_user_id: claimantUserId,
      employee_name: emp.employeeName || null,
      employee_code: emp.employeeCode,
      department: emp.department || null,
      designation: emp.designation || null,
      circle: emp.circle || null,
      cmp: emp.cmp || null,
    };
  }
  const profile = await loadEmployeeProfile(authUser.id);
  return { ...employeeSnapshot(profile, authUser), cmp: null };
}

router.post("/claims", requirePagePermission(PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const body = parseClaimBody(req.body);

    const parsedItems = [];
    const errors = [];
    body.items.forEach((raw, index) => {
      const { errors: itemErrors, value } = validateItem(raw, index, [], { strict: false });
      errors.push(...itemErrors);
      parsedItems.push(value);
    });
    if (errors.length) throw httpError(400, "Please fix the highlighted rows.", { rowErrors: errors });

    const snap = await resolveEmployeeSnapshot(req.authUser, body.employeeCode);

    const result = await withTransaction(async (conn) => {
      const [ins] = await conn.query(
        `INSERT INTO expense_claims
           (employee_user_id, employee_name, employee_code, department, designation, circle,
            cost_centre, current_status, current_stage, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 'employee', ?)`,
        [
          snap.employee_user_id, snap.employee_name, snap.employee_code, snap.department,
          snap.designation, snap.circle, snap.cmp, req.authUser.id,
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
        meta: {
          itemCount: parsedItems.length,
          claimantUserId: snap.employee_user_id,
          claimantEmployeeCode: snap.employee_code,
          submittedByUserId: req.authUser.id,
          onBehalfOf: snap.employee_user_id !== req.authUser.id,
        },
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
  // Editable by the claimant (whose expense it is), the submitter who raised it
  // on their behalf (created_by), or an admin.
  const isClaimant = claim.employee_user_id != null && claim.employee_user_id === authUser.id;
  const isSubmitter = claim.created_by != null && claim.created_by === authUser.id;
  if (!isClaimant && !isSubmitter && !isAdmin(authUser)) {
    throw httpError(403, "You can only edit claims that belong to you or that you raised.");
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

    const parsedItems = [];
    const errors = [];
    body.items.forEach((raw, index) => {
      const { errors: itemErrors, value } = validateItem(raw, index, [], { strict: false });
      errors.push(...itemErrors);
      parsedItems.push(value);
    });
    if (errors.length) throw httpError(400, "Please fix the highlighted rows.", { rowErrors: errors });

    const snap = await resolveEmployeeSnapshot(req.authUser, body.employeeCode);

    await withTransaction(async (conn) => {
      await conn.query(
        `UPDATE expense_claims SET
           employee_user_id = ?, employee_name = ?, employee_code = ?, department = ?,
           designation = ?, circle = ?, cost_centre = ?
         WHERE id = ?`,
        [
          snap.employee_user_id, snap.employee_name, snap.employee_code, snap.department,
          snap.designation, snap.circle, snap.cmp, claim.id,
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

// Delete a claim. Two paths:
//  1. The owner removing their own untouched draft — needs only "edit" on My
//     Expenses (this is the "Delete Draft" button in Raise Expense / My Expenses).
//  2. A privileged user with "delete" on any Expense Claims page (or an admin)
//     removing ANY claim in ANY status, from the approvals / finance / detail
//     screens. This permanently drops the claim and its full history.
router.delete("/claims/:id", async (req, res) => {
  try {
    await ensureTables();
    const [rows] = await pool.query(`SELECT * FROM expense_claims WHERE id = ?`, [req.params.id]);
    const claim = rows[0];
    if (!claim) throw httpError(404, "Claim not found.");

    const privileged = canDeleteAnyClaim(req.authUser);
    const ownDraft =
      (claim.employee_user_id === req.authUser.id || claim.created_by === req.authUser.id) &&
      claim.current_status === "draft" &&
      hasPagePermission(req.authUser, PAGE, "edit");

    if (!privileged && !ownDraft) {
      throw httpError(
        403,
        "You do not have permission to delete this claim. Ask an administrator to grant Delete on an Expense Claims page."
      );
    }

    await withTransaction(async (conn) => {
      await conn.query(`DELETE FROM expense_claim_attachments WHERE claim_id = ?`, [claim.id]);
      await conn.query(`DELETE FROM expense_claim_items WHERE claim_id = ?`, [claim.id]);
      await conn.query(`DELETE FROM expense_claim_audit WHERE claim_id = ?`, [claim.id]);
      await conn.query(`DELETE FROM expense_claim_finance WHERE claim_id = ?`, [claim.id]);
      await conn.query(`DELETE FROM expense_claim_notifications WHERE claim_id = ?`, [claim.id]);
      await conn.query(`DELETE FROM expense_claims WHERE id = ?`, [claim.id]);
    });
    res.json({ success: true });
  } catch (error) {
    fail(res, error, "Failed to delete the claim.");
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

    const [attachRows] = await pool.query(
      `SELECT item_id, COUNT(*) AS c FROM expense_claim_attachments WHERE claim_id = ? GROUP BY item_id`,
      [claim.id]
    );
    const billCountByItem = new Map(attachRows.map((r) => [r.item_id, Number(r.c)]));

    const errors = [];
    items.forEach((row, index) => {
      // `row` carries snake_case columns; validateItem reads both cases.
      const { errors: itemErrors } = validateItem(row, index, [], { strict: true });
      errors.push(...itemErrors);
      // A reimbursement (after-expense) claim must carry proof.
      if ((row.claim_type || "").toLowerCase() === "reimbursement" && !billCountByItem.get(row.id)) {
        errors.push(`Item ${index + 1}: attach a bill/invoice — required for a Reimbursement expense.`);
      }
    });

    // Each Employee-Expense item must point at a real employee master record.
    // Re-read every employee item's master fields from `physical` so the snapshot
    // stored on the claim/item is authoritative (the client only sends the ID).
    // The claim-level identity card + approvals queue reflect the FIRST employee
    // item's employee; per-item chips carry the rest for multi-employee claims.
    let claimCmp = claim.cost_centre || null;
    let claimEmpCode = claim.employee_code || null;
    let claimEmpName = claim.employee_name || null;
    let claimDept = claim.department || null;
    let claimDesig = claim.designation || null;
    let claimCircle = claim.circle || null;
    let claimEmpSnapshotTaken = false;
    const itemMasterRefresh = []; // [{ id, emp }]
    for (let index = 0; index < items.length; index += 1) {
      const row = items[index];
      if ((row.expense_for || "employee") !== "employee" || !row.emp_ref_code) continue;
      const emp = await lookupPhysicalEmployee(row.emp_ref_code);
      if (!emp) {
        errors.push(`Item ${index + 1}: Employee ID "${row.emp_ref_code}" was not found in the employee master.`);
        continue;
      }
      itemMasterRefresh.push({ id: row.id, emp });
      if (!claimEmpSnapshotTaken) {
        claimEmpSnapshotTaken = true;
        claimEmpCode = emp.employeeCode || row.emp_ref_code || claimEmpCode;
        claimEmpName = emp.employeeName || claimEmpName;
        claimDept = emp.department || claimDept;
        claimDesig = emp.designation || claimDesig;
        claimCircle = emp.circle || claimCircle;
        claimCmp = emp.cmp || claimCmp;
      }
    }
    if (errors.length) throw httpError(400, "This claim cannot be submitted yet.", { rowErrors: errors });

    const total = round2(items.reduce((sum, i) => sum + Number(i.claimed_amount || 0), 0));
    const year = new Date().getFullYear();

    await withTransaction(async (conn) => {
      const approvers = await resolveApprovers(conn, "ALL", total);
      if (!approvers || !approvers.l1_user_id || !approvers.l2_user_id) {
        throw httpError(
          409,
          "Approvers have not been set up yet. Ask an administrator to open Expense Settings → Default Approval Chain and choose the L1 and L2 approvers (Final is optional)."
        );
      }
      // Self-approval guard — always checked against the CLAIMANT (whose expense
      // this is), never the submitter. It is fine for the L1/L2/Final approver to
      // be the person who raised the claim on someone else's behalf.
      //
      // L1 is a hard block: the claim cannot move at all if the claimant would be
      // their own first approver. L2 / Final where the claimant is the approver
      // are auto-skipped downstream (see nextAfterStage), so they only block when
      // skipping them would leave NOBODY to approve before Finance.
      if (claim.employee_user_id != null) {
        const cid = claim.employee_user_id;
        if (approvers.l1_user_id === cid) {
          throw httpError(
            409,
            "You are currently configured as the L1 approver for your own expense claim, so it cannot be submitted. Ask an administrator to set a different L1 approver in Expense Settings → Default Approval Chain, then submit again."
          );
        }
        const l2Ok = approvers.l2_user_id && approvers.l2_user_id !== cid;
        const finalOk = approvers.final_user_id && approvers.final_user_id !== cid;
        if (!l2Ok && !finalOk) {
          throw httpError(
            409,
            "You are configured as every remaining approver for your own expense claim, so it cannot be submitted. Ask an administrator to set different L2 / Final approvers in Expense Settings → Default Approval Chain."
          );
        }
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

      // Freeze each employee item's master snapshot (name / designation / circle /
      // CMP / bank account / IFSC) from `physical` as of submit time.
      for (const { id, emp } of itemMasterRefresh) {
        await conn.query(
          `UPDATE expense_claim_items SET
             emp_ref_name = ?, emp_ref_designation = ?, emp_ref_circle = ?, emp_ref_cmp = ?,
             bank_account = ?, ifsc = ?
           WHERE id = ? AND claim_id = ?`,
          [
            emp.employeeName || null, emp.designation || null, emp.circle || null, emp.cmp || null,
            emp.bankAccount || null, emp.ifsc || null, id, claim.id,
          ]
        );
      }

      await conn.query(
        `UPDATE expense_claims SET
           claim_number = ?, total_claimed = ?, cost_centre = ?,
           employee_code = ?, employee_name = ?, department = ?, designation = ?, circle = ?,
           current_status = 'pending_l1', current_stage = 'l1',
           l1_approver_user_id = ?, l2_approver_user_id = ?, final_approver_user_id = ?,
           current_approver_user_id = ?, submitted_at = NOW()
         WHERE id = ?`,
        [
          claimNumber, total, claimCmp,
          claimEmpCode, claimEmpName, claimDept, claimDesig, claimCircle,
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
        meta: {
          claimNumber,
          itemCount: items.length,
          l1ApproverUserId: approvers.l1_user_id,
          claimantUserId: claim.employee_user_id,
          claimantEmployeeCode: claimEmpCode,
          submittedByUserId: req.authUser.id,
          submittedByName: actorName(req.authUser),
          onBehalfOf: claim.employee_user_id !== req.authUser.id,
          submittedAt: new Date().toISOString(),
        },
      });

      const onBehalf = claim.employee_user_id !== req.authUser.id;
      await notify(conn, {
        userId: approvers.l1_user_id,
        claimId: claim.id,
        claimNumber,
        type: "approval_pending",
        message: onBehalf
          ? `${actorName(req.authUser)} submitted claim ${claimNumber} (${formatINR(total)}) on behalf of ${claim.employee_name || "an employee"} for your L1 approval.`
          : `${claim.employee_name || "An employee"} submitted claim ${claimNumber} (${formatINR(total)}) for your L1 approval.`,
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
           (claim_id, item_id, file_name, file_type, file_size, file_data, access_token,
            uploaded_by, uploaded_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          claim.id, itemRows[0].id, req.file.originalname,
          req.file.mimetype || "application/octet-stream",
          req.file.size, req.file.buffer, newAccessToken(),
          req.authUser.id, actorName(req.authUser),
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

router.get("/attachments/:attId", requireExpenseModuleView, async (req, res) => {
  try {
    await ensureTables();
    const [rows] = await pool.query(
      `SELECT a.*, c.employee_user_id, c.created_by, c.current_approver_user_id, c.l1_approver_user_id,
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
      `SELECT a.id, a.claim_id, a.item_id, a.file_name, c.employee_user_id, c.created_by, c.current_status
       FROM expense_claim_attachments a
       JOIN expense_claims c ON c.id = a.claim_id
       WHERE a.id = ?`,
      [req.params.attId]
    );
    const att = rows[0];
    if (!att) throw httpError(404, "Attachment not found.");
    if (
      att.employee_user_id !== req.authUser.id &&
      att.created_by !== req.authUser.id &&
      !isAdmin(req.authUser)
    ) {
      throw httpError(403, "You can only change bills on claims that belong to you or that you raised.");
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
              su.name AS created_by_name, su.employee_id AS created_by_code,
              (SELECT COUNT(*) FROM expense_claim_items i WHERE i.claim_id = c.id) AS item_count,
              (SELECT i.emp_ref_code FROM expense_claim_items i
                WHERE i.claim_id = c.id AND (i.expense_for = 'employee' OR i.expense_for IS NULL)
                  AND i.emp_ref_code IS NOT NULL AND i.emp_ref_code <> ''
                ORDER BY i.sr_no ASC, i.id ASC LIMIT 1) AS first_emp_code,
              (SELECT i.emp_ref_name FROM expense_claim_items i
                WHERE i.claim_id = c.id AND (i.expense_for = 'employee' OR i.expense_for IS NULL)
                  AND i.emp_ref_code IS NOT NULL AND i.emp_ref_code <> ''
                ORDER BY i.sr_no ASC, i.id ASC LIMIT 1) AS first_emp_name
       FROM expense_claims c
       LEFT JOIN users su ON su.id = c.created_by
       WHERE ${whereClause}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({
      success: true,
      data: rows.map((row) => ({
        ...mapClaim(row),
        employeeCode: row.first_emp_code || row.employee_code || null,
        employeeName: row.first_emp_name || row.employee_name || null,
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

const STATUS_TO_STAGE = { pending_l1: "l1", pending_l2: "l2", pending_final: "final" };

// Apply one approver's per-item decisions inside an open transaction: write each
// item's stage columns + per-item audit, roll the claim to the next stage,
// record the stage audit, and notify the employee + next approver. Shared by the
// single-claim decision route and the bulk-approve route so both behave
// identically. `prepared` is [{ item, approved, normalized, reason, itemStatus }].
async function applyStageDecision(conn, { claim, stage, items, prepared, remarks, actorUser }) {
  const prefix = STAGE_COL_PREFIX[stage];
  const stageTotal = round2(prepared.reduce((sum, p) => sum + p.approved, 0));
  const claimed = round2(items.reduce((sum, i) => sum + Number(i.claimed_amount || 0), 0));
  const reduced = round2(claimed - stageTotal);
  const next = nextAfterStage(stage, claim);

  for (const p of prepared) {
    await conn.query(
      `UPDATE expense_claim_items SET
         ${prefix}_approved_amount = ?, ${prefix}_decision = ?, ${prefix}_reason = ?, status = ?
       WHERE id = ? AND claim_id = ?`,
      [p.approved, p.normalized, p.reason, p.itemStatus, p.item.id, claim.id]
    );
    await writeAudit(conn, {
      claimId: claim.id,
      actorUserId: actorUser.id,
      actorName: actorName(actorUser),
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
    // This level was the last approver (no final approver configured), so its
    // total IS the final approved amount.
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
    actorUserId: actorUser.id,
    actorName: actorName(actorUser),
    stage,
    action: reduced > 0.001 ? `${STAGE_LABEL[stage].toUpperCase()}_APPROVED_WITH_CHANGES` : `${STAGE_LABEL[stage].toUpperCase()}_APPROVED`,
    fromStatus: claim.current_status,
    toStatus: next.status,
    newAmount: stageTotal,
    reason: remarks,
    meta: { claimed, approved: stageTotal, reduced, nextApproverUserId: next.approverId },
  });

  if (reachedFinance) {
    await writeAudit(conn, {
      claimId: claim.id,
      actorUserId: actorUser.id,
      actorName: actorName(actorUser),
      stage: "finance",
      action: "MOVED_TO_FINANCE",
      fromStatus: claim.current_status,
      toStatus: "pending_finance",
      newAmount: stageTotal,
      meta: { finalApproved: stageTotal },
    });
  }

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

  return { stageTotal, reduced, next, reachedFinance };
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

    await withTransaction(async (conn) => {
      await applyStageDecision(conn, { claim, stage, items, prepared, remarks, actorUser: req.authUser });
    });

    const bundle = await fetchClaimBundle(claim.id);
    res.json({ success: true, data: bundle });
  } catch (error) {
    fail(res, error, "Failed to record the approval decision.");
  }
});

// POST /api/expense-claims/approvals/bulk-approve — from the Approvals list:
// approve EVERY item in full on each selected claim and forward it to the next
// stage. Never partially approves or rejects. Each claim is validated and
// committed independently; the response reports per-claim success/failure so one
// bad claim (e.g. no longer assigned to you) does not block the rest.
router.post("/approvals/bulk-approve", requirePagePermission(APPROVALS_PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();

    const ids = [
      ...new Set(
        (Array.isArray(req.body?.claimIds) ? req.body.claimIds : [])
          .map((v) => Number(v))
          .filter((n) => Number.isInteger(n) && n > 0)
      ),
    ];
    if (!ids.length) throw httpError(400, "Select at least one claim to approve.");
    if (ids.length > 50) throw httpError(400, "You can bulk-approve at most 50 claims at a time.");
    const remarks = String(req.body?.remarks ?? "").trim() || null;

    const results = [];
    for (const id of ids) {
      try {
        const claim = await loadClaimForApprover(id, req.authUser);
        const stage = STATUS_TO_STAGE[claim.current_status];
        if (!stage) {
          results.push({ id, ok: false, error: "This claim is not awaiting approval." });
          continue;
        }
        const [items] = await pool.query(
          `SELECT * FROM expense_claim_items WHERE claim_id = ? ORDER BY sr_no ASC, id ASC`,
          [id]
        );
        if (!items.length) {
          results.push({ id, ok: false, claimNumber: claim.claim_number, error: "This claim has no expense items." });
          continue;
        }

        // Approve each item at the amount handed to this stage (claimed for L1,
        // the previous level's approved amount for L2 / Final). An item an
        // upstream level already zeroed passes straight through as rejected.
        const prepared = items.map((item) => {
          const ceiling = round2(itemCeiling(stage, item));
          return {
            item,
            approved: ceiling,
            normalized: ceiling <= 0 ? "rejected" : "approved_full",
            reason: null,
            itemStatus: ceiling <= 0 ? "rejected" : "approved",
          };
        });

        let outcome;
        await withTransaction(async (conn) => {
          outcome = await applyStageDecision(conn, { claim, stage, items, prepared, remarks, actorUser: req.authUser });
        });
        results.push({
          id,
          ok: true,
          claimNumber: claim.claim_number,
          stage,
          approvedTotal: outcome.stageTotal,
          forwardedTo: outcome.reachedFinance ? "finance" : outcome.next.stage,
        });
      } catch (err) {
        results.push({ id, ok: false, error: err.message || "Approval failed." });
      }
    }

    const approved = results.filter((r) => r.ok).length;
    res.json({ success: true, approved, failed: results.length - approved, results });
  } catch (error) {
    fail(res, error, "Bulk approval failed.");
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
// PHASE 5 — Finance. A READ-ONLY repository of claims that have completed final
// approval. Finance is NOT an approval stage and NOT a payment-processing stage:
// once a claim is fully approved it is simply available here to view / download.
// There is no finance-processing action, status, Save or Send Back.
// ===========================================================================

const FINANCE_PAGE = PAGE_IDS.finance; // "expense-finance"

// A claim is "in Finance" once it has cleared final approval. `completed` is a
// legacy status for claims that were finance-processed before this module became
// read-only — those stay visible here so nothing disappears from Finance.
const FINANCE_VISIBLE_STATUSES = ["pending_finance", "completed"];

const FINANCE_SORT_COLUMNS = {
  submitted: "c.submitted_at",
  claim: "c.claim_number",
  claimed: "c.total_claimed",
  approved: "c.final_approved_total",
};

function financeRow(row) {
  return {
    id: row.id,
    claimNumber: row.claim_number,
    employeeUserId: row.employee_user_id,
    employeeName: row.employee_name,
    employeeCode: row.employee_code,
    // Explicit claimant / raised-by split (spec §9, §18). employee* stays as an
    // alias so existing readers keep working.
    claimantName: row.employee_name,
    claimantCode: row.employee_code,
    submittedByUserId: row.created_by,
    submittedByName: row.raised_by_name || null,
    submittedByEmployeeCode: row.raised_by_code || null,
    department: row.department,
    designation: row.designation,
    circle: row.circle,
    cmp: row.cost_centre,
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
      paymentAmount:
        row.payment_amount === null || row.payment_amount === undefined
          ? null
          : Number(row.payment_amount),
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

  // Finance always and only shows fully final-approved claims.
  filters.push(
    `c.current_status IN (${FINANCE_VISIBLE_STATUSES.map(() => "?").join(",")})`
  );
  params.push(...FINANCE_VISIBLE_STATUSES);

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
  if (q.cmp) {
    filters.push("c.cost_centre = ?");
    params.push(q.cmp);
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

  return { filters: filters.length ? filters.join(" AND ") : "1=1", params };
}

const FINANCE_BASE_FROM = `
  FROM expense_claims c
  LEFT JOIN expense_claim_finance f ON f.claim_id = c.id
  LEFT JOIN users u1 ON u1.id = c.l1_approver_user_id
  LEFT JOIN users u2 ON u2.id = c.l2_approver_user_id
  LEFT JOIN users u3 ON u3.id = c.final_approver_user_id
  LEFT JOIN users su ON su.id = c.created_by
`;

router.get("/finance-meta", requirePagePermission(FINANCE_PAGE, "view"), async (req, res) => {
  try {
    await ensureTables();
    const [departments] = await pool.query(
      `SELECT DISTINCT department FROM expense_claims
       WHERE department IS NOT NULL AND department <> '' ORDER BY department ASC`
    );
    const [cmps] = await pool.query(
      `SELECT DISTINCT cost_centre AS cmp FROM expense_claims
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
        cmps: cmps.map((r) => r.cmp),
        categories: categories.map((r) => r.name),
        approvers: approvers.map((r) => ({ id: r.id, name: r.name })),
      },
    });
  } catch (error) {
    fail(res, error, "Failed to load finance filters.");
  }
});

// Read-only list of every claim that has completed final approval.
router.get("/finance", requirePagePermission(FINANCE_PAGE, "view"), async (req, res) => {
  try {
    await ensureTables();
    const { filters, params } = buildFinanceFilters(req);

    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 200);
    const offset = (page - 1) * pageSize;

    const sortKey = String(req.query.sort || "").toLowerCase();
    const sortCol = FINANCE_SORT_COLUMNS[sortKey];
    const dir = String(req.query.dir || "").toLowerCase() === "asc" ? "ASC" : "DESC";
    const orderBy = sortCol ? `${sortCol} ${dir}, c.id DESC` : "c.submitted_at DESC, c.id DESC";

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total ${FINANCE_BASE_FROM} WHERE ${filters}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT c.*, f.finance_status, f.payment_reference, f.payment_date, f.payment_amount, f.finance_remarks,
              f.processed_by, f.processed_at,
              u1.name AS l1_approver_name, u2.name AS l2_approver_name, u3.name AS final_approver_name,
              su.name AS raised_by_name, su.employee_id AS raised_by_code,
              (SELECT COUNT(*) FROM expense_claim_items i WHERE i.claim_id = c.id) AS item_count
       ${FINANCE_BASE_FROM}
       WHERE ${filters}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({
      success: true,
      data: rows.map(financeRow),
      total: countRows[0].total,
      page,
      pageSize,
    });
  } catch (error) {
    fail(res, error, "Failed to load the finance list.");
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

// ===========================================================================
// PHASE 6 — Excel export (respects the finance filter set). Two sheets.
// ===========================================================================

// Build an .xlsx buffer from one or more sheets. Each sheet is
// { name, headers: [...], rows: [{ cells: [...], links: { <0-based col>: { name, url } } }] }.
// A "linked" cell is written as a real Excel hyperlink and styled in the
// standard hyperlink blue + underline so it visibly reads as clickable.
const HYPERLINK_FONT = { color: { argb: "FF0563C1" }, underline: true };

async function buildLinkedWorkbook(sheets) {
  const wb = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(String(sheet.name).slice(0, 31));
    ws.addRow(sheet.headers);
    ws.getRow(1).font = { bold: true };
    sheet.rows.forEach((r) => {
      const row = ws.addRow(r.cells);
      Object.entries(r.links || {}).forEach(([col, link]) => {
        if (!link || !link.url) return;
        const cell = row.getCell(Number(col) + 1); // ExcelJS columns are 1-based
        cell.value = { text: link.name || "Open document", hyperlink: link.url, tooltip: "Open document" };
        cell.font = HYPERLINK_FONT;
      });
    });
  }
  return wb.xlsx.writeBuffer();
}

const APPROVAL_AUDIT_ACTIONS = [
  "L1_APPROVED", "L1_APPROVED_WITH_CHANGES",
  "L2_APPROVED", "L2_APPROVED_WITH_CHANGES",
  "FINAL_APPROVED", "FINAL_APPROVED_WITH_CHANGES",
];

// Path is deliberately NOT "/finance/export" — that collides with "/finance/:id".
router.get("/finance-export", requirePagePermission(FINANCE_PAGE, "download"), async (req, res) => {
  try {
    await ensureTables();
    const { filters, params } = buildFinanceFilters(req);

    // Secure, session-less document links for the spreadsheet. Each points at
    // GET /api/expense-documents/:token where the token is a 256-bit random
    // capability id (never the DB row id), so a link cannot be guessed or
    // enumerated, and it stops working the moment the attachment is deleted.
    const baseUrl =
      process.env.PUBLIC_API_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const docUrl = (token) => `${baseUrl}/api/expense-documents/${token}`;

    const [claims] = await pool.query(
      `SELECT c.*,
              u1.name AS l1_name, u2.name AS l2_name, u3.name AS final_name,
              su.name AS raised_by_name, su.employee_id AS raised_by_code,
              f.finance_status AS finance_status,
              (SELECT i.bank_account FROM expense_claim_items i
                 WHERE i.claim_id = c.id AND (i.expense_for = 'employee' OR i.expense_for IS NULL)
                   AND i.bank_account IS NOT NULL AND i.bank_account <> ''
                 ORDER BY i.sr_no ASC, i.id ASC LIMIT 1) AS bank_account,
              (SELECT i.ifsc FROM expense_claim_items i
                 WHERE i.claim_id = c.id AND (i.expense_for = 'employee' OR i.expense_for IS NULL)
                   AND i.ifsc IS NOT NULL AND i.ifsc <> ''
                 ORDER BY i.sr_no ASC, i.id ASC LIMIT 1) AS ifsc
       ${FINANCE_BASE_FROM}
       WHERE ${filters}
       ORDER BY c.submitted_at DESC, c.id DESC
       LIMIT 5000`,
      params
    );

    const ids = claims.map((c) => c.id);
    const placeholders = ids.map(() => "?").join(",");

    // Approval timestamps come from the audit trail (no dedicated columns).
    const apprDates = new Map(); // claimId -> { l1, l2, final }
    if (ids.length) {
      const [ad] = await pool.query(
        `SELECT claim_id, stage, MAX(created_at) AS at
         FROM expense_claim_audit
         WHERE claim_id IN (${placeholders})
           AND stage IN ('l1','l2','final')
           AND action IN (${APPROVAL_AUDIT_ACTIONS.map(() => "?").join(",")})
         GROUP BY claim_id, stage`,
        [...ids, ...APPROVAL_AUDIT_ACTIONS]
      );
      ad.forEach((r) => {
        const entry = apprDates.get(r.claim_id) || {};
        entry[r.stage] = r.at;
        apprDates.set(r.claim_id, entry);
      });
    }

    // Attachments, grouped per claim and per item.
    const docsByClaim = new Map();
    const docsByItem = new Map();
    if (ids.length) {
      const [atts] = await pool.query(
        `SELECT id, claim_id, item_id, file_name, access_token FROM expense_claim_attachments
         WHERE claim_id IN (${placeholders})
         ORDER BY claim_id ASC, item_id ASC, id ASC`,
        ids
      );
      atts.forEach((a) => {
        if (!a.access_token) return; // no capability token → no working link; skip it
        const doc = { name: a.file_name || `bill-${a.id}`, url: docUrl(a.access_token) };
        if (!docsByClaim.has(a.claim_id)) docsByClaim.set(a.claim_id, []);
        docsByClaim.get(a.claim_id).push(doc);
        if (a.item_id != null) {
          if (!docsByItem.has(a.item_id)) docsByItem.set(a.item_id, []);
          docsByItem.get(a.item_id).push(doc);
        }
      });
    }

    let items = [];
    if (ids.length) {
      const [rows] = await pool.query(
        `SELECT i.* FROM expense_claim_items i
         WHERE i.claim_id IN (${placeholders})
         ORDER BY i.claim_id ASC, i.sr_no ASC, i.id ASC`,
        ids
      );
      items = rows;
    }

    const DOC_CAP = 12;
    const maxClaimDocs = Math.min(
      DOC_CAP,
      claims.reduce((m, c) => Math.max(m, (docsByClaim.get(c.id) || []).length), 0)
    );
    const maxItemDocs = Math.min(
      DOC_CAP,
      items.reduce((m, i) => Math.max(m, (docsByItem.get(i.id) || []).length), 0)
    );

    // ---- Sheet 1: Claims (one row per claim) ------------------------------
    // Read-only export of fully final-approved claims. No finance-processing /
    // payment columns — Finance is a view-only repository.
    const claimHeadersFixed = [
      "Claim Number", "Claim Date",
      "Claimant Name", "Claimant Employee ID",
      "Raised By Name", "Raised By Employee ID",
      "Department", "Designation", "Circle", "CMP",
      "Bank Account", "IFSC", "Submitted Date", "Final Status", "Finance Status",
      "Total Claimed", "L1 Approved", "L2 Approved", "Final Approved",
      "L1 Approver", "L1 Approval Date", "L2 Approver", "L2 Approval Date",
      "Final Approver", "Final Approval Date",
    ];
    const claimHeaders = [
      ...claimHeadersFixed,
      ...Array.from({ length: maxClaimDocs }, (_, k) => `Document ${k + 1}`),
    ];
    const num = (v) => (v === null || v === undefined ? "" : Number(v));
    const day = (v) => (v ? String(v).slice(0, 10) : "");

    const claimRows = claims.map((c) => {
      const d = apprDates.get(c.id) || {};
      const docs = docsByClaim.get(c.id) || [];
      const financeStatus =
        c.finance_status ||
        (["pending_finance", "processing", "on_hold", "completed", "final_approved"].includes(
          c.current_status
        )
          ? "in_finance"
          : "pending");
      const cells = [
        c.claim_number || "", day(c.created_at),
        c.employee_name || "", c.employee_code || "",
        c.raised_by_name || "", c.raised_by_code || "",
        c.department || "", c.designation || "", c.circle || "", c.cost_centre || "",
        c.bank_account || "", c.ifsc || "", day(c.submitted_at), c.current_status, financeStatus,
        Number(c.total_claimed || 0), num(c.l1_approved_total), num(c.l2_approved_total),
        num(c.final_approved_total),
        c.l1_name || "", day(d.l1), c.l2_name || "", day(d.l2), c.final_name || "", day(d.final),
      ];
      const links = {};
      for (let k = 0; k < maxClaimDocs; k += 1) {
        cells.push(docs[k] ? docs[k].name : "");
        if (docs[k]) links[claimHeadersFixed.length + k] = docs[k];
      }
      return { cells, links };
    });

    // ---- Sheet 2: Expense Items (one row per item) ----------------------
    const itemHeadersFixed = [
      "Claim Number", "Item No", "Expense For", "Employee / Vendor", "Employee ID", "Vendor Name",
      "Expense Date", "Claim Type", "Billing Type", "Expense Category", "Sub Category",
      "PO Number", "Domain", "Client", "Site / Route", "WCC Amount", "Description", "Bill Number",
      "Claimed Amount", "L1 Approved", "L1 Reason", "L2 Approved", "L2 Reason",
      "Final Approved", "Final Reason",
    ];
    const itemHeaders = [
      ...itemHeadersFixed,
      ...Array.from({ length: maxItemDocs }, (_, k) => `Document ${k + 1}`),
    ];
    const claimNoById = new Map(claims.map((c) => [c.id, c.claim_number || ""]));

    const itemRows = items.map((i) => {
      const docs = docsByItem.get(i.id) || [];
      const cells = [
        claimNoById.get(i.claim_id) || "", i.sr_no || "",
        i.expense_for || "employee",
        i.expense_for === "vendor" ? i.vendor_name || "" : i.emp_ref_name || "",
        i.emp_ref_code || "", i.vendor_name || "",
        day(i.expense_date), i.claim_type || "", i.billing_type || "",
        i.work_category || i.category || "", i.sub_category || "",
        i.po_number || "",
        i.domain === "Others" ? `Others: ${i.other_domain || ""}` : i.domain || "",
        i.client_name || "", i.site_route || "", num(i.estimate_wcc_amount),
        i.description || "", i.bill_number || "",
        Number(i.claimed_amount || 0),
        num(i.l1_approved_amount), i.l1_reason || "",
        num(i.l2_approved_amount), i.l2_reason || "",
        num(i.final_approved_amount), i.final_reason || "",
      ];
      const links = {};
      for (let k = 0; k < maxItemDocs; k += 1) {
        cells.push(docs[k] ? docs[k].name : "");
        if (docs[k]) links[itemHeadersFixed.length + k] = docs[k];
      }
      return { cells, links };
    });

    const raw = await buildLinkedWorkbook([
      { name: "Claims", headers: claimHeaders, rows: claimRows },
      { name: "Expense Items", headers: itemHeaders, rows: itemRows },
    ]);
    const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    // A valid .xlsx is a zip archive — it must start with the "PK" magic bytes.
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new Error("Generated workbook is not a valid xlsx archive");
    }

    res.setHeader("Content-Disposition", `attachment; filename="expense_claims_${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Length", buffer.length);
    res.end(buffer);
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
  if (req.query.cmp) {
    filters.push("c.cost_centre = ?");
    params.push(req.query.cmp);
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
// Admin: categories, sub-categories, cost centres, approval matrix.
// All guarded by the expense-claims-admin page permission.
// ===========================================================================

const ADMIN_PAGE = PAGE_IDS.admin; // "expense-claims-admin"

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
    const [vendorTypes] = await pool.query(`SELECT id, name, is_active FROM expense_vendor_types ORDER BY name ASC`);
    const [employeeTypes] = await pool.query(`SELECT id, name, is_active FROM expense_employee_types ORDER BY name ASC`);
    const [vendors] = await pool.query(`SELECT * FROM expense_vendors ORDER BY name ASC LIMIT 1000`);
    const [pos] = await pool.query(`SELECT * FROM expense_pos ORDER BY po_number ASC LIMIT 1000`);
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
        vendorTypes: vendorTypes.map((r) => ({ id: r.id, name: r.name, isActive: Boolean(r.is_active) })),
        employeeTypes: employeeTypes.map((r) => ({ id: r.id, name: r.name, isActive: Boolean(r.is_active) })),
        vendors: vendors.map(mapVendor),
        pos: pos.map(mapPO),
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

router.delete("/admin/categories/:id", requirePagePermission(ADMIN_PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    // Soft delete — existing claim items keep their stored category label.
    await pool.query(`UPDATE expense_claim_categories SET is_active = 0 WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    fail(res, error, "Failed to remove the category.");
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

// --- simple name masters: vendor types & employee types ------------------
function simpleMasterRoutes(slug, table, label) {
  router.post(`/admin/${slug}`, requirePagePermission(ADMIN_PAGE, "edit"), async (req, res) => {
    try {
      await ensureTables();
      const name = String(req.body?.name ?? "").trim();
      if (!name) throw httpError(400, `${label} name is required.`);
      await pool.query(`INSERT INTO ${table} (name) VALUES (?)`, [name]);
      res.json({ success: true });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") return fail(res, httpError(409, `That ${label.toLowerCase()} already exists.`));
      fail(res, error, `Failed to add the ${label.toLowerCase()}.`);
    }
  });
  router.put(`/admin/${slug}/:id`, requirePagePermission(ADMIN_PAGE, "edit"), async (req, res) => {
    try {
      await ensureTables();
      const sets = [];
      const params = [];
      if (req.body?.name !== undefined) { sets.push("name = ?"); params.push(String(req.body.name).trim()); }
      if (req.body?.isActive !== undefined) { sets.push("is_active = ?"); params.push(req.body.isActive ? 1 : 0); }
      if (!sets.length) throw httpError(400, "Nothing to update.");
      await pool.query(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = ?`, [...params, req.params.id]);
      res.json({ success: true });
    } catch (error) {
      fail(res, error, `Failed to update the ${label.toLowerCase()}.`);
    }
  });
  router.delete(`/admin/${slug}/:id`, requirePagePermission(ADMIN_PAGE, "edit"), async (req, res) => {
    try {
      await ensureTables();
      await pool.query(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      fail(res, error, `Failed to delete the ${label.toLowerCase()}.`);
    }
  });
}
simpleMasterRoutes("vendor-types", "expense_vendor_types", "Vendor Type");
simpleMasterRoutes("employee-types", "expense_employee_types", "Employee Type");

// --- vendors ---
router.put("/admin/vendors/:id", requirePagePermission(ADMIN_PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const map = { name: "name", vendorType: "vendor_type", gstin: "gstin", phone: "phone", email: "email", bankAccount: "bank_account", ifsc: "ifsc" };
    const sets = [];
    const params = [];
    Object.entries(map).forEach(([k, col]) => {
      if (req.body?.[k] !== undefined) { sets.push(`${col} = ?`); params.push(String(req.body[k]).trim() || null); }
    });
    if (req.body?.isActive !== undefined) { sets.push("is_active = ?"); params.push(req.body.isActive ? 1 : 0); }
    if (!sets.length) throw httpError(400, "Nothing to update.");
    await pool.query(`UPDATE expense_vendors SET ${sets.join(", ")} WHERE id = ?`, [...params, req.params.id]);
    res.json({ success: true });
  } catch (error) {
    fail(res, error, "Failed to update the vendor.");
  }
});
router.delete("/admin/vendors/:id", requirePagePermission(ADMIN_PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    await pool.query(`UPDATE expense_vendors SET is_active = 0 WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    fail(res, error, "Failed to remove the vendor.");
  }
});

// --- PO master ---
router.post("/admin/pos", requirePagePermission(ADMIN_PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const poNumber = String(req.body?.poNumber ?? "").trim();
    if (!poNumber) throw httpError(400, "PO Number is required.");
    const wcc = req.body?.estimateWccAmount;
    await pool.query(
      `INSERT INTO expense_pos (po_number, work_category, domain, client_name, site_route, estimate_wcc_amount, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        poNumber,
        String(req.body?.workCategory ?? "").trim() || null,
        String(req.body?.domain ?? "").trim() || null,
        String(req.body?.clientName ?? "").trim() || null,
        String(req.body?.siteRoute ?? "").trim() || null,
        wcc === "" || wcc === null || wcc === undefined ? null : toMoney(wcc),
        String(req.body?.description ?? "").trim() || null,
      ]
    );
    res.json({ success: true });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return fail(res, httpError(409, "That PO Number already exists."));
    fail(res, error, "Failed to add the PO.");
  }
});
router.put("/admin/pos/:id", requirePagePermission(ADMIN_PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const map = {
      poNumber: "po_number", workCategory: "work_category", domain: "domain",
      clientName: "client_name", siteRoute: "site_route", description: "description",
    };
    const sets = [];
    const params = [];
    Object.entries(map).forEach(([k, col]) => {
      if (req.body?.[k] !== undefined) { sets.push(`${col} = ?`); params.push(String(req.body[k]).trim() || null); }
    });
    if (req.body?.estimateWccAmount !== undefined) {
      const w = req.body.estimateWccAmount;
      sets.push("estimate_wcc_amount = ?");
      params.push(w === "" || w === null ? null : toMoney(w));
    }
    if (req.body?.isActive !== undefined) { sets.push("is_active = ?"); params.push(req.body.isActive ? 1 : 0); }
    if (!sets.length) throw httpError(400, "Nothing to update.");
    await pool.query(`UPDATE expense_pos SET ${sets.join(", ")} WHERE id = ?`, [...params, req.params.id]);
    res.json({ success: true });
  } catch (error) {
    fail(res, error, "Failed to update the PO.");
  }
});
router.delete("/admin/pos/:id", requirePagePermission(ADMIN_PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    await pool.query(`UPDATE expense_pos SET is_active = 0 WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    fail(res, error, "Failed to remove the PO.");
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
        configured: Boolean(rule?.l1_user_id && rule?.l2_user_id),
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
    if (!l2) throw httpError(400, "Pick an L2 approver — it is required.");
    if (l2 === l1) throw httpError(400, "L2 approver must be different from L1.");
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

    // Re-point in-flight claims onto the new chain. A claim freezes its approver
    // ids at submit time, so without this a chain change never reaches claims
    // that were already submitted. We only re-point the stages a claim has NOT
    // yet completed; stages already approved keep their historical approver id.
    // The "current approver" pointer moves only when the stage the claim is
    // sitting on is the one whose approver changed.
    const stagePlans = [
      {
        status: "pending_l1",
        stage: "l1",
        label: "L1",
        setCols: { l1_approver_user_id: l1, l2_approver_user_id: l2, final_approver_user_id: fin },
        currentId: l1,
      },
      {
        status: "pending_l2",
        stage: "l2",
        label: "L2",
        // L1 already approved — keep l1_approver_user_id as the historical record.
        setCols: { l2_approver_user_id: l2, final_approver_user_id: fin },
        currentId: l2,
      },
      {
        status: "pending_final",
        stage: "final",
        label: "final",
        setCols: { final_approver_user_id: fin },
        currentId: fin,
      },
    ];

    let reroutedCount = 0;
    for (const plan of stagePlans) {
      // Final approver is optional. If it was cleared, leave claims already at
      // the final stage on their existing Final approver so they can still be
      // actioned (removing it mid-flight would strand them).
      if (plan.status === "pending_final" && !fin) continue;
      if (!plan.currentId) continue;

      const [claims] = await pool.query(
        `SELECT id, claim_number, total_claimed, current_approver_user_id
         FROM expense_claims
         WHERE current_status = ? AND employee_user_id <> ?`,
        [plan.status, plan.currentId]
      );
      if (!claims.length) continue;

      const cols = Object.keys(plan.setCols);
      const vals = cols.map((c) => plan.setCols[c]);
      await pool.query(
        `UPDATE expense_claims
         SET ${cols.map((c) => `${c} = ?`).join(", ")}, current_approver_user_id = ?
         WHERE current_status = ? AND employee_user_id <> ?`,
        [...vals, plan.currentId, plan.status, plan.currentId]
      );

      for (const c of claims) {
        if (c.current_approver_user_id === plan.currentId) continue; // no real change
        reroutedCount += 1;
        await notify(pool, {
          userId: plan.currentId,
          claimId: c.id,
          claimNumber: c.claim_number,
          type: "approval_pending",
          message: `Claim ${c.claim_number} (${formatINR(Number(c.total_claimed || 0))}) is now routed to you for ${plan.label} approval.`,
        });
        await writeAudit(pool, {
          claimId: c.id,
          actorUserId: req.authUser.id,
          actorName: actorName(req.authUser),
          stage: plan.stage,
          action: "APPROVERS_REROUTED",
          meta: { l1UserId: l1, l2UserId: l2, finalUserId: fin, stage: plan.stage },
        });
      }
    }

    res.json({ success: true, data: { rerouted: reroutedCount } });
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
  const l1 = num(body?.l1UserId);
  const l2 = num(body?.l2UserId);
  const final = num(body?.finalUserId);
  if (!l1) throw httpError(400, "An L1 approver is required.");
  if (!l2) throw httpError(400, "An L2 approver is required.");
  if (l2 === l1) throw httpError(400, "L2 approver must be different from L1.");
  if (final && (final === l1 || final === l2)) {
    throw httpError(400, "Final approver must be different from L1 and L2.");
  }
  return { category, minAmount, maxAmount, l1, l2, final };
}

router.post("/admin/matrix", requirePagePermission(ADMIN_PAGE, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const m = parseMatrixBody(req.body);
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
// Exposed so the public document route (routes/expenseDocumentRoutes.js) can run
// the same idempotent schema check — it needs the access_token column to exist
// but is mounted outside this router.
module.exports.ensureTables = ensureTables;
