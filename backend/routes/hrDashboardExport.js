const express = require("express");
const router = express.Router();
const ExcelJS = require("exceljs");

const { db } = require("../config/db");
const { authMiddleware, addCircleFilter, canAccessCircle, isAllCircle } = require("../middleware/circleAccess");
const {
  physicalDesignationColumns,
  scrumDesignationColumns,
  categoryGroups,
  normalizeCmpName,
  buildFilteredGroups,
} = require("../utils/hrDashboardExportShared");
const { buildRagWorkbook } = require("../utils/hrDashboardWorkbook");
const {
  normalizeRoleSql,
  physicalRoleKeyCaseSql,
  scrumRoleKeyCaseSql,
} = require("../utils/roleKeyMapping");
const { makeEnsureIndex } = require("../utils/dbIndex");

router.use(authMiddleware);

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });

function getCircleScope(req, column = "circle") {
  if (isAllCircle(req.authUser)) return { sql: "", params: [] };
  return {
    sql: ` AND LOWER(TRIM(${column})) = LOWER(TRIM(?))`,
    params: [req.authUser.circle],
  };
}

// Drilldown employee lookups filter new_joining/scrum_manpower by cmp,
// designation/job_role, status and circle — neither table has any index
// beyond its primary key today, so at scale (50,000+ rows) those filters
// would be full table scans. Safe/additive, see utils/dbIndex.js.
const ensureIndex = makeEnsureIndex(query);

let drilldownIndexPromise = null;

function ensureDrilldownIndexes() {
  if (!drilldownIndexPromise) {
    drilldownIndexPromise = Promise.all([
      ensureIndex("new_joining", "idx_new_joining_circle", "circle"),
      ensureIndex("new_joining", "idx_new_joining_cmp", "cmp"),
      ensureIndex("new_joining", "idx_new_joining_designation", "designation"),
      ensureIndex("new_joining", "idx_new_joining_joining_status", "joining_status"),
      ensureIndex("scrum_manpower", "idx_scrum_state", "state"),
      ensureIndex("scrum_manpower", "idx_scrum_maintenance_point", "maintenance_point"),
      ensureIndex("scrum_manpower", "idx_scrum_job_role", "job_role"),
      ensureIndex("scrum_manpower", "idx_scrum_status", "status"),
      ensureIndex("scrum_manpower", "idx_scrum_vendor", "vendor"),
      ensureIndex("scrum_manpower", "idx_scrum_upload_batch_id", "upload_batch_id"),
      ensureIndex("scrum_manpower", "idx_scrum_uploaded_at", "uploaded_at"),
    ]).catch((error) => {
      drilldownIndexPromise = null;
      throw error;
    });
  }
  return drilldownIndexPromise;
}

// Warm the index migration at boot; requests still await it defensively
// below in case boot-time creation hasn't finished yet.
ensureDrilldownIndexes().catch((error) =>
  console.error("Drilldown index warm-up failed (will retry on request):", error.message)
);

async function fetchSignoffRows(req) {
  const filters = [];
  const params = [];
  addCircleFilter(filters, params, req.authUser);
  return query(
    `
    SELECT *
    FROM signoff
    ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
    ORDER BY id ASC
    `,
    params
  );
}

// Verbatim copy of GET /api/physical/active-job-role-cmp-count
// (backend/routes/physicalRoutes.js) — kept local since that route's
// query is not exported for reuse.
async function fetchPhysicalActiveData(req) {
  const physicalScope = getCircleScope(req);
  const newJoiningScope = getCircleScope(req);

  return query(
    `
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
            WHEN normalized_role LIKE 'analyst%' THEN 'analyst'
            WHEN normalized_role = 'cmplead' THEN 'cmp_lead'
            WHEN normalized_role = 'technician' THEN 'technician'
            WHEN normalized_role = 'rigger' THEN 'rigger'
            WHEN normalized_role = 'utilitysupervisor' THEN 'utility_supervisor'
            WHEN normalized_role = 'utilityengineer' THEN 'utility_engineer'
            WHEN normalized_role = 'ispengineer' THEN 'isp_engineer'
            WHEN normalized_role IN ('whinchargecumsecurity', 'warehouseincharge', 'warehouseinchargecumsecurity')
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
            WHEN normalized_role LIKE 'analyst%' THEN 'analyst'
            WHEN normalized_role = 'cmplead' THEN 'cmp_lead'
            WHEN normalized_role = 'technician' THEN 'technician'
            WHEN normalized_role = 'rigger' THEN 'rigger'
            WHEN normalized_role = 'utilitysupervisor' THEN 'utility_supervisor'
            WHEN normalized_role = 'utilityengineer' THEN 'utility_engineer'
            WHEN normalized_role = 'ispengineer' THEN 'isp_engineer'
            WHEN normalized_role IN ('whinchargecumsecurity', 'warehouseincharge', 'warehouseinchargecumsecurity')
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
    `,
    [...physicalScope.params, ...newJoiningScope.params]
  );
}

