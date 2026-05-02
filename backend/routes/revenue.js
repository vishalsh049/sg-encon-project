const express = require("express");
const router = express.Router();
const fs = require("fs");
const XLSX = require("xlsx");
const { db } = require("../config/db");
const multer = require("multer");
const archiver = require("archiver");

const upload = multer({ dest: "uploads/" });

const mapRevenueRowToExcel = (row) => ({
  Circle: row.circle,
  Location: row.location,
  "CO Type": row.co_type,
  "CO Type Sub Catg": row.co_type_sub_catg,
  "JIO/RCOM": row.jio_rcom,
  "Sub category": row.sub_category,
  Description: row.description,
  "Item Code CM": row.item_code_cm,
  "Item Code PM": row.item_code_pm,
  "Service Description": row.service_description,
  UOM: row.uom,
  "Old CM Rate": row.old_cm_rate,
  "Old PM Rate": row.old_pm_rate,
  "New CM rate": row.new_cm_rate,
  "New PM rate": row.new_pm_rate,
  Rate: row.rate,
  Qty: row.qty,
});

// 🔥 Upload Excel → Save into DB
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const { uploadedBy, uploadTime, uploadDate } = req.body;
    const fileName = req.file.originalname;

    // 1. Read Excel
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    const normalizeHeader = (value) =>
      value?.toString()?.trim()?.toLowerCase()?.replace(/\s+/g, " ") || "";

    const headerMap = {
      circle: ["circle"],
      location: ["location"],
      co_type: ["co type", "co_type"],
      co_type_sub_catg: [
        "co type sub catg",
        "co type sub category",
        "co type sub catg.",
        "co type sub catg ",
        "co type s",
        "co type sub"
      ],
      jio_rcom: ["jio/rcom", "jio rcom", "jio", "rcom"],
      sub_category: ["sub category", "subcategory"],
      description: ["description", "desc"],
      item_code_cm: ["item code cm", "item_code_cm", "item code (cm)"],
      item_code_pm: ["item code pm", "item_code_pm", "item code (pm)"],
      service_description: ["service description", "service desc", "service"],
      uom: ["uom"],
      old_cm_rate: ["old cm rate", "old_cm_rate", "old cm rate "],
      old_pm_rate: ["old pm rate", "old_pm_rate", "old pm rate "],
      new_cm_rate: ["new cm rate", "new_cm_rate", "new cm rate "],
      new_pm_rate: ["new pm rate", "new_pm_rate", "new pm rate "],
      rate: ["rate", "unit rate", "unitprice"],
      qty: ["qty", "quantity", "qty."]
    };

    const normalizedHeaderMap = Object.entries(headerMap).reduce((acc, [key, aliases]) => {
      aliases.forEach((alias) => {
        acc[alias.trim().toLowerCase()] = key;
      });
      return acc;
    }, {});

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", header: 1 });

    const headerRowIndex = rows.findIndex((row) =>
      row.some((cell) => normalizeHeader(cell) === "circle") &&
      row.some((cell) => normalizeHeader(cell) === "location") &&
      row.some((cell) => normalizeHeader(cell).includes("co type"))
    );

    const headerRow = headerRowIndex >= 0 ? rows[headerRowIndex] : rows[0] || [];
    const dataRows = rows.slice((headerRowIndex >= 0 ? headerRowIndex : 0) + 1);

    const data = dataRows
      .map((row) => {
        const item = {};
        row.forEach((cell, index) => {
          const rawHeader = normalizeHeader(headerRow[index]);
          const mappedKey = normalizedHeaderMap[rawHeader];
          if (mappedKey) {
            item[mappedKey] = cell;
          }
        });
        return item;
      })
      .filter((row) => Object.values(row).some((value) => value !== "" && value !== null));

   console.log("Parsed rows:", data.length);
   console.log("Headers:", Object.keys(data[0] || {}));

   const cleanNumber = (val) => {
  if (!val) return 0;
  return Number(val.toString().replace(/,/g, ""));
};

