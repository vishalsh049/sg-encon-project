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
    CREATE TABLE IF NOT EXISTS nso_reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      report_date DATE NULL,
      site_type VARCHAR(100) NULL,
      report_type VARCHAR(100) NULL,
      upload_type VARCHAR(30) NULL,
      uploaded_by VARCHAR(100) NULL,
      file_name VARCHAR(255) NULL,
      original_file_name VARCHAR(255) NULL,
      total_records INT DEFAULT 0,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const columns = [
    ["report_date", "DATE NULL"],
    ["original_file_name", "VARCHAR(255) NULL"],
    ["total_records", "INT DEFAULT 0"],
  ];

  for (const [column, definition] of columns) {
    try {
      await query(`ALTER TABLE nso_reports ADD COLUMN ${column} ${definition}`);
    } catch (error) {
      if (error?.code !== "ER_DUP_FIELDNAME") {
        throw error;
      }
    }
  }
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

async function getRowsByIds(ids) {
  return query(
    `SELECT id, report_date, site_type, report_type, upload_type, uploaded_by,
            file_name, original_file_name, total_records, uploaded_at
     FROM nso_reports
     WHERE id IN (?)`,
    [ids]
  );
}

router.get("/", async (req, res) => {
  try {
    await ensureNsoTable();
    const rows = await query(
      `SELECT id, report_date, site_type, report_type, upload_type, uploaded_by,
              file_name, original_file_name, total_records, uploaded_at
       FROM nso_reports
       ORDER BY uploaded_at DESC, id DESC`
    );
    res.json({ rows });
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
         COALESCE(SUM(total_records), 0) AS totalRecords,
         COUNT(DISTINCT site_type) AS totalSiteTypes,
         MAX(uploaded_at) AS latestUploadAt
       FROM nso_reports`
    );
    res.json(rows[0] || {});
  } catch (error) {
    console.error("NSO summary error:", error);
    res.status(500).json({ message: "Failed to fetch NSO summary" });
  }
});

router.get("/export", async (_req, res) => {
  try {
    await ensureNsoTable();
    const rows = await query(
      `SELECT report_date, site_type, report_type, upload_type, uploaded_by,
              original_file_name, total_records, uploaded_at
       FROM nso_reports
       ORDER BY uploaded_at DESC, id DESC`
    );

    const header = [
      "Report Date",
      "Site Type",
      "Report Type",
      "Upload Type",
      "Uploaded By",
      "File Name",
      "Total Records",
      "Uploaded At",
    ];

    const body = rows.map((row) =>
      [
        row.report_date,
        row.site_type,
        row.report_type,
        row.upload_type,
        row.uploaded_by,
        row.original_file_name || row.file_name,
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
          name: row.original_file_name || row.file_name,
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
        siteType: req.body.site_type,
        reportType: req.body.report_type,
        uploadedBy: req.body.uploadedBy,
      });

      await query(
        `INSERT INTO nso_reports
          (report_date, site_type, report_type, upload_type, uploaded_by, file_name, original_file_name, total_records)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          defaults.reportDate,
          defaults.siteType,
          defaults.reportType,
          (req.body.upload_type || "single").toLowerCase(),
          defaults.uploadedBy || "Admin",
          file.filename,
          file.originalname,
          workbookRows.length,
        ]
      );

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
    const { report_date, site_type, report_type, upload_type, uploaded_by } = req.body;

    await query(
      `UPDATE nso_reports
       SET report_date = ?, site_type = ?, report_type = ?, upload_type = ?, uploaded_by = ?
       WHERE id = ?`,
      [report_date || null, site_type || null, report_type || null, upload_type || null, uploaded_by || null, id]
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

    await query("DELETE FROM nso_reports WHERE id = ?", [req.params.id]);
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

    await query("DELETE FROM nso_reports WHERE id IN (?)", [ids]);
    res.json({ message: "Selected NSO reports deleted successfully" });
  } catch (error) {
    console.error("NSO bulk delete error:", error);
    res.status(500).json({ message: "Failed to delete selected reports" });
  }
});

module.exports = router;
