// HR Analytics V2 — read-only aggregation endpoints for the new Workforce
// Analytics testing page (frontend/src/pages/HrAnalyticsV2.jsx).
//
// This file is intentionally additive and self-contained: it does not import
// from, or get imported by, any existing HR/Physical/New Joining/Signoff
// route file, and it never writes to the database. It re-derives the same
// "Available" calculation physicalRoutes.js already uses for the live HR
// Dashboard (GET /api/physical/active-job-role-cmp-count) — active `physical`
// rows plus `new_joining` rows already marked "joined" that aren't yet
// duplicated into `physical` (matched by aadhaar) — so the numbers on this
// page reconcile with the existing dashboard for the same circle/CMP.
//
// Requirement always comes from `signoff` (22 sanctioned-headcount columns
// per CMP), the same source the existing RAG panels use.

const express = require("express");
const router = express.Router();

const { db } = require("../config/db");
const {
  addCircleFilter, // eslint-disable-line no-unused-vars -- kept for parity/reference with sibling route files
  authMiddleware,
  canAccessCircle,
  isAllCircle,
} = require("../middleware/circleAccess");
const { getCachedValue, setCachedValue } = require("../services/physicalDomainService");
const { resolveRoleKey } = require("../services/manpowerConfigService");

router.use(authMiddleware);

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });

// The 22 sanctioned-headcount columns on `signoff`, in the same order the
// existing HR Dashboard renders them (see physicalDesignationColumns in
// frontend/src/pages/HrDashboard.jsx). `technicianb`/`riggerb` are real job
// roles seen in `physical`/`new_joining` uploads that have no matching
// signoff column — they're kept as valid "Available" buckets so headcount
// isn't silently dropped, but they never carry a Requirement (always "Extra").
const SIGNOFF_ROLE_KEYS = [
  "state_leadership_team",
  "noc_executive",
  "analyst",
  "cmp_lead",
  "technician",
  "rigger",
  "utility_supervisor",
  "utility_engineer",
  "isp_engineer",
  "wh_incharge_cum_security",
  "splicer",
  "assistant_splicer",
  "fiber_helper",
  "patroller",
  "fiber_supervisor",
  "fibre_engineer",
  "fttx_splicer",
  "fttx_assistant_splicer",
  "fttx_supervisor",
  "fttx_helper",
  "fttx_engineer",
  "fttx_technician",
];

const ROLE_KEY_LABELS = {
  state_leadership_team: "State Leadership Team",
  noc_executive: "NOC Executive",
  analyst: "Analyst",
  cmp_lead: "CMP Lead",
  technician: "Technician",
  rigger: "Rigger",
  utility_supervisor: "Utility Supervisor",
  utility_engineer: "Utility Engineer",
  isp_engineer: "ISP Engineer",
  wh_incharge_cum_security: "WH Incharge cum Security",
  splicer: "Splicer",
  assistant_splicer: "Assistant Splicer",
  fiber_helper: "Fiber Helper",
  patroller: "Patroller",
  fiber_supervisor: "Fiber Supervisor",
  fibre_engineer: "Fibre Engineer",
  fttx_splicer: "FTTx Splicer",
  fttx_assistant_splicer: "FTTx Assistant Splicer",
  fttx_supervisor: "FTTx Supervisor",
  fttx_helper: "FTTx Helper",
  fttx_engineer: "FTTx Engineer",
  fttx_technician: "FTTx Technician",
  technicianb: "Technician B",
  riggerb: "Rigger B",
};

const ALL_ROLE_KEYS = [...SIGNOFF_ROLE_KEYS, "technicianb", "riggerb"];

// Canonical "has this employee resigned" predicate — true if either the
// employment_status field says so or a resigned_date has been recorded, so a
// gap in one field doesn't hide a departure the other field already shows.
// Mirrors the same predicate in physicalRoutes.js's /dashboard/analytics so
// both pages agree on the same headcount.
const RESIGNED_PREDICATE_SQL =
  "(LOWER(TRIM(COALESCE(p.employment_status, ''))) = 'resigned' OR p.resigned_date IS NOT NULL)";

// Free-text job_role/designation -> canonical role_key classification comes
// from resolveRoleKey() (live, admin-editable manpower_sub_profiles config —
// see backend/services/manpowerConfigService.js), resolved row-by-row in JS
// after fetching raw designation text, the same way physicalRoutes.js's
// "/active-job-role-cmp-count" already does. This file used to carry its own
// hardcoded copy of that mapping (including a stray `LIKE 'analyst%'`
// wildcard no other role had) so it would have "no runtime coupling" to the
// rest of the app — that duplication was the actual bug: it silently drifted
// out of sync with Manpower Settings and could never respect an admin's
// exact-designation mapping. Importing resolveRoleKey() keeps this page's
// numbers permanently consistent with the main HR Dashboard's.

// Per-side (physical / new_joining) circle+cmp scope: user's own circle
// (unless they're an All-Circle user), plus the optional ?circle=&cmp=
// query filters. Mirrors getCircleScope()/buildAnalyticsFilters() in
// physicalRoutes.js, generalised to a table alias so it can be reused for
// both `p` (physical) and `nj` (new_joining) in the same query.
function buildSideScope(req, alias) {
  const conditions = [];
  const params = [];

  if (!isAllCircle(req.authUser)) {
    conditions.push(`LOWER(TRIM(${alias}.circle)) = LOWER(TRIM(?))`);
    params.push(req.authUser.circle);
  }

  const requestedCircle = String(req.query.circle || "").trim();
  if (requestedCircle) {
    if (!canAccessCircle(req.authUser, requestedCircle)) {
      const error = new Error("You cannot access this circle's analytics.");
      error.statusCode = 403;
      throw error;
    }
    conditions.push(`LOWER(TRIM(${alias}.circle)) = LOWER(TRIM(?))`);
    params.push(requestedCircle);
  }

  const requestedCmp = String(req.query.cmp || "").trim();
  if (requestedCmp) {
    conditions.push(`LOWER(TRIM(${alias}.cmp)) = LOWER(TRIM(?))`);
    params.push(requestedCmp);
  }

  return {
    sql: conditions.length ? ` AND ${conditions.join(" AND ")}` : "",
    params,
  };
}

