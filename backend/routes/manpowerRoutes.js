    const express = require("express");
    const router = express.Router();
    const { db, isConnected } = require("../config/db");
    const multer = require("multer");
    const xlsx = require("xlsx");
    const path = require("path");
    const archiver = require("archiver");
    const fs = require("fs");

    // storage
  const storage = multer.diskStorage({
    destination: "uploads/",
    filename: (req, file, cb) => {
      const uniqueName = Date.now() + "_" + file.originalname;
      cb(null, uniqueName);
    },
  });

  const upload = multer({ storage });

    // ✅ 1. SCRUM COUNT (FIRST)
    router.get("/scrum/count", (req, res) => {
      if (!isConnected()) {
        return res.status(503).json({ message: "DB not connected" });
      }

  const sql = `
    SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN status='Active' THEN 1 ELSE 0 END) as active,
  SUM(CASE WHEN status!='Active' THEN 1 ELSE 0 END) as inactive
FROM scrum_manpower 
WHERE UPPER(TRIM(vendor)) = 'S G ENCON PVT LTD'
AND manual_date = (
  SELECT MAX(manual_date) FROM scrum_manpower
)
  `;

      db.query(sql, (err, result) => {
        if (err) return res.status(500).json(err);
        res.json(result[0]);
      });
    });

    // ✅ 2. SCRUM DATA
    router.get("/scrum", (req, res) => {
      const latestBatchQuery = `
        SELECT upload_batch_id 
        FROM scrum_manpower 
        ORDER BY uploaded_at DESC 
        LIMIT 1
      `;

      db.query(latestBatchQuery, (err, batchResult) => {
        if (err) return res.status(500).json(err);

        if (batchResult.length === 0) return res.json([]);

        const batchId = batchResult[0].upload_batch_id;

      db.query(
    "SELECT * FROM scrum_manpower WHERE upload_batch_id = ? AND UPPER(TRIM(vendor)) = ?",
    [batchId, "S G ENCON PVT LTD"],
    (err, result) => {
      if (err) return res.status(500).json(err);
      res.json(result);
    }
  );
      });
    });

    // ✅ 3. DEFAULT MANPOWER (LAST)
    router.get("/", (_req, res) => {
      if (!isConnected()) {
        return res
          .status(503)
          .json({ message: "Database not connected. Check DB settings." });
      }

      db.query(
        "SELECT id, role, status FROM manpower ORDER BY id DESC",
        (err, rows) => {
          if (err) {
            return res.status(500).json({ message: err.message });
          }
          res.json(rows);
        }
      );
    });

    router.get("/scrum/latest-upload", (req, res) => {

      const sql = `
        SELECT 
          upload_batch_id,
          manual_date,
          uploaded_by,
          upload_type,
          file_name,
          uploaded_at
        FROM scrum_manpower
        ORDER BY uploaded_at DESC
        LIMIT 1
      `;

      db.query(sql, (err, result) => {
        if (err) return res.status(500).json(err);

        res.json(result[0] || {});
      });

    });

  router.get("/download/:fileName", (req, res) => {
    const decodedName = decodeURIComponent(req.params.fileName);
    const filePath = path.join(__dirname, "../uploads", decodedName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "File not found" });
    }

    res.download(filePath, decodedName, (err) => {
      if (err && !res.headersSent) {
        console.log("DOWNLOAD ERROR:", err);
        res.status(500).json({ message: "File not found" });
      }
    });
  });

    router.get("/scrum/uploads", (req, res) => {
    const sql = `
     SELECT 
  upload_batch_id,
  manual_date,
  MAX(uploaded_at) as uploaded_at,
  MAX(uploaded_by) as uploaded_by,
  MAX(file_name) as file_name
FROM scrum_manpower
GROUP BY upload_batch_id, manual_date
ORDER BY uploaded_at DESC
    `;

    db.query(sql, (err, result) => {
      if (err) return res.status(500).json(err);
      res.json(result);
    });
  });

    // ✅ 4. SCRUM UPLOAD 

    router.post("/scrum/upload", upload.single("file"), (req, res) => {

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const batchId = "BATCH_" + Date.now();
    const uploadType = "Bulk";
    const uploadedBy = req.body.uploaded_by || "Admin";
    const uploadedAt = new Date();
    const manualDate = req.body.upload_date;

    const fileName = req.file.filename;

    try {
      const workbook = xlsx.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(sheet, {
      defval: "",
      raw: false,
      blankrows: true
      });
      console.log("Total Excel Rows:", data.length);

    const values = data.map(row => [
    row["Work Order Number"]?.toString().trim() || "",
    row["State"]?.toString().trim() || "",
    row["MaintenancePoint"]?.toString().trim() || "",
    row["JC Name"]?.toString().trim() || "",
    row["SP Resource name"]?.toString().trim() || "",
    row["Job Role"]?.toString().trim() || "",
    row["SP Vendor name"]?.toString().trim().toUpperCase() || "",
    row["Mobile Number"]?.toString().trim() || "",
    row["Status"]?.toString().trim() || "",
    uploadedAt,
    batchId,
    uploadedBy,
    uploadType,
    fileName,
    manualDate 
  ]);

      const sql = `
        INSERT INTO scrum_manpower 
        (work_order, state, maintenance_point, jc_name, resource_name, job_role, vendor, mobile, status, uploaded_at, upload_batch_id, uploaded_by, upload_type, file_name, manual_date)
        VALUES ?
      `;

      db.query(sql, [values], (err) => {
        if (err) {
          console.log("DB ERROR:", err); 
          return res.status(500).json(err);
        }

        res.json({ message: "Upload successful" });
      });

    } catch (err) {
    console.log("UPLOAD ERROR:", err);
    res.status(500).json({ message: err.message });
  }
  });

    // CREATE
    router.post("/", (req, res) => {
      if (!isConnected()) {
        return res.status(503).json({
          message: "Database not connected. Check DB settings.",
        });
      }

      const { role, status } = req.body || {};

      if (!role || !status) {
        return res.status(400).json({ message: "role and status are required" });
      }

      db.query(
        "INSERT INTO manpower (role, status) VALUES (?, ?)",
        [role, status],
        (err, result) => {
          if (err) {
            return res.status(500).json({ message: err.message });
          }
          res.status(201).json({ id: result.insertId, role, status });
        }
      );
    });

  router.post("/download/bulk", (req, res) => {
    const { batchIds } = req.body;

    if (!batchIds || batchIds.length === 0) {
      return res.status(400).json({ message: "No files selected" });
    }

    const placeholders = batchIds.map(() => "?").join(",");
    const sql = `
      SELECT upload_batch_id, file_name
      FROM scrum_manpower
      WHERE upload_batch_id IN (${placeholders})
      GROUP BY upload_batch_id, file_name
    `;

    db.query(sql, batchIds, (err, rows) => {
      if (err) {
        console.log("BULK DOWNLOAD ERROR:", err);
        return res.status(500).json({ message: "Bulk download failed" });
      }

      if (!rows.length) {
        return res.status(404).json({ message: "No files found for selected items" });
      }

      const archive = archiver("zip", { zlib: { level: 9 } });

      archive.on("error", (archiveErr) => {
        console.log("ARCHIVE ERROR:", archiveErr);
        if (!res.headersSent) {
          res.status(500).json({ message: "Bulk download failed" });
        }
      });

      res.attachment("scrum_files.zip");
      archive.pipe(res);

      rows.forEach((row) => {
      const filePath = path.join(process.cwd(), "uploads", row.file_name);      if (fs.existsSync(filePath)) {
          archive.file(filePath, { name: row.file_name });
        }
      });

      archive.finalize();
    });
  });

  router.delete("/upload/bulk", (req, res) => {
    const { batchIds } = req.body;

    if (!batchIds || batchIds.length === 0) {
      return res.status(400).json({ message: "No batchIds provided" });
    }

    const placeholders = batchIds.map(() => "?").join(",");
    const selectSql = `
      SELECT upload_batch_id, file_name
      FROM scrum_manpower
      WHERE upload_batch_id IN (${placeholders})
      GROUP BY upload_batch_id, file_name
    `;
    const deleteSql = `DELETE FROM scrum_manpower WHERE upload_batch_id IN (${placeholders})`;

    db.query(selectSql, batchIds, (selectErr, rows) => {
      if (selectErr) {
        console.log("BULK DELETE SELECT ERROR:", selectErr);
        return res.status(500).json({ message: "Bulk delete failed" });
      }

      db.query(deleteSql, batchIds, (err) => {
        if (err) {
          console.log("BULK DELETE ERROR:", err);
          return res.status(500).json({ message: "Bulk delete failed" });
        }

        rows.forEach((row) => {
      const filePath = path.join(process.cwd(), "uploads", row.file_name);        if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
            } catch (fileErr) {
              console.log("BULK DELETE FILE ERROR:", fileErr);
            }
          }
        });

        res.json({ message: "Selected files deleted successfully" });
      });
    });
  });

  router.delete("/upload/:batchId", (req, res) => {
    const { batchId } = req.params;
    const selectSql = `
      SELECT file_name
      FROM scrum_manpower
      WHERE upload_batch_id = ?
      GROUP BY file_name
    `;
    const deleteSql = "DELETE FROM scrum_manpower WHERE upload_batch_id = ?";

    db.query(selectSql, [batchId], (selectErr, rows) => {
      if (selectErr) {
        console.log("DELETE SELECT ERROR:", selectErr);
        return res.status(500).json({ message: "Delete failed" });
      }

      db.query(deleteSql, [batchId], (err) => {
        if (err) {
          console.log("DELETE ERROR:", err);
          return res.status(500).json({ message: "Delete failed" });
        }

        rows.forEach((row) => {
          const filePath = path.join(process.cwd(), "uploads", row.file_name);
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
            } catch (fileErr) {
              console.log("DELETE FILE ERROR:", fileErr);
            }
          }
        });

        res.json({ message: "File deleted successfully" });
      });
    });
  });

   router.get("/scrum/job-role-summary", (req, res) => {
  const sql = `
    SELECT 
     CASE
  WHEN job_role LIKE 'Analyst%' THEN 'Analyst'
  WHEN job_role LIKE 'Assistant Splicer%' THEN 'Assistant Splicer'
  WHEN job_role LIKE 'FTTx%' THEN 'FTTx'
  WHEN job_role LIKE 'IBS%' THEN 'IBS'
  WHEN job_role LIKE 'Large Facility%' THEN 'Large Facility'
  WHEN job_role LIKE 'OMCR%' THEN 'OMCR'
  WHEN job_role LIKE 'Patroller%' THEN 'Patroller'
  WHEN job_role LIKE 'Splicer%' THEN 'Splicer'
  WHEN job_role LIKE 'State%' THEN 'State'
  WHEN job_role LIKE 'Utility%' THEN 'Utility'

  WHEN job_role = 'CMP Lead' THEN 'CMP Lead'
  WHEN job_role = 'Fibre Engineer' THEN 'Fibre Engineer'
  WHEN job_role = 'Fibre Supervisor' THEN 'Fibre Supervisor'
  WHEN job_role = 'ISP Engineer' THEN 'ISP Engineer'
  WHEN job_role = 'MP Office staff' THEN 'MP Office staff'
  WHEN job_role = 'Rigger' THEN 'Rigger'
  WHEN job_role = 'SHQ Office Staff' THEN 'SHQ Office Staff'
  WHEN job_role = 'Vendor SPOC' THEN 'Vendor SPOC'
  WHEN job_role = 'Warehouse Incharge cum Security' THEN 'Warehouse Incharge cum Security'

  ELSE job_role
END AS category,
      COUNT(*) AS total
    FROM scrum_manpower
    WHERE 
      UPPER(TRIM(vendor)) = 'S G ENCON PVT LTD'
      AND manual_date = (
        SELECT MAX(manual_date) FROM scrum_manpower
      )
    GROUP BY category
    HAVING category IS NOT NULL
    ORDER BY total DESC
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.log("ROLE SUMMARY ERROR:", err);
      return res.status(500).json({ message: "Error fetching summary" });
    }
    res.json(result);
  });
});

    module.exports = router;