const values = data.map((row) => {
  return [
    row.circle || null,
    row.location || null,
    row.co_type || null,
    row.co_type_sub_catg || null,
    row.jio_rcom || null,
    row.sub_category || null,
    row.description || null,

    row.item_code_cm || null,
    row.item_code_pm || null,

    row.service_description || null,
    row.uom || null,

    cleanNumber(row.old_cm_rate),
    cleanNumber(row.old_pm_rate),
    cleanNumber(row.new_cm_rate),
    cleanNumber(row.new_pm_rate),

    cleanNumber(row.rate),
    cleanNumber(row.qty),

    null,
  ];
});

    if (values.length === 0) {
      console.log("No valid rows found in uploaded Excel file.");
      try {
        await fs.promises.unlink(filePath);
      } catch (unlinkError) {
        console.warn("Could not delete uploaded file after invalid upload:", unlinkError);
      }

      return res.status(400).json({
        message: "No valid rows found in uploaded Excel file",
        total_rows: 0,
      });
    }

    const [uploadResult] = await db.promise().query(
      `INSERT INTO revenue_upload 
       (file_name, file_path, uploaded_by, upload_time, upload_date)
       VALUES (?, ?, ?, ?, ?)`,
      [fileName, filePath, uploadedBy, uploadTime, uploadDate]
    );

    const fileId = uploadResult.insertId;
    await db.promise().query(
      `UPDATE revenue_upload SET file_id = ? WHERE id = ?`,
      [fileId, fileId]
    );

    const preparedValues = values.map((rowValues) => {
      return [...rowValues.slice(0, -1), fileId];
    });

    // 4. Insert into DB
    const query = `
INSERT INTO revenue (
  circle,
  location,
  co_type,
  co_type_sub_catg,
  jio_rcom,
  sub_category,
  description,

  item_code_cm,
  item_code_pm,

  service_description,
  uom,

  old_cm_rate,
  old_pm_rate,
  new_cm_rate,
  new_pm_rate,

  rate,
  qty,
  file_id
) VALUES ?
`;

    await db.promise().query(query, [preparedValues]);

    console.log("Sending response:", {
  file_id: fileId,
  total_rows: preparedValues.length
});
    res.json({
      message: "Excel data inserted successfully",
      file_id: fileId,
      total_rows: values.length,
    });

  } catch (err) {
    console.error("ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/delete-bulk", async (req, res) => {
  try {
    let { ids } = req.body;

    console.log("DELETE IDS:", ids);

    // ✅ FIX 1: Ensure ids is array of numbers
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No IDs provided" });
    }

    ids = ids.map(id => Number(id));

    const placeholders = ids.map(() => "?").join(",");

    // ✅ DELETE FROM revenue TABLE
    await db.promise().query(
      `DELETE FROM revenue WHERE file_id IN (${placeholders})`,
      ids
    );

    // ✅ DELETE FROM revenue_upload TABLE
    await db.promise().query(
      `DELETE FROM revenue_upload WHERE file_id IN (${placeholders})`,
      ids
    );

    console.log("DELETE SUCCESS");

    res.json({ message: "Deleted successfully" });

  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/upload-history", async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      "SELECT * FROM revenue_upload ORDER BY id DESC"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/download-bulk", async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || ids.length === 0) {
      return res.status(400).send("No file ids provided");
    }

    const [uploads] = await db.promise().query(
      `SELECT id, file_name FROM revenue_upload WHERE id IN (${ids
        .map(() => "?")
        .join(",")})`,
      ids
    );

    if (!uploads.length) {
      return res.status(404).send("No uploads found");
    }

    // 🔥 ZIP setup
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=revenue_files.zip"
    );

    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    archive.on("error", (archiveErr) => {
      console.error("Archive error:", archiveErr);
      res.status(500).send("ZIP archive error");
    });

    archive.pipe(res);

    for (const fileId of ids) {
      const [rows] = await db.promise().query(
        "SELECT * FROM revenue WHERE file_id = ?",
        [fileId]
      );

      if (!rows.length) continue;

      const uploadMeta = uploads.find((item) => item.id === fileId);
      const filename = uploadMeta?.file_name
        ? `${uploadMeta.file_name.replace(/\.[^.]+$/, "") || `revenue_${fileId}`}.xlsx`
        : `revenue_${fileId}.xlsx`;

      const exportRows = rows.map(mapRevenueRowToExcel);
      const worksheet = XLSX.utils.json_to_sheet(exportRows, {
        header: [
          "Circle",
          "Location",
          "CO Type",
          "CO Type Sub Catg",
          "JIO/RCOM",
          "Sub category",
          "Description",
          "Item Code CM",
          "Item Code PM",
          "Service Description",
          "UOM",
          "Old CM Rate",
          "Old PM Rate",
          "New CM rate",
          "New PM rate",
          "Rate",
          "Qty",
        ],
      });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Revenue");

      const buffer = XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
      });

      archive.append(buffer, { name: filename });
    }

    await archive.finalize();
  } catch (err) {
    console.error(err);
    res.status(500).send("ZIP download failed");
  }
});

router.get("/data", async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      "SELECT rate, qty FROM revenue"
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/download/:fileId", async (req, res) => {
  try {
    const fileId = Number(req.params.fileId);

    const [rows] = await db.promise().query(
      "SELECT file_name, file_path FROM revenue_upload WHERE file_id = ?",
      [fileId]
    );

    if (!rows.length) {
      return res.status(404).send("File not found");
    }

    const file = rows[0];

    if (!file.file_path || !fs.existsSync(file.file_path)) {
      return res.status(404).send("Stored file not found on server");
    }

    return res.download(file.file_path, file.file_name);
  } catch (err) {
    console.error(err);
    res.status(500).send("Download error");
  }
});

// 🔥 KPI DATA API (WITH FILTER)
router.get("/kpi-data", async (req, res) => {
  try {
    const { circle } = req.query;

    let query = `
      SELECT
        AVG(old_cm_rate) AS oldCM,
        AVG(old_pm_rate) AS oldPM,
        AVG(new_cm_rate) AS newCM,
        AVG(new_pm_rate) AS newPM,
        SUM(qty) AS totalQty,
        SUM(rate * qty) AS totalRevenue,
        COUNT(*) AS rateQty,
        CASE WHEN SUM(qty) = 0 THEN 0 ELSE SUM(rate * qty) / SUM(qty) END AS avgRate
      FROM revenue
    `;

    console.log('KPI query:', query);
    console.log('KPI params:', { circle });

    const params = [];

    if (circle) {
      query += " WHERE circle = ?";
      params.push(circle);
    }

    const [rows] = await db.promise().query(query, params);

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;