function cacheScopeKey(req) {
  return {
    circle: isAllCircle(req.authUser) ? "ALL" : String(req.authUser.circle || "").trim().toLowerCase(),
    query: req.query,
  };
}

// -------------------------------------------------------------------------
// Requirement (signoff) — grouped by circle / cmp, summed per role_key.
// -------------------------------------------------------------------------
async function fetchRequirementRows(req) {
  const conditions = [];
  const params = [];

  if (!isAllCircle(req.authUser)) {
    conditions.push("LOWER(TRIM(circle)) = LOWER(TRIM(?))");
    params.push(req.authUser.circle);
  }
  const requestedCircle = String(req.query.circle || "").trim();
  if (requestedCircle) {
    conditions.push("LOWER(TRIM(circle)) = LOWER(TRIM(?))");
    params.push(requestedCircle);
  }
  const requestedCmp = String(req.query.cmp || "").trim();
  if (requestedCmp) {
    conditions.push("LOWER(TRIM(cmp)) = LOWER(TRIM(?))");
    params.push(requestedCmp);
  }

  const rows = await query(
    `
    SELECT circle, cmp, ${SIGNOFF_ROLE_KEYS.join(", ")}
    FROM signoff
    ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
    `,
    params
  );
  return rows;
}

// Flattens signoff rows (one row per CMP, one column per role) into
// { circle, cmp, role_key, requirement } tuples — the shape every other
// aggregate in this file uses.
function flattenRequirement(rows) {
  const flattened = [];
  rows.forEach((row) => {
    SIGNOFF_ROLE_KEYS.forEach((roleKey) => {
      const requirement = Number(row[roleKey] || 0);
      if (requirement > 0) {
        flattened.push({ circle: row.circle, cmp: row.cmp, role_key: roleKey, requirement });
      }
    });
  });
  return flattened;
}

// -------------------------------------------------------------------------
// Available headcount (active physical + joined-and-not-yet-migrated new
// joining, deduped by aadhaar) — grouped by circle / cmp / role_key.
// Same source rows also carry joined_on / nth_salary so this one derived
// table backs the Available, Payroll and Joining-trend endpoints alike.
// -------------------------------------------------------------------------
function buildAvailableSourceSql(req) {
  const physicalScope = buildSideScope(req, "p");
  const njScope = buildSideScope(req, "nj");

  const sql = `
    SELECT
      'physical' AS source,
      p.circle AS circle,
      p.cmp AS cmp,
      p.job_role AS raw_designation,
      p.date_of_joining AS joined_on,
      COALESCE(p.nth_salary, 0) AS nth_salary,
      p.aadhaar_no AS aadhaar_no
    FROM physical p
    WHERE COALESCE(p.is_deleted, 0) = 0
      AND LOWER(TRIM(COALESCE(p.employment_status, ''))) = 'active'
      AND p.job_role IS NOT NULL AND p.job_role != ''
      ${physicalScope.sql}

    UNION ALL

    SELECT
      'new_joining' AS source,
      nj.circle AS circle,
      nj.cmp AS cmp,
      nj.designation AS raw_designation,
      nj.uploaded_at AS joined_on,
      COALESCE(nj.nth_salary, 0) AS nth_salary,
      nj.aadhaar_no AS aadhaar_no
    FROM new_joining nj
    WHERE LOWER(TRIM(COALESCE(nj.joining_status, ''))) = 'joined'
      AND nj.designation IS NOT NULL AND nj.designation != ''
      AND NOT EXISTS (
        SELECT 1 FROM physical dedupe
        WHERE TRIM(COALESCE(nj.aadhaar_no, '')) != ''
          AND TRIM(COALESCE(dedupe.aadhaar_no, '')) = TRIM(nj.aadhaar_no)
          AND COALESCE(dedupe.is_deleted, 0) = 0
          AND LOWER(TRIM(COALESCE(dedupe.employment_status, ''))) = 'active'
      )
      ${njScope.sql}
  `;

  return { sql, params: [...physicalScope.params, ...njScope.params] };
}

// Resolves each raw row's role_key in JS via resolveRoleKey() (see file
// header) and re-aggregates, since multiple raw designation strings can
// share one role_key (e.g. "Analyst - Material" and "Analyst - Planning"
// both roll up into "analyst"). `rows` must already be grouped by whatever
// dimensions the caller wants preserved (e.g. circle/cmp) plus
// raw_designation, with the fields to sum passed as `sumFields`.
async function resolveAndRegroup(rows, dimensionKeys, sumFields) {
  const grouped = new Map();
  for (const row of rows) {
    const resolved = await resolveRoleKey(row.raw_designation, "physical");
    if (!resolved) continue;

    const key = [...dimensionKeys.map((k) => row[k]), resolved.roleKey].join("::");
    const existing = grouped.get(key);
    if (existing) {
      sumFields.forEach((f) => {
        existing[f] += Number(row[f] || 0);
      });
    } else {
      const entry = { role_key: resolved.roleKey };
      dimensionKeys.forEach((k) => {
        entry[k] = row[k];
      });
      sumFields.forEach((f) => {
        entry[f] = Number(row[f] || 0);
      });
      grouped.set(key, entry);
    }
  }
  return Array.from(grouped.values());
}

async function fetchAvailableRows(req) {
  const source = buildAvailableSourceSql(req);
  const requestedDesignation = String(req.query.designation || "").trim();

  const rawRows = await query(
    `
    SELECT
      av.circle AS circle,
      av.cmp AS cmp,
      av.raw_designation AS raw_designation,
      COUNT(*) AS available,
      SUM(av.nth_salary) AS salary_sum,
      SUM(CASE WHEN av.nth_salary > 0 THEN 1 ELSE 0 END) AS salaried_count
    FROM (${source.sql}) av
    GROUP BY av.circle, av.cmp, av.raw_designation
    `,
    source.params
  );

  const resolved = await resolveAndRegroup(rawRows, ["circle", "cmp"], [
    "available",
    "salary_sum",
    "salaried_count",
  ]);

  return requestedDesignation ? resolved.filter((row) => row.role_key === requestedDesignation) : resolved;
}

