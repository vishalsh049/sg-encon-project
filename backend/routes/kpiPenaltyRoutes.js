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
const { KPI_PENALTY_CATEGORIES } = require("../constants/kpiPenaltyCategories");

router.use(authMiddleware);

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
    CREATE TABLE IF NOT EXISTS kpi_penalty_uploads (
      id INT AUTO_INCREMENT PRIMARY KEY,
      upload_date DATE NOT NULL,
      uploaded_by VARCHAR(100) NULL,
      file_name VARCHAR(255) NULL,
      total_records INT NULL,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS kpi_penalty_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      file_id INT NOT NULL,
      month_label VARCHAR(20) NOT NULL,
      month_date DATE NOT NULL,
      circle VARCHAR(100) NOT NULL,
      cmp VARCHAR(150) NOT NULL,
      kpi_category VARCHAR(20) NOT NULL,
      total_cm_billing DECIMAL(14,2) NULL,
      score_required DECIMAL(10,2) NULL,
      score_achieved DECIMAL(10,2) NULL,
      percent_penalty DECIMAL(6,2) NULL,
      penalty_amount DECIMAL(14,2) NULL,
      percent_reward DECIMAL(6,2) NULL,
      reward_amount DECIMAL(14,2) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_kpi_penalty_file (file_id),
      INDEX idx_kpi_penalty_month (month_date),
      INDEX idx_kpi_penalty_circle (circle)
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
      console.error("KPI Penalty rollback failed:", rollbackError.message);
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

// Header aliases, already normalized (lowercase, whitespace collapsed) to
// match buildCleanRow's output. "score achived" tolerates the typo in the
// source template.
const HEADER_ALIASES = {
  month: ["month"],
  circle: ["circle", "circle name"],
  cmp: ["cmp", "cmp name"],
  kpiCategory: ["kpis penalty", "kpi penalty", "kpi", "kpi category"],
  totalCmBilling: ["total cm billing"],
  scoreRequired: ["score required"],
  scoreAchieved: ["score achived", "score achieved"],
  percentPenalty: ["% penalty"],
  penaltyAmount: ["penalty amount"],
  percentReward: ["% reward"],
  rewardAmount: ["reward amount"],
};

const EXPECTED_HEADERS = [
  "Month", "Circle", "CMP", "KPIs Penalty", "Total CM Billing",
  "Score Required", "Score Achieved", "% Penalty", "Penalty Amount",
  "% Reward", "Reward Amount",
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
  if (!findHeaderAlias(headerSet, HEADER_ALIASES.kpiCategory)) missing.push("KPIs Penalty");

  if (missing.length) {
    const error = new Error(
      `KPI Penalty upload stopped.\n\n` +
      (context.fileName ? `File: ${context.fileName}\n` : "") +
      (context.sheetName ? `Sheet: ${context.sheetName}\n\n` : "\n") +
      `This does not look like the KPI Penalty template — missing column(s): ${missing.join(", ")}.\n\n` +
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

function resolveKpiCategory(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const normalize = (value) =>
    value.toLowerCase().replace(/\s*&\s*/g, "&").replace(/\s+/g, " ").trim();
  const target = normalize(text);
  return KPI_PENALTY_CATEGORIES.find((category) => normalize(category) === target) || null;
}

// Returns: a number when valid, null when the cell is genuinely blank
// (not every KPI category carries every metric), or `undefined` as a
// sentinel meaning "unparseable — already recorded as a row error".
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

async function parseKpiPenaltyRows(fileBuffer, fileName) {
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
    month: findHeaderAlias(headerSet, HEADER_ALIASES.month),
    circle: findHeaderAlias(headerSet, HEADER_ALIASES.circle),
    cmp: findHeaderAlias(headerSet, HEADER_ALIASES.cmp),
    kpi: findHeaderAlias(headerSet, HEADER_ALIASES.kpiCategory),
    totalCmBilling: findHeaderAlias(headerSet, HEADER_ALIASES.totalCmBilling),
    scoreRequired: findHeaderAlias(headerSet, HEADER_ALIASES.scoreRequired),
    scoreAchieved: findHeaderAlias(headerSet, HEADER_ALIASES.scoreAchieved),
    percentPenalty: findHeaderAlias(headerSet, HEADER_ALIASES.percentPenalty),
    penaltyAmount: findHeaderAlias(headerSet, HEADER_ALIASES.penaltyAmount),
    percentReward: findHeaderAlias(headerSet, HEADER_ALIASES.percentReward),
    rewardAmount: findHeaderAlias(headerSet, HEADER_ALIASES.rewardAmount),
  };

  const { circleCmpMap } = await getCirclesPayload();

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

    const kpiRaw = cleanRow[keys.kpi];
    const kpiCategory = resolveKpiCategory(kpiRaw);
    if (!kpiCategory) {
      errors.push(
        rowError({
          row: rowNumber,
          column: "KPIs Penalty",
          value: kpiRaw,
          expected: KPI_PENALTY_CATEGORIES.join(" | "),
          reason: kpiRaw ? `"${kpiRaw}" is not a recognised KPI category.` : "KPI category is required.",
          fix: `Use one of: ${KPI_PENALTY_CATEGORIES.join(", ")}.`,
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

    const totalCmBilling = parseOptionalNumber(cleanRow[keys.totalCmBilling], "Total CM Billing", rowNumber, errors);
    const scoreRequired = parseOptionalNumber(cleanRow[keys.scoreRequired], "Score Required", rowNumber, errors);
    const scoreAchieved = parseOptionalNumber(cleanRow[keys.scoreAchieved], "Score Achieved", rowNumber, errors);
    const percentPenalty = parseOptionalNumber(cleanRow[keys.percentPenalty], "% Penalty", rowNumber, errors);
    const penaltyAmount = parseOptionalNumber(cleanRow[keys.penaltyAmount], "Penalty Amount", rowNumber, errors);
    const percentReward = parseOptionalNumber(cleanRow[keys.percentReward], "% Reward", rowNumber, errors);
    const rewardAmount = parseOptionalNumber(cleanRow[keys.rewardAmount], "Reward Amount", rowNumber, errors);

    const numericValues = [totalCmBilling, scoreRequired, scoreAchieved, percentPenalty, penaltyAmount, percentReward, rewardAmount];
    const hasInvalidNumeric = numericValues.includes(undefined);

    if (!monthResult || !kpiCategory || !circleCmp || hasInvalidNumeric) continue;

    validRows.push({
      rowNumber,
      monthLabel: monthResult.label,
      monthDate: monthResult.date,
      circle: circleCmp.circle,
      cmp: circleCmp.cmp,
      kpiCategory,
      totalCmBilling,
      scoreRequired,
      scoreAchieved,
      percentPenalty,
      penaltyAmount,
      percentReward,
      rewardAmount,
    });
  }

  if (errors.length) {
    throwRowErrors(errors, "KPI Penalty", {
      fileName,
      sheetName,
      totalRows: rawRows.length,
      detectedHeaders: headers,
    });
  }

  if (!validRows.length) {
    throwNoValidRows("KPI Penalty", { fileName, sheetName, detectedHeaders: headers });
  }

  return { validRows, sheetName, headers };
}

// ---------------------------------------------------------------------------
// Shared filter builder for /records and /summary
// ---------------------------------------------------------------------------

function buildRecordFilters(req) {
  const { month, circle, cmp, kpi, uploadedBy, dateFrom, dateTo, search, fileId } = req.query;

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
  if (kpi) {
    filters.push("r.kpi_category = ?");
    params.push(kpi);
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
    filters.push("(r.circle LIKE ? OR r.cmp LIKE ? OR r.kpi_category LIKE ?)");
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  return { filters, params };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

router.get("/meta", requirePagePermission("kpis-penalty", "view"), (_req, res) => {
  res.json({ success: true, data: { categories: KPI_PENALTY_CATEGORIES } });
});

router.post(
  "/upload",
  requirePagePermission("kpis-penalty", "edit"),
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

      const { validRows } = await parseKpiPenaltyRows(req.file.buffer, req.file.originalname);

      // A non-"ALL" circle user cannot import rows for a circle other than
      // their own — same rule Tower Reports enforces on upload.
      assertRowsAllowedCircle(req.authUser, validRows, (row) => row.circle);

      await ensureTables();

      const monthDates = [...new Set(validRows.map((row) => row.monthDate))];
      const [existingRows] = monthDates.length
        ? await pool.query(
            `SELECT month_date, circle, cmp, kpi_category FROM kpi_penalty_records WHERE month_date IN (?)`,
            [monthDates]
          )
        : [[]];

      const keyOf = (monthDate, circle, cmp, kpiCategory) => `${monthDate}::${circle}::${cmp}::${kpiCategory}`;
      const existingKeySet = new Set(
        existingRows.map((row) => keyOf(row.month_date, row.circle, row.cmp, row.kpi_category))
      );
      const duplicateKeys = [
        ...new Set(
          validRows
            .map((row) => keyOf(row.monthDate, row.circle, row.cmp, row.kpiCategory))
            .filter((key) => existingKeySet.has(key))
        ),
      ];

      if (duplicateKeys.length && !duplicateAction) {
        return res.status(409).json({
          success: false,
          duplicate: true,
          message: `${duplicateKeys.length} row(s) in this file match KPI Penalty data already uploaded for the same Month, Circle, CMP and KPI category.`,
          duplicates: duplicateKeys.map((key) => {
            const [monthDate, circle, cmp, kpiCategory] = key.split("::");
            return { monthDate, circle, cmp, kpiCategory };
          }),
        });
      }

      const duplicateKeySet = new Set(duplicateKeys);
      const rowsToInsert =
        duplicateAction === "skip"
          ? validRows.filter((row) => !duplicateKeySet.has(keyOf(row.monthDate, row.circle, row.cmp, row.kpiCategory)))
          : validRows;

      // Every row in this file was already imported and the user chose to
      // skip duplicates — nothing left to write, so don't leave a 0-record
      // upload cluttering the Uploaded Files history.
      if (duplicateAction === "skip" && rowsToInsert.length === 0) {
        return res.json({
          success: true,
          upload: null,
          records: [],
          skipped: duplicateKeys.length,
        });
      }

      const result = await withTransaction(async (conn) => {
        const [uploadResult] = await conn.query(
          `INSERT INTO kpi_penalty_uploads (upload_date, uploaded_by, file_name, total_records) VALUES (?, ?, ?, ?)`,
          [date, String(uploadedBy).trim(), req.file.originalname, rowsToInsert.length]
        );
        const fileId = uploadResult.insertId;

        if (duplicateAction === "replace" && duplicateKeys.length) {
          for (const key of duplicateKeys) {
            const [monthDate, circle, cmp, kpiCategory] = key.split("::");
            await conn.query(
              `DELETE FROM kpi_penalty_records WHERE month_date = ? AND circle = ? AND cmp = ? AND kpi_category = ?`,
              [monthDate, circle, cmp, kpiCategory]
            );
          }
        }

        if (rowsToInsert.length) {
          const values = rowsToInsert.map((row) => [
            fileId,
            row.monthLabel,
            row.monthDate,
            row.circle,
            row.cmp,
            row.kpiCategory,
            row.totalCmBilling,
            row.scoreRequired,
            row.scoreAchieved,
            row.percentPenalty,
            row.penaltyAmount,
            row.percentReward,
            row.rewardAmount,
          ]);
          await conn.query(
            `INSERT INTO kpi_penalty_records
              (file_id, month_label, month_date, circle, cmp, kpi_category,
               total_cm_billing, score_required, score_achieved,
               percent_penalty, penalty_amount, percent_reward, reward_amount)
             VALUES ?`,
            [values]
          );
        }

        const [records] = await conn.query(
          `SELECT * FROM kpi_penalty_records WHERE file_id = ? ORDER BY circle, cmp, kpi_category`,
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
        skipped: duplicateAction === "skip" ? duplicateKeys.length : 0,
      });
    } catch (error) {
      console.error("KPI Penalty upload failed:", error);
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        message: error.message || "Upload failed. Please try again.",
        ...(error.details || {}),
      });
    }
  }
);

router.get("/uploads", requirePagePermission("kpis-penalty", "view"), async (req, res) => {
  try {
    await ensureTables();

    const [uploads] = await pool.query(
      `SELECT id, upload_date, uploaded_by, file_name, total_records, uploaded_at
       FROM kpi_penalty_uploads ORDER BY uploaded_at DESC, id DESC`
    );

    if (!uploads.length) {
      return res.json({ success: true, data: [] });
    }

    const fileIds = uploads.map((row) => row.id);
    const filters = [`file_id IN (${fileIds.map(() => "?").join(",")})`];
    const params = [...fileIds];
    addCircleFilter(filters, params, req.authUser, "circle");

    const [circleRows] = await pool.query(
      `SELECT file_id, circle FROM kpi_penalty_records WHERE ${filters.join(" AND ")} GROUP BY file_id, circle`,
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
    console.error("KPI Penalty uploads fetch failed:", error);
    res.status(500).json({ success: false, message: "Failed to load uploaded files." });
  }
});

router.get("/records", requirePagePermission("kpis-penalty", "view"), async (req, res) => {
  try {
    await ensureTables();

    const { filters, params } = buildRecordFilters(req);
    const whereClause = filters.join(" AND ");

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM kpi_penalty_records r
       JOIN kpi_penalty_uploads u ON u.id = r.file_id
       WHERE ${whereClause}`,
      params
    );

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.pageSize) || 100, 500);
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(
      `SELECT r.*, u.uploaded_by, u.upload_date, u.file_name
       FROM kpi_penalty_records r
       JOIN kpi_penalty_uploads u ON u.id = r.file_id
       WHERE ${whereClause}
       ORDER BY r.month_date DESC, r.circle ASC, r.cmp ASC, r.kpi_category ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({ success: true, data: rows, total: countRows[0].total, page, pageSize: limit });
  } catch (error) {
    console.error("KPI Penalty records fetch failed:", error);
    res.status(500).json({ success: false, message: "Failed to load KPI Penalty records." });
  }
});

router.get("/summary", requirePagePermission("kpis-penalty", "view"), async (req, res) => {
  try {
    await ensureTables();

    const { filters, params } = buildRecordFilters(req);

    const [rows] = await pool.query(
      `SELECT COUNT(*) AS totalRecords,
              COALESCE(SUM(r.total_cm_billing), 0) AS totalCmBilling,
              COALESCE(SUM(r.penalty_amount), 0) AS totalPenaltyAmount,
              COALESCE(SUM(r.reward_amount), 0) AS totalRewardAmount
       FROM kpi_penalty_records r
       JOIN kpi_penalty_uploads u ON u.id = r.file_id
       WHERE ${filters.join(" AND ")}`,
      params
    );

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("KPI Penalty summary fetch failed:", error);
    res.status(500).json({ success: false, message: "Failed to load KPI Penalty summary." });
  }
});

router.get("/download/:uploadId", requirePagePermission("kpis-penalty", "download"), async (req, res) => {
  try {
    await ensureTables();

    const { uploadId } = req.params;
    const filters = ["r.file_id = ?"];
    const params = [uploadId];
    addCircleFilter(filters, params, req.authUser, "r.circle");

    const [rows] = await pool.query(
      `SELECT month_label AS Month, circle AS Circle, cmp AS CMP, kpi_category AS "KPIs Penalty",
              total_cm_billing AS "Total CM Billing", score_required AS "Score Required",
              score_achieved AS "Score Achieved", percent_penalty AS "% Penalty",
              penalty_amount AS "Penalty Amount", percent_reward AS "% Reward",
              reward_amount AS "Reward Amount"
       FROM kpi_penalty_records r
       WHERE ${filters.join(" AND ")}
       ORDER BY circle, cmp, kpi_category`,
      params
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "No records found for this upload." });
    }

    const [uploadRows] = await pool.query(`SELECT file_name FROM kpi_penalty_uploads WHERE id = ?`, [uploadId]);
    const fileName = uploadRows[0]?.file_name || `kpi_penalty_${uploadId}.xlsx`;

    const worksheet = xlsx.utils.json_to_sheet(rows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "KPI Penalty");
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", `attachment; filename="${fileName.replace(/"/g, "")}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (error) {
    console.error("KPI Penalty download failed:", error);
    res.status(500).json({ success: false, message: "Failed to download file." });
  }
});

router.delete("/uploads/:uploadId", requirePagePermission("kpis-penalty", "delete"), async (req, res) => {
  try {
    await ensureTables();
    const { uploadId } = req.params;

    if (!isAllCircle(req.authUser)) {
      const [circleRows] = await pool.query(
        `SELECT DISTINCT circle FROM kpi_penalty_records WHERE file_id = ?`,
        [uploadId]
      );
      const hasForeignCircle = circleRows.some((row) => !canAccessCircle(req.authUser, row.circle));
      if (hasForeignCircle) {
        return res.status(403).json({ success: false, message: "You cannot delete another circle's data." });
      }
    }

    await withTransaction(async (conn) => {
      await conn.query(`DELETE FROM kpi_penalty_records WHERE file_id = ?`, [uploadId]);
      await conn.query(`DELETE FROM kpi_penalty_uploads WHERE id = ?`, [uploadId]);
    });

    res.json({ success: true });
  } catch (error) {
    console.error("KPI Penalty delete failed:", error);
    res.status(500).json({ success: false, message: "Failed to delete upload." });
  }
});

module.exports = router;
