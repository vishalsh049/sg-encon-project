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

  const normalizeHeaderKey = (value = "") =>
    value
      .toString()
      .replace(/[\r\n]+/g, " ")
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

  const cleanRow = (row) => {
    const newRow = {};

    Object.keys(row || {}).forEach((key) => {
      newRow[normalizeHeaderKey(key)] = row[key];
    });

    return newRow;
  };

  const getRowValue = (row, aliases = [], fallback = "") => {
    for (const alias of aliases) {
      const normalizedAlias = normalizeHeaderKey(alias);
      const value = row[normalizedAlias];

      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }

    return fallback;
  };

  const getTextValue = (row, aliases = [], fallback = "") => {
    const value = getRowValue(row, aliases, fallback);
    return value === "" || value === null || value === undefined
      ? fallback
      : value.toString().trim();
  };

  const getNumberValue = (row, aliases = [], fallback = 0) => {
    const value = getRowValue(row, aliases, "");

    if (value === "" || value === null || value === undefined) {
      return fallback;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const getIdentifierValue = (row, aliases = [], fallback = "") => {
    const value = getRowValue(row, aliases, fallback);

    if (value === "" || value === null || value === undefined) {
      return fallback;
    }

    return value.toString().trim().replace(/\.0$/, "");
  };

  const parseExcelDate = (value) => {
    if (value === "" || value === null || value === undefined) {
      return null;
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }

    if (typeof value === "number") {
      const parsed = xlsx.SSF.parse_date_code(value);

      if (!parsed) {
        return null;
      }

      return new Date(
        parsed.y,
        parsed.m - 1,
        parsed.d,
        parsed.H || 0,
        parsed.M || 0,
        parsed.S || 0
      );
    }

    const text = value.toString().trim();

    if (!text) {
      return null;
    }

    const ddmmyyyyMatch = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (ddmmyyyyMatch) {
      const [, day, month, year] = ddmmyyyyMatch;
      const parsed = new Date(Number(year), Number(month) - 1, Number(day));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const yyyymmddMatch = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (yyyymmddMatch) {
      const [, year, month, day] = yyyymmddMatch;
      const parsed = new Date(Number(year), Number(month) - 1, Number(day));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const getDateValue = (row, aliases = []) => parseExcelDate(getRowValue(row, aliases, ""));

  const getFunctionCategory = (value) => {
    const normalized = (value || "").toString().trim().toLowerCase();

    if (!normalized) {
      return "others";
    }

    if (normalized.includes("fttx")) {
      return "fttx";
    }

    if (normalized.includes("fiber") || normalized.includes("fibre")) {
      return "fiber";
    }

    if (normalized.includes("utility")) {
      return "utility";
    }

    return "others";
  };

  const createFunctionSummary = () => ({
    fiber: 0,
    fttx: 0,
    utility: 0,
    others: 0,
  });

  const summarizeFunctionCounts = (items = []) => {
    const summary = createFunctionSummary();

    items.forEach((item) => {
      const category = getFunctionCategory(item);
      summary[category] += 1;
    });

    return summary;
  };

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

    router.get("/scrum/function-summary", (req, res) => {
      if (!isConnected()) {
        return res.status(503).json({ message: "DB not connected" });
      }

      const sql = `
        SELECT function_name
        FROM scrum_manpower
        WHERE UPPER(TRIM(vendor)) = 'S G ENCON PVT LTD'
          AND upload_batch_id = (
            SELECT upload_batch_id
            FROM scrum_manpower
            ORDER BY uploaded_at DESC
            LIMIT 1
          )
      `;

      db.query(sql, (err, result) => {
        if (err) {
          console.log("FUNCTION SUMMARY ERROR:", err);
          return res.status(500).json({ message: "Error fetching function summary" });
        }

        const summary = summarizeFunctionCounts(
          (result || []).map((row) => row.function_name)
        );

        res.json(summary);
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
      const workbook = xlsx.readFile(req.file.path, { cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(sheet, {
      defval: "",
      raw: true,
      blankrows: true
      });

      if (!data.length) {
        return res.status(400).json({ message: "Excel file is empty" });
      }

      console.log("Total Excel Rows:", data.length);
      console.log("Excel Keys:", Object.keys(data[0]));

const functionSummary = createFunctionSummary();

const values = data.map(originalRow => {
  const row = cleanRow(originalRow);
  const functionName = getTextValue(row, ["function name", "function_name"]);
  const functionCategory = getFunctionCategory(functionName);

  functionSummary[functionCategory] += 1;

  const mappedRow = [
  getTextValue(row, ["work order number", "work_order", "work order"]),
  getTextValue(row, ["state"]),
  getTextValue(row, ["maintenancepoint", "maintenance point", "mp"]),
  getTextValue(row, ["jc name"]),

  getTextValue(row, ["jc sap id", "jc_sap_id"]),
  getTextValue(row, ["sp resource name", "resource name", "resource_name"]),

  getDateValue(row, ["date of birth", "dob", "date_of_birth"]),

  functionName,
  getTextValue(row, ["job role", "job_role"]),

  getIdentifierValue(row, ["aadhar card number", "aadhar card", "aadhar_card"]),

  getDateValue(row, ["profile upload date", "profile_upload_date"]),
  getDateValue(row, ["date on which approved by level 1", "level1 approved date", "level1_approved_date"]),
  getDateValue(row, ["date on which approved by level 2", "level2 approved date", "level2_approved_date"]),

  getDateValue(row, ["date on which status changed to sas success", "sas success date", "sas_success_date"]),
  getDateValue(row, ["date on which cob done", "cob done date", "cob_done_date"]),

  getTextValue(row, ["qualification"]),
  getNumberValue(row, ["experience"], 0),

  getTextValue(row, ["sp vendor name", "vendor"]),
  getTextValue(row, ["pprj code", "pprj_code"]),
  getTextValue(row, ["card number", "card_number"]),
  getIdentifierValue(row, ["mobile number", "mobile", "mobile_number"]),
  getTextValue(row, ["email id", "email", "email_id"]),

  getTextValue(row, ["reporting manager", "reporting_manager"]),
  getTextValue(row, ["reporting manager email", "reporting manager email id", "reporting manager email id1", "reporting_manager_email"]),
  getTextValue(row, ["flow description", "flow_description"]),

  getTextValue(row, ["status"]),
  getTextValue(row, ["resource type", "resource_type"]),

  getTextValue(row, ["resource category", "resource_category"]),
  getDateValue(row, ["deactivated date", "deactivated_date"]),
  getTextValue(row, ["deactivated remarks", "deactivated_remarks"]),

  getIdentifierValue(row, ["imei number", "imei_number"]),
  getDateValue(row, ["card return date", "card returndate", "cardreturndate", "card_return_date"]),
  getDateValue(row, ["police noc date", "police_noc_date"]),
  getTextValue(row, ["deactivated reason", "deactivated_reason"]),

  uploadedAt,
  batchId,
  uploadedBy,
  uploadType,
  fileName,
  manualDate
];

  return mappedRow;
});

      console.log("NORMALIZED EXCEL KEYS:", Object.keys(cleanRow(data[0])));
      console.log("FIRST ROW VALUES FOR INSERT:", values[0]);

   const sql = `
INSERT INTO scrum_manpower (
work_order, state, maintenance_point, jc_name,
jc_sap_id, resource_name, date_of_birth,
function_name, job_role, aadhar_card,

profile_upload_date, level1_approved_date, level2_approved_date,
sas_success_date, cob_done_date,

qualification, experience,

vendor, pprj_code, card_number, mobile, email_id,

reporting_manager, reporting_manager_email,

flow_description, status, resource_type,

resource_category, deactivated_date, deactivated_remarks,
imei_number, card_return_date, police_noc_date, deactivated_reason,

uploaded_at, upload_batch_id, uploaded_by, upload_type, file_name, manual_date
)
VALUES ?
`;

      db.query(sql, [values], (err) => {
        if (err) {
          console.log("DB ERROR:", err); 
          return res.status(500).json(err);
        }

        res.json({
          message: "Upload successful",
          batchId,
          fileName,
          totalRecords: values.length,
          functionSummary,
        });
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
      const filePath = path.join(process.cwd(), "uploads", row.file_name);
            if (fs.existsSync(filePath)) {
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
