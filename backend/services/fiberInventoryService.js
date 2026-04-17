const fs = require("fs");
const path = require("path");
const util = require("util");
const multer = require("multer");
const xlsx = require("xlsx");
const { db } = require("../config/db");

const query = util.promisify(db.query).bind(db);
const beginTransaction = util.promisify(db.beginTransaction).bind(db);
const commit = util.promisify(db.commit).bind(db);
const rollback = util.promisify(db.rollback).bind(db);

const uploadsDir = path.join(__dirname, "..", "uploads");
const allowedExtensions = new Set(["xlsx", "csv"]);

async function ensureColumn(table, column, definition) {
  try {
    await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (err) {
    if (err?.code !== "ER_DUP_FIELDNAME") {
      throw err;
    }
  }
}

async function ensureColumnDefinition(table, column, definition) {
  await query(`ALTER TABLE ${table} MODIFY COLUMN ${column} ${definition}`);
}

async function backfillFiberUploadScopes() {
  await query(`
    UPDATE fiber_uploads fu
    INNER JOIN (
      SELECT
        upload_id,
        CASE
          WHEN SUM(CASE WHEN fiber_type = 'Intercity' THEN 1 ELSE 0 END) > 0
            AND SUM(CASE WHEN fiber_type = 'Intracity' THEN 1 ELSE 0 END) > 0
            AND SUM(CASE WHEN fiber_type = 'FTTx' THEN 1 ELSE 0 END) = 0
          THEN 'Intercity+Intracity'
          WHEN COUNT(DISTINCT CASE
            WHEN fiber_type IN ('Intercity', 'Intracity', 'FTTx') THEN fiber_type
            ELSE NULL
          END) = 1
          THEN MAX(CASE
            WHEN fiber_type IN ('Intercity', 'Intracity', 'FTTx') THEN fiber_type
            ELSE NULL
          END)
          WHEN COUNT(DISTINCT CASE
            WHEN fiber_type IN ('Intercity', 'Intracity', 'FTTx') THEN fiber_type
            ELSE NULL
          END) > 1
          THEN 'Mixed'
          ELSE 'Unknown'
        END AS inferred_scope
      FROM fiber_inventory
      GROUP BY upload_id
    ) scopes ON scopes.upload_id = fu.id
    SET fu.upload_scope = scopes.inferred_scope
    WHERE fu.upload_scope IS NULL OR fu.upload_scope = ''
  `);
}

function ensureUploadsDir() {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
}

function buildStorage(prefix = "fiber") {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      ensureUploadsDir();
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${prefix}-${file.originalname}`);
    },
  });
}

const fiberUpload = multer({
  storage: buildStorage("fiber"),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = String(file.originalname || "").split(".").pop().toLowerCase();
    if (!allowedExtensions.has(ext)) {
      cb(new Error("Only .xlsx and .csv files are allowed."));
      return;
    }
    cb(null, true);
  },
});

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeDate(value) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    const parsed = xlsx.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.valueOf())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value).replace(/,/g, "").trim();
  if (!cleaned) return 0;
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundToTwo(value) {
  return Number(toNumber(value).toFixed(2));
}

function normalizeFiberType(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized.includes("intercity")) return "Intercity";
  if (normalized.includes("intracity")) return "Intracity";
  if (normalized.includes("fttx") || normalized.includes("ftth")) return "FTTx";

  return String(value || "").trim() || "Unknown";
}

function inferUploadScope(parsedRows) {
  const uniqueFiberTypes = Array.from(
    new Set(
      (parsedRows || [])
        .map((row) => normalizeFiberType(row?.fiberType))
        .filter((fiberType) => fiberType && fiberType !== "Unknown")
    )
  );

  if (!uniqueFiberTypes.length) return "Unknown";
  if (uniqueFiberTypes.length === 1) return uniqueFiberTypes[0];

  const hasIntercity = uniqueFiberTypes.includes("Intercity");
  const hasIntracity = uniqueFiberTypes.includes("Intracity");
  const hasFttx = uniqueFiberTypes.includes("FTTx");

  if (hasIntercity && hasIntracity && !hasFttx) {
    return "Intercity+Intracity";
  }

  return "Mixed";
}

const UG_HEADER_PATTERNS = [
  /^ug$/,
  /^ug_/,
  /_ug$/,
  /^underground$/,
  /^underground_/,
  /_underground$/,
  /(^|_)ug(_|$)/,

  // 🔥 ADD THESE
  /ug/,
  /hoto/,
  /ug.*km/,
];

const AERIAL_HEADER_PATTERNS = [
  /^aerial$/,
  /^aerial_/,
  /_aerial$/,
  /^overhead$/,
  /^over_head$/,
  /^oh$/,
  /^oh_/,
  /_oh$/,
  /(^|_)aerial(_|$)/,

  // 🔥 ADD THESE (IMPORTANT)
  /aerial/,
  /final.*aerial/,
  /aerial.*km/,
  /aerial.*kms/,
];

const FIBER_TYPE_HEADER_CANDIDATES = [
  "fiber_type",
  "n_w",
  "n__w",
  "nw",
  "network",
  "network_type",
  "type",
  "category",
];

function isHotoHeader(header) {
  return String(header || "").includes("hoto");
}

function pickFirst(cleanRow, candidates) {
  for (const candidate of candidates) {
    if (Object.prototype.hasOwnProperty.call(cleanRow, candidate)) {
      return cleanRow[candidate];
    }
  }
  return "";
}

function collectNormalizedHeaders(rows) {
  const normalizedHeaders = new Set();

  rows.forEach((row) => {
    Object.keys(row || {}).forEach((key) => {
      const normalized = normalizeKey(key);
      if (normalized) {
        normalizedHeaders.add(normalized);
      }
    });
  });

  return Array.from(normalizedHeaders);
}

function findColumnKey(headers, patterns) {
  return headers.find((header) => patterns.some((pattern) => pattern.test(header))) || null;
}

function scoreHeader(header, type) {
  if (!header) return -1;

  let score = 0;

  if (type === "ug") {
    if (/(^|_)ug(_|$)/.test(header)) score += 5;
    if (header.includes("underground")) score += 4;
    if (header.includes("hoto")) score += 3;
    if (header.includes("km")) score += 1;
  }

  if (type === "aerial") {
    if (/(^|_)aerial(_|$)/.test(header)) score += 5;
    if (header.includes("overhead") || header.includes("over_head")) score += 4;
    if (header.includes("final")) score += 2;
    if (header.includes("billing")) score += 2;
    if (header === "aerial" || header === "sum_of_aerial") score += 6;
    if (header.includes("sum_of_aerial")) score += 4;
    if (isHotoHeader(header)) score -= 10;
    if (header.includes("km")) score += 1;
  }

  if (header.includes("sum_of")) score += 1;

  return score;
}

function findBestColumnKey(headers, patterns, type) {
  const matches = headers.filter((header) =>
    patterns.some((pattern) => pattern.test(header))
  );

  if (!matches.length) return null;

  return matches.sort((a, b) => scoreHeader(b, type) - scoreHeader(a, type))[0];
}

function makeUniqueHeaderKey(value, index, usedHeaders) {
  const baseKey = normalizeKey(value) || `empty_${index}`;

  if (!usedHeaders.has(baseKey)) {
    usedHeaders.add(baseKey);
    return baseKey;
  }

  let suffix = 1;
  let candidate = `${baseKey}_${suffix}`;
  while (usedHeaders.has(candidate)) {
    suffix += 1;
    candidate = `${baseKey}_${suffix}`;
  }

  usedHeaders.add(candidate);
  return candidate;
}

function scoreHeaderCandidate(headerValues) {
  const usedHeaders = new Set();
  const normalizedHeaders = headerValues.map((value, index) =>
    makeUniqueHeaderKey(value, index, usedHeaders)
  );
  const nonEmptyCount = headerValues.filter((value) => String(value || "").trim()).length;
  const ugKey = findBestColumnKey(normalizedHeaders, UG_HEADER_PATTERNS, "ug");
  const aerialKey = findBestColumnKey(normalizedHeaders, AERIAL_HEADER_PATTERNS, "aerial");

  let score = nonEmptyCount;
  if (ugKey) score += 20 + scoreHeader(ugKey, "ug");
  if (aerialKey) score += 20 + scoreHeader(aerialKey, "aerial");

  return {
    normalizedHeaders,
    nonEmptyCount,
    ugKey,
    aerialKey,
    score,
  };
}

function buildRowsFromMatrix(matrix, headerRowIndex) {
  const headerValues = matrix[headerRowIndex] || [];
  const usedHeaders = new Set();
  const headers = headerValues.map((value, index) =>
    makeUniqueHeaderKey(value, index, usedHeaders)
  );

  return matrix
    .slice(headerRowIndex + 1)
    .map((cells, index) => {
      const row = {};

      headers.forEach((header, cellIndex) => {
        row[header] = cells?.[cellIndex] ?? "";
      });

      Object.defineProperty(row, "__sourceRowNumber", {
        value: headerRowIndex + index + 2,
        enumerable: false,
      });

      return row;
    })
    .filter((row) =>
      Object.values(row).some((value) => String(value ?? "").trim() !== "")
    );
}

function detectHeaderRowIndex(matrix) {
  const candidateLimit = Math.min(matrix.length, 25);
  let bestCandidate = null;

  for (let index = 0; index < candidateLimit; index += 1) {
    const candidate = scoreHeaderCandidate(matrix[index] || []);

    if (!bestCandidate || candidate.score > bestCandidate.score) {
      bestCandidate = { ...candidate, index };
    }
  }

  if (!bestCandidate || !bestCandidate.ugKey || !bestCandidate.aerialKey) {
    const preview = matrix.slice(0, candidateLimit).map((row, index) => ({
      rowNumber: index + 1,
      values: row,
    }));

    console.error("Fiber upload header row detection failed:", preview);

    const error = new Error(
      "Invalid fiber file format. Could not locate a header row containing UG and Aerial columns."
    );
    error.statusCode = 400;
    throw error;
  }

  console.log("Fiber upload detected header row:", {
    rowNumber: bestCandidate.index + 1,
    headers: bestCandidate.normalizedHeaders,
    ugKey: bestCandidate.ugKey,
    aerialKey: bestCandidate.aerialKey,
  });

  return bestCandidate.index;
}

function resolveFiberColumnMap(rows) {
  const headers = collectNormalizedHeaders(rows);
  const ugKey = findBestColumnKey(headers, UG_HEADER_PATTERNS, "ug");
  const aerialKey = findBestColumnKey(headers, AERIAL_HEADER_PATTERNS, "aerial");
  const fiberTypeKey =
    FIBER_TYPE_HEADER_CANDIDATES.find((candidate) => headers.includes(candidate)) || null;

  return {
    headers,
    ugKey,
    aerialKey,
    fiberTypeKey,
  };
}

async function ensureFiberTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS fiber_uploads (
      id INT AUTO_INCREMENT PRIMARY KEY,
      date DATE NOT NULL,
      uploaded_by VARCHAR(150) NOT NULL,
      upload_scope VARCHAR(50) NULL,
      file_name VARCHAR(255) NOT NULL,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS fiber_inventory (
      id INT AUTO_INCREMENT PRIMARY KEY,
      upload_id INT NULL,
      fiber_type VARCHAR(50) NULL,
      span_type VARCHAR(50) NULL,
      cmm_appd DECIMAL(18,4) DEFAULT 0,
      ug DECIMAL(18,4) DEFAULT 0,
      aerial DECIMAL(18,4) DEFAULT 0,
      raw_row LONGTEXT NULL,
      source_row_number INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn("fiber_inventory", "upload_id", "INT NULL");
  await ensureColumn("fiber_inventory", "fiber_type", "VARCHAR(50) NULL");
  await ensureColumn("fiber_inventory", "span_type", "VARCHAR(50) NULL");
  await ensureColumn("fiber_inventory", "cmm_appd", "DECIMAL(18,4) DEFAULT 0");
  await ensureColumn("fiber_inventory", "ug", "DECIMAL(18,4) DEFAULT 0");
  await ensureColumn("fiber_inventory", "aerial", "DECIMAL(18,4) DEFAULT 0");
  await ensureColumn("fiber_inventory", "raw_row", "LONGTEXT NULL");
  await ensureColumn("fiber_inventory", "source_row_number", "INT NULL");
  await ensureColumn("fiber_uploads", "upload_scope", "VARCHAR(50) NULL");
  await ensureColumn(
    "fiber_inventory",
    "created_at",
    "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
  );
  await ensureColumnDefinition(
    "fiber_inventory",
    "cmm_appd",
    "DECIMAL(18,4) DEFAULT 0"
  );
  await ensureColumnDefinition(
    "fiber_inventory",
    "ug",
    "DECIMAL(18,4) DEFAULT 0"
  );
  await ensureColumnDefinition(
    "fiber_inventory",
    "aerial",
    "DECIMAL(18,4) DEFAULT 0"
  );
  await backfillFiberUploadScopes();
}

function readWorksheetRows(filePath) {
  const workbook = xlsx.readFile(filePath, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const matrix = xlsx.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false,
  });

  if (!matrix.length) {
    const error = new Error("No rows found in uploaded file.");
    error.statusCode = 400;
    throw error;
  }

  const headerRowIndex = detectHeaderRowIndex(matrix);
  const rows = buildRowsFromMatrix(matrix, headerRowIndex);

  if (!rows.length) {
    const error = new Error("No data rows found below the detected header row.");
    error.statusCode = 400;
    throw error;
  }

  return rows;
}

function validateFiberRows(rows) {
  const { headers, ugKey, aerialKey, fiberTypeKey } = resolveFiberColumnMap(rows);

  if (!ugKey || !aerialKey) {
    console.error("Fiber upload header detection failed:", {
      headers,
      ugKey,
      aerialKey,
      fiberTypeKey,
    });

    const error = new Error(
      `Invalid fiber file format. Could not detect UG/Aerial columns. Headers found: ${headers.join(", ")}`
    );
    error.statusCode = 400;
    throw error;
  }

  return { ugKey, aerialKey, fiberTypeKey, headers };
}

function parseFiberRows(rows) {
  const { ugKey, aerialKey, fiberTypeKey, headers } = validateFiberRows(rows);
  console.log("Fiber upload detected headers:", headers);
  console.log("Fiber upload mapped columns:", { fiberTypeKey, ugKey, aerialKey });
  const parsedRows = [];

  rows.forEach((row, index) => {
    const cleanRow = {};
    Object.keys(row || {}).forEach((key) => {
      cleanRow[normalizeKey(key)] = row[key];
    });

    const rawFiberType = fiberTypeKey ? cleanRow[fiberTypeKey] : "";
    const fiberType = normalizeFiberType(rawFiberType || "FTTx");

    const cmmAppd = toNumber(
      pickFirst(cleanRow, ["cmm_appd", "cmm_approved", "cmm", "cmm_app"])
    );
    const ug = toNumber(cleanRow[ugKey]);
    const aerial = toNumber(cleanRow[aerialKey]);

    parsedRows.push({
      fiberType,
      spanType: null,
      cmmAppd,
      ug,
      aerial,
      rawRow: JSON.stringify(row || {}),
      sourceRowNumber: row.__sourceRowNumber || index + 2,
    });
  });

  return parsedRows;
}

async function createFiberUpload({ date, uploadedBy, fileName, rows }) {
  await ensureFiberTables();

  const normalizedDate = normalizeDate(date);
  if (!normalizedDate) {
    const error = new Error("A valid Date is required.");
    error.statusCode = 400;
    throw error;
  }

  const cleanUploadedBy = String(uploadedBy || "").trim();
  if (!cleanUploadedBy) {
    const error = new Error("Uploaded By is required.");
    error.statusCode = 400;
    throw error;
  }

  if (!fileName) {
    const error = new Error("File name is required.");
    error.statusCode = 400;
    throw error;
  }

  const parsedRows = parseFiberRows(rows);
  const uploadScope = inferUploadScope(parsedRows);

  await beginTransaction();
  try {
    const uploadResult = await query(
      `INSERT INTO fiber_uploads (date, uploaded_by, upload_scope, file_name) VALUES (?, ?, ?, ?)`,
      [normalizedDate, cleanUploadedBy, uploadScope, fileName]
    );

    const uploadId = uploadResult.insertId;
    if (parsedRows.length) {
      const values = parsedRows.map((item) => [
        uploadId,
        item.fiberType,
        item.spanType,
        item.cmmAppd,
        item.ug,
        item.aerial,
        item.rawRow,
        item.sourceRowNumber,
      ]);

      await query(
        `INSERT INTO fiber_inventory
          (upload_id, fiber_type, span_type, cmm_appd, ug, aerial, raw_row, source_row_number)
         VALUES ?`,
        [values]
      );
    }

    await commit();
    return uploadId;
  } catch (err) {
    await rollback();
    throw err;
  }
}

async function getLatestFiberUpload() {
  await ensureFiberTables();
  const rows = await query(
    `SELECT id, date, uploaded_by, upload_scope, file_name, uploaded_at
     FROM fiber_uploads
     ORDER BY date DESC, uploaded_at DESC, id DESC
     LIMIT 1`
  );
  return rows[0] || null;
}

async function getAllFiberUploads() {
  await ensureFiberTables();
  return query(
    `SELECT id, date, uploaded_by, upload_scope, file_name, uploaded_at
     FROM fiber_uploads
     ORDER BY date DESC, uploaded_at DESC, id DESC`
  );
}

async function getFiberUploadById(id) {
  await ensureFiberTables();
  const rows = await query(
    `SELECT id, date, uploaded_by, upload_scope, file_name, uploaded_at
     FROM fiber_uploads
     WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function getLatestFiberSummary() {
  await ensureFiberTables();
  const latestUpload = await getLatestFiberUpload();

  const rows = await query(
    `SELECT
       fi.fiber_type AS fiberType,
       fu.id AS uploadId,
       fu.date,
       fu.uploaded_by AS uploadedBy,
       fu.upload_scope AS uploadScope,
       fu.file_name AS fileName,
       fu.uploaded_at AS uploadedAt,
       COALESCE(SUM(fi.aerial), 0) AS aerial,
       COALESCE(SUM(fi.ug), 0) AS ug
     FROM fiber_inventory fi
     INNER JOIN fiber_uploads fu ON fu.id = fi.upload_id
     WHERE fi.fiber_type IN ('Intercity', 'Intracity', 'FTTx')
       AND fi.upload_id = (
         SELECT fi2.upload_id
         FROM fiber_inventory fi2
         INNER JOIN fiber_uploads fu2 ON fu2.id = fi2.upload_id
         WHERE fi2.fiber_type = fi.fiber_type
         ORDER BY fu2.date DESC, fu2.uploaded_at DESC, fi2.upload_id DESC
         LIMIT 1
       )
     GROUP BY
       fi.fiber_type,
       fu.id,
       fu.date,
       fu.uploaded_by,
       fu.upload_scope,
       fu.file_name,
       fu.uploaded_at`
  );

  const result = {
    Intercity: { aerial: 0, ug: 0, latestUpload: null },
    Intracity: { aerial: 0, ug: 0, latestUpload: null },
    FTTx: { aerial: 0, ug: 0, latestUpload: null },
  };

  rows.forEach((row) => {
    const key = normalizeFiberType(row.fiberType);
    if (!result[key]) return;

    result[key] = {
      aerial: roundToTwo(row.aerial),
      ug: roundToTwo(row.ug),
      latestUpload: {
        id: row.uploadId,
        date: row.date,
        uploaded_by: row.uploadedBy,
        upload_scope: row.uploadScope,
        file_name: row.fileName,
        uploaded_at: row.uploadedAt,
      },
    };
  });

  return {
    latestUpload,
    latestUploadsByFiberType: Object.keys(result).reduce((acc, fiberType) => {
      acc[fiberType] = result[fiberType].latestUpload || null;
      return acc;
    }, {}),
    cards: Object.keys(result).map((k) => ({
      fiberType: k,
      aerial: result[k].aerial,
      ug: result[k].ug,
      latestUpload: result[k].latestUpload,
    })),
  };
}

async function getLatestFiberInventoryRows() {
  const latestUpload = await getLatestFiberUpload();
  if (!latestUpload) {
    return [];
  }

  return query(
    `SELECT
       fi.id,
       fu.id AS uploadId,
       fu.date,
       fu.uploaded_by AS uploadedBy,
       fu.file_name AS fileName,
       fu.uploaded_at AS uploadedAt,
       fi.fiber_type AS fiberType,
       fi.span_type AS spanType,
       fi.cmm_appd AS cmmAppd,
       fi.ug,
       fi.aerial,
       fi.source_row_number AS sourceRowNumber
     FROM fiber_inventory fi
     INNER JOIN fiber_uploads fu ON fu.id = fi.upload_id
     WHERE fi.upload_id = ?
     ORDER BY fi.source_row_number ASC, fi.id ASC`,
    [latestUpload.id]
  );
}

async function updateFiberUpload(id, { date, uploadedBy }) {
  await ensureFiberTables();
  const normalizedDate = normalizeDate(date);
  const cleanUploadedBy = String(uploadedBy || "").trim();

  if (!normalizedDate) {
    const error = new Error("A valid Date is required.");
    error.statusCode = 400;
    throw error;
  }

  if (!cleanUploadedBy) {
    const error = new Error("Uploaded By is required.");
    error.statusCode = 400;
    throw error;
  }

  await query(
    `UPDATE fiber_uploads
     SET date = ?, uploaded_by = ?
     WHERE id = ?`,
    [normalizedDate, cleanUploadedBy, id]
  );
}

async function deleteFiberUpload(id) {
  await ensureFiberTables();
  const upload = await getFiberUploadById(id);
  if (!upload) {
    const error = new Error("Upload not found.");
    error.statusCode = 404;
    throw error;
  }

  const filePath = path.join(uploadsDir, upload.file_name);

  await beginTransaction();
  try {
    await query(`DELETE FROM fiber_inventory WHERE upload_id = ?`, [id]);
    await query(`DELETE FROM fiber_uploads WHERE id = ?`, [id]);
    await commit();
  } catch (err) {
    await rollback();
    throw err;
  }

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

const archiver = require("archiver");

async function downloadZip(req, res) {
  try {
    const { ids } = req.body;

    if (!ids || !ids.length) {
      return res.status(400).json({ message: "No files selected" });
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=fiber-files.zip");

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    for (const id of ids) {
      const rows = await query(
        `SELECT file_name FROM fiber_uploads WHERE id = ?`,
        [id]
      );

      if (rows.length) {
        const fileName = rows[0].file_name;
        const filePath = path.join(uploadsDir, fileName);

        if (fs.existsSync(filePath)) {
          archive.file(filePath, { name: fileName });
        }
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "ZIP creation failed" });
  }
}

module.exports = {
  ensureFiberTables,
  ensureUploadsDir,
  fiberUpload,
  readWorksheetRows,
  createFiberUpload,
  getAllFiberUploads,
  getLatestFiberUpload,
  getFiberUploadById,
  getLatestFiberSummary,
  getLatestFiberInventoryRows,
  updateFiberUpload,
  deleteFiberUpload,
  uploadsDir,
  downloadZip,
};
