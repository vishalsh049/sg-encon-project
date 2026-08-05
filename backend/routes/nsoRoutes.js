const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const { db } = require("../config/db");
const {
  addCircleFilter,
  assertRowsAllowedCircle,
  isAllCircle,
} = require("../middleware/circleAccess");

const router = express.Router();
const uploadsDir = path.join(__dirname, "..", "uploads");

function ensureUploadsDir() {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
}

ensureUploadsDir();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadsDir();
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-nso-${file.originalname}`);
  },
});

const allowedExtensions = new Set(["xlsx", "xls", "xlsb", "csv"]);

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });

function appendNsoCircleFilter(filters, params, authUser, column = "nr.circle") {
  addCircleFilter(filters, params, authUser, column);
}

function accessibleNsoFileExistsSql(authUser) {
  return isAllCircle(authUser)
    ? ""
    : `AND EXISTS (
        SELECT 1
        FROM nso_reports nr
        WHERE nr.file_id = nso_report_files.id
          AND LOWER(TRIM(nr.circle)) = LOWER(TRIM(?))
      )`;
}

// ensureNsoTable() ran on every single request to almost every NSO route
// (list, summary, circle-count, export, upload, edit, bulk-delete) —
// including two full-table UPDATE statements (one with an INNER JOIN) meant
// to backfill legacy rows just once. New rows are already inserted correctly
// (original_file_name/report_date are set at insert time), so nothing after
// the very first run of this per server start ever has real work to do.
// Same "run once, cache the promise" fix already applied to reportRoutes.js.
let ensureNsoTablePromise = null;
async function ensureNsoTable() {
  if (!ensureNsoTablePromise) {
    ensureNsoTablePromise = ensureNsoTableOnce().catch((error) => {
      ensureNsoTablePromise = null;
      throw error;
    });
  }
  return ensureNsoTablePromise;
}

async function ensureNsoTableOnce() {

  await query(`
    CREATE TABLE IF NOT EXISTS nso_report_files (

      id INT AUTO_INCREMENT PRIMARY KEY,

      file_name VARCHAR(255) NOT NULL,

      original_name VARCHAR(255) NOT NULL,

      uploaded_by VARCHAR(255),

      total_records INT DEFAULT 0,

      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

    )
  `);

  const columns = [
    ["report_date", "DATE NULL"],
    ["total_records", "INT DEFAULT 0"],
  ];

  for (const [column, definition] of columns) {
    try {
      await query(`ALTER TABLE nso_report_files ADD COLUMN ${column} ${definition}`);
    } catch (error) {
      if (error?.code !== "ER_DUP_FIELDNAME") {
        throw error;
      }
    }
  }

  try {
    await query(`ALTER TABLE nso_reports ADD COLUMN report_date DATE NULL`);
  } catch (error) {
    if (error?.code !== "ER_DUP_FIELDNAME") {
      throw error;
    }
  }

  // Keep legacy and current filename columns aligned for older records and mixed code paths.
  await query(`
    UPDATE nso_report_files
    SET original_file_name = original_name
    WHERE (original_file_name IS NULL OR original_file_name = '')
      AND original_name IS NOT NULL
      AND original_name <> ''
  `);

  await query(`
    UPDATE nso_reports nr
    INNER JOIN nso_report_files nrf
      ON nrf.id = nr.file_id
    SET nr.report_date = nrf.report_date
    WHERE nr.report_date IS NULL
      AND nrf.report_date IS NOT NULL
  `);
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString().split("T")[0];
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(
        parsed.d
      ).padStart(2, "0")}`;
    }
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.valueOf())) {
    return parsed.toISOString().split("T")[0];
  }
  return null;
}

function formatSqlDateTime(date) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

