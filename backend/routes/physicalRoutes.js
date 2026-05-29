const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");

const { db } = require("../config/db");

const router = express.Router();
const storage = multer.memoryStorage();

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

const circleCmpMap = {

  Delhi: [
    "Delhi SHQ",
    "Delhi-1 (West)",
    "Delhi-2 (South)",
    "Delhi-3 (Central-East)",
    "Delhi-4 (North)",
    "Faridabad (NCR)",
    "Ghaziabad (NCR)",
    "Gurgaon (NCR)",
    "Noida (NCR)",
  ],

  Haryana: [
    "Haryana SHQ",
    "Ambala",
    "Hissar",
    "Karnal",
    "Panipat",
    "Rewari",
    "Rohtak",
  ],

  Punjab: [
    "Punjab SHQ",
    "Amritsar",
    "Bathinda",
    "Chandigarh",
    "Jalandhar",
    "Ludhiana-1",
    "Ludhiana-2",
    "Pathankot",
    "Patiala",
    "Sangrur",
  ],

  "UP East": [
    "UP East SHQ",
    "Allahabad",
    "Azamgarh",
    "Faizabad",
    "Gorakhpur",
    "Nanded",
    "Raibareilly",
    "Varanasi",
  ],

};

function mapPhysicalRow(row, reportId) {

  return [

    // report_id
    reportId,

    // pprj_status
    toText(row["PPRJ Status"]),

    // pprj_code
    toText(
  row["PPRJ Code"] ||
  row["PPRJ code"]
),

    // employee_code
    toText(row["Employee Code"]),

    // employee_name
    toText(row["Employee Name"]),

    // father_name
    toText(row["Father Name"]),

    // function_name
    toText(row["Function"]),

    // job_role_actual_cmp_verify
    toText(
  row["Job Role Actual CMP Verify"] ||
  row["Job Role_Actual_CMP Verify"]
),

    // job_role
    toText(row["Job Role"]),

    // manpower_signoff_scope
    toText(
  row["Manpower SignOff Scope"] ||
  row["Manpower Signoff Scope"]
),

    // scrum_job_role
    toText(row["Scrum Job Role"]),

    // circle
    toText(row["Circle"]),

    // cluster
    toText(row["Cluster"]),

    // mobile_number
    toText(
      row["Mobile number"] ||
      row["Mobile Number"]
    ),

    // dob
    normalizeDate(row["DOB"]),

    // age
    toNullableInt(
      row["AGE"] ||
      row["Age"]
    ),

    // date_of_joining
    normalizeDate(
      row["Date of joining"] ||
      row["Date Of Joining"]
    ),

    // employment_status
(() => {
  const status = String(
    row["Employment Status"] || ""
  ).trim().toLowerCase();

  if (
    ["active","a","working"].includes(status)
  ) {
    return "Active";
  }

  if (
    ["inactive","i","resigned"].includes(status)
  ) {
    return "Inactive";
  }

  return status
    ? status.charAt(0).toUpperCase() +
      status.slice(1)
    : null;
})(),

    // resigned_date
    normalizeDate(row["Resigned Date"]),

    // last_working_date
    normalizeDate(row["Last Working Date"]),

    // rm_code
    toText(row["RM Code"]),

    // reporting_manager
    toText(
      row["Reporting manager"] ||
      row["Reporting Manager"]
    ),

    // company_email_id
    toText(
      row["Company Email id"] ||
      row["Company Email"]
    ),

    // laptop_status
    toText(row["Laptop Status"]),

    // ifsc_code
    toText(row["IFSC Code"]),

    // bank_account_no
    toText(
      row["Bank Account No."] ||
      row["Bank Account No"]
    ),

    // pan_no
    toText(
  row["PAN No"] ||
  row["PANNO"]
),

    // aadhaar_no
    toText(
  row["AADHAAR No"] ||
  row["AADHAAR NO"]
),

    // uan_no
    toText(row["UAN No"]),

    // esic_ip_no
    toText(
      row["ESIC IP No "] ||
      row["ESIC IP No"]
    ),

    // remarks
    toText(row["Remarks"]),

    // cmp
    toText(row["CMP"]),

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

    const rows = await query(`
      SELECT * FROM physical
      ORDER BY id DESC
    `);

    res.json({
      success: true,
      data: rows,
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      success: false,
      message: "Failed",
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

const fileExtension =
  "." +
  req.file.originalname
    .split(".")
    .pop()
    .toLowerCase();

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
    console.log(
  "Excel Headers:",
  Object.keys(rows[0] || {})
);
for (const row of rows) {

 const circle = String(
  row["Circle"] ||
  row["circle"] ||
  ""
).trim();

 const cmp = String(
  row["CMP"] ||
  row["Cmp"] ||
  row["cmp"] ||
  ""
).trim();
  // CHECK CIRCLE

  if (!circleCmpMap[circle]) {

    return res.status(400).json({
      success: false,
      message: `Invalid Circle: ${circle}`,
    });

  }

  // CHECK CMP

  if (
    !circleCmpMap[circle].includes(cmp)
  ) {

    return res.status(400).json({
      success: false,
      message: `Invalid CMP "${cmp}" for Circle "${circle}"`,
    });

  }

}

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
  req.file.originalname,
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

router.post("/add-employee", async (req, res) => {

 try {

  const data = req.body;

  // VALIDATE CIRCLE

  if (!circleCmpMap[data.circle]) {

    return res.status(400).json({
      success: false,
      message: "Invalid Circle",
    });

  }

  // VALIDATE CMP

  if (
    !circleCmpMap[data.circle].includes(
      data.cmp
    )
  ) {

    return res.status(400).json({
      success: false,
      message: "Invalid CMP for selected Circle",
    });

  }

    // DUPLICATE CHECK

    const existingEmployee = await query(
      `
      SELECT id
      FROM physical
      WHERE aadhaar_no = ?
      LIMIT 1
      `,
      [data.aadhaar_no]
    );

    if (existingEmployee.length > 0) {

      return res.status(400).json({
        success: false,
        message:
          "Employee already exists with this Aadhaar Number",
      });

    }

    await query(
      `
      INSERT INTO physical (

        circle,
        cmp,
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
        remarks

      )

      VALUES (

        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?

      )
      `,
      [

        data.circle || "",
        data.cmp || "",
        data.pprj_status || "",
        data.pprj_code || "",
        data.employee_code || "",
        data.employee_name || "",
        data.father_name || "",
        data.function_name || "",
        data.job_role_actual_cmp_verify || "",
        data.job_role || "",
        data.manpower_signoff_scope || "",
        data.scrum_job_role || "",
        data.cluster || "",
        data.mobile_number || "",
        data.dob || null,
        data.age || null,
        data.date_of_joining || null,
        data.employment_status || "",
        data.resigned_date || null,
        data.last_working_date || null,
        data.rm_code || "",
        data.reporting_manager || "",
        data.company_email_id || "",
        data.laptop_status || "",
        data.ifsc_code || "",
        data.bank_account_no || "",
        data.pan_no || "",
        data.aadhaar_no || "",
        data.uan_no || "",
        data.esic_ip_no || "",
        data.remarks || ""

      ]
    );

    res.json({
      success: true,
      message: "Employee added successfully"
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error"
    });

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

router.delete("/delete-employee/:id", async (req, res) => {

  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {

    return res.status(400).json({
      success: false,
      message: "Invalid Employee ID",
    });

  }

  try {

    await query(
      `DELETE FROM physical WHERE id = ?`,
      [id]
    );

    res.status(200).json({
      success: true,
      message: "Employee deleted successfully",
    });

  } catch (error) {

    console.error("Employee delete error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });

  }

});

router.put("/:id", async (req, res) => {

  const id = Number(req.params.id);

  const {
    employee_name,
    employee_code,
    circle,
    cluster,
    mobile_number
  } = req.body;

  try {

    await query(
      `
      UPDATE physical
      SET
        employee_name = ?,
        employee_code = ?,
        circle = ?,
        cluster = ?,
        mobile_number = ?
      WHERE id = ?
      `,
      [
        employee_name,
        employee_code,
        circle,
        cluster,
        mobile_number,
        id
      ]
    );

    res.status(200).json({
      success: true,
      message: "Employee updated successfully",
    });

  } catch (error) {

    console.error("Update error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
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

  WHERE job_role IS NOT NULL
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

  WHERE circle IS NOT NULL
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
CASE

WHEN LOWER(TRIM(employment_status)) IN
('active','a','working')
THEN 'active'

WHEN LOWER(TRIM(employment_status)) IN
('inactive','i','resigned')
THEN 'inactive'

ELSE 'other'

END AS employment_status,

COUNT(*) AS total

FROM physical

WHERE employment_status IS NOT NULL
AND TRIM(employment_status) != ''

GROUP BY employment_status
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

router.get("/active-job-role-cmp-count", async (_req, res) => {

  try {

    const rows = await query(`
SELECT
  combined.cmp,
  combined.role_key,
  SUM(combined.physical_count) AS physical_count,
  SUM(combined.new_joining_count) AS new_joining_count,
  SUM(combined.physical_count) + SUM(combined.new_joining_count) AS total
FROM (
  SELECT
    physical_roles.cmp,
    physical_roles.role_key,
    COUNT(*) AS physical_count,
    0 AS new_joining_count
  FROM (
    SELECT
      cmp,
      CASE
        WHEN normalized_role IN ('a', 'stateleadership') THEN 'state_leadership_team'
        WHEN normalized_role = 'nocexecutive' THEN 'noc_executive'
        WHEN normalized_role = 'analyst' THEN 'analyst'
        WHEN normalized_role = 'cmplead' THEN 'cmp_lead'
        WHEN normalized_role = 'technician' THEN 'technician'
        WHEN normalized_role = 'rigger' THEN 'rigger'
        WHEN normalized_role = 'utilitysupervisor' THEN 'utility_supervisor'
        WHEN normalized_role = 'utilityengineer' THEN 'utility_engineer'
        WHEN normalized_role = 'ispengineer' THEN 'isp_engineer'
        WHEN normalized_role = 'whinchargecumsecurity' THEN 'wh_incharge_cum_security'
        WHEN normalized_role = 'splicer' THEN 'splicer'
        WHEN normalized_role = 'assistantsplicer' THEN 'assistant_splicer'
        WHEN normalized_role IN ('fiberhelper', 'fibrehelper') THEN 'fiber_helper'
        WHEN normalized_role = 'patroller' THEN 'patroller'
        WHEN normalized_role IN ('fibersupervisor', 'fibresupervisor') THEN 'fiber_supervisor'
        WHEN normalized_role IN ('fiberengineer', 'fibreengineer') THEN 'fibre_engineer'
        WHEN normalized_role = 'fttxsplicer' THEN 'fttx_splicer'
        WHEN normalized_role = 'fttxassistantsplicer' THEN 'fttx_assistant_splicer'
        WHEN normalized_role = 'fttxsupervisor' THEN 'fttx_supervisor'
        WHEN normalized_role = 'fttxhelper' THEN 'fttx_helper'
        WHEN normalized_role = 'fttxengineer' THEN 'fttx_engineer'
        WHEN normalized_role = 'fttxtechnician' THEN 'fttx_technician'
        WHEN normalized_role = 'technicianb' THEN 'technicianb'
        WHEN normalized_role = 'riggerb' THEN 'riggerb'
        ELSE NULL
      END AS role_key
    FROM (
      SELECT
        cmp,
        LOWER(
          REPLACE(
            REPLACE(
              REPLACE(
                REPLACE(TRIM(job_role), ' ', ''),
                '-',
                ''
              ),
              '_',
              ''
            ),
            '.',
            ''
          )
        ) AS normalized_role
      FROM physical
      WHERE report_id = (
        SELECT id
        FROM physical_reports
        ORDER BY report_date DESC, id DESC
        LIMIT 1
      )
        AND LOWER(TRIM(COALESCE(employment_status, ''))) = 'active'
        AND cmp IS NOT NULL
        AND cmp != ''
        AND job_role IS NOT NULL
        AND job_role != ''
    ) AS physical_source
  ) AS physical_roles
  WHERE physical_roles.role_key IS NOT NULL
  GROUP BY physical_roles.cmp, physical_roles.role_key

  UNION ALL

  SELECT
    new_joining_roles.cmp,
    new_joining_roles.role_key,
    0 AS physical_count,
    COUNT(*) AS new_joining_count
  FROM (
    SELECT
      cmp,
      CASE
        WHEN normalized_role IN ('a', 'stateleadership') THEN 'state_leadership_team'
        WHEN normalized_role = 'nocexecutive' THEN 'noc_executive'
        WHEN normalized_role = 'analyst' THEN 'analyst'
        WHEN normalized_role = 'cmplead' THEN 'cmp_lead'
        WHEN normalized_role = 'technician' THEN 'technician'
        WHEN normalized_role = 'rigger' THEN 'rigger'
        WHEN normalized_role = 'utilitysupervisor' THEN 'utility_supervisor'
        WHEN normalized_role = 'utilityengineer' THEN 'utility_engineer'
        WHEN normalized_role = 'ispengineer' THEN 'isp_engineer'
        WHEN normalized_role = 'whinchargecumsecurity' THEN 'wh_incharge_cum_security'
        WHEN normalized_role = 'splicer' THEN 'splicer'
        WHEN normalized_role = 'assistantsplicer' THEN 'assistant_splicer'
        WHEN normalized_role IN ('fiberhelper', 'fibrehelper') THEN 'fiber_helper'
        WHEN normalized_role = 'patroller' THEN 'patroller'
        WHEN normalized_role IN ('fibersupervisor', 'fibresupervisor') THEN 'fiber_supervisor'
        WHEN normalized_role IN ('fiberengineer', 'fibreengineer') THEN 'fibre_engineer'
        WHEN normalized_role = 'fttxsplicer' THEN 'fttx_splicer'
        WHEN normalized_role = 'fttxassistantsplicer' THEN 'fttx_assistant_splicer'
        WHEN normalized_role = 'fttxsupervisor' THEN 'fttx_supervisor'
        WHEN normalized_role = 'fttxhelper' THEN 'fttx_helper'
        WHEN normalized_role = 'fttxengineer' THEN 'fttx_engineer'
        WHEN normalized_role = 'fttxtechnician' THEN 'fttx_technician'
        WHEN normalized_role = 'technicianb' THEN 'technicianb'
        WHEN normalized_role = 'riggerb' THEN 'riggerb'
        ELSE NULL
      END AS role_key
    FROM (
      SELECT
        cmp,
        LOWER(
          REPLACE(
            REPLACE(
              REPLACE(
                REPLACE(TRIM(designation), ' ', ''),
                '-',
                ''
              ),
              '_',
              ''
            ),
            '.',
            ''
          )
        ) AS normalized_role
      FROM new_joining
      WHERE LOWER(TRIM(COALESCE(l2_status, ''))) = 'joined'
        AND cmp IS NOT NULL
        AND cmp != ''
        AND designation IS NOT NULL
        AND designation != ''
    ) AS new_joining_source
  ) AS new_joining_roles
  WHERE new_joining_roles.role_key IS NOT NULL
  GROUP BY new_joining_roles.cmp, new_joining_roles.role_key
) AS combined
GROUP BY combined.cmp, combined.role_key
ORDER BY combined.cmp ASC, combined.role_key ASC

    `);

    res.status(200).json({
      success: true,
      data: rows,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });

  }

});

router.get(
  "/aadhaar/:aadhaar",
  async (req, res) => {

    try {

      const rows = await query(
        `
        SELECT *
        FROM physical
        WHERE aadhaar_no = ?
        LIMIT 1
        `,
        [req.params.aadhaar]
      );

      if (rows.length === 0) {

        return res.json({
          success: false,
        });

      }

      res.json({
        success: true,
        data: rows[0],
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        success: false,
      });

    }

  }
);

router.put(
  "/update-employee/:id",
  async (req, res) => {

    try {

      const data = req.body;

     await query(
  `
  UPDATE physical
  SET

    circle = ?,
    cmp = ?,
    pprj_status = ?,
    pprj_code = ?,
    employee_code = ?,
    employee_name = ?,
    father_name = ?,
    function_name = ?,
    job_role_actual_cmp_verify = ?,
    job_role = ?,
    manpower_signoff_scope = ?,
    scrum_job_role = ?,
    cluster = ?,
    mobile_number = ?,
    dob = ?,
    age = ?,
    date_of_joining = ?,
    employment_status = ?,
    resigned_date = ?,
    last_working_date = ?,
    rm_code = ?,
    reporting_manager = ?,
    company_email_id = ?,
    laptop_status = ?,
    ifsc_code = ?,
    bank_account_no = ?,
    pan_no = ?,
    aadhaar_no = ?,
    uan_no = ?,
    esic_ip_no = ?,
    remarks = ?

  WHERE id = ?
  `,
  [

    data.circle || "",
    data.cmp || "",
    data.pprj_status || "",
    data.pprj_code || "",
    data.employee_code || "",
    data.employee_name || "",
    data.father_name || "",
    data.function_name || "",
    data.job_role_actual_cmp_verify || "",
    data.job_role || "",
    data.manpower_signoff_scope || "",
    data.scrum_job_role || "",
    data.cluster || "",
    data.mobile_number || "",
    data.dob || null,
    data.age || null,
    data.date_of_joining || null,
    data.employment_status || "",
    data.resigned_date || null,
    data.last_working_date || null,
    data.rm_code || "",
    data.reporting_manager || "",
    data.company_email_id || "",
    data.laptop_status || "",
    data.ifsc_code || "",
    data.bank_account_no || "",
    data.pan_no || "",
    data.aadhaar_no || "",
    data.uan_no || "",
    data.esic_ip_no || "",
    data.remarks || "",

    req.params.id,

  ]
);

      res.json({
        success: true,
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        success: false,
      });

    }

  }
);

module.exports = router;