// Merges requirement + available tuples (both keyed by circle/cmp/role_key)
// into one row per combination, computing gap/extra.
function mergeRequirementAvailable(requirementRows, availableRows) {
  const map = new Map();
  const keyOf = (circle, cmp, roleKey) => `${circle}||${cmp}||${roleKey}`;

  requirementRows.forEach((row) => {
    map.set(keyOf(row.circle, row.cmp, row.role_key), {
      circle: row.circle,
      cmp: row.cmp,
      roleKey: row.role_key,
      roleLabel: ROLE_KEY_LABELS[row.role_key] || row.role_key,
      requirement: row.requirement,
      available: 0,
      salary: 0,
      salariedCount: 0,
    });
  });

  availableRows.forEach((row) => {
    const key = keyOf(row.circle, row.cmp, row.role_key);
    const existing = map.get(key);
    if (existing) {
      existing.available = Number(row.available || 0);
      existing.salary = Number(row.salary_sum || 0);
      existing.salariedCount = Number(row.salaried_count || 0);
    } else {
      map.set(key, {
        circle: row.circle,
        cmp: row.cmp,
        roleKey: row.role_key,
        roleLabel: ROLE_KEY_LABELS[row.role_key] || row.role_key,
        requirement: 0,
        available: Number(row.available || 0),
        salary: Number(row.salary_sum || 0),
        salariedCount: Number(row.salaried_count || 0),
      });
    }
  });

  // Gap is signed at every level (row and every aggregate rollup): can go
  // negative when Available > Requirement, e.g. R:10 A:12 -> G:-2 — matches
  // the existing HR Dashboard RAG table convention, applied consistently
  // from a single designation cell up to circle/CMP/Executive Summary
  // totals. `extra` stays the separate non-negative "how much surplus"
  // figure (== max(-gap, 0)), used where a strictly-positive "how many
  // extra people" count is wanted instead of a net figure.
  return Array.from(map.values()).map((row) => ({
    ...row,
    gap: row.requirement - row.available,
    extra: Math.max(row.available - row.requirement, 0),
  }));
}

async function fetchMergedRows(req) {
  const [requirementRows, availableRows] = await Promise.all([
    fetchRequirementRows(req).then(flattenRequirement),
    fetchAvailableRows(req),
  ]);
  return mergeRequirementAvailable(requirementRows, availableRows);
}

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

function previousMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

