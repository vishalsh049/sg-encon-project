const express = require("express");
const router = express.Router();
const ExcelJS = require("exceljs");

const { db } = require("../config/db");
const {
  authMiddleware,
  canAccessCircle,
  isAllCircle,
} = require("../middleware/circleAccess");
const {
  buildScrumFilterClause,
  buildLatestScrumBatchSubquery,
  addLatestBatchParam,
  scrumJobRoleCategorySql,
} = require("../utils/scrumDashboardShared");
const { makeEnsureIndex } = require("../utils/dbIndex");

router.use(authMiddleware);

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });

// hrDashboardExport.js already warms up idx_scrum_state / maintenance_point /
// job_role / status / vendor / upload_batch_id / uploaded_at on this same
// table. Only add the columns this dashboard additionally filters/sorts/
// searches by (jc_sap_id search, profile_upload_date range, resource_type /
// resource_category KPI + filter-option distincts).
const ensureIndex = makeEnsureIndex(query);
let indexPromise = null;
function ensureScrumDashboardIndexes() {
  if (!indexPromise) {
    indexPromise = Promise.all([
      ensureIndex("scrum_manpower", "idx_scrum_jc_sap_id", "jc_sap_id"),
      ensureIndex("scrum_manpower", "idx_scrum_profile_upload_date", "profile_upload_date"),
      ensureIndex("scrum_manpower", "idx_scrum_resource_type", "resource_type"),
      ensureIndex("scrum_manpower", "idx_scrum_resource_category", "resource_category"),
    ]).catch((error) => {
      indexPromise = null;
      throw error;
    });
  }
  return indexPromise;
}
ensureScrumDashboardIndexes().catch((error) =>
  console.error("Scrum dashboard index warm-up failed (will retry on request):", error.message)
);

// ---------------------------------------------------------------------------
// Shared WHERE builders
// ---------------------------------------------------------------------------

// Dashboard-specific filters (vendor/jobRole/status/resourceType/resourceCategory/
// search/date range) layered on top of buildScrumFilterClause's base scope
// (circle lock + circle/cmp lists + the module-wide "our own vendor" lock).
function buildDashboardWhere(req) {
  const base = buildScrumFilterClause(req);
  let whereSql = base.whereClause;
  const params = [...base.params];

  const vendor = String(req.query.vendor || "").trim();
  if (vendor) {
    whereSql += " AND UPPER(TRIM(vendor)) = UPPER(TRIM(?))";
    params.push(vendor);
  }

  const jobRole = String(req.query.jobRole || "").trim();
  if (jobRole) {
    whereSql += " AND job_role = ?";
    params.push(jobRole);
  }

  // Job Role Summary groups by a fuzzy category bucket (scrumJobRoleCategorySql),
  // not the exact job_role text — e.g. every "Analyst%" row buckets under
  // "Analyst". Clicking a summary row must filter by that same bucket
  // expression, not an exact job_role match, or the drilldown would undercount.
  const jobRoleCategory = String(req.query.jobRoleCategory || "").trim();
  if (jobRoleCategory) {
    whereSql += ` AND ${scrumJobRoleCategorySql("job_role")} = ?`;
    params.push(jobRoleCategory);
  }

  const status = String(req.query.status || "").trim();
  if (status) {
    whereSql += " AND status = ?";
    params.push(status);
  }

  const resourceType = String(req.query.resourceType || "").trim();
  if (resourceType) {
    whereSql += " AND resource_type = ?";
    params.push(resourceType);
  }

  const resourceCategory = String(req.query.resourceCategory || "").trim();
  if (resourceCategory) {
    whereSql += " AND resource_category = ?";
    params.push(resourceCategory);
  }

  const search = String(req.query.search || "").trim();
  if (search) {
    whereSql +=
      " AND (resource_name LIKE ? OR jc_sap_id LIKE ? OR mobile LIKE ? OR email_id LIKE ?)";
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }

  const dateFrom = String(req.query.dateFrom || "").trim();
  if (dateFrom) {
    whereSql += " AND profile_upload_date >= ?";
    params.push(dateFrom);
  }

  const dateTo = String(req.query.dateTo || "").trim();
  if (dateTo) {
    whereSql += " AND profile_upload_date <= ?";
    params.push(dateTo);
  }

  return { whereSql, params };
}

