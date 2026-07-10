    const express = require("express");
    const multer = require("multer");
    const XLSX = require("xlsx");

    const { db } = require("../config/db");
    const {
      addCircleFilter,
      assertRowsAllowedCircle,
      authMiddleware,
      canAccessCircle,
      forbid,
      isAllCircle,
    } = require("../middleware/circleAccess");

    const router = express.Router();
    const storage = multer.memoryStorage();

    const upload = multer({
      storage,
      limits: { fileSize: 25 * 1024 * 1024 },
    });

    router.use(authMiddleware);

    function getCircleScope(req, column = "circle") {
      if (isAllCircle(req.authUser)) return { sql: "", params: [] };
      return {
        sql: ` AND LOWER(TRIM(${column})) = LOWER(TRIM(?))`,
        params: [req.authUser.circle],
      };
    }

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
          pf_no VARCHAR(50) DEFAULT NULL,
          nth_salary DECIMAL(12,2) DEFAULT 0,
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
        ["pf_no", "VARCHAR(50) DEFAULT NULL"],
        ["nth_salary", "DECIMAL(12,2) DEFAULT 0"],
        ["remarks", "TEXT DEFAULT NULL"],
      ];

      for (const [column, definition] of physicalColumns) {
        await ensureColumn("physical", column, definition);
      }

      await ensureCircleUpdatesTable();
    }

    let circleUpdatesBackfilled = false;

    async function ensureCircleUpdatesTable() {
      await query(`
        CREATE TABLE IF NOT EXISTS physical_circle_updates (
          circle VARCHAR(100) NOT NULL PRIMARY KEY,
          last_uploaded_at TIMESTAMP NULL DEFAULT NULL,
          uploaded_by VARCHAR(255) DEFAULT NULL,
          report_id INT DEFAULT NULL,
          updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);

      if (circleUpdatesBackfilled) return;
      circleUpdatesBackfilled = true;

      // Backfill last-updated info from pre-existing uploads made before this
      // table existed, so circles with historical data aren't shown as "Never Uploaded".
      await query(`
        INSERT IGNORE INTO physical_circle_updates (circle, last_uploaded_at, uploaded_by, report_id)
        SELECT
          t.circle,
          t.last_uploaded_at,
          (
            SELECT pr3.uploaded_by
            FROM physical_reports pr3
            JOIN physical p3 ON p3.report_id = pr3.id
            WHERE p3.circle = t.circle
            ORDER BY pr3.uploaded_at DESC
            LIMIT 1
          ) AS uploaded_by,
          NULL AS report_id
        FROM (
          SELECT p.circle AS circle, MAX(pr.uploaded_at) AS last_uploaded_at
          FROM physical p
          JOIN physical_reports pr ON pr.id = p.report_id
          WHERE p.circle IS NOT NULL AND TRIM(p.circle) != ''
          GROUP BY p.circle
        ) t
      `);
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

 const allowedJobRoles = [
  "FTTx Technician",
  "Technician",
  "FTTx Engineer",
  "Analyst",
  "State Fiber SME",
  "Fiber SME",
  "Assistant Splicer",
  "FTTx Splicer",
  "Splicer",
  "Rigger",
  "Patroller",
  "NOC Executive",
  "ISP Engineer",
  "Utility Supervisor",
  "FTTx Supervisor",
  "Fiber Supervisor",
  "Commercial Lead",
  "CMP Lead",
  "FTTx Assistant Splicer",
  "HSEF LEAD",
  "Energy Lead",
  "Circle Head",
  "WAREHOUSE SECURITY GUARD",
  "OMCR Lead",
  "FRT Helper",
  "Utility Helper",
  "Office Helper",
  "WH Helper",
  "Commercial Executive",
  "Project technician",
  "Route Guard",
  "FTTx Helper",
  "State ISP SME",
  "FTTx Lead",
  "Estate Executive",
  "HR Executive",
  "State Utility SME",
  "ADMIN LEAD",
  "ODSC Supevisor",
  "State HR Head",
  "NOC LEAD",
  "QUALITY & PLANING HEAD",
  "UTILITY CO-ORODINATOR",
  "OFFICE BOY",
  "HR HEAD",
  "PROJECT LEAD",
  "FTTX SME",
  "ASSISTANT HR MANAGER",
  "MATERIAL LEAD",
  "HR MANAGER",
  "O & M HEAD",
  "Fiber Engineer",
  "Utility Engineer",
  "State Planning Manager",
  "Warehouse Incharge",
  "State Operation Head",
  "State Material Manager",
  "State Energy Manager",
  "Quality Lead",
  "State Fiber Head",
  "State HSEF Officer",
  "State FTTx SME",
  "Warehouse Incharge Cum Security",
  "Warehouse Helper",
  "MIS Executive",
  "PROJECT MIS",  
  "OMCR Resources",
  "Analyst - Material",
  "Analyst - Utility",
  "Analyst - Planning",
  "Analyst - Power & Fuel",
  "Analyst - Ipcolo",
  "Analyst - ISP",
  "Analyst - PMO",
  "Analyst - Fttx",
  "Analyst - Fiber",
  "Analyst - D2D",
  "Analyst - HSEF",
  "Asst Fiber SME",
  "Utility SME",
  "Utility MIS Coordinator",
  "MIS Coordinator",
  "Legal Executive",
  "Legal Advisor",
  "Project Head",
  "Other Roles - Temporary Technician",
  "Material Helper",
  "Material Cordinator",
  "Analyst MIS",
  "Zonal Fiber SME"
];

const allowedJobRoleMap = new Map(
  allowedJobRoles.map(role => [
    normalizeJobRole(role),
    role
  ])
);

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
      "Palwal",
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
        "Mohali",
      ],

    };

 function normalizeJobRole(role = "") {

  // Plain normalization: lowercase, collapse hyphen/underscore/space
  // variations into a single space. Applied both to the raw input and
  // (again, defensively) to whatever the synonym map resolves to, so the
  // returned key is always comparable to itself regardless of case or
  // hyphenation — this keeps allowedJobRoleMap lookups (built the same way)
  // consistent instead of mismatching on casing.
  const normalizeText = (value) =>
    String(value)
      .trim()
      .toLowerCase()
      .replace(/[-_]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const normalized = normalizeText(role);

  // Keys and values here must both be in the same plain-normalized form
  // (lowercase, no hyphens) — values point at the normalized form of the
  // canonical entry in allowedJobRoles, not its display casing.
  const roleMap = {
"commercial lead": "commercial lead",
"hsef lead": "hsef lead",
"analyst hsef": "analyst hsef",
"cmp lead": "cmp lead",
"fibre supervisor": "fiber supervisor",
"fiber sme": "fiber sme",
"mis executive": "mis executive",
"project mis": "project mis",
"fttx engineer": "fttx engineer",
"circle head": "circle head",
"warehouse security guard": "warehouse security guard",
"office helper": "office helper",
"commercial executive": "commercial executive",
"project technician": "project technician",
"route guard": "route guard",
"fttx lead": "fttx lead",
"admin lead": "admin lead",
"odsc supevisor": "odsc supevisor",
"noc lead": "noc lead",
"quality & planing head": "quality & planing head",
"utility co orodinator": "utility co orodinator",
"office boy": "office boy",
"hr head": "hr head",
"project lead": "project lead",
"fttx sme": "fttx sme",
"assistant hr manager": "assistant hr manager",
"material lead": "material lead",
"hr manager": "hr manager",
"o & m head": "o & m head",
"fiber engineer": "fiber engineer",
"utility engineer": "utility engineer",
"state planning manager": "state planning manager",
"warehouse incharge": "warehouse incharge",
"state operation head": "state operation head",
"state material manager": "state material manager",
"state energy manager": "state energy manager",
"analyst d2d": "analyst d2d",

// --- Warehouse ---
"wh incharge cum security": "warehouse incharge cum security",

// --- Analyst spelling variant ---
"anlayst mis": "analyst mis",

// --- Material spelling variant ---
"material coordinator": "material cordinator",

// --- Correct spellings mapped to the typo'd canonical entries ---
// (canonical names stay as-is because job_role is stored in that form)
"odsc supervisor": "odsc supevisor",
"utility coordinator": "utility co orodinator",
"utility co ordinator": "utility co orodinator",
"quality & planning head": "quality & planing head"

};

    const mapped = roleMap[normalized] || normalized;

    return normalizeText(mapped);
  }

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
  normalizeJobRole(
    row["Job Role"]
  ),

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
  toText(row["Employment Status"]),

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
// pf_no
toText(
  row["PF No"] ||
  row["PF NO"] ||
  row["PF Number"]
),


        // nth_salary
    toNullableInt(
      row["NTH Salary"] ||
      row["Nth Salary"] ||
      row["Salary"]
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
          pf_no,
          nth_salary,
          remarks,
          cmp
        ) VALUES ?
      `;

      const chunkSize = 1000;

      for (let index = 0; index < rows.length; index += chunkSize) {
        const chunk = rows.slice(index, index + chunkSize).map((row) => mapPhysicalRow(row, reportId));
        await conn.promise().query(insertSql, [chunk]);
      }
    }

    router.get("/export", async (req, res) => {

      try {

        const userCircle =
          req.authUser?.circle || "ALL";

        let whereClause = "";
        let params = [];

        if (
          userCircle &&
          userCircle !== "ALL"
        ) {
          whereClause = "WHERE circle = ?";
          params.push(userCircle);
        }

        const rows = await query(
          `
          SELECT *
          FROM physical
          ${whereClause}
          ORDER BY id DESC
          `,
          params
        );

        res.json({
          success: true,
          data: rows
        });

      } catch (error) {

        console.log(error);

        res.status(500).json({
          success: false,
          message: "Export Failed"
        });

      }

    });

    router.get("/", async (req, res) => {
      try {

        const userCircle =
          req.authUser?.circle || "ALL";

    // Pagination removed

        let whereClause = "";
        let params = [];

        if (
          userCircle &&
          userCircle !== "ALL"
        ) {
          whereClause = "WHERE circle = ?";
          params.push(userCircle);
        }

        // TOTAL RECORDS
        const totalResult = await query(
          `
          SELECT COUNT(*) AS total
          FROM physical
          ${whereClause}
          `,
          params
        );

        const total =
          totalResult[0]?.total || 0;

        // PAGE DATA
      const rows = await query(
      `
      SELECT *
      FROM physical
      ${whereClause}
      ORDER BY id DESC
      `,
      params
    );

      res.json({
      success: true,
      data: rows,
      total
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
        assertRowsAllowedCircle(req.authUser, rows, (row) => row["Circle"] || row["circle"] || "");
        console.log(
      "Excel Headers:",
      Object.keys(rows[0] || {})
    );
    for (const row of rows) {

    const circle = String(
      row["Circle"] ||
      row["circle"] ||
      ""
    )
    .replace(/\s+/g, " ")
    .trim();

    console.log(
      "Circle=>",
      JSON.stringify(circle),
      "Length=>",
      circle.length
    );

    const cmp = String(
      row["CMP"] ||
      row["Cmp"] ||
      row["cmp"] ||
      row["Cluster"] ||
      row["cluster"] ||
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
      // CHECK CIRCLE

      if (!circleCmpMap[circle]) {

        return res.status(400).json({
          success: false,
          message: `Invalid Circle: ${circle}`,
        });

      }

      // CHECK CMP

    const validCmp = circleCmpMap[circle].some(
      item =>
        item.trim().toLowerCase() ===
        cmp.trim().toLowerCase()
    );

    if (!validCmp) {

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

  const validationErrors = [];

  for (let index = 0; index < rows.length; index++) {

    const row = rows[index];

    const excelRowNumber = index + 2;

    const employeeCode = row["Employee Code"] || "-";
    const employeeName = row["Employee Name"] || "-";
    const aadhaarNo = String(
    row["AADHAAR No"] ||
    row["AADHAAR NO"] ||
    ""
).trim();

if (!aadhaarNo) {

    validationErrors.push(
        `❌ Row ${excelRowNumber} - ${employeeName} (${employeeCode}) : Aadhaar Number is mandatory. Please fill Aadhaar Number and upload again.`
    );

}

    // Job Role Validation

const jobRole = String(row["Job Role"] ?? "").trim();

if (!jobRole) {

  validationErrors.push(
    `❌ Row ${excelRowNumber} - ${employeeName} (${employeeCode}) : Job Role is blank`
  );

} else {

  const matchedRole = allowedJobRoleMap.get(
    normalizeJobRole(jobRole)
  );

  if (!matchedRole) {

  validationErrors.push(
    `❌ Row ${excelRowNumber} - ${employeeName} (${employeeCode}) : Invalid Job Role "${jobRole}"`
  );

  } else {

    row["Job Role"] = matchedRole;

  }

}

    // =========================
    // Employment Status Validation
    // =========================

    const employmentStatus = String(
      row["Employment Status"] ?? ""
    ).trim();

    if (!employmentStatus) {

      validationErrors.push(
        `❌ Row ${excelRowNumber} - ${employeeName} (${employeeCode}) : Employment Status is blank`
      );

    } else {

      const normalizedStatus = employmentStatus.toLowerCase();

      if (
        normalizedStatus !== "active" &&
        normalizedStatus !== "inactive"
      ) {

        validationErrors.push(
          `❌ Row ${excelRowNumber} - ${employeeName} (${employeeCode}) : Invalid Employment Status "${employmentStatus}"`
        );

      } else {

        row["Employment Status"] =
          normalizedStatus === "active"
            ? "Active"
            : "Inactive";

      }
    }

    // =========================
    // PPRJ Status Validation
    // =========================

    const pprjStatus = String(
      row["PPRJ Status"] ?? ""
    ).trim();

    if (!pprjStatus) {

      validationErrors.push(
        `❌ Row ${excelRowNumber} - ${employeeName} (${employeeCode}) : PPRJ Status is blank`
      );

    } else {

      const normalizedPprjStatus =
        pprjStatus.toLowerCase();

      const validPprjStatuses = [
        "active",
        "inactive",
        "pending",
        "not applicable"
      ];

      if (
        !validPprjStatuses.includes(normalizedPprjStatus)
      ) {

        validationErrors.push(
          `❌ Row ${excelRowNumber} - ${employeeName} (${employeeCode}) : Invalid PPRJ Status "${pprjStatus}"`
        );

      } else {

        row["PPRJ Status"] =
          normalizedPprjStatus === "active"
            ? "Active"
            : normalizedPprjStatus === "inactive"
            ? "Inactive"
            : normalizedPprjStatus === "pending"
            ? "Pending"
            : "Not Applicable";

      }
    }
  }

  // =========================
  // Show All Errors Together
  // =========================

  if (validationErrors.length > 0) {

  return res.status(400).json({
    success: false,
    errors: validationErrors,
    totalErrors: validationErrors.length,
    totalRecords: rows.length,
    message: validationErrors.join("\n")
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

// ============================================
// INSERT OR UPDATE EMPLOYEES
// ============================================

// Fetch existing employees
const [existingEmployees] = await conn.promise().query(`
SELECT id,aadhaar_no
FROM physical
WHERE aadhaar_no IS NOT NULL
AND aadhaar_no<>''
`);

const employeeMap = new Map();

existingEmployees.forEach(emp=>{
    employeeMap.set(emp.aadhaar_no.trim(),emp.id);
});

const excelAadhaarSet=new Set();

const insertRows=[];
let updatedEmployees=0;
let duplicateEmployees=0;

for(const row of rows){

    const aadhaarNo=String(
        row["AADHAAR No"]||
        row["AADHAAR NO"]||
        ""
    ).trim();

   if (excelAadhaarSet.has(aadhaarNo)) {

    duplicateEmployees++;

    continue;
}

    excelAadhaarSet.add(aadhaarNo);

    if(employeeMap.has(aadhaarNo)){

        // UPDATE EMPLOYEE

        await conn.promise().query(
        `
        UPDATE physical
        SET

        pprj_status=?,
        pprj_code=?,
        employee_code=?,
        employee_name=?,
        father_name=?,
        function_name=?,
        job_role_actual_cmp_verify=?,
        job_role=?,
        manpower_signoff_scope=?,
        scrum_job_role=?,
        circle=?,
        cluster=?,
        mobile_number=?,
        dob=?,
        age=?,
        date_of_joining=?,
        employment_status=?,
        resigned_date=?,
        last_working_date=?,
        rm_code=?,
        reporting_manager=?,
        company_email_id=?,
        laptop_status=?,
        ifsc_code=?,
        bank_account_no=?,
        pan_no=?,
        uan_no=?,
        esic_ip_no=?,
        pf_no=?,
        nth_salary=?,
        remarks=?,
        cmp=?

        WHERE id=?
        `,
        [

        toText(row["PPRJ Status"]),
        toText(row["PPRJ Code"]||row["PPRJ code"]),
        toText(row["Employee Code"]),
        toText(row["Employee Name"]),
        toText(row["Father Name"]),
        toText(row["Function"]),
        toText(row["Job Role Actual CMP Verify"]||row["Job Role_Actual_CMP Verify"]),
        row["Job Role"],
        toText(row["Manpower SignOff Scope"]||row["Manpower Signoff Scope"]),
        toText(row["Scrum Job Role"]),
        toText(row["Circle"]),
        toText(row["Cluster"]),
        toText(row["Mobile number"]||row["Mobile Number"]),
        normalizeDate(row["DOB"]),
        toNullableInt(row["AGE"]||row["Age"]),
        normalizeDate(row["Date of joining"]||row["Date Of Joining"]),
        row["Employment Status"],
        normalizeDate(row["Resigned Date"]),
        normalizeDate(row["Last Working Date"]),
        toText(row["RM Code"]),
        toText(row["Reporting manager"]||row["Reporting Manager"]),
        toText(row["Company Email id"]||row["Company Email"]),
        toText(row["Laptop Status"]),
        toText(row["IFSC Code"]),
        toText(row["Bank Account No."]||row["Bank Account No"]),
        toText(row["PAN No"]||row["PANNO"]),
        toText(row["UAN No"]),
        toText(row["ESIC IP No "]||row["ESIC IP No"]),
        toText(row["PF No"]||row["PF NO"]||row["PF Number"]),
        toNullableInt(row["NTH Salary"]||row["Nth Salary"]||row["Salary"]),
        toText(row["Remarks"]),
        toText(row["CMP"]),
        employeeMap.get(aadhaarNo)

        ]
        );

        updatedEmployees++;

    }else{

        insertRows.push(row);

    }

}

// INSERT NEW EMPLOYEES
await insertPhysicalRows(
conn,
reportResult.insertId,
insertRows
);

        const uploadedCircles = Array.from(
          new Set(
            rows
              .map((row) =>
                String(row["Circle"] || row["circle"] || "")
                  .replace(/\s+/g, " ")
                  .trim()
              )
              .filter(Boolean)
          )
        );
        const uploadTimestamp = new Date();

        for (const circleName of uploadedCircles) {
          await conn.promise().query(
            `
              INSERT INTO physical_circle_updates (circle, last_uploaded_at, uploaded_by, report_id)
              VALUES (?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                last_uploaded_at = VALUES(last_uploaded_at),
                uploaded_by = VALUES(uploaded_by),
                report_id = VALUES(report_id)
            `,
            [circleName, uploadTimestamp, uploadedBy, reportResult.insertId]
          );
        }

        await conn.promise().commit();

  res.status(200).json({
  success: true,
  message: "Report Uploaded Successfully",
  reportId: reportResult.insertId,

  totalEmployees: rows.length,
 addedEmployees: insertRows.length,

updatedEmployees: updatedEmployees,
duplicateEmployees: duplicateEmployees
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
        res.status(error.statusCode || 500).json({
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

      if (!canAccessCircle(req.authUser, data.circle)) {
        return forbid(res);
      }

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
      AND id != ?
      LIMIT 1
      `,
      [data.aadhaar_no, req.params.id]
    );

    if (existingEmployee.length > 0) {

      return res.status(400).json({
        success: false,
        message:
          "Employee already exists with this Aadhaar Number",
      });

    }
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
            pf_no,
            nth_salary,
            remarks

          )

        VALUES (

    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?

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
            data.pf_no || "",
            data.nth_salary || 0,
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

    router.get("/reports", async (req, res) => {
      try {
        await ensurePhysicalTables();

        const params = [];
        const circleClause = isAllCircle(req.authUser)
          ? ""
          : `WHERE EXISTS (
              SELECT 1 FROM physical p
              WHERE p.report_id = physical_reports.id
                AND LOWER(TRIM(p.circle)) = LOWER(TRIM(?))
            )`;
        if (!isAllCircle(req.authUser)) params.push(req.authUser.circle);
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
          ${circleClause}
          ORDER BY uploaded_at DESC, id DESC
          LIMIT 200
        `, params);

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

        const filters = ["report_id = ?"];
        const params = [reportId];
        addCircleFilter(filters, params, req.authUser);
        const [report] = await query(
          `SELECT report_id FROM physical WHERE ${filters.join(" AND ")} LIMIT 1`,
          params
        );

        if (!report) {
          return res.status(404).json({
            success: false,
            message: "Report not found",
          });
        }

        if (!isAllCircle(req.authUser)) {
          const [foreignRow] = await query(
            `SELECT id FROM physical
            WHERE report_id = ?
              AND LOWER(TRIM(COALESCE(circle, ''))) <> LOWER(TRIM(?))
            LIMIT 1`,
            [reportId, req.authUser.circle]
          );
          if (foreignRow) return forbid(res);
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

    router.delete("/bulk-delete", async (req, res) => {

      try {

        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
          return res.status(400).json({
            success: false,
            message: "No records selected"
          });
        }

        const placeholders = ids.map(() => "?").join(",");

        await query(
          `DELETE FROM physical
          WHERE id IN (${placeholders})`,
          ids
        );

        res.json({
          success: true,
          message: `${ids.length} records deleted successfully`
        });

      } catch (error) {

        console.log(error);

        res.status(500).json({
          success: false,
          message: "Delete failed"
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

        const result = await query(
          `DELETE FROM physical WHERE id = ?${
            isAllCircle(req.authUser) ? "" : " AND LOWER(TRIM(circle)) = LOWER(TRIM(?))"
          }`,
          isAllCircle(req.authUser) ? [id] : [id, req.authUser.circle]
        );
        if (!result.affectedRows) return forbid(res);

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
        const [existing] = await query(`SELECT circle FROM physical WHERE id = ? LIMIT 1`, [id]);
        if (
          !existing ||
          !canAccessCircle(req.authUser, existing.circle) ||
          !canAccessCircle(req.authUser, circle)
        ) {
          return forbid(res);
        }

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

    router.get("/job-role-count", async (req, res) => {

      try {

    const scope = getCircleScope(req);
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
      ${scope.sql}

      GROUP BY role_group

      ORDER BY total DESC
    `, scope.params);

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

    router.get("/circle-last-updated", async (req, res) => {

      try {

        await ensurePhysicalTables();

        const scope = getCircleScope(req);
        const rows = await query(`
          SELECT circle, last_uploaded_at, uploaded_by
          FROM physical_circle_updates
          WHERE circle IS NOT NULL
          AND circle != ''
          ${scope.sql}
        `, scope.params);

        const updatesByCircle = new Map(rows.map((row) => [row.circle, row]));
        const knownCircles = Object.keys(circleCmpMap);

        let circleList;
        if (isAllCircle(req.authUser)) {
          const extraCircles = rows
            .map((row) => row.circle)
            .filter((circle) => !knownCircles.includes(circle));
          circleList = [...new Set([...knownCircles, ...extraCircles])];
        } else {
          const canonical =
            knownCircles.find(
              (circle) => circle.toLowerCase() === req.authUser.circle.toLowerCase()
            ) || req.authUser.circle;
          circleList = [canonical];
        }

        const data = circleList
          .map((circle) => {
            const match = updatesByCircle.get(circle);
            return {
              circle,
              lastUpdatedAt: match?.last_uploaded_at || null,
              uploadedBy: match?.uploaded_by || null,
            };
          })
          .sort((a, b) => a.circle.localeCompare(b.circle));

        res.status(200).json({
          success: true,
          data,
        });

      } catch (error) {

        console.error("Circle last-updated error:", error);

        res.status(500).json({
          success: false,
          message: "Server Error",
        });

      }

    });

    router.get("/circle-count", async (req, res) => {

      try {

      const scope = getCircleScope(req);
      const rows = await query(`
      SELECT
        circle,
        COUNT(*) as total
      FROM physical

      WHERE circle IS NOT NULL
      AND circle != ''
      ${scope.sql}

      GROUP BY circle
      ORDER BY total DESC
    `, scope.params);

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

    router.get("/employment-status-count", async (req, res) => {

      try {

    const scope = getCircleScope(req);
    const rows = await query(`
    SELECT
    CASE

  WHEN LOWER(TRIM(employment_status)) = 'active'
  THEN 'active'

  WHEN LOWER(TRIM(employment_status)) = 'inactive'
  THEN 'inactive'

    ELSE 'other'

    END AS employment_status,

    COUNT(*) AS total

    FROM physical

    WHERE employment_status IS NOT NULL
    AND TRIM(employment_status) != ''
    ${scope.sql}

    GROUP BY employment_status
    `, scope.params);

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

    router.get("/job-role-document-average", async (req, res) => {

      try {

        const scope = getCircleScope(req);
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
            ${scope.sql}

          GROUP BY role_group

          ORDER BY document_average DESC
        `, scope.params);

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

    router.get("/active-job-role-cmp-count", async (req, res) => {

      try {

        const physicalScope = getCircleScope(req);
        const newJoiningScope = getCircleScope(req);
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
            WHEN normalized_role IN (
      'stateenergymanager',
      'statefibersme',
      'stateispsme',
      'statematerialmanager',
      'stateoperationhead',
      'stateplanningmanager',
      'stateutilitysme'
    )
    THEN 'state_leadership_team'
            WHEN normalized_role = 'nocexecutive' THEN 'noc_executive'
    WHEN normalized_role LIKE 'analyst%'
    THEN 'analyst'
            WHEN normalized_role = 'cmplead' THEN 'cmp_lead'
            WHEN normalized_role = 'technician' THEN 'technician'
            WHEN normalized_role = 'rigger' THEN 'rigger'
            WHEN normalized_role = 'utilitysupervisor' THEN 'utility_supervisor'
            WHEN normalized_role = 'utilityengineer' THEN 'utility_engineer'
            WHEN normalized_role = 'ispengineer' THEN 'isp_engineer'
          WHEN normalized_role IN (
      'whinchargecumsecurity',
      'warehouseincharge',
      'warehouseinchargecumsecurity'
    )
    THEN 'wh_incharge_cum_security'
            WHEN normalized_role = 'splicer' THEN 'splicer'
            WHEN normalized_role = 'assistantsplicer' THEN 'assistant_splicer'
            WHEN normalized_role IN ('fiberhelper', 'fibrehelper', 'frthelper') THEN 'fiber_helper'
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
          WHERE LOWER(TRIM(COALESCE(employment_status, ''))) = 'active'
            AND cmp IS NOT NULL
            AND cmp != ''
            AND job_role IS NOT NULL
            AND job_role != ''
            ${physicalScope.sql}
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
            WHEN normalized_role IN (
      'stateenergymanager',
      'statefibersme',
      'stateispsme',
      'statematerialmanager',
      'stateoperationhead',
      'stateplanningmanager',
      'stateutilitysme'
    )
    THEN 'state_leadership_team'
            WHEN normalized_role = 'nocexecutive' THEN 'noc_executive'
      WHEN normalized_role LIKE 'analyst%'
    THEN 'analyst'
            WHEN normalized_role = 'cmplead' THEN 'cmp_lead'
            WHEN normalized_role = 'technician' THEN 'technician'
            WHEN normalized_role = 'rigger' THEN 'rigger'
            WHEN normalized_role = 'utilitysupervisor' THEN 'utility_supervisor'
            WHEN normalized_role = 'utilityengineer' THEN 'utility_engineer'
            WHEN normalized_role = 'ispengineer' THEN 'isp_engineer'
            WHEN normalized_role IN (
      'whinchargecumsecurity',
      'warehouseincharge',
      'warehouseinchargecumsecurity'
    )
    THEN 'wh_incharge_cum_security'
            WHEN normalized_role = 'splicer' THEN 'splicer'
            WHEN normalized_role = 'assistantsplicer' THEN 'assistant_splicer'
            WHEN normalized_role IN ('fiberhelper', 'fibrehelper', 'frthelper') THEN 'fiber_helper'
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
          WHERE LOWER(TRIM(COALESCE(joining_status, ''))) = 'joined'
            AND cmp IS NOT NULL
            AND cmp != ''
            AND designation IS NOT NULL
            AND designation != ''
            AND NOT EXISTS (
              SELECT 1
              FROM physical dedupe
              WHERE TRIM(COALESCE(new_joining.aadhaar_no, '')) != ''
                AND TRIM(COALESCE(dedupe.aadhaar_no, '')) = TRIM(new_joining.aadhaar_no)
                AND LOWER(TRIM(COALESCE(dedupe.employment_status, ''))) = 'active'
            )
            ${newJoiningScope.sql}
        ) AS new_joining_source
      ) AS new_joining_roles
      WHERE new_joining_roles.role_key IS NOT NULL
      GROUP BY new_joining_roles.cmp, new_joining_roles.role_key
    ) AS combined
    GROUP BY combined.cmp, combined.role_key
    ORDER BY combined.cmp ASC, combined.role_key ASC

        `, [...physicalScope.params, ...newJoiningScope.params]);

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

          const scope = getCircleScope(req);
          const rows = await query(
            `
            SELECT *
            FROM physical
            WHERE aadhaar_no = ?
            ${scope.sql}
            LIMIT 1
            `,
            [req.params.aadhaar, ...scope.params]
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

    router.get(
      "/employee-code/:employeeCode",
      async (req, res) => {

        console.log(
          "Searching Employee Code:",
          req.params.employeeCode
        );

        const scope = getCircleScope(req);
        const rows = await query(
          `
          SELECT *
          FROM physical
          WHERE TRIM(employee_code) = TRIM(?)
          ${scope.sql}
          LIMIT 1
          `,
          [req.params.employeeCode, ...scope.params]
        );

        console.log("Rows Found:", rows.length);

        if (rows.length === 0) {

          return res.json({
            success: false,
            message: "Employee Code Not Found"
          });

        }

        res.json({
          success: true,
          data: rows[0],
        });

      }
    );

    router.put(
      "/update-employee/:id",
      async (req, res) => {

        try {

          const data = req.body;

          const [existing] = await query(`SELECT circle FROM physical WHERE id = ? LIMIT 1`, [
            req.params.id,
          ]);
          if (
            !existing ||
            !canAccessCircle(req.authUser, existing.circle) ||
            !canAccessCircle(req.authUser, data.circle)
          ) {
            return forbid(res);
          }

        const result = await query(
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
        pf_no = ?,
        nth_salary = ?,
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
        data.pf_no || "",
        data.nth_salary || 0,
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
