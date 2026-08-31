const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");

const router = express.Router();

const { db } = require("../config/db");
const {
  addCircleFilter,
  assertRowsAllowedCircle,
  authMiddleware,
  canAccessCircle,
  isAllCircle,
} = require("../middleware/circleAccess");
const { requirePagePermission } = require("../middleware/pagePermission");
const {
  getCirclesPayload,
  resolveCircle,
  resolveCmp,
} = require("../services/manpowerConfigService");
const {
  DEFAULT_EXPENSE_CATEGORIES,
  EXPENSE_DOMAINS,
  EXPENSE_STATUSES,
} = require("../constants/expenseCategories");

router.use(authMiddleware);

const PAGE_ID = "expense-management";
const pool = db.promise();

// ---------------------------------------------------------------------------
// Table setup (DDL is never run inside a transaction — see withTransaction).
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
    CREATE TABLE IF NOT EXISTS expense_categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      display_order INT NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_uploads (
      id INT AUTO_INCREMENT PRIMARY KEY,
      upload_date DATE NOT NULL,
      uploaded_by VARCHAR(100) NULL,
      file_name VARCHAR(255) NULL,
      total_records INT NULL,
      total_amount DECIMAL(16,2) NULL,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      file_id INT NOT NULL,
      sr_no INT NULL,
      month_label VARCHAR(20) NOT NULL,
      month_date DATE NOT NULL,
      circle VARCHAR(100) NOT NULL,
      cmp VARCHAR(150) NOT NULL,
      domain VARCHAR(20) NOT NULL,
      expense_category VARCHAR(100) NOT NULL,
      expense_type VARCHAR(150) NOT NULL,
      description VARCHAR(500) NULL,
      vendor VARCHAR(150) NULL,
      bill_no VARCHAR(100) NULL,
      expense_date DATE NOT NULL,
      amount DECIMAL(14,2) NOT NULL,
      gst DECIMAL(14,2) NULL DEFAULT 0,
      total_amount DECIMAL(14,2) NOT NULL,
      status VARCHAR(20) NOT NULL,
      remarks VARCHAR(500) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_expense_file (file_id),
      INDEX idx_expense_month (month_date),
      INDEX idx_expense_circle (circle),
      INDEX idx_expense_category (expense_category),
      INDEX idx_expense_status (status)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_budgets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      month_date DATE NOT NULL,
      circle VARCHAR(100) NOT NULL,
      expense_category VARCHAR(100) NOT NULL,
      budget_amount DECIMAL(14,2) NOT NULL,
      updated_by VARCHAR(100) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_budget_scope (month_date, circle, expense_category)
    )
  `);

  const [existingCategories] = await pool.query(`SELECT COUNT(*) AS count FROM expense_categories`);
  if (existingCategories[0].count === 0) {
    const values = DEFAULT_EXPENSE_CATEGORIES.map((name, index) => [name, index]);
    await pool.query(`INSERT INTO expense_categories (name, display_order) VALUES ?`, [values]);
  }
}

/**
 * Runs `work` inside a single transaction on one pooled connection. Everything
 * commits together or nothing does. DDL must never be issued inside `work` —
 * MySQL/MariaDB implicitly commit on DDL, which would silently break rollback.
 */
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
      console.error("Expense rollback failed:", rollbackError.message);
    }
    throw error;
  } finally {
    conn.release();
  }
}

async function getActiveCategories() {
  await ensureTables();
  const [rows] = await pool.query(
    `SELECT name FROM expense_categories WHERE is_active = 1 ORDER BY display_order ASC, name ASC`
  );
  return rows.map((row) => row.name);
}

// ---------------------------------------------------------------------------
// Upload — file handling
// ---------------------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
});

const ALLOWED_EXTENSIONS = new Set(["xlsx", "xls", "csv"]);

// ---------------------------------------------------------------------------
// Structured row-error helpers, same shape ReportUploadErrorDialog.jsx
// already knows how to render: { row, column, value, expected, reason, fix }.
// ---------------------------------------------------------------------------

const MAX_REPORTED_ROW_ERRORS = 250;

const rowError = ({ row, column, value, expected, reason, fix }) => ({
  row,
  column,
  value:
    value === null || value === undefined || String(value).trim() === ""
      ? "(blank)"
      : String(value).trim(),
  expected,
  reason,
  fix,
});

function throwFileError(message, details) {
  const error = new Error(message);
  error.statusCode = 400;
  error.details = details;
  throw error;
}

function throwRowErrors(errors, label, details = {}) {
  const shown = errors.slice(0, 10);
  const remaining = errors.length - shown.length;
  const lines = shown.map(
    (item) => `Row ${item.row} • ${item.column}: found ${item.value} — ${item.reason}`
  );

  const message =
    `${label} upload stopped.\n\n` +
    (details.fileName ? `File: ${details.fileName}\n` : "") +
    (details.sheetName ? `Sheet: ${details.sheetName}\n\n` : "\n") +
    `We found ${errors.length} row${errors.length === 1 ? "" : "s"} with problems, so nothing was uploaded.\n\n` +
    lines.join("\n") +
    (remaining > 0 ? `\n...and ${remaining} more.` : "") +
    `\n\nRow numbers match the row numbers shown in Excel.`;

  const error = new Error(message);
  error.statusCode = 400;
  error.details = {
    errorType: "row-validation",
    invalidRows: new Set(errors.map((item) => item.row)).size,
    ...details,
    errors: errors.slice(0, MAX_REPORTED_ROW_ERRORS),
    truncated: errors.length > MAX_REPORTED_ROW_ERRORS,
    totalErrors: errors.length,
  };
  throw error;
}

function throwNoValidRows(label, details = {}) {
  const detected = details.detectedHeaders || [];
  const error = new Error(
    `${label} upload stopped.\n\n` +
    (details.fileName ? `File: ${details.fileName}\n` : "") +
    (details.sheetName ? `Sheet: ${details.sheetName}\n\n` : "\n") +
    `The sheet was read successfully but every row was empty, so there is nothing to upload.\n\n` +
    (detected.length ? `Columns found in this sheet: ${detected.join(", ")}.\n\n` : "") +
    `Check that the data starts on row 2, directly under the header row.`
  );
  error.statusCode = 400;
  error.details = { errorType: "empty-sheet", ...details };
  throw error;
}

// ---------------------------------------------------------------------------
// Header parsing / template validation
// ---------------------------------------------------------------------------

const normalizeHeaderKey = (key) =>
  key.toString().trim().toLowerCase().replace(/[\s_]+/g, " ");

const buildCleanRow = (row) => {
  const cleanRow = {};
  Object.keys(row).forEach((key) => {
    cleanRow[normalizeHeaderKey(key)] = row[key];
  });
  return cleanRow;
};

const isBlankRow = (cleanRow) =>
  Object.values(cleanRow).every(
    (value) => value === null || value === undefined || String(value).trim() === ""
  );

const HEADER_ALIASES = {
  srNo: ["sr no", "sr. no", "sr no."],
  month: ["month"],
  circle: ["circle", "circle name"],
  cmp: ["cmp", "cmp name"],
  domain: ["domain"],
  expenseCategory: ["expense category"],
  expenseType: ["expense type"],
  description: ["description"],
  vendor: ["vendor"],
  billNo: ["bill no", "bill no."],
  expenseDate: ["expense date"],
  amount: ["amount"],
  gst: ["gst"],
  totalAmount: ["total amount"],
  status: ["status"],
  remarks: ["remarks"],
};

const EXPECTED_HEADERS = [
  "Sr No", "Month", "Circle", "CMP", "Domain", "Expense Category", "Expense Type",
  "Description", "Vendor", "Bill No", "Expense Date", "Amount", "GST",
  "Total Amount", "Status", "Remarks",
];

const REQUIRED_HEADER_KEYS = ["month", "circle", "cmp", "domain", "expenseCategory", "expenseType", "expenseDate", "amount", "status"];
const REQUIRED_HEADER_LABELS = {
  month: "Month",
  circle: "Circle",
  cmp: "CMP",
  domain: "Domain",
  expenseCategory: "Expense Category",
  expenseType: "Expense Type",
  expenseDate: "Expense Date",
  amount: "Amount",
  status: "Status",
};

const findHeaderAlias = (headerSet, aliases) =>
  aliases.find((alias) => headerSet.has(alias)) ||
  [...headerSet].find((header) =>
    aliases.some((alias) => header === alias || header.startsWith(`${alias} `))
  ) ||
  null;

function assertTemplateHeaders(headers, context = {}) {
  const headerSet = new Set(headers);
  const missing = [];

  REQUIRED_HEADER_KEYS.forEach((key) => {
    if (!findHeaderAlias(headerSet, HEADER_ALIASES[key])) {
      missing.push(REQUIRED_HEADER_LABELS[key]);
    }
  });

  if (missing.length) {
    const error = new Error(
      `Expense upload stopped.\n\n` +
      (context.fileName ? `File: ${context.fileName}\n` : "") +
      (context.sheetName ? `Sheet: ${context.sheetName}\n\n` : "\n") +
      `This does not look like the Expense Management template — missing column(s): ${missing.join(", ")}.\n\n` +
      `Expected columns: ${EXPECTED_HEADERS.join(", ")}.`
    );
    error.statusCode = 400;
    error.details = {
      errorType: "template",
      fileName: context.fileName,
      sheetName: context.sheetName,
      detectedHeaders: headers,
      expectedHeaders: EXPECTED_HEADERS,
      missing,
    };
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Row-value parsing
// ---------------------------------------------------------------------------

const MONTH_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function buildMonthResult(monthIndex, year) {
  const abbr = MONTH_ABBR[monthIndex];
  const label = `${abbr[0].toUpperCase()}${abbr.slice(1)}'${String(year).slice(-2)}`;
  const date = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  return { label, date };
}

