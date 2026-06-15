const express = require("express");
const fs = require("fs");
const XLSX = require("xlsx");
const multer = require("multer");
const archiver = require("archiver");
const { db } = require("../config/db");
const {
  addCircleFilter,
  assertRowsAllowedCircle,
  isAllCircle,
} = require("../middleware/circleAccess");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

function applyRevenueCircleFilter(filters, params, authUser, column = "r.circle") {
  addCircleFilter(filters, params, authUser, column);
}

async function assertRevenueFilesAllowed(fileIds, authUser) {
  if (isAllCircle(authUser)) return;
  if (!fileIds.length) return;

  const placeholders = fileIds.map(() => "?").join(",");
  const [rows] = await db.promise().query(
    `SELECT DISTINCT circle
     FROM revenue
     WHERE file_id IN (${placeholders})`,
    fileIds
  );

  assertRowsAllowedCircle(authUser, rows, (row) => row.circle);
}

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
  "CM Rate": row.cm_rate,
  "PM Rate": row.pm_rate,
  "CM Qty": row.cm_qty,
  "PM Qty": row.pm_qty,
  "CM Amount": row.cm_amount,
  "PM Amount": row.pm_amount,
  "Ideal PM Amount": row.ideal_pm_amount,
  "PM Loss": row.pm_loss,
  Domain: row.domain,
});

const cleanNumber = (value) => {
  if (value === null || value === undefined || value === "" || value === "-") {
    return 0;
  }

  const num = Number(value.toString().replace(/,/g, ""));
  return Number.isNaN(num) ? 0 : num;
};

const normalizeHeader = (value) =>
  value?.toString()?.trim()?.toLowerCase()?.replace(/\s+/g, " ") || "";

const normalizeIds = (ids) =>
  Array.isArray(ids)
    ? ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    : [];

const hasMeaningfulRevenueData = (row) => {
  const textFields = [
    row.circle,
    row.location,
    row.co_type,
    row.co_type_sub_catg,
    row.jio_rcom,
    row.sub_category,
    row.description,
    row.item_code_cm,
    row.item_code_pm,
    row.service_description,
    row.uom,
  ];

  const numericFields = [
    row.cm_rate,
    row.pm_rate,
    row.cm_qty,
    row.pm_qty,
    row.cm_amount,
    row.pm_amount,
    row.ideal_pm_amount,
    row.pm_loss,
  ];

  const hasText = textFields.some((value) => {
    if (value === null || value === undefined) {
      return false;
    }

    return String(value).trim() !== "";
  });

  const hasNumeric = numericFields.some((value) => cleanNumber(value) !== 0);

  return hasText || hasNumeric;
};

const chunkArray = (items, chunkSize) => {
  const chunks = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
};