// -------------------------------------------------------------------------
// GET /overview — Executive Summary + Workforce Overview funnel, with a
// trailing 6-month reconstructed snapshot series for KPI sparklines.
// Requirement has no historical versioning in `signoff`, so the trend
// series holds Requirement constant at its current value and only
// reconstructs Active/Resigned/Available/Payroll month by month — the
// sparklines for Requirement-derived cards (Gap/Vacancy/Utilization)
// therefore reflect the change in Available only. Documented rather than
// silently approximated.
// -------------------------------------------------------------------------
router.get("/overview", async (req, res) => {
  try {
    const cacheKey = cacheScopeKey(req);
    const cached = getCachedValue("hrAnalyticsV2Overview", cacheKey);
    if (cached) return res.status(200).json(cached);

    const physicalScope = buildSideScope(req, "p");
    const njScope = buildSideScope(req, "nj");
    const thisMonth = currentMonthRange();
    const prevMonth = previousMonthRange();

    const employeeCountsPromise = query(
      `
      SELECT
        COUNT(*) AS total_employees,
        SUM(CASE WHEN LOWER(TRIM(COALESCE(p.employment_status, ''))) = 'active' THEN 1 ELSE 0 END) AS active_employees,
        SUM(CASE WHEN LOWER(TRIM(COALESCE(p.employment_status, ''))) = 'inactive' THEN 1 ELSE 0 END) AS inactive_employees,
        SUM(CASE WHEN ${RESIGNED_PREDICATE_SQL} THEN 1 ELSE 0 END) AS resigned_employees,
        SUM(CASE WHEN p.date_of_joining BETWEEN ? AND ? THEN 1 ELSE 0 END) AS new_joining_this_month,
        SUM(CASE WHEN p.resigned_date BETWEEN ? AND ? THEN 1 ELSE 0 END) AS resigned_this_month
      FROM physical p
      WHERE COALESCE(p.is_deleted, 0) = 0
        ${physicalScope.sql}
      `,
      [thisMonth.start, thisMonth.end, thisMonth.start, thisMonth.end, ...physicalScope.params]
    );

    const pipelinePromise = query(
      `
      SELECT
        COUNT(*) AS total_pipeline,
        SUM(CASE WHEN LOWER(TRIM(COALESCE(nj.joining_status, ''))) != 'joined' THEN 1 ELSE 0 END) AS pending_joining,
        SUM(CASE WHEN LOWER(TRIM(COALESCE(nj.l2_status, ''))) = 'pending' THEN 1 ELSE 0 END) AS pending_approval,
        SUM(CASE WHEN nj.uploaded_at BETWEEN ? AND ? AND LOWER(TRIM(COALESCE(nj.joining_status, ''))) = 'joined' THEN 1 ELSE 0 END) AS joined_this_month_pipeline
      FROM new_joining nj
      WHERE 1 = 1 ${njScope.sql}
      `,
      [`${thisMonth.start} 00:00:00`, `${thisMonth.end} 23:59:59`, ...njScope.params]
    );

    const mergedPromise = fetchMergedRows(req);

    const [employeeCountsRows, pipelineRows, merged] = await Promise.all([
      employeeCountsPromise,
      pipelinePromise,
      mergedPromise,
    ]);

    const counts = employeeCountsRows[0] || {};
    const pipeline = pipelineRows[0] || {};

    const requirement = merged.reduce((sum, row) => sum + row.requirement, 0);
    const available = merged.reduce((sum, row) => sum + row.available, 0);
    const gap = merged.reduce((sum, row) => sum + row.gap, 0);
    const extra = merged.reduce((sum, row) => sum + row.extra, 0);
    const payroll = merged.reduce((sum, row) => sum + row.salary, 0);
    const withoutRequirement = merged
      .filter((row) => row.requirement === 0 && row.available > 0)
      .reduce((sum, row) => sum + row.available, 0);

    const totalEmployees = Number(counts.total_employees || 0);
    const activeEmployees = Number(counts.active_employees || 0);

    const kpis = {
      totalEmployees,
      activeEmployees,
      inactiveEmployees: Number(counts.inactive_employees || 0),
      resignedEmployees: Number(counts.resigned_employees || 0),
      newJoiningThisMonth: Number(counts.new_joining_this_month || 0) + Number(pipeline.joined_this_month_pipeline || 0),
      resignedThisMonth: Number(counts.resigned_this_month || 0),
      pendingJoining: Number(pipeline.pending_joining || 0),
      pendingApproval: Number(pipeline.pending_approval || 0),
      requirement,
      available,
      gap,
      extra,
      onPayroll: available,
      withoutRequirement,
      payroll,
      vacancyPct: requirement > 0 ? Number(((gap / requirement) * 100).toFixed(1)) : 0,
      utilizationPct: requirement > 0 ? Number(((Math.min(available, requirement) / requirement) * 100).toFixed(1)) : 0,
    };

    // Trailing 6 month-end reconstructed snapshots (Active / Resigned that
    // month / cumulative headcount / payroll-at-that-point), used to drive
    // the sparkline on each KPI card. Requirement is held at its current
    // value (no history exists for it).
    const monthEnds = [];
    const now = new Date();
    for (let i = 5; i >= 0; i -= 1) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      monthEnds.push({
        label: monthStart.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
        start: monthStart.toISOString().slice(0, 10),
        end: monthEnd.toISOString().slice(0, 10),
      });
    }

    const snapshotUnion = monthEnds
      .map(
        (_, index) => `
        SELECT
          ${index} AS month_index,
          SUM(CASE WHEN p.date_of_joining <= ? AND (p.resigned_date IS NULL OR p.resigned_date > ?) THEN 1 ELSE 0 END) AS active_as_of,
          SUM(CASE WHEN p.resigned_date BETWEEN ? AND ? THEN 1 ELSE 0 END) AS resigned_in_month,
          SUM(CASE WHEN p.date_of_joining BETWEEN ? AND ? THEN 1 ELSE 0 END) AS joined_in_month,
          SUM(CASE WHEN p.date_of_joining <= ? AND (p.resigned_date IS NULL OR p.resigned_date > ?) THEN COALESCE(p.nth_salary, 0) ELSE 0 END) AS payroll_as_of
        FROM physical p
        WHERE COALESCE(p.is_deleted, 0) = 0 ${physicalScope.sql}
      `
      )
      .join(" UNION ALL ");

    const snapshotParams = [];
    monthEnds.forEach((m) => {
      snapshotParams.push(
        m.end, m.end, // active_as_of
        m.start, m.end, // resigned_in_month
        m.start, m.end, // joined_in_month
        m.end, m.end, // payroll_as_of
        ...physicalScope.params
      );
    });

    const snapshotRows = await query(snapshotUnion, snapshotParams);
    const snapshotByIndex = new Map(snapshotRows.map((row) => [Number(row.month_index), row]));

    const monthlyTrend = monthEnds.map((m, index) => {
      const snap = snapshotByIndex.get(index) || {};
      const activeAsOf = Number(snap.active_as_of || 0);
      return {
        month: m.label,
        activeEmployees: activeAsOf,
        newJoining: Number(snap.joined_in_month || 0),
        resigned: Number(snap.resigned_in_month || 0),
        payroll: Number(snap.payroll_as_of || 0),
        requirement,
        gap: requirement - activeAsOf,
        vacancyPct: requirement > 0 ? Number((((requirement - activeAsOf) / requirement) * 100).toFixed(1)) : 0,
        utilizationPct: requirement > 0 ? Number(((Math.min(activeAsOf, requirement) / requirement) * 100).toFixed(1)) : 0,
      };
    });

    const previous = monthlyTrend[monthlyTrend.length - 2] || null;

    const payload = {
      success: true,
      data: {
        asOf: new Date().toISOString(),
        kpis,
        // No historical "Total Employees" (active+inactive) can be reconstructed
        // — employment_status changes aren't dated, only joining/resigning are —
        // so `previous` intentionally omits totalEmployees rather than faking it
        // with a mislabeled proxy. Every other field here is a real reconstruction.
        previous: previous
          ? {
              activeEmployees: previous.activeEmployees,
              newJoiningThisMonth: previous.newJoining,
              resignedThisMonth: previous.resigned,
              requirement: previous.requirement,
              gap: previous.gap,
              payroll: previous.payroll,
              vacancyPct: previous.vacancyPct,
              utilizationPct: previous.utilizationPct,
            }
          : null,
        monthlyTrend,
      },
    };

    setCachedValue("hrAnalyticsV2Overview", cacheKey, payload, 60 * 1000);
    res.status(200).json(payload);
  } catch (error) {
    console.error("HR Analytics V2 overview error:", error);
    res.status(error?.statusCode || 500).json({ success: false, message: error.message || "Server Error" });
  }
});