// readRowsFromFile() reads with raw:false, so date/time cells (event_date,
// reported_to_fibre_noc, informed_date, etr, cleared_date) arrive as Excel's
// *formatted display string*, not a JS Date — the exact text therefore
// depends on how each cell was formatted in the source workbook, and none of
// those 5 columns were ever normalized before this fix (only report_date
// was). Handing MySQL an unparseable string for a DATE/DATETIME column makes
// it silently store the corrupt placeholder '0000-00-00' instead of erroring
// or leaving it NULL — confirmed against production: 77.5% of etr values and
// 24.4% of reported_to_fibre_noc values were '0000-00-00'. This parses the
// formats actually in use (ISO, and DD/MM/YYYY — the common India-locale
// format matching this app's IST-based date handling elsewhere) and returns
// null for anything it can't confidently parse, so a genuinely blank/
// unreadable cell stays NULL instead of becoming a fake zero-date.
function parseExcelDateTime(value) {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    return Number.isNaN(value.valueOf()) ? null : formatSqlDateTime(value);
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed?.y || !parsed?.m || !parsed?.d) return null;
    return formatSqlDateTime(
      new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, parsed.S || 0)
    );
  }

  const text = String(value).trim();
  if (!text) return null;

  // YYYY-MM-DD[ HH:MM[:SS]] — already the format MySQL wants.
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (match) {
    const [, y, mo, d, h = "00", mi = "00", s = "00"] = match;
    return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY, optional time — the common India-locale format.
  match = text.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i
  );
  if (match) {
    const [, d, mo, y, h = "0", mi = "0", s = "0", ampm] = match;
    const day = Number(d);
    const month = Number(mo);
    // JS's Date constructor silently overflows out-of-range day/month into
    // the next month/year (e.g. day 32 -> the 1st/2nd of the next month)
    // instead of failing, which would otherwise turn a typo'd date into a
    // wrong-but-valid-looking one. Reject anything outside the calendar
    // before it ever reaches new Date().
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    let hour = Number(h);
    if (ampm) {
      if (/pm/i.test(ampm) && hour < 12) hour += 12;
      if (/am/i.test(ampm) && hour === 12) hour = 0;
    }
    const date = new Date(Number(y), month - 1, day, hour, Number(mi), Number(s));
    // Still catches day-31-in-a-30-day-month etc: if the constructed date's
    // day doesn't match what was typed, it overflowed into the next month.
    if (date.getDate() !== day || date.getMonth() !== month - 1) return null;
    if (Number.isNaN(date.valueOf())) return null;
    return formatSqlDateTime(date);
  }

  // Last resort: things like "13-Jun-2026 14:30" that JS's own parser handles.
  const fallback = new Date(text);
  return Number.isNaN(fallback.valueOf()) ? null : formatSqlDateTime(fallback);
}

// getValue() returns "" for a missing/blank cell. mttr is the one numeric
// (DECIMAL) column fed from getValue() — this database isn't running in
// strict SQL mode (confirmed), so handing it an empty string silently stores
// 0.00 instead of NULL, indistinguishable from a genuine zero MTTR. Same bug
// class as the ETR date corruption above, just for a number instead of a
// date. All 3,707 existing rows happen to have a real MTTR value already, so
// this hasn't corrupted anything yet — but the next upload with a blank
// MTTR cell would.
function toDecimalOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(String(value).trim());
  return Number.isNaN(num) ? null : num;
}

function getValue(row, possibleKeys = []) {

  const normalizedRow = {};

  Object.keys(row || {}).forEach((key) => {

    normalizedRow[
      normalizeHeader(key)
    ] = row[key];

  });

  for (const key of possibleKeys) {

    const normalizedKey =
      normalizeHeader(key);

    if (
      normalizedRow[normalizedKey] !== undefined
    ) {
      return normalizedRow[normalizedKey];
    }

  }

  return "";

}

function readRowsFromFile(filePath) {

  const workbook = XLSX.readFile(filePath, {
    cellDates: true,
  });

  const sheet = workbook.Sheets[
    workbook.SheetNames[0]
  ];

  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false,
  });

  console.log("FIRST ROW =>", rows[0]);

  return rows;
}

function parseWorkbookDefaults(rows, fallback = {}) {
  if (!rows.length) {
    return {
      reportDate: fallback.reportDate || null,
      siteType: fallback.siteType || null,
      reportType: fallback.reportType || null,
      uploadedBy: fallback.uploadedBy || null,
    };
  }

  const first = rows[0];
  const normalized = {};

  Object.keys(first).forEach((key) => {
    normalized[normalizeHeader(key)] = first[key];
  });

  return {
    reportDate:
      normalizeDate(
        normalized.date ||
          normalized["report date"] ||
          normalized["upload date"]
      ) || fallback.reportDate || null,
    siteType:
      String(
        normalized["site type"] ||
          normalized.sitetype ||
          fallback.siteType ||
          ""
      ).trim() || null,
    reportType:
      String(
        normalized["report type"] ||
          normalized.reporttype ||
          fallback.reportType ||
          ""
      ).trim() || null,
    uploadedBy:
      String(
        normalized["uploaded by"] ||
          normalized.uploadedby ||
          fallback.uploadedBy ||
          ""
      ).trim() || null,
  };
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function getCurrentIstSqlDateTime() {
  return "DATE_FORMAT(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30'), '%Y-%m-%d %H:%i:%s')";
}

function sanitizeSpreadsheetValue(value) {
  if (typeof value !== "string") return value ?? "";

  // XML 1.0 forbids these characters, and an .xlsx file is a ZIP of XML files.
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, "");
}

