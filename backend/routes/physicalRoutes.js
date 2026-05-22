const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const { db } = require("../config/db");

const router = express.Router();
const uploadDir = path.join(__dirname, "../uploads");

function ensureUploadsDir() {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
}

ensureUploadsDir();



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

const getConnection = () =>
  new Promise((resolve, reject) => {
    db.getConnection((err, conn) => {
      if (err) return reject(err);
      resolve(conn);
    });
  });

async function ensureColumn(table, column, definition) {
  try {
    await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (error) {
    if (error?.code !== "ER_DUP_FIELDNAME") {
      throw error;
    }
  }
}

async function ensurePhysicalTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS physical_reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      file_name VARCHAR(255) NOT NULL,
      original_name VARCHAR(255) DEFAULT NULL,
      file_path TEXT NOT NULL,
      file_size BIGINT DEFAULT NULL,
      total_records INT DEFAULT 0,
      report_date DATE DEFAULT NULL,
      uploaded_by VARCHAR(255) DEFAULT NULL,
      upload_status VARCHAR(50) DEFAULT 'SUCCESS',
      uploaded_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      report_id INT DEFAULT NULL
    )
  `);

  const reportColumns = [
    ["original_name", "VARCHAR(255) DEFAULT NULL"],
    ["file_path", "TEXT NOT NULL"],
    ["file_size", "BIGINT DEFAULT NULL"],
    ["total_records", "INT DEFAULT 0"],
    ["report_date", "DATE DEFAULT NULL"],
    ["uploaded_by", "VARCHAR(255) DEFAULT NULL"],
    ["upload_status", "VARCHAR(50) DEFAULT 'SUCCESS'"],
    ["uploaded_at", "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP"],
    ["created_at", "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP"],
    ["report_id", "INT DEFAULT NULL"],
  ];

  for (const [column, definition] of reportColumns) {
    await ensureColumn("physical_reports", column, definition);
  }

  await query(`
    UPDATE physical_reports
    SET uploaded_at = created_at
    WHERE created_at IS NOT NULL
      AND (uploaded_at IS NULL OR uploaded_at > created_at)
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS physical (
      id INT AUTO_INCREMENT PRIMARY KEY,
      pprj_status VARCHAR(100) DEFAULT NULL,
      pprj_code VARCHAR(100) DEFAULT NULL,
      employee_code VARCHAR(100) DEFAULT NULL,
      employee_name VARCHAR(255) DEFAULT NULL,
      father_name VARCHAR(255) DEFAULT NULL,
      function_name VARCHAR(100) DEFAULT NULL,
      job_role_actual_cmp_verify VARCHAR(255) DEFAULT NULL,
      job_role VARCHAR(255) DEFAULT NULL,
      manpower_signoff_scope VARCHAR(255) DEFAULT NULL,
      scrum_job_role VARCHAR(255) DEFAULT NULL,
      circle VARCHAR(100) DEFAULT NULL,
      cluster VARCHAR(100) DEFAULT NULL,
      mobile_number VARCHAR(20) DEFAULT NULL,
      dob DATE DEFAULT NULL,
      age INT DEFAULT NULL,
      date_of_joining DATE DEFAULT NULL,
      employment_status VARCHAR(100) DEFAULT NULL,
      resigned_date DATE DEFAULT NULL,
      last_working_date DATE DEFAULT NULL,
      rm_code VARCHAR(100) DEFAULT NULL,
      reporting_manager VARCHAR(255) DEFAULT NULL,
      company_email_id VARCHAR(255) DEFAULT NULL,
      laptop_status VARCHAR(100) DEFAULT NULL,
      ifsc_code VARCHAR(50) DEFAULT NULL,
      bank_account_no VARCHAR(100) DEFAULT NULL,
      pan_no VARCHAR(50) DEFAULT NULL,
      aadhaar_no VARCHAR(50) DEFAULT NULL,
      uan_no VARCHAR(50) DEFAULT NULL,
      esic_ip_no VARCHAR(50) DEFAULT NULL,
      esic_cmp VARCHAR(100) DEFAULT NULL,
      remarks TEXT DEFAULT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      report_id INT DEFAULT NULL,
      cmp VARCHAR(100) DEFAULT NULL
    )
  `);

  const physicalColumns = [
    ["report_id", "INT DEFAULT NULL"],
    ["cmp", "VARCHAR(100) DEFAULT NULL"],
    ["pprj_status", "VARCHAR(100) DEFAULT NULL"],
    ["pprj_code", "VARCHAR(100) DEFAULT NULL"],
    ["employee_code", "VARCHAR(100) DEFAULT NULL"],
    ["employee_name", "VARCHAR(255) DEFAULT NULL"],
    ["father_name", "VARCHAR(255) DEFAULT NULL"],
    ["function_name", "VARCHAR(100) DEFAULT NULL"],
    ["job_role_actual_cmp_verify", "VARCHAR(255) DEFAULT NULL"],
    ["job_role", "VARCHAR(255) DEFAULT NULL"],
    ["manpower_signoff_scope", "VARCHAR(255) DEFAULT NULL"],
    ["scrum_job_role", "VARCHAR(255) DEFAULT NULL"],
    ["circle", "VARCHAR(100) DEFAULT NULL"],
    ["cluster", "VARCHAR(100) DEFAULT NULL"],
    ["mobile_number", "VARCHAR(20) DEFAULT NULL"],
    ["dob", "DATE DEFAULT NULL"],
    ["age", "INT DEFAULT NULL"],
    ["date_of_joining", "DATE DEFAULT NULL"],
    ["employment_status", "VARCHAR(100) DEFAULT NULL"],
    ["resigned_date", "DATE DEFAULT NULL"],
    ["last_working_date", "DATE DEFAULT NULL"],
    ["rm_code", "VARCHAR(100) DEFAULT NULL"],
    ["reporting_manager", "VARCHAR(255) DEFAULT NULL"],
    ["company_email_id", "VARCHAR(255) DEFAULT NULL"],
    ["laptop_status", "VARCHAR(100) DEFAULT NULL"],
    ["ifsc_code", "VARCHAR(50) DEFAULT NULL"],
    ["bank_account_no", "VARCHAR(100) DEFAULT NULL"],
    ["pan_no", "VARCHAR(50) DEFAULT NULL"],
    ["aadhaar_no", "VARCHAR(50) DEFAULT NULL"],
    ["uan_no", "VARCHAR(50) DEFAULT NULL"],
    ["esic_ip_no", "VARCHAR(50) DEFAULT NULL"],
    ["esic_cmp", "VARCHAR(100) DEFAULT NULL"],
    ["remarks", "TEXT DEFAULT NULL"],
  ];

  for (const [column, definition] of physicalColumns) {
    await ensureColumn("physical", column, definition);
  }
}

function normalizeDate(value) {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.valueOf())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function toNullableInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseInt(String(value).replace(/,/g, "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function mapPhysicalRow(row, reportId) {
  return [
    reportId,
    toText(row["PPRJ Status"]),
    toText(row["PPRJ code"]),
    toText(row["Employee Code"]),
    toText(row["Employee Name"]),
    toText(row["Father Name"]),
    toText(row.Function),
    toText(row["Job Role_Actual_CMP Verify"]),
    toText(row["Job Role"]),
    toText(row["Manpower SignOff Scope"]),
    toText(row["Scrum Job Role"]),
    toText(row.Circle),
    toText(row.Cluster),
    toText(row["Mobile number"]),
    normalizeDate(row.DOB),
    toNullableInt(row.AGE),
    normalizeDate(row["Date of joining"]),
    toText(row["Employment Status"]),
    normalizeDate(row["Resigned Date"]),
    normalizeDate(row["Last Working Date"]),
    toText(row["RM Code"]),
    toText(row["Reporting manager"]),
    toText(row["Company Email id"]),
    toText(row["Laptop Status"]),
    toText(row["IFSC Code"]),
    toText(row["Bank Account No."]),
    toText(row.PANNO),
    toText(row["AADHAAR NO"]),
    toText(row["UAN No"]),
    toText(row["ESIC IP No "]),
    toText(row["ESIC CMP"]),
    toText(row.Remarks),
    null,
  ];
}

async function insertPhysicalRows(conn, reportId, rows) {
  if (!rows.length) return;

  const insertSql = `
    INSERT INTO physical (
      report_id,
      pprj_status,
      pprj_code,
      employee_code,
      employee_name,
      father_name,
      function_name,
      job_role_actual_cmp_verify,
      job_role,
      manpower_signoff_scope,
      scrum_job_role,
      circle,
      cluster,
      mobile_number,
      dob,
      age,
      date_of_joining,
      employment_status,
      resigned_date,
      last_working_date,
      rm_code,
      reporting_manager,
      company_email_id,
      laptop_status,
      ifsc_code,
      bank_account_no,
      pan_no,
      aadhaar_no,
      uan_no,
      esic_ip_no,
      esic_cmp,
      remarks,
      cmp
    ) VALUES ?
  `;

  const chunkSize = 250;

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize).map((row) => mapPhysicalRow(row, reportId));
    await conn.promise().query(insertSql, [chunk]);
  }
}

router.get("/", async (_req, res) => {
  try {
    await ensurePhysicalTables();

    const rows = await query(
      `
       SELECT
  id,
  employee_name,
  employee_code,
  circle,
  job_role,
  employment_status,
  report_id
