const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const { db } = require("../config/db");

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

async function ensureNsoTable() {

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
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
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

function readRowsFromFile(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
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

async function getRowsByIds(ids) {

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
     WHERE id IN (?)`,
    [ids]
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
   ORDER BY report_date DESC, uploaded_at DESC, id DESC`
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

router.get("/summary", async (_req, res) => {
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

       FROM nso_report_files`
    );

    res.json(rows[0] || {});
  } catch (error) {
    console.error("NSO summary error:", error);
    res.status(500).json({ message: "Failed to fetch NSO summary" });
  }
});

router.get("/circle-count", async (_req, res) => {

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

      GROUP BY TRIM(circle)
      ORDER BY total DESC
    `);

    res.json(rows);

  } catch (error) {

    console.error("Circle count error:", error);

    res.status(500).json({
      message: "Failed to fetch circle counts",
    });

  }

});

router.get("/export", async (_req, res) => {
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
   ORDER BY report_date DESC, uploaded_at DESC, id DESC`
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

router.get("/download/:fileName", async (req, res) => {
  try {
    const decodedName = decodeURIComponent(req.params.fileName);
    const filePath = path.join(uploadsDir, decodedName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "File not found" });
    }

    res.download(filePath, decodedName);
  } catch (error) {
    console.error("NSO file download error:", error);
    res.status(500).json({ message: "Failed to download file" });
  }
});

router.post("/bulk-download", async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) {
      return res.status(400).json({ message: "No reports selected" });
    }

    await ensureNsoTable();
    const rows = await getRowsByIds(ids);

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="nso-reports.zip"');

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    rows.forEach((row) => {
      const target = path.join(uploadsDir, row.file_name);
      if (fs.existsSync(target)) {
        archive.file(target, {
          name: row.original_file_name || row.original_name || row.file_name,
        });
      }
    });

    await archive.finalize();
  } catch (error) {
    console.error("NSO bulk download error:", error);
    res.status(500).json({ message: "Failed to download selected files" });
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

 await query(
  `INSERT INTO nso_reports (

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

    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, NOW()

  )`,
  [

    fileId,

    row["UID"],

    row["Year"],

    row["Week"],

    row["Ticket No"],

    row["Parent Ticket"],

Object.keys(row).find(
  (key) => key.trim().toLowerCase() === "circle"
)
  ? row[
      Object.keys(row).find(
        (key) => key.trim().toLowerCase() === "circle"
      )
    ]
  : "",

    row["CMP"],

    row["CMM Name"],

    row["Link Name"],

    row["Span Name"],

    row["VendorTT"],

    Object.keys(row).find(
    (key) =>
    key.trim().toLowerCase() === "fibre owner"
   )
    ? row[
      Object.keys(row).find(
        (key) =>
          key.trim().toLowerCase() === "fibre owner"
      )
    ]
  : "",

    row["Construction Type"],

    row["Impact"],

    row["Affected Service"],

    row["Reason"],

    row["Event Date"],

    row["Reported To Fibre NOC"],

    row["Informed Date"],

    row["ETR"],

    row["Cleared Date"],

    row["Status"],

    row["Resolution"],

    row["Fault Description"],

    row["MTTR"],

    row["MTTN (min)"],

    row["Delay Reason"],

    row["Inter/Intra Bin"],

    row["Zone"],

    row["Bucket"],

    row["Transport IP BIN"],

    row["Restoration Status"],

    row["SpanId"],

    row["Workorder"],

    row["SP Name"],

    row["RCA Cause Code"],

    row["Reason for High MTTR(> 4hrs)"],

    row["Day"],

    row["Month"],

    row["Week"],

    row["TTR%AGE"],

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
    const rows = await getRowsByIds([req.params.id]);
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

    const rows = await getRowsByIds(ids);
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

module.exports = router;
