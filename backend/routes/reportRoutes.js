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
} = require("../middleware/circleAccess");

router.use(authMiddleware);


// ✅ Storage config
const storage = multer.memoryStorage();

const allowedExtensions = new Set(["xlsx", "xls", "xlsb", "csv"]);
const upload = multer({
  storage,
  limits: { fileSize: 150 * 1024 * 1024 },
});

const uploadAnyReportFiles = upload.fields([
  { name: "file", maxCount: 100 },
  { name: "files", maxCount: 100 },
]);

const getUploadedReportFiles = (req) => [
  ...(req.files?.file || []),
  ...(req.files?.files || []),
];

const bulkFileNameFormatHelp =
  "Required format: reporttype_YYYY-MM-DD.xlsx";
const bulkFileNameCorrectionMessage =
  `Please correct the file name and upload again. ${bulkFileNameFormatHelp}`;
const bulkInvalidFileNameMessage =
  "Invalid file name. Please rename the file using the format reporttype_YYYY-MM-DD and upload again.";

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

const reportDataTables = new Set([
  "ag1", "ag2", "enb", "esc", "gnb", "gsc",
  "hpodsc", "ila", "isc", "osc", "wifi",
]);

const getRawCircle = (row = {}) => {
  const normalized = {};
  Object.keys(row).forEach((key) => {
    normalized[key.toString().trim().toLowerCase().replace(/[\s_]+/g, " ")] = row[key];
  });
  return normalized.circle || normalized["circle name"] || "";
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

const ensureGnbTable = async () => {
  try {
    // Step 1: Check if table exists and what columns it has
    const checkTableQuery = `
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'gnb' 
        AND TABLE_SCHEMA = DATABASE()
      `;
    const existingColumns = await query(checkTableQuery);
    const existingColumnNames = existingColumns.map(col => col.COLUMN_NAME);

    console.log("✅ Checking GNB table structure...");
    console.log("   Current columns:", existingColumnNames.join(", "));

    const requiredColumns = [
      "id", "file_id", "sap_id", "circle", "cmp", "jc", "city", "site_type",
      "device_type", "total_cnum_count", "total_outage", "availability",
      "cells_up", "cells_up_mod", "vendor", "r4g_availability", "air_fiber_sites",
      "updated_r4g", "date", "created_at"
    ];

    const missingColumns = requiredColumns.filter(col => !existingColumnNames.includes(col));

    if (missingColumns.length > 0) {
      console.warn("⚠️  Missing columns in GNB table:", missingColumns);
      console.log("   Dropping and recreating GNB table...");

      // Drop existing table if it exists
      await query("DROP TABLE IF EXISTS gnb");

      // Create new table with all columns
      await query(`
          CREATE TABLE gnb (
            id INT AUTO_INCREMENT PRIMARY KEY,
            file_id BIGINT,
            sap_id VARCHAR(100),
            circle VARCHAR(100),
            cmp VARCHAR(150),
            jc VARCHAR(150),
            city VARCHAR(100),
            site_type VARCHAR(50),
            device_type VARCHAR(50),
            total_cnum_count INT,
            total_outage BIGINT,
            availability DECIMAL(10,4),
            cells_up INT,
            cells_up_mod INT,
            vendor VARCHAR(100),
            r4g_availability DECIMAL(10,4),
            air_fiber_sites VARCHAR(50),
            updated_r4g VARCHAR(100),
            date DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
      console.log("✅ GNB table recreated with all required columns");
    } else {
      console.log("✅ GNB table has all required columns");
    }
  } catch (err) {
    console.error("❌ Error checking/creating GNB table:", err.message);
    throw err;
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
    circle VARCHAR(50),
    cmp VARCHAR(100),
    date DATE,
    kpi_value DECIMAL(12,4),

    sap_id VARCHAR(100),
    jc_name VARCHAR(150),
    jc_id VARCHAR(100),

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
};

const insertEnbRows = async (rows) => {
  if (!rows.length) return;
  const batchSize = 1000;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    await query(
      `INSERT INTO enb (
              file_id, circle, cmp, site_type, date, kpi_value,
              sap_id, jc_name, jc_id, jc_sap_id, city,
              site_type_excel, device_type, cnum_count,
              outage_sec, availability, cells_up
            )
                  VALUES ?`,
      [batch]
    );
  }
};

const insertEscRows = async (rows) => {
  if (!rows.length) return;

  await query(
    `INSERT INTO esc (
    file_id,
    sap_id,
    circle,
    cmp,
    jc_name,
    jc_id,
    jc_sap_id,
    city,
    site_type,
    device_type,
    total_cnum_count,
    total_outage,
    total_availability,
    cells_up,
    date
  ) VALUES ?`,
    [rows]
  );
};

const insertGnbRows = async (rows) => {

  if (!rows.length) return;

  try {
    console.log("\n========== GNB INSERT DEBUG ==========");
    console.log("📊 Inserting", rows.length, "GNB records");
    console.log("🔍 First row data:", rows[0]);
    console.log("📝 INSERT SQL structure:");
    console.log("INSERT INTO gnb (file_id, sap_id, circle, cmp, jc, city, site_type, device_type, total_cnum_count, total_outage, availability, cells_up, cells_up_mod, vendor, r4g_availability, air_fiber_sites, updated_r4g, date) VALUES ?");
    console.log("==========================================\n");

    await query(`
        INSERT INTO gnb (

          file_id,
          sap_id,
          circle,
          cmp,
          jc,
          city,
          site_type,
          device_type,
          total_cnum_count,
          total_outage,
          availability,
          cells_up,
          cells_up_mod,
          vendor,
          r4g_availability,
          air_fiber_sites,
          updated_r4g,
          date

        ) VALUES ?
      `, [rows]);

    console.log("✅ GNB records inserted successfully");
  } catch (err) {
    console.error("\n❌ GNB INSERT ERROR");
    console.error("Error Code:", err.code);
    console.error("Error Message:", err.message);
    console.error("SQL:", err.sql);
    console.error("Full Error:", err);
    throw err;
  }
};

const insertHpodscRows = async (rows) => {
  if (!rows.length) return;

  await query(
    `INSERT INTO hpodsc (

      file_id,

      sap_id,

      circle,

      cmp,

      jc_name,

      jc_id,

      jc_sap_id,

      city,

      site_type,

      device_type,

      integration_state,

      total_cnum_count,

      total_outage,

      total_availability,

      cells_up,

      date

    ) VALUES ?`,
    [rows]
  );
};

const insertOscRows = async (rows) => {
  if (!rows.length) return;
  const batchSize = 1000;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    await query(
      `INSERT INTO osc (
    file_id,
    circle,
    cmp,
    date,
    kpi_value,
    sap_id,
    jc_name,
    jc_id
  ) VALUES ?`,
      [batch]
    );
  }
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
  return (await filterAccessibleUploads(rows, authUser))[0] || null;
};

const formatDateOnly = (value) => {
  if (!value) return null;
  const d = new Date(value + " 2026");
  if (Number.isNaN(d.valueOf())) return null;

  // ✅ FIX: Use local date components instead of .toISOString()
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
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

    const cleanRow = {};
    Object.keys(row).forEach((key) => {
      const normalizedKey = key
        .toString()
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ").trim();

      cleanRow[normalizedKey] = row[key];
    });

    const circle =
      cleanRow["circle"] ||
      cleanRow["circle name"] ||
      cleanRow["Circle"] ||
      cleanRow["CIRCLE"];

    const cmp =
      cleanRow["cmp"] ||
      cleanRow["cmp name"] ||
      cleanRow["CMP"] ||
      cleanRow["Cmp"];

    const normalizedDate = normalizeDate(fallbackDate);

    if (!circle || !cmp) {
      errors.push(index + 2);
      return;
    }

    console.log("Availability Value:", cleanRow["overall cell availability"]);

    let availability = cleanRow["overall cell availability"];

    // ✅ FIX
    if (
      availability === undefined ||
      availability === null ||
      availability === ""
    ) {
      availability = 0;
    }

    availability = Number(availability);

    if (isNaN(availability)) {
      availability = 0;
    }

    if (availability <= 1) {
      availability = availability * 100;
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
      cleanRow["site type"],
      cleanRow["device type"],
      cleanRow["overall cnum count"] || cleanRow["overall cNum count"],
      cleanRow["overall cell outage (sec)"],
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
    const cleanRow = {};

    Object.keys(row).forEach((key) => {
      const normalizedKey = key
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, " ");

      cleanRow[normalizedKey] = row[key];
    });

    const circle =
      cleanRow["circle"] ||
      cleanRow["circle name"] ||
      cleanRow["Circle"] ||
      cleanRow["CIRCLE"];

    const cmp =
      cleanRow["cmp"] ||
      cleanRow["cmp name"] ||
      cleanRow["CMP"] ||
      cleanRow["Cmp"];

    const date = normalizeDate(fallbackDate);

    console.log("ESC ROW:", cleanRow);
    console.log("CIRCLE:", circle);
    console.log("CMP:", cmp);

    if (!circle || !cmp) {
      errors.push(index + 2);
      return;
    }

    // ✅ Availability normalization
    let availability =
      cleanRow["availability"] ??
      cleanRow["Availability"] ??
      cleanRow["total_availability"] ??
      cleanRow["total availability"] ??
      0;

    availability = Number(
      String(availability).replace("%", "")
    );

    if (isNaN(availability)) {
      availability = 0;
    }

    // If value is stored as 0.9017 convert to 90.17
    if (availability > 0 && availability <= 1) {
      availability *= 100;
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

      cleanRow["total_cnum_count"] ||
      cleanRow["total cnum count"] ||
      null,

      cleanRow["total_outage"] ||
      cleanRow["total outage"] ||
      null,

      availability,

      cleanRow["cells_up"] ||
      cleanRow["cells up"] ||
      null,

      date
    ]);
  });

  return { insertRows, errors };
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
const toNumber = (value, defaultVal = 0) => {
  if (value === null || value === undefined || value === "") return defaultVal;
  const num = Number(value);
  return isNaN(num) ? defaultVal : num;
};

const parseGnbRows = (rows, fallbackDate, fileId) => {
  const insertRows = [];
  let headerMappingIssuesDetected = false;

  rows.forEach((rowIndex, idx) => {
    const row = rows[idx];
    const cleanRow = {};
    const headerMapping = {}; // Track which Excel headers map to which normalized keys

    // 🔥 NORMALIZE ALL HEADERS
    Object.keys(row).forEach((key) => {
      const normalizedKey = key
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, " ");

      cleanRow[normalizedKey] = row[key];
      headerMapping[normalizedKey] = key; // Store original header name
    });

    // 🔥 DEBUG: Show EXACT headers on first row
    if (idx === 0) {
      console.log("\n========== GNB UPLOAD DEBUG ==========");
      console.log("📋 ORIGINAL EXCEL HEADERS:", Object.keys(row));
      console.log("📋 NORMALIZED HEADERS:", Object.keys(cleanRow));
      console.log("✅ Expected headers: sap id, circle, cmp, jc, city, site type, device type, total cnum count, total outage, total availability, cells up, cells up mod, vendor, availability, air fiber sites, updated r4g");
      console.log("========================================\n");
    }

    // 🔥 VERIFY CRITICAL HEADERS EXIST
    const expectedHeaders = [
      "sap_id", "circle", "cmp", "jc", "city", "site type", "device type",
      "total cnum count", "total outage", "total availability",
      "cells up", "cells up mod", "vendor", "availability", "air fiber sites", "updated r4g"
    ];

    const missingHeaders = expectedHeaders.filter(h => !Object.keys(cleanRow).includes(h) && !Object.keys(cleanRow).includes(h.replace(/ /g, "_")));
    if (missingHeaders.length > 0 && idx === 0) {
      console.log("⚠️  WARNING: Missing headers - might cause NULL values:", missingHeaders);
      console.log("📌 Available keys:", Object.keys(cleanRow));
      headerMappingIssuesDetected = true;
    }

    // 🔥 EXTRACT AND LOG EACH FIELD - Using helper for robustness
    const sapId = findHeaderValue(cleanRow, ["sap id", "sap_id", "sap id", "sap"]) || null;
    const circle = cleanRow["circle"] || cleanRow["circle name"] || null;
    const cmp = cleanRow["cmp"] || cleanRow["cmp name"] || null;
    const jc = findHeaderValue(cleanRow, ["jc", "jc name", "jc_name"]) || null;
    const city = cleanRow["city"] || cleanRow["city name"] || null;
    const siteType = findHeaderValue(cleanRow, ["site type", "site_type", "sitetype", "site_type_excel"]) || null;
    const deviceType = findHeaderValue(cleanRow, ["device type", "device_type", "devicetype"]) || null;

    // 🔥 NUMERIC FIELDS - Convert safely
    const totalCnumCount = toNumber(findHeaderValue(cleanRow, ["total cnum count", "total_cnum_count", "cnum count", "total cnum"]), 0);
    const totalOutage = toNumber(findHeaderValue(cleanRow, ["total outage", "total_outage", "outage"]), 0);
    const availability = toNumber(
      findHeaderValue(
        cleanRow,
        ["availability", "total availability", "total_availability"]
      ),
      0
    );
    const cellsUp = toNumber(findHeaderValue(cleanRow, ["cells up", "cells_up"]), 0);
    const cellsUpMod = toNumber(findHeaderValue(cleanRow, ["cells up mod", "cells_up_mod"]), 0);
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

    // 🔥 LOG ROW DETAILS ON FIRST ROW ONLY
    if (idx === 0) {
      console.log("🔍 FIRST ROW DATA EXTRACTION:");
      console.log("  sap_id =>", { raw: findHeaderValue(cleanRow, ["sap id", "sap_id"]), extracted: sapId });
      console.log("  circle =>", { raw: cleanRow["circle"], extracted: circle });
      console.log("  cmp =>", { raw: cleanRow["cmp"], extracted: cmp });
      console.log("  site_type =>", { raw: findHeaderValue(cleanRow, ["site type", "site_type"]), extracted: siteType });
      console.log("  device_type =>", { raw: findHeaderValue(cleanRow, ["device type", "device_type"]), extracted: deviceType });
      console.log("  total_cnum_count =>", { raw: findHeaderValue(cleanRow, ["total cnum count", "total_cnum_count"]), extracted: totalCnumCount });
      console.log("  total_outage =>", { raw: findHeaderValue(cleanRow, ["total outage", "total_outage"]), extracted: totalOutage });
      console.log("  availability =>", { raw: findHeaderValue(cleanRow, ["total availability", "total_availability"]), extracted: availability });
      console.log("  cells_up =>", { raw: findHeaderValue(cleanRow, ["cells up", "cells_up"]), extracted: cellsUp });
      console.log("  vendor =>", { raw: findHeaderValue(cleanRow, ["vendor"]), extracted: vendor });
      console.log("  availability =>", { raw: findHeaderValue(cleanRow, ["availability"]), extracted: availability });
      console.log("  air_fiber_sites =>", { raw: findHeaderValue(cleanRow, ["air fiber sites", "air_fiber_sites"]), extracted: airFiberSites });
      console.log("  updated_r4g =>", { raw: findHeaderValue(cleanRow, ["updated r4g", "updated_r4g"]), extracted: updatedR4g });
      console.log("==========================================\n");

      if (headerMappingIssuesDetected) {
        console.log("⚠️  HEADER MAPPING ISSUES DETECTED - Check above for missing headers");
      }
    }

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

  return { insertRows };
};

function parseHpodscRows(rows, fallbackDate, fileId) {

  const insertRows = [];
  const errors = [];

  rows.forEach((row, index) => {

    const cleanRow = {};

    Object.keys(row).forEach((key) => {

      const normalizedKey = key
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, " ");

      cleanRow[normalizedKey] = row[key];
    });

    const circle =
      cleanRow["circle"] ||
      cleanRow["circle name"];

    const cmp =
      cleanRow["cmp"] ||
      cleanRow["cmp name"];

    const date = normalizeDate(fallbackDate);

    if (!circle || !cmp) {
      errors.push(index + 2);
      return;
    }

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

      cleanRow["total cnum count"] || null,

      cleanRow["total outage"] || null,

      cleanRow["total availability"] || null,

      cleanRow["cells up"] || null,

      date
    ]);
  });

  return { insertRows, errors };
}

const readWorksheetRows = (fileBuffer) => {

  const workbook = xlsx.read(fileBuffer, {
    type: "buffer",
    cellDates: true,
  });

  const sheetName = workbook.SheetNames[0];

  const worksheet = workbook.Sheets[sheetName];

  const rows = xlsx.utils.sheet_to_json(
    worksheet,
    { defval: "" }
  );

  if (!rows.length) {
    const error = new Error("No rows found in uploaded file");
    error.statusCode = 400;
    throw error;
  }

  return rows;
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

const processSiteUploadRows = async ({ siteType, rows, date, fileId }) => {
  const normalizedSiteType = String(siteType || "").trim().toLowerCase();

  if (normalizedSiteType === "enb") {
    await ensureEnbTable();
    const { insertRows, errors } = parseEnbRows(rows, date, fileId);

    if (errors.length) {
      const error = new Error(`Missing required fields in rows: ${errors.join(", ")}`);
      error.statusCode = 400;
      throw error;
    }

    await insertEnbRows(insertRows);
    return insertRows.length;
  }

  if (normalizedSiteType === "esc") {
    await ensureEscTable();
    const { insertRows, errors } = parseEscRows(rows, date, fileId);

    if (errors.length) {
      const error = new Error(`Missing required fields in rows: ${errors.join(", ")}`);
      error.statusCode = 400;
      throw error;
    }

    await insertEscRows(insertRows);
    return insertRows.length;
  }

  if (normalizedSiteType === "hpodsc") {
    await ensureHpodscTable();
    const { insertRows } = parseHpodscRows(rows, date, fileId);
    await insertHpodscRows(insertRows);
    return insertRows.length;
  }

  if (normalizedSiteType === "isc") {
    await ensureIscTable();

    const insertRows = [];
    const errors = [];
    const headerKeys = new Set();

    const normalizeKey = (key) =>
      key.toString().trim().toLowerCase().replace(/[\s_]+/g, " ");

    const pickByPrefix = (obj, prefix) => {
      const key = Object.keys(obj).find(
        (k) => k === prefix || k.startsWith(prefix + " ")
      );
      return key ? obj[key] : undefined;
    };

    rows.forEach((row, index) => {
      const cleanRow = {};

      Object.keys(row).forEach((key) => {
        const normalized = normalizeKey(key);
        cleanRow[normalized] = row[key];
        headerKeys.add(normalized);
      });

      const circle =
        cleanRow["circle"] ||
        cleanRow["circle name"] ||
        pickByPrefix(cleanRow, "circle");

      const cmp =
        cleanRow["cmp"] ||
        cleanRow["cmp name"] ||
        pickByPrefix(cleanRow, "cmp");

      const dateValue = normalizeDate(date);

      if (!circle || !cmp) {
        errors.push(index + 2);
        return;
      }

      insertRows.push([fileId, String(circle).trim(), String(cmp).trim(), dateValue, 1]);
    });

    if (!insertRows.length) {
      const error = new Error(
        "ISC upload failed: no rows contained valid Circle/CMP values. Please verify the file headers."
      );
      error.statusCode = 400;
      error.details = { detectedHeaders: Array.from(headerKeys).slice(0, 30) };
      throw error;
    }

    if (errors.length) {
      const error = new Error(`Missing required fields in rows: ${errors.join(", ")}`);
      error.statusCode = 400;
      error.details = { detectedHeaders: Array.from(headerKeys).slice(0, 30) };
      throw error;
    }

    await query(`INSERT INTO isc (file_id, circle, cmp, date, kpi_value) VALUES ?`, [insertRows]);
    return insertRows.length;
  }

  if (normalizedSiteType === "osc") {
    await ensureOscTable();
    await ensureColumn("osc", "kpi_value", "DECIMAL(12,4) NULL");

    const insertRows = [];
    const headerKeys = new Set();

    const normalizeKey = (key) =>
      key.toString().trim().toLowerCase().replace(/[\s_]+/g, " ");

    const pickByPrefix = (obj, prefix) => {
      const key = Object.keys(obj).find(
        (k) => k === prefix || k.startsWith(prefix + " ")
      );
      return key ? obj[key] : undefined;
    };

    rows.forEach((row) => {
      const cleanRow = {};

      Object.keys(row).forEach((key) => {
        const normalized = normalizeKey(key);
        cleanRow[normalized] = row[key];
        headerKeys.add(normalized);
      });

      const circle =
        cleanRow["circle"] ||
        cleanRow["circle name"] ||
        pickByPrefix(cleanRow, "circle");

      const cmp =
        cleanRow["cmp"] ||
        cleanRow["cmp name"] ||
        pickByPrefix(cleanRow, "cmp");

      const dateValue = normalizeDate(date);

      if (!circle || !cmp) return;

      insertRows.push([fileId, String(circle).trim(), String(cmp).trim(), dateValue, 1]);
    });

    if (!insertRows.length) {
      const error = new Error(
        "OSC upload failed: no rows contained valid Circle/CMP values. Please verify the file headers."
      );
      error.statusCode = 400;
      error.details = { detectedHeaders: Array.from(headerKeys).slice(0, 30) };
      throw error;
    }

    await insertOscRows(insertRows);
    return insertRows.length;
  }

  if (normalizedSiteType === "gnb") {

    await ensureGnbTable();

    const { insertRows } = parseGnbRows(
      rows,
      date,
      fileId
    );

    await insertGnbRows(insertRows);

    return insertRows.length;
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

    const insertRows = [];

    const normalizeKey = (key) =>
      key.toString().trim().toLowerCase().replace(/[\s_]+/g, " ");

    const pickByPrefix = (obj, prefix) => {
      const key = Object.keys(obj).find(
        (k) => k === prefix || k.startsWith(prefix + " ")
      );
      return key ? obj[key] : undefined;
    };

    rows.forEach((row) => {
      const cleanRow = {};

      Object.keys(row).forEach((key) => {
        cleanRow[normalizeKey(key)] = row[key];
      });

      const circle =
        cleanRow["circle"] ||
        cleanRow["circle name"] ||
        pickByPrefix(cleanRow, "circle");

      const cmp =
        cleanRow["cmp"] ||
        cleanRow["cmp name"] ||
        pickByPrefix(cleanRow, "cmp");

      const dateValue = normalizeDate(date);

      if (!circle || !cmp) return;

      insertRows.push([fileId, String(circle).trim(), String(cmp).trim(), dateValue, 1]);
    });

    if (!insertRows.length) {
      const error = new Error(`${tableName.toUpperCase()} upload failed: no valid rows`);
      error.statusCode = 400;
      throw error;
    }

    await query(`INSERT INTO ${tableName} (file_id, circle, cmp, date, kpi_value) VALUES ?`, [
      insertRows,
    ]);
    return insertRows.length;
  }

  const error = new Error(`Unsupported site type: ${siteType}`);
  error.statusCode = 400;
  throw error;
};

// ✅ List reports

router.get("/", async (req, res) => {
  try {
    const siteCategory = req.query.siteCategory || "tower";
    await ensureUploadsTable();
    const allRows = await query(
      `SELECT id, site_category, report_date, site_type,
    report_type, upload_type, uploaded_by,
    file_name, total_records, file_id, uploaded_at
    FROM report_uploads
    WHERE site_category = ?
    ORDER BY uploaded_at DESC`,
      [siteCategory]
    );
    const rows = await filterAccessibleUploads(allRows, req.authUser);

    const rowsWithStatus = rows.map((row) => ({
      ...row,
      file_missing: false,
    }));

    res.json({ rows: rowsWithStatus });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Latest upload summary (file name + date + record count)
router.get("/latest-summary", async (req, res) => {
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
router.get("/latest", async (req, res) => {
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
router.get("/latest/count", async (req, res) => {
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

router.get("/enb/uptime-trend", async (req, res) => {
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
router.post("/upload", (req, res) => {
  uploadAnyReportFiles(req, res, async (err) => {

    if (err) {
      return res.status(400).json({ message: err.message });
    }

    try {
      const { site_type, report_type, date, uploadedBy } = req.body;
      const duplicateAction = String(req.body.duplicateAction || "").toLowerCase();
      const site_category = (req.body.siteCategory || "tower").toLowerCase();
      const normalizeSiteTypeValue = (value = "") =>
      value.toString().trim().toUpperCase();
      const normalizedSiteType = normalizeSiteTypeValue(site_type); 
      const files = getUploadedReportFiles(req);
      const detectedUploadType = files.length > 1 ? "bulk" : "single";
      const finalDate = detectedUploadType === "single" ? normalizeDate(date) : null;

      if (detectedUploadType === "single" && !finalDate) {
        return res.status(400).json({ message: "Please select report date." });
      }
      if (!uploadedBy) {
        return res.status(400).json({ message: "Please enter Uploaded By." });
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

      const pendingUploads = [];

      for (const file of files) {
        const rows = readWorksheetRows(file.buffer);
        assertRowsAllowedCircle(req.authUser, rows, getRawCircle);

        let fileReportDate = finalDate;

        if (detectedUploadType === "bulk") {
          fileReportDate = extractDateFromFileName(file.originalname);

          if (!fileReportDate) {
            const isMissingDate = !/\d{4}-\d{2}-\d{2}/.test(String(file.originalname || ""));
            return res.status(400).json({
              message: isMissingDate
                ? bulkFileNameCorrectionMessage
                : bulkInvalidFileNameMessage,
            });
          }
        }

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

      if (duplicateAction === "replace") {
        for (const item of duplicateFiles) {
          for (const duplicate of item.duplicates) {
            await deleteUploadData(duplicate);
          }
        }
      }

      const uploadsToProcess =
        duplicateAction === "skip"
          ? pendingUploads.filter((item) => item.duplicates.length === 0)
          : pendingUploads;

      const reportInsertRows = [];
      const uploadedAt = new Date();
      const baseFileId = Date.now();

      for (const [index, item] of uploadsToProcess.entries()) {
        const fileId = baseFileId + index;
        const totalRecords = await processSiteUploadRows({
          siteType: normalizedSiteType,
          rows: item.rows,
          date: item.reportDate,
          fileId,
        });

  reportInsertRows.push([
  site_category,
  item.reportDate,
  normalizedSiteType.toUpperCase(),
  report_type,
  detectedUploadType,
  uploadedBy,
  item.file.originalname,
  fileId,
  totalRecords,
  uploadedAt,
]);
      }

      if (!reportInsertRows.length) {
        return res.status(200).json({
          success: true,
          message: "No reports uploaded.",
          count: 0,
          skipped: duplicateFiles.length,
        });
      }

      await query(
        `INSERT INTO report_uploads (
          site_category,
          report_date,
          site_type,
          report_type,
          upload_type,
          uploaded_by,
          file_name,
          file_id,
          total_records,
          uploaded_at
        ) VALUES ?`,
        [reportInsertRows]
      );

      res.status(200).json({
        success: true,
        count: reportInsertRows.length,
        skipped: duplicateAction === "skip" ? duplicateFiles.length : 0,
        uploadType: detectedUploadType,
        message:
          duplicateAction === "skip" && duplicateFiles.length
            ? `${reportInsertRows.length} file(s) uploaded successfully. ${duplicateFiles.length} existing file(s) skipped.`
            : `${reportInsertRows.length} file(s) uploaded successfully.`,
      });
    } catch (error) {
      console.error(error);
      const isDatabaseError = error?.code && String(error.code).startsWith("ER_");
      res.status(error.statusCode || 500).json({
        success: false,
        message: isDatabaseError
          ? "Unable to upload reports.\n\nPlease try again or contact administrator."
          : error.message || "Upload failed.\n\nPlease check your files and try again.",
      });
    }
  });
});

router.post("/bulk-delete", async (req, res) => {
  try {

    let { ids } = req.body;

    // 🔥 FIX: convert + remove invalid values
    ids = ids
      .map((id) => Number(id))
      .filter((id) => !isNaN(id));

    if (!ids || ids.length === 0) {
      return res.status(400).json({ message: "Invalid IDs" });
    }

    // 🔥 GET FULL DATA (IMPORTANT)
    const placeholders = ids.map(() => "?").join(",");

    const rows = await query(
      `SELECT id, file_name, site_type, file_id 
      FROM report_uploads 
      WHERE id IN (${placeholders})`,
      ids   // 🔥 NOT [ids]
    );

    const accessChecks = await Promise.all(
      rows.map((row) => isUploadAccessible(row, req.authUser, true))
    );
    if (accessChecks.some((allowed) => !allowed)) {
      return res.status(403).json({ message: "You cannot delete another circle's data." });
    }

    // 🔥 DELETE FILE


    // 🔥 DELETE FROM ALL TABLES BASED ON TYPE
    for (const row of rows) {
      const file_id = parseInt(row.file_id); // 🔥 FIX
      const type = String(row.site_type).toLowerCase();

      if (!file_id) {
        console.log("❌ Invalid file_id:", row);
        continue;
      }

      console.log("✅ Bulk deleting:", type, file_id);

      if (type === "enb") {
        await query("DELETE FROM enb WHERE file_id = ?", [file_id]);

        const after = await query(`SELECT COUNT(*) as count FROM enb WHERE file_id = ?`, [file_id]);
        console.log("After delete ENB:", after[0].count);
      }

      if (type === "esc") {
        await query("DELETE FROM esc WHERE file_id = ?", [file_id]);

        const after = await query(`SELECT COUNT(*) as count FROM esc WHERE file_id = ?`, [file_id]);
        console.log("After delete ESC:", after[0].count);
      }

      if (type === "isc") {
        await query("DELETE FROM isc WHERE file_id = ?", [file_id]);

        const after = await query(`SELECT COUNT(*) as count FROM isc WHERE file_id = ?`, [file_id]);
        console.log("After delete ISC:", after[0].count);
      }

      if (type === "osc") {
        await query("DELETE FROM osc WHERE file_id = ?", [file_id]);

        const after = await query(`SELECT COUNT(*) as count FROM osc WHERE file_id = ?`, [file_id]);
        console.log("After delete OSC:", after[0].count);
      }

      if (type === "hpodsc") {
        await query("DELETE FROM hpodsc WHERE file_id = ?", [file_id]);

        const after = await query(`SELECT COUNT(*) as count FROM hpodsc WHERE file_id = ?`, [file_id]);
        console.log("After delete HPODSC:", after[0].count);
      }

      if (type === "gnb") {
        await query(
          "DELETE FROM gnb WHERE file_id = ?",
          [file_id]
        );

        const after = await query(
          `SELECT COUNT(*) as count
      FROM gnb
      WHERE file_id = ?`,
          [file_id]
        );

        console.log(
          "After delete GNB:",
          after[0].count
        );
      }

    }

    // 🔥 DELETE FROM uploads table (LAST)
    await query(
      `DELETE FROM report_uploads WHERE id IN (${placeholders})`,
      ids
    );

    // 🔥 FINAL CLEANUP (REMOVE ORPHAN DATA)
    await query(`DELETE FROM enb WHERE file_id NOT IN (SELECT file_id FROM report_uploads)`);
    await query(`DELETE FROM esc WHERE file_id NOT IN (SELECT file_id FROM report_uploads)`);
    await query(`DELETE FROM isc WHERE file_id NOT IN (SELECT file_id FROM report_uploads)`);
    await query(`DELETE FROM osc WHERE file_id NOT IN (SELECT file_id FROM report_uploads)`);
    await query(`DELETE FROM hpodsc WHERE file_id NOT IN (SELECT file_id FROM report_uploads)`);

    await query(`
      DELETE FROM gnb
      WHERE file_id NOT IN (
      SELECT file_id
      FROM report_uploads
    )
    `);

    res.json({ message: "Bulk delete successful (file + data)" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Bulk delete failed" });
  }
});

const bulkExportTables = new Set([
  "ag1",
  "ag2",
  "enb",
  "esc",
  "gnb",
  "gsc",
  "hpodsc",
  "ila",
  "isc",
  "osc",
  "wifi",
]);
const bulkExportMonths = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const bulkExportHighWaterMark = 1000;
const maxExcelDataRowsPerSheet = 1048575;

const parseBulkExportIds = (value) => {
  let rawIds = value;

  if (typeof rawIds === "string") {
    try {
      rawIds = JSON.parse(rawIds);
    } catch {
      rawIds = rawIds.split(",");
    }
  }

  if (!Array.isArray(rawIds)) return [];

  return [...new Set(
    rawIds
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
  )];
};

const streamBulkExportRows = async function* (sql, params) {
  const connection = await new Promise((resolve, reject) => {
    db.getConnection((err, pooledConnection) => {
      if (err) return reject(err);
      resolve(pooledConnection);
    });
  });

  try {
    await new Promise((resolve, reject) => {
      connection.query("SET time_zone = '+05:30'", (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    const rowStream = connection
      .query(sql, params)
      .stream({ highWaterMark: bulkExportHighWaterMark });

    for await (const row of rowStream) {
      yield row;
    }
  } finally {
    connection.release();
  }
};

router.post("/download-bulk", express.urlencoded({ extended: false }), async (req, res) => {
  let workbook;

  try {
    const ids = parseBulkExportIds(req.body?.ids);
    const month = Number(req.body?.month);

    if (!ids.length) {
      return res.status(400).json({ message: "No IDs provided" });
    }

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ message: "Invalid month" });
    }

    const placeholders = ids.map(() => "?").join(",");
    const uploads = await query(
      `SELECT id, site_type, file_id, report_date
                  FROM report_uploads
                  WHERE id IN (${placeholders})
                    AND MONTH(report_date) = ?
                  ORDER BY report_date ASC, id ASC`,
      [...ids, month]
    );
    const accessibleUploads = await filterAccessibleUploads(uploads, req.authUser);
    if (accessibleUploads.length !== uploads.length) {
      return res.status(403).json({ message: "You cannot download another circle's data." });
    }

    if (!uploads.length) {
      return res.status(404).json({
        message: `No selected reports found for ${bulkExportMonths[month - 1]}`,
      });
    }

    const tableNames = [...new Set(
      accessibleUploads.map((upload) => String(upload.site_type || "").toLowerCase())
    )];
    const invalidTable = tableNames.find((tableName) => !bulkExportTables.has(tableName));

    if (invalidTable) {
      return res.status(400).json({ message: "Unsupported report type" });
    }

    const dataColumns = [];
    const seenColumns = new Set();

    for (const tableName of tableNames) {
      const columns = await query(
        `SELECT COLUMN_NAME
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                      AND TABLE_NAME = ?
                    ORDER BY ORDINAL_POSITION`,
        [tableName]
      );

      columns.forEach(({ COLUMN_NAME: columnName }) => {
        if (!seenColumns.has(columnName)) {
          seenColumns.add(columnName);
          dataColumns.push(columnName);
        }
      });
    }

    const monthName = bulkExportMonths[month - 1];
    const exportColumns = [
      "source_site_type",
      "source_report_date",
      "source_upload_id",
      ...dataColumns,
    ];

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${monthName}_Report.xlsx"`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: res,
      useStyles: false,
      useSharedStrings: false,
    });

    let worksheet;
    let sheetNumber = 0;
    let sheetDataRows = 0;

    const addWorksheet = () => {
      sheetNumber += 1;
      sheetDataRows = 0;
      worksheet = workbook.addWorksheet(
        sheetNumber === 1 ? "Reports" : `Reports_${sheetNumber}`
      );
      worksheet.columns = exportColumns.map((columnName) => ({
        header: columnName,
        key: columnName,
      }));
    };

    addWorksheet();

    for (const upload of accessibleUploads) {
      const tableName = String(upload.site_type).toLowerCase();
      const rows = streamBulkExportRows(
        `SELECT *
                    FROM ${tableName}
                    WHERE file_id = ?${isAllCircle(req.authUser)
          ? ""
          : " AND LOWER(TRIM(circle)) = LOWER(TRIM(?))"
        }
                    ORDER BY id ASC`,
        isAllCircle(req.authUser)
          ? [upload.file_id]
          : [upload.file_id, req.authUser.circle]
      );

      for await (const row of rows) {
        if (res.destroyed) {
          throw new Error("Client disconnected during bulk download");
        }

        if (sheetDataRows >= maxExcelDataRowsPerSheet) {
          worksheet.commit();
          addWorksheet();
        }

        worksheet.addRow({
          source_site_type: String(upload.site_type).toUpperCase(),
          source_report_date: upload.report_date,
          source_upload_id: upload.id,
          ...row,
        }).commit();
        sheetDataRows += 1;
      }
    }

    worksheet.commit();
    await workbook.commit();
  } catch (err) {
    console.error("BULK DOWNLOAD ERROR:", err);

    if (!res.headersSent) {
      return res.status(500).json({ message: "Download failed" });
    }

    res.destroy(err);
  }
});

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

