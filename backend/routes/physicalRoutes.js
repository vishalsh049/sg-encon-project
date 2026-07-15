    const express = require("express");
    const multer = require("multer");
    const XLSX = require("xlsx");

    const { db } = require("../config/db");
    const { createError, sendError } = require("../utils/apiErrors");
    const {
      addCircleFilter,
      assertRowsAllowedCircle,
      authMiddleware,
      canAccessCircle,
      forbid,
      isAllCircle,
    } = require("../middleware/circleAccess");
    const {
      buildPhysicalFilters,
      clearPhysicalCache,
      createExecutor,
      ensurePhysicalInfrastructure,
      findDuplicateEmployees,
      getActorContext,
      getCachedValue,
      insertAuditLog,
      insertNotification,
      insertTimelineEvent,
      isPrivilegedPhysicalAdmin,
      setCachedValue,
    } = require("../services/physicalDomainService");

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

    // Dashboard count responses only vary by the user's circle scope, so
    // identical requests within the TTL are served from the in-memory cache
    // (cleared by clearPhysicalCache() on every physical mutation).
    function getDashboardCacheScope(req) {
      return {
        circle: isAllCircle(req.authUser)
          ? "ALL"
          : String(req.authUser.circle || "").trim().toLowerCase(),
      };
    }

    function buildAnalyticsFilters(req) {
      const scope = getCircleScope(req);
      const conditions = ["COALESCE(is_deleted, 0) = 0"];
      const params = [];

      if (scope.sql) {
        conditions.push("LOWER(TRIM(circle)) = LOWER(TRIM(?))");
        params.push(...scope.params);
      }

      const requestedCircle = String(req.query.circle || "").trim();
      if (requestedCircle) {
        if (!canAccessCircle(req.authUser, requestedCircle)) {
          const error = new Error("You cannot access this circle's analytics.");
          error.statusCode = 403;
          throw error;
        }
        conditions.push("LOWER(TRIM(circle)) = LOWER(TRIM(?))");
        params.push(requestedCircle);
      }

      const requestedCmp = String(req.query.cmp || "").trim();
      if (requestedCmp) {
        conditions.push("LOWER(TRIM(cmp)) = LOWER(TRIM(?))");
        params.push(requestedCmp);
      }

      const requestedJobRole = String(req.query.jobRole || req.query.job_role || "").trim();
      if (requestedJobRole) {
        conditions.push("LOWER(TRIM(job_role)) = LOWER(TRIM(?))");
        params.push(requestedJobRole);
      }

      const requestedStatus = String(req.query.employmentStatus || req.query.employment_status || "").trim();
      if (requestedStatus) {
        conditions.push("LOWER(TRIM(employment_status)) = LOWER(TRIM(?))");
        params.push(requestedStatus);
      }

      const requestedPprjStatus = String(req.query.pprjStatus || req.query.pprj_status || "").trim();
      if (requestedPprjStatus) {
        const normalized = requestedPprjStatus.toLowerCase();
        if (normalized === "pending") {
          conditions.push("(TRIM(COALESCE(pprj_status, '')) = '' OR LOWER(TRIM(pprj_status)) = 'pending')");
        } else if (["not applicable", "n/a", "na"].includes(normalized)) {
          conditions.push("(LOWER(TRIM(COALESCE(pprj_status, ''))) LIKE 'n/a%' OR LOWER(TRIM(COALESCE(pprj_status, ''))) IN ('na', 'not applicable'))");
        } else {
          conditions.push("LOWER(TRIM(COALESCE(pprj_status, ''))) = LOWER(TRIM(?))");
          params.push(requestedPprjStatus);
        }
      }

      const dateFrom = String(req.query.dateFrom || "").trim();
      const dateTo = String(req.query.dateTo || "").trim();
      if (dateFrom) {
        conditions.push("date_of_joining >= ?");
        params.push(dateFrom);
      }
      if (dateTo) {
        conditions.push("date_of_joining <= ?");
        params.push(dateTo);
      }

      return {
        whereClause: `WHERE ${conditions.join(" AND ")}`,
        params,
      };
    }

    const query = (sql, params = []) =>
      new Promise((resolve, reject) => {
        db.query(sql, params, (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        });
      });
    const rootExecutor = createExecutor(query);

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

    async function runPhysicalSchemaMigration() {
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
        ["gtli", "VARCHAR(100) DEFAULT NULL"],
        ["nth_salary", "DECIMAL(12,2) DEFAULT 0"],
        ["remarks", "TEXT DEFAULT NULL"],
      ];

      for (const [column, definition] of physicalColumns) {
        await ensureColumn("physical", column, definition);
      }

      await ensureCircleUpdatesTable();
      await ensurePhysicalInfrastructure(query, ensureColumn);
    }

    // The migration must have completed before any query that references
    // is_deleted (soft delete) runs, but it only ever needs to run once per
    // process — not once per request. On failure the promise is dropped so
    // the next request retries instead of caching the error forever.
    let physicalSchemaPromise = null;

    function ensurePhysicalTables() {
      if (!physicalSchemaPromise) {
        physicalSchemaPromise = runPhysicalSchemaMigration().catch((error) => {
          physicalSchemaPromise = null;
          throw error;
        });
      }
      return physicalSchemaPromise;
    }

    // Every endpoint in this router (the dashboard count endpoints included)
    // queries columns the migration creates, so gate all of them on it.
    router.use(async (_req, res, next) => {
      try {
        await ensurePhysicalTables();
        next();
      } catch (error) {
        console.error("Physical schema init error:", error);
        res.status(500).json({ success: false, message: "Server Error" });
      }
    });

    // Warm the migration at boot so the first request doesn't pay for it.
    ensurePhysicalTables().catch((error) =>
      console.error(
        "Physical schema warm-up failed (will retry on request):",
        error.message
      )
    );

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

    function createConnectionExecutor(conn) {
      return createExecutor((sql, params = []) =>
        conn.promise().query(sql, params).then(([rows]) => rows)
      );
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

// gtli
toText(
  row["GTLI"]
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
          gtli,
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

    // Employees whose PF/ESIC field carries an explicit "not applicable" marker
    // are exempted rather than pending. For ESIC, employees above the statutory
    // wage ceiling are also exempt even when the field is blank.
    const DOC_EXEMPT_MARKERS = "('na', 'n/a', 'exempt', 'exempted', 'not applicable')";
    const ESIC_WAGE_CEILING = 21000;

    // Uploaded sheets store placeholder text ("Pending", "PPRJ Pending", "0")
    // inside document columns. A placeholder is not a real value, so it counts
    // as Pending — a plain non-blank check would wrongly report it Complete.
    const fieldPendingSql = (column) =>
      `(TRIM(COALESCE(${column}, '')) IN ('', '0') OR LOWER(TRIM(${column})) LIKE '%pending%')`;
    const fieldCompleteSql = (column) => `NOT ${fieldPendingSql(column)}`;

    const ESIC_EXEMPT_SQL = `(LOWER(TRIM(COALESCE(esic_ip_no, ''))) IN ${DOC_EXEMPT_MARKERS} OR (${fieldPendingSql("esic_ip_no")} AND COALESCE(nth_salary, 0) > ${ESIC_WAGE_CEILING}))`;
    const PF_EXEMPT_SQL = `LOWER(TRIM(COALESCE(pf_no, ''))) IN ${DOC_EXEMPT_MARKERS}`;

    // One shared definition of a "fully documented" employee, reused by every
    // completion percentage / missing-documents aggregate so they never drift.
    const ALL_DOCS_COMPLETE_SQL = `(
      ${fieldCompleteSql("aadhaar_no")} AND
      ${fieldCompleteSql("pan_no")} AND
      ${fieldCompleteSql("bank_account_no")} AND
      ${fieldCompleteSql("ifsc_code")} AND
      ${fieldCompleteSql("uan_no")} AND
      (${fieldCompleteSql("pf_no")} OR ${PF_EXEMPT_SQL}) AND
      (${fieldCompleteSql("esic_ip_no")} OR ${ESIC_EXEMPT_SQL}) AND
      ${fieldCompleteSql("company_email_id")} AND
      ${fieldCompleteSql("mobile_number")} AND
      ${fieldCompleteSql("pprj_code")} AND
      TRIM(COALESCE(pprj_status, '')) != '' AND
      date_of_joining IS NOT NULL
    )`;

    router.get("/dashboard/filter-options", async (req, res) => {
      try {
        await ensurePhysicalTables();
        const scope = getCircleScope(req);

        const requestedCircle = String(req.query.circle || "").trim();
        if (requestedCircle && !canAccessCircle(req.authUser, requestedCircle)) {
          return res.status(403).json({
            success: false,
            message: "You cannot access this circle's data.",
          });
        }

        const cacheScope = {
          ...getDashboardCacheScope(req),
          requestedCircle: requestedCircle.toLowerCase(),
        };
        const cached = getCachedValue("dashboardFilterOptions", cacheScope);
        if (cached) return res.status(200).json(cached);

        const baseWhere = `WHERE COALESCE(is_deleted, 0) = 0${scope.sql}`;

        // CMP options narrow to the selected circle so the dropdowns stay consistent.
        const cmpWhere = requestedCircle
          ? `${baseWhere} AND LOWER(TRIM(circle)) = LOWER(TRIM(?))`
          : baseWhere;
        const cmpParams = requestedCircle
          ? [...scope.params, requestedCircle]
          : scope.params;

        const distinctQuery = (column, where = baseWhere, queryParams = scope.params) =>
          query(
            `SELECT DISTINCT TRIM(${column}) AS value FROM physical ${where} AND TRIM(COALESCE(${column}, '')) != '' ORDER BY value ASC`,
            queryParams
          );

        const [circles, cmps, jobRoles, employmentStatuses, pprjStatuses] = await Promise.all([
          distinctQuery("circle"),
          distinctQuery("cmp", cmpWhere, cmpParams),
          distinctQuery("job_role"),
          distinctQuery("employment_status"),
          distinctQuery("pprj_status"),
        ]);

        const values = (rows) => rows.map((row) => row.value);
        const payload = {
          success: true,
          data: {
            circles: values(circles),
            cmps: values(cmps),
            jobRoles: values(jobRoles),
            employmentStatuses: values(employmentStatuses),
            pprjStatuses: values(pprjStatuses),
          },
        };

        setCachedValue("dashboardFilterOptions", cacheScope, payload);
        res.status(200).json(payload);
      } catch (error) {
        console.error("Physical dashboard filter options error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to load filter options",
        });
      }
    });

    router.get("/dashboard/analytics", async (req, res) => {
      try {
        await ensurePhysicalTables();
        const { whereClause, params } = buildAnalyticsFilters(req);

        const summaryPromise = query(
          `
          SELECT
            COUNT(*) AS total_employees,
            SUM(CASE WHEN LOWER(TRIM(COALESCE(employment_status, ''))) = 'active' THEN 1 ELSE 0 END) AS active_employees,
            SUM(CASE WHEN LOWER(TRIM(COALESCE(employment_status, ''))) = 'inactive' THEN 1 ELSE 0 END) AS inactive_employees,
            SUM(CASE WHEN LOWER(TRIM(COALESCE(employment_status, ''))) = 'resigned' THEN 1 ELSE 0 END) AS resigned_employees,
            SUM(CASE WHEN date_of_joining IS NOT NULL AND date_of_joining >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND date_of_joining <= LAST_DAY(CURDATE()) THEN 1 ELSE 0 END) AS new_joinings,
            COUNT(DISTINCT CASE WHEN TRIM(COALESCE(circle, '')) != '' THEN circle END) AS circle_count,
            COUNT(DISTINCT CASE WHEN TRIM(COALESCE(cmp, '')) != '' THEN cmp END) AS cmp_count,
            COUNT(DISTINCT CASE WHEN TRIM(COALESCE(job_role, '')) != '' THEN job_role END) AS job_role_count
          FROM physical
          ${whereClause}
          `,
          params
        );

        // Resigned/last-working dates are only "pending" for employees who have
        // actually separated; active employees legitimately have neither.
        const documentPromise = query(
          `
          SELECT
            COUNT(*) AS total_records,
            SUM(CASE WHEN LOWER(TRIM(COALESCE(pprj_status, ''))) = 'active' THEN 1 ELSE 0 END) AS pprj_status_active,
            SUM(CASE WHEN LOWER(TRIM(COALESCE(pprj_status, ''))) = 'inactive' THEN 1 ELSE 0 END) AS pprj_status_inactive,
            SUM(CASE WHEN TRIM(COALESCE(pprj_status, '')) = '' OR LOWER(TRIM(pprj_status)) = 'pending' THEN 1 ELSE 0 END) AS pprj_status_pending,
            SUM(CASE WHEN LOWER(TRIM(COALESCE(pprj_status, ''))) LIKE 'n/a%' OR LOWER(TRIM(COALESCE(pprj_status, ''))) IN ('na', 'not applicable') THEN 1 ELSE 0 END) AS pprj_status_not_applicable,
            SUM(CASE WHEN ${fieldCompleteSql("pprj_code")} THEN 1 ELSE 0 END) AS pprj_code_completed,
            SUM(CASE WHEN ${fieldPendingSql("pprj_code")} THEN 1 ELSE 0 END) AS pprj_code_pending,
            SUM(CASE WHEN ${fieldCompleteSql("employee_code")} THEN 1 ELSE 0 END) AS employee_code_completed,
            SUM(CASE WHEN ${fieldPendingSql("employee_code")} THEN 1 ELSE 0 END) AS employee_code_pending,
            SUM(CASE WHEN ${fieldCompleteSql("mobile_number")} THEN 1 ELSE 0 END) AS mobile_completed,
            SUM(CASE WHEN ${fieldPendingSql("mobile_number")} THEN 1 ELSE 0 END) AS mobile_pending,
            SUM(CASE WHEN date_of_joining IS NOT NULL THEN 1 ELSE 0 END) AS joining_date_completed,
            SUM(CASE WHEN date_of_joining IS NULL THEN 1 ELSE 0 END) AS joining_date_pending,
            SUM(CASE WHEN LOWER(TRIM(COALESCE(employment_status, ''))) = 'active' THEN 1 ELSE 0 END) AS employment_active,
            SUM(CASE WHEN LOWER(TRIM(COALESCE(employment_status, ''))) = 'inactive' THEN 1 ELSE 0 END) AS employment_inactive,
            SUM(CASE WHEN resigned_date IS NOT NULL THEN 1 ELSE 0 END) AS resigned_date_completed,
            SUM(CASE WHEN resigned_date IS NULL AND LOWER(TRIM(COALESCE(employment_status, ''))) IN ('inactive', 'resigned') THEN 1 ELSE 0 END) AS resigned_date_pending,
            SUM(CASE WHEN last_working_date IS NOT NULL THEN 1 ELSE 0 END) AS last_working_date_completed,
            SUM(CASE WHEN last_working_date IS NULL AND LOWER(TRIM(COALESCE(employment_status, ''))) IN ('inactive', 'resigned') THEN 1 ELSE 0 END) AS last_working_date_pending,
            SUM(CASE WHEN ${fieldCompleteSql("ifsc_code")} THEN 1 ELSE 0 END) AS ifsc_completed,
            SUM(CASE WHEN ${fieldPendingSql("ifsc_code")} THEN 1 ELSE 0 END) AS ifsc_pending,
            SUM(CASE WHEN ${fieldCompleteSql("bank_account_no")} THEN 1 ELSE 0 END) AS bank_completed,
            SUM(CASE WHEN ${fieldPendingSql("bank_account_no")} THEN 1 ELSE 0 END) AS bank_pending,
            SUM(CASE WHEN ${fieldCompleteSql("pan_no")} THEN 1 ELSE 0 END) AS pan_completed,
            SUM(CASE WHEN ${fieldPendingSql("pan_no")} THEN 1 ELSE 0 END) AS pan_pending,
            SUM(CASE WHEN ${fieldCompleteSql("aadhaar_no")} THEN 1 ELSE 0 END) AS aadhaar_completed,
            SUM(CASE WHEN ${fieldPendingSql("aadhaar_no")} THEN 1 ELSE 0 END) AS aadhaar_pending,
            SUM(CASE WHEN ${fieldCompleteSql("uan_no")} THEN 1 ELSE 0 END) AS uan_completed,
            SUM(CASE WHEN ${fieldPendingSql("uan_no")} THEN 1 ELSE 0 END) AS uan_pending,
            SUM(CASE WHEN ${fieldCompleteSql("esic_ip_no")} AND LOWER(TRIM(esic_ip_no)) NOT IN ${DOC_EXEMPT_MARKERS} THEN 1 ELSE 0 END) AS esic_completed,
            SUM(CASE WHEN ${fieldPendingSql("esic_ip_no")} AND COALESCE(nth_salary, 0) <= ${ESIC_WAGE_CEILING} THEN 1 ELSE 0 END) AS esic_pending,
            SUM(CASE WHEN ${ESIC_EXEMPT_SQL} THEN 1 ELSE 0 END) AS esic_exempted,
            SUM(CASE WHEN ${fieldCompleteSql("pf_no")} AND LOWER(TRIM(pf_no)) NOT IN ${DOC_EXEMPT_MARKERS} THEN 1 ELSE 0 END) AS pf_completed,
            SUM(CASE WHEN ${fieldPendingSql("pf_no")} THEN 1 ELSE 0 END) AS pf_pending,
            SUM(CASE WHEN ${PF_EXEMPT_SQL} THEN 1 ELSE 0 END) AS pf_exempted
          FROM physical
          ${whereClause}
          `,
          params
        );

        const circlePromise = query(
          `
          SELECT
            CASE WHEN TRIM(COALESCE(circle, '')) != '' THEN circle ELSE 'Unassigned' END AS label,
            COUNT(*) AS total_employees,
            SUM(CASE WHEN LOWER(TRIM(COALESCE(employment_status, ''))) = 'active' THEN 1 ELSE 0 END) AS active_employees,
            SUM(CASE WHEN LOWER(TRIM(COALESCE(employment_status, ''))) = 'inactive' THEN 1 ELSE 0 END) AS inactive_employees,
            SUM(CASE WHEN ${fieldPendingSql("pf_no")} THEN 1 ELSE 0 END) AS pf_pending,
            SUM(CASE WHEN ${fieldPendingSql("aadhaar_no")} THEN 1 ELSE 0 END) AS aadhaar_pending,
            SUM(CASE WHEN ${fieldPendingSql("bank_account_no")} THEN 1 ELSE 0 END) AS bank_pending,
            SUM(CASE WHEN ${fieldPendingSql("uan_no")} THEN 1 ELSE 0 END) AS uan_pending,
            SUM(CASE WHEN ${fieldPendingSql("esic_ip_no")} THEN 1 ELSE 0 END) AS esic_pending,
            SUM(CASE WHEN ${fieldPendingSql("pprj_code")} THEN 1 ELSE 0 END) AS pprj_pending,
            ROUND(AVG(CASE WHEN ${ALL_DOCS_COMPLETE_SQL} THEN 1 ELSE 0 END) * 100, 2) AS completion_percentage
          FROM physical
          ${whereClause}
          GROUP BY label
          ORDER BY total_employees DESC
          LIMIT 20
          `,
          params
        );

        const cmpPromise = query(
          `
          SELECT
            CASE WHEN TRIM(COALESCE(cmp, '')) != '' THEN cmp ELSE 'Unassigned' END AS label,
            COUNT(*) AS total_employees,
            SUM(CASE WHEN LOWER(TRIM(COALESCE(employment_status, ''))) = 'active' THEN 1 ELSE 0 END) AS active_employees,
            SUM(CASE WHEN LOWER(TRIM(COALESCE(employment_status, ''))) = 'inactive' THEN 1 ELSE 0 END) AS inactive_employees,
            SUM(CASE WHEN ${fieldPendingSql("pf_no")} THEN 1 ELSE 0 END) AS pf_pending,
            SUM(CASE WHEN ${fieldPendingSql("aadhaar_no")} THEN 1 ELSE 0 END) AS aadhaar_pending,
            SUM(CASE WHEN ${fieldPendingSql("bank_account_no")} THEN 1 ELSE 0 END) AS bank_pending,
            SUM(CASE WHEN ${fieldPendingSql("uan_no")} THEN 1 ELSE 0 END) AS uan_pending,
            SUM(CASE WHEN ${fieldPendingSql("esic_ip_no")} THEN 1 ELSE 0 END) AS esic_pending,
            ROUND(AVG(CASE WHEN ${ALL_DOCS_COMPLETE_SQL} THEN 1 ELSE 0 END) * 100, 2) AS completion_percentage
          FROM physical
          ${whereClause}
          GROUP BY label
          ORDER BY total_employees DESC
          LIMIT 20
          `,
          params
        );

        const jobRolePromise = query(
          `
          SELECT
            CASE WHEN TRIM(COALESCE(job_role, '')) != '' THEN job_role ELSE 'Unassigned' END AS label,
            COUNT(*) AS total_employees,
            SUM(CASE WHEN NOT ${ALL_DOCS_COMPLETE_SQL} THEN 1 ELSE 0 END) AS missing_documents,
            ROUND(AVG(CASE WHEN ${ALL_DOCS_COMPLETE_SQL} THEN 1 ELSE 0 END) * 100, 2) AS completion_percentage
          FROM physical
          ${whereClause}
          GROUP BY label
          ORDER BY total_employees DESC
          LIMIT 20
          `,
          params
        );

        const [summaryRows, documentRows, circleRows, cmpRows, jobRoleRows] = await Promise.all([
          summaryPromise,
          documentPromise,
          circlePromise,
          cmpPromise,
          jobRolePromise,
        ]);

        const summary = summaryRows[0] || {};
        const documentSummary = documentRows[0] || {};
        const pair = (completedKey, pendingKey) => ({
          completed: Number(documentSummary[completedKey] || 0),
          pending: Number(documentSummary[pendingKey] || 0),
        });

        res.status(200).json({
          success: true,
          data: {
            summary: {
              totalEmployees: Number(summary.total_employees || 0),
              activeEmployees: Number(summary.active_employees || 0),
              inactiveEmployees: Number(summary.inactive_employees || 0),
              resignedEmployees: Number(summary.resigned_employees || 0),
              newJoinings: Number(summary.new_joinings || 0),
              circleCount: Number(summary.circle_count || 0),
              cmpCount: Number(summary.cmp_count || 0),
              jobRoleCount: Number(summary.job_role_count || 0),
            },
            documentSummary: {
              totalRecords: Number(documentSummary.total_records || 0),
              pprjStatus: {
                active: Number(documentSummary.pprj_status_active || 0),
                inactive: Number(documentSummary.pprj_status_inactive || 0),
                pending: Number(documentSummary.pprj_status_pending || 0),
                notApplicable: Number(documentSummary.pprj_status_not_applicable || 0),
              },
              pprjCode: pair("pprj_code_completed", "pprj_code_pending"),
              employeeCode: pair("employee_code_completed", "employee_code_pending"),
              mobile: pair("mobile_completed", "mobile_pending"),
              joiningDate: pair("joining_date_completed", "joining_date_pending"),
              employmentStatus: {
                active: Number(documentSummary.employment_active || 0),
                inactive: Number(documentSummary.employment_inactive || 0),
              },
              resignedDate: pair("resigned_date_completed", "resigned_date_pending"),
              lastWorkingDate: pair("last_working_date_completed", "last_working_date_pending"),
              ifsc: pair("ifsc_completed", "ifsc_pending"),
              bankAccount: pair("bank_completed", "bank_pending"),
              pan: pair("pan_completed", "pan_pending"),
              aadhaar: pair("aadhaar_completed", "aadhaar_pending"),
              uan: pair("uan_completed", "uan_pending"),
              esic: {
                ...pair("esic_completed", "esic_pending"),
                exempted: Number(documentSummary.esic_exempted || 0),
              },
              pf: {
                ...pair("pf_completed", "pf_pending"),
                exempted: Number(documentSummary.pf_exempted || 0),
              },
            },
            circleBreakdown: circleRows,
            cmpBreakdown: cmpRows,
            jobRoleBreakdown: jobRoleRows,
          },
        });
      } catch (error) {
        console.error("Physical dashboard analytics error:", error);
        const status = error?.statusCode || 500;
        res.status(status).json({
          success: false,
          message: error.message || "Failed to load dashboard analytics",
        });
      }
    });

    // Whitelist of columns a field_status/missing_data drilldown may target.
    const DRILLDOWN_FIELD_COLUMNS = new Set([
      "pprj_code",
      "employee_code",
      "mobile_number",
      "date_of_joining",
      "resigned_date",
      "last_working_date",
      "ifsc_code",
      "bank_account_no",
      "pan_no",
      "aadhaar_no",
      "uan_no",
      "esic_ip_no",
      "pf_no",
      "company_email_id",
    ]);

    const DRILLDOWN_DATE_COLUMNS = new Set(["date_of_joining", "resigned_date", "last_working_date"]);

    function buildFieldStatusCondition(column, status) {
      if (DRILLDOWN_DATE_COLUMNS.has(column)) {
        if (status === "complete") return ` AND ${column} IS NOT NULL`;
        if (column === "resigned_date" || column === "last_working_date") {
          return ` AND ${column} IS NULL AND LOWER(TRIM(COALESCE(employment_status, ''))) IN ('inactive', 'resigned')`;
        }
        return ` AND ${column} IS NULL`;
      }

      // Conditions must mirror the analytics aggregates exactly, otherwise the
      // employee list behind a count won't match the count on the card.
      const isExemptible = column === "pf_no" || column === "esic_ip_no";

      if (status === "complete") {
        return isExemptible
          ? ` AND ${fieldCompleteSql(column)} AND LOWER(TRIM(${column})) NOT IN ${DOC_EXEMPT_MARKERS}`
          : ` AND ${fieldCompleteSql(column)}`;
      }

      if (status === "exempted") {
        if (column === "esic_ip_no") return ` AND ${ESIC_EXEMPT_SQL}`;
        if (column === "pf_no") return ` AND ${PF_EXEMPT_SQL}`;
        return ` AND LOWER(TRIM(COALESCE(${column}, ''))) IN ${DOC_EXEMPT_MARKERS}`;
      }

      // pending
      if (column === "esic_ip_no") {
        return ` AND ${fieldPendingSql("esic_ip_no")} AND COALESCE(nth_salary, 0) <= ${ESIC_WAGE_CEILING}`;
      }
      return ` AND ${fieldPendingSql(column)}`;
    }

    router.get("/dashboard/drilldown", async (req, res) => {
      try {
        await ensurePhysicalTables();
        // Same permission-aware base filters as the analytics endpoint —
        // circle scope, CMP, job role, statuses and date range come from here.
        const { whereClause, params } = buildAnalyticsFilters(req);

        const isExport = String(req.query.export || "") === "true";
        const page = Math.max(1, Number(req.query.page || 1));
        const pageSize = Math.min(isExport ? 10000 : 100, Math.max(1, Number(req.query.pageSize || 25)));
        const search = String(req.query.search || "").trim();
        const metric = String(req.query.metric || "missing_data").trim();
        const field = String(req.query.field || "").trim();
        const value = String(req.query.value || "").trim();

        let whereSql = whereClause;
        const queryParams = [...params];

        if (metric === "circle" && value) {
          if (!canAccessCircle(req.authUser, value)) {
            return res.status(403).json({ success: false, message: "You cannot access this circle's analytics." });
          }
          whereSql += ` AND LOWER(TRIM(circle)) = LOWER(TRIM(?))`;
          queryParams.push(value);
        } else if (metric === "cmp" && value) {
          whereSql += ` AND LOWER(TRIM(cmp)) = LOWER(TRIM(?))`;
          queryParams.push(value);
        } else if (metric === "job_role" && value) {
          whereSql += ` AND LOWER(TRIM(job_role)) = LOWER(TRIM(?))`;
          queryParams.push(value);
        } else if (metric === "employment_status" && value) {
          whereSql += ` AND LOWER(TRIM(employment_status)) = LOWER(TRIM(?))`;
          queryParams.push(value);
        } else if (metric === "pprj_status" && value) {
          const normalized = value.toLowerCase();
          if (normalized === "pending") {
            whereSql += ` AND (TRIM(COALESCE(pprj_status, '')) = '' OR LOWER(TRIM(pprj_status)) = 'pending')`;
          } else if (["not applicable", "n/a", "na"].includes(normalized)) {
            whereSql += ` AND (LOWER(TRIM(COALESCE(pprj_status, ''))) LIKE 'n/a%' OR LOWER(TRIM(COALESCE(pprj_status, ''))) IN ('na', 'not applicable'))`;
          } else {
            whereSql += ` AND LOWER(TRIM(COALESCE(pprj_status, ''))) = LOWER(TRIM(?))`;
            queryParams.push(value);
          }
        } else if (metric === "field_status") {
          if (!DRILLDOWN_FIELD_COLUMNS.has(field)) {
            return res.status(400).json({ success: false, message: "Unknown drilldown field." });
          }
          const status = ["complete", "pending", "exempted"].includes(value.toLowerCase())
            ? value.toLowerCase()
            : "pending";
          whereSql += buildFieldStatusCondition(field, status);
        } else if (metric === "missing_data") {
          const targetField = DRILLDOWN_FIELD_COLUMNS.has(field) ? field : "pf_no";
          whereSql += buildFieldStatusCondition(targetField, "pending");
        }

        if (search) {
          whereSql += ` AND (LOWER(employee_name) LIKE LOWER(?) OR LOWER(employee_code) LIKE LOWER(?) OR aadhaar_no LIKE ? OR mobile_number LIKE ? OR LOWER(cmp) LIKE LOWER(?) OR LOWER(circle) LIKE LOWER(?))`;
          const likeValue = `%${search}%`;
          queryParams.push(likeValue, likeValue, likeValue, likeValue, likeValue, likeValue);
        }

        const SORTABLE_COLUMNS = new Set(["employee_name", "employee_code", "circle", "cmp", "job_role", "employment_status", "date_of_joining"]);
        const sortBy = SORTABLE_COLUMNS.has(String(req.query.sortBy || "")) ? req.query.sortBy : "employee_name";
        const sortOrder = String(req.query.sortOrder || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";

        const [totalRows, rows] = await Promise.all([
          query(`SELECT COUNT(*) AS total FROM physical ${whereSql}`, queryParams),
          query(
            `
            SELECT
              id,
              employee_code,
              employee_name,
              circle,
              cmp,
              job_role,
              employment_status,
              pprj_status,
              mobile_number,
              DATE_FORMAT(date_of_joining, '%d-%m-%Y') AS date_of_joining,
              DATE_FORMAT(resigned_date, '%d-%m-%Y') AS resigned_date,
              DATE_FORMAT(last_working_date, '%d-%m-%Y') AS last_working_date,
              aadhaar_no,
              pan_no,
              bank_account_no,
              ifsc_code,
              uan_no,
              esic_ip_no,
              pf_no,
              CONCAT_WS(', ',
                CASE WHEN ${fieldPendingSql("pprj_code")} THEN 'PPRJ Code' END,
                CASE WHEN ${fieldPendingSql("employee_code")} THEN 'Employee Code' END,
                CASE WHEN ${fieldPendingSql("mobile_number")} THEN 'Mobile Number' END,
                CASE WHEN date_of_joining IS NULL THEN 'Date Of Joining' END,
                CASE WHEN ${fieldPendingSql("ifsc_code")} THEN 'IFSC Code' END,
                CASE WHEN ${fieldPendingSql("bank_account_no")} THEN 'Bank Account' END,
                CASE WHEN ${fieldPendingSql("pan_no")} THEN 'PAN Number' END,
                CASE WHEN ${fieldPendingSql("aadhaar_no")} THEN 'Aadhaar Number' END,
                CASE WHEN ${fieldPendingSql("uan_no")} THEN 'UAN Number' END,
                CASE WHEN ${fieldPendingSql("esic_ip_no")} AND COALESCE(nth_salary, 0) <= ${ESIC_WAGE_CEILING} THEN 'ESIC IP Number' END,
                CASE WHEN ${fieldPendingSql("pf_no")} THEN 'PF Number' END
              ) AS missing_fields
            FROM physical
            ${whereSql}
            ORDER BY ${sortBy} ${sortOrder}
            LIMIT ? OFFSET ?
            `,
            [...queryParams, pageSize, (page - 1) * pageSize]
          ),
        ]);

        res.status(200).json({
          success: true,
          data: rows,
          pagination: {
            page,
            pageSize,
            totalRecords: Number(totalRows[0]?.total || 0),
            totalPages: Math.max(1, Math.ceil((Number(totalRows[0]?.total || 0)) / pageSize)),
          },
        });
      } catch (error) {
        console.error("Physical dashboard drilldown error:", error);
        res.status(error?.statusCode || 500).json({
          success: false,
          message: error.message || "Failed to load drilldown data",
        });
      }
    });

    router.get("/export", async (req, res) => {

      try {
        await ensurePhysicalTables();

        const userCircle =
          req.authUser?.circle || "ALL";

        let whereClause = "WHERE COALESCE(is_deleted, 0) = 0";
        let params = [];

        if (
          userCircle &&
          userCircle !== "ALL"
        ) {
          whereClause += " AND circle = ?";
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
        await ensurePhysicalTables();

        const rawPage = Number.parseInt(req.query.page, 10);
        const rawPageSize = Number.parseInt(req.query.pageSize, 10);
        const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
        const pageSize =
          Number.isInteger(rawPageSize) && rawPageSize > 0
            ? Math.min(rawPageSize, 500)
            : 50;
        const search = String(req.query.search || "").trim();

        const filters = {
          circle: req.query.circle || "",
          cmp: req.query.cmp || "",
          jobRole: req.query.jobRole || "",
          employmentStatus: req.query.employmentStatus || "",
          dojFrom: req.query.dojFrom || "",
          dojTo: req.query.dojTo || "",
          salaryMin: req.query.salaryMin || "",
          salaryMax: req.query.salaryMax || "",
          ageMin: req.query.ageMin || "",
          ageMax: req.query.ageMax || "",
          reportingManager: req.query.reportingManager || "",
          laptopStatus: req.query.laptopStatus || "",
          uploadDateFrom: req.query.uploadDateFrom || "",
          uploadDateTo: req.query.uploadDateTo || "",
          reportDateFrom: req.query.reportDateFrom || "",
          reportDateTo: req.query.reportDateTo || "",
        };

        const filterMeta = buildPhysicalFilters({
          authUser: req.authUser,
          filters,
          search,
          sortBy: req.query.sortBy || "id",
          sortOrder: req.query.sortOrder || "DESC",
        });

        const totalResult = await query(
          `
            SELECT COUNT(*) AS total
            FROM physical
            LEFT JOIN physical_reports pr
              ON pr.id = physical.report_id
             AND COALESCE(pr.is_deleted, 0) = 0
            ${filterMeta.whereSql}
          `,
          filterMeta.params
        );

        const totalRecords = Number(totalResult[0]?.total || 0);
        const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
        const safePage = Math.min(page, totalPages);
        const offset = (safePage - 1) * pageSize;

        const rows = await query(
          `
            SELECT physical.*, pr.report_date
            FROM physical
            LEFT JOIN physical_reports pr
              ON pr.id = physical.report_id
             AND COALESCE(pr.is_deleted, 0) = 0
            ${filterMeta.whereSql}
            ORDER BY ${filterMeta.orderBy} ${filterMeta.orderDirection}
            LIMIT ? OFFSET ?
          `,
          [...filterMeta.params, pageSize, offset]
        );

        res.json({
          success: true,
          data: rows,
          total: totalRecords,
          totalRecords,
          totalPages,
          currentPage: safePage,
          pageSize,
        });
      } catch (error) {
        console.error("Physical list error:", error);
        sendError(res, error, "Failed to load physical data");
      }
    });

    router.post("/upload-report", upload.single("file"), async (req, res) => {
      let conn;

      try {
        await ensurePhysicalTables();
        const actor = getActorContext(req);

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
        gtli=?,
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
        toText(row["GTLI"]),
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

        const uploadExecutor = createConnectionExecutor(conn);
        await insertAuditLog(uploadExecutor, {
          ...actor,
          entityType: "report",
          reportId: reportResult.insertId,
          action: "REPORT_UPLOAD",
          circle: uploadedCircles.length === 1 ? uploadedCircles[0] : null,
          previousData: null,
          newData: {
            reportId: reportResult.insertId,
            totalEmployees: rows.length,
            addedEmployees: insertRows.length,
            updatedEmployees,
            duplicateEmployees,
          },
        });

        await insertNotification(uploadExecutor, {
          moduleName: "physical",
          eventType: "report_uploaded",
          title: "Physical report uploaded",
          message: `${req.file.originalname} was uploaded successfully.`,
          circle: uploadedCircles.length === 1 ? uploadedCircles[0] : null,
          actorUserId: req.authUser.id || null,
          referenceId: reportResult.insertId,
          referenceType: "physical_report",
        });

        await conn.promise().commit();
        clearPhysicalCache();

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
      await ensurePhysicalTables();

      const data = req.body;
      const actor = getActorContext(req);

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

      const duplicateRows = await findDuplicateEmployees(query, data);
      if (duplicateRows.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Employee already exists with matching unique details",
        });
      }

        const conn = await getConnection();

        try {
          await conn.promise().beginTransaction();
          const executor = createConnectionExecutor(conn);

          const result = await executor.query(
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
              gtli,
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
              data.gtli || "",
              data.nth_salary || 0,
              data.remarks || ""

            ]
          );

          const insertedRows = await executor.query(
            `SELECT * FROM physical WHERE id = ? LIMIT 1`,
            [result.insertId]
          );
          const insertedRow = insertedRows[0];

          await insertAuditLog(executor, {
            ...actor,
            entityType: "employee",
            entityId: insertedRow.id,
            action: "EMPLOYEE_CREATE",
            circle: insertedRow.circle,
            cmp: insertedRow.cmp,
            newData: insertedRow,
          });

          await insertTimelineEvent(executor, {
            employeeId: insertedRow.id,
            action: "CREATED",
            actorUserId: actor.actorUserId,
            actorName: actor.actorName,
            circle: insertedRow.circle,
            cmp: insertedRow.cmp,
            newData: insertedRow,
          });

          await insertNotification(executor, {
            moduleName: "physical",
            eventType: "employee_created",
            title: "Physical employee created",
            message: `${insertedRow.employee_name || "Employee"} was added.`,
            circle: insertedRow.circle,
            cmp: insertedRow.cmp,
            actorUserId: req.authUser.id || null,
            referenceId: insertedRow.id,
            referenceType: "physical_employee",
          });

          await conn.promise().commit();
          clearPhysicalCache();
        } catch (error) {
          await conn.promise().rollback();
          throw error;
        } finally {
          conn.release();
        }

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
          ? "WHERE COALESCE(physical_reports.is_deleted, 0) = 0"
          : `WHERE EXISTS (
              SELECT 1 FROM physical p
              WHERE p.report_id = physical_reports.id
                AND COALESCE(p.is_deleted, 0) = 0
                AND LOWER(TRIM(p.circle)) = LOWER(TRIM(?))
            )
            AND COALESCE(physical_reports.is_deleted, 0) = 0`;
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
        const actor = getActorContext(req);

        const filters = ["report_id = ?"];
        const params = [reportId];
        addCircleFilter(filters, params, req.authUser);
        const reportRows = await query(
          `SELECT * FROM physical WHERE ${filters.join(" AND ")} AND COALESCE(is_deleted, 0) = 0`,
          params
        );
        const report = reportRows[0];

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

        const conn = await getConnection();

        try {
          await conn.promise().beginTransaction();
          const executor = createConnectionExecutor(conn);

          await executor.query(
            `
              UPDATE physical
              SET is_deleted = 1,
                  deleted_at = NOW(),
                  deleted_by = ?
              WHERE report_id = ?
                AND COALESCE(is_deleted, 0) = 0
            `,
            [req.authUser.id || null, reportId]
          );

          await executor.query(
            `
              UPDATE physical_reports
              SET is_deleted = 1,
                  deleted_at = NOW(),
                  deleted_by = ?
              WHERE id = ?
                AND COALESCE(is_deleted, 0) = 0
            `,
            [req.authUser.id || null, reportId]
          );

          await insertAuditLog(executor, {
            ...actor,
            entityType: "report",
            reportId,
            action: "REPORT_SOFT_DELETE",
            circle: report.circle,
            cmp: report.cmp,
            previousData: { reportId, rows: reportRows.length },
          });

          await insertNotification(executor, {
            moduleName: "physical",
            eventType: "report_deleted",
            title: "Physical report deleted",
            message: `Report ${reportId} was soft deleted.`,
            circle: report.circle,
            cmp: report.cmp,
            actorUserId: req.authUser.id || null,
            referenceId: reportId,
            referenceType: "physical_report",
          });

          await conn.promise().commit();
          clearPhysicalCache();
        } catch (error) {
          await conn.promise().rollback();
          throw error;
        } finally {
          conn.release();
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

    router.delete("/bulk-delete", async (req, res) => {

      try {
        await ensurePhysicalTables();

        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
          return res.status(400).json({
            success: false,
            message: "No records selected"
          });
        }

        const placeholders = ids.map(() => "?").join(",");
        const actor = getActorContext(req);
        const rows = await query(
          `
            SELECT *
            FROM physical
            WHERE id IN (${placeholders})
              AND COALESCE(is_deleted, 0) = 0
              ${isAllCircle(req.authUser) ? "" : " AND LOWER(TRIM(circle)) = LOWER(TRIM(?))"}
          `,
          isAllCircle(req.authUser) ? ids : [...ids, req.authUser.circle]
        );

        if (!rows.length) {
          return forbid(res);
        }

        const conn = await getConnection();

        try {
          await conn.promise().beginTransaction();
          const executor = createConnectionExecutor(conn);

          await executor.query(
            `
              UPDATE physical
              SET is_deleted = 1,
                  deleted_at = NOW(),
                  deleted_by = ?
              WHERE id IN (${rows.map(() => "?").join(",")})
            `,
            [req.authUser.id || null, ...rows.map((row) => row.id)]
          );

          for (const row of rows) {
            await insertAuditLog(executor, {
              ...actor,
              entityType: "employee",
              entityId: row.id,
              reportId: row.report_id,
              action: "EMPLOYEE_SOFT_DELETE",
              circle: row.circle,
              cmp: row.cmp,
              previousData: row,
              meta: { source: "bulk-delete" },
            });

            await insertTimelineEvent(executor, {
              employeeId: row.id,
              action: "DELETED",
              actorUserId: actor.actorUserId,
              actorName: actor.actorName,
              circle: row.circle,
              cmp: row.cmp,
              previousData: row,
              meta: { source: "bulk-delete" },
            });
          }

          await insertNotification(executor, {
            moduleName: "physical",
            eventType: "bulk_delete",
            title: "Physical employees deleted",
            message: `${rows.length} employee record(s) were soft deleted.`,
            circle: rows[0]?.circle || null,
            cmp: null,
            actorUserId: req.authUser.id || null,
            referenceId: null,
            referenceType: "physical_employee",
          });

          await conn.promise().commit();
          clearPhysicalCache();
        } catch (error) {
          await conn.promise().rollback();
          throw error;
        } finally {
          conn.release();
        }

        res.json({
          success: true,
          message: `${rows.length} records deleted successfully`
        });

      } catch (error) {

        console.error("Physical bulk delete error:", error);
        sendError(res, error, "Delete failed");

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
        await ensurePhysicalTables();
        const actor = getActorContext(req);
        const rows = await query(
          `
            SELECT *
            FROM physical
            WHERE id = ?
              AND COALESCE(is_deleted, 0) = 0
              ${isAllCircle(req.authUser) ? "" : " AND LOWER(TRIM(circle)) = LOWER(TRIM(?))"}
            LIMIT 1
          `,
          isAllCircle(req.authUser) ? [id] : [id, req.authUser.circle]
        );
        const row = rows[0];

        if (!row) {
          return forbid(res);
        }

        const conn = await getConnection();

        try {
          await conn.promise().beginTransaction();
          const executor = createConnectionExecutor(conn);

          const result = await executor.query(
            `
              UPDATE physical
              SET is_deleted = 1,
                  deleted_at = NOW(),
                  deleted_by = ?
              WHERE id = ?
                AND COALESCE(is_deleted, 0) = 0
            `,
            [req.authUser.id || null, id]
          );
          if (!result.affectedRows) {
            throw createError("Employee not found", 404, "EMPLOYEE_NOT_FOUND");
          }

          await insertAuditLog(executor, {
            ...actor,
            entityType: "employee",
            entityId: row.id,
            reportId: row.report_id,
            action: "EMPLOYEE_SOFT_DELETE",
            circle: row.circle,
            cmp: row.cmp,
            previousData: row,
          });

          await insertTimelineEvent(executor, {
            employeeId: row.id,
            action: "DELETED",
            actorUserId: actor.actorUserId,
            actorName: actor.actorName,
            circle: row.circle,
            cmp: row.cmp,
            previousData: row,
          });

          await insertNotification(executor, {
            moduleName: "physical",
            eventType: "employee_deleted",
            title: "Physical employee deleted",
            message: `${row.employee_name || "Employee"} was soft deleted.`,
            circle: row.circle,
            cmp: row.cmp,
            actorUserId: req.authUser.id || null,
            referenceId: row.id,
            referenceType: "physical_employee",
          });

          await conn.promise().commit();
          clearPhysicalCache();
        } catch (error) {
          await conn.promise().rollback();
          throw error;
        } finally {
          conn.release();
        }

        res.status(200).json({
          success: true,
          message: "Employee deleted successfully",
        });

      } catch (error) {

        console.error("Employee delete error:", error);
        sendError(res, error, "Server Error");

      }

    });

    router.post("/restore-employee/:id", async (req, res) => {
      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid Employee ID",
        });
      }

      if (!isPrivilegedPhysicalAdmin(req.authUser)) {
        return forbid(res, "Only admin users can restore employee records.");
      }

      try {
        await ensurePhysicalTables();
        const actor = getActorContext(req);
        const rows = await query(
          `SELECT * FROM physical WHERE id = ? AND COALESCE(is_deleted, 0) = 1 LIMIT 1`,
          [id]
        );
        const row = rows[0];

        if (!row) {
          throw createError("Deleted employee not found", 404, "EMPLOYEE_NOT_FOUND");
        }

        const conn = await getConnection();
        try {
          await conn.promise().beginTransaction();
          const executor = createConnectionExecutor(conn);

          await executor.query(
            `
              UPDATE physical
              SET is_deleted = 0,
                  deleted_at = NULL,
                  deleted_by = NULL
              WHERE id = ?
            `,
            [id]
          );

          await insertAuditLog(executor, {
            ...actor,
            entityType: "employee",
            entityId: row.id,
            reportId: row.report_id,
            action: "EMPLOYEE_RESTORE",
            circle: row.circle,
            cmp: row.cmp,
            previousData: { is_deleted: 1 },
            newData: { is_deleted: 0 },
          });

          await insertTimelineEvent(executor, {
            employeeId: row.id,
            action: "RESTORED",
            actorUserId: actor.actorUserId,
            actorName: actor.actorName,
            circle: row.circle,
            cmp: row.cmp,
            previousData: { is_deleted: 1 },
            newData: { is_deleted: 0 },
          });

          await insertNotification(executor, {
            moduleName: "physical",
            eventType: "employee_restored",
            title: "Physical employee restored",
            message: `${row.employee_name || "Employee"} was restored.`,
            circle: row.circle,
            cmp: row.cmp,
            actorUserId: req.authUser.id || null,
            referenceId: row.id,
            referenceType: "physical_employee",
          });

          await conn.promise().commit();
          clearPhysicalCache();
        } catch (error) {
          await conn.promise().rollback();
          throw error;
        } finally {
          conn.release();
        }

        res.json({
          success: true,
          message: "Employee restored successfully",
        });
      } catch (error) {
        console.error("Employee restore error:", error);
        sendError(res, error, "Failed to restore employee");
      }
    });

    router.get("/download/:id", async (req, res) => {
      const reportId = Number(req.params.id);

      if (!Number.isInteger(reportId) || reportId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid report ID",
        });
      }

      try {
        await ensurePhysicalTables();

        const reportRows = await query(
          `
            SELECT *
            FROM physical_reports
            WHERE id = ?
              AND COALESCE(is_deleted, 0) = 0
            LIMIT 1
          `,
          [reportId]
        );
        const report = reportRows[0];

        if (!report) {
          throw createError("Report not found", 404, "REPORT_NOT_FOUND");
        }

        const dataRows = await query(
          `
            SELECT *
            FROM physical
            WHERE report_id = ?
              AND COALESCE(is_deleted, 0) = 0
              ${isAllCircle(req.authUser) ? "" : " AND LOWER(TRIM(circle)) = LOWER(TRIM(?))"}
            ORDER BY id ASC
          `,
          isAllCircle(req.authUser) ? [reportId] : [reportId, req.authUser.circle]
        );

        if (!dataRows.length) {
          return forbid(res);
        }

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(dataRows);
        XLSX.utils.book_append_sheet(workbook, worksheet, "Physical");

        const buffer = XLSX.write(workbook, {
          type: "buffer",
          bookType: "xlsx",
        });

        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${report.original_name || `physical_report_${reportId}.xlsx`}"`
        );
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );

        return res.send(buffer);
      } catch (error) {
        console.error("Physical report download error:", error);
        sendError(res, error, "Download failed");
      }
    });

    router.delete("/permanent-delete-employee/:id", async (req, res) => {
      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid Employee ID",
        });
      }

      if (!isPrivilegedPhysicalAdmin(req.authUser)) {
        return forbid(res, "Only admin users can permanently delete employee records.");
      }

      try {
        await ensurePhysicalTables();
        const actor = getActorContext(req);
        const rows = await query(`SELECT * FROM physical WHERE id = ? LIMIT 1`, [id]);
        const row = rows[0];

        if (!row) {
          throw createError("Employee not found", 404, "EMPLOYEE_NOT_FOUND");
        }

        const conn = await getConnection();
        try {
          await conn.promise().beginTransaction();
          const executor = createConnectionExecutor(conn);

          await insertAuditLog(executor, {
            ...actor,
            entityType: "employee",
            entityId: row.id,
            reportId: row.report_id,
            action: "EMPLOYEE_PERMANENT_DELETE",
            circle: row.circle,
            cmp: row.cmp,
            previousData: row,
          });

          await insertTimelineEvent(executor, {
            employeeId: row.id,
            action: "PERMANENTLY_DELETED",
            actorUserId: actor.actorUserId,
            actorName: actor.actorName,
            circle: row.circle,
            cmp: row.cmp,
            previousData: row,
          });

          await executor.query(`DELETE FROM physical WHERE id = ?`, [id]);

          await conn.promise().commit();
          clearPhysicalCache();
        } catch (error) {
          await conn.promise().rollback();
          throw error;
        } finally {
          conn.release();
        }

        res.json({
          success: true,
          message: "Employee permanently deleted successfully",
        });
      } catch (error) {
        console.error("Employee permanent delete error:", error);
        sendError(res, error, "Failed to permanently delete employee");
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
        const [existing] = await query(
          `SELECT circle FROM physical WHERE id = ? AND COALESCE(is_deleted, 0) = 0 LIMIT 1`,
          [id]
        );
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
            AND COALESCE(is_deleted, 0) = 0
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

    const cacheScope = getDashboardCacheScope(req);
    const cached = getCachedValue("jobRoleCount", cacheScope);
    if (cached) return res.status(200).json(cached);

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

      WHERE COALESCE(is_deleted, 0) = 0
      AND job_role IS NOT NULL
      AND job_role != ''
      ${scope.sql}

      GROUP BY role_group

      ORDER BY total DESC
    `, scope.params);

        const payload = { success: true, data: rows };
        setCachedValue("jobRoleCount", cacheScope, payload);
        res.status(200).json(payload);

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

      const cacheScope = getDashboardCacheScope(req);
      const cached = getCachedValue("circleCount", cacheScope);
      if (cached) return res.status(200).json(cached);

      const scope = getCircleScope(req);
      const rows = await query(`
      SELECT
        circle,
        COUNT(*) as total
      FROM physical

      WHERE COALESCE(is_deleted, 0) = 0
      AND circle IS NOT NULL
      AND circle != ''
      ${scope.sql}

      GROUP BY circle
      ORDER BY total DESC
    `, scope.params);

        const payload = { success: true, data: rows };
        setCachedValue("circleCount", cacheScope, payload);
        res.status(200).json(payload);

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

    const cacheScope = getDashboardCacheScope(req);
    const cached = getCachedValue("employmentStatusCount", cacheScope);
    if (cached) return res.status(200).json(cached);

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

    WHERE COALESCE(is_deleted, 0) = 0
    AND employment_status IS NOT NULL
    AND TRIM(employment_status) != ''
    ${scope.sql}

    GROUP BY employment_status
    `, scope.params);

        const payload = { success: true, data: rows };
        setCachedValue("employmentStatusCount", cacheScope, payload);
        res.status(200).json(payload);

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

        const cacheScope = getDashboardCacheScope(req);
        const cached = getCachedValue("jobRoleDocumentAverage", cacheScope);
        if (cached) return res.status(200).json(cached);

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

          WHERE COALESCE(is_deleted, 0) = 0
            AND job_role IS NOT NULL
            AND job_role != ''
            ${scope.sql}

          GROUP BY role_group

          ORDER BY document_average DESC
        `, scope.params);

        const payload = { success: true, data: rows };
        setCachedValue("jobRoleDocumentAverage", cacheScope, payload);
        res.status(200).json(payload);

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

        const cacheScope = getDashboardCacheScope(req);
        const cached = getCachedValue("activeJobRoleCmpCount", cacheScope);
        if (cached) return res.status(200).json(cached);

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
          WHERE COALESCE(is_deleted, 0) = 0
            AND LOWER(TRIM(COALESCE(employment_status, ''))) = 'active'
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
                AND COALESCE(dedupe.is_deleted, 0) = 0
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

        const payload = { success: true, data: rows };
        // Shorter TTL: this also reads new_joining, whose mutations don't
        // pass through clearPhysicalCache().
        setCachedValue("activeJobRoleCmpCount", cacheScope, payload, 30 * 1000);
        res.status(200).json(payload);

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
            AND COALESCE(is_deleted, 0) = 0
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
          AND COALESCE(is_deleted, 0) = 0
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
          await ensurePhysicalTables();

          const data = req.body;
          const actor = getActorContext(req);

          const [existing] = await query(`SELECT * FROM physical WHERE id = ? AND COALESCE(is_deleted, 0) = 0 LIMIT 1`, [
            req.params.id,
          ]);
          if (
            !existing ||
            !canAccessCircle(req.authUser, existing.circle) ||
            !canAccessCircle(req.authUser, data.circle)
          ) {
            return forbid(res);
          }

        const duplicateRows = await findDuplicateEmployees(
          query,
          data,
          Number(req.params.id)
        );

        if (duplicateRows.length > 0) {
          return res.status(409).json({
            success: false,
            message: "Employee already exists with matching unique details",
          });
        }

        const conn = await getConnection();
        try {
          await conn.promise().beginTransaction();
          const executor = createConnectionExecutor(conn);

          await executor.query(
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
              gtli = ?,
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
              data.gtli || "",
              data.nth_salary || 0,
              data.remarks || "",

              req.params.id,

            ]
          );

          const updatedRows = await executor.query(
            `SELECT * FROM physical WHERE id = ? LIMIT 1`,
            [req.params.id]
          );
          const updatedRow = updatedRows[0];

          await insertAuditLog(executor, {
            ...actor,
            entityType: "employee",
            entityId: updatedRow.id,
            reportId: updatedRow.report_id,
            action: "EMPLOYEE_UPDATE",
            circle: updatedRow.circle,
            cmp: updatedRow.cmp,
            previousData: existing,
            newData: updatedRow,
          });

          await insertTimelineEvent(executor, {
            employeeId: updatedRow.id,
            action: "UPDATED",
            actorUserId: actor.actorUserId,
            actorName: actor.actorName,
            circle: updatedRow.circle,
            cmp: updatedRow.cmp,
            previousData: existing,
            newData: updatedRow,
          });

          await insertNotification(executor, {
            moduleName: "physical",
            eventType: "employee_updated",
            title: "Physical employee updated",
            message: `${updatedRow.employee_name || "Employee"} was updated.`,
            circle: updatedRow.circle,
            cmp: updatedRow.cmp,
            actorUserId: req.authUser.id || null,
            referenceId: updatedRow.id,
            referenceType: "physical_employee",
          });

          await conn.promise().commit();
          clearPhysicalCache();
        } catch (error) {
          await conn.promise().rollback();
          throw error;
        } finally {
          conn.release();
        }

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
