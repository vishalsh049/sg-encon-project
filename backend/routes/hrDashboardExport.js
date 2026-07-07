const express = require("express");
const router = express.Router();

const { db } = require("../config/db");
const { authMiddleware, addCircleFilter, isAllCircle } = require("../middleware/circleAccess");
const {
  physicalDesignationColumns,
  scrumDesignationColumns,
  categoryGroups,
  normalizeCmpName,
  buildFilteredGroups,
} = require("../utils/hrDashboardExportShared");
const { buildRagWorkbook } = require("../utils/hrDashboardWorkbook");

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
          WHERE LOWER(TRIM(COALESCE(l2_status, ''))) = 'joined'
            AND cmp IS NOT NULL
            AND cmp != ''
            AND designation IS NOT NULL
            AND designation != ''
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

// Any unmatched path under this router must fail as a clean JSON 404, not
// fall through to server.js's SPA catch-all (which serves index.html with a
// 200 status). Without this guard, a mistyped/undeployed export endpoint
// would silently download an HTML page named "*.xlsx" instead of erroring.
router.use((req, res) => {
  res.status(404).json({ success: false, message: "Export endpoint not found" });
});

module.exports = router;