// Verbatim copy of GET /api/manpower/scrum/cmp-role-count
// (backend/routes/manpowerRoutes.js) — kept local since that route's
// query is not exported for reuse.
async function fetchScrumActiveData(req) {
  const filters = [`UPPER(TRIM(vendor)) = 'S G ENCON PVT LTD'`];
  const params = [];

  if (!isAllCircle(req.authUser)) {
    filters.push(`LOWER(TRIM(state)) = LOWER(TRIM(?))`);
    params.push(req.authUser.circle);
  }

  const whereClause = `WHERE ${filters.join(" AND ")}`;

  const latestBatchSubquery = `
    SELECT upload_batch_id
    FROM scrum_manpower
    ${isAllCircle(req.authUser) ? "" : "WHERE LOWER(TRIM(state)) = LOWER(TRIM(?))"}
    ORDER BY uploaded_at DESC
    LIMIT 1
  `;

  const rows = await query(
    `
    SELECT
      cmp,
      role_key,
      COUNT(*) AS total
    FROM (
      SELECT
        maintenance_point AS cmp,
        CASE
          WHEN normalized_job_role IN ('stateleadershipteam', 'stateleadership') THEN 'state_leadership_team'
          WHEN normalized_job_role = 'nocexecutive' THEN 'noc_executive'
          WHEN normalized_job_role = 'analyst' THEN 'analyst'
          WHEN normalized_job_role = 'cmplead' THEN 'cmp_lead'
          WHEN normalized_job_role = 'technician' THEN 'technician'
          WHEN normalized_job_role = 'rigger' THEN 'rigger'
          WHEN normalized_job_role = 'utilitysupervisor' THEN 'utility_supervisor'
          WHEN normalized_job_role = 'utilityengineer' THEN 'utility_engineer'
          WHEN normalized_job_role = 'ispengineer' THEN 'isp_engineer'
          WHEN normalized_job_role IN ('warehouseinchargecumsecurity', 'whinchargecumsecurity') THEN 'wh_incharge_cum_security'
          WHEN normalized_job_role = 'splicer' THEN 'splicer'
          WHEN normalized_job_role = 'assistantsplicer' THEN 'assistant_splicer'
          WHEN normalized_job_role IN ('fiberhelper', 'fibrehelper') THEN 'fiber_helper'
          WHEN normalized_job_role = 'patroller' THEN 'patroller'
          WHEN normalized_job_role IN ('fibersupervisor', 'fibresupervisor') THEN 'fiber_supervisor'
          WHEN normalized_job_role IN ('fiberengineer', 'fibreengineer') THEN 'fibre_engineer'
          WHEN normalized_job_role = 'fttxsplicer' THEN 'fttx_splicer'
          WHEN normalized_job_role = 'fttxassistantsplicer' THEN 'fttx_assistant_splicer'
          WHEN normalized_job_role = 'fttxsupervisor' THEN 'fttx_supervisor'
          WHEN normalized_job_role = 'fttxhelper' THEN 'fttx_helper'
          WHEN normalized_job_role = 'fttxengineer' THEN 'fttx_engineer'
          WHEN normalized_job_role = 'fttxtechnician' THEN 'fttx_technician'
          WHEN normalized_job_role = 'technicianb' THEN 'technicianb'
          WHEN normalized_job_role = 'riggerb' THEN 'riggerb'
          ELSE NULL
        END AS role_key
      FROM (
        SELECT
          maintenance_point,
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
          ) AS normalized_job_role
        FROM scrum_manpower
        ${whereClause}
          AND upload_batch_id = (
            ${latestBatchSubquery}
          )
          AND UPPER(TRIM(COALESCE(status, ''))) = 'ACTIVE'
          AND maintenance_point IS NOT NULL
          AND maintenance_point != ''
          AND job_role IS NOT NULL
          AND job_role != ''
      ) AS normalized_roles
    ) AS role_counts
    WHERE cmp IS NOT NULL
      AND cmp != ''
      AND role_key IS NOT NULL
    GROUP BY cmp, role_key
    ORDER BY cmp ASC, role_key ASC
    `,
    [...params, ...(!isAllCircle(req.authUser) ? [req.authUser.circle] : [])]
  );

  return rows;
}

