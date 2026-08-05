const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const ExcelJS = require("exceljs");
const router = express.Router();
const { db } = require("../config/db");
const {
  assertRowsAllowedCircle,
  authMiddleware,
  isAllCircle,
  normalizeCircle,
} = require("../middleware/circleAccess");
const { requirePagePermission } = require("../middleware/pagePermission");

router.use(authMiddleware);


// ✅ Storage config
const storage = multer.memoryStorage();

// Uploads are buffered in memory and the parsed workbook costs several times
// the raw file size, so file count and size are both capped. Raise via env if
// real reports outgrow these limits.
const maxUploadFileSizeMb = Number(process.env.REPORT_MAX_FILE_MB) || 60;
const maxBulkUploadFiles = Number(process.env.REPORT_MAX_BULK_FILES) || 12;

const allowedExtensions = new Set(["xlsx", "xls", "xlsb", "csv"]);
const upload = multer({
  storage,
  limits: {
    fileSize: maxUploadFileSizeMb * 1024 * 1024,
    files: maxBulkUploadFiles,
    fields: 20,
  },
});

const uploadAnyReportFiles = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "files", maxCount: maxBulkUploadFiles },
]);

const uploadLimitMessage = (err) => {
  switch (err?.code) {
    case "LIMIT_FILE_SIZE":
      return `File too large.\n\nEach report must be under ${maxUploadFileSizeMb} MB. Please split the file by date and upload again.`;
    case "LIMIT_FILE_COUNT":
      return `Too many files.\n\nYou can upload up to ${maxBulkUploadFiles} reports at a time. Please upload them in smaller batches.`;
    case "LIMIT_UNEXPECTED_FILE":
      return "Single Upload accepts one file at a time.\n\nSwitch to Bulk Upload to send multiple files.";
    default:
      return "We could not read the uploaded files. Please check the files and try again.";
  }
};

const getUploadedReportFiles = (req) => [
  ...(req.files?.file || []),
  ...(req.files?.files || []),
];

const bulkFileNameFormatHelp =
  "Required format: reporttype_YYYY-MM-DD.xlsx";

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.getConnection((err, connection) => {
      if (err) return reject(err);

      // 🔥 Force IST on this specific connection before running the bulk insert
      connection.query("SET time_zone = '+05:30'", (tzErr) => {
        if (tzErr) {
          connection.release();
          return reject(tzErr);
        }

        connection.query(sql, params, (err, rows) => {
          connection.release(); // Release back to pool
          if (err) return reject(err);
          resolve(rows);
        });
      });
    });
  });

/**
 * Runs `work` inside a single transaction on one pooled connection and hands it
 * a `run(sql, params)` bound to that connection. Everything commits together or
 * nothing does.
 *
 * DDL (CREATE TABLE / ALTER TABLE) must NOT be issued inside `work` — MySQL and
 * MariaDB implicitly commit on DDL, which would silently break the rollback.
 * Call the ensure*Table helpers before opening the transaction.
 */
