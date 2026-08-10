const fs = require("fs");
const path = require("path");
const multer = require("multer");
const xlsx = require("xlsx");
const { db } = require("../config/db");
const {
  addCircleFilter,
  assertRowsAllowedCircle,
  isAllCircle,
} = require("../middleware/circleAccess");
const { resolveCircle, resolveCmp, CIRCLES, CIRCLE_CMP_MAP } = require("../constants/circles");

const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) {
        if (err.code !== "ER_DUP_FIELDNAME") {
          console.error("❌ Query Error:", err);
        }
        return reject(err);
      }
      resolve(results);
    });
  });
};

const getConnection = () => {
  return new Promise((resolve, reject) => {
    db.getConnection((err, conn) => {
      if (err) return reject(err);
      resolve(conn);
    });
  });
};

function appendFiberCircleFilter(filters, params, authUser, column = "fi.circle") {
  addCircleFilter(filters, params, authUser, column);
}

const uploadsDir = path.join(__dirname, "..", "uploads");
const allowedExtensions = new Set(["xlsx", "csv"]);

async function ensureColumn(table, column, definition) {
  const exists = await query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = ?
    AND COLUMN_NAME = ?
  `, [table, column]);

  if (exists.length === 0) {
    await query(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
    );
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

// ensureFiberTables() ran on every single request to almost every fiber
// route (summary, uploads list, latest-dataset, download, upload, edit,
// delete) — including 8 information_schema lookups, 3 unconditional
// ALTER TABLE MODIFY COLUMN statements, and a full-table UPDATE...INNER
// JOIN backfill that re-aggregates the *entire* fiber_inventory history
// (GROUP BY upload_id) on every call. New uploads already set upload_scope
// directly at insert time (see createFiberUpload), so nothing after the
// very first run of this per server start ever has real work to do. Same
// "run once, cache the promise" fix already applied to nsoRoutes.js and
// reportRoutes.js.
let ensureFiberTablesPromise = null;
async function ensureFiberTables() {
  if (!ensureFiberTablesPromise) {
    ensureFiberTablesPromise = ensureFiberTablesOnce().catch((error) => {
      ensureFiberTablesPromise = null;
      throw error;
    });
  }
  return ensureFiberTablesPromise;
}

async function ensureFiberTablesOnce() {
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
  // mp_code, mp, circle_code, and month are present in real uploaded files
  // (see raw_row) but were parsed and then dropped before ever reaching a
  // column — this is the fix.
  await ensureColumn("fiber_inventory", "mp_code", "VARCHAR(100) NULL");
  await ensureColumn("fiber_inventory", "mp", "VARCHAR(100) NULL");
  await ensureColumn("fiber_inventory", "circle_code", "VARCHAR(50) NULL");
  await ensureColumn("fiber_inventory", "month", "VARCHAR(20) NULL");
  // FTTx files use a different column layout than Fiber (Intercity/Intracity)
  // files — these five are FTTx-specific and had no column to land in at all.
  await ensureColumn("fiber_inventory", "rj_mainten", "VARCHAR(100) NULL");
  await ensureColumn("fiber_inventory", "rj_fsa_id", "VARCHAR(100) NULL");
  await ensureColumn("fiber_inventory", "aerial_hoto_km", "DECIMAL(18,4) DEFAULT 0");
  await ensureColumn("fiber_inventory", "mdu_km", "DECIMAL(18,4) DEFAULT 0");
  await ensureColumn("fiber_inventory", "total_kms_for_billing", "DECIMAL(18,4) DEFAULT 0");
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

const spanType =
  cleanRow["span_type"] ||
  cleanRow["spantype"] ||
  "";

parsedRows.push({
  circle: cleanRow["circle"] || "",
  // Real files carry both "Circle" (full name) and "CIRCLE" (short code) as
  // separate columns. Both normalize to "circle", so buildRowsFromMatrix's
  // duplicate-header handling disambiguates the second one as "circle_1" —
  // this assumes Circle (full name) is always the first of the pair and
  // CIRCLE (code) the second, matching every real file seen so far.
  circleCode: cleanRow["circle_1"] || "",
  cmp: cleanRow["cmp"] || "",
  // Was hardcoded to the literal key "n_w" — went blank on any file whose
  // network/category header normalized to something else (e.g. "Network",
  // "Type", "Category"), even though fiber_type (just above) already
  // resolves the same header dynamically via fiberTypeKey. Reuse it here too.
  network: (fiberTypeKey ? cleanRow[fiberTypeKey] : "") || "",
  fiber: cleanRow["fiber"] || "",
  status: cleanRow["status"] || "",
  spanLinkId: cleanRow["span_link_id"] || "",
  spName: cleanRow["sp_name"] || "",
  patrollingStatus: cleanRow["patrolling_status"] || "",
  routeStatus: cleanRow["route_status"] || "",
  // "MP" (short/raw code) and "MP Code" (full formatted code) are two
  // distinct columns in real files — normalizeKey gives them different keys
  // ("mp" vs "mp_code") so no disambiguation suffix is needed here.
  mp: cleanRow["mp"] || "",
  mpCode: cleanRow["mp_code"] || "",
  month: cleanRow["month"] || "",
  // FTTx-only columns. "aerial_hoto_km" is a distinct measurement from the
  // plain "aerial" column above — the aerial-key scoring already excludes
  // HOTO-labeled headers from being picked as the main aerialKey (see
  // scoreHeader), so this reads it separately rather than relying on that.
  rjMainten: cleanRow["rj_mainten"] || "",
  rjFsaId: cleanRow["rj_fsa_id"] || "",
  aerialHotoKm: toNumber(cleanRow["aerial_hoto_km"]),
  mduKm: toNumber(cleanRow["mdu_km"]),
  totalKmsForBilling: toNumber(cleanRow["total_kms_for_billing"]),

  fiberType,
  spanType,
  cmmAppd,
  ug,
  aerial,
  rawRow: JSON.stringify(row || {}),
  sourceRowNumber: row.__sourceRowNumber || index + 2,
});
  });

  return parsedRows;
}

async function createFiberUpload({ date, uploadedBy, fileName, rows, authUser }) {

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

  const allParsedRows = parseFiberRows(rows);

  // Circle/CMP name validation against the same approved master list used by
  // Physical and New Joining (backend/constants/circles.js). resolveCircle/
  // resolveCmp accept real-world spelling/formatting variants (case, spacing,
  // punctuation, known aliases) — "accept any typed form that's actually
  // recognizable" — but a genuinely unrecognized name doesn't silently pass
  // through as free text. A row with a bad Circle or CMP/MP is skipped (not
  // the whole file) and reported back as a warning, mirroring how Physical's
  // bulk upload already handles this exact situation. CMP is checked against
  // whichever of `cmp` or `mp` the file actually populated — Fiber and FTTx
  // files don't both carry the same columns, and a format with neither
  // (e.g. this FTTx layout) isn't held to a validation it was never meant to
  // satisfy.
  const circleCmpWarnings = [];
  const parsedRows = [];
  allParsedRows.forEach((row) => {
    const resolvedCircle = resolveCircle(row.circle);
    if (!resolvedCircle) {
      circleCmpWarnings.push({
        row: row.sourceRowNumber,
        column: "Circle",
        currentValue: row.circle,
        error: `Invalid Circle: ${row.circle || "(blank)"}`,
        expected: CIRCLES,
        howToFix: "Use a valid circle name.",
      });
      return;
    }

    const cmpInput = row.cmp || row.mp;
    let resolvedCmpValue = null;
    if (cmpInput) {
      resolvedCmpValue = resolveCmp(resolvedCircle, cmpInput);
      if (!resolvedCmpValue) {
        circleCmpWarnings.push({
          row: row.sourceRowNumber,
          column: row.cmp ? "CMP" : "MP",
          currentValue: cmpInput,
          error: `Invalid CMP "${cmpInput}" for Circle "${resolvedCircle}"`,
          expected: CIRCLE_CMP_MAP[resolvedCircle],
          howToFix: `Use a valid CMP for circle "${resolvedCircle}".`,
        });
        return;
      }
    }

    parsedRows.push({
      ...row,
      circle: resolvedCircle,
      cmp: row.cmp ? resolvedCmpValue : row.cmp,
      mp: row.mp ? resolvedCmpValue : row.mp,
    });
  });

  assertRowsAllowedCircle(authUser, parsedRows, (row) => row.circle);
  const uploadScope = inferUploadScope(parsedRows);

 const conn = await getConnection();

try {
 await new Promise((resolve, reject) => {
  conn.beginTransaction((err) => {
    if (err) return reject(err);
    resolve();
  });
});

  const uploadResult = await new Promise((resolve, reject) => {
    conn.query(
      `INSERT INTO fiber_uploads (date, uploaded_by, upload_scope, file_name) VALUES (?, ?, ?, ?)`,
      [normalizedDate, cleanUploadedBy, uploadScope, fileName],
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
  });

  const uploadId = uploadResult.insertId;

  if (parsedRows.length) {
   const values = parsedRows.map((item) => [
  uploadId,
  item.circle,
  item.circleCode,
  item.cmp,
  item.network,
  item.status,
  item.spanLinkId,
  item.spName,
  item.patrollingStatus,
  item.routeStatus,
  item.fiber,
  item.mp,
  item.mpCode,
  item.month,
  item.fiberType,
  item.spanType,
  item.cmmAppd,
  item.ug,
  item.aerial,
  item.rjMainten,
  item.rjFsaId,
  item.aerialHotoKm,
  item.mduKm,
  item.totalKmsForBilling,
  item.rawRow,
  item.sourceRowNumber,
]);

    await new Promise((resolve, reject) => {
      conn.query(
        `INSERT INTO fiber_inventory
(
 upload_id,
 circle,
 circle_code,
 cmp,
 network,
 status,
 span_link_id,
 sp_name,
 patrolling_status,
 route_status,
 fiber,
 mp,
 mp_code,
 month,
 fiber_type,
 span_type,
 cmm_appd,
 ug,
 aerial,
 rj_mainten,
 rj_fsa_id,
 aerial_hoto_km,
 mdu_km,
 total_kms_for_billing,
 raw_row,
 source_row_number
)
VALUES ?`,
        [values],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  }

  await new Promise((resolve, reject) => {
  conn.commit((err) => {
    if (err) return reject(err);
    resolve();
  });
});
  conn.release();

  return {
    uploadId,
    totalRows: allParsedRows.length,
    insertedRows: parsedRows.length,
    skippedCircleCmp: circleCmpWarnings.length,
    circleCmpWarnings,
  };

} catch (err) {
  await new Promise((resolve) => {
  conn.rollback(() => resolve());
});
  conn.release();
  throw err;
}

}

async function getLatestFiberUpload(authUser) {
  const filters = [];
  const params = [];
  appendFiberCircleFilter(filters, params, authUser, "fi.circle");

  const rows = await query(
    `SELECT id, date, uploaded_by, upload_scope, file_name, uploaded_at
     FROM fiber_uploads
     ${
       filters.length
         ? `WHERE EXISTS (SELECT 1 FROM fiber_inventory fi WHERE fi.upload_id = fiber_uploads.id AND ${filters.join(" AND ")})`
         : ""
     }
     ORDER BY date DESC, uploaded_at DESC, id DESC
     LIMIT 1`,
    params
  );
  return rows[0] || null;
}

async function getAllFiberUploads(authUser) {
  const filters = [];
  const params = [];
  appendFiberCircleFilter(filters, params, authUser, "fi.circle");

  const rows = await query(
    `SELECT id, date, uploaded_by, upload_scope, file_name, uploaded_at
     FROM fiber_uploads
     ${
       filters.length
         ? `WHERE EXISTS (SELECT 1 FROM fiber_inventory fi WHERE fi.upload_id = fiber_uploads.id AND ${filters.join(" AND ")})`
         : ""
     }
     ORDER BY date DESC, uploaded_at DESC, id DESC`,
    params
  );
  return rows.map((row) => ({
    ...row,
    file_missing: !row.file_name || !fs.existsSync(path.join(uploadsDir, row.file_name || "")),
  }));
}

async function getFiberUploadById(id, authUser) {
  const filters = [];
  const params = [id];
  appendFiberCircleFilter(filters, params, authUser, "fi.circle");

  const rows = await query(
    `SELECT id, date, uploaded_by, upload_scope, file_name, uploaded_at
     FROM fiber_uploads
     WHERE id = ?
     ${
       filters.length
         ? `AND EXISTS (SELECT 1 FROM fiber_inventory fi WHERE fi.upload_id = fiber_uploads.id AND ${filters.join(" AND ")})`
         : ""
     }`,
    params
  );
  return rows[0] || null;
}

async function getFiberRowsByUploadId(uploadId, authUser) {
  const filters = ["upload_id = ?"];
  const params = [uploadId];
  appendFiberCircleFilter(filters, params, authUser, "circle");

  // Every column actually stored per row — the download previously only
  // selected 5 of these, so the exported file silently dropped circle, cmp,
  // span/link id, SP name, status, route status, fiber ownership and mp_code
  // even though all of it was sitting in the table.
  return await query(
    `SELECT
      circle,
      circle_code,
      cmp,
      network,
      status,
      span_link_id,
      sp_name,
      patrolling_status,
      route_status,
      fiber,
      mp,
      mp_code,
      month,
      fiber_type,
      span_type,
      cmm_appd,
      ug,
      aerial,
      rj_mainten,
      rj_fsa_id,
      aerial_hoto_km,
      mdu_km,
      total_kms_for_billing,
      source_row_number
     FROM fiber_inventory
     WHERE ${filters.join(" AND ")}
     ORDER BY source_row_number ASC`,
    params
  );
}

// `options.circles` is an optional circle selection (e.g. the Dashboard's
// circle filter). It is layered on top of the caller's own circle permission
// as an intersection, so it can only ever narrow what a user may see.
async function getLatestFiberSummary(authUser, options = {}) {
  const latestUpload = await getLatestFiberUpload(authUser);
  const filters = [];
  const params = [];
  appendFiberCircleFilter(filters, params, authUser, "fi.circle");

  const selectedCircles = (options.circles || [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  if (selectedCircles.length) {
    filters.push(
      `LOWER(TRIM(fi.circle)) IN (${selectedCircles.map(() => "?").join(",")})`
    );
    params.push(...selectedCircles.map((value) => value.toLowerCase()));
  }

  const scopedCircleSql = filters.length ? `AND ${filters.join(" AND ")}` : "";

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
       ${scopedCircleSql}
       AND fi.upload_id = (
         SELECT fi2.upload_id
         FROM fiber_inventory fi2
         INNER JOIN fiber_uploads fu2 ON fu2.id = fi2.upload_id
         WHERE fi2.fiber_type = fi.fiber_type
           ${isAllCircle(authUser) ? "" : "AND LOWER(TRIM(fi2.circle)) = LOWER(TRIM(?))"}
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
       fu.uploaded_at`,
    isAllCircle(authUser) ? params : [...params, authUser.circle]
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

async function getLatestFiberInventoryRows(authUser) {
  const latestUpload = await getLatestFiberUpload(authUser);
  if (!latestUpload) {
    return [];
  }

  const filters = ["fi.upload_id = ?"];
  const params = [latestUpload.id];
  appendFiberCircleFilter(filters, params, authUser, "fi.circle");

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
     WHERE ${filters.join(" AND ")}
     ORDER BY fi.source_row_number ASC, fi.id ASC`,
    params
  );
}

async function updateFiberUpload(id, { date, uploadedBy }, authUser) {
  const upload = await getFiberUploadById(id, authUser);
  if (!upload) {
    const error = new Error("Upload not found.");
    error.statusCode = 404;
    throw error;
  }

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

async function deleteFiberUpload(id, authUser) {
  const upload = await getFiberUploadById(id, authUser);
  if (!upload) {
    const error = new Error("Upload not found.");
    error.statusCode = 404;
    throw error;
  }

  const filePath = path.join(uploadsDir, upload.file_name);

  await query(
  `DELETE FROM fiber_inventory WHERE upload_id = ?`,
  [id]
);

await query(
  `DELETE FROM fiber_uploads WHERE id = ?`,
  [id]
);

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
        `SELECT file_name
         FROM fiber_uploads fu
         WHERE fu.id = ?
         ${
           isAllCircle(req.authUser)
             ? ""
             : "AND EXISTS (SELECT 1 FROM fiber_inventory fi WHERE fi.upload_id = fu.id AND LOWER(TRIM(fi.circle)) = LOWER(TRIM(?)))"
         }`,
        isAllCircle(req.authUser) ? [id] : [id, req.authUser.circle]
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
  getFiberRowsByUploadId,
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