router.post("/upload", upload.single("file"), async (req, res) => {
  let filePath;

  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    filePath = req.file.path;
    const { uploadedBy, uploadTime, billingMonth } = req.body;
    const fileName = req.file.originalname;

    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

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
        "co type sub",
      ],
      jio_rcom: ["jio/rcom", "jio rcom", "jio", "rcom"],
      sub_category: ["sub category", "subcategory"],
      description: ["description", "desc"],
      item_code_cm: ["item code cm", "item_code_cm", "item code (cm)"],
      item_code_pm: ["item code pm", "item_code_pm", "item code (pm)"],
      service_description: [
        "service description",
        "service desription",
        "service desc",
        "service",
      ],
      uom: ["uom"],
      cm_rate: ["cm rate", "cm_rate"],
      pm_rate: ["pm rate", "pm_rate"],
      cm_qty: ["cm qty", "cm_qty"],
      pm_qty: ["pm qty", "pm_qty"],
      cm_amount: ["cm amount", "cm_amount"],
      pm_amount: ["pm amount", "pm_amount"],
      ideal_pm_amount: ["ideal pm amount", "ideal_pm_amount"],
      pm_loss: ["pm loss", "pm_loss"],
      domain: ["domain"],
    };

    const normalizedHeaderMap = Object.entries(headerMap).reduce(
      (acc, [key, aliases]) => {
        aliases.forEach((alias) => {
          acc[alias.trim().toLowerCase()] = key;
        });
        return acc;
      },
      {}
    );

   const rows = XLSX.utils.sheet_to_json(sheet, {
  defval: "",
  header: 1,
  blankrows: false,
});

    const headerRowIndex = rows.findIndex(
      (row) =>
        row.some((cell) => normalizeHeader(cell) === "circle") &&
        row.some((cell) => normalizeHeader(cell) === "location") &&
        row.some((cell) => normalizeHeader(cell).includes("co type"))
    );

    const headerRow = headerRowIndex >= 0 ? rows[headerRowIndex] : rows[0] || [];
    const dataRows = rows.slice(
  (headerRowIndex >= 0 ? headerRowIndex : 0) + 1
);
   const filteredRows = dataRows.filter(
  (row) =>
    Array.isArray(row) &&
    row.some(
      (cell) =>
        cell !== null &&
        cell !== undefined &&
        cell.toString().trim() !== ""
    )
);

    const data = filteredRows
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
      .filter(hasMeaningfulRevenueData);

    console.log("Parsed rows:", data.length);
    console.log("Headers:", Object.keys(data[0] || {}));

    const values = data.map((row) => [
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
      cleanNumber(row.cm_rate),
      cleanNumber(row.pm_rate),
      cleanNumber(row.cm_qty),
      cleanNumber(row.pm_qty),
      cleanNumber(row.cm_amount),
      cleanNumber(row.pm_amount),
      cleanNumber(row.ideal_pm_amount),
      cleanNumber(row.pm_loss),
      row.domain || null,
      null,
    ]);

    if (values.length === 0) {
      return res.status(400).json({
        message: "No valid rows found in uploaded Excel file",
        total_rows: 0,
      });
    }

    assertRowsAllowedCircle(req.authUser, data, (row) => row.circle);

    const [uploadResult] = await db.promise().query(
      `INSERT INTO revenue_upload
       (file_name, file_path, uploaded_by, upload_time, billing_month)
       VALUES (?, ?, ?, ?, ?)`,
      [fileName, filePath, uploadedBy, uploadTime, billingMonth]
    );

    const fileId = uploadResult.insertId;

    await db.promise().query(
      "UPDATE revenue_upload SET file_id = ? WHERE id = ?",
      [fileId, fileId]
    );

    const preparedValues = values.map((rowValues) => [
      ...rowValues.slice(0, -1),
      fileId,
    ]);

    const insertRevenueQuery = `
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
        cm_rate,
        pm_rate,
        cm_qty,
        pm_qty,
        cm_amount,
        pm_amount,
        ideal_pm_amount,
        pm_loss,
        domain,
        file_id
      ) VALUES ?
    `;

    const valueChunks = chunkArray(preparedValues, 1000);

    for (const chunk of valueChunks) {
      await db.promise().query(insertRevenueQuery, [chunk]);
    }

    console.log("Sending response:", {
      file_id: fileId,
      total_rows: preparedValues.length,
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
    const ids = normalizeIds(req.body.ids);

    console.log("DELETE IDS:", ids);

    if (ids.length === 0) {
      return res.status(400).json({ message: "No IDs provided" });
    }

    const placeholders = ids.map(() => "?").join(",");

    const [files] = await db.promise().query(
      `SELECT file_path FROM revenue_upload WHERE file_id IN (${placeholders})`,
      ids
    );

    await assertRevenueFilesAllowed(ids, req.authUser);

    await db.promise().query(
      `DELETE FROM revenue WHERE file_id IN (${placeholders})`,
      ids
    );

    await db.promise().query(
      `DELETE FROM revenue_upload WHERE file_id IN (${placeholders})`,
      ids
    );

    for (const file of files) {
      if (file?.file_path && fs.existsSync(file.file_path)) {
        try {
          await fs.promises.unlink(file.file_path);
        } catch (unlinkError) {
          console.warn("Could not delete revenue upload file:", unlinkError);
        }
      }
    }

    console.log("DELETE SUCCESS");
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/upload-history", async (req, res) => {
  try {
    const params = [];
    const filters = [];
    applyRevenueCircleFilter(filters, params, req.authUser, "r.circle");

    const [rows] = await db.promise().query(
      `SELECT ru.*
       FROM revenue_upload ru
       ${filters.length ? "WHERE EXISTS (SELECT 1 FROM revenue r WHERE r.file_id = ru.file_id AND " + filters.join(" AND ") + ")" : ""}
       ORDER BY ru.id DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/download-bulk", async (req, res) => {
  try {
    const ids = normalizeIds(req.body.ids);

    if (ids.length === 0) {
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

    await assertRevenueFilesAllowed(ids, req.authUser);

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
        `SELECT *
         FROM revenue r
         WHERE r.file_id = ?${isAllCircle(req.authUser) ? "" : " AND LOWER(TRIM(r.circle)) = LOWER(TRIM(?))"}`,
        isAllCircle(req.authUser) ? [fileId] : [fileId, req.authUser.circle]
      );

      if (!rows.length) {
        continue;
      }

      const uploadMeta = uploads.find((item) => Number(item.id) === Number(fileId));
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
          "CM Rate",
          "PM Rate",
          "CM Qty",
          "PM Qty",
          "CM Amount",
          "PM Amount",
          "Ideal PM Amount",
          "PM Loss",
          "Domain",
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
    const params = [];
    const filters = [];
    applyRevenueCircleFilter(filters, params, req.authUser, "r.circle");

    const [rows] = await db.promise().query(`
      SELECT
        cm_rate,
        pm_rate,
        cm_qty,
        pm_qty,
        cm_amount,
        pm_amount,
        ideal_pm_amount,
        pm_loss
      FROM revenue r
      ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
    `, params);

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

    await assertRevenueFilesAllowed([fileId], req.authUser);

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

router.get("/kpi-data", async (req, res) => {
  try {
  let query = `
  SELECT

    SUM(r.cm_amount + r.pm_amount) AS totalRevenue,

    SUM(r.cm_amount) AS totalCMAmount,

    SUM(r.pm_amount) AS totalPMAmount,

    SUM(
      CASE
        WHEN r.domain = 'FTTx'
        THEN (r.cm_amount + r.pm_amount)
        ELSE 0
      END
    ) AS totalFTTx,

    SUM(
      CASE
        WHEN r.domain = 'Fiber'
        THEN (r.cm_amount + r.pm_amount)
        ELSE 0
      END
    ) AS totalFiber,

    SUM(
      CASE
        WHEN r.domain = 'Tower'
        THEN (r.cm_amount + r.pm_amount)
        ELSE 0
      END
    ) AS totalTower

  FROM revenue r
  INNER JOIN revenue_upload ru
    ON r.file_id = ru.file_id

  WHERE ru.billing_month = (
    SELECT MAX(billing_month)
    FROM revenue_upload
  )
`;

    const params = [];

    const filters = [];
    applyRevenueCircleFilter(filters, params, req.authUser, "r.circle");
    if (filters.length) {
      query += ` AND ${filters.join(" AND ")}`;
    }

    console.log("KPI query:", query);
    console.log("KPI params:", params);

    const [rows] = await db.promise().query(query, params);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