function normalizeMonthLabel(raw) {
  if (raw === null || raw === undefined || raw === "") return null;

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return buildMonthResult(raw.getMonth(), raw.getFullYear());
  }

  const text = String(raw).trim();
  if (!text) return null;

  const match = text.match(/^([A-Za-z]{3,9})[\s'.\-]*(\d{2,4})$/);
  if (!match) return null;

  const monthIndex = MONTH_ABBR.indexOf(match[1].toLowerCase().slice(0, 3));
  if (monthIndex === -1) return null;

  let year = Number(match[2]);
  if (!Number.isFinite(year)) return null;
  if (year < 100) year += 2000;

  return buildMonthResult(monthIndex, year);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

// Tolerates a real Date (Excel date-formatted cell), "YYYY-MM-DD", or
// "DD-MM-YYYY" / "DD/MM/YYYY".
function parseExpenseDate(raw) {
  if (raw === null || raw === undefined || raw === "") return null;

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return `${raw.getFullYear()}-${pad2(raw.getMonth() + 1)}-${pad2(raw.getDate())}`;
  }

  const text = String(raw).trim();
  if (!text) return null;

  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const [, y, m, d] = match;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  match = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (match) {
    const [, d, m, y] = match;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  return null;
}

function resolveDomain(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  return EXPENSE_DOMAINS.find((domain) => domain.toLowerCase() === text.toLowerCase()) || null;
}

function normalizeCategoryKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s*&\s*/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveCategory(raw, activeCategories) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const target = normalizeCategoryKey(text);
  return activeCategories.find((category) => normalizeCategoryKey(category) === target) || null;
}

function resolveStatus(raw) {
  const text = String(raw ?? "").trim().toLowerCase();
  if (!text) return null;
  return EXPENSE_STATUSES.includes(text) ? text : null;
}

// Returns: a number when valid, null when the cell is genuinely blank (only
// valid for optional columns), or `undefined` as a sentinel meaning
// "unparseable — already recorded as a row error".
function parseOptionalNumber(raw, column, rowNumber, errors) {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;

  const cleaned = String(raw).replace(/[,₹%\s]/g, "");
  const value = Number(cleaned);
  if (!Number.isFinite(value)) {
    errors.push(
      rowError({
        row: rowNumber,
        column,
        value: raw,
        expected: "A number, e.g. 25000",
        reason: `"${raw}" is not a valid number.`,
        fix: `Enter a plain number in the ${column} column of row ${rowNumber}.`,
      })
    );
    return undefined;
  }
  return value;
}

async function validateRowCircleCmp(circleRaw, cmpRaw, rowNumber, errors, circleCmpMap) {
  const circleText = String(circleRaw ?? "").trim();
  const cmpText = String(cmpRaw ?? "").trim();
  const circleExpected = Object.keys(circleCmpMap).join(" | ");

  if (!circleText) {
    errors.push(
      rowError({
        row: rowNumber,
        column: "Circle",
        value: circleRaw,
        expected: circleExpected,
        reason: "Circle is required. Please enter a valid Circle name.",
        fix: `Type one of the allowed circle names into the Circle column of row ${rowNumber}.`,
      })
    );
    if (!cmpText) {
      errors.push(
        rowError({
          row: rowNumber,
          column: "CMP",
          value: cmpRaw,
          expected: "Any CMP that belongs to the row's Circle",
          reason: "CMP is required. Please enter a valid CMP name.",
          fix: `Fill in the CMP column of row ${rowNumber}.`,
        })
      );
    }
    return null;
  }

  if (!cmpText) {
    errors.push(
      rowError({
        row: rowNumber,
        column: "CMP",
        value: cmpRaw,
        expected: "Any CMP that belongs to the row's Circle",
        reason: "CMP is required. Please enter a valid CMP name.",
        fix: `Fill in the CMP column of row ${rowNumber}.`,
      })
    );
    return null;
  }

  const canonicalCircle = await resolveCircle(circleText);
  if (!canonicalCircle) {
    errors.push(
      rowError({
        row: rowNumber,
        column: "Circle",
        value: circleText,
        expected: circleExpected,
        reason: `"${circleText}" is not a recognised Circle name.`,
        fix: `Replace it with the exact circle name from the Circles master list — check for typos, extra spaces or a short form.`,
      })
    );
    return null;
  }

  const canonicalCmp = await resolveCmp(canonicalCircle, cmpText);
  if (!canonicalCmp) {
    const allowedCmps = circleCmpMap[canonicalCircle] || [];
    errors.push(
      rowError({
        row: rowNumber,
        column: "CMP",
        value: cmpText,
        expected: allowedCmps.join(" | "),
        reason: `"${cmpText}" does not belong to Circle "${canonicalCircle}".`,
        fix: `Use one of the allowed CMPs for ${canonicalCircle}: ${allowedCmps.join(", ")}.`,
      })
    );
    return null;
  }

  return { circle: canonicalCircle, cmp: canonicalCmp };
}

// ---------------------------------------------------------------------------
// Workbook -> validated rows
// ---------------------------------------------------------------------------

async function parseExpenseRows(fileBuffer, fileName) {
  let workbook;
  try {
    workbook = xlsx.read(fileBuffer, { type: "buffer", cellDates: true });
  } catch (parseError) {
    throwFileError(
      `"${fileName}" could not be opened as a spreadsheet.\n\n` +
      `The file is either corrupt, password protected, or was renamed to .xlsx from another format.\n\n` +
      `Open it in Excel, use File > Save As to save a fresh .xlsx copy, then upload that copy.`,
      { errorType: "unreadable-file", fileName, reason: parseError.message }
    );
  }

  const sheetNames = workbook.SheetNames || [];
  if (!sheetNames.length) {
    throwFileError(`"${fileName}" has no worksheets.`, { errorType: "no-sheets", fileName });
  }

  const sheetName = sheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawRows = xlsx.utils.sheet_to_json(worksheet, { defval: "" });

  if (!rawRows.length) {
    throwFileError(
      `"${fileName}" has no data rows.\n\nSheet: ${sheetName}\n\n` +
      `The sheet has a header row but no data underneath it. Add your data starting at row 2 and upload again.`,
      { errorType: "empty-sheet", fileName, sheetName }
    );
  }

  const headers = [...new Set(Object.keys(rawRows[0]).map(normalizeHeaderKey))];
  assertTemplateHeaders(headers, { fileName, sheetName });

  const headerSet = new Set(headers);
  const keys = {};
  Object.keys(HEADER_ALIASES).forEach((key) => {
    keys[key] = findHeaderAlias(headerSet, HEADER_ALIASES[key]);
  });

  const { circleCmpMap } = await getCirclesPayload();
  const activeCategories = await getActiveCategories();

  const errors = [];
  const validRows = [];

  for (let i = 0; i < rawRows.length; i += 1) {
    const cleanRow = buildCleanRow(rawRows[i]);
    if (isBlankRow(cleanRow)) continue;

    const rowNumber = i + 2; // header is row 1 in Excel

    const monthResult = normalizeMonthLabel(cleanRow[keys.month]);
    if (!monthResult) {
      const monthRaw = cleanRow[keys.month];
      errors.push(
        rowError({
          row: rowNumber,
          column: "Month",
          value: monthRaw,
          expected: "e.g. Jan'26",
          reason: monthRaw ? `"${monthRaw}" is not a recognised month.` : "Month is required.",
          fix: `Enter the month like "Jan'26" in row ${rowNumber}.`,
        })
      );
    }

    const circleCmp = await validateRowCircleCmp(
      cleanRow[keys.circle],
      cleanRow[keys.cmp],
      rowNumber,
      errors,
      circleCmpMap
    );

    const domainRaw = cleanRow[keys.domain];
    const domain = resolveDomain(domainRaw);
    if (!domain) {
      errors.push(
        rowError({
          row: rowNumber,
          column: "Domain",
          value: domainRaw,
          expected: EXPENSE_DOMAINS.join(" | "),
          reason: domainRaw ? `"${domainRaw}" is not a recognised Domain.` : "Domain is required.",
          fix: `Use one of: ${EXPENSE_DOMAINS.join(", ")}.`,
        })
      );
    }

    const categoryRaw = cleanRow[keys.expenseCategory];
    const category = resolveCategory(categoryRaw, activeCategories);
    if (!category) {
      errors.push(
        rowError({
          row: rowNumber,
          column: "Expense Category",
          value: categoryRaw,
          expected: activeCategories.join(" | "),
          reason: categoryRaw ? `"${categoryRaw}" is not a recognised Expense Category.` : "Expense Category is required.",
          fix: `Use one of: ${activeCategories.join(", ")}.`,
        })
      );
    }

    const expenseTypeRaw = cleanRow[keys.expenseType];
    const expenseType = String(expenseTypeRaw ?? "").trim();
    if (!expenseType) {
      errors.push(
        rowError({
          row: rowNumber,
          column: "Expense Type",
          value: expenseTypeRaw,
          expected: "Any short expense type label",
          reason: "Expense Type is required.",
          fix: `Fill in the Expense Type column of row ${rowNumber}.`,
        })
      );
    }

    const expenseDateRaw = cleanRow[keys.expenseDate];
    const expenseDate = parseExpenseDate(expenseDateRaw);
    if (!expenseDate) {
      errors.push(
        rowError({
          row: rowNumber,
          column: "Expense Date",
          value: expenseDateRaw,
          expected: "A date, e.g. 15-01-2026",
          reason: expenseDateRaw ? `"${expenseDateRaw}" is not a recognised date.` : "Expense Date is required.",
          fix: `Enter a valid date in the Expense Date column of row ${rowNumber}.`,
        })
      );
    }

    const amountRaw = cleanRow[keys.amount];
    let amount;
    if (amountRaw === null || amountRaw === undefined || String(amountRaw).trim() === "") {
      errors.push(
        rowError({
          row: rowNumber,
          column: "Amount",
          value: amountRaw,
          expected: "A number, e.g. 25000",
          reason: "Amount is required.",
          fix: `Fill in the Amount column of row ${rowNumber}.`,
        })
      );
      amount = undefined;
    } else {
      amount = parseOptionalNumber(amountRaw, "Amount", rowNumber, errors);
    }

    const gst = parseOptionalNumber(cleanRow[keys.gst], "GST", rowNumber, errors) || 0;

    const totalAmountRaw = cleanRow[keys.totalAmount];
    let totalAmount = parseOptionalNumber(totalAmountRaw, "Total Amount", rowNumber, errors);

    const statusRaw = cleanRow[keys.status];
    const status = resolveStatus(statusRaw);
    if (!status) {
      errors.push(
        rowError({
          row: rowNumber,
          column: "Status",
          value: statusRaw,
          expected: EXPENSE_STATUSES.join(" | "),
          reason: statusRaw ? `"${statusRaw}" is not a recognised Status.` : "Status is required.",
          fix: `Use one of: ${EXPENSE_STATUSES.join(", ")}.`,
        })
      );
    }

    const srNoRaw = cleanRow[keys.srNo];
    const srNoParsed = Number(String(srNoRaw ?? "").trim());
    const srNo = Number.isFinite(srNoParsed) && String(srNoRaw ?? "").trim() !== "" ? srNoParsed : null;

    const hasInvalidNumeric = [amount, gst, totalAmount].includes(undefined);

    if (!monthResult || !circleCmp || !domain || !category || !expenseType || !expenseDate || !status || hasInvalidNumeric) {
      continue;
    }

    const resolvedTotalAmount = totalAmount === null || totalAmount === undefined
      ? Number((amount + gst).toFixed(2))
      : totalAmount;

    validRows.push({
      rowNumber,
      srNo,
      monthLabel: monthResult.label,
      monthDate: monthResult.date,
      circle: circleCmp.circle,
      cmp: circleCmp.cmp,
      domain,
      expenseCategory: category,
      expenseType,
      description: String(cleanRow[keys.description] ?? "").trim() || null,
      vendor: String(cleanRow[keys.vendor] ?? "").trim() || null,
      billNo: String(cleanRow[keys.billNo] ?? "").trim() || null,
      expenseDate,
      amount,
      gst,
      totalAmount: resolvedTotalAmount,
      status,
      remarks: String(cleanRow[keys.remarks] ?? "").trim() || null,
    });
  }

  if (errors.length) {
    throwRowErrors(errors, "Expense", {
      fileName,
      sheetName,
      totalRows: rawRows.length,
      detectedHeaders: headers,
    });
  }

  if (!validRows.length) {
    throwNoValidRows("Expense", { fileName, sheetName, detectedHeaders: headers });
  }

  return { validRows, sheetName, headers };
}

// ---------------------------------------------------------------------------
// Shared filter builder for /records, /summary and /export
// ---------------------------------------------------------------------------

function buildExpenseFilters(req) {
  const {
    month, circle, cmp, domain, category, expenseType, vendor, status,
    dateFrom, dateTo, search, fileId,
  } = req.query;

  const filters = ["1=1"];
  const params = [];

  addCircleFilter(filters, params, req.authUser, "r.circle");

  if (fileId) {
    filters.push("r.file_id = ?");
    params.push(fileId);
  }
  if (month) {
    filters.push("r.month_label = ?");
    params.push(month);
  }
  if (circle) {
    filters.push("r.circle = ?");
    params.push(circle);
  }
  if (cmp) {
    filters.push("r.cmp = ?");
    params.push(cmp);
  }
  if (domain) {
    filters.push("r.domain = ?");
    params.push(domain);
  }
  if (category) {
    filters.push("r.expense_category = ?");
    params.push(category);
  }
  if (expenseType) {
    filters.push("r.expense_type = ?");
    params.push(expenseType);
  }
  if (vendor) {
    filters.push("r.vendor = ?");
    params.push(vendor);
  }
  if (status) {
    filters.push("r.status = ?");
    params.push(String(status).toLowerCase());
  }
  if (dateFrom) {
    filters.push("r.expense_date >= ?");
    params.push(dateFrom);
  }
  if (dateTo) {
    filters.push("r.expense_date <= ?");
    params.push(dateTo);
  }
  if (search) {
    filters.push("(r.circle LIKE ? OR r.cmp LIKE ? OR r.vendor LIKE ? OR r.bill_no LIKE ? OR r.description LIKE ? OR r.expense_type LIKE ?)");
    const like = `%${search}%`;
    params.push(like, like, like, like, like, like);
  }

  return { filters, params };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

router.get("/meta", requirePagePermission(PAGE_ID, "view"), async (req, res) => {
  try {
    const categories = await getActiveCategories();

    const filters = ["1=1"];
    const params = [];
    addCircleFilter(filters, params, req.authUser, "circle");
    const whereClause = filters.join(" AND ");

    const [vendorRows] = await pool.query(
      `SELECT DISTINCT vendor FROM expense_records WHERE ${whereClause} AND vendor IS NOT NULL AND vendor <> '' ORDER BY vendor ASC LIMIT 500`,
      params
    );
    const [expenseTypeRows] = await pool.query(
      `SELECT DISTINCT expense_type FROM expense_records WHERE ${whereClause} ORDER BY expense_type ASC LIMIT 500`,
      params
    );

    res.json({
      success: true,
      data: {
        categories,
        domains: EXPENSE_DOMAINS,
        statuses: EXPENSE_STATUSES,
        vendors: vendorRows.map((row) => row.vendor),
        expenseTypes: expenseTypeRows.map((row) => row.expense_type),
      },
    });
  } catch (error) {
    console.error("Expense meta fetch failed:", error);
    res.status(500).json({ success: false, message: "Failed to load Expense meta." });
  }
});

router.post(
  "/upload",
  requirePagePermission(PAGE_ID, "edit"),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: "Please choose an Excel file to upload." });
      }

      const { date, uploadedBy, duplicateAction } = req.body;
      if (!date) {
        return res.status(400).json({ success: false, message: "Upload date is required." });
      }
      if (!uploadedBy || !String(uploadedBy).trim()) {
        return res.status(400).json({ success: false, message: "Uploaded By is required." });
      }

      const ext = (req.file.originalname.split(".").pop() || "").toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return res.status(400).json({
          success: false,
          message: `Unsupported file type ".${ext}". Please upload an .xlsx, .xls or .csv file.`,
        });
      }

      const { validRows } = await parseExpenseRows(req.file.buffer, req.file.originalname);

      assertRowsAllowedCircle(req.authUser, validRows, (row) => row.circle);

      await ensureTables();

      // Amount is a DECIMAL column — mysql2 returns it as a string ("25000.00"),
      // while freshly-parsed upload rows carry a plain JS number (25000). Both
      // sides must format through the same toFixed(2) or the dedup keys never
      // match and duplicates silently re-import.
      const keyOf = (row) =>
        `${row.monthDate}::${row.circle}::${row.cmp}::${row.vendor || ""}::${row.billNo || ""}::${row.expenseDate}::${Number(row.amount).toFixed(2)}`;

      const monthDates = [...new Set(validRows.map((row) => row.monthDate))];
      const [existingRows] = monthDates.length
        ? await pool.query(
            `SELECT month_date, circle, cmp, vendor, bill_no, expense_date, amount
             FROM expense_records WHERE month_date IN (?)`,
            [monthDates]
          )
        : [[]];

      const existingKeySet = new Set(
        existingRows.map((row) =>
          `${row.month_date}::${row.circle}::${row.cmp}::${row.vendor || ""}::${row.bill_no || ""}::${row.expense_date}::${Number(row.amount).toFixed(2)}`
        )
      );

      const duplicateKeys = [
        ...new Set(validRows.map(keyOf).filter((key) => existingKeySet.has(key))),
      ];

      if (duplicateKeys.length && !duplicateAction) {
        return res.status(409).json({
          success: false,
          duplicate: true,
          message: `${duplicateKeys.length} row(s) in this file match Expense data already uploaded for the same Month, Circle, CMP, Vendor, Bill No, Expense Date and Amount.`,
          duplicates: duplicateKeys.map((key) => {
            const [monthDate, circle, cmp, vendor, billNo, expenseDate, amount] = key.split("::");
            return { monthDate, circle, cmp, vendor, billNo, expenseDate, amount };
          }),
        });
      }

      const duplicateKeySet = new Set(duplicateKeys);
      const rowsToInsert =
        duplicateAction === "skip"
          ? validRows.filter((row) => !duplicateKeySet.has(keyOf(row)))
          : validRows;

      if (duplicateAction === "skip" && rowsToInsert.length === 0) {
        return res.json({
          success: true,
          upload: null,
          skipped: duplicateKeys.length,
          totalRows: validRows.length,
          duplicateRows: duplicateKeys.length,
          invalidRows: 0,
        });
      }

      const result = await withTransaction(async (conn) => {
        const totalAmount = rowsToInsert.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0);

        const [uploadResult] = await conn.query(
          `INSERT INTO expense_uploads (upload_date, uploaded_by, file_name, total_records, total_amount) VALUES (?, ?, ?, ?, ?)`,
          [date, String(uploadedBy).trim(), req.file.originalname, rowsToInsert.length, totalAmount]
        );
        const fileId = uploadResult.insertId;

        if (duplicateAction === "replace" && duplicateKeys.length) {
          for (const key of duplicateKeys) {
            const [monthDate, circle, cmp, vendor, billNo, expenseDate, amount] = key.split("::");
            await conn.query(
              `DELETE FROM expense_records
               WHERE month_date = ? AND circle = ? AND cmp = ? AND COALESCE(vendor,'') = ? AND COALESCE(bill_no,'') = ? AND expense_date = ? AND amount = ?`,
              [monthDate, circle, cmp, vendor, billNo, expenseDate, amount]
            );
          }
        }

        if (rowsToInsert.length) {
          const values = rowsToInsert.map((row) => [
            fileId,
            row.srNo,
            row.monthLabel,
            row.monthDate,
            row.circle,
            row.cmp,
            row.domain,
            row.expenseCategory,
            row.expenseType,
            row.description,
            row.vendor,
            row.billNo,
            row.expenseDate,
            row.amount,
            row.gst,
            row.totalAmount,
            row.status,
            row.remarks,
          ]);
          await conn.query(
            `INSERT INTO expense_records
              (file_id, sr_no, month_label, month_date, circle, cmp, domain, expense_category,
               expense_type, description, vendor, bill_no, expense_date, amount, gst,
               total_amount, status, remarks)
             VALUES ?`,
            [values]
          );
        }

        return { fileId, totalAmount };
      });

      res.json({
        success: true,
        upload: {
          id: result.fileId,
          uploadDate: date,
          uploadedBy: String(uploadedBy).trim(),
          fileName: req.file.originalname,
          totalRecords: rowsToInsert.length,
          totalAmount: result.totalAmount,
        },
        totalRows: validRows.length,
        importedRows: rowsToInsert.length,
        duplicateRows: duplicateAction === "skip" ? duplicateKeys.length : 0,
        invalidRows: 0,
        skipped: duplicateAction === "skip" ? duplicateKeys.length : 0,
      });
    } catch (error) {
      console.error("Expense upload failed:", error);
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        message: error.message || "Upload failed. Please try again.",
        ...(error.details || {}),
      });
    }
  }
);

