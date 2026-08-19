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
const { resolveCircle, resolveCmp } = require("../services/manpowerConfigService");

router.use(authMiddleware);

const pool = db.promise();

// Statuses commonly used in the source data — offered as filter suggestions,
// but not enforced as the only allowed values (see resolvePenaltyStatus).
const KNOWN_STATUSES = ["Pending", "Accepted", "Rejected"];

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
    CREATE TABLE IF NOT EXISTS general_penalty_uploads (
      id INT AUTO_INCREMENT PRIMARY KEY,
      upload_date DATE NOT NULL,
      uploaded_by VARCHAR(100) NULL,
      file_name VARCHAR(255) NULL,
      total_records INT NULL,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS general_penalty_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      file_id INT NOT NULL,
      sr_no INT NULL,
      month_label VARCHAR(20) NOT NULL,
      month_date DATE NOT NULL,
      circle VARCHAR(100) NOT NULL,
      cmp VARCHAR(150) NOT NULL,
      description TEXT NULL,
      domain VARCHAR(100) NULL,
      penalty_given DECIMAL(14,2) NULL,
      penalty_accepted DECIMAL(14,2) NULL,
      penalty_status VARCHAR(50) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_general_penalty_file (file_id),
      INDEX idx_general_penalty_month (month_date),
      INDEX idx_general_penalty_circle (circle),
      INDEX idx_general_penalty_status (penalty_status)
    )
  `);
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
      console.error("General Penalty rollback failed:", rollbackError.message);
    }
    throw error;
  } finally {
    conn.release();
  }
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
  key.toString().trim().toLowerCase().replace(/[\s_.]+/g, " ").trim();

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
  srNo: ["sr no", "sr", "s no", "srno"],
  month: ["month"],
  circle: ["circle", "circle name"],
  cmp: ["cmp", "cmp name"],
  description: ["description"],
  domain: ["domain"],
  penaltyGiven: ["penalty given by rjio", "penalty given"],
  penaltyAccepted: ["penalty accepted"],
  penaltyStatus: ["penalty status", "status"],
};

const EXPECTED_HEADERS = [
  "Sr No", "Month", "Circle", "CMP", "Description", "Domain",
  "Penalty Given by RJIO", "Penalty Accepted", "Penalty Status",
];

const findHeaderAlias = (headerSet, aliases) =>
  aliases.find((alias) => headerSet.has(alias)) ||
  [...headerSet].find((header) =>
    aliases.some((alias) => header === alias || header.startsWith(`${alias} `))
  ) ||
  null;

function assertTemplateHeaders(headers, context = {}) {
  const headerSet = new Set(headers);
  const missing = [];

  if (!findHeaderAlias(headerSet, HEADER_ALIASES.month)) missing.push("Month");
  if (!findHeaderAlias(headerSet, HEADER_ALIASES.circle)) missing.push("Circle");
  if (!findHeaderAlias(headerSet, HEADER_ALIASES.cmp)) missing.push("CMP");
  if (!findHeaderAlias(headerSet, HEADER_ALIASES.description)) missing.push("Description");
  if (!findHeaderAlias(headerSet, HEADER_ALIASES.penaltyStatus)) missing.push("Penalty Status");

  if (missing.length) {
    const error = new Error(
      `General Penalty upload stopped.\n\n` +
      (context.fileName ? `File: ${context.fileName}\n` : "") +
      (context.sheetName ? `Sheet: ${context.sheetName}\n\n` : "\n") +
      `This does not look like the General Penalty template — missing column(s): ${missing.join(", ")}.\n\n` +
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

// Tolerates "Jan'26", "Jan-26", "Jan 26", "January 2026", or a real Date
// (Excel can hand back a Date object if the cell is date-formatted).
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

// Normalizes case/whitespace only ("accepted " -> "Accepted"), but never
// invents a value for text that isn't one of the known statuses — the source
// data's own wording is preserved (e.g. "In Review") per the requirement not
// to alter status meaning.
function normalizePenaltyStatus(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  const known = KNOWN_STATUSES.find((status) => status.toLowerCase() === text.toLowerCase());
  return known || text;
}

// Returns: a number when valid, null when the cell is genuinely blank,
// or `undefined` as a sentinel meaning "unparseable — already recorded
// as a row error".
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
        expected: "A number",
        reason: `"${raw}" is not a valid number.`,
        fix: `Enter a plain number in the ${column} column of row ${rowNumber}.`,
      })
    );
    return undefined;
  }
  return value;
}

function parseOptionalInt(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const value = Number(String(raw).trim());
  return Number.isFinite(value) ? Math.round(value) : null;
}

async function validateRowCircleCmp(circleRaw, cmpRaw, rowNumber, errors) {
  const circleText = String(circleRaw ?? "").trim();
  const cmpText = String(cmpRaw ?? "").trim();

  if (!circleText) {
    errors.push(
      rowError({
        row: rowNumber,
        column: "Circle",
        value: circleRaw,
        expected: "A valid Circle name",
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
        expected: "A circle from the Circles master list",
        reason: `"${circleText}" is not a recognised Circle name.`,
        fix: `Replace it with the exact circle name from the Circles master list — check for typos, extra spaces or a short form.`,
      })
    );
    return null;
  }

  const canonicalCmp = await resolveCmp(canonicalCircle, cmpText);
  if (!canonicalCmp) {
    errors.push(
      rowError({
        row: rowNumber,
        column: "CMP",
        value: cmpText,
        expected: `A CMP that belongs to ${canonicalCircle}`,
        reason: `"${cmpText}" does not belong to Circle "${canonicalCircle}".`,
        fix: `Use one of the allowed CMPs for ${canonicalCircle}.`,
      })
    );
    return null;
  }

  return { circle: canonicalCircle, cmp: canonicalCmp };
}

// ---------------------------------------------------------------------------
// Workbook -> validated rows
// ---------------------------------------------------------------------------

async function parseGeneralPenaltyRows(fileBuffer, fileName) {
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
  const keys = {
    srNo: findHeaderAlias(headerSet, HEADER_ALIASES.srNo),
    month: findHeaderAlias(headerSet, HEADER_ALIASES.month),
    circle: findHeaderAlias(headerSet, HEADER_ALIASES.circle),
    cmp: findHeaderAlias(headerSet, HEADER_ALIASES.cmp),
    description: findHeaderAlias(headerSet, HEADER_ALIASES.description),
    domain: findHeaderAlias(headerSet, HEADER_ALIASES.domain),
    penaltyGiven: findHeaderAlias(headerSet, HEADER_ALIASES.penaltyGiven),
    penaltyAccepted: findHeaderAlias(headerSet, HEADER_ALIASES.penaltyAccepted),
    penaltyStatus: findHeaderAlias(headerSet, HEADER_ALIASES.penaltyStatus),
  };

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

    const descriptionRaw = cleanRow[keys.description];
    const description = String(descriptionRaw ?? "").trim();
    if (!description) {
      errors.push(
        rowError({
          row: rowNumber,
          column: "Description",
          value: descriptionRaw,
          expected: "Non-empty text",
          reason: "Description is required.",
          fix: `Fill in the Description column of row ${rowNumber}.`,
        })
      );
    }

    const statusRaw = cleanRow[keys.penaltyStatus];
    const penaltyStatus = normalizePenaltyStatus(statusRaw);
    if (!penaltyStatus) {
      errors.push(
        rowError({
          row: rowNumber,
          column: "Penalty Status",
          value: statusRaw,
          expected: KNOWN_STATUSES.join(" | "),
          reason: "Penalty Status is required.",
          fix: `Enter a status such as ${KNOWN_STATUSES.join(", ")} in row ${rowNumber}.`,
        })
      );
    }

    const circleCmp = await validateRowCircleCmp(cleanRow[keys.circle], cleanRow[keys.cmp], rowNumber, errors);

    const penaltyGiven = parseOptionalNumber(cleanRow[keys.penaltyGiven], "Penalty Given by RJIO", rowNumber, errors);
    const penaltyAccepted = parseOptionalNumber(cleanRow[keys.penaltyAccepted], "Penalty Accepted", rowNumber, errors);

    const hasInvalidNumeric = [penaltyGiven, penaltyAccepted].includes(undefined);

    if (!monthResult || !description || !penaltyStatus || !circleCmp || hasInvalidNumeric) continue;

    validRows.push({
      rowNumber,
      srNo: parseOptionalInt(cleanRow[keys.srNo]),
      monthLabel: monthResult.label,
      monthDate: monthResult.date,
      circle: circleCmp.circle,
      cmp: circleCmp.cmp,
      description,
      domain: String(cleanRow[keys.domain] ?? "").trim() || null,
      penaltyGiven,
      penaltyAccepted,
      penaltyStatus,
    });
  }

  if (errors.length) {
    throwRowErrors(errors, "General Penalty", {
      fileName,
      sheetName,
      totalRows: rawRows.length,
      detectedHeaders: headers,
    });
  }

  if (!validRows.length) {
    throwNoValidRows("General Penalty", { fileName, sheetName, detectedHeaders: headers });
  }

  return { validRows, sheetName, headers };
}

// ---------------------------------------------------------------------------
// Shared filter builder for /records, /summary, /export
// ---------------------------------------------------------------------------

function buildRecordFilters(req) {
  const { month, circle, cmp, domain, status, uploadedBy, dateFrom, dateTo, search, fileId } = req.query;

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
  if (status) {
    filters.push("LOWER(r.penalty_status) = LOWER(?)");
    params.push(status);
  }
  if (uploadedBy) {
    filters.push("u.uploaded_by = ?");
    params.push(uploadedBy);
  }
  if (dateFrom) {
    filters.push("r.month_date >= ?");
    params.push(dateFrom);
  }
  if (dateTo) {
    filters.push("r.month_date <= ?");
    params.push(dateTo);
  }
  if (search) {
    filters.push("(r.description LIKE ? OR r.circle LIKE ? OR r.cmp LIKE ?)");
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  return { filters, params };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

router.get("/meta", requirePagePermission("general-penalties", "view"), (_req, res) => {
  res.json({ success: true, data: { statuses: KNOWN_STATUSES } });
});

router.post(
  "/upload",
  requirePagePermission("general-penalties", "edit"),
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

      const { validRows } = await parseGeneralPenaltyRows(req.file.buffer, req.file.originalname);

      // A non-"ALL" circle user cannot import rows for a circle other than
      // their own — same rule Tower Reports / KPI Penalty enforce.
      assertRowsAllowedCircle(req.authUser, validRows, (row) => row.circle);

      await ensureTables();

      // Duplicate = an exact repeat of every field, i.e. this exact penalty
      // entry has already been imported before. Different rows for the same
      // Circle/CMP/Month are expected and legitimate, so the key must be the
      // whole row, not just the (month, circle, cmp) grouping.
      const keyOf = (row) =>
        [
          row.monthDate,
          row.circle,
          row.cmp,
          row.domain || "",
          row.penaltyStatus,
          row.penaltyGiven ?? "",
          row.penaltyAccepted ?? "",
          row.description.trim().toLowerCase(),
        ].join("::");

      const monthDates = [...new Set(validRows.map((row) => row.monthDate))];
      const [existingRows] = monthDates.length
        ? await pool.query(
            `SELECT month_date, circle, cmp, domain, penalty_status, penalty_given, penalty_accepted, description
             FROM general_penalty_records WHERE month_date IN (?)`,
            [monthDates]
          )
        : [[]];

      const existingKeySet = new Set(
        existingRows.map((row) =>
          [
            row.month_date,
            row.circle,
            row.cmp,
            row.domain || "",
            row.penalty_status,
            row.penalty_given ?? "",
            row.penalty_accepted ?? "",
            String(row.description || "").trim().toLowerCase(),
          ].join("::")
        )
      );

      const duplicateRows = validRows.filter((row) => existingKeySet.has(keyOf(row)));

      if (duplicateRows.length && !duplicateAction) {
        return res.status(409).json({
          success: false,
          duplicate: true,
          message: `${duplicateRows.length} row(s) in this file are identical to General Penalty data already uploaded.`,
          duplicates: duplicateRows.map((row) => ({
            monthDate: row.monthDate,
            circle: row.circle,
            cmp: row.cmp,
            description: row.description,
          })),
        });
      }

      const duplicateKeySet = new Set(duplicateRows.map(keyOf));
      const rowsToInsert =
        duplicateAction === "skip"
          ? validRows.filter((row) => !duplicateKeySet.has(keyOf(row)))
          : validRows;

      // Every row in this file was already imported and the user chose to
      // skip duplicates — nothing left to write, so don't leave a 0-record
      // upload cluttering the Uploaded Files history.
      if (duplicateAction === "skip" && rowsToInsert.length === 0) {
        return res.json({
          success: true,
          upload: null,
          records: [],
          skipped: duplicateRows.length,
        });
      }

      const result = await withTransaction(async (conn) => {
        const [uploadResult] = await conn.query(
          `INSERT INTO general_penalty_uploads (upload_date, uploaded_by, file_name, total_records) VALUES (?, ?, ?, ?)`,
          [date, String(uploadedBy).trim(), req.file.originalname, rowsToInsert.length]
        );
        const fileId = uploadResult.insertId;

        // "replace" has no prior file_id to target for exact-duplicate rows
        // (they may belong to a different, older upload), so it deletes the
        // matching existing rows by their own field values before reinserting.
        if (duplicateAction === "replace" && duplicateRows.length) {
          for (const row of duplicateRows) {
            await conn.query(
              `DELETE FROM general_penalty_records
               WHERE month_date = ? AND circle = ? AND cmp = ? AND COALESCE(domain,'') = ?
                 AND penalty_status = ? AND COALESCE(penalty_given,-1) <=> COALESCE(?,-1)
                 AND COALESCE(penalty_accepted,-1) <=> COALESCE(?,-1) AND LOWER(TRIM(description)) = ?`,
              [
                row.monthDate,
                row.circle,
                row.cmp,
                row.domain || "",
                row.penaltyStatus,
                row.penaltyGiven,
                row.penaltyAccepted,
                row.description.trim().toLowerCase(),
              ]
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
            row.description,
            row.domain,
            row.penaltyGiven,
            row.penaltyAccepted,
            row.penaltyStatus,
          ]);
          await conn.query(
            `INSERT INTO general_penalty_records
              (file_id, sr_no, month_label, month_date, circle, cmp, description, domain,
               penalty_given, penalty_accepted, penalty_status)
             VALUES ?`,
            [values]
          );
        }

        const [records] = await conn.query(
          `SELECT * FROM general_penalty_records WHERE file_id = ? ORDER BY circle, cmp, month_date`,
          [fileId]
        );

        return { fileId, records };
      });

      res.json({
        success: true,
        upload: {
          id: result.fileId,
          uploadDate: date,
          uploadedBy: String(uploadedBy).trim(),
          fileName: req.file.originalname,
          totalRecords: rowsToInsert.length,
        },
        records: result.records,
        skipped: duplicateAction === "skip" ? duplicateRows.length : 0,
      });
    } catch (error) {
      console.error("General Penalty upload failed:", error);
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        message: error.message || "Upload failed. Please try again.",
        ...(error.details || {}),
      });
    }
  }
);

router.get("/uploads", requirePagePermission("general-penalties", "view"), async (req, res) => {
  try {
    await ensureTables();

    const [uploads] = await pool.query(
      `SELECT id, upload_date, uploaded_by, file_name, total_records, uploaded_at
       FROM general_penalty_uploads ORDER BY uploaded_at DESC, id DESC`
    );

    if (!uploads.length) {
      return res.json({ success: true, data: [] });
    }

    const fileIds = uploads.map((row) => row.id);
    const filters = [`file_id IN (${fileIds.map(() => "?").join(",")})`];
    const params = [...fileIds];
    addCircleFilter(filters, params, req.authUser, "circle");

    const [circleRows] = await pool.query(
      `SELECT file_id, circle FROM general_penalty_records WHERE ${filters.join(" AND ")} GROUP BY file_id, circle`,
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
    console.error("General Penalty uploads fetch failed:", error);
    res.status(500).json({ success: false, message: "Failed to load uploaded files." });
  }
});

router.get("/records", requirePagePermission("general-penalties", "view"), async (req, res) => {
  try {
    await ensureTables();

    const { filters, params } = buildRecordFilters(req);
    const whereClause = filters.join(" AND ");

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM general_penalty_records r
       JOIN general_penalty_uploads u ON u.id = r.file_id
       WHERE ${whereClause}`,
      params
    );

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.pageSize) || 100, 500);
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(
      `SELECT r.*, u.uploaded_by, u.upload_date, u.file_name
       FROM general_penalty_records r
       JOIN general_penalty_uploads u ON u.id = r.file_id
       WHERE ${whereClause}
       ORDER BY r.month_date DESC, r.circle ASC, r.cmp ASC, r.id ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({ success: true, data: rows, total: countRows[0].total, page, pageSize: limit });
  } catch (error) {
    console.error("General Penalty records fetch failed:", error);
    res.status(500).json({ success: false, message: "Failed to load General Penalty records." });
  }
});

router.get("/summary", requirePagePermission("general-penalties", "view"), async (req, res) => {
  try {
    await ensureTables();

    const { filters, params } = buildRecordFilters(req);

    const [rows] = await pool.query(
      `SELECT COUNT(*) AS totalRecords,
              COALESCE(SUM(r.penalty_given), 0) AS totalPenaltyGiven,
              COALESCE(SUM(r.penalty_accepted), 0) AS totalPenaltyAccepted,
              COALESCE(SUM(CASE WHEN LOWER(r.penalty_status) = 'pending' THEN 1 ELSE 0 END), 0) AS pendingCount,
              COALESCE(SUM(CASE WHEN LOWER(r.penalty_status) = 'accepted' THEN 1 ELSE 0 END), 0) AS acceptedCount,
              COALESCE(SUM(CASE WHEN LOWER(r.penalty_status) = 'rejected' THEN 1 ELSE 0 END), 0) AS rejectedCount
       FROM general_penalty_records r
       JOIN general_penalty_uploads u ON u.id = r.file_id
       WHERE ${filters.join(" AND ")}`,
      params
    );

    const [byDomainRows] = await pool.query(
      `SELECT COALESCE(NULLIF(TRIM(r.domain), ''), 'Unspecified') AS domain,
              COUNT(*) AS count,
              COALESCE(SUM(r.penalty_given), 0) AS penaltyGiven,
              COALESCE(SUM(r.penalty_accepted), 0) AS penaltyAccepted
       FROM general_penalty_records r
       JOIN general_penalty_uploads u ON u.id = r.file_id
       WHERE ${filters.join(" AND ")}
       GROUP BY domain
       ORDER BY penaltyAccepted DESC`,
      params
    );

    const [byMonthRows] = await pool.query(
      `SELECT DATE_FORMAT(r.month_date, '%Y-%m-%d') AS monthDate,
              COUNT(*) AS count,
              COALESCE(SUM(r.penalty_given), 0) AS penaltyGiven,
              COALESCE(SUM(r.penalty_accepted), 0) AS penaltyAccepted
       FROM general_penalty_records r
       JOIN general_penalty_uploads u ON u.id = r.file_id
       WHERE ${filters.join(" AND ")}
       GROUP BY r.month_date
       ORDER BY r.month_date ASC`,
      params
    );

    res.json({ success: true, data: { ...rows[0], byDomain: byDomainRows, byMonth: byMonthRows } });
  } catch (error) {
    console.error("General Penalty summary fetch failed:", error);
    res.status(500).json({ success: false, message: "Failed to load General Penalty summary." });
  }
});

const EXPORT_COLUMNS = (rows) =>
  rows.map((row) => ({
    "Sr No": row.sr_no,
    Month: row.month_label,
    Circle: row.circle,
    CMP: row.cmp,
    Description: row.description,
    Domain: row.domain,
    "Penalty Given by RJIO": row.penalty_given,
    "Penalty Accepted": row.penalty_accepted,
    "Penalty Status": row.penalty_status,
  }));

router.get("/export", requirePagePermission("general-penalties", "download"), async (req, res) => {
  try {
    await ensureTables();

    const { filters, params } = buildRecordFilters(req);

    const [rows] = await pool.query(
      `SELECT r.* FROM general_penalty_records r
       JOIN general_penalty_uploads u ON u.id = r.file_id
       WHERE ${filters.join(" AND ")}
       ORDER BY r.month_date DESC, r.circle ASC, r.cmp ASC, r.id ASC
       LIMIT 20000`,
      params
    );

    const worksheet = xlsx.utils.json_to_sheet(EXPORT_COLUMNS(rows));
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "General Penalty");
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", `attachment; filename="general_penalty_export.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (error) {
    console.error("General Penalty export failed:", error);
    res.status(500).json({ success: false, message: "Failed to export data." });
  }
});