// -------------------------------------------------------------------------
// GET /circles — per-circle rollup for the Circle-wise Workforce Dashboard.
// -------------------------------------------------------------------------
router.get("/circles", async (req, res) => {
  try {
    const cacheKey = cacheScopeKey(req);
    const cached = getCachedValue("hrAnalyticsV2Circles", cacheKey);
    if (cached) return res.status(200).json(cached);

    const physicalScope = buildSideScope(req, "p");
    const njScope = buildSideScope(req, "nj");
    const thisMonth = currentMonthRange();

    const [merged, statusRows, pipelineRows] = await Promise.all([
      fetchMergedRows(req),
      query(
        `
        SELECT
          p.circle AS circle,
          SUM(CASE WHEN LOWER(TRIM(COALESCE(p.employment_status, ''))) = 'active' THEN 1 ELSE 0 END) AS active_employees,
          SUM(CASE WHEN LOWER(TRIM(COALESCE(p.employment_status, ''))) = 'inactive' THEN 1 ELSE 0 END) AS inactive_employees,
          SUM(CASE WHEN ${RESIGNED_PREDICATE_SQL} THEN 1 ELSE 0 END) AS resigned_employees,
          SUM(CASE WHEN p.date_of_joining BETWEEN ? AND ? THEN 1 ELSE 0 END) AS new_joining_this_month
        FROM physical p
        WHERE COALESCE(p.is_deleted, 0) = 0 ${physicalScope.sql}
        GROUP BY p.circle
        `,
        [thisMonth.start, thisMonth.end, ...physicalScope.params]
      ),
      query(
        `
        SELECT
          nj.circle AS circle,
          SUM(CASE WHEN LOWER(TRIM(COALESCE(nj.joining_status, ''))) != 'joined' THEN 1 ELSE 0 END) AS pending_joining
        FROM new_joining nj
        WHERE 1 = 1 ${njScope.sql}
        GROUP BY nj.circle
        `,
        njScope.params
      ),
    ]);

    const statusByCircle = new Map(statusRows.map((row) => [row.circle, row]));
    const pipelineByCircle = new Map(pipelineRows.map((row) => [row.circle, row]));

    const rollup = new Map();
    merged.forEach((row) => {
      if (!rollup.has(row.circle)) {
        rollup.set(row.circle, { circle: row.circle, requirement: 0, available: 0, gap: 0, extra: 0, payroll: 0 });
      }
      const entry = rollup.get(row.circle);
      entry.requirement += row.requirement;
      entry.available += row.available;
      entry.gap += row.gap;
      entry.extra += row.extra;
      entry.payroll += row.salary;
    });

    // Circles that only have physical/new_joining rows but zero signoff
    // requirement still need to appear (as pure "Extra" circles).
    statusByCircle.forEach((_row, circle) => {
      if (!rollup.has(circle)) {
        rollup.set(circle, { circle, requirement: 0, available: 0, gap: 0, extra: 0, payroll: 0 });
      }
    });

    const data = Array.from(rollup.values())
      .map((entry) => {
        const status = statusByCircle.get(entry.circle) || {};
        const pipeline = pipelineByCircle.get(entry.circle) || {};
        return {
          circle: entry.circle,
          requirement: entry.requirement,
          available: entry.available,
          gap: entry.gap,
          extra: entry.extra,
          payroll: entry.payroll,
          activeEmployees: Number(status.active_employees || 0),
          inactiveEmployees: Number(status.inactive_employees || 0),
          resignedEmployees: Number(status.resigned_employees || 0),
          newJoiningThisMonth: Number(status.new_joining_this_month || 0),
          pendingJoining: Number(pipeline.pending_joining || 0),
          utilizationPct:
            entry.requirement > 0
              ? Number(((Math.min(entry.available, entry.requirement) / entry.requirement) * 100).toFixed(1))
              : entry.available > 0
              ? 100
              : 0,
        };
      })
      .sort((a, b) => b.gap - a.gap);

    const payload = { success: true, data };
    setCachedValue("hrAnalyticsV2Circles", cacheKey, payload, 60 * 1000);
    res.status(200).json(payload);
  } catch (error) {
    console.error("HR Analytics V2 circles error:", error);
    res.status(error?.statusCode || 500).json({ success: false, message: error.message || "Server Error" });
  }
});