// Builds the complete workbook into an in-memory buffer *before* touching the
// response at all. This guarantees we never start streaming bytes to the
// client and then fail partway through (which would otherwise corrupt the
// file by mixing valid zip bytes with a later JSON/HTML error body).
async function sendWorkbook(res, workbook, filenamePrefix) {
  const buffer = await workbook.xlsx.writeBuffer();

  // A valid .xlsx is a zip archive; zip files always start with the "PK" magic
  // bytes. If that's not true, something went wrong building the workbook —
  // fail loudly with JSON instead of shipping a broken file to the browser.
  if (!buffer || buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new Error("Generated workbook buffer is not a valid xlsx archive");
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filenamePrefix}.xlsx"`
  );
  res.setHeader("Content-Length", buffer.length);
  res.end(buffer);
}

router.get("/export/physical", async (req, res) => {
  try {
    const search = String(req.query.search || "");
    const circle = String(req.query.circle || "");
    const cmp = String(req.query.cmp || "");

    const [signoffData, activeData] = await Promise.all([
      fetchSignoffRows(req),
      fetchPhysicalActiveData(req),
    ]);

    const signoffLookup = signoffData.reduce((lookup, rowData) => {
      lookup[normalizeCmpName(rowData?.cmp)] = rowData;
      return lookup;
    }, {});

    const countLookup = activeData.reduce((lookup, item) => {
      const cmpName = item?.cmp;
      const roleKey = item?.role_key;
      if (!cmpName || !roleKey) return lookup;

      if (!lookup[cmpName]) lookup[cmpName] = {};
      lookup[cmpName][roleKey] = {
        physical_count: Number(item?.physical_count || 0),
        new_joining_count: Number(item?.new_joining_count || 0),
        total: Number(item?.total || 0),
      };
      return lookup;
    }, {});

    const groups = buildFilteredGroups({ search, circle, cmp });

    const workbook = buildRagWorkbook({
      reportTitle: "Physical RAG Report - Requirement vs Available Manpower",
      filtersMeta: { search, circle, cmp },
      groups,
      columns: physicalDesignationColumns,
      categoryGroups,
      getSignoffRow: (cmpName) => signoffLookup[normalizeCmpName(cmpName)],
      countLookup,
      showJoining: true,
    });

    await sendWorkbook(res, workbook, "Physical_RAG_Export");
  } catch (error) {
    console.error("Physical RAG export error:", error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: "Failed to generate export" });
    } else {
      res.destroy(error);
    }
  }
});

router.get("/export/scrum", async (req, res) => {
  try {
    const search = String(req.query.search || "");
    const circle = String(req.query.circle || "");
    const cmp = String(req.query.cmp || "");

    const [signoffData, scrumActiveData] = await Promise.all([
      fetchSignoffRows(req),
      fetchScrumActiveData(req),
    ]);

    const signoffLookup = signoffData.reduce((lookup, rowData) => {
      lookup[normalizeCmpName(rowData?.cmp)] = rowData;
      return lookup;
    }, {});

    const countLookup = scrumActiveData.reduce((lookup, item) => {
      const cmpName = item?.cmp;
      const roleKey = item?.role_key;
      const total = Number(item?.total || 0);
      if (!cmpName || !roleKey) return lookup;

      if (!lookup[cmpName]) lookup[cmpName] = {};
      lookup[cmpName][roleKey] = total;
      return lookup;
    }, {});

    const groups = buildFilteredGroups({ search, circle, cmp });

    const workbook = buildRagWorkbook({
      reportTitle: "Scrum RAG Report - Requirement vs Available Manpower",
      filtersMeta: { search, circle, cmp },
      groups,
      columns: scrumDesignationColumns,
      categoryGroups,
      getSignoffRow: (cmpName) => signoffLookup[normalizeCmpName(cmpName)],
      countLookup,
      showJoining: false,
    });

    await sendWorkbook(res, workbook, "Scrum_RAG_Export");
  } catch (error) {
    console.error("Scrum RAG export error:", error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: "Failed to generate export" });
    } else {
      res.destroy(error);
    }
  }
});

