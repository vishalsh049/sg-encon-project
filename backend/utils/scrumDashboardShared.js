/*
 * Shared scrum_manpower filter/scope helpers.
 *
 * Extracted verbatim (same SQL, same behavior) out of
 * backend/routes/manpowerRoutes.js so backend/routes/scrumDashboard.js can
 * reuse the exact same "which rows count as our data" logic instead of
 * duplicating it. manpowerRoutes.js now imports these too, so there is only
 * ever one copy of this business logic.
 */

const { isAllCircle } = require("../middleware/circleAccess");

const parseFilterList = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

// Every scrum dashboard/summary query is scoped to the company's own vendor
// rows only (this portal only ever tracks S G ENCON PVT LTD's workforce,
// even though other vendors' rows may technically exist in the same table),
// plus the requesting user's circle unless they hold "All Circle" access.
const buildScrumFilterClause = (req) => {
  const filters = [`UPPER(TRIM(vendor)) = 'S G ENCON PVT LTD'`];
  const params = [];

  const circles = parseFilterList(req.query.circle);
  const cmps = parseFilterList(req.query.cmp);
  const domains = parseFilterList(req.query.domain);

  if (!isAllCircle(req.authUser)) {
    filters.push(`LOWER(TRIM(state)) = LOWER(TRIM(?))`);
    params.push(req.authUser.circle);
  }

  if (circles.length) {
    filters.push(`state IN (${circles.map(() => "?").join(",")})`);
    params.push(...circles);
  }

  if (cmps.length) {
    filters.push(`maintenance_point IN (${cmps.map(() => "?").join(",")})`);
    params.push(...cmps);
  }

  if (domains.length) {
    filters.push(`
      CASE
        WHEN LOWER(function_name) LIKE '%fttx%' THEN 'FTTx'
        WHEN LOWER(function_name) LIKE '%fiber%' OR LOWER(function_name) LIKE '%fibre%' THEN 'Fiber'
        WHEN LOWER(function_name) LIKE '%utility%' THEN 'Utility'
        ELSE 'Others'
      END IN (${domains.map(() => "?").join(",")})
    `);
    params.push(...domains);
  }

  return {
    whereClause: `WHERE ${filters.join(" AND ")}`,
    params,
  };
};

// The dashboard always reflects only the most recently uploaded batch (per
// the requesting user's circle scope), so it auto-updates the moment a new
// Excel file lands — no separate "refresh" step needed anywhere upstream.
const buildLatestScrumBatchSubquery = (req) => `
  SELECT upload_batch_id
  FROM scrum_manpower
  ${isAllCircle(req.authUser) ? "" : "WHERE LOWER(TRIM(state)) = LOWER(TRIM(?))"}
  ORDER BY uploaded_at DESC
  LIMIT 1
`;

const addLatestBatchParam = (req, params) => {
  if (!isAllCircle(req.authUser)) params.push(req.authUser.circle);
};

// Human-readable job-role bucket used by GET /scrum/job-role-summary and
// reused by the new Scrum Dashboard's Job Role Summary table so both stay
// identical instead of drifting.
const scrumJobRoleCategorySql = (columnExpr = "job_role") => `
  CASE
    WHEN ${columnExpr} LIKE 'Analyst%' THEN 'Analyst'
    WHEN ${columnExpr} LIKE 'Assistant Splicer%' THEN 'Assistant Splicer'
    WHEN ${columnExpr} LIKE 'FTTx%' THEN 'FTTx'
    WHEN ${columnExpr} LIKE 'IBS%' THEN 'IBS'
    WHEN ${columnExpr} LIKE 'Large Facility%' THEN 'Large Facility'
    WHEN ${columnExpr} LIKE 'OMCR%' THEN 'OMCR'
    WHEN ${columnExpr} LIKE 'Patroller%' THEN 'Patroller'
    WHEN ${columnExpr} LIKE 'Splicer%' THEN 'Splicer'
    WHEN ${columnExpr} LIKE 'State%' THEN 'State'
    WHEN ${columnExpr} LIKE 'Utility%' THEN 'Utility'
    WHEN ${columnExpr} = 'CMP Lead' THEN 'CMP Lead'
    WHEN ${columnExpr} = 'Fibre Engineer' THEN 'Fibre Engineer'
    WHEN ${columnExpr} = 'Fibre Supervisor' THEN 'Fibre Supervisor'
    WHEN ${columnExpr} = 'ISP Engineer' THEN 'ISP Engineer'
    WHEN ${columnExpr} = 'MP Office staff' THEN 'MP Office staff'
    WHEN ${columnExpr} = 'Rigger' THEN 'Rigger'
    WHEN ${columnExpr} = 'SHQ Office Staff' THEN 'SHQ Office Staff'
    WHEN ${columnExpr} = 'Vendor SPOC' THEN 'Vendor SPOC'
    WHEN ${columnExpr} = 'Warehouse Incharge cum Security' THEN 'Warehouse Incharge cum Security'
    ELSE ${columnExpr}
  END
`;

module.exports = {
  parseFilterList,
  buildScrumFilterClause,
  buildLatestScrumBatchSubquery,
  addLatestBatchParam,
  scrumJobRoleCategorySql,
};