FROM physical
  ORDER BY report_date DESC, id DESC
  LIMIT 1
)
ORDER BY id DESC
      `
    );

    res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("Physical data fetch error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
});

router.post("/upload-report", upload.single("file"), async (req, res) => {
  let conn;

  try {
    await ensurePhysicalTables();

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

  const allowedExtensions = [
  ".xlsx",
  ".xls",
  ".csv",
  ".xlsb",
];

const fileExtension = path.extname(
  req.file.originalname
).toLowerCase();

if (!allowedExtensions.includes(fileExtension)) {

  return res.status(400).json({
    success: false,
    message:
      "Only XLSX, XLS and CSV files are allowed",
  });

}

    const reportDate = normalizeDate(req.body.report_date);
    const uploadedBy = toText(req.body.uploaded_by) || "Admin";

    const workbook = XLSX.read(req.file.buffer, {
     type: "buffer",
     cellDates: true,
      });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null });

    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message: "No rows found in uploaded file",
      });
    }

    conn = await getConnection();
    await conn.promise().beginTransaction();

    const [reportResult] = await conn.promise().query(
      `
        INSERT INTO physical_reports (
          file_name,
          original_name,
          file_path,
          file_size,
          total_records,
          report_date,
          uploaded_by,
          upload_status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
     [
  `physical_${Date.now()}.xlsx`,
  req.file.originalname,
  null,
  req.file.size,
        rows.length,
        reportDate,
        uploadedBy,
        "SUCCESS",
      ]
    );

    await insertPhysicalRows(conn, reportResult.insertId, rows);
    await conn.promise().commit();

    res.status(200).json({
      success: true,
      message: "Report Uploaded Successfully",
      reportId: reportResult.insertId,
      totalRecords: rows.length,
    });
  } catch (error) {
    if (conn) {
      try {
        await conn.promise().rollback();
      } catch (rollbackError) {
        console.error("Physical upload rollback error:", rollbackError);
      }
    }

    console.error("Physical upload error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server Error",
    });
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