router.get("/uploads", requirePagePermission(PAGE_ID, "view"), async (req, res) => {
  try {
    await ensureTables();

    const [uploads] = await pool.query(
      `SELECT id, upload_date, uploaded_by, file_name, total_records, total_amount, uploaded_at
       FROM expense_uploads ORDER BY uploaded_at DESC, id DESC`
    );

    if (!uploads.length) {
      return res.json({ success: true, data: [] });
    }

    const fileIds = uploads.map((row) => row.id);
    const filters = [`file_id IN (${fileIds.map(() => "?").join(",")})`];
    const params = [...fileIds];
    addCircleFilter(filters, params, req.authUser, "circle");

    const [circleRows] = await pool.query(
      `SELECT file_id, circle FROM expense_records WHERE ${filters.join(" AND ")} GROUP BY file_id, circle`,
      params
    );

    const circlesByFile = new Map();
    circleRows.forEach(({ file_id: fileId, circle }) => {
      if (!circlesByFile.has(fileId)) circlesByFile.set(fileId, []);
      circlesByFile.get(fileId).push(circle);
    });

    const data = uploads
      .map((row) => ({ ...row, circles: circlesByFile.get(row.id) || [] }))
      .filter((row) => isAllCircle(req.authUser) || row.circles.length > 0);

    res.json({ success: true, data });
  } catch (error) {
    console.error("Expense uploads fetch failed:", error);
    res.status(500).json({ success: false, message: "Failed to load uploaded files." });
  }
});