// -------------------------------------------------------------------------
// GET /cmps?circle= — per-CMP rollup with a nested per-designation
// breakdown, for the CMP Analytics "expand to see designations" table.
// -------------------------------------------------------------------------
router.get("/cmps", async (req, res) => {
  try {
    const cacheKey = cacheScopeKey(req);
    const cached = getCachedValue("hrAnalyticsV2Cmps", cacheKey);
    if (cached) return res.status(200).json(cached);

    const physicalScope = buildSideScope(req, "p");
    const njScope = buildSideScope(req, "nj");
    const thisMonth = currentMonthRange();

    const [merged, statusRows, pipelineRows] = await Promise.all([
      fetchMergedRows(req),
      query(
        `
        SELECT
          p.circle AS circle,
          p.cmp AS cmp,
          SUM(CASE WHEN LOWER(TRIM(COALESCE(p.employment_status, ''))) = 'active' THEN 1 ELSE 0 END) AS active_employees,
          SUM(CASE WHEN LOWER(TRIM(COALESCE(p.employment_status, ''))) = 'inactive' THEN 1 ELSE 0 END) AS inactive_employees,
          SUM(CASE WHEN ${RESIGNED_PREDICATE_SQL} THEN 1 ELSE 0 END) AS resigned_employees,
          SUM(CASE WHEN p.date_of_joining BETWEEN ? AND ? THEN 1 ELSE 0 END) AS new_joining_this_month
        FROM physical p
        WHERE COALESCE(p.is_deleted, 0) = 0 ${physicalScope.sql}
        GROUP BY p.circle, p.cmp
        `,
        [thisMonth.start, thisMonth.end, ...physicalScope.params]
      ),
      query(
        `
        SELECT
          nj.circle AS circle,
          nj.cmp AS cmp,
          SUM(CASE WHEN LOWER(TRIM(COALESCE(nj.joining_status, ''))) != 'joined' THEN 1 ELSE 0 END) AS pending_joining
        FROM new_joining nj
        WHERE 1 = 1 ${njScope.sql}
        GROUP BY nj.circle, nj.cmp
        `,
        njScope.params
      ),
    ]);

    const keyOf = (circle, cmp) => `${circle}||${cmp}`;
    const statusByCmp = new Map(statusRows.map((row) => [keyOf(row.circle, row.cmp), row]));
    const pipelineByCmp = new Map(pipelineRows.map((row) => [keyOf(row.circle, row.cmp), row]));

    const rollup = new Map();
    merged.forEach((row) => {
      const key = keyOf(row.circle, row.cmp);
      if (!rollup.has(key)) {
        rollup.set(key, {
          circle: row.circle,
          cmp: row.cmp,
          requirement: 0,
          available: 0,
          gap: 0,
          extra: 0,
          payroll: 0,
          designations: [],
        });
      }
      const entry = rollup.get(key);
      entry.requirement += row.requirement;
      entry.available += row.available;
      entry.gap += row.gap;
      entry.extra += row.extra;
      entry.payroll += row.salary;
      entry.designations.push({
        roleKey: row.roleKey,
        roleLabel: row.roleLabel,
        requirement: row.requirement,
        available: row.available,
        gap: row.gap,
        extra: row.extra,
        salary: row.salary,
      });
    });

    const data = Array.from(rollup.values())
      .map((entry) => {
        const status = statusByCmp.get(keyOf(entry.circle, entry.cmp)) || {};
        const pipeline = pipelineByCmp.get(keyOf(entry.circle, entry.cmp)) || {};
        return {
          circle: entry.circle,
          cmp: entry.cmp,
          requirement: entry.requirement,
          available: entry.available,
          gap: entry.gap,
          extra: entry.extra,
          payroll: entry.payroll,
          activeEmployees: Number(status.active_employees || 0),
          inactiveEmployees: Number(status.inactive_employees || 0),
          resignedEmployees: Number(status.resigned_employees || 0),
          newJoiningThisMonth: Number(status.new_joining_this_month || 0),
          pendingJoining: Number(pipeline.pending_joining || 0),
          utilizationPct:
            entry.requirement > 0
              ? Number(((Math.min(entry.available, entry.requirement) / entry.requirement) * 100).toFixed(1))
              : entry.available > 0
              ? 100
              : 0,
          designations: entry.designations.sort((a, b) => b.gap - a.gap),
        };
      })
      .sort((a, b) => b.gap - a.gap);

    const payload = { success: true, data };
    setCachedValue("hrAnalyticsV2Cmps", cacheKey, payload, 60 * 1000);
    res.status(200).json(payload);
  } catch (error) {
    console.error("HR Analytics V2 cmps error:", error);
    res.status(error?.statusCode || 500).json({ success: false, message: error.message || "Server Error" });
  }
});

// -------------------------------------------------------------------------
// GET /designations?circle=&cmp= — requirement/available/gap/extra per
// designation bucket, for the Designation Analytics charts and the
// Shortage/Surplus ranked lists.
// -------------------------------------------------------------------------
router.get("/designations", async (req, res) => {
  try {
    const cacheKey = cacheScopeKey(req);
    const cached = getCachedValue("hrAnalyticsV2Designations", cacheKey);
    if (cached) return res.status(200).json(cached);

    const merged = await fetchMergedRows(req);

    const rollup = new Map();
    merged.forEach((row) => {
      if (!rollup.has(row.roleKey)) {
        rollup.set(row.roleKey, {
          roleKey: row.roleKey,
          roleLabel: row.roleLabel,
          requirement: 0,
          available: 0,
          gap: 0,
          extra: 0,
          salary: 0,
          circles: new Set(),
        });
      }
      const entry = rollup.get(row.roleKey);
      entry.requirement += row.requirement;
      entry.available += row.available;
      entry.gap += row.gap;
      entry.extra += row.extra;
      entry.salary += row.salary;
      entry.circles.add(row.circle);
    });

    const data = Array.from(rollup.values())
      .map((entry) => ({
        roleKey: entry.roleKey,
        roleLabel: entry.roleLabel,
        requirement: entry.requirement,
        available: entry.available,
        gap: entry.gap,
        extra: entry.extra,
        salary: entry.salary,
        circleCount: entry.circles.size,
      }))
      .sort((a, b) => b.gap - a.gap);

    const payload = { success: true, data };
    setCachedValue("hrAnalyticsV2Designations", cacheKey, payload, 60 * 1000);
    res.status(200).json(payload);
  } catch (error) {
    console.error("HR Analytics V2 designations error:", error);
    res.status(error?.statusCode || 500).json({ success: false, message: error.message || "Server Error" });
  }
});

// -------------------------------------------------------------------------
// GET /joining-trend, GET /resignation-trend — daily counts for up to
// `months` (default 18, max 36) trailing months. The frontend buckets these
// into Today/Weekly/Monthly/Quarterly/Yearly views itself (all from one
// payload) rather than this endpoint branching on a granularity parameter.
// -------------------------------------------------------------------------
function clampMonths(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return 18;
  return Math.min(parsed, 36);
}