router.get("/download/:uploadId", requirePagePermission("general-penalties", "download"), async (req, res) => {
  try {
    await ensureTables();

    const { uploadId } = req.params;
    const filters = ["r.file_id = ?"];
    const params = [uploadId];
    addCircleFilter(filters, params, req.authUser, "r.circle");

    const [rows] = await pool.query(
      `SELECT * FROM general_penalty_records r WHERE ${filters.join(" AND ")} ORDER BY circle, cmp, month_date`,
      params
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "No records found for this upload." });
    }

    const [uploadRows] = await pool.query(`SELECT file_name FROM general_penalty_uploads WHERE id = ?`, [uploadId]);
    const fileName = uploadRows[0]?.file_name || `general_penalty_${uploadId}.xlsx`;

    const worksheet = xlsx.utils.json_to_sheet(EXPORT_COLUMNS(rows));
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "General Penalty");
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", `attachment; filename="${fileName.replace(/"/g, "")}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (error) {
    console.error("General Penalty download failed:", error);
    res.status(500).json({ success: false, message: "Failed to download file." });
  }
});

router.delete("/uploads/:uploadId", requirePagePermission("general-penalties", "delete"), async (req, res) => {
  try {
    await ensureTables();
    const { uploadId } = req.params;

    if (!isAllCircle(req.authUser)) {
      const [circleRows] = await pool.query(
        `SELECT DISTINCT circle FROM general_penalty_records WHERE file_id = ?`,
        [uploadId]
      );
      const hasForeignCircle = circleRows.some((row) => !canAccessCircle(req.authUser, row.circle));
      if (hasForeignCircle) {
        return res.status(403).json({ success: false, message: "You cannot delete another circle's data." });
      }
    }

    await withTransaction(async (conn) => {
      await conn.query(`DELETE FROM general_penalty_records WHERE file_id = ?`, [uploadId]);
      await conn.query(`DELETE FROM general_penalty_uploads WHERE id = ?`, [uploadId]);
    });

    res.json({ success: true });
  } catch (error) {
    console.error("General Penalty delete failed:", error);
    res.status(500).json({ success: false, message: "Failed to delete upload." });
  }
});

module.exports = router;