function cleanNsoRows(rows) {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries({
        uid: row.uid,
        year: row.year,
        week: row.week,
        ticket_no: row.ticket_no,
        parent_ticket: row.parent_ticket,
        circle: row.circle,
        cmp: row.cmp,
        cmm_name: row.cmm_name,
        link_name: row.link_name,
        span_name: row.span_name,
        vendor_tt: row.vendor_tt,
        fibre_owner: row.fibre_owner,
        construction_type: row.construction_type,
        impact: row.impact,
        affected_service: row.affected_service,
        reason: row.reason,
        event_date: row.event_date,
        reported_to_fibre_noc: row.reported_to_fibre_noc,
        informed_date: row.informed_date,
        etr: row.etr,
        cleared_date: row.cleared_date,
        status: row.status,
        resolution: row.resolution,
        fault_description: row.fault_description,
        mttr: row.mttr,
        mttn: row.mttn,
        delay_reason: row.delay_reason,
        inter_intra_bin: row.inter_intra_bin,
        zone: row.zone,
        bucket: row.bucket,
        transport_ip_bin: row.transport_ip_bin,
        restoration_status: row.restoration_status,
        span_id: row.span_id,
        workorder: row.workorder,
        sp_name: row.sp_name,
        rca_cause_code: row.rca_cause_code,
        reason_high_mttr: row.reason_high_mttr,
        day: row.day,
        month: row.month,
        week_name: row.week_name,
        ttr_percentage: row.ttr_percentage,
        report_date: row.report_date,
      }).map(([key, value]) => [key, sanitizeSpreadsheetValue(value)])
    )
  );
}

function createWorkbookBuffer(rows, sheetName = "NSO Reports") {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
    compression: true,
  });
}