router.get("/joining-trend", async (req, res) => {
  try {
    const cacheKey = cacheScopeKey(req);
    const cached = getCachedValue("hrAnalyticsV2JoiningTrend", cacheKey);
    if (cached) return res.status(200).json(cached);

    const months = clampMonths(req.query.months);
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    const sinceDate = since.toISOString().slice(0, 10);

    const source = buildAvailableSourceSql(req);
    const requestedDesignation = String(req.query.designation || "").trim();
    const params = [...source.params, sinceDate];

    const rawRows = await query(
      `
      SELECT
        DATE(av.joined_on) AS joined_date,
        av.circle AS circle,
        av.cmp AS cmp,
        av.raw_designation AS raw_designation,
        COUNT(*) AS total
      FROM (${source.sql}) av
      WHERE av.joined_on IS NOT NULL
        AND av.joined_on >= ?
      GROUP BY joined_date, av.circle, av.cmp, av.raw_designation
      `,
      params
    );

    const resolved = await resolveAndRegroup(rawRows, ["joined_date", "circle", "cmp"], ["total"]);
    const filtered = requestedDesignation
      ? resolved.filter((row) => row.role_key === requestedDesignation)
      : resolved;
    filtered.sort((a, b) => (a.joined_date > b.joined_date ? 1 : a.joined_date < b.joined_date ? -1 : 0));

    const payload = {
      success: true,
      data: filtered.map((row) => ({
        date: row.joined_date,
        circle: row.circle,
        cmp: row.cmp,
        roleKey: row.role_key,
        roleLabel: ROLE_KEY_LABELS[row.role_key] || row.role_key,
        total: Number(row.total || 0),
      })),
    };

    setCachedValue("hrAnalyticsV2JoiningTrend", cacheKey, payload, 60 * 1000);
    res.status(200).json(payload);
  } catch (error) {
    console.error("HR Analytics V2 joining-trend error:", error);
    res.status(error?.statusCode || 500).json({ success: false, message: error.message || "Server Error" });
  }
});

router.get("/resignation-trend", async (req, res) => {
  try {
    const cacheKey = cacheScopeKey(req);
    const cached = getCachedValue("hrAnalyticsV2ResignationTrend", cacheKey);
    if (cached) return res.status(200).json(cached);

    const months = clampMonths(req.query.months);
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    const sinceDate = since.toISOString().slice(0, 10);

    const physicalScope = buildSideScope(req, "p");
    const requestedDesignation = String(req.query.designation || "").trim();

    const rawRows = await query(
      `
      SELECT
        DATE(p.resigned_date) AS resigned_date,
        p.circle AS circle,
        p.cmp AS cmp,
        p.job_role AS raw_designation,
        COUNT(*) AS total
      FROM physical p
      WHERE COALESCE(p.is_deleted, 0) = 0
        AND p.resigned_date IS NOT NULL
        AND p.resigned_date >= ?
        ${physicalScope.sql}
      GROUP BY resigned_date, circle, cmp, raw_designation
      `,
      [sinceDate, ...physicalScope.params]
    );

    const resolved = await resolveAndRegroup(rawRows, ["resigned_date", "circle", "cmp"], ["total"]);
    const filtered = requestedDesignation
      ? resolved.filter((row) => row.role_key === requestedDesignation)
      : resolved;

    const payload = {
      success: true,
      data: filtered.map((row) => ({
        date: row.resigned_date,
        circle: row.circle,
        cmp: row.cmp,
        roleKey: row.role_key,
        roleLabel: ROLE_KEY_LABELS[row.role_key] || row.role_key,
        total: Number(row.total || 0),
      })),
    };

    setCachedValue("hrAnalyticsV2ResignationTrend", cacheKey, payload, 60 * 1000);
    res.status(200).json(payload);
  } catch (error) {
    console.error("HR Analytics V2 resignation-trend error:", error);
    res.status(error?.statusCode || 500).json({ success: false, message: error.message || "Server Error" });
  }
});

// -------------------------------------------------------------------------
// GET /payroll?circle=&cmp=&designation= — payroll distribution + the
// "salary paid where no approved requirement exists" highlight list.
// -------------------------------------------------------------------------
router.get("/payroll", async (req, res) => {
  try {
    const cacheKey = cacheScopeKey(req);
    const cached = getCachedValue("hrAnalyticsV2Payroll", cacheKey);
    if (cached) return res.status(200).json(cached);

    const merged = await fetchMergedRows(req);

    const totalPayroll = merged.reduce((sum, row) => sum + row.salary, 0);
    const availableHeadcount = merged.reduce((sum, row) => sum + row.available, 0);
    // `nth_salary` is sparsely filled in on physical/new_joining today — dividing
    // totalPayroll by every available employee (most of whom have no salary on
    // file) would silently produce a misleadingly tiny "average salary". Average
    // only over the employees who actually have a salary recorded, and surface
    // the coverage so the frontend can flag when it's too low to be meaningful.
    const salariedHeadcount = merged.reduce((sum, row) => sum + row.salariedCount, 0);
    const salaryCoveragePct =
      availableHeadcount > 0 ? Number(((salariedHeadcount / availableHeadcount) * 100).toFixed(1)) : 0;
    const avgSalary = salariedHeadcount > 0 ? totalPayroll / salariedHeadcount : 0;
    const extraHeadcount = merged.reduce((sum, row) => sum + row.extra, 0);
    const extraPayrollEstimate = Number((extraHeadcount * avgSalary).toFixed(2));

    const byCircle = new Map();
    const byCmp = new Map();
    const byDesignation = new Map();

    merged.forEach((row) => {
      const circleEntry = byCircle.get(row.circle) || { circle: row.circle, payroll: 0, headcount: 0 };
      circleEntry.payroll += row.salary;
      circleEntry.headcount += row.available;
      byCircle.set(row.circle, circleEntry);

      const cmpKey = `${row.circle}||${row.cmp}`;
      const cmpEntry = byCmp.get(cmpKey) || { circle: row.circle, cmp: row.cmp, payroll: 0, headcount: 0 };
      cmpEntry.payroll += row.salary;
      cmpEntry.headcount += row.available;
      byCmp.set(cmpKey, cmpEntry);

      const designationEntry =
        byDesignation.get(row.roleKey) || { roleKey: row.roleKey, roleLabel: row.roleLabel, payroll: 0, headcount: 0 };
      designationEntry.payroll += row.salary;
      designationEntry.headcount += row.available;
      byDesignation.set(row.roleKey, designationEntry);
    });

    // "Salary paid without approved requirement" is specifically about pay —
    // requires salary > 0, not just headcount > 0 (a headcount-only version of
    // this already exists as the `withoutRequirement` KPI on /overview).
    const noApprovedRequirement = merged
      .filter((row) => row.requirement === 0 && row.salary > 0)
      .map((row) => ({
        circle: row.circle,
        cmp: row.cmp,
        roleKey: row.roleKey,
        roleLabel: row.roleLabel,
        available: row.available,
        salary: row.salary,
      }))
      .sort((a, b) => b.salary - a.salary)
      .slice(0, 25);

    const payload = {
      success: true,
      data: {
        totalPayroll,
        avgSalary: Number(avgSalary.toFixed(2)),
        salariedHeadcount,
        availableHeadcount,
        salaryCoveragePct,
        extraHeadcount,
        extraPayrollEstimate,
        byCircle: Array.from(byCircle.values()).sort((a, b) => b.payroll - a.payroll),
        byCmp: Array.from(byCmp.values()).sort((a, b) => b.payroll - a.payroll),
        byDesignation: Array.from(byDesignation.values()).sort((a, b) => b.payroll - a.payroll),
        noApprovedRequirement,
      },
    };

    setCachedValue("hrAnalyticsV2Payroll", cacheKey, payload, 60 * 1000);
    res.status(200).json(payload);
  } catch (error) {
    console.error("HR Analytics V2 payroll error:", error);
    res.status(error?.statusCode || 500).json({ success: false, message: error.message || "Server Error" });
  }
});