const withTransaction = async (work) => {
  const connection = await new Promise((resolve, reject) => {
    db.getConnection((err, pooled) => (err ? reject(err) : resolve(pooled)));
  });

  const run = (sql, params = []) =>
    new Promise((resolve, reject) => {
      connection.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });

  try {
    await run("SET time_zone = '+05:30'");
    await run("START TRANSACTION");

    const result = await work(run);

    await run("COMMIT");
    return result;
  } catch (error) {
    try {
      await run("ROLLBACK");
    } catch (rollbackError) {
      console.error("Rollback failed:", rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
};

const reportDataTables = new Set([
  "ag1", "ag2", "enb", "esc", "gnb", "gsc",
  "hpodsc", "ila", "isc", "osc", "wifi",
]);

const VALID_CIRCLES = [
  "Delhi",
  "Haryana",
  "Punjab",
  "Uttar Pradesh (East)",
];

const isValidCircle = (circle) => {
  if (!circle) return false;

  return VALID_CIRCLES.some(
    (c) =>
      c.toLowerCase().trim() ===
      String(circle).toLowerCase().trim()
  );
};

const getRawCircle = (row = {}) => {
  const normalized = {};
  Object.keys(row).forEach((key) => {
    normalized[key.toString().trim().toLowerCase().replace(/[\s_]+/g, " ")] = row[key];
  });
  return normalized.circle || normalized["circle name"] || "";
};

// ---------------------------------------------------------------------------
// Shared row validation
//
// Previously only ENB and ISC checked the Circle column. The other nine site
// types either dropped bad rows silently or stored them with a NULL circle,
// which hides the data from every circle-scoped query. These helpers give all
// parsers one consistent check and one readable error message.
// ---------------------------------------------------------------------------

// How many individual row problems travel back to the browser. The dialog
// paginates them, so this can be generous without making the payload huge.
const MAX_REPORTED_ROW_ERRORS = 250;

const normalizeHeaderKey = (key) =>
  key.toString().trim().toLowerCase().replace(/[\s_]+/g, " ");

const buildCleanRow = (row) => {
  const cleanRow = {};
  Object.keys(row).forEach((key) => {
    cleanRow[normalizeHeaderKey(key)] = row[key];
  });
  return cleanRow;
};

// Excel commonly reports trailing formatted-but-empty rows. Those are not a
// data error — they are skipped without complaint.
const isBlankRow = (cleanRow) =>
  Object.values(cleanRow).every(
    (value) => value === null || value === undefined || String(value).trim() === ""
  );

const CIRCLE_EXPECTED = VALID_CIRCLES.join(" | ");

/**
 * One row problem, in the shape the upload dialog renders:
 * which sheet, which Excel row, which column, what was found, what was
 * expected, why it failed and how to fix it.
 */
const rowError = ({ row, column, value, expected, reason, fix }) => ({
  row,
  column,
  value: value === null || value === undefined || String(value).trim() === ""
    ? "(blank)"
    : String(value).trim(),
  expected,
  reason,
  fix,
});

/**
 * Checks the Circle/CMP pair. Pushes a structured problem description into
 * `errors` and returns false when the row must not be inserted.
 */
const validateRowCircle = (circle, cmp, rowNumber, errors) => {
  const circleText = String(circle ?? "").trim();
  const cmpText = String(cmp ?? "").trim();

  if (!circleText) {
    errors.push(rowError({
      row: rowNumber,
      column: "Circle",
      value: circle,
      expected: CIRCLE_EXPECTED,
      reason: "Circle is blank. Every row must say which circle it belongs to.",
      fix: `Type one of the allowed circle names into the Circle column of row ${rowNumber}.`,
    }));
    // Report both blanks so one pass through the file fixes everything.
    if (!cmpText) {
      errors.push(rowError({
        row: rowNumber,
        column: "CMP",
        value: cmp,
        expected: "Any non-empty CMP name",
        reason: "CMP is blank. Every row must name the CMP that owns the site.",
        fix: `Fill in the CMP column of row ${rowNumber}.`,
      }));
    }
    return false;
  }

  if (!cmpText) {
    errors.push(rowError({
      row: rowNumber,
      column: "CMP",
      value: cmp,
      expected: "Any non-empty CMP name",
      reason: "CMP is blank. Every row must name the CMP that owns the site.",
      fix: `Fill in the CMP column of row ${rowNumber}.`,
    }));
    return false;
  }

  if (!isValidCircle(circleText)) {
    errors.push(rowError({
      row: rowNumber,
      column: "Circle",
      value: circleText,
      expected: CIRCLE_EXPECTED,
      reason: `"${circleText}" is not a recognised Circle name.`,
      fix: `Replace it with the exact circle name — check for typos, extra spaces or a short form.`,
    }));
    return false;
  }

  return true;
};

const pluralRows = (count) => `${count} row${count === 1 ? "" : "s"}`;

/**
 * Turns collected row problems into one message that says what is wrong, why it
 * failed and how to fix it. Long lists are truncated so the text stays usable —
 * the full structured list travels separately in `error.details.errors`.
 */
const rowErrorsToMessage = (errors, siteTypeLabel = "", context = {}) => {
  const shown = errors.slice(0, 10);
  const remaining = errors.length - shown.length;
  const heading = siteTypeLabel ? `${siteTypeLabel} upload stopped.\n\n` : "";
  const where = [
    context.fileName ? `File: ${context.fileName}` : null,
    context.sheetName ? `Sheet: ${context.sheetName}` : null,
  ].filter(Boolean).join("\n");

  const lines = shown.map(
    (item) =>
      `Row ${item.row} • ${item.column}: found ${item.value} — ${item.reason}`
  );

  return (
    `${heading}${where ? `${where}\n\n` : ""}` +
    `We found ${pluralRows(errors.length)} with problems, so nothing was uploaded.\n\n` +
    `${lines.join("\n")}` +
    (remaining > 0 ? `\n...and ${remaining} more.` : "") +
    `\n\nAllowed Circle names: ${VALID_CIRCLES.join(", ")}.\n\n` +
    `Row numbers match the row numbers shown in Excel.`
  );
};

const throwRowErrors = (errors, siteTypeLabel, details = {}) => {
  const error = new Error(rowErrorsToMessage(errors, siteTypeLabel, details));
  error.statusCode = 400;
  error.details = {
    errorType: "row-validation",
    siteType: siteTypeLabel,
    invalidRows: new Set(errors.map((item) => item.row)).size,
    ...details,
    errors: errors.slice(0, MAX_REPORTED_ROW_ERRORS),
    truncated: errors.length > MAX_REPORTED_ROW_ERRORS,
    totalErrors: errors.length,
  };
  throw error;
};

const throwNoValidRows = (siteTypeLabel, details = {}) => {
  const detected = details.detectedHeaders || [];
  const error = new Error(
    `${siteTypeLabel} upload stopped.\n\n` +
    (details.fileName ? `File: ${details.fileName}\n` : "") +
    (details.sheetName ? `Sheet: ${details.sheetName}\n\n` : "\n") +
    `The sheet was read successfully but every row was empty, so there is ` +
    `nothing to upload.\n\n` +
    (detected.length
      ? `Columns found in this sheet: ${detected.join(", ")}.\n\n`
      : "") +
    `Check that the data starts on row 2, directly under the header row.`
  );
  error.statusCode = 400;
  error.details = { errorType: "empty-sheet", siteType: siteTypeLabel, ...details };
  throw error;
};

// ---------------------------------------------------------------------------
// Template / header validation
//
// Every parser needs a Circle and a CMP column, and each site type has a set of
// data columns its parser reads. Checking the header row up front turns "Row 2:
// Circle is blank" repeated 5,000 times into one message that names the sheet,
// lists the columns that were actually found and says which template to use.
// ---------------------------------------------------------------------------

// Header aliases accepted for the two mandatory columns, already normalized
// (lowercase, underscores folded to spaces) to match buildCleanRow output.
const CIRCLE_HEADER_ALIASES = ["circle", "circle name"];
const CMP_HEADER_ALIASES = ["cmp", "cmp name"];

// Columns each parser actually reads, used to tell "right template, bad data"
// apart from "wrong template altogether".
const SITE_TEMPLATE_COLUMNS = {
  enb: ["sap id", "jc name", "jc id", "city", "device type", "overall cnum count", "overall cell outage (sec)", "overall cell availability", "cells up"],
  esc: ["sap id", "jc name", "jc code", "city", "site type", "device type", "total cnum count", "total outage", "availability", "cells up"],
  gnb: ["sap id", "jc", "city", "site type", "device type", "total cnum count", "total outage", "availability", "cells up", "vendor"],
  hpodsc: ["sap id", "jc name", "jc code", "jc sap id", "city", "site type", "device type", "integration state", "total cnum count", "total outage", "total availability", "cells up"],
  osc: ["sap id", "region", "ems alias", "city", "jc code", "jc sap id", "lsm name", "sys alias", "ip addr 1", "site type", "total enb down sec", "availability"],
  isc: [],
  ag1: ["availability"],
  ag2: ["availability"],
  ila: ["availability"],
  gsc: ["availability"],
  wifi: ["availability"],
};

const findHeaderAlias = (headerSet, aliases) =>
  aliases.find((alias) => headerSet.has(alias)) ||
  // "Circle Name (as per SAP)" and similar suffixed headers.
  [...headerSet].find((header) =>
    aliases.some((alias) => header === alias || header.startsWith(`${alias} `))
  ) ||
  null;

/**
 * Validates the header row before any data row is parsed. Throws a 400 that
 * names the sheet, the missing column, the columns that were found and the
 * template to download.
 */
const assertTemplateHeaders = (headers, siteTypeLabel, context = {}) => {
  const headerSet = new Set(headers);
  const siteKey = String(siteTypeLabel || "").toLowerCase();
  const missing = [];

  if (!findHeaderAlias(headerSet, CIRCLE_HEADER_ALIASES)) {
    missing.push({ column: "Circle", accepts: "Circle, Circle Name" });
  }
  if (!findHeaderAlias(headerSet, CMP_HEADER_ALIASES)) {
    missing.push({ column: "CMP", accepts: "CMP, CMP Name" });
  }

  const templateColumns = SITE_TEMPLATE_COLUMNS[siteKey] || [];
  const matchedTemplateColumns = templateColumns.filter((column) => headerSet.has(column));
  // A file that shares almost none of the expected data columns is the wrong
  // template, not a file with a couple of bad values.
  const looksLikeWrongTemplate =
    templateColumns.length >= 4 && matchedTemplateColumns.length === 0;

  if (!missing.length && !looksLikeWrongTemplate) return;

  const detected = headers.slice(0, 40);
  const heading = `${siteTypeLabel} upload stopped.\n\n`;
  const where = [
    context.fileName ? `File: ${context.fileName}` : null,
    context.sheetName ? `Sheet: ${context.sheetName}` : null,
  ].filter(Boolean).join("\n");

  const problem = missing.length
    ? `Required column${missing.length === 1 ? "" : "s"} not found: ` +
      `${missing.map((item) => item.column).join(", ")}.\n\n` +
      missing
        .map((item) => `• "${item.column}" — accepted headings: ${item.accepts}`)
        .join("\n")
    : `This file does not match the ${siteTypeLabel} template.\n\n` +
      `None of the expected ${siteTypeLabel} data columns were found ` +
      `(${templateColumns.slice(0, 6).join(", ")}...).`;

  const error = new Error(
    `${heading}${where ? `${where}\n\n` : ""}${problem}\n\n` +
    `Columns found in this sheet: ${detected.join(", ") || "(none)"}.\n\n` +
    `Download the ${siteTypeLabel} format from the upload window, copy your ` +
    `data into it and upload again. The header row must be row 1.`
  );
  error.statusCode = 400;
  error.details = {
    errorType: "template",
    siteType: siteTypeLabel,
    ...context,
    detectedHeaders: detected,
    expectedHeaders: [
      "Circle",
      "CMP",
      ...templateColumns.map((column) =>
        column.replace(/\b\w/g, (character) => character.toUpperCase())
      ),
    ],
    errors: missing.length
      ? missing.map((item) =>
          rowError({
            row: 1,
            column: item.column,
            value: "(not found)",
            expected: item.accepts,
            reason: `The header row has no "${item.column}" column.`,
            fix: `Add a "${item.column}" heading to row 1, or use the ${siteTypeLabel} format file.`,
          })
        )
      : [
          rowError({
            row: 1,
            column: "(header row)",
            value: detected.slice(0, 6).join(", "),
            expected: templateColumns.slice(0, 6).join(", "),
            reason: `The header row does not contain any ${siteTypeLabel} data column.`,
            fix: `Check that the Site Type you selected matches the file you are uploading.`,
          }),
        ],
  };
  throw error;
};

const isUploadAccessible = async (upload, authUser, requireExclusive = false) => {
  if (isAllCircle(authUser)) return true;
  const tableName = String(upload.site_type || "").toLowerCase();
  if (!reportDataTables.has(tableName)) return false;

  const [counts] = await query(
    `SELECT
                  SUM(LOWER(TRIM(circle)) = LOWER(TRIM(?))) AS allowed_count,
                  SUM(LOWER(TRIM(COALESCE(circle, ''))) <> LOWER(TRIM(?))) AS foreign_count
                FROM ${tableName}
                WHERE file_id = ?`,
    [authUser.circle, authUser.circle, upload.file_id]
  );
  return Number(counts?.allowed_count || 0) > 0 &&
    (!requireExclusive || Number(counts?.foreign_count || 0) === 0);
};

const filterAccessibleUploads = async (uploads, authUser) => {
  if (isAllCircle(authUser)) return uploads;
  const allowed = await Promise.all(
    uploads.map(async (upload) => (await isUploadAccessible(upload, authUser) ? upload : null))
  );
  return allowed.filter(Boolean);
};

/**
 * Resolves which circles each upload's data covers, using one grouped query per
 * site-type table instead of one query per upload.
 *
 * Returns Map<file_id, Set<circle>>.
 */
const buildFileCircleIndex = async (uploads) => {
  const fileIdsByTable = new Map();

  uploads.forEach((upload) => {
    const tableName = String(upload.site_type || "").toLowerCase();
    const fileId = Number(upload.file_id);
    if (!reportDataTables.has(tableName) || !Number.isFinite(fileId)) return;

    if (!fileIdsByTable.has(tableName)) fileIdsByTable.set(tableName, new Set());
    fileIdsByTable.get(tableName).add(fileId);
  });

  const circlesByFileId = new Map();

  for (const [tableName, fileIdSet] of fileIdsByTable) {
    const fileIds = [...fileIdSet];
    if (!fileIds.length) continue;

    try {
      const placeholders = fileIds.map(() => "?").join(",");
      const rows = await query(
        `SELECT file_id, TRIM(circle) AS circle
           FROM ${tableName}
          WHERE file_id IN (${placeholders})
            AND circle IS NOT NULL AND TRIM(circle) <> ''
          GROUP BY file_id, TRIM(circle)`,
        fileIds
      );

      rows.forEach(({ file_id: fileId, circle }) => {
        const key = Number(fileId);
        if (!circlesByFileId.has(key)) circlesByFileId.set(key, new Set());
        circlesByFileId.get(key).add(String(circle).trim());
      });
    } catch (error) {
      // A site-type table may not exist yet on a fresh install.
      console.warn(`Circle lookup skipped for ${tableName}:`, error.code || error.message);
    }
  }

  return circlesByFileId;
};



const ensureUploadsTable = async () => {
  await query(
    `CREATE TABLE IF NOT EXISTS report_uploads (
                  id INT AUTO_INCREMENT PRIMARY KEY,
                  site_category VARCHAR(20) NOT NULL,
                  report_date DATE NULL,
                  site_type VARCHAR(20) NULL,
                  report_type VARCHAR(50) NULL,
                  upload_type VARCHAR(20) NULL,
                  uploaded_by VARCHAR(100) NULL,
                  file_name VARCHAR(255) NULL,
                  total_records INT NULL,
                  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP 
                )`
  );
  await ensureColumn("report_uploads", "total_records", "INT NULL");
  await ensureColumn("report_uploads", "file_id", "BIGINT NULL");
};

const ensureEnbTable = async () => {
  await query(`
                CREATE TABLE IF NOT EXISTS enb (
                  id INT AUTO_INCREMENT PRIMARY KEY,
                  file_id BIGINT NOT NULL,
                  circle VARCHAR(50),
                  cmp VARCHAR(100),
                  site_type VARCHAR(20),
                  date DATE,
                  kpi_value DECIMAL(12,4),

                  sap_id VARCHAR(100),
                  jc_name VARCHAR(150),
                  jc_id VARCHAR(100),
                  jc_sap_id VARCHAR(100),
                  city VARCHAR(100),
                  site_type_excel VARCHAR(100),
                  device_type VARCHAR(100),
                  cnum_count INT,
                  outage_sec BIGINT,
                  availability DECIMAL(10,4),
                  cells_up INT,

                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
              `);
};

const ensureEscTable = async () => {
  await query(`
      CREATE TABLE IF NOT EXISTS esc (
        id INT AUTO_INCREMENT PRIMARY KEY,

        file_id BIGINT,

        sap_id VARCHAR(100),
        circle VARCHAR(50),
        cmp VARCHAR(100),

        jc_name VARCHAR(150),
        jc_id VARCHAR(100),
        jc_sap_id VARCHAR(100),

        city VARCHAR(100),
        site_type VARCHAR(100),
        device_type VARCHAR(100),

        total_cnum_count INT,
        total_outage BIGINT,
        total_availability DECIMAL(10,4),

        cells_up INT,

        date DATE,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
};

// Missing columns are added in place. This must never drop or recreate the
// table — gnb holds historical uploads that cannot be recovered from source.
const ensureGnbTable = async () => {
  await query(`
      CREATE TABLE IF NOT EXISTS gnb (
        id INT AUTO_INCREMENT PRIMARY KEY,
        file_id BIGINT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

  const gnbColumns = [
    ["sap_id", "VARCHAR(100) NULL"],
    ["circle", "VARCHAR(100) NULL"],
    ["cmp", "VARCHAR(150) NULL"],
    ["jc", "VARCHAR(150) NULL"],
    ["city", "VARCHAR(100) NULL"],
    ["site_type", "VARCHAR(50) NULL"],
    ["device_type", "VARCHAR(50) NULL"],
    ["total_cnum_count", "INT NULL"],
    ["total_outage", "BIGINT NULL"],
    ["availability", "DECIMAL(10,4) NULL"],
    ["cells_up", "INT NULL"],
    ["cells_up_mod", "INT NULL"],
    ["vendor", "VARCHAR(100) NULL"],
    ["r4g_availability", "DECIMAL(10,4) NULL"],
    ["air_fiber_sites", "VARCHAR(50) NULL"],
    ["updated_r4g", "VARCHAR(100) NULL"],
    ["date", "DATE NULL"],
  ];

  for (const [column, definition] of gnbColumns) {
    await ensureColumn("gnb", column, definition);
  }
};

const ensureIscTable = async () => {
  await query(`
                CREATE TABLE IF NOT EXISTS isc (
                  id INT AUTO_INCREMENT PRIMARY KEY,
                  file_id BIGINT,
                  circle VARCHAR(50),
                  cmp VARCHAR(100),
                  date DATE,
                  kpi_value DECIMAL(12,4),
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
              `);
};

const ensureOscTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS osc (
      id INT AUTO_INCREMENT PRIMARY KEY,

      file_id BIGINT,

      date DATE,

      sap_id VARCHAR(100),

      circle VARCHAR(100),

      cmp VARCHAR(100),

      region VARCHAR(100),

      ems_alias VARCHAR(255),

      city VARCHAR(100),

      jc_code VARCHAR(100),

      jc_sap_id VARCHAR(100),

      lsm_name VARCHAR(255),

      sys_alias VARCHAR(255),

      ip_addr_1 VARCHAR(100),

      activeversion VARCHAR(100),

      site_type VARCHAR(100),

      outage_12am_12pm DECIMAL(12,2),

      outage_12pm_12am DECIMAL(12,2),

      total_enb_down_sec BIGINT,

      cmp_code VARCHAR(100),

      availability DECIMAL(10,4),

      equipment_vendor VARCHAR(255),

      jc_name VARCHAR(150),

      jc_id VARCHAR(100),

      kpi_value DECIMAL(12,4),

      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

const ensureColumn = async (table, column, definition) => {
  try {
    await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (err) {
    if (err?.code !== "ER_DUP_FIELDNAME") {
      throw err;
    }
  }
};

const ensureHpodscTable = async () => {
  await query(`
                CREATE TABLE IF NOT EXISTS hpodsc (
                  id INT AUTO_INCREMENT PRIMARY KEY,
                  file_id BIGINT,
                  circle VARCHAR(50),
                  cmp VARCHAR(100),
                  date DATE,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
              `);

  // Columns required by insertHpodscRows — added only if missing.
  await ensureColumn("hpodsc", "sap_id", "VARCHAR(100) NULL");
  await ensureColumn("hpodsc", "jc_name", "VARCHAR(150) NULL");
  await ensureColumn("hpodsc", "jc_id", "VARCHAR(100) NULL");
  await ensureColumn("hpodsc", "jc_sap_id", "VARCHAR(100) NULL");
  await ensureColumn("hpodsc", "city", "VARCHAR(100) NULL");
  await ensureColumn("hpodsc", "site_type", "VARCHAR(100) NULL");
  await ensureColumn("hpodsc", "device_type", "VARCHAR(100) NULL");
  await ensureColumn("hpodsc", "integration_state", "VARCHAR(100) NULL");
  await ensureColumn("hpodsc", "total_cnum_count", "INT NULL");
  await ensureColumn("hpodsc", "total_outage", "BIGINT NULL");
  await ensureColumn("hpodsc", "total_availability", "DECIMAL(12,4) NULL");
  await ensureColumn("hpodsc", "cells_up", "INT NULL");
};

// Every parser builds its value tuple with file_id at index 0, so the real
// file_id can be stamped in just before insert — which lets the metadata row be
// created first and its auto-increment id reused as the file_id.
const FILE_ID_COLUMN_INDEX = 0;

const insertStatements = {
  enb: `INSERT INTO enb (
          file_id, circle, cmp, site_type, date, kpi_value,
          sap_id, jc_name, jc_id, jc_sap_id, city,
          site_type_excel, device_type, cnum_count,
          outage_sec, availability, cells_up
        ) VALUES ?`,

  esc: `INSERT INTO esc (
          file_id, sap_id, circle, cmp, jc_name, jc_id, jc_sap_id,
          city, site_type, device_type, total_cnum_count, total_outage,
          total_availability, cells_up, date
        ) VALUES ?`,

  gnb: `INSERT INTO gnb (
          file_id, sap_id, circle, cmp, jc, city, site_type, device_type,
          total_cnum_count, total_outage, availability, cells_up, cells_up_mod,
          vendor, r4g_availability, air_fiber_sites, updated_r4g, date
        ) VALUES ?`,

  hpodsc: `INSERT INTO hpodsc (
          file_id, sap_id, circle, cmp, jc_name, jc_id, jc_sap_id,
          city, site_type, device_type, integration_state, total_cnum_count,
          total_outage, total_availability, cells_up, date
        ) VALUES ?`,

  osc: `INSERT INTO osc (
          file_id, date, sap_id, circle, cmp, region, ems_alias, city,
          jc_code, jc_sap_id, lsm_name, sys_alias, ip_addr_1, activeversion,
          site_type, outage_12am_12pm, outage_12pm_12am, total_enb_down_sec,
          cmp_code, availability, equipment_vendor, jc_name, jc_id, kpi_value
        ) VALUES ?`,

  isc: `INSERT INTO isc (file_id, circle, cmp, date, kpi_value) VALUES ?`,
};

const simpleKpiInsertStatement = (tableName) =>
  `INSERT INTO ${tableName} (file_id, circle, cmp, date, kpi_value, availability) VALUES ?`;

const INSERT_BATCH_SIZE = 1000;

/**
 * Writes prepared rows using `run` (the transaction-bound executor), stamping
 * the real file_id into each tuple first.
 */
const insertPreparedRows = async (prepared, fileId, run) => {
  const { insertSql, values } = prepared;
  if (!values.length) return 0;

  for (let i = 0; i < values.length; i += INSERT_BATCH_SIZE) {
    const batch = values.slice(i, i + INSERT_BATCH_SIZE).map((row) => {
      const stamped = row.slice();
      stamped[FILE_ID_COLUMN_INDEX] = fileId;
      return stamped;
    });
    await run(insertSql, [batch]);
  }

  return values.length;
};

const getLatestUploadRow = async (siteCategory, authUser) => {
  await ensureUploadsTable();

  const rows = await query(
    `SELECT id, file_name, report_date, total_records, uploaded_at, site_type, file_id
                FROM report_uploads
                WHERE site_category = ?
                ORDER BY report_date DESC, uploaded_at DESC, id DESC
                LIMIT 200`,
    [siteCategory]
  );

  if (isAllCircle(authUser)) return rows[0] || null;

  // Grouped lookup instead of one access query per candidate row.
  const circlesByFileId = await buildFileCircleIndex(rows);
  const viewerCircle = normalizeCircle(authUser?.circle).toLowerCase();

  return (
    rows.find((row) => {
      const circles = circlesByFileId.get(Number(row.file_id));
      if (!circles) return false;
      return [...circles].some((circle) => circle.toLowerCase() === viewerCircle);
    }) || null
  );
};

const formatDateOnly = (value) => {
  if (!value) return null;

  // The pool runs with dateStrings, so dates arrive as "YYYY-MM-DD" or
  // "YYYY-MM-DD HH:MM:SS" and need no parsing.
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }

  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.valueOf())) return null;

  // Local components, not toISOString(), so an IST date is not shifted back a day.
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeDate = (value) => {
  if (!value) return null;

  // already correct format → return directly
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  // handle DD/MM/YYYY
  if (typeof value === "string" && value.includes("/")) {
    const [dd, mm, yyyy] = value.split("/");
    return `${yyyy}-${mm}-${dd}`;
  }

  // 🚀 IMPORTANT: do not use new Date()
  return value;
};


const parseEnbRows = (rows, fallbackDate, fileId) => {
  const insertRows = [];
  const errors = [];

  rows.forEach((row, index) => {

    // buildCleanRow also folds underscores, so headers like "SAP_ID" now match
    // the "sap id" lookups below instead of silently reading as null.
    const cleanRow = buildCleanRow(row);
    if (isBlankRow(cleanRow)) return;

    const circle = cleanRow["circle"] || cleanRow["circle name"];
    const cmp = cleanRow["cmp"] || cleanRow["cmp name"];

    const normalizedDate = normalizeDate(fallbackDate);

    if (!validateRowCircle(circle, cmp, index + 2, errors)) return;

    let availability = cleanRow["overall cell availability"];

// Keep blank as blank
if (
  availability === undefined ||
  availability === null ||
  availability === ""
) {
  availability = null;
} else {
  availability = Number(availability);

  if (isNaN(availability)) {
    availability = null;
  }
}

    insertRows.push([
      fileId,
      String(circle).trim(),
      String(cmp).trim(),
      "enb",
      normalizedDate,
      null,

      cleanRow["sap id"],
      cleanRow["jc name"],
      cleanRow["jc id"],
      cleanRow["jc sap id"],
      cleanRow["city"],
      // The template ships a dedicated "Site Type Excel" column; fall back to
      // "Site Type" for files produced before it existed.
      findHeaderValue(cleanRow, ["site type excel", "site type"]) ?? null,
      cleanRow["device type"],
      // enb_format.xlsx heads these "CNUM Count" and "Outage Sec", but only the
      // "overall ..." spellings were read — so every upload made from the
      // official template stored NULL in both columns.
      findHeaderValue(cleanRow, [
        "cnum count", "overall cnum count", "total cnum count",
      ]) ?? null,
      findHeaderValue(cleanRow, [
        "outage sec", "overall cell outage (sec)", "total outage",
      ]) ?? null,
      availability,
      cleanRow["cells up"]
    ]);

  });

  return { insertRows, errors };
};
// ✅ CLOSE forEach loop

const parseEscRows = (rows, fallbackDate, fileId) => {
  const insertRows = [];
  const errors = [];

  rows.forEach((row, index) => {
    const cleanRow = buildCleanRow(row);
    if (isBlankRow(cleanRow)) return;

    const circle = cleanRow["circle"] || cleanRow["circle name"];
    const cmp = cleanRow["cmp"] || cleanRow["cmp name"];

    const date = normalizeDate(fallbackDate);

    if (!validateRowCircle(circle, cmp, index + 2, errors)) return;

   let availability =
  cleanRow["availability"] ??
  cleanRow["Availability"] ??
  cleanRow["total_availability"] ??
  cleanRow["total availability"];

if (
  availability === undefined ||
  availability === null ||
  availability === ""
) {
  availability = null;
} else {
  availability = Number(String(availability).replace("%", ""));

  if (isNaN(availability)) {
    availability = null;
  }
}

    insertRows.push([
      fileId,

      cleanRow["sap_id"] ||
      cleanRow["sap id"] ||
      null,

      String(circle).trim(),

      String(cmp).trim(),

      cleanRow["jc_name"] ||
      cleanRow["jc name"] ||
      null,

      cleanRow["jc code"] ||
      cleanRow["jc_id"] ||
      cleanRow["jc id"] ||
      null,

      cleanRow["jc_sap_id"] ||
      cleanRow["jc sap id"] ||
      null,

      cleanRow["city"] ||
      null,

      cleanRow["site_type"] ||
      cleanRow["site type"] ||
      null,

      cleanRow["device_type"] ||
      cleanRow["device type"] ||
      null,

      // These three were plain `||` chains, which treat a real 0 as falsy and
      // fall through to null — every genuine 0 uploaded for ESC was silently
      // stored as NULL. toExactNumber() preserves 0 exactly; only a truly
      // blank/missing cell becomes null.
      toExactNumber(cleanRow["total_cnum_count"] ?? cleanRow["total cnum count"]),

      toExactNumber(cleanRow["total_outage"] ?? cleanRow["total outage"]),

      availability,

      toExactNumber(cleanRow["cells_up"] ?? cleanRow["cells up"]),

      date
    ]);
  });

  return { insertRows, errors };
};

// Matches a header that starts with `prefix`, e.g. "circle name (as per sap)"
// for prefix "circle". Was defined identically inside three parser branches.
const pickByPrefix = (obj, prefix) => {
  const key = Object.keys(obj).find(
    (k) => k === prefix || k.startsWith(`${prefix} `)
  );
  return key ? obj[key] : undefined;
};

// 🔥 SMART HEADER DETECTION - Handles various naming conventions
const findHeaderValue = (cleanRow, possibleNames) => {
  for (const name of possibleNames) {
    if (cleanRow[name] !== undefined && cleanRow[name] !== null && cleanRow[name] !== "") {
      return cleanRow[name];
    }
  }
  return undefined;
};

// 🔥 NUMERIC CONVERSION - Safely convert values to numbers
const toNumber = (value) => {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    const num = Number(value);

    return isNaN(num) ? null : num;
};

// 🔥 EXACT NUMERIC CONVERSION - Preserves 0 and decimals exactly as uploaded.
// Only blank/non-numeric values become NULL; "%" suffixes are stripped so the
// numeric magnitude (e.g. "0.5%" -> 0.5) is stored unchanged.
const toExactNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const num = Number(String(value).replace(/%/g, "").trim());

  return Number.isFinite(num) ? num : null;
};

const parseGnbRows = (rows, fallbackDate, fileId) => {
  const insertRows = [];
  const errors = [];

  rows.forEach((row, idx) => {
    const cleanRow = buildCleanRow(row);
    if (isBlankRow(cleanRow)) return;

    const sapId = findHeaderValue(cleanRow, ["sap id", "sap_id", "sap"]) || null;
    const circle = cleanRow["circle"] || cleanRow["circle name"] || null;
    const cmp = cleanRow["cmp"] || cleanRow["cmp name"] || null;

    // GNB previously skipped this check entirely and inserted rows with a NULL
    // circle, which made them invisible to every circle-scoped query.
    if (!validateRowCircle(circle, cmp, idx + 2, errors)) return;

    const jc = findHeaderValue(cleanRow, ["jc", "jc name", "jc_name"]) || null;
    const city = cleanRow["city"] || cleanRow["city name"] || null;
    const siteType = findHeaderValue(cleanRow, ["site type", "site_type", "sitetype", "site_type_excel"]) || null;
    const deviceType = findHeaderValue(cleanRow, ["device type", "device_type", "devicetype"]) || null;

    // 🔥 NUMERIC FIELDS - Convert safely
    const totalCnumCount = toNumber(findHeaderValue(cleanRow, ["total cnum count", "total_cnum_count", "cnum count", "total cnum"]));
    const totalOutage = toNumber(findHeaderValue(cleanRow, ["total outage", "total_outage", "outage"]));
    const availability = toNumber(
      findHeaderValue(
        cleanRow,
        ["availability", "total availability", "total_availability"]
      ),
      0
    );
    const cellsUp = toNumber(findHeaderValue(cleanRow, ["cells up", "cells_up"]));
    const cellsUpMod = toNumber(findHeaderValue(cleanRow, ["cells up mod", "cells_up_mod"]));
    const r4gAvailability = toNumber(
      findHeaderValue(
        cleanRow,
        ["r4g availability"]
      ),
      0
    );

    const vendor = findHeaderValue(cleanRow, ["vendor", "vendor name"]) || null;
    const airFiberSites = findHeaderValue(cleanRow, ["air fiber sites", "air_fiber_sites", "air fiber"]) || null;
    const updatedR4g = findHeaderValue(cleanRow, ["updated r4g", "updated_r4g", "r4g"]) || null;

    insertRows.push([
      fileId,
      sapId,
      circle,
      cmp,
      jc,
      city,
      siteType,
      deviceType,
      totalCnumCount,
      totalOutage,
      availability,
      cellsUp,
      cellsUpMod,
      vendor,
      r4gAvailability,
      airFiberSites,
      updatedR4g,
      normalizeDate(fallbackDate)
    ]);
  });

  return { insertRows, errors };
};

function parseHpodscRows(rows, fallbackDate, fileId) {

  const insertRows = [];
  const errors = [];

  rows.forEach((row, index) => {

    const cleanRow = buildCleanRow(row);
    if (isBlankRow(cleanRow)) return;

    const circle = cleanRow["circle"] || cleanRow["circle name"];
    const cmp = cleanRow["cmp"] || cleanRow["cmp name"];

    const date = normalizeDate(fallbackDate);

    if (!validateRowCircle(circle, cmp, index + 2, errors)) return;

    insertRows.push([

      fileId,

      cleanRow["sap id"] || null,

      String(circle).trim(),

      String(cmp).trim(),

      cleanRow["jc name"] || null,

      cleanRow["jc code"] || null,

      cleanRow["jc sap id"] || null,

      cleanRow["city"] || null,

      cleanRow["site type"] || null,

      cleanRow["device type"] || null,

      cleanRow["integration state"] || null,

      toExactNumber(cleanRow["total cnum count"]),

      toExactNumber(cleanRow["total outage"]),

      toExactNumber(cleanRow["total availability"]),

      toExactNumber(cleanRow["cells up"]),

      date
    ]);
  });

  return { insertRows, errors };
}

const throwFileError = (message, details) => {
  const error = new Error(message);
  error.statusCode = 400;
  error.details = details;
  throw error;
};

/**
 * Reads the first worksheet and returns its rows together with the sheet name
 * and normalized header list, so every downstream error can say exactly where
 * the problem is. Unreadable files, empty workbooks and header-only sheets are
 * each reported with their own message instead of one generic failure.
 */
const readWorksheetRows = (fileBuffer, fileName = "the uploaded file") => {
  let workbook;

  try {
    workbook = xlsx.read(fileBuffer, { type: "buffer", cellDates: true });
  } catch (parseError) {
    throwFileError(
      `"${fileName}" could not be opened as a spreadsheet.\n\n` +
      `The file is either corrupt, password protected, or was renamed to .xlsx ` +
      `from another format.\n\n` +
      `Open it in Excel, use File > Save As to save a fresh .xlsx copy, then ` +
      `upload that copy.`,
      { errorType: "unreadable-file", fileName, reason: parseError.message }
    );
  }

  const sheetNames = workbook.SheetNames || [];

  if (!sheetNames.length) {
    throwFileError(
      `"${fileName}" has no worksheets.\n\n` +
      `The workbook opened but contains no sheets at all. Upload a file with ` +
      `the report data on its first sheet.`,
      { errorType: "no-sheets", fileName }
    );
  }

  // Reports are read from the first sheet. If that one is empty but a later
  // sheet has data, say so — silently reading sheet 1 and reporting "no rows"
  // sent people hunting for a problem in the wrong place.
  const sheetName = sheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(worksheet, { defval: "" });

  if (!rows.length) {
    const sheetsWithData = sheetNames.filter((name) => {
      if (name === sheetName) return false;
      return xlsx.utils.sheet_to_json(workbook.Sheets[name], { defval: "" }).length > 0;
    });

    throwFileError(
      `"${fileName}" has no data rows.\n\n` +
      `Sheet: ${sheetName}\n\n` +
      (sheetsWithData.length
        ? `The first sheet is empty, but these sheets do have data: ` +
          `${sheetsWithData.join(", ")}.\n\n` +
          `Reports are always read from the first sheet. Move "${sheetsWithData[0]}" ` +
          `to the front of the workbook, or delete the empty sheet, and upload again.`
        : `The sheet has a header row but no data underneath it, or it is ` +
          `completely blank.\n\nAdd your data starting at row 2 and upload again.`),
      {
        errorType: "empty-sheet",
        fileName,
        sheetName,
        availableSheets: sheetNames,
      }
    );
  }

  // With defval set, every row object carries the full set of header keys, so
  // the first row is the header list — no need to walk a million rows for it.
  const headers = [...new Set(Object.keys(rows[0]).map(normalizeHeaderKey))];

  return { rows, sheetName, headers, sheetNames };
};

const normalizeSiteTypeValue = (value = "") =>
  value.toString().trim().toUpperCase();

const normalizeUptimeValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildEnbTrendDatasets = (records = []) => {
  const validRecords = records
    .map((record) => {
      const dateValue = normalizeDate(record.date);
      const uptimeValue = normalizeUptimeValue(record.uptime);

      if (!dateValue || uptimeValue === null) {
        return null;
      }

      return {
        date: new Date(`${dateValue}T00:00:00`),
        uptime: uptimeValue,
      };
    })
    .filter(Boolean);

  const average = (items) =>
    items.length
      ? Number(
        (
          Math.round(
            (items.reduce((sum, item) => sum + Number(item.uptime || 0), 0) /
              items.length) * 100
          ) / 100
        ).toFixed(2)
      )
      : 0;

  const weeklyOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekDayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short" });
  const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short" });

  const weeklyMap = new Map();
  validRecords.forEach((record) => {
    const key = weekDayFormatter.format(record.date);
    const list = weeklyMap.get(key) || [];
    list.push(record);
    weeklyMap.set(key, list);
  });

  const weekly = weeklyOrder
    .filter((key) => weeklyMap.has(key))
    .map((key) => ({
      day: key,
      uptime: average(weeklyMap.get(key) || []),
    }));

  const monthlyMap = new Map();
  validRecords.forEach((record) => {
    const key = String(record.date.getDate()).padStart(2, "0");
    const list = monthlyMap.get(key) || [];
    list.push(record);
    monthlyMap.set(key, list);
  });

  const monthly = Array.from(monthlyMap.entries())
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([key, items]) => ({
      day: key,
      uptime: average(items),
    }));

  const yearlyMap = new Map();
  validRecords.forEach((record) => {
    const key = monthFormatter.format(record.date);
    const list = yearlyMap.get(key) || [];
    list.push(record);
    yearlyMap.set(key, list);
  });

  const monthOrder = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const yearly = monthOrder
    .filter((key) => yearlyMap.has(key))
    .map((key) => ({
      day: key,
      uptime: average(yearlyMap.get(key) || []),
    }));

  return { weekly, monthly, yearly };
};

const getLatestEnbTrendDatasets = async (authUser) => {
  await ensureEnbTable();
  const circleSql = isAllCircle(authUser)
    ? ""
    : " AND LOWER(TRIM(circle)) = LOWER(TRIM(?))";
  const circleParams = isAllCircle(authUser) ? [] : [authUser.circle];

  const latestFileRows = await query(
    `SELECT file_id
                FROM enb
                WHERE site_type = 'enb'
                  ${circleSql}
                ORDER BY created_at DESC, file_id DESC
                LIMIT 1`,
    circleParams
  );

  const latestFileId = latestFileRows[0]?.file_id;

  if (!latestFileId) {
    return { weekly: [], monthly: [], yearly: [] };
  }

  const rows = await query(
    `SELECT date, COALESCE(availability, kpi_value) AS uptime
                FROM enb
                WHERE file_id = ?
                  AND site_type = 'enb'
                  ${circleSql}`,
    [latestFileId, ...circleParams]
  );

  return buildEnbTrendDatasets(rows);
};

/**
 * Parses and validates one file's rows and returns the INSERT plus the value
 * tuples, WITHOUT writing anything. Any table creation happens here (DDL cannot
 * live inside the transaction), so the caller can validate every file first and
 * then commit all of them together.
 *
 * The returned tuples carry a placeholder at FILE_ID_COLUMN_INDEX;
 * insertPreparedRows stamps the real file_id in at write time.
 */
const prepareSiteUploadRows = async ({
  siteType,
  rows,
  date,
  fileName,
  sheetName,
  headers = [],
}) => {
  const normalizedSiteType = String(siteType || "").trim().toLowerCase();
  const fileId = null; // placeholder — replaced by insertPreparedRows

  // Checked first: an unknown Site Type should say so, rather than complain
  // about columns for a template that does not exist.
  if (!reportDataTables.has(normalizedSiteType)) {
    const error = new Error(
      `"${siteType}" is not a Site Type this page can upload.\n\n` +
      `Supported Site Types: ${[...reportDataTables]
        .map((name) => name.toUpperCase())
        .sort()
        .join(", ")}.`
    );
    error.statusCode = 400;
    error.details = { errorType: "unsupported-site-type", siteType, fileName, sheetName };
    throw error;
  }

  // Where the problem is, attached to every error this function raises.
  const context = {
    fileName,
    sheetName,
    detectedHeaders: headers.slice(0, 40),
    totalRows: rows.length,
  };

  // The header row is checked before any data row, so a file uploaded under the
  // wrong Site Type reports "wrong template" instead of thousands of identical
  // "Circle is blank" row errors.
  assertTemplateHeaders(headers, normalizedSiteType.toUpperCase(), {
    fileName,
    sheetName,
  });

  if (normalizedSiteType === "enb") {
    await ensureEnbTable();
    const { insertRows, errors } = parseEnbRows(rows, date, fileId);

    if (errors.length) throwRowErrors(errors, "ENB", context);
    if (!insertRows.length) throwNoValidRows("ENB", context);

    return { insertSql: insertStatements.enb, values: insertRows };
  }

  if (normalizedSiteType === "esc") {
    await ensureEscTable();
    const { insertRows, errors } = parseEscRows(rows, date, fileId);

    if (errors.length) throwRowErrors(errors, "ESC", context);
    if (!insertRows.length) throwNoValidRows("ESC", context);

    return { insertSql: insertStatements.esc, values: insertRows };
  }

  if (normalizedSiteType === "hpodsc") {
    await ensureHpodscTable();
    // These errors used to be destructured away, so a file with blank Circle
    // values reported success while quietly dropping those rows.
    const { insertRows, errors } = parseHpodscRows(rows, date, fileId);

    if (errors.length) throwRowErrors(errors, "HPODSC", context);
    if (!insertRows.length) throwNoValidRows("HPODSC", context);

    return { insertSql: insertStatements.hpodsc, values: insertRows };
  }

  if (normalizedSiteType === "isc") {
    await ensureIscTable();

    const insertRows = [];
    const errors = [];

    rows.forEach((row, index) => {
      const cleanRow = buildCleanRow(row);
      if (isBlankRow(cleanRow)) return;

      const circle =
        cleanRow["circle"] ||
        cleanRow["circle name"] ||
        pickByPrefix(cleanRow, "circle");

      const cmp =
        cleanRow["cmp"] ||
        cleanRow["cmp name"] ||
        pickByPrefix(cleanRow, "cmp");

      const dateValue = normalizeDate(date);

      if (!validateRowCircle(circle, cmp, index + 2, errors)) return;

      insertRows.push([fileId, String(circle).trim(), String(cmp).trim(), dateValue, 1]);
    });

    if (errors.length) throwRowErrors(errors, "ISC", context);
    if (!insertRows.length) throwNoValidRows("ISC", context);

    return { insertSql: insertStatements.isc, values: insertRows };
  }

  if (normalizedSiteType === "osc") {
    await ensureOscTable();
    await ensureColumn("osc", "kpi_value", "DECIMAL(12,4) NULL");

    const insertRows = [];
    const errors = [];
    const headerKeys = new Set();

    const getValue = (obj, keys) => {
  for (const key of keys) {
    if (
      obj[key] !== undefined &&
      obj[key] !== null &&
      obj[key] !== ""
    ) {
      return obj[key];
    }
  }
  return null;
};

    const pickByPrefix = (obj, prefix) => {
      const key = Object.keys(obj).find(
        (k) => k === prefix || k.startsWith(prefix + " ")
      );
      return key ? obj[key] : undefined;
    };

    rows.forEach((row, index) => {
      const cleanRow = buildCleanRow(row);
      if (isBlankRow(cleanRow)) return;

      const circle =
        cleanRow["circle"] ||
        cleanRow["circle name"] ||
        pickByPrefix(cleanRow, "circle");

      const cmp =
        cleanRow["cmp"] ||
        cleanRow["cmp name"] ||
        pickByPrefix(cleanRow, "cmp");

      const dateValue = normalizeDate(date);

      // OSC used to drop invalid rows silently, so a file with half its Circle
      // column blank still reported a fully successful upload.
      if (!validateRowCircle(circle, cmp, index + 2, errors)) return;

      // Store the availability exactly as uploaded (0, 0.1, 0.5, 1.0, ...).
      // kpi_value mirrors it so dashboards averaging either column are correct.
      const availabilityValue = toExactNumber(
        getValue(cleanRow, ["availability", "Availability"])
      );

 insertRows.push([
  fileId,
  dateValue,
  // osc_format.xlsx has no "SAP ID" column, only "JC SAP ID" — so sap_id was
  // NULL for every row ever uploaded from the official template (same class
  // of bug already fixed for ENB/ESC). Fall back to "jc sap id".
  getValue(cleanRow, ["sap id", "sap_id", "jc sap id", "jc_sap_id"]),
  String(circle).trim(),
  String(cmp).trim(),

  getValue(cleanRow, ["region", "REGION"]),

  getValue(cleanRow, [
    "ems alias",
    "ems_alias",
    "EMS_ALIAS"
  ]),

  getValue(cleanRow, ["city"]),

  getValue(cleanRow, [
    "jc code",
    "jc_code",
    "JC_CODE"
  ]),

  getValue(cleanRow, [
    "jc sap id",
    "jc_sap_id",
    "JC_SAP_ID"
  ]),

  getValue(cleanRow, [
    "lsm name",
    "lsm_name",
    "LSM_NAME"
  ]),

  getValue(cleanRow, [
    "sys alias",
    "sys_alias",
    "SYS_ALIAS"
  ]),

  getValue(cleanRow, [
    "ip addr 1",
    "ip_addr_1",
    "IP_ADDR_1"
  ]),

  getValue(cleanRow, [
    "activeversion",
    "active version",
    "ActiveVersion"
  ]),

  getValue(cleanRow, [
    "site type",
    "site_type",
    "SITE_TYPE"
  ]),

  getValue(cleanRow, [
    "outage 12am 12pm",
    "outage_12am_12pm",
    "OUTAGE_12AM_12PM"
  ]),

  getValue(cleanRow, [
    "outage 12pm 12am",
    "outage_12pm_12am",
    "OUTAGE_12PM_12AM"
  ]),

  getValue(cleanRow, [
    "total enb down sec",
    "total_enb_down_sec",
    "TOTAL_ENB_DOWN_SEC"
  ]),

  getValue(cleanRow, [
    "cmp code",
    "cmp_code",
    "CMP_CODE"
  ]),

  availabilityValue,

  getValue(cleanRow, [
    "equipment vendor",
    "equipment_vendor",
    "Equipment Vendor"
  ]),

  getValue(cleanRow, ["jc name", "jc_name"]),
  getValue(cleanRow, ["jc id", "jc_id"]),

  availabilityValue
]);
    });

    if (errors.length) throwRowErrors(errors, "OSC", context);
    if (!insertRows.length) throwNoValidRows("OSC", context);

    return { insertSql: insertStatements.osc, values: insertRows };
  }

  if (normalizedSiteType === "gnb") {

    await ensureGnbTable();

    const { insertRows, errors } = parseGnbRows(
      rows,
      date,
      fileId
    );

    if (errors.length) throwRowErrors(errors, "GNB", context);
    if (!insertRows.length) throwNoValidRows("GNB", context);

    return { insertSql: insertStatements.gnb, values: insertRows };
  }

  if (["ag1", "ag2", "ila", "gsc", "wifi"].includes(normalizedSiteType)) {
    const tableName = normalizedSiteType;

    await query(`
                  CREATE TABLE IF NOT EXISTS ${tableName} (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    file_id BIGINT,
                    circle VARCHAR(50),
                    cmp VARCHAR(100),
                    date DATE,
                    kpi_value DECIMAL(12,4),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                  )
                `);

    // Real availability from the Excel file; kpi_value stays a per-site marker
    // (=1) because the main dashboard counts sites with SUM(kpi_value).
    await ensureColumn(tableName, "availability", "DECIMAL(12,4) NULL");

    const insertRows = [];
    const errors = [];

    rows.forEach((row, index) => {
      const cleanRow = buildCleanRow(row);
      if (isBlankRow(cleanRow)) return;

      const circle =
        cleanRow["circle"] ||
        cleanRow["circle name"] ||
        pickByPrefix(cleanRow, "circle");

      const cmp =
        cleanRow["cmp"] ||
        cleanRow["cmp name"] ||
        pickByPrefix(cleanRow, "cmp");

      const dateValue = normalizeDate(date);

      if (!validateRowCircle(circle, cmp, index + 2, errors)) return;

      const availabilityValue = toExactNumber(
        findHeaderValue(cleanRow, [
          "availability",
          "total availability",
          "overall cell availability",
          "uptime",
        ])
      );

      insertRows.push([fileId, String(circle).trim(), String(cmp).trim(), dateValue, 1, availabilityValue]);
    });

    const label = tableName.toUpperCase();
    if (errors.length) throwRowErrors(errors, label, context);
    if (!insertRows.length) throwNoValidRows(label, context);

    return { insertSql: simpleKpiInsertStatement(tableName), values: insertRows };
  }

  // Unreachable: the whitelist check above admits only types with a branch.
  // Kept so adding a table to reportDataTables without a parser fails loudly.
  const error = new Error(
    `"${siteType}" has no upload parser configured. Please contact your administrator.`
  );
  error.statusCode = 500;
  error.details = { errorType: "missing-parser", siteType, fileName, sheetName };
  throw error;
};

// ✅ List reports

router.get("/", requirePagePermission("tower-reports", "view"), async (req, res) => {
  try {
    const siteCategory = req.query.siteCategory || "tower";
    await ensureUploadsTable();

    const allRows = await query(
      `SELECT id, site_category, report_date, site_type,
              report_type, upload_type, uploaded_by,
              file_name, total_records, file_id, uploaded_at
       FROM report_uploads
       WHERE site_category = ?
       ORDER BY report_date DESC, uploaded_at DESC, id DESC`,
      [siteCategory]
    );

    // One grouped query per site-type table gives both the circle labels and the
    // access decision. The previous code ran a separate COUNT per upload row —
    // ~400 full scans of multi-million-row tables on every page load.
    const circlesByFileId = await buildFileCircleIndex(allRows);

    const viewerCircle = normalizeCircle(req.authUser?.circle).toLowerCase();
    const seesEveryCircle = isAllCircle(req.authUser);

    const rows = allRows
      .filter((row) => {
        if (seesEveryCircle) return true;
        const circles = circlesByFileId.get(Number(row.file_id));
        // Uploads with no resolvable circle stay hidden from circle-scoped users.
        if (!circles || circles.size === 0) return false;
        return [...circles].some((circle) => circle.toLowerCase() === viewerCircle);
      })
      .map((row) => {
        const circles = [...(circlesByFileId.get(Number(row.file_id)) || [])].sort();
        return {
          ...row,
          // A report file covers several circles, so the old single `circle`
          // value showed an arbitrary one. Send the full list and a label.
          circles,
          circle:
            circles.length === 0 ? null
              : circles.length === 1 ? circles[0]
                : `${circles.length} Circles`,
          file_missing: false,
        };
      });

    res.json({ rows });
  } catch (error) {
    console.error("Report list error:", error);
    res.status(500).json({
      message: "Unable to load reports. Please refresh the page and try again.",
    });
  }
});

// ✅ Latest upload summary (file name + date + record count)
router.get("/latest-summary", requirePagePermission("tower-reports", "view"), async (req, res) => {
  try {
    const siteCategory = (req.query.siteCategory || "tower").toLowerCase();
    const latest = await getLatestUploadRow(siteCategory, req.authUser);

    if (!latest) {
      return res.json({
        fileName: null,
        uploadDate: null,
        totalRecords: 0,
      });
    }

    res.json({
      fileName: latest.file_name,
      uploadDate: formatDateOnly(latest.report_date || latest.uploaded_at),
      totalRecords: Number(latest.total_records || 0),
    });
  } catch (error) {
    console.error("Latest summary error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Latest upload info only
router.get("/latest", requirePagePermission("tower-reports", "view"), async (req, res) => {
  try {
    const siteCategory = (req.query.siteCategory || "tower").toLowerCase();
    const latest = await getLatestUploadRow(siteCategory, req.authUser);

    if (!latest) {
      return res.json({ fileName: null, uploadDate: null });
    }

    res.json({
      fileName: latest.file_name,
      uploadDate: formatDateOnly(latest.report_date || latest.uploaded_at),
    });
  } catch (error) {
    console.error("Latest upload error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Latest upload record count only
router.get("/latest/count", requirePagePermission("tower-reports", "view"), async (req, res) => {
  try {
    const siteCategory = (req.query.siteCategory || "tower").toLowerCase();
    const latest = await getLatestUploadRow(siteCategory, req.authUser);

    if (!latest) {
      return res.json({ totalRecords: 0 });
    }

    res.json({ totalRecords: Number(latest.total_records || 0) });
  } catch (error) {
    console.error("Latest count error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/enb/uptime-trend", requirePagePermission("tower-reports", "view"), async (req, res) => {
  try {
    const trends = await getLatestEnbTrendDatasets(req.authUser);
    res.json(trends);
  } catch (error) {
    console.error("ENB uptime trend error:", error);
    res.status(500).json({
      message: "Failed to fetch ENB uptime trend",
      weekly: [],
      monthly: [],
      yearly: [],
    });
  }
});

// ✅ Upload API with multer error handling
router.post("/upload", requirePagePermission("tower-reports", "edit"), (req, res) => {
  uploadAnyReportFiles(req, res, async (err) => {

    if (err) {
      console.error("Upload transport error:", err.code, err.message);
      return res.status(400).json({ message: uploadLimitMessage(err) });
    }

    try {
      const { site_type, report_type, date } = req.body;

      // Defaults to the signed-in account, but the form field can override it
      // (e.g. filing a report on someone else's behalf).
      const uploadedBy =
        String(req.body.uploadedBy || "").trim() ||
        req.authUser?.name || req.authUser?.username || req.authUser?.email || "Unknown user";
      const duplicateAction = String(req.body.duplicateAction || "").toLowerCase();
      const site_category = (req.body.siteCategory || "tower").toLowerCase();
      const normalizedSiteType = normalizeSiteTypeValue(site_type);
      const files = getUploadedReportFiles(req);

      // The mode comes from what the user picked in the UI, not from the file
      // count. Inferring it meant a Bulk upload of exactly one file was treated
      // as Single, so the date was taken from the date picker instead of the
      // file name — silently filing the report under the wrong day.
      const detectedUploadType =
        String(req.body.upload_type || "").trim().toLowerCase() === "bulk"
          ? "bulk"
          : "single";

      if (detectedUploadType === "single" && files.length > 1) {
        return res.status(400).json({
          message: "Single Upload accepts one file at a time.\n\nSwitch to Bulk Upload to send multiple files.",
        });
      }

      const finalDate = detectedUploadType === "single" ? normalizeDate(date) : null;

      if (detectedUploadType === "single" && !finalDate) {
        return res.status(400).json({ message: "Please select report date." });
      }
      if (!site_type) {
        return res.status(400).json({ message: "Please select Site Type." });
      }
      if (!report_type) {
        return res.status(400).json({ message: "Please select Report Type." });
      }
      if (!files.length) {
        return res.status(400).json({ message: "Please select at least one file." });
      }

      const invalidFile = files.find((file) => {
        const ext = String(file.originalname || "").split(".").pop().toLowerCase();
        return !allowedExtensions.has(ext);
      });

      if (invalidFile) {
        return res.status(400).json({
          message: "Invalid file format.\n\nOnly .xlsx, .xls, .xlsb and .csv files are allowed.",
        });
      }

      await ensureUploadsTable();

      // Every file name is checked before any file is parsed, so a batch of
      // twelve reports lists all of its naming problems at once instead of
      // failing on the first one, twelve times over.
      if (detectedUploadType === "bulk") {
        const nameProblems = files
          .map((file) => {
            const name = String(file.originalname || "");
            if (extractDateFromFileName(name)) return null;

            const hasDatePart = /\d{4}-\d{2}-\d{2}/.test(name);
            return {
              fileName: name,
              reason: hasDatePart
                ? "The date in the name is not a real calendar date, or the name has extra separators before it."
                : "The name has no YYYY-MM-DD date, so the report date cannot be determined.",
            };
          })
          .filter(Boolean);

        if (nameProblems.length) {
          return res.status(400).json({
            success: false,
            errorType: "file-name",
            message:
              `${nameProblems.length} of ${files.length} file name${files.length === 1 ? "" : "s"} ` +
              `could not be read, so nothing was uploaded.\n\n` +
              nameProblems
                .map((item) => `• ${item.fileName}\n  ${item.reason}`)
                .join("\n") +
              `\n\n${bulkFileNameFormatHelp}\nExample: outage_2026-07-27.xlsx`,
            errors: nameProblems.map((item) => ({
              row: null,
              column: "File name",
              value: item.fileName,
              expected: "reporttype_YYYY-MM-DD.xlsx",
              reason: item.reason,
              fix: "Rename the file to reporttype_YYYY-MM-DD.xlsx and select it again.",
            })),
          });
        }
      }

      const pendingUploads = [];

      for (const file of files) {
        const { rows, sheetName, headers } = readWorksheetRows(
          file.buffer,
          file.originalname
        );
        assertRowsAllowedCircle(req.authUser, rows, getRawCircle);

        const fileReportDate =
          detectedUploadType === "bulk"
            ? extractDateFromFileName(file.originalname)
            : finalDate;

        const existingUploads = await query(
          `SELECT id, site_type, file_id, report_date, file_name
           FROM report_uploads
           WHERE site_category = ?
             AND LOWER(site_type) = LOWER(?)
             AND report_type = ?
             AND report_date = ?`,
          [site_category, normalizedSiteType, report_type, fileReportDate]
        );
        const accessibleExistingUploads = await filterAccessibleUploads(
          existingUploads,
          req.authUser
        );

        pendingUploads.push({
          file,
          rows,
          sheetName,
          headers,
          reportDate: fileReportDate,
          duplicates: accessibleExistingUploads,
        });
      }

      const duplicateFiles = pendingUploads.filter((item) => item.duplicates.length > 0);

      if (duplicateFiles.length && !["replace", "skip"].includes(duplicateAction)) {
        return res.status(409).json({
          success: false,
          duplicate: true,
          mode: files.length > 1 ? "bulk" : "single",
          duplicates: duplicateFiles.map((item) => ({
            fileName: item.file.originalname,
            report_date: item.reportDate,
            existing: item.duplicates.map((row) => ({
              id: row.id,
              file_name: row.file_name,
              report_date: row.report_date,
            })),
          })),
        });
      }

      if (duplicateAction === "skip" && duplicateFiles.length === pendingUploads.length) {
        return res.status(200).json({
          success: true,
          message: "No new reports uploaded. Existing reports were skipped.",
          count: 0,
          skipped: duplicateFiles.length,
        });
      }

      const uploadsToProcess =
        duplicateAction === "skip"
          ? pendingUploads.filter((item) => item.duplicates.length === 0)
          : pendingUploads;

      // PHASE 1 — parse and validate every file before a single row is written.
      // Table creation also happens here: DDL implicitly commits, so it must not
      // run inside the transaction below.
      const preparedUploads = [];
      for (const item of uploadsToProcess) {
        const prepared = await prepareSiteUploadRows({
          siteType: normalizedSiteType,
          rows: item.rows,
          date: item.reportDate,
          fileName: item.file.originalname,
          sheetName: item.sheetName,
          headers: item.headers,
        });
        preparedUploads.push({ item, prepared });
      }

      if (!preparedUploads.length) {
        return res.status(200).json({
          success: true,
          message: "No reports uploaded.",
          count: 0,
          skipped: duplicateFiles.length,
        });
      }

      // PHASE 2 — one transaction for every write. A failure anywhere rolls the
      // whole batch back, so a part-uploaded file can no longer leave data rows
      // behind with no report_uploads row pointing at them.
      const uploadedAt = new Date();

      await withTransaction(async (run) => {
        if (duplicateAction === "replace") {
          for (const item of duplicateFiles) {
            for (const duplicate of item.duplicates) {
              await deleteUploadDataWith(run, duplicate);
            }
          }
        }

        for (const { item, prepared } of preparedUploads) {
          // The metadata row is written first so its auto-increment id can be
          // reused as the file_id. Clock-based ids collided whenever two uploads
          // landed in the same millisecond.
          const result = await run(
            `INSERT INTO report_uploads (
              site_category, report_date, site_type, report_type, upload_type,
              uploaded_by, file_name, total_records, uploaded_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              site_category,
              item.reportDate,
              normalizedSiteType.toUpperCase(),
              report_type,
              detectedUploadType,
              uploadedBy,
              item.file.originalname,
              prepared.values.length,
              uploadedAt,
            ]
          );

          const uploadId = result.insertId;
          const fileId = uploadId;

          await run(`UPDATE report_uploads SET file_id = ? WHERE id = ?`, [fileId, uploadId]);
          await insertPreparedRows(prepared, fileId, run);
        }
      });

      const uploadedCount = preparedUploads.length;

      res.status(200).json({
        success: true,
        count: uploadedCount,
        skipped: duplicateAction === "skip" ? duplicateFiles.length : 0,
        uploadType: detectedUploadType,
        message:
          duplicateAction === "skip" && duplicateFiles.length
            ? `${uploadedCount} file(s) uploaded successfully. ${duplicateFiles.length} existing file(s) skipped.`
            : `${uploadedCount} file(s) uploaded successfully.`,
      });
    } catch (error) {
      console.error("Report upload error:", error);
      const isDatabaseError = error?.code && String(error.code).startsWith("ER_");

      // The parsers build a full breakdown (sheet, row, column, found value,
      // expected value, reason). It used to be thrown away here, leaving the
      // user with a wall of text and no way to work through the problems.
      const details = isDatabaseError ? null : error.details;

      res.status(error.statusCode || 500).json({
        success: false,
        message: isDatabaseError
          ? "Unable to upload reports.\n\nPlease try again or contact administrator."
          : error.message || "Upload failed.\n\nPlease check your files and try again.",
        ...(details || {}),
      });
    }
  });
});

router.post("/bulk-delete", requirePagePermission("tower-reports", "delete"), async (req, res) => {
  try {

    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);

    if (!ids.length) {
      return res.status(400).json({
        message: "No reports selected. Please select at least one report to delete.",
      });
    }

    const placeholders = ids.map(() => "?").join(",");

    const rows = await query(
      `SELECT id, file_name, site_type, file_id
       FROM report_uploads
       WHERE id IN (${placeholders})`,
      ids
    );

    if (!rows.length) {
      return res.status(404).json({
        message: "The selected reports were not found. Please refresh the page and try again.",
      });
    }

    const accessChecks = await Promise.all(
      rows.map((row) => isUploadAccessible(row, req.authUser, true))
    );
    if (accessChecks.some((allowed) => !allowed)) {
      return res.status(403).json({ message: "You cannot delete another circle's data." });
    }

    // One transaction for the whole selection. Deleting in a loop on separate
    // connections meant a failure partway through left some reports gone and
    // the rest untouched, with the caller told only that it failed.
    await withTransaction(async (run) => {
      for (const row of rows) {
        await deleteUploadDataWith(run, row);
      }
    });

    const missing = ids.length - rows.length;

    res.json({
      message:
        `${rows.length} report${rows.length === 1 ? "" : "s"} deleted successfully.` +
        (missing > 0
          ? ` ${missing} had already been removed by someone else.`
          : ""),
      deleted: rows.length,
    });

  } catch (err) {
    console.error("Bulk delete error:", err);
    res.status(500).json({
      message: "Unable to delete the selected reports. Please try again, or contact your administrator if the problem continues.",
    });
  }
});

const bulkExportHighWaterMark = 1000;
// Excel workbooks have a hard limit of 1,048,576 total rows per worksheet.
// One row is reserved for headers on every export sheet.
const maxExcelDataRowsPerSheet = 1048575;

const xlsxMimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const runConnectionQuery = (connection, sql, params = []) =>
  new Promise((resolve, reject) => {
    connection.query(sql, params, (err, result) => (err ? reject(err) : resolve(result)));
  });

const streamBulkExportRows = async function* (sql, params) {
  const connection = await new Promise((resolve, reject) => {
    db.getConnection((err, pooledConnection) => {
      if (err) return reject(err);
      resolve(pooledConnection);
    });
  });

  // MariaDB calls this max_statement_time while MySQL calls it
  // max_execution_time.  Do not make exports depend on either server-specific
  // setting existing: an unknown variable used to abort ENB/GNB exports before
  // their SELECT even started.
  let timeoutVariable = null;

  try {
    await runConnectionQuery(connection, "SET time_zone = '+05:30'");

    // Some report tables contain millions of rows. The hosting database has a
    // low max_statement_time, which was cancelling the already-authorized,
    // date-scoped export SELECT before a workbook could be built. Apply this
    // only to this export connection and restore its default before reuse.
    for (const variable of ["max_statement_time", "max_execution_time"]) {
      try {
        await runConnectionQuery(connection, `SET SESSION ${variable} = 0`);
        timeoutVariable = variable;
        break;
      } catch (err) {
        // Try the name used by the other supported MySQL-family server.
        if (err.code !== "ER_UNKNOWN_SYSTEM_VARIABLE") {
          console.warn(`Could not disable ${variable} for export:`, err.message);
        }
      }
    }

    const rowStream = connection
      .query(sql, params)
      .stream({ highWaterMark: bulkExportHighWaterMark });

    for await (const row of rowStream) {
      yield row;
    }
  } finally {
    if (timeoutVariable) {
      try {
        await runConnectionQuery(connection, `SET SESSION ${timeoutVariable} = DEFAULT`);
      } catch (err) {
        // The connection is about to return to the pool. Do not hide the
        // export's original success/failure if the best-effort reset fails.
        console.warn("Could not reset export statement timeout:", err.message);
      }
    }
    connection.release();
  }
};

function extractDateFromFileName(fileName = "") {
  const normalizedFileName = String(fileName || "").trim();
  const validFormatMatch = normalizedFileName.match(
    /^[^._\s-]+_(\d{4}-\d{2}-\d{2})\.[^.]+$/
  );

  if (!validFormatMatch) return null;

  const [year, month, day] = validFormatMatch[1].split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  const isValidDate =
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day;

  return isValidDate ? validFormatMatch[1] : null;
}

/**
 * Removes an upload's data rows and its metadata row using the supplied
 * executor, so it can take part in a caller's transaction. `tableName` is
 * checked against the reportDataTables whitelist before interpolation.
 */
async function deleteUploadDataWith(execute, upload) {
  const tableName = String(upload.site_type || "").toLowerCase();
  const fileId = Number(upload.file_id);

  if (reportDataTables.has(tableName) && Number.isFinite(fileId)) {
    await execute(`DELETE FROM ${tableName} WHERE file_id = ?`, [fileId]);
  }

  await execute("DELETE FROM report_uploads WHERE id = ?", [upload.id]);
}


// ✅ SINGLE FILE DOWNLOAD
router.get("/download/:id", requirePagePermission("tower-reports", "download"), async (req, res) => {

  try {

    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid report reference." });
    }

    const uploadRows = await query(
      `SELECT id, site_type, file_id, file_name, report_date
       FROM report_uploads
       WHERE id = ?`,
      [id]
    );

    if (!uploadRows.length) {
      return res.status(404).json({
        message: "This report no longer exists. Please refresh the page and try again.",
      });
    }

    const upload = uploadRows[0];
    const siteType = String(upload.site_type || "").toLowerCase();

    if (!reportDataTables.has(siteType)) {
      return res.status(400).json({
        message:
          `"${upload.site_type}" reports cannot be downloaded.\n\n` +
          `Downloadable Site Types: ${[...reportDataTables]
            .map((name) => name.toUpperCase())
            .sort()
            .join(", ")}.`,
      });
    }

    const fileId = Number(upload.file_id);
    const seesEveryCircle = isAllCircle(req.authUser);

    const rows = await query(
      `SELECT *
         FROM ${siteType}
        WHERE file_id = ?${seesEveryCircle ? "" : " AND LOWER(TRIM(circle)) = LOWER(TRIM(?))"}`,
      seesEveryCircle ? [fileId] : [fileId, req.authUser.circle]
    );

    if (!rows.length) {
      // Distinguish "the upload is empty" from "none of it is yours" — the old
      // shared "No data found" sent circle users looking for a missing file.
      const [totals] = await query(
        `SELECT COUNT(*) AS total FROM ${siteType} WHERE file_id = ?`,
        [fileId]
      );

      return res.status(404).json({
        message: Number(totals?.total || 0) > 0
          ? `"${upload.file_name || upload.site_type}" contains no ${normalizeCircle(req.authUser?.circle)} rows, so there is nothing for you to download.`
          : `"${upload.file_name || upload.site_type}" has no data rows stored against it.\n\nDelete this entry and upload the file again.`,
      });
    }

    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(
      workbook,
      xlsx.utils.json_to_sheet(rows),
      `${siteType.toUpperCase()} Report`
    );

    // Was bookType "xlsb" while the name and Content-Type both said .xlsx, so
    // every download was a Binary Workbook wearing an OOXML label. Excel coped;
    // Sheets, Numbers and most parsers did not.
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });

    const downloadName =
      `${siteType.toUpperCase()}_${formatDateOnly(upload.report_date) || "report"}.xlsx`;

    res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Length", buffer.length);

    res.send(buffer);

  } catch (err) {
    console.error("Report download error:", err);
    res.status(500).json({
      message: "Unable to prepare this download. Please try again, or contact your administrator if the problem continues.",
    });
  }

});

// The circle list is a fixed four-value set, so it is served from the constant
// rather than by scanning eleven multi-million-row tables on every page load.
// Circle-scoped users only ever see their own circle here.
router.get("/circles", requirePagePermission("tower-reports", "view"), (req, res) => {
  const circles = isAllCircle(req.authUser)
    ? [...VALID_CIRCLES].sort()
    : [normalizeCircle(req.authUser?.circle)].filter(Boolean);

  res.json({ circles });
});

router.get("/export-excel", requirePagePermission("tower-reports", "download"), async (req, res) => {

  try {

    const {
      siteType: requestedSiteType,
      fromDate: requestedFromDate,
      toDate: requestedToDate,
      circle: requestedCircle,
      reportType: requestedReportType,
      siteCategory: requestedSiteCategory,
    } = req.query;

    const siteType = typeof requestedSiteType === "string" ? requestedSiteType.trim() : "";
    const fromDate = typeof requestedFromDate === "string" ? requestedFromDate.trim() : "";
    const toDate = typeof requestedToDate === "string" ? requestedToDate.trim() : "";
    const requestedCircleValue = typeof requestedCircle === "string" ? requestedCircle.trim() : "";
    const reportType = typeof requestedReportType === "string" ? requestedReportType.trim() : "";
    const siteCategory = typeof requestedSiteCategory === "string"
      ? requestedSiteCategory.trim().toLowerCase()
      : "";

    if (!siteType) {
      return res.status(400).json({ message: "Please select a Site Type." });
    }

    const isIsoDate = (value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const [year, month, day] = value.split("-").map(Number);
      const parsed = new Date(Date.UTC(year, month - 1, day));
      return parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day;
    };

    if (!isIsoDate(fromDate) || !isIsoDate(toDate)) {
      return res.status(400).json({
        message: "Please choose a valid From date and To date.",
      });
    }

    // String comparison is safe here because both are ISO yyyy-mm-dd.
    if (fromDate > toDate) {
      return res.status(400).json({
        message: "The From date must be on or before the To date.\n\nPlease swap the dates and try again.",
      });
    }

    const tableName = siteType.toLowerCase();

    // validate table name whitelist to avoid SQL injection
    if (!reportDataTables.has(tableName)) {
      return res.status(400).json({
        message:
          `"${siteType}" cannot be exported.\n\n` +
          `Exportable Site Types: ${[...reportDataTables]
            .map((name) => name.toUpperCase())
            .sort()
            .join(", ")}.`,
      });
    }

    if (reportType && !VALID_REPORT_TYPES.includes(reportType)) {
      return res.status(400).json({ message: "Please select a valid Report Type." });
    }

    if (siteCategory && !["tower", "fiber"].includes(siteCategory)) {
      return res.status(400).json({ message: "Please select a valid report category." });
    }

    if (requestedCircleValue && !isValidCircle(requestedCircleValue)) {
      return res.status(400).json({ message: "Please select a valid Circle." });
    }

    if (!isAllCircle(req.authUser) && requestedCircleValue &&
      normalizeCircle(requestedCircleValue).toLowerCase() !==
        normalizeCircle(req.authUser.circle).toLowerCase()) {
      return res.status(403).json({ message: "You can only export records from your assigned Circle." });
    }

    const scopedToCircle = !isAllCircle(req.authUser);
    const circle = requestedCircleValue || (scopedToCircle ? req.authUser.circle : "");
    const circleClause = circle
      ? " AND LOWER(TRIM(circle)) = LOWER(TRIM(?))"
      : "";
    const circleParams = circle ? [circle] : [];

    // Report type/category live on the upload metadata rather than every
    // report-data row. EXISTS avoids duplicate rows when legacy metadata has
    // more than one entry for a file id.
    const metadataConditions = ["uploads.file_id = export_rows.file_id"];
    const metadataParams = [];
    if (reportType) {
      metadataConditions.push("uploads.report_type = ?");
      metadataParams.push(reportType);
    }
    if (siteCategory) {
      metadataConditions.push("LOWER(TRIM(uploads.site_category)) = ?");
      metadataParams.push(siteCategory);
    }
    const metadataClause = metadataParams.length
      ? ` AND EXISTS (SELECT 1 FROM report_uploads AS uploads WHERE ${metadataConditions.join(" AND ")})`
      : "";
    const exportWhereClause = `date BETWEEN ? AND ?${circleClause}${metadataClause}`;
    const exportParams = [fromDate, toDate, ...circleParams, ...metadataParams];

    // Counted before any header is written. Streaming first meant an empty
    // range produced a "successful" download of a workbook with one bare
    // column, and there was no way to say why it was empty.
    const [totals] = await query(
      `SELECT COUNT(*) AS total FROM ${tableName} AS export_rows WHERE ${exportWhereClause}`,
      exportParams
    );

    if (!Number(totals?.total || 0)) {
      const [available] = await query(
        `SELECT MIN(date) AS first_date, MAX(date) AS last_date
           FROM ${tableName} AS export_rows
          WHERE date IS NOT NULL${circleClause}${metadataClause}`,
        [...circleParams, ...metadataParams]
      );

      const firstDate = formatDateOnly(available?.first_date);
      const lastDate = formatDateOnly(available?.last_date);

      return res.status(404).json({
        message:
          `No ${String(siteType).toUpperCase()} records found between ` +
          `${fromDate} and ${toDate}` +
          (scopedToCircle ? ` for ${normalizeCircle(req.authUser.circle)}` : "") +
          `.\n\n` +
          (firstDate
            ? `${String(siteType).toUpperCase()} data is available from ${firstDate} to ${lastDate}. ` +
              `Pick a range inside those dates and try again.`
            : `No ${String(siteType).toUpperCase()} reports have been uploaded yet. ` +
              `Upload a report first, then export.`),
      });
    }

    // ExcelJS streams each row straight to the HTTP response as it commits, so
    // memory stays flat regardless of row count — required here because ENB
    // alone already exceeds a million rows in a single month.
    //
    // Headers (and the workbook itself) are only opened once the first row has
    // actually arrived from the database, in beginStreaming() below. That keeps
    // an early failure (e.g. the export connection could not be obtained)
    // reportable as clean JSON, while still getting the first byte to the
    // browser within a second or two of the COUNT query above — previously
    // the whole file was built on local disk before a single byte was sent,
    // so a large date range (100k+ rows) ran past Render/Cloudflare's ~100s
    // proxy timeout before the response ever started, and the browser reported
    // it as an unreachable server rather than a slow one. Once writing starts,
    // an error can only be reported by destroying the connection, never by
    // sending JSON/HTML into the .xlsx byte stream (see the catch block below).
    const downloadName = `${String(siteType).toUpperCase()} Report.xlsx`;

    let workbook;
    let worksheet;
    let columns;
    let rowsInWorksheet = 0;
    let worksheetNumber = 0;

    const startWorksheet = () => {
      worksheetNumber += 1;
      rowsInWorksheet = 0;
      const sheetName = worksheetNumber === 1
        ? String(siteType).toUpperCase()
        : `${String(siteType).toUpperCase()} ${worksheetNumber}`;
      worksheet = workbook.addWorksheet(sheetName);
      worksheet.columns = columns.map((key) => ({ header: key, key }));
    };

    const beginStreaming = () => {
      res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
      res.setHeader("Content-Type", xlsxMimeType);
      res.setHeader("Cache-Control", "no-store, no-transform");
      res.setHeader("X-Content-Type-Options", "nosniff");
      workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
        stream: res,
        useStyles: false,
        useSharedStrings: false,
      });
      startWorksheet();
    };

    const rows = streamBulkExportRows(
      `SELECT export_rows.*
         FROM ${tableName} AS export_rows
        WHERE ${exportWhereClause}
        ORDER BY export_rows.date ASC, export_rows.id ASC`,
      exportParams
    );

    try {
      for await (const row of rows) {
        if (res.destroyed) throw new Error("Client disconnected during export");

        if (!worksheet) {
          columns = Object.keys(row);
          beginStreaming();
        }

        // Finish the current sheet before adding a row beyond Excel's limit.
        if (rowsInWorksheet >= maxExcelDataRowsPerSheet) {
          worksheet.commit();
          startWorksheet();
        }

        // Replace null/undefined with empty string to avoid blank-value issues
        // and retain the previous export's YYYY-MM-DD date representation.
        const cleanRow = {};
        Object.keys(row).forEach((key) => {
          let val = row[key];
          if (val instanceof Date) {
            val = val.toISOString().slice(0, 10);
          }
          cleanRow[key] = val === undefined || val === null ? "" : val;
        });
        worksheet.addRow(cleanRow).commit();
        rowsInWorksheet += 1;
      }

      // The COUNT above guarantees rows exist, but a concurrent delete could
      // still empty the stream. Keep a valid workbook rather than a corrupt one.
      if (!worksheet) {
        columns = ["date"];
        beginStreaming();
      }

      worksheet.commit();
      await workbook.commit();
      return;
    } catch (innerErr) {
      // If headers already went out, the client is mid-download — the only way
      // to signal failure now is to cut the connection.
      console.error("Export stream error:", innerErr);
      if (!res.headersSent) {
        return res.status(500).json({
          message: "Unable to build the export file. Please try a shorter date range, or contact your administrator if the problem continues.",
        });
      }
      res.destroy(innerErr);
      return;
    }

  } catch (err) {

    console.error("Export error:", err);

    if (!res.headersSent) {
      res.status(500).json({
        message: "Unable to build the export file. Please try again, or contact your administrator if the problem continues.",
      });
    }

  }

});

router.delete("/:id", requirePagePermission("tower-reports", "delete"), async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid report reference." });
    }

    const rows = await query(
      "SELECT id, file_name, report_date, site_type, file_id FROM report_uploads WHERE id = ?",
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        message: "This report no longer exists. Please refresh the page.",
      });
    }

    if (!(await isUploadAccessible(rows[0], req.authUser, true))) {
      return res.status(403).json({ message: "You cannot delete another circle's data." });
    }

    // deleteUploadDataWith covers every table in reportDataTables, so site
    // types such as AG1/AG2/ILA/GSC/WIFI are cleaned up instead of being
    // orphaned. Run inside a transaction so a failure between the data-table
    // delete and the report_uploads delete can't leave one without the other.
    await withTransaction((run) => deleteUploadDataWith(run, rows[0]));

    res.json({ message: "Report deleted successfully." });

  } catch (err) {
    console.error("Delete report error:", err);
    res.status(500).json({
      message: "Unable to delete this report. Please try again, or contact your administrator if the problem continues.",
    });
  }
});

const VALID_REPORT_TYPES = ["Outage", "Performance"];

router.put("/:id", requirePagePermission("tower-reports", "edit"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid report reference." });
    }

    const { site_type, report_type, report_date } = req.body;

    const [existing] = await query(
      `SELECT id, site_type, file_id, report_date FROM report_uploads WHERE id = ? LIMIT 1`,
      [id]
    );

    if (!existing) {
      return res.status(404).json({
        message: "This report no longer exists. Please refresh the page.",
      });
    }
    if (!(await isUploadAccessible(existing, req.authUser, true))) {
      return res.status(403).json({ message: "You cannot edit another circle's data." });
    }

    // Site Type decides which table the uploaded rows physically live in.
    // Changing it here would leave the data stranded in the old table: download
    // would find nothing and delete would clean the wrong table. Reject it
    // rather than silently corrupting the record.
    if (site_type && normalizeSiteTypeValue(site_type) !== normalizeSiteTypeValue(existing.site_type)) {
      return res.status(400).json({
        message:
          "Site Type cannot be changed after upload.\n\n" +
          "The uploaded data is stored under the original Site Type. " +
          "To correct it, delete this report and upload the file again with the right Site Type.",
      });
    }

    if (!VALID_REPORT_TYPES.includes(report_type)) {
      return res.status(400).json({
        message: `Please select a valid Report Type (${VALID_REPORT_TYPES.join(" or ")}).`,
      });
    }

    const newReportDate = normalizeDate(report_date);
    if (!newReportDate || !/^\d{4}-\d{2}-\d{2}$/.test(newReportDate)) {
      return res.status(400).json({ message: "Please select a valid report date." });
    }

    // Defaults to the signed-in account, but the form field can override it.
    const uploadedByValue =
      String(req.body.uploaded_by || "").trim() ||
      req.authUser?.name || req.authUser?.username || req.authUser?.email || "Unknown user";

    const tableName = String(existing.site_type || "").toLowerCase();
    const fileId = Number(existing.file_id);
    const dateChanged =
      formatDateOnly(existing.report_date) !== newReportDate;

    // Metadata and the data rows carry the same report date, so they have to
    // move together or the record becomes inconsistent.
    await withTransaction(async (run) => {
      await run(
        `UPDATE report_uploads
            SET report_type = ?, uploaded_by = ?, report_date = ?
          WHERE id = ?`,
        [report_type, uploadedByValue, newReportDate, id]
      );

      if (dateChanged && reportDataTables.has(tableName) && Number.isFinite(fileId)) {
        await run(`UPDATE ${tableName} SET date = ? WHERE file_id = ?`, [newReportDate, fileId]);
      }
    });

    res.json({ message: "Report updated successfully." });
  } catch (err) {
    console.error("Update report error:", err);
    res.status(500).json({
      message: "Unable to update this report. Please try again, or contact your administrator if the problem continues.",
    });
  }
});

module.exports = router;
