const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");
const router = express.Router();
const { db } = require("../config/db");

const uploadsDir = path.join(__dirname, "..", "uploads");
const ensureUploadsDir = () => {
  if (!fs.existsSync(uploadsDir)) {
   fs.mkdirSync(uploadsDir, { recursive: true });
  }
};
ensureUploadsDir();

// ✅ Storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureUploadsDir();
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const allowedExtensions = new Set(["xlsx", "xls", "xlsb", "csv"]);
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
});
const uploadMany = multer({
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
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  );
  await ensureColumn("report_uploads", "total_records", "INT NULL");
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

      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

const ensureEscTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS esc (
      id INT AUTO_INCREMENT PRIMARY KEY,
      file_id BIGINT,
      circle VARCHAR(50),
      cmp VARCHAR(100),
      date DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    `INSERT INTO esc (file_id, circle, cmp, date) VALUES ?`,
    [rows]
  );
};

const insertHpodscRows = async (rows) => {
  if (!rows.length) return;

  await query(
    `INSERT INTO hpodsc (file_id, circle, cmp, date) VALUES ?`,
    [rows]
  );
};

const insertOscRows = async (rows) => {
  if (!rows.length) return;
  const batchSize = 1000;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    await query(
      `INSERT INTO osc (file_id, circle, cmp, date, kpi_value) VALUES ?`,
      [batch]
    );
  }
};

const getLatestUploadRow = async (siteCategory) => {
  await ensureUploadsTable();
  const rows = await query(
    `SELECT id, file_name, report_date, total_records, uploaded_at
     FROM report_uploads
     WHERE site_category = ?
     ORDER BY report_date DESC, uploaded_at DESC, id DESC
     LIMIT 1`,
    [siteCategory]
  );
  return rows[0] || null;
};

const formatDateOnly = (value) => {
  if (!value) return null;
  const d = new Date(value + " 2026");
  if (Number.isNaN(d.valueOf())) return null;
  return d.toISOString().split("T")[0];
};

const normalizeDate = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString().split("T")[0];
  }
  if (typeof value === "number") {
    const parsed = xlsx.SSF.parse_date_code(value);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const mm = String(parsed.m).padStart(2, "0");
      const dd = String(parsed.d).padStart(2, "0");
      return `${parsed.y}-${mm}-${dd}`;
    }
  }
  const d = new Date(value);
  if (!Number.isNaN(d.valueOf())) {
    return d.toISOString().split("T")[0];
  }
  return null;
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
        .replace(/\s+/g, " ");

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
      cleanRow["overall cnum count"],
      cleanRow["overall cell outage (sec)"],
      cleanRow["overall cell availability"],
      cleanRow["cells up"]
    ]);

  }); // ✅ VERY IMPORTANT

  return { insertRows, errors };
};    
 // ✅ CLOSE forEach loop

const parseEscRows = (rows, fallbackDate, fileId) => {
  const insertRows = [];
  const errors = [];

  rows.forEach((row, index) => {
    const cleanRow = {};
    Object.keys(row).forEach((key) => {
      cleanRow[key.toLowerCase().trim()] = row[key];
    });

    const circle = cleanRow["circle"];
    const cmp = cleanRow["cmp"];
   const date = normalizeDate(fallbackDate);

    if (!circle || !cmp) {
      errors.push(index + 2);
      return;
    }

    insertRows.push([
      fileId,
      String(circle).trim(),
      String(cmp).trim(),
      date,
    ]);
  });

  return { insertRows, errors };
};

function parseHpodscRows(rows, fallbackDate, fileId) {
  const insertRows = [];

  rows.forEach((row) => {
   const cleanRow = {};
Object.keys(row).forEach((key) => {
  cleanRow[key.toLowerCase().trim()] = row[key];
});

    const circle = cleanRow["circle"];
    const cmp = cleanRow["cmp"];

    const date = normalizeDate(fallbackDate);

    insertRows.push([
      fileId,
      circle,
      cmp,
      date
    ]);
  });

  return { insertRows };
}