// ---------------------------------------------------------------------------
// Employee-level drilldown for a single designation/CMP cell of a RAG grid.
// Additive feature — reuses the same "Available" definitions the RAG grids
// already render from (fetchPhysicalActiveData / fetchScrumActiveData use
// the identical UNION/latest-batch logic, just grouped+counted instead of
// row-level), so drilldown numbers can never drift from what's on screen.
// ---------------------------------------------------------------------------

const DRILLDOWN_ROLE_KEYS = new Set(physicalDesignationColumns.map((c) => c.key));
const DRILLDOWN_ROLE_LABELS = new Map(physicalDesignationColumns.map((c) => [c.key, c.label]));
const DRILLDOWN_SORTABLE_COLUMNS = new Set([
  "employee_name",
  "employee_code",
  "cmp",
  "circle",
  "employment_status",
  "joining_status",
  "uploaded_at",
  "last_updated_at",
]);

function getDrilldownDepartment(roleKey) {
  const group = categoryGroups.find((g) => g.roleKeys.includes(roleKey));
  return group ? group.label : "Other";
}

// Row-level version of fetchPhysicalActiveData()'s UNION (physical ∪ deduped
// new_joining), wrapped as a derived table so role_key can be filtered in an
// outer WHERE (MySQL can't reference a SELECT-list alias at the same level).
function buildPhysicalAvailableBaseSql(req) {
  const physicalScope = getCircleScope(req, "p.circle");
  const njScope = getCircleScope(req, "nj.circle");

  const sql = `
    (
      SELECT
        'physical' AS source,
        p.employee_code AS employee_code,
        p.employee_name AS employee_name,
        ${physicalRoleKeyCaseSql(normalizeRoleSql("p.job_role"))} AS role_key,
        p.circle AS circle,
        p.cmp AS cmp,
        p.cluster AS cluster,
        p.employment_status AS employment_status,
        'Joined' AS joining_status,
        p.mobile_number AS mobile_number,
        p.created_at AS uploaded_at,
        p.uploaded_at AS last_updated_at
      FROM physical p
      WHERE COALESCE(p.is_deleted, 0) = 0
        AND LOWER(TRIM(COALESCE(p.employment_status, ''))) = 'active'
        AND p.cmp IS NOT NULL AND p.cmp <> ''
        AND p.job_role IS NOT NULL AND p.job_role <> ''
        ${physicalScope.sql}
      UNION ALL
      SELECT
        'new_joining' AS source,
        nj.employee_code AS employee_code,
        nj.employee_name AS employee_name,
        ${physicalRoleKeyCaseSql(normalizeRoleSql("nj.designation"))} AS role_key,
        nj.circle AS circle,
        nj.cmp AS cmp,
        NULL AS cluster,
        nj.employee_status AS employment_status,
        nj.joining_status AS joining_status,
        NULL AS mobile_number,
        nj.created_at AS uploaded_at,
        nj.uploaded_at AS last_updated_at
      FROM new_joining nj
      WHERE LOWER(TRIM(COALESCE(nj.joining_status, ''))) = 'joined'
        AND nj.cmp IS NOT NULL AND nj.cmp <> ''
        AND nj.designation IS NOT NULL AND nj.designation <> ''
        AND NOT EXISTS (
          SELECT 1 FROM physical dedupe
          WHERE TRIM(COALESCE(nj.aadhaar_no, '')) <> ''
            AND TRIM(COALESCE(dedupe.aadhaar_no, '')) = TRIM(nj.aadhaar_no)
            AND COALESCE(dedupe.is_deleted, 0) = 0
            AND LOWER(TRIM(COALESCE(dedupe.employment_status, ''))) = 'active'
        )
        ${njScope.sql}
    )
  `;

  return { sql, params: [...physicalScope.params, ...njScope.params] };
}

