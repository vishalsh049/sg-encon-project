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
const { requirePagePermission } = require("../middleware/pagePermission");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

function applyRevenueCircleFilter(filters, params, authUser, column = "r.circle") {
  addCircleFilter(filters, params, authUser, column);
}

async function assertRevenueFilesAllowed(fileIds, authUser, message) {
  if (isAllCircle(authUser)) return;
  if (!fileIds.length) return;

  const placeholders = fileIds.map(() => "?").join(",");
  const [rows] = await db.promise().query(
    `SELECT DISTINCT circle
     FROM revenue
     WHERE file_id IN (${placeholders})`,
    fileIds
  );

  assertRowsAllowedCircle(authUser, rows, (row) => row.circle, message);
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

const REVENUE_EXPORT_HEADERS = [
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
];

function buildRevenueWorkbookBuffer(rows) {
  const worksheet = XLSX.utils.json_to_sheet(rows.map(mapRevenueRowToExcel), {
    header: REVENUE_EXPORT_HEADERS,
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Revenue");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

// Shared WHERE-clause builder for the line-item data view and its export -
// keeps the two endpoints (paginated vs. full) from drifting apart.
function buildRevenueDataFilters(req) {
  const filters = [];
  const params = [];
  applyRevenueCircleFilter(filters, params, req.authUser, "r.circle");

  const billingMonth = String(req.query.billingMonth || "").trim();
  if (billingMonth) {
    filters.push("ru.billing_month = ?");
    params.push(billingMonth);
  }

  // An all-circle user narrowing to one circle from the dropdown; a
  // circle-restricted user is already scoped by applyRevenueCircleFilter above.
  const circle = String(req.query.circle || "").trim();
  if (circle && isAllCircle(req.authUser)) {
    filters.push("LOWER(TRIM(r.circle)) = LOWER(TRIM(?))");
    params.push(circle);
  }

  const domain = String(req.query.domain || "").trim();
  if (domain) {
    filters.push("r.domain = ?");
    params.push(domain);
  }

  const search = String(req.query.search || "").trim();
  if (search) {
    filters.push(
      "(r.location LIKE ? OR r.description LIKE ? OR r.co_type LIKE ? OR r.co_type_sub_catg LIKE ? OR r.service_description LIKE ? OR r.sub_category LIKE ?)"
    );
    const like = `%${search}%`;
    params.push(like, like, like, like, like, like);
  }

  return { filters, params };
}

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

router.post("/upload", requirePagePermission("revenue", "edit"), upload.single("file"), async (req, res) => {
  let filePath;

  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    filePath = req.file.path;
    const { uploadedBy, uploadTime, billingMonth } = req.body;
    const fileName = req.file.originalname;

    if (!String(billingMonth || "").trim()) {
      return res.status(400).json({ message: "Billing month is required" });
    }

    if (!String(uploadedBy || "").trim()) {
      return res.status(400).json({ message: "Uploaded-by name is required" });
    }

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

    // Same circle + billing month already uploaded -> reject rather than
    // silently double-counting that month's revenue totals.
    const distinctCircles = Array.from(
      new Set(data.map((row) => String(row.circle || "").trim()).filter(Boolean))
    );

    if (distinctCircles.length && billingMonth) {
      const [existing] = await db.promise().query(
        `SELECT DISTINCT r.circle
         FROM revenue r
         INNER JOIN revenue_upload ru ON ru.file_id = r.file_id
         WHERE ru.billing_month = ?
           AND LOWER(TRIM(r.circle)) IN (${distinctCircles.map(() => "LOWER(TRIM(?))").join(",")})`,
        [billingMonth, ...distinctCircles]
      );

      if (existing.length) {
        return res.status(409).json({
          message: `Revenue for ${existing.map((r) => r.circle).join(", ")} is already uploaded for ${billingMonth}. Delete the existing upload first if you want to replace it.`,
        });
      }
    }

    const preparedValuesTemplate = values.map((rowValues) => rowValues.slice(0, -1));

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

    // Everything below runs in one transaction: a failure partway through a
    // large chunked insert must not leave a revenue_upload row pointing at
    // half-loaded data.
    const connection = await db.promise().getConnection();
    let fileId;

    try {
      await connection.beginTransaction();

      const [uploadResult] = await connection.query(
        `INSERT INTO revenue_upload
         (file_name, file_path, uploaded_by, upload_time, billing_month)
         VALUES (?, ?, ?, ?, ?)`,
        [fileName, filePath, uploadedBy, uploadTime, billingMonth]
      );

      fileId = uploadResult.insertId;

      await connection.query(
        "UPDATE revenue_upload SET file_id = ? WHERE id = ?",
        [fileId, fileId]
      );

      const preparedValues = preparedValuesTemplate.map((rowValues) => [...rowValues, fileId]);
      const valueChunks = chunkArray(preparedValues, 1000);

      for (const chunk of valueChunks) {
        await connection.query(insertRevenueQuery, [chunk]);
      }

      await connection.commit();
    } catch (txErr) {
      await connection.rollback();
      throw txErr;
    } finally {
      connection.release();
    }

    // Parsed rows are now the source of truth in the DB - downloads are
    // regenerated from there, so the raw upload doesn't need to persist on disk.
    fs.promises.unlink(filePath).catch(() => {});

    res.json({
      message: "Excel data inserted successfully",
      file_id: fileId,
      total_rows: values.length,
    });
  } catch (err) {
    console.error("ERROR:", err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post("/delete-bulk", requirePagePermission("revenue", "delete"), async (req, res) => {
  try {
    const ids = normalizeIds(req.body.ids);

    if (ids.length === 0) {
      return res.status(400).json({ message: "No IDs provided" });
    }

    const placeholders = ids.map(() => "?").join(",");

    const [files] = await db.promise().query(
      `SELECT file_path FROM revenue_upload WHERE file_id IN (${placeholders})`,
      ids
    );

    await assertRevenueFilesAllowed(
      ids,
      req.authUser,
      "You cannot delete another circle's data."
    );

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

    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get("/upload-history", requirePagePermission("revenue", "view"), async (req, res) => {
  try {
    const params = [];
    const filters = [];
    applyRevenueCircleFilter(filters, params, req.authUser, "r.circle");

    // revenue_upload itself has no circle column (one upload can contain
    // several circles' rows) -> derive it per-upload from revenue so the
    // frontend has something real to filter/search/display against. Scoped
    // by the same circle-access filter so a restricted user never sees a
    // foreign circle's name even when they share a mixed upload.
    const circleFilterSql = filters.length ? ` AND ${filters.join(" AND ")}` : "";

    const [rows] = await db.promise().query(
      `SELECT ru.*,
         (SELECT GROUP_CONCAT(DISTINCT r.circle ORDER BY r.circle SEPARATOR ', ')
          FROM revenue r
          WHERE r.file_id = ru.file_id${circleFilterSql}) AS circles
       FROM revenue_upload ru
       ${filters.length ? "WHERE EXISTS (SELECT 1 FROM revenue r WHERE r.file_id = ru.file_id AND " + filters.join(" AND ") + ")" : ""}
       ORDER BY ru.id DESC`,
      [...(filters.length ? params : []), ...params]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/circles", requirePagePermission("revenue", "view"), async (req, res) => {
  try {
    const params = [];
    const filters = ["circle IS NOT NULL", "TRIM(circle) != ''"];
    applyRevenueCircleFilter(filters, params, req.authUser, "circle");

    const [rows] = await db.promise().query(
      `SELECT DISTINCT TRIM(circle) AS circle
       FROM revenue
       WHERE ${filters.join(" AND ")}
       ORDER BY circle`,
      params
    );

    res.json({ circles: rows.map((r) => r.circle).filter(Boolean) });
  } catch (err) {
    res.status(500).json({ error: err.message, circles: [] });
  }
});

router.get("/data", requirePagePermission("revenue", "view"), async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
    const offset = (page - 1) * pageSize;

    const { filters, params } = buildRevenueDataFilters(req);
    const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const [countRows] = await db.promise().query(
      `SELECT COUNT(*) AS total
       FROM revenue r
       INNER JOIN revenue_upload ru ON ru.file_id = r.file_id
       ${whereSql}`,
      params
    );

    const [rows] = await db.promise().query(
      `SELECT r.*, ru.billing_month
       FROM revenue r
       INNER JOIN revenue_upload ru ON ru.file_id = r.file_id
       ${whereSql}
       ORDER BY r.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({
      rows,
      total: countRows[0]?.total || 0,
      page,
      pageSize,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/data/export", requirePagePermission("revenue", "download"), async (req, res) => {
  try {
    const { filters, params } = buildRevenueDataFilters(req);
    const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const [rows] = await db.promise().query(
      `SELECT r.*
       FROM revenue r
       INNER JOIN revenue_upload ru ON ru.file_id = r.file_id
       ${whereSql}
       ORDER BY r.id DESC`,
      params
    );

    if (!rows.length) {
      return res.status(404).send("No revenue data found for the selected filters");
    }

    const buffer = buildRevenueWorkbookBuffer(rows);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", 'attachment; filename="revenue_data_export.xlsx"');
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).send(err.message || "Export failed");
  }
});

router.post("/download-bulk", requirePagePermission("revenue", "download"), async (req, res) => {
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

    await assertRevenueFilesAllowed(
      ids,
      req.authUser,
      "You cannot download another circle's data."
    );

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

      const buffer = buildRevenueWorkbookBuffer(rows);

      archive.append(buffer, { name: filename });
    }

    await archive.finalize();
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).send(err.message || "ZIP download failed");
  }
});

router.get("/download/:fileId", requirePagePermission("revenue", "download"), async (req, res) => {
  try {
    const fileId = Number(req.params.fileId);

    const [uploadRows] = await db.promise().query(
      "SELECT file_name FROM revenue_upload WHERE file_id = ?",
      [fileId]
    );

    if (!uploadRows.length) {
      return res.status(404).send("File not found");
    }

    await assertRevenueFilesAllowed(
      [fileId],
      req.authUser,
      "You cannot download another circle's data."
    );

    // Rebuilt from the revenue table rather than served off disk - the raw
    // upload isn't kept around (see /upload), and this way a download can
    // never go stale relative to what's actually in the DB.
    const [rows] = await db.promise().query(
      `SELECT *
       FROM revenue r
       WHERE r.file_id = ?${isAllCircle(req.authUser) ? "" : " AND LOWER(TRIM(r.circle)) = LOWER(TRIM(?))"}`,
      isAllCircle(req.authUser) ? [fileId] : [fileId, req.authUser.circle]
    );

    if (!rows.length) {
      return res.status(404).send("No revenue rows found for this upload");
    }

    const buffer = buildRevenueWorkbookBuffer(rows);
    const baseName =
      uploadRows[0].file_name?.replace(/\.[^.]+$/, "").replace(/["\r\n]/g, "") ||
      `revenue_${fileId}`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${baseName}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).send(err.message || "Download error");
  }
});

router.get("/kpi-data", requirePagePermission("revenue", "view"), async (req, res) => {
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

    // A circle-restricted user's own circle is already enforced above; an
    // all-circle user picking a specific circle from the dashboard dropdown
    // narrows the KPI totals to just that circle.
    const requestedCircle = String(req.query.circle || "").trim();
    if (requestedCircle && isAllCircle(req.authUser)) {
      filters.push("LOWER(TRIM(r.circle)) = LOWER(TRIM(?))");
      params.push(requestedCircle);
    }

    const requestedBillingType = String(req.query.billing_type || "").trim();
    if (requestedBillingType) {
      filters.push("r.domain = ?");
      params.push(requestedBillingType);
    }

    if (filters.length) {
      query += ` AND ${filters.join(" AND ")}`;
    }

    const [rows] = await db.promise().query(query, params);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