const readWorksheetRows = (filePath) => {
  const workbook = xlsx.readFile(filePath, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(worksheet, { defval: "" });

  if (!rows.length) {
    const error = new Error("No rows found in uploaded file");
    error.statusCode = 400;
    throw error;
  }

  return rows;
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

  if (["ag1", "ag2", "ila", "gnb", "gsc", "wifi"].includes(normalizedSiteType)) {
    const tableName = normalizedSiteType;

    await query(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        file_id BIGINT,
        circle VARCHAR(50),
        cmp VARCHAR(100),
        date DATE,
        kpi_value DECIMAL(12,4),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    const rows = await query(
      `SELECT id, site_category, report_date, site_type, report_type, upload_type, uploaded_by, file_name, uploaded_at
       FROM report_uploads
       WHERE site_category = ?
       ORDER BY uploaded_at DESC`,
      [siteCategory]
    );
    res.json({ rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Latest upload summary (file name + date + record count)
router.get("/latest-summary", async (req, res) => {
  try {
    const siteCategory = (req.query.siteCategory || "tower").toLowerCase();
    const latest = await getLatestUploadRow(siteCategory);

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
    const latest = await getLatestUploadRow(siteCategory);

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
    const latest = await getLatestUploadRow(siteCategory);

    if (!latest) {
      return res.json({ totalRecords: 0 });
    }

    res.json({ totalRecords: Number(latest.total_records || 0) });
  } catch (error) {
    console.error("Latest count error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Upload API with multer error handling
router.post("/upload", (req, res) => {
  ensureUploadsDir();
 upload.single("file")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }

    try {
      const { site_type, report_type, upload_type, date, uploadedBy } = req.body;
      const site_category = (req.body.siteCategory || "tower").toLowerCase();
      const uploadType = (upload_type || "single").toLowerCase();

      if (uploadType === "single") {
        if (!site_type || !report_type || !upload_type || !date || !uploadedBy) {
          return res.status(400).json({ message: "All fields are required" });
        }
      }

     const file = req.file;

if (!file) {
  return res.status(400).json({ message: "File required" });
}

const filePath = file.path;

if (!fs.existsSync(filePath)) {
  console.error("Upload file missing:", { filePath, file });
  return res.status(400).json({ message: "Uploaded file not found" });
}

const ext = file.originalname.split(".").pop().toLowerCase();
      if (!allowedExtensions.has(ext)) {
        return res.status(400).json({ message: "Invalid file type" });
      }

      await ensureUploadsTable();

      const workbook = xlsx.readFile(filePath, { cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json(worksheet, { defval: "" });
console.log("Excel Headers:", rows[0]);
      if (!rows.length) {
        return res
          .status(400)
          .json({ message: "No rows found in uploaded file" });
      }

      const fileId = Date.now();
      const totalRecords = rows.length;

// 🔥 enb Upload
if (site_type.toLowerCase() === "enb") {
  await ensureEnbTable();

  const { insertRows, errors } = parseEnbRows(rows, date, fileId);

  if (errors.length) {
    return res.status(400).json({
      message: `Missing required fields in rows: ${errors.join(", ")}`,
    });
  }

  await insertEnbRows(insertRows);
}

// 🔥 ESC Upload
else if (site_type.toLowerCase() === "esc") {

  await ensureEscTable();

  const { insertRows, errors } = parseEscRows(rows, date, fileId);

  if (errors.length) {
    return res.status(400).json({
      message: `Missing required fields in rows: ${errors.join(", ")}`,
    });
  }

  await insertEscRows(insertRows);
}

// 🔥 HPODSC Upload
else if (site_type.toLowerCase() === "hpodsc") {
  await ensureHpodscTable();
  const { insertRows } = parseHpodscRows(rows, date, fileId);

  await insertHpodscRows(insertRows);
}

// 🔥 ISC Upload  ✅ CORRECT PLACE
else if (site_type.toLowerCase() === "isc") {
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

    insertRows.push([
  fileId,
  String(circle).trim(),
  String(cmp).trim(),
  dateValue,
  1
]);
  });

  if (!insertRows.length) {
    return res.status(400).json({
      message:
        "ISC upload failed: no rows contained valid Circle/CMP values. Please verify the file headers.",
      detectedHeaders: Array.from(headerKeys).slice(0, 30),
    });
  }

  if (errors.length) {
    return res.status(400).json({
      message: `Missing required fields in rows: ${errors.join(", ")}`,
      detectedHeaders: Array.from(headerKeys).slice(0, 30),
    });
  }

  if (insertRows.length) {
    await query(
      `INSERT INTO isc (file_id, circle, cmp, date, kpi_value) VALUES ?`,
      [insertRows]
    );
  }
}

// 🔥 OSC Upload
else if (site_type.toLowerCase() === "osc") {
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

    insertRows.push([
      fileId,
      String(circle).trim(),
      String(cmp).trim(),
      dateValue,
      1,
    ]);
  });

  if (!insertRows.length) {
    return res.status(400).json({
      message:
        "OSC upload failed: no rows contained valid Circle/CMP values. Please verify the file headers.",
      detectedHeaders: Array.from(headerKeys).slice(0, 30),
    });
  }

  await insertOscRows(insertRows);
}

// 🔥 NEW SITE TYPES (AG1, AG2, ILA, GNB, GSC, WIFI)
else if (
  ["ag1", "ag2", "ila", "gnb", "gsc", "wifi"].includes(site_type.toLowerCase())
) {
  const tableName = site_type.toLowerCase();

  await query(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      file_id BIGINT,
      circle VARCHAR(50),
      cmp VARCHAR(100),
      date DATE,
      kpi_value DECIMAL(12,4),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

    insertRows.push([
      fileId,
      String(circle).trim(),
      String(cmp).trim(),
      dateValue,
      1,
    ]);
  });

  if (!insertRows.length) {
    return res.status(400).json({
      message: `${tableName.toUpperCase()} upload failed: no valid rows`,
    });
  }

  await query(
    `INSERT INTO ${tableName} (file_id, circle, cmp, date, kpi_value) VALUES ?`,
    [insertRows]
  );
}

      await query(
        `INSERT INTO report_uploads
        (site_category, report_date, site_type, report_type, upload_type, uploaded_by, file_name, total_records)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          site_category,
          date || null,
          site_type || null,
          report_type || null,
          upload_type || null,
          uploadedBy || "Admin",
          file.filename,
          totalRecords,
        ]
      );

      res.status(200).json({
        success: true,
        message: "File uploaded successfully",
        file: file.filename,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: "Upload failed" });
    }
  });
});

router.post("/bulk-delete", async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || ids.length === 0) {
      return res.status(400).json({ message: "No IDs provided" });
    }

    // get file names first
    const rows = await query(
      `SELECT file_name FROM report_uploads WHERE id IN (?)`,
      [ids]
    );

    // delete files
    rows.forEach((row) => {
      const filePath = path.join(__dirname, "..", "uploads", row.file_name);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

    // delete from DB
    await query(`DELETE FROM report_uploads WHERE id IN (?)`, [ids]);

    res.json({ message: "Deleted successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Bulk delete failed" });
  }
});

const archiver = require("archiver");

router.post("/bulk-download", async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || ids.length === 0) {
      return res.status(400).json({ message: "No IDs provided" });
    }

    const rows = await query(
      "SELECT file_name FROM report_uploads WHERE id IN (?)",
      [ids]
    );

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=reports.zip");

    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    archive.pipe(res);

    rows.forEach((row) => {
      const filePath = path.join(__dirname, "..", "uploads", row.file_name);

      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: row.file_name });
      }
    });

    await archive.finalize();

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Download failed" });
  }
});

// ✅ Manual bulk upload (multi-row form with multiple files)
router.post("/upload-bulk", (req, res) => {
  ensureUploadsDir();
  uploadMany.array("files")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }

    try {
      const site_category = (req.body.siteCategory || "tower").toLowerCase();
      const uploadedBy = req.body.uploadedBy || "Admin";
      const rawRows = req.body.rows ? JSON.parse(req.body.rows) : [];
      const files = req.files || [];
      const uploadedAt = new Date();

      if (!Array.isArray(rawRows) || rawRows.length === 0) {
        return res.status(400).json({ message: "No rows provided" });
      }

      if (!files.length) {
        return res.status(400).json({ message: "Files are required" });
      }

      const insertRows = [];
      const errors = [];
      const invalidFiles = [];

      for (const [index, row] of rawRows.entries()) {
        const { date, site_type, report_type, fileIndex } = row || {};
        const file = files[fileIndex];

        if (!date || !site_type || !report_type || !file) {
          errors.push(index + 1);
          continue;
        }

        const ext = file.originalname.split(".").pop().toLowerCase();
        if (!allowedExtensions.has(ext)) {
          invalidFiles.push(index + 1);
          continue;
        }

        const filePath = file.path;
        if (!fs.existsSync(filePath)) {
          errors.push(index + 1);
          continue;
        }

        const worksheetRows = readWorksheetRows(filePath);
        const fileId = Date.now() + index;

        const totalRecords = await processSiteUploadRows({
          siteType: site_type,
          rows: worksheetRows,
          date,
          fileId,
        });

        insertRows.push([
          site_category,
          date,
          String(site_type).trim(),
          String(report_type).trim(),
          "bulk",
          uploadedBy,
          file.filename,
          totalRecords,
        ]);
      }

      if (errors.length) {
        return res.status(400).json({
          message: `Missing required fields in rows: ${errors.join(", ")}`,
        });
      }
      if (invalidFiles.length) {
        return res.status(400).json({
          message: `Invalid file type in rows: ${invalidFiles.join(", ")}`,
        });
      }

      await ensureUploadsTable();
      await query(
        `INSERT INTO report_uploads
          (site_category, report_date, site_type, report_type, upload_type, uploaded_by, file_name, total_records)
          VALUES ?`,
        [insertRows]
      );

      res.status(200).json({
        success: true,
        message: "Bulk upload successful",
        count: insertRows.length,
      });
    } catch (error) {
      console.error(error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Upload failed",
        ...(error.details || {}),
      });
    }
  });
});

router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;

    // get file name first
    const rows = await query(
      "SELECT file_name FROM report_uploads WHERE id = ?",
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Record not found" });
    }

    const filePath = path.join(__dirname, "..", "uploads", rows[0].file_name);

    // delete file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // delete DB record
    await query("DELETE FROM report_uploads WHERE id = ?", [id]);

    res.json({ message: "Deleted successfully" });
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