async function deleteUploadData(upload) {
  const tableName = String(upload.site_type || "").toLowerCase();
  const fileId = Number(upload.file_id);

  if (reportDataTables.has(tableName) && Number.isFinite(fileId)) {
    await query(`DELETE FROM ${tableName} WHERE file_id = ?`, [fileId]);
  }

  await query("DELETE FROM report_uploads WHERE id = ?", [upload.id]);
}


// ✅ SINGLE FILE DOWNLOAD
router.get("/download/:id", async (req, res) => {

  try {

    const id = Number(req.params.id);

    const uploadRows = await query(
      `
        SELECT site_type, file_id
        FROM report_uploads
        WHERE id = ?
        `,
      [id]
    );

    if (!uploadRows.length) {
      return res.status(404).json({
        message: "Report not found",
      });
    }

    const siteType = uploadRows[0].site_type.toLowerCase();
    if (!reportDataTables.has(siteType)) {
      return res.status(400).json({ message: "Unsupported report type" });
    }

    const fileId = Number(uploadRows[0].file_id);

    const rows = await query(
      `
  SELECT *
  FROM ${siteType}
  WHERE file_id = ?${isAllCircle(req.authUser)
        ? ""
        : " AND LOWER(TRIM(circle)) = LOWER(TRIM(?))"
      }
  `,
      isAllCircle(req.authUser)
        ? [fileId]
        : [fileId, req.authUser.circle]
    );

    console.log("DOWNLOAD ID:", id);
    console.log("FILE ID:", fileId);
    console.log("SITE TYPE:", siteType);
    console.log("ROWS FOUND:", rows.length);

    if (!rows.length) {
      console.log("NO ROWS FOUND FOR DOWNLOAD");

      return res.status(404).json({
        message: "No data found",
      });
    }

    const workbook = xlsx.utils.book_new();

    const worksheet =
      xlsx.utils.json_to_sheet(rows);

    xlsx.utils.book_append_sheet(
      workbook,
      worksheet,
      `${siteType.toUpperCase()} Report`
    );

    const buffer = xlsx.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    console.log("BUFFER SIZE:", buffer.length);
    console.log("ROWS EXPORTED:", rows.length);


    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${siteType}_report.xlsx`
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.send(buffer);

  } catch (err) {

    console.error("DOWNLOAD ERROR:", err);

    res.status(500).json({
      message: "Download failed",
    });

  }

});

router.get("/export-excel", async (req, res) => {

  try {

    const {
      siteType,
      fromDate,
      toDate
    } = req.query;

    console.log("[EXPORT QUERY] siteType:", siteType, "fromDate:", fromDate, "toDate:", toDate);

    if (!siteType || !fromDate || !toDate) {
      return res.status(400).json({
        message: "Missing parameters"
      });
    }

    const tableName = siteType.toLowerCase();

    // validate table name whitelist to avoid SQL injection
    if (!reportDataTables.has(tableName)) {
      return res.status(400).json({ message: "Unsupported site type" });
    }

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${String(siteType).toUpperCase()}_Report.xlsx"`
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: res,
      useStyles: false,
      useSharedStrings: false,
    });

    const worksheet = workbook.addWorksheet(String(siteType).toUpperCase());

    let columnsAdded = false;

    // Build SQL with optional circle restriction
    let sql = `
  SELECT *
  FROM ${tableName}
  WHERE date BETWEEN ? AND ?
  `;
    const params = [fromDate, toDate];
    if (!isAllCircle(req.authUser)) {
      sql += ` AND LOWER(TRIM(circle)) = LOWER(TRIM(?))`;
      params.push(req.authUser.circle);
    }
    sql += ` ORDER BY date ASC`;

    const rows = streamBulkExportRows(sql, params);

    let exportRowCount = 0;

    try {
      for await (const row of rows) {
        exportRowCount += 1;

        if (exportRowCount === 1) {
          console.log("[EXPORT ROW SAMPLE] row.date:", row.date, "type:", typeof row.date, "isDate:", row.date instanceof Date, "toISOString:", row.date?.toISOString?.());
        }

        if (res.destroyed) throw new Error("Client disconnected during export");

        if (!columnsAdded) {
          worksheet.columns = Object.keys(row).map((key) => ({ header: key, key }));
          columnsAdded = true;
        }

        // Replace null/undefined with empty string to avoid Excel repair warnings
        const cleanRow = {};
        Object.keys(row).forEach((key) => {
          let val = row[key];
          if (val instanceof Date) {
            val = val.toISOString().slice(0, 10);
          }
          cleanRow[key] = val === undefined || val === null ? "" : val;
        });

        worksheet.addRow(cleanRow).commit();
      }

      // If no rows were emitted, create an empty sheet with at least the `date` column
      if (!columnsAdded) {
        worksheet.columns = [{ header: "date", key: "date" }];
      }

      worksheet.commit();
      await workbook.commit();
      return;
    } catch (innerErr) {
      // if an error happens after headers sent, destroy the response to terminate stream
      console.error("EXPORT STREAM ERROR:", innerErr);
      if (!res.headersSent) {
        return res.status(500).json({ message: "Export failed" });
      }
      res.destroy(innerErr);
      return;
    }

  } catch (err) {

    console.error("EXPORT ERROR:", err);

    if (!res.headersSent) {
      res.status(500).json({
        message: "Export failed"
      });
    }

  }

});