router.get("/records", requirePagePermission(PAGE_ID, "view"), async (req, res) => {
  try {
    await ensureTables();

    const { filters, params } = buildExpenseFilters(req);
    const whereClause = filters.join(" AND ");

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM expense_records r
       JOIN expense_uploads u ON u.id = r.file_id
       WHERE ${whereClause}`,
      params
    );

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.pageSize) || 50, 500);
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(
      `SELECT r.*, u.uploaded_by, u.upload_date, u.file_name
       FROM expense_records r
       JOIN expense_uploads u ON u.id = r.file_id
       WHERE ${whereClause}
       ORDER BY r.expense_date DESC, r.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({ success: true, data: rows, total: countRows[0].total, page, pageSize: limit });
  } catch (error) {
    console.error("Expense records fetch failed:", error);
    res.status(500).json({ success: false, message: "Failed to load Expense records." });
  }
});

router.get("/summary", requirePagePermission(PAGE_ID, "view"), async (req, res) => {
  try {
    await ensureTables();

    const { filters, params } = buildExpenseFilters(req);
    const whereClause = filters.join(" AND ");
    const baseFrom = `FROM expense_records r JOIN expense_uploads u ON u.id = r.file_id WHERE ${whereClause}`;

    const [totalsRows] = await pool.query(
      `SELECT
         COUNT(*) AS totalRecords,
         COALESCE(SUM(r.total_amount), 0) AS total,
         COALESCE(SUM(CASE WHEN r.status = 'approved' THEN r.total_amount ELSE 0 END), 0) AS approved,
         COALESCE(SUM(CASE WHEN r.status = 'pending' THEN r.total_amount ELSE 0 END), 0) AS pending,
         COALESCE(SUM(CASE WHEN r.status = 'rejected' THEN r.total_amount ELSE 0 END), 0) AS rejected,
         COALESCE(SUM(CASE WHEN r.status = 'paid' THEN r.total_amount ELSE 0 END), 0) AS paid
       ${baseFrom}`,
      params
    );

    const [refMonthRows] = await pool.query(`SELECT MAX(r.month_date) AS refMonth ${baseFrom}`, params);
    const refMonth = refMonthRows[0]?.refMonth || null;

    let thisMonth = 0;
    let previousMonth = 0;
    if (refMonth) {
      const [monthTotals] = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN r.month_date = ? THEN r.total_amount ELSE 0 END), 0) AS thisMonth,
           COALESCE(SUM(CASE WHEN r.month_date = DATE_SUB(?, INTERVAL 1 MONTH) THEN r.total_amount ELSE 0 END), 0) AS previousMonth
         ${baseFrom}`,
        [refMonth, refMonth, ...params]
      );
      thisMonth = monthTotals[0].thisMonth;
      previousMonth = monthTotals[0].previousMonth;
    }

    const [byMonthRows] = await pool.query(
      `SELECT DATE_FORMAT(r.month_date, '%Y-%m-%d') AS monthDate, r.month_label AS monthLabel,
              COUNT(*) AS count, COALESCE(SUM(r.total_amount), 0) AS amount
       ${baseFrom}
       GROUP BY r.month_date, r.month_label
       ORDER BY r.month_date ASC`,
      params
    );

    const [byCategoryRows] = await pool.query(
      `SELECT r.expense_category AS name, COUNT(*) AS count, COALESCE(SUM(r.total_amount), 0) AS amount
       ${baseFrom}
       GROUP BY r.expense_category
       ORDER BY amount DESC`,
      params
    );

    const [byCircleRows] = await pool.query(
      `SELECT r.circle AS name, COUNT(*) AS count, COALESCE(SUM(r.total_amount), 0) AS amount
       ${baseFrom}
       GROUP BY r.circle
       ORDER BY amount DESC`,
      params
    );

    const [byCmpRows] = await pool.query(
      `SELECT r.cmp AS name, r.circle AS circle, COUNT(*) AS count, COALESCE(SUM(r.total_amount), 0) AS amount
       ${baseFrom}
       GROUP BY r.cmp, r.circle
       ORDER BY amount DESC`,
      params
    );

    const [topExpenses] = await pool.query(
      `SELECT r.id, r.expense_category, r.expense_type, r.circle, r.cmp, r.vendor, r.bill_no,
              r.total_amount, r.status, r.expense_date
       ${baseFrom}
       ORDER BY r.total_amount DESC
       LIMIT 10`,
      params
    );

    const [pendingExpenses] = await pool.query(
      `SELECT r.id, r.bill_no, r.vendor, r.circle, r.cmp, r.expense_category, r.total_amount,
              r.expense_date, r.status, r.remarks
       ${baseFrom.replace("WHERE", "WHERE r.status = 'pending' AND")}
       ORDER BY r.expense_date DESC
       LIMIT 100`,
      params
    );

    // Budget vs Actual — month-level budget (not split by circle or category),
    // stored against the fixed "ALL" scope by POST /budgets.
    const { month, dateFrom, dateTo } = req.query;
    const budgetFilters = ["b.circle = 'ALL'", "b.expense_category = 'ALL'"];
    const budgetParams = [];
    if (month && refMonth) {
      budgetFilters.push("b.month_date = ?");
      budgetParams.push(refMonth);
    } else if (dateFrom || dateTo) {
      if (dateFrom) {
        budgetFilters.push("b.month_date >= ?");
        budgetParams.push(dateFrom);
      }
      if (dateTo) {
        budgetFilters.push("b.month_date <= ?");
        budgetParams.push(dateTo);
      }
    }

    const [budgetRows] = await pool.query(
      `SELECT COALESCE(SUM(b.budget_amount), 0) AS budgetTotal
       FROM expense_budgets b WHERE ${budgetFilters.join(" AND ")}`,
      budgetParams
    );

    const budgetTotal = Number(budgetRows[0].budgetTotal || 0);
    const actualTotal = Number(totalsRows[0].total || 0);
    const remaining = budgetTotal - actualTotal;
    const utilizationPercent = budgetTotal > 0 ? Number(((actualTotal / budgetTotal) * 100).toFixed(2)) : 0;

    res.json({
      success: true,
      data: {
        ...totalsRows[0],
        thisMonth,
        previousMonth,
        refMonth,
        byMonth: byMonthRows,
        byCategory: byCategoryRows,
        byCircle: byCircleRows,
        byCmp: byCmpRows,
        topExpenses,
        pendingExpenses,
        budget: {
          budgetTotal,
          actualTotal,
          remaining,
          utilizationPercent,
          overBudget: budgetTotal > 0 && actualTotal > budgetTotal,
        },
      },
    });
  } catch (error) {
    console.error("Expense summary fetch failed:", error);
    res.status(500).json({ success: false, message: "Failed to load Expense summary." });
  }
});

router.get("/export", requirePagePermission(PAGE_ID, "download"), async (req, res) => {
  try {
    await ensureTables();
    const type = req.query.type || "filtered";

    const workbook = xlsx.utils.book_new();

    if (type === "summary" || type === "report") {
      const { filters, params } = buildExpenseFilters(req);
      const baseFrom = `FROM expense_records r JOIN expense_uploads u ON u.id = r.file_id WHERE ${filters.join(" AND ")}`;

      const [byCategoryRows] = await pool.query(
        `SELECT r.expense_category AS "Category", COUNT(*) AS "Count", COALESCE(SUM(r.total_amount),0) AS "Amount" ${baseFrom} GROUP BY r.expense_category ORDER BY 3 DESC`,
        params
      );
      const [byCircleRows] = await pool.query(
        `SELECT r.circle AS "Circle", COUNT(*) AS "Count", COALESCE(SUM(r.total_amount),0) AS "Amount" ${baseFrom} GROUP BY r.circle ORDER BY 3 DESC`,
        params
      );
      const [byStatusRows] = await pool.query(
        `SELECT r.status AS "Status", COUNT(*) AS "Count", COALESCE(SUM(r.total_amount),0) AS "Amount" ${baseFrom} GROUP BY r.status ORDER BY 3 DESC`,
        params
      );

      xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(byCategoryRows), "By Category");
      xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(byCircleRows), "By Circle");
      xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(byStatusRows), "By Status");

      if (type === "report") {
        const [topExpenses] = await pool.query(
          `SELECT r.expense_category AS "Category", r.expense_type AS "Expense Type", r.circle AS "Circle",
                  r.cmp AS "CMP", r.vendor AS "Vendor", r.bill_no AS "Bill No",
                  r.total_amount AS "Amount", r.status AS "Status"
           ${baseFrom} ORDER BY r.total_amount DESC LIMIT 10`,
          params
        );
        const [pendingExpenses] = await pool.query(
          `SELECT r.bill_no AS "Bill No", r.vendor AS "Vendor", r.circle AS "Circle", r.cmp AS "CMP",
                  r.expense_category AS "Category", r.total_amount AS "Amount",
                  r.expense_date AS "Expense Date", r.status AS "Status", r.remarks AS "Remarks"
           ${baseFrom.replace("WHERE", "WHERE r.status = 'pending' AND")} ORDER BY r.expense_date DESC LIMIT 100`,
          params
        );
        const [detailedRows] = await pool.query(
          `SELECT r.month_label AS "Month", r.circle AS "Circle", r.cmp AS "CMP", r.domain AS "Domain",
                  r.expense_category AS "Category", r.expense_type AS "Expense Type",
                  r.description AS "Description", r.vendor AS "Vendor", r.bill_no AS "Bill No",
                  r.expense_date AS "Expense Date", r.amount AS "Amount", r.gst AS "GST",
                  r.total_amount AS "Total Amount", r.status AS "Status", r.remarks AS "Remarks"
           ${baseFrom} ORDER BY r.expense_date DESC LIMIT 20000`,
          params
        );
        xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(topExpenses), "Top 10 Expenses");
        xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(pendingExpenses), "Pending Expenses");
        xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(detailedRows), "Detailed Data");
      }
    } else {
      // "filtered" (respects all query filters) or "all" (circle-scoped only —
      // frontend calls this with no other filters set).
      const { filters, params } = buildExpenseFilters(req);
      const [rows] = await pool.query(
        `SELECT r.month_label AS "Month", r.circle AS "Circle", r.cmp AS "CMP", r.domain AS "Domain",
                r.expense_category AS "Expense Category", r.expense_type AS "Expense Type",
                r.description AS "Description", r.vendor AS "Vendor", r.bill_no AS "Bill No",
                r.expense_date AS "Expense Date", r.amount AS "Amount", r.gst AS "GST",
                r.total_amount AS "Total Amount", r.status AS "Status", r.remarks AS "Remarks"
         FROM expense_records r JOIN expense_uploads u ON u.id = r.file_id
         WHERE ${filters.join(" AND ")}
         ORDER BY r.expense_date DESC, r.id ASC
         LIMIT 20000`,
        params
      );
      xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(rows), "Expenses");
    }

    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", `attachment; filename="expense_${type}_export.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (error) {
    console.error("Expense export failed:", error);
    res.status(500).json({ success: false, message: "Failed to export data." });
  }
});