// -------------------------------------------------------------------------
// GET /insights — smart, server-computed insight list.
// -------------------------------------------------------------------------
router.get("/insights", async (req, res) => {
  try {
    const cacheKey = cacheScopeKey(req);
    const cached = getCachedValue("hrAnalyticsV2Insights", cacheKey);
    if (cached) return res.status(200).json(cached);

    const merged = await fetchMergedRows(req);

    const byCircle = new Map();
    merged.forEach((row) => {
      const entry = byCircle.get(row.circle) || { circle: row.circle, requirement: 0, available: 0, gap: 0, extra: 0 };
      entry.requirement += row.requirement;
      entry.available += row.available;
      entry.gap += row.gap;
      entry.extra += row.extra;
      byCircle.set(row.circle, entry);
    });
    const circleRows = Array.from(byCircle.values()).map((row) => ({
      ...row,
      utilizationPct: row.requirement > 0 ? Math.min(row.available, row.requirement) / row.requirement : row.available > 0 ? 1 : 0,
    }));

    const insights = [];

    if (circleRows.length) {
      const highestShortage = [...circleRows].sort((a, b) => b.gap - a.gap)[0];
      if (highestShortage?.gap > 0) {
        insights.push({
          type: "shortage",
          label: "Highest manpower shortage",
          detail: `${highestShortage.circle} is short by ${highestShortage.gap} employees.`,
        });
      }

      const highestSurplus = [...circleRows].sort((a, b) => b.extra - a.extra)[0];
      if (highestSurplus?.extra > 0) {
        insights.push({
          type: "surplus",
          label: "Highest manpower surplus",
          detail: `${highestSurplus.circle} has ${highestSurplus.extra} more employees than required.`,
        });
      }

      const best = [...circleRows].sort((a, b) => b.utilizationPct - a.utilizationPct)[0];
      if (best) {
        insights.push({
          type: "best",
          label: "Best performing circle",
          detail: `${best.circle} has the highest utilization at ${(best.utilizationPct * 100).toFixed(1)}%.`,
        });
      }

      const worst = [...circleRows].sort((a, b) => a.utilizationPct - b.utilizationPct)[0];
      if (worst) {
        insights.push({
          type: "worst",
          label: "Lowest utilization circle",
          detail: `${worst.circle} has the lowest utilization at ${(worst.utilizationPct * 100).toFixed(1)}%.`,
        });
      }
    }

    const byDesignation = new Map();
    merged.forEach((row) => {
      const entry = byDesignation.get(row.roleKey) || { roleKey: row.roleKey, roleLabel: row.roleLabel, gap: 0 };
      entry.gap += row.gap;
      byDesignation.set(row.roleKey, entry);
    });
    const urgentDesignation = Array.from(byDesignation.values()).sort((a, b) => b.gap - a.gap)[0];
    if (urgentDesignation?.gap > 0) {
      insights.push({
        type: "designation-shortage",
        label: "Designation needing urgent recruitment",
        detail: `${urgentDesignation.roleLabel} is short by ${urgentDesignation.gap} across all scoped circles/CMPs.`,
      });
    }

    const noRequirementCount = merged.filter((row) => row.requirement === 0 && row.available > 0).length;
    if (noRequirementCount > 0) {
      insights.push({
        type: "roster-risk",
        label: "Employees without approved requirement",
        detail: `${noRequirementCount} circle/CMP/designation combinations have employees on the roster with no approved requirement.`,
      });
    }

    const totalRequirement = merged.reduce((sum, row) => sum + row.requirement, 0);
    const totalAvailable = merged.reduce((sum, row) => sum + row.available, 0);
    insights.push({
      type: "overall-utilization",
      label: "Overall workforce utilization",
      detail:
        totalRequirement > 0
          ? `${((Math.min(totalAvailable, totalRequirement) / totalRequirement) * 100).toFixed(1)}% of sanctioned requirement is currently filled.`
          : "No sanctioned requirement configured for the current filter scope.",
    });

    const payload = { success: true, data: insights };
    setCachedValue("hrAnalyticsV2Insights", cacheKey, payload, 60 * 1000);
    res.status(200).json(payload);
  } catch (error) {
    console.error("HR Analytics V2 insights error:", error);
    res.status(error?.statusCode || 500).json({ success: false, message: error.message || "Server Error" });
  }
});

// Small metadata endpoint so the frontend filter bar can list every
// designation bucket without hardcoding ROLE_KEY_LABELS client-side.
router.get("/designation-options", (_req, res) => {
  res.status(200).json({
    success: true,
    data: ALL_ROLE_KEYS.map((roleKey) => ({ roleKey, roleLabel: ROLE_KEY_LABELS[roleKey] })),
  });
});

module.exports = router;