// Row-level version of fetchScrumActiveData(): latest upload_batch_id is
// scoped by req.authUser (not the clicked circle) so the popup's numbers
// always match whichever batch the on-screen Scrum RAG grid is showing.
function buildScrumAvailableBaseSql(req) {
  const scope = getCircleScope(req, "sm.state");
  const latestBatchParams = [];
  const latestBatchSql = `
    SELECT upload_batch_id
    FROM scrum_manpower
    ${isAllCircle(req.authUser) ? "" : "WHERE LOWER(TRIM(state)) = LOWER(TRIM(?))"}
    ORDER BY uploaded_at DESC
    LIMIT 1
  `;
  if (!isAllCircle(req.authUser)) latestBatchParams.push(req.authUser.circle);

  const sql = `
    (
      SELECT
        'scrum' AS source,
        sm.jc_sap_id AS employee_code,
        sm.resource_name AS employee_name,
        ${scrumRoleKeyCaseSql(normalizeRoleSql("sm.job_role"))} AS role_key,
        sm.state AS circle,
        sm.maintenance_point AS cmp,
        NULL AS cluster,
        sm.status AS employment_status,
        'Joined' AS joining_status,
        sm.mobile AS mobile_number,
        sm.uploaded_at AS uploaded_at,
        sm.uploaded_at AS last_updated_at
      FROM scrum_manpower sm
      WHERE UPPER(TRIM(sm.vendor)) = 'S G ENCON PVT LTD'
        AND UPPER(TRIM(COALESCE(sm.status, ''))) = 'ACTIVE'
        AND sm.upload_batch_id = (${latestBatchSql})
        AND sm.maintenance_point IS NOT NULL AND sm.maintenance_point <> ''
        AND sm.job_role IS NOT NULL AND sm.job_role <> ''
        ${scope.sql}
    )
  `;

  return { sql, params: [...latestBatchParams, ...scope.params] };
}

// Builds the outer WHERE applied on top of the base "available" derived
// table. `scopeOnly` (used for the summary cards) omits search/employeeCode/
// employmentStatus/joiningStatus so the cards never drift from the RAG grid
// while the user types into the popup's own filters.
function buildDrilldownWhereParts({
  roleKey,
  explicitCircle,
  cmp,
  search,
  employeeCode,
  employmentStatus,
  joiningStatus,
}) {
  const conditions = ["available.role_key = ?"];
  const params = [roleKey];

  if (explicitCircle) {
    conditions.push("LOWER(TRIM(available.circle)) = LOWER(TRIM(?))");
    params.push(explicitCircle);
  }
  if (cmp) {
    conditions.push("LOWER(TRIM(available.cmp)) = LOWER(TRIM(?))");
    params.push(cmp);
  }
  if (search) {
    conditions.push("LOWER(available.employee_name) LIKE LOWER(?)");
    params.push(`%${search}%`);
  }
  if (employeeCode) {
    conditions.push("LOWER(available.employee_code) LIKE LOWER(?)");
    params.push(`%${employeeCode}%`);
  }
  if (employmentStatus) {
    conditions.push("LOWER(TRIM(available.employment_status)) = LOWER(TRIM(?))");
    params.push(employmentStatus);
  }
  if (joiningStatus) {
    conditions.push("LOWER(TRIM(available.joining_status)) = LOWER(TRIM(?))");
    params.push(joiningStatus);
  }

  return { whereSql: `WHERE ${conditions.join(" AND ")}`, params };
}