router.get("/download/:uploadId", requirePagePermission(PAGE_ID, "download"), async (req, res) => {
  try {
    await ensureTables();

    const { uploadId } = req.params;
    const filters = ["r.file_id = ?"];
    const params = [uploadId];
    addCircleFilter(filters, params, req.authUser, "r.circle");

    const [rows] = await pool.query(
      `SELECT r.month_label AS "Month", r.circle AS "Circle", r.cmp AS "CMP", r.domain AS "Domain",
              r.expense_category AS "Expense Category", r.expense_type AS "Expense Type",
              r.description AS "Description", r.vendor AS "Vendor", r.bill_no AS "Bill No",
              r.expense_date AS "Expense Date", r.amount AS "Amount", r.gst AS "GST",
              r.total_amount AS "Total Amount", r.status AS "Status", r.remarks AS "Remarks"
       FROM expense_records r
       WHERE ${filters.join(" AND ")}
       ORDER BY r.expense_date, r.id`,
      params
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "No records found for this upload." });
    }

    const [uploadRows] = await pool.query(`SELECT file_name FROM expense_uploads WHERE id = ?`, [uploadId]);
    const fileName = uploadRows[0]?.file_name || `expense_${uploadId}.xlsx`;

    const worksheet = xlsx.utils.json_to_sheet(rows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Expenses");
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", `attachment; filename="${fileName.replace(/"/g, "")}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (error) {
    console.error("Expense download failed:", error);
    res.status(500).json({ success: false, message: "Failed to download file." });
  }
});

router.put("/records/:id", requirePagePermission(PAGE_ID, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;

    const [existingRows] = await pool.query(`SELECT * FROM expense_records WHERE id = ?`, [id]);
    const existing = existingRows[0];
    if (!existing) {
      return res.status(404).json({ success: false, message: "Record not found." });
    }
    if (!canAccessCircle(req.authUser, existing.circle)) {
      return res.status(403).json({ success: false, message: "You cannot edit another circle's data." });
    }

    const {
      expenseCategory, expenseType, description, vendor, billNo,
      amount, gst, status, remarks,
    } = req.body;

    const activeCategories = await getActiveCategories();
    const category = expenseCategory ? resolveCategory(expenseCategory, activeCategories) : existing.expense_category;
    if (expenseCategory && !category) {
      return res.status(400).json({ success: false, message: `"${expenseCategory}" is not a recognised Expense Category.` });
    }

    const nextStatus = status ? resolveStatus(status) : existing.status;
    if (status && !nextStatus) {
      return res.status(400).json({ success: false, message: `"${status}" is not a recognised Status.` });
    }

    const nextAmount = amount !== undefined && amount !== null && amount !== "" ? Number(amount) : Number(existing.amount);
    const nextGst = gst !== undefined && gst !== null && gst !== "" ? Number(gst) : Number(existing.gst || 0);
    if (!Number.isFinite(nextAmount) || !Number.isFinite(nextGst)) {
      return res.status(400).json({ success: false, message: "Amount and GST must be valid numbers." });
    }
    const nextTotal = Number((nextAmount + nextGst).toFixed(2));

    await pool.query(
      `UPDATE expense_records SET
         expense_category = ?, expense_type = ?, description = ?, vendor = ?, bill_no = ?,
         amount = ?, gst = ?, total_amount = ?, status = ?, remarks = ?
       WHERE id = ?`,
      [
        category,
        expenseType !== undefined ? String(expenseType).trim() : existing.expense_type,
        description !== undefined ? (String(description).trim() || null) : existing.description,
        vendor !== undefined ? (String(vendor).trim() || null) : existing.vendor,
        billNo !== undefined ? (String(billNo).trim() || null) : existing.bill_no,
        nextAmount,
        nextGst,
        nextTotal,
        nextStatus,
        remarks !== undefined ? (String(remarks).trim() || null) : existing.remarks,
        id,
      ]
    );

    const [updatedRows] = await pool.query(`SELECT * FROM expense_records WHERE id = ?`, [id]);
    res.json({ success: true, data: updatedRows[0] });
  } catch (error) {
    console.error("Expense record update failed:", error);
    res.status(500).json({ success: false, message: "Failed to update record." });
  }
});