// Metric buckets driving KPI-card click-through and the "pending"/"deactivated"
// columns on every summary table — defined once here so the KPI numbers, the
// summary table columns and the employee drilldown can never disagree.
const METRIC_CONDITIONS = {
  active: "UPPER(TRIM(status)) = 'ACTIVE'",
  deactivated:
    "(deactivated_date IS NOT NULL OR UPPER(TRIM(status)) LIKE '%DEACTIVAT%')",
  level1Approved: "level1_approved_date IS NOT NULL",
  level2Approved: "level2_approved_date IS NOT NULL",
  sasSuccess: "sas_success_date IS NOT NULL",
  cobCompleted: "cob_done_date IS NOT NULL",
  pendingApproval:
    "(UPPER(TRIM(status)) = 'ACTIVE' AND level1_approved_date IS NULL)",
};

const SUM_CASE = (label, sql) => `SUM(CASE WHEN ${sql} THEN 1 ELSE 0 END) AS ${label}`;

// Combines dashboard filters + latest-upload-batch scope (the same "always
// show the most recently uploaded batch" convention every existing scrum
// count endpoint already uses, so this auto-updates on every new upload).
function buildScopedWhere(req) {
  const { whereSql, params } = buildDashboardWhere(req);
  const batchId = String(req.query.batchId || "").trim();

  if (batchId) {
    return { whereSql: `${whereSql} AND upload_batch_id = ?`, params: [...params, batchId] };
  }

  const scopedWhere = `${whereSql} AND upload_batch_id = (${buildLatestScrumBatchSubquery(req)})`;
  const scopedParams = [...params];
  addLatestBatchParam(req, scopedParams);
  return { whereSql: scopedWhere, params: scopedParams };
}