router.get("/reports", async (_req, res) => {
  try {
    await ensurePhysicalTables();

    const rows = await query(`
      SELECT
        id,
        file_name,
        original_name,
        file_path,
        file_size,
        total_records,
        report_date,
        uploaded_by,
        upload_status,
        uploaded_at,
        created_at
      FROM physical_reports
      ORDER BY uploaded_at DESC, id DESC
      LIMIT 200
    `);

    res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("Physical reports fetch error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
});

router.delete("/delete-report/:id", async (req, res) => {
  const reportId = Number(req.params.id);

  if (!Number.isInteger(reportId) || reportId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid report ID",
    });
  }

  try {
    await ensurePhysicalTables();

    const [report] = await query(
      `SELECT id, file_path FROM physical_reports WHERE id = ? LIMIT 1`,
      [reportId]
    );

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    await query(`DELETE FROM physical WHERE report_id = ?`, [reportId]);
    await query(`DELETE FROM physical_reports WHERE id = ?`, [reportId]);

    if (report.file_path && fs.existsSync(report.file_path)) {
      try {
        fs.unlinkSync(report.file_path);
      } catch (unlinkError) {
        console.error("Failed to delete physical report file:", unlinkError);
      }
    }

    res.status(200).json({
      success: true,
      message: "Report deleted successfully",
    });
  } catch (error) {
    console.error("Physical report delete error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
});

router.get("/download/:id", async (req, res) => {

  const reportId = Number(req.params.id);

  try {

    const rows = await query(
      `
      SELECT *
      FROM physical
      WHERE report_id = ?
      `,
      [reportId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "No data found",
      });
    }

    const workbook = XLSX.utils.book_new();

    const worksheet = XLSX.utils.json_to_sheet(rows);

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Physical Report"
    );

    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=physical_report_${reportId}.xlsx`
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.send(buffer);

  } catch (error) {

    console.log(error);

    res.status(500).json({
      success: false,
      message: "Download failed",
    });

  }

});

router.get("/job-role-count", async (_req, res) => {

  try {

   const rows = await query(`
 SELECT 
  TRIM(
    SUBSTRING_INDEX(
      REPLACE(job_role, '-', ' '),
      ' ',
      1
    )
  ) as role_group,

  COUNT(*) as total

FROM physical

WHERE report_id = (
  SELECT id
  FROM physical_reports
  ORDER BY report_date DESC, id DESC
  LIMIT 1
)

AND job_role IS NOT NULL
AND job_role != ''

GROUP BY role_group

ORDER BY total DESC
`);

    res.status(200).json({
      success: true,
      data: rows,
    });

  } catch (error) {

    console.error("Job role count error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });

  }

});

router.get("/circle-count", async (_req, res) => {

  try {

    const rows = await query(`
 SELECT
  circle,
  COUNT(*) as total
FROM physical

WHERE report_id = (
  SELECT id
  FROM physical_reports
  ORDER BY report_date DESC, id DESC
  LIMIT 1
)

AND circle IS NOT NULL
AND circle != ''

GROUP BY circle
ORDER BY total DESC
    `);

    res.status(200).json({
      success: true,
      data: rows,
    });

  } catch (error) {

    console.error("Circle count error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });

  }

});

router.get("/employment-status-count", async (_req, res) => {

  try {

    const rows = await query(`
      SELECT
  employment_status,
  COUNT(*) as total
FROM physical

WHERE report_id = (
  SELECT id
  FROM physical_reports
  ORDER BY report_date DESC, id DESC
  LIMIT 1
)

AND employment_status IS NOT NULL
AND employment_status != ''

GROUP BY employment_status
ORDER BY total DESC
    `);

    res.status(200).json({
      success: true,
      data: rows,
    });

  } catch (error) {

    console.error("Employment status count error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });

  }

});

router.get("/job-role-document-average", async (_req, res) => {

  try {

    const rows = await query(`
      SELECT

        TRIM(
          SUBSTRING_INDEX(
            REPLACE(job_role, '-', ' '),
            ' ',
            1
          )
        ) AS role_group,

        COUNT(*) AS total_employees,

        SUM(
          CASE
            WHEN aadhaar_no IS NOT NULL
             AND aadhaar_no != ''
            THEN 1
            ELSE 0
          END
        ) AS aadhaar_count,

        SUM(
          CASE
            WHEN uan_no IS NOT NULL
             AND uan_no != ''
            THEN 1
            ELSE 0
          END
        ) AS uan_count,

        SUM(
          CASE
            WHEN esic_ip_no IS NOT NULL
             AND esic_ip_no != ''
            THEN 1
            ELSE 0
          END
        ) AS esic_count,

        ROUND(
          (
            (
              SUM(
                CASE
                  WHEN aadhaar_no IS NOT NULL
                   AND aadhaar_no != ''
                  THEN 1
                  ELSE 0
                END
              )
              +
              SUM(
                CASE
                  WHEN uan_no IS NOT NULL
                   AND uan_no != ''
                  THEN 1
                  ELSE 0
                END
              )
              +
              SUM(
                CASE
                  WHEN esic_ip_no IS NOT NULL
                   AND esic_ip_no != ''
                  THEN 1
                  ELSE 0
                END
              )
            ) / (COUNT(*) * 3)
          ) * 100,
          2
        ) AS document_average

      FROM physical

      WHERE job_role IS NOT NULL
        AND job_role != ''

      GROUP BY role_group

      ORDER BY document_average DESC
    `);

    res.status(200).json({
      success: true,
      data: rows,
    });

  } catch (error) {

    console.error("Job role average error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });

  }

});

module.exports = router;