router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const rows = await query(
      "SELECT file_name, report_date, site_type, file_id FROM report_uploads WHERE id = ?",
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Record not found" });
    }

    if (!(await isUploadAccessible(rows[0], req.authUser, true))) {
      return res.status(403).json({ message: "You cannot delete another circle's data." });
    }

    const { file_name, report_date, site_type } = rows[0];
    const file_id = Number(rows[0].file_id);

    {/* ENB */ }

    if (site_type.toLowerCase() === "enb") {
      await query("DELETE FROM enb WHERE file_id = ?", [file_id]);

      // 🔥 EXTRA SAFETY (remove orphan data if mismatch)
      await query(`
        DELETE FROM enb 
        WHERE file_id NOT IN (SELECT file_id FROM report_uploads)
      `);
    }

    {/* ESC */ }

    if (site_type.toLowerCase() === "esc") {
      const file_id = Number(rows[0].file_id);

      console.log("Deleting ESC file_id:", file_id);

      await query("DELETE FROM esc WHERE file_id = ?", [file_id]);

      // 🔥 safety cleanup (optional but recommended)
      await query(`
        DELETE FROM esc 
        WHERE file_id NOT IN (SELECT file_id FROM report_uploads)
      `);
    }

    {/* ISC */ }

    if (site_type.toLowerCase() === "isc") {
      const file_id = Number(rows[0].file_id);

      console.log("Deleting ISC file_id:", file_id);

      await query("DELETE FROM isc WHERE file_id = ?", [file_id]);

      // 🔥 safety cleanup (recommended)
      await query(`
        DELETE FROM isc
        WHERE file_id NOT IN (SELECT file_id FROM report_uploads)
      `);
    }

    { /* OSC */ }

    if (site_type.toLowerCase() === "osc") {
      const file_id = Number(rows[0].file_id);

      console.log("Deleting OSC file_id:", file_id);

      await query("DELETE FROM osc WHERE file_id = ?", [file_id]);

      // 🔥 safety cleanup
      await query(`
        DELETE FROM osc
        WHERE file_id NOT IN (SELECT file_id FROM report_uploads)
      `);
    }

    {/* HPODSC */ }

    if (site_type.toLowerCase() === "hpodsc") {
      const file_id = Number(rows[0].file_id);

      console.log("Deleting HPODSC file_id:", file_id);

      await query("DELETE FROM hpodsc WHERE file_id = ?", [file_id]);

      // 🔥 safety cleanup
      await query(`
        DELETE FROM hpodsc
        WHERE file_id NOT IN (SELECT file_id FROM report_uploads)
      `);
    }

    {/* GNB */ }

    if (site_type.toLowerCase() === "gnb") {

      await query(
        "DELETE FROM gnb WHERE file_id = ?",
        [file_id]
      );

      await query(`
      DELETE FROM gnb
      WHERE file_id NOT IN (
        SELECT file_id
        FROM report_uploads
      )
    `);
    }

    // delete from uploads table
    await query("DELETE FROM report_uploads WHERE id = ?", [id]);

    res.json({ message: "Deleted successfully (file + data)" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Delete failed" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { site_type, report_type, upload_type, uploaded_by, report_date } =
      req.body;

    const [existing] = await query(
      `SELECT site_type, file_id FROM report_uploads WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!existing || !(await isUploadAccessible(existing, req.authUser, true))) {
      return res.status(403).json({ message: "You cannot edit another circle's data." });
    }

    await query(
      `UPDATE report_uploads 
                  SET site_type=?, report_type=?, upload_type=?, uploaded_by=?, report_date=?
                  WHERE id=?`,
      [site_type, report_type, upload_type, uploaded_by, report_date, id]
    );

    res.json({ message: "Updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Update failed" });
  }
});

module.exports = router;