function sanitizeFileName(name) {
  return String(name || "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_.\-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "nso_report";
}

async function getRowsByIds(ids, authUser) {

  return query(
    `SELECT
        id,
        uploaded_by,
        report_date,
        file_name,
        original_name,
        original_file_name,
        total_records,
        uploaded_at
     FROM nso_report_files
     WHERE id IN (?)
       ${accessibleNsoFileExistsSql(authUser)}`,
    isAllCircle(authUser) ? [ids] : [ids, authUser.circle]
  );

}

router.get("/", async (req, res) => {
  try {
    await ensureNsoTable();
    const rows = await query(
  `SELECT
      id,
      uploaded_by,
      report_date,
      file_name,
      original_name,
      original_file_name,
      total_records,
      uploaded_at
   FROM nso_report_files
   WHERE 1=1
     ${accessibleNsoFileExistsSql(req.authUser)}
   ORDER BY report_date DESC, uploaded_at DESC, id DESC`
,
isAllCircle(req.authUser) ? [] : [req.authUser.circle]
);
    const rowsWithStatus = rows.map((row) => {
      const filePath = path.join(uploadsDir, row.file_name || "");
      return {
        ...row,
        file_missing: !row.file_name || !fs.existsSync(filePath),
      };
    });
    res.json({ rows: rowsWithStatus });
  } catch (error) {
    console.error("NSO list error:", error);
    res.status(500).json({ message: "Failed to fetch NSO reports" });
  }
});

router.get("/summary", async (req, res) => {
  try {
    await ensureNsoTable();

    const rows = await query(
      `SELECT
          COUNT(*) AS totalReports,

          COALESCE(
            (
              SELECT total_records
              FROM nso_report_files
              ORDER BY report_date DESC, uploaded_at DESC
              LIMIT 1
            ),
            0
          ) AS totalRecords,

          MAX(report_date) AS latestUploadAt

       FROM nso_report_files
       WHERE 1=1
         ${accessibleNsoFileExistsSql(req.authUser)}`,
      isAllCircle(req.authUser) ? [] : [req.authUser.circle]
    );

    res.json(rows[0] || {});
  } catch (error) {
    console.error("NSO summary error:", error);
    res.status(500).json({ message: "Failed to fetch NSO summary" });
  }
});

router.get("/circle-count", async (req, res) => {

  try {
    await ensureNsoTable();

    const rows = await query(`
      SELECT
        TRIM(circle) AS circle,
        COUNT(*) AS total
      FROM nso_reports
      WHERE circle IS NOT NULL
        AND TRIM(circle) <> ''
        AND report_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
        AND report_date <= CURDATE()
        ${isAllCircle(req.authUser) ? "" : "AND LOWER(TRIM(circle)) = LOWER(TRIM(?))"}

      GROUP BY TRIM(circle)
      ORDER BY total DESC
    `, isAllCircle(req.authUser) ? [] : [req.authUser.circle]);

    res.json(rows);

  } catch (error) {

    console.error("Circle count error:", error);

    res.status(500).json({
      message: "Failed to fetch circle counts",
    });

  }

});

router.get("/export", async (req, res) => {
  try {
    await ensureNsoTable();
   const rows = await query(
  `SELECT
      report_date,
      uploaded_by,
      original_name,
      total_records,
      uploaded_at
   FROM nso_report_files
   WHERE 1=1
     ${accessibleNsoFileExistsSql(req.authUser)}
   ORDER BY report_date DESC, uploaded_at DESC, id DESC`
,
isAllCircle(req.authUser) ? [] : [req.authUser.circle]
);

   const header = [
  "Uploaded By",
  "File Name",
  "Total Records",
  "Uploaded At",
];

    const body = rows.map((row) =>
      [
      row.uploaded_by,
      row.original_name || row.file_name,
      row.total_records,
      row.uploaded_at,
      ]
        .map(csvEscape)
        .join(",")
    );

    const csv = [header.join(","), ...body].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="nso-reports-${Date.now()}.csv"`
    );
    res.send(csv);
  } catch (error) {
    console.error("NSO export error:", error);
    res.status(500).json({ message: "Failed to export NSO reports" });
  }
});

router.get("/download/:id", async (req, res) => {
  try {
    const fileId = req.params.id;

    const metadata = await query(
      `SELECT original_name, original_file_name
       FROM nso_report_files
       WHERE id = ?
         ${accessibleNsoFileExistsSql(req.authUser)}`,
      isAllCircle(req.authUser) ? [fileId] : [fileId, req.authUser.circle]
    );

    if (!metadata.length) {
      return res.status(404).json({ message: "Report not found" });
    }

    const rows = await query(
      `SELECT
         uid,
         year,
         week,
         ticket_no,
         parent_ticket,
         circle,
         cmp,
         cmm_name,
         link_name,
         span_name,
         vendor_tt,
         fibre_owner,
         construction_type,
         impact,
         affected_service,
         reason,
         event_date,
         reported_to_fibre_noc,
         informed_date,
         etr,
         cleared_date,
         status,
         resolution,
         fault_description,
         mttr,
         mttn,
         delay_reason,
         inter_intra_bin,
         zone,
         bucket,
         transport_ip_bin,
         restoration_status,
         span_id,
         workorder,
         sp_name,
         rca_cause_code,
         reason_high_mttr,
         day,
         month,
         week_name,
         ttr_percentage,
         report_date
       FROM nso_reports
       WHERE file_id = ?
         ${isAllCircle(req.authUser) ? "" : "AND LOWER(TRIM(circle)) = LOWER(TRIM(?))"}`,
      isAllCircle(req.authUser) ? [fileId] : [fileId, req.authUser.circle]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "No data found" });
    }

    const cleanedRows = cleanNsoRows(rows);
    const workbookBuffer = createWorkbookBuffer(cleanedRows);

    const originalName = metadata[0].original_file_name || metadata[0].original_name || `nso_report_${fileId}`;
    const filename = `${sanitizeFileName(originalName.replace(/\.[^/.]+$/, ""))}.xlsx`;

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.end(workbookBuffer);
  } catch (error) {
    console.error("NSO download error:", error);
    res.status(500).json({ message: "Download failed" });
  }
});

router.post("/bulk-download", async (req, res) => {
  // Selecting many reports runs one query per file, sequentially, with no
  // protection against the database's default statement timeout (180s) —
  // reportRoutes.js's export already had to work around this same limit for
  // its much bigger tables. Checking out one dedicated connection and
  // raising the timeout on it for the whole loop, then putting it back the
  // way it was found, matches that existing pattern instead of inventing a
  // new one.
  const connection = await new Promise((resolve, reject) => {
    db.getConnection((err, conn) => (err ? reject(err) : resolve(conn)));
  });
  const runOnConnection = (sql, params = []) =>
    new Promise((resolve, reject) => {
      connection.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });

  let timeoutVariable = null;

  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) {
      return res.status(400).json({ message: "No reports selected" });
    }

    await ensureNsoTable();
    const files = await getRowsByIds(ids, req.authUser);

    for (const variable of ["max_statement_time", "max_execution_time"]) {
      try {
        await runOnConnection(`SET SESSION ${variable} = 0`);
        timeoutVariable = variable;
        break;
      } catch {
        // Unknown variable on this server (MariaDB vs MySQL naming) — try the other one.
      }
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="nso-reports.zip"');

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    for (const file of files) {
      const rows = await runOnConnection(
        `SELECT
           uid,
           year,
           week,
           ticket_no,
           parent_ticket,
           circle,
           cmp,
           cmm_name,
           link_name,
           span_name,
           vendor_tt,
           fibre_owner,
           construction_type,
           impact,
           affected_service,
           reason,
           event_date,
           reported_to_fibre_noc,
           informed_date,
           etr,
           cleared_date,
           status,
           resolution,
           fault_description,
           mttr,
           mttn,
           delay_reason,
           inter_intra_bin,
           zone,
           bucket,
           transport_ip_bin,
           restoration_status,
           span_id,
           workorder,
           sp_name,
           rca_cause_code,
           reason_high_mttr,
           day,
           month,
           week_name,
           ttr_percentage,
           report_date
         FROM nso_reports
         WHERE file_id = ?
           ${isAllCircle(req.authUser) ? "" : "AND LOWER(TRIM(circle)) = LOWER(TRIM(?))"}`,
        isAllCircle(req.authUser) ? [file.id] : [file.id, req.authUser.circle]
      );

      const cleanedRows = cleanNsoRows(rows);
      const workbookBuffer = createWorkbookBuffer(cleanedRows);
      const originalName = file.original_file_name || file.original_name || `nso_report_${file.id}`;
      const archiveName = `${sanitizeFileName(originalName.replace(/\.[^/.]+$/, ""))}.xlsx`;

      archive.append(workbookBuffer, { name: archiveName });
    }

    await archive.finalize();
  } catch (error) {
    console.error("NSO bulk download error:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Failed to download selected files" });
    } else {
      res.destroy(error);
    }
  } finally {
    if (timeoutVariable) {
      try {
        await runOnConnection(`SET SESSION ${timeoutVariable} = DEFAULT`);
      } catch (resetError) {
        console.error("NSO bulk download: failed to reset session timeout:", resetError.message);
      }
    }
    connection.release();
  }
});

router.post("/upload", (req, res) => {
  upload.single("file")(req, res, async (error) => {
    if (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      await ensureNsoTable();

      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: "File is required" });
      }

      const extension = file.originalname.split(".").pop().toLowerCase();
      if (!allowedExtensions.has(extension)) {
        return res.status(400).json({
          message: "Invalid file type. Please upload .xlsx, .xls, .xlsb, or .csv",
        });
      }

      const workbookRows = readRowsFromFile(file.path);
      if (!workbookRows.length) {
        return res.status(400).json({ message: "No rows found in uploaded file" });
      }

      const defaults = parseWorkbookDefaults(workbookRows, {
        reportDate: req.body.date,
        uploadedBy: req.body.uploadedBy,
      });
      const resolvedReportDate = defaults.reportDate || req.body.date || null;

      // There was no duplicate-upload check at all — re-uploading the same
      // file (or any file for a date already uploaded) silently inserted
      // every row a second time, with no warning. Tower Reports already
      // handles this with a full Replace/Skip dialog; this is the same
      // protection in its simplest safe form — block it and tell the user
      // to delete the existing report first, rather than building a new UI
      // flow for something that should be rare.
      if (resolvedReportDate) {
        const existingForDate = await query(
          `SELECT id, original_name FROM nso_report_files WHERE report_date = ? LIMIT 1`,
          [resolvedReportDate]
        );
        if (existingForDate.length) {
          return res.status(409).json({
            message:
              `A report for ${resolvedReportDate} has already been uploaded ` +
              `("${existingForDate[0].original_name}"). Delete it first if you want to replace it — ` +
              `uploading again would duplicate every row.`,
          });
        }
      }

      assertRowsAllowedCircle(req.authUser, workbookRows, (row) => getValue(row, ["circle"]));

const fileResult = await query(
  `INSERT INTO nso_report_files
(
  report_date,
  file_name,
  original_name,
  original_file_name,
  uploaded_by,
  total_records,
  uploaded_at
)
VALUES (?, ?, ?, ?, ?, ?, ${getCurrentIstSqlDateTime()})`,
[
  resolvedReportDate,
  file.filename,
  file.originalname,
  file.originalname,
  defaults.uploadedBy || "Admin",
  workbookRows.length,
]
);

const fileId = fileResult.insertId;

for (const row of workbookRows) {

console.log("ROW DATA =>", row);

console.log("MAPPED =>", {
  uid: getValue(row, ["uid"]),
  ticket_no: getValue(row, ["ticket_no"]),
  circle: getValue(row, ["circle"]),
  vendor_tt: getValue(row, ["vendor_tt"]),
});


 await query(
`
INSERT INTO nso_reports (
  file_id,
  uid,
  year,
  week,
  ticket_no,
  parent_ticket,
  circle,
  cmp,
  cmm_name,
  link_name,
  span_name,
  vendor_tt,
  fibre_owner,
  construction_type,
  impact,
  affected_service,
  reason,
  event_date,
  reported_to_fibre_noc,
  informed_date,
  etr,
  cleared_date,
  status,
  resolution,
  fault_description,
  mttr,
  mttn,
  delay_reason,
  inter_intra_bin,
  zone,
  bucket,
  transport_ip_bin,
  restoration_status,
  span_id,
  workorder,
  sp_name,
  rca_cause_code,
  reason_high_mttr,
  day,
  month,
  week_name,
  ttr_percentage,
  report_date,
  created_at
)
VALUES (
  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
 ?, ?, ?, NOW()
)
`,
[
  fileId,

 getValue(row, ["uid"]),
  getValue(row, ["year"]),
  getValue(row, ["week"]),

getValue(row, ["ticket_no"]),
getValue(row, ["parent_ticket"]),
getValue(row, ["circle"]),
getValue(row, ["cmp"]),
getValue(row, ["cmm_name"]),
getValue(row, ["link_name"]),
getValue(row, ["span_name"]),
getValue(row, ["vendor_tt"]),
getValue(row, ["fibre_owner"]),
getValue(row, ["construction_type"]),
getValue(row, ["impact"]),
getValue(row, ["affected_service"]),
getValue(row, ["reason"]),
parseExcelDateTime(getValue(row, ["event_date"])),
parseExcelDateTime(getValue(row, ["reported_to_fibre_noc"])),
parseExcelDateTime(getValue(row, ["informed_date"])),
parseExcelDateTime(getValue(row, ["etr"])),
parseExcelDateTime(getValue(row, ["cleared_date"])),
getValue(row, ["status"]),
getValue(row, ["resolution"]),
getValue(row, ["fault_description"]),
toDecimalOrNull(getValue(row, ["mttr"])),
// Every existing row has an empty mttn — the column exists (mttr, right
// next to it, is populated fine) but the exact key the uploaded files use
// doesn't match plain "mttn". Widened to common variants; if it's still
// blank after this, we need the exact header text from a real source file.
getValue(row, ["mttn", "mttn_mins", "mttnmins", "mean_time_to_notify"]),
getValue(row, ["delay_reason"]),
getValue(row, ["inter_intra_bin"]),
getValue(row, ["zone"]),
getValue(row, ["bucket"]),
getValue(row, ["transport_ip_bin"]),
getValue(row, ["restoration_status"]),
getValue(row, ["span_id"]),
getValue(row, ["workorder"]),
getValue(row, ["sp_name"]),
getValue(row, ["rca_cause_code"]),
getValue(row, ["reason_high_mttr"]),
getValue(row, ["day"]),
getValue(row, ["month"]),
getValue(row, ["week_name"]),
// Same situation as mttn above — widened to common variants.
getValue(row, ["ttr_percentage", "ttr", "ttrpercentage", "ttr_percent", "percentage_ttr"]),

  resolvedReportDate
]
);
}

      res.status(201).json({
        message: "NSO report uploaded successfully",
        totalRecords: workbookRows.length,
      });
    } catch (uploadError) {
      console.error("NSO upload error:", uploadError);
console.error("SQL Message:", uploadError.sqlMessage);
console.error("SQL:", uploadError.sql);
      res.status(500).json({ message: "NSO upload failed" });
    }
  });
});

router.put("/:id", async (req, res) => {
  try {
    await ensureNsoTable();
    const id = req.params.id;
    const { report_date, uploaded_by } = req.body;

await query(
  `UPDATE nso_report_files
   SET report_date = ?, uploaded_by = ?
   WHERE id = ?`,
  [report_date || null, uploaded_by || null, id]
);

await query(
  `UPDATE nso_reports
   SET report_date = ?
   WHERE file_id = ?`,
  [report_date || null, id]
);

    res.json({ message: "NSO report updated successfully" });
  } catch (error) {
    console.error("NSO update error:", error);
    res.status(500).json({ message: "Failed to update NSO report" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await ensureNsoTable();
    const rows = await getRowsByIds([req.params.id], req.authUser);
    const row = rows[0];

    if (!row) {
      return res.status(404).json({ message: "Report not found" });
    }

    const filePath = path.join(uploadsDir, row.file_name);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await query("DELETE FROM nso_reports WHERE file_id = ?", [req.params.id]);
    await query("DELETE FROM nso_report_files WHERE id = ?", [req.params.id]);
    res.json({ message: "NSO report deleted successfully" });
  } catch (error) {
    console.error("NSO delete error:", error);
    res.status(500).json({ message: "Failed to delete NSO report" });
  }
});

router.post("/bulk-delete", async (req, res) => {
  try {
    await ensureNsoTable();
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) {
      return res.status(400).json({ message: "No reports selected" });
    }

    const rows = await getRowsByIds(ids, req.authUser);
    rows.forEach((row) => {
      const filePath = path.join(uploadsDir, row.file_name);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

    await query("DELETE FROM nso_reports WHERE file_id IN (?)", [ids]);
    await query("DELETE FROM nso_report_files WHERE id IN (?)", [ids]);
    res.json({ message: "Selected NSO reports deleted successfully" });
  } catch (error) {
    console.error("NSO bulk delete error:", error);
    res.status(500).json({ message: "Failed to delete selected reports" });
  }
});

router.get("/kpi-dashboard", async (req, res) => {
  try {

    const rows = await query(`
     SELECT
  circle,
  cmp,
  year,
  week,

        COUNT(ticket_no) AS cuts,

        0 AS ftkm,

        ROUND(AVG(CAST(mttr AS DECIMAL(10,2))), 2) AS mttr

      FROM nso_reports

      WHERE 1=1
      ${isAllCircle(req.authUser)
        ? ""
        : "AND LOWER(TRIM(circle)) = LOWER(TRIM(?))"}

     GROUP BY
      circle,
      cmp,
      year,
      week

      ORDER BY
        year DESC,
        week DESC

    `, isAllCircle(req.authUser)
      ? []
      : [req.authUser.circle]);

    const groupedData = {};

    rows.forEach((row) => {

      if (!groupedData[row.cmp]) {

        groupedData[row.cmp] = {
          circle: row.circle,
          cmp: row.cmp,
          scope: 0,
          weeks: {}
        };

      }

      const weekKey = `${row.week}'${String(row.year).slice(-2)}`;

groupedData[row.cmp].weeks[weekKey] = {
        cuts: Number(row.cuts || 0),
        ftkm: Number(row.ftkm || 0),
        mttr: Number(row.mttr || 0)
      };

    });

    res.json(Object.values(groupedData));

  } catch (error) {

    console.error("KPI Dashboard Error:", error);

    res.status(500).json({
      message: "Failed to load KPI dashboard"
    });

  }
});

module.exports = router;