function guardRequestedCircle(req, res) {
  const requestedCircle = String(req.query.circle || "").trim();
  if (requestedCircle && !canAccessCircle(req.authUser, requestedCircle)) {
    res.status(403).json({ success: false, message: "You cannot access this circle's data." });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// GET /filters — live, DB-driven dropdown options (never hardcoded)
// ---------------------------------------------------------------------------
router.get("/filters", async (req, res) => {
  try {
    const base = buildScrumFilterClause(req);
    const scopedWhere = `${base.whereClause} AND upload_batch_id = (${buildLatestScrumBatchSubquery(req)})`;
    const params = [...base.params];
    addLatestBatchParam(req, params);

    const distinctOf = (column) =>
      query(
        `SELECT DISTINCT ${column} AS value FROM scrum_manpower ${scopedWhere} AND ${column} IS NOT NULL AND ${column} <> '' ORDER BY ${column} ASC`,
        params
      );

    const [vendors, jobRoles, statuses, resourceTypes, resourceCategories] = await Promise.all([
      distinctOf("vendor"),
      distinctOf("job_role"),
      distinctOf("status"),
      distinctOf("resource_type"),
      distinctOf("resource_category"),
    ]);

    res.json({
      success: true,
      vendors: vendors.map((r) => r.value),
      jobRoles: jobRoles.map((r) => r.value),
      statuses: statuses.map((r) => r.value),
      resourceTypes: resourceTypes.map((r) => r.value),
      resourceCategories: resourceCategories.map((r) => r.value),
    });
  } catch (error) {
    console.error("Scrum dashboard filters error:", error);
    res.status(500).json({ success: false, message: "Failed to load filter options" });
  }
});

// ---------------------------------------------------------------------------
// GET /summary — the 14 KPI cards, one round trip
// ---------------------------------------------------------------------------
router.get("/summary", async (req, res) => {
  try {
    if (!guardRequestedCircle(req, res)) return;
    const { whereSql, params } = buildScopedWhere(req);

    const sql = `
      SELECT
        COUNT(*) AS total,
        ${SUM_CASE("active", METRIC_CONDITIONS.active)},
        ${SUM_CASE("deactivated", METRIC_CONDITIONS.deactivated)},
        ${SUM_CASE("level1Approved", METRIC_CONDITIONS.level1Approved)},
        ${SUM_CASE("level2Approved", METRIC_CONDITIONS.level2Approved)},
        ${SUM_CASE("sasSuccess", METRIC_CONDITIONS.sasSuccess)},
        ${SUM_CASE("cobCompleted", METRIC_CONDITIONS.cobCompleted)},
        ${SUM_CASE("pendingApproval", METRIC_CONDITIONS.pendingApproval)},
        COUNT(DISTINCT state) AS totalCircles,
        COUNT(DISTINCT maintenance_point) AS totalCmps,
        COUNT(DISTINCT vendor) AS totalVendors,
        COUNT(DISTINCT job_role) AS totalJobRoles,
        COUNT(DISTINCT resource_type) AS totalResourceTypes,
        COUNT(DISTINCT resource_category) AS totalResourceCategories
      FROM scrum_manpower
      ${whereSql}
    `;

    const rows = await query(sql, params);
    const row = rows[0] || {};
    Object.keys(row).forEach((key) => {
      row[key] = Number(row[key] || 0);
    });

    res.json({ success: true, data: row });
  } catch (error) {
    console.error("Scrum dashboard summary error:", error);
    res.status(500).json({ success: false, message: "Failed to load summary" });
  }
});

// ---------------------------------------------------------------------------
// Summary tables — small aggregate row sets (one row per circle/cmp/vendor/
// job-role/status), safe to fetch in one shot and sort/paginate client-side.
// ---------------------------------------------------------------------------

router.get("/circle-summary", async (req, res) => {
  try {
    if (!guardRequestedCircle(req, res)) return;
    const { whereSql, params } = buildScopedWhere(req);
    const sql = `
      SELECT
        state AS circle,
        COUNT(*) AS total,
        ${SUM_CASE("active", METRIC_CONDITIONS.active)},
        ${SUM_CASE("deactivated", METRIC_CONDITIONS.deactivated)},
        ${SUM_CASE("level1Approved", METRIC_CONDITIONS.level1Approved)},
        ${SUM_CASE("level2Approved", METRIC_CONDITIONS.level2Approved)},
        ${SUM_CASE("sasSuccess", METRIC_CONDITIONS.sasSuccess)},
        ${SUM_CASE("cobCompleted", METRIC_CONDITIONS.cobCompleted)},
        ${SUM_CASE("pending", METRIC_CONDITIONS.pendingApproval)}
      FROM scrum_manpower
      ${whereSql}
      GROUP BY state
      ORDER BY state ASC
    `;
    const rows = await query(sql, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Scrum dashboard circle-summary error:", error);
    res.status(500).json({ success: false, message: "Failed to load circle summary" });
  }
});

router.get("/cmp-summary", async (req, res) => {
  try {
    if (!guardRequestedCircle(req, res)) return;
    const { whereSql, params } = buildScopedWhere(req);
    const sql = `
      SELECT
        maintenance_point AS cmp,
        state AS circle,
        COUNT(*) AS total,
        ${SUM_CASE("active", METRIC_CONDITIONS.active)},
        ${SUM_CASE("deactivated", METRIC_CONDITIONS.deactivated)},
        ${SUM_CASE("pending", METRIC_CONDITIONS.pendingApproval)}
      FROM scrum_manpower
      ${whereSql}
        AND maintenance_point IS NOT NULL AND maintenance_point <> ''
      GROUP BY maintenance_point, state
      ORDER BY state ASC, maintenance_point ASC
    `;
    const rows = await query(sql, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Scrum dashboard cmp-summary error:", error);
    res.status(500).json({ success: false, message: "Failed to load CMP summary" });
  }
});

router.get("/vendor-summary", async (req, res) => {
  try {
    if (!guardRequestedCircle(req, res)) return;
    const { whereSql, params } = buildScopedWhere(req);
    const sql = `
      SELECT
        vendor,
        COUNT(*) AS total,
        ${SUM_CASE("active", METRIC_CONDITIONS.active)},
        ${SUM_CASE("deactivated", METRIC_CONDITIONS.deactivated)},
        ${SUM_CASE("pending", METRIC_CONDITIONS.pendingApproval)}
      FROM scrum_manpower
      ${whereSql}
        AND vendor IS NOT NULL AND vendor <> ''
      GROUP BY vendor
      ORDER BY vendor ASC
    `;
    const rows = await query(sql, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Scrum dashboard vendor-summary error:", error);
    res.status(500).json({ success: false, message: "Failed to load vendor summary" });
  }
});

router.get("/job-role-summary", async (req, res) => {
  try {
    if (!guardRequestedCircle(req, res)) return;
    const { whereSql, params } = buildScopedWhere(req);
    const sql = `
      SELECT
        ${scrumJobRoleCategorySql("job_role")} AS jobRole,
        COUNT(*) AS total,
        ${SUM_CASE("active", METRIC_CONDITIONS.active)},
        ${SUM_CASE("deactivated", METRIC_CONDITIONS.deactivated)},
        ${SUM_CASE("pending", METRIC_CONDITIONS.pendingApproval)}
      FROM scrum_manpower
      ${whereSql}
        AND job_role IS NOT NULL AND job_role <> ''
      GROUP BY jobRole
      ORDER BY total DESC
    `;
    const rows = await query(sql, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Scrum dashboard job-role-summary error:", error);
    res.status(500).json({ success: false, message: "Failed to load job role summary" });
  }
});

// Grouped by the real `status` column values as uploaded (not a fixed
// Active/Inactive/Pending/Deactivated shape) so this never shows a bucket
// that doesn't actually exist in the data.
router.get("/status-summary", async (req, res) => {
  try {
    if (!guardRequestedCircle(req, res)) return;
    const { whereSql, params } = buildScopedWhere(req);
    const sql = `
      SELECT
        status,
        COUNT(*) AS total
      FROM scrum_manpower
      ${whereSql}
        AND status IS NOT NULL AND status <> ''
      GROUP BY status
      ORDER BY total DESC
    `;
    const rows = await query(sql, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Scrum dashboard status-summary error:", error);
    res.status(500).json({ success: false, message: "Failed to load status summary" });
  }
});

// ---------------------------------------------------------------------------
// GET /recent-uploads — real upload batches only; no fabricated New/Updated/
// Duplicate counts (the upload pipeline does a plain bulk INSERT per batch,
// so that distinction doesn't exist anywhere in the data today).
// ---------------------------------------------------------------------------
router.get("/recent-uploads", async (req, res) => {
  try {
    const circleSql = isAllCircle(req.authUser)
      ? ""
      : "WHERE LOWER(TRIM(state)) = LOWER(TRIM(?))";
    const params = isAllCircle(req.authUser) ? [] : [req.authUser.circle];
    const sql = `
      SELECT
        upload_batch_id AS batchId,
        manual_date AS manualDate,
        MAX(uploaded_at) AS uploadedAt,
        MAX(uploaded_by) AS uploadedBy,
        MAX(file_name) AS fileName,
        GROUP_CONCAT(DISTINCT state ORDER BY state SEPARATOR ', ') AS circle,
        COUNT(*) AS totalRecords
      FROM scrum_manpower
      ${circleSql}
      GROUP BY upload_batch_id, manual_date
      ORDER BY uploadedAt DESC
      LIMIT 50
    `;
    const rows = await query(sql, params);
    res.json({
      success: true,
      data: rows.map((row) => ({ ...row, status: "Completed" })),
    });
  } catch (error) {
    console.error("Scrum dashboard recent-uploads error:", error);
    res.status(500).json({ success: false, message: "Failed to load recent uploads" });
  }
});

// ---------------------------------------------------------------------------
// GET /employees — the server-side paginated drilldown behind every KPI
// card / summary row click. This is the one endpoint that must scale to
// 100,000+ rows, so pagination/sorting/filtering all happen in SQL.
// ---------------------------------------------------------------------------

const EMPLOYEE_SORT_COLUMNS = {
  resourceName: "resource_name",
  sapId: "jc_sap_id",
  circle: "state",
  cmp: "maintenance_point",
  jobRole: "job_role",
  vendor: "vendor",
  status: "status",
  profileUploadDate: "profile_upload_date",
  level1Date: "level1_approved_date",
  level2Date: "level2_approved_date",
  sasDate: "sas_success_date",
  cobDate: "cob_done_date",
};

function buildEmployeeQuery(req, { isExport = false } = {}) {
  const { whereSql, params } = buildScopedWhere(req);

  const metric = String(req.query.metric || "").trim();
  const metricSql = METRIC_CONDITIONS[metric];
  const finalWhere = metricSql ? `${whereSql} AND ${metricSql}` : whereSql;

  const sortColumn = EMPLOYEE_SORT_COLUMNS[req.query.sortBy] || "resource_name";
  const sortOrder = String(req.query.sortOrder || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";

  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(
    isExport ? 50000 : 200,
    Math.max(1, Number(req.query.pageSize || 25))
  );

  return { finalWhere, params, sortColumn, sortOrder, page, pageSize };
}

function mapEmployeeRow(row) {
  return {
    resourceName: row.resource_name || "",
    sapId: row.jc_sap_id || "",
    circle: row.state || "",
    cmp: row.maintenance_point || "",
    jobRole: row.job_role || "",
    vendor: row.vendor || "",
    mobile: row.mobile || "",
    email: row.email_id || "",
    status: row.status || "",
    profileUploadDate: row.profile_upload_date || null,
    level1Date: row.level1_approved_date || null,
    level2Date: row.level2_approved_date || null,
    sasDate: row.sas_success_date || null,
    cobDate: row.cob_done_date || null,
  };
}

router.get("/employees", async (req, res) => {
  try {
    if (!guardRequestedCircle(req, res)) return;
    await ensureScrumDashboardIndexes();

    const { finalWhere, params, sortColumn, sortOrder, page, pageSize } = buildEmployeeQuery(req);

    const [countRows, rows] = await Promise.all([
      query(`SELECT COUNT(*) AS total FROM scrum_manpower ${finalWhere}`, params),
      query(
        `
        SELECT
          resource_name, jc_sap_id, state, maintenance_point, job_role, vendor,
          mobile, email_id, status,
          profile_upload_date, level1_approved_date, level2_approved_date,
          sas_success_date, cob_done_date
        FROM scrum_manpower
        ${finalWhere}
        ORDER BY ${sortColumn} ${sortOrder}
        LIMIT ? OFFSET ?
        `,
        [...params, pageSize, (page - 1) * pageSize]
      ),
    ]);

    const totalRecords = Number(countRows[0]?.total || 0);

    res.json({
      success: true,
      data: rows.map(mapEmployeeRow),
      pagination: {
        page,
        pageSize,
        totalRecords,
        totalPages: Math.max(1, Math.ceil(totalRecords / pageSize)),
      },
    });
  } catch (error) {
    console.error("Scrum dashboard employees error:", error);
    res.status(500).json({ success: false, message: "Failed to load employee details" });
  }
});

async function sendWorkbook(res, workbook, filenamePrefix) {
  const buffer = await workbook.xlsx.writeBuffer();
  if (!buffer || buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new Error("Generated workbook buffer is not a valid xlsx archive");
  }
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filenamePrefix}.xlsx"`);
  res.setHeader("Content-Length", buffer.length);
  res.end(buffer);
}

const EMPLOYEE_EXPORT_COLUMNS = [
  { key: "resourceName", label: "Resource Name" },
  { key: "sapId", label: "SAP ID" },
  { key: "circle", label: "Circle" },
  { key: "cmp", label: "CMP" },
  { key: "jobRole", label: "Job Role" },
  { key: "vendor", label: "Vendor" },
  { key: "mobile", label: "Mobile" },
  { key: "email", label: "Email" },
  { key: "status", label: "Status" },
  { key: "profileUploadDate", label: "Profile Upload Date" },
  { key: "level1Date", label: "Level 1 Date" },
  { key: "level2Date", label: "Level 2 Date" },
  { key: "sasDate", label: "SAS Date" },
  { key: "cobDate", label: "COB Date" },
];

router.get("/employees/export", async (req, res) => {
  try {
    if (!guardRequestedCircle(req, res)) return;
    await ensureScrumDashboardIndexes();

    const { finalWhere, params, sortColumn, sortOrder, pageSize } = buildEmployeeQuery(req, {
      isExport: true,
    });

    const rows = await query(
      `
      SELECT
        resource_name, jc_sap_id, state, maintenance_point, job_role, vendor,
        mobile, email_id, status,
        profile_upload_date, level1_approved_date, level2_approved_date,
        sas_success_date, cob_done_date
      FROM scrum_manpower
      ${finalWhere}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT ?
      `,
      [...params, pageSize]
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "SG ENCON LTD";
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet("Scrum Employees");

    const headerRow = worksheet.addRow(EMPLOYEE_EXPORT_COLUMNS.map((c) => c.label));
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    });

    rows.map(mapEmployeeRow).forEach((row) => {
      worksheet.addRow(EMPLOYEE_EXPORT_COLUMNS.map((c) => row[c.key] ?? ""));
    });

    worksheet.columns.forEach((col, index) => {
      const label = EMPLOYEE_EXPORT_COLUMNS[index]?.label || "";
      col.width = Math.max(14, label.length + 4);
    });

    await sendWorkbook(res, workbook, "Scrum_Employees_Export");
  } catch (error) {
    console.error("Scrum dashboard employees export error:", error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: "Failed to generate export" });
    } else {
      res.destroy(error);
    }
  }
});

router.use((req, res) => {
  res.status(404).json({ success: false, message: "Scrum dashboard endpoint not found" });
});

module.exports = router;