// `signoff` only stores a scalar requirement target per (circle, cmp) — no
// row-level data — so this is a plain aggregate, not part of the "available"
// derived table above.
async function fetchDrilldownRequired({ roleKey, explicitCircle, cmp, authUser }) {
  if (cmp && explicitCircle) {
    const rows = await query(
      `SELECT COALESCE(${roleKey}, 0) AS required FROM signoff WHERE LOWER(TRIM(circle)) = LOWER(TRIM(?)) AND LOWER(TRIM(cmp)) = LOWER(TRIM(?))`,
      [explicitCircle, cmp]
    );
    return Number(rows[0]?.required || 0);
  }

  const conditions = [];
  const params = [];
  if (explicitCircle) {
    conditions.push("LOWER(TRIM(circle)) = LOWER(TRIM(?))");
    params.push(explicitCircle);
  } else if (!isAllCircle(authUser)) {
    conditions.push("LOWER(TRIM(circle)) = LOWER(TRIM(?))");
    params.push(authUser.circle);
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await query(`SELECT COALESCE(SUM(${roleKey}), 0) AS required FROM signoff ${whereSql}`, params);
  return Number(rows[0]?.required || 0);
}

// Shared by GET /drilldown (JSON) and GET /drilldown/export (xlsx) so the two
// endpoints can never disagree on filtering/scoping logic.
async function runDrilldownQuery(req, { isExport = false } = {}) {
  await ensureDrilldownIndexes();

  const panel = String(req.query.panel || "").trim();
  if (!["physical", "scrum"].includes(panel)) {
    const error = new Error("Invalid panel. Expected 'physical' or 'scrum'.");
    error.statusCode = 400;
    throw error;
  }

  const roleKey = String(req.query.roleKey || "").trim();
  if (!DRILLDOWN_ROLE_KEYS.has(roleKey)) {
    const error = new Error("Invalid or unknown roleKey.");
    error.statusCode = 400;
    throw error;
  }

  const requestedCircle = String(req.query.circle || "").trim();
  if (requestedCircle && !canAccessCircle(req.authUser, requestedCircle)) {
    const error = new Error("You cannot access this circle's data.");
    error.statusCode = 403;
    throw error;
  }

  const cmp = String(req.query.cmp || "").trim();
  const search = String(req.query.search || "").trim();
  const employeeCode = String(req.query.employeeCode || "").trim();
  const employmentStatus = String(req.query.employmentStatus || "").trim();
  const joiningStatus = String(req.query.joiningStatus || "").trim();

  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(isExport ? 10000 : 100, Math.max(1, Number(req.query.pageSize || 25)));

  const sortBy = DRILLDOWN_SORTABLE_COLUMNS.has(String(req.query.sortBy || ""))
    ? req.query.sortBy
    : "employee_name";
  const sortOrder = String(req.query.sortOrder || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";

  const base = panel === "physical" ? buildPhysicalAvailableBaseSql(req) : buildScrumAvailableBaseSql(req);

  const scopeFilter = buildDrilldownWhereParts({ roleKey, explicitCircle: requestedCircle, cmp });
  const fullFilter = buildDrilldownWhereParts({
    roleKey,
    explicitCircle: requestedCircle,
    cmp,
    search,
    employeeCode,
    employmentStatus,
    joiningStatus,
  });

  const [required, summaryRows, countRows, rows] = await Promise.all([
    fetchDrilldownRequired({ roleKey, explicitCircle: requestedCircle, cmp, authUser: req.authUser }),
    query(
      `
      SELECT
        COUNT(*) AS total_available,
        SUM(CASE WHEN LOWER(TRIM(employment_status)) = 'active' THEN 1 ELSE 0 END) AS active_employees,
        SUM(CASE WHEN LOWER(TRIM(employment_status)) <> 'active' THEN 1 ELSE 0 END) AS inactive_employees,
        SUM(CASE WHEN LOWER(TRIM(joining_status)) = 'joined' THEN 1 ELSE 0 END) AS joined_employees,
        SUM(CASE WHEN LOWER(TRIM(joining_status)) <> 'joined' THEN 1 ELSE 0 END) AS not_joined_employees
      FROM ${base.sql} AS available
      ${scopeFilter.whereSql}
      `,
      [...base.params, ...scopeFilter.params]
    ),
    query(
      `SELECT COUNT(*) AS total FROM ${base.sql} AS available ${fullFilter.whereSql}`,
      [...base.params, ...fullFilter.params]
    ),
    query(
      `
      SELECT source, employee_code, employee_name, circle, cmp, cluster,
             employment_status, joining_status, mobile_number, uploaded_at, last_updated_at
      FROM ${base.sql} AS available
      ${fullFilter.whereSql}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
      `,
      [...base.params, ...fullFilter.params, pageSize, (page - 1) * pageSize]
    ),
  ]);

  const summaryRow = summaryRows[0] || {};
  const totalAvailable = Number(summaryRow.total_available || 0);
  const gap = required - totalAvailable;
  const designationLabel = DRILLDOWN_ROLE_LABELS.get(roleKey) || roleKey;
  const department = getDrilldownDepartment(roleKey);

  const data = rows.map((row) => ({
    employeeCode: row.employee_code || "",
    employeeName: row.employee_name || "",
    designation: designationLabel,
    circle: row.circle || "",
    cmp: row.cmp || "",
    cmpCluster: row.cluster || "",
    department,
    employmentStatus: row.employment_status || "",
    joiningStatus: row.joining_status || "",
    mobileNumber: row.mobile_number || "",
    uploadedAt: row.uploaded_at || null,
    lastUpdatedAt: row.last_updated_at || null,
    source: row.source,
  }));

  const totalRecords = Number(countRows[0]?.total || 0);

  return {
    header: {
      designation: designationLabel,
      department,
      circle: requestedCircle || null,
      cmp: cmp || null,
      required,
      available: totalAvailable,
      gap,
    },
    summary: {
      totalRequired: required,
      totalAvailable,
      totalGap: gap,
      activeEmployees: Number(summaryRow.active_employees || 0),
      inactiveEmployees: Number(summaryRow.inactive_employees || 0),
      joinedEmployees: Number(summaryRow.joined_employees || 0),
      notJoinedEmployees: Number(summaryRow.not_joined_employees || 0),
    },
    data,
    pagination: {
      page,
      pageSize,
      totalRecords,
      totalPages: Math.max(1, Math.ceil(totalRecords / pageSize)),
    },
  };
}

router.get("/drilldown", async (req, res) => {
  try {
    const payload = await runDrilldownQuery(req, { isExport: String(req.query.export || "") === "true" });
    res.status(200).json({ success: true, ...payload });
  } catch (error) {
    console.error("HR dashboard drilldown error:", error);
    res.status(error?.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to load drilldown data",
    });
  }
});

const DRILLDOWN_EXPORT_COLUMNS = [
  { key: "employeeCode", label: "Employee Code" },
  { key: "employeeName", label: "Employee Name" },
  { key: "designation", label: "Designation" },
  { key: "circle", label: "Circle" },
  { key: "cmp", label: "CMP / Cluster" },
  { key: "department", label: "Department" },
  { key: "employmentStatus", label: "Employment Status" },
  { key: "joiningStatus", label: "Joining Status" },
  { key: "mobileNumber", label: "Mobile Number" },
  { key: "uploadedAt", label: "Uploaded At" },
  { key: "lastUpdatedAt", label: "Last Updated" },
];

function buildDrilldownWorkbook({ header, summary, data }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SG ENCON LTD";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Drilldown".slice(0, 31));

  worksheet.addRow([`${header.designation} — ${header.department}`]);
  worksheet.addRow([
    `Circle: ${header.circle || "All"}`,
    `CMP: ${header.cmp || "All"}`,
    `Required: ${header.required}`,
    `Available: ${header.available}`,
    `Gap: ${header.gap}`,
  ]);
  worksheet.addRow([
    `Active: ${summary.activeEmployees}`,
    `Inactive: ${summary.inactiveEmployees}`,
    `Joined: ${summary.joinedEmployees}`,
    `Not Joined: ${summary.notJoinedEmployees}`,
  ]);
  worksheet.addRow([]);

  const headerRow = worksheet.addRow(DRILLDOWN_EXPORT_COLUMNS.map((c) => c.label));
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
  });

  data.forEach((row) => {
    worksheet.addRow(DRILLDOWN_EXPORT_COLUMNS.map((c) => row[c.key] ?? ""));
  });

  worksheet.columns.forEach((col, index) => {
    const label = DRILLDOWN_EXPORT_COLUMNS[index]?.label || "";
    col.width = Math.max(14, label.length + 4);
  });

  return workbook;
}

router.get("/drilldown/export", async (req, res) => {
  try {
    const payload = await runDrilldownQuery(req, { isExport: true });
    const workbook = buildDrilldownWorkbook(payload);
    await sendWorkbook(res, workbook, "Employee_Drilldown_Export");
  } catch (error) {
    console.error("HR dashboard drilldown export error:", error);
    if (!res.headersSent) {
      res.status(error?.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to generate export",
      });
    } else {
      res.destroy(error);
    }
  }
});

// Any unmatched path under this router must fail as a clean JSON 404, not
// fall through to server.js's SPA catch-all (which serves index.html with a
// 200 status). Without this guard, a mistyped/undeployed export endpoint
// would silently download an HTML page named "*.xlsx" instead of erroring.
router.use((req, res) => {
  res.status(404).json({ success: false, message: "Export endpoint not found" });
});

module.exports = router;