router.delete("/records/:id", requirePagePermission(PAGE_ID, "delete"), async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;

    const [existingRows] = await pool.query(`SELECT circle FROM expense_records WHERE id = ?`, [id]);
    if (!existingRows.length) {
      return res.status(404).json({ success: false, message: "Record not found." });
    }
    if (!canAccessCircle(req.authUser, existingRows[0].circle)) {
      return res.status(403).json({ success: false, message: "You cannot delete another circle's data." });
    }

    await pool.query(`DELETE FROM expense_records WHERE id = ?`, [id]);
    res.json({ success: true });
  } catch (error) {
    console.error("Expense record delete failed:", error);
    res.status(500).json({ success: false, message: "Failed to delete record." });
  }
});

router.delete("/uploads/:uploadId", requirePagePermission(PAGE_ID, "delete"), async (req, res) => {
  try {
    await ensureTables();
    const { uploadId } = req.params;

    if (!isAllCircle(req.authUser)) {
      const [circleRows] = await pool.query(
        `SELECT DISTINCT circle FROM expense_records WHERE file_id = ?`,
        [uploadId]
      );
      const hasForeignCircle = circleRows.some((row) => !canAccessCircle(req.authUser, row.circle));
      if (hasForeignCircle) {
        return res.status(403).json({ success: false, message: "You cannot delete another circle's data." });
      }
    }

    await withTransaction(async (conn) => {
      await conn.query(`DELETE FROM expense_records WHERE file_id = ?`, [uploadId]);
      await conn.query(`DELETE FROM expense_uploads WHERE id = ?`, [uploadId]);
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Expense upload delete failed:", error);
    res.status(500).json({ success: false, message: "Failed to delete upload." });
  }
});

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

router.get("/budgets", requirePagePermission(PAGE_ID, "view"), async (req, res) => {
  try {
    await ensureTables();
    const { month } = req.query;

    // Month-level budgets only (fixed "ALL" scope).
    const filters = ["circle = 'ALL'", "expense_category = 'ALL'"];
    const params = [];
    if (month) {
      filters.push("month_date = ?");
      params.push(month);
    }

    const [rows] = await pool.query(
      `SELECT * FROM expense_budgets WHERE ${filters.join(" AND ")} ORDER BY month_date DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Expense budgets fetch failed:", error);
    res.status(500).json({ success: false, message: "Failed to load budgets." });
  }
});

router.post("/budgets", requirePagePermission(PAGE_ID, "edit"), async (req, res) => {
  try {
    await ensureTables();
    const { monthDate, budgetAmount } = req.body;

    if (!monthDate || budgetAmount === undefined || budgetAmount === "") {
      return res.status(400).json({ success: false, message: "Month and Budget Amount are required." });
    }
    const amount = Number(budgetAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ success: false, message: "Budget Amount must be a valid non-negative number." });
    }

    const monthFirstOfMonth = `${String(monthDate).slice(0, 7)}-01`;
    // Month-level budget — not split by circle or category. Stored against a
    // fixed "ALL" scope so the existing (month, circle, category) unique key
    // still upserts one row per month.
    const BUDGET_SCOPE = "ALL";

    await pool.query(
      `INSERT INTO expense_budgets (month_date, circle, expense_category, budget_amount, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE budget_amount = VALUES(budget_amount), updated_by = VALUES(updated_by)`,
      [monthFirstOfMonth, BUDGET_SCOPE, BUDGET_SCOPE, amount, req.authUser?.name || req.authUser?.username || null]
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Expense budget save failed:", error);
    res.status(500).json({ success: false, message: "Failed to save budget." });
  }
});

module.exports = router;
