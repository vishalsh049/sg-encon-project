/*
 * Shared SQL-fragment builders for normalizing free-form job_role/designation
 * text into the canonical `role_key` values used by the signoff table and the
 * RAG dashboard (technician, analyst, fttx_engineer, ...).
 *
 * These are verbatim copies of the CASE mappings already duplicated across
 * backend/routes/physicalRoutes.js (`/active-job-role-cmp-count`),
 * backend/routes/hrDashboardExport.js (`fetchPhysicalActiveData` /
 * `fetchScrumActiveData`) and backend/routes/manpowerRoutes.js
 * (`/scrum/cmp-role-count`). Physical/new_joining share one CASE variant;
 * scrum uses a different one (fewer aliases for a few roles) — kept as two
 * separate functions so they never get merged/drift.
 *
 * Only the new drilldown endpoints use this module — the 3 existing call
 * sites above are intentionally left untouched.
 */

// Strips spaces/hyphens/underscores/dots and lowercases, so "Fibre-Supervisor",
// "fibre_supervisor" and "FIBRE SUPERVISOR" all normalize identically.
function normalizeRoleSql(columnExpr) {
  return `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(${columnExpr}), ' ', ''), '-', ''), '_', ''), '.', ''))`;
}

function physicalRoleKeyCaseSql(normalizedExpr) {
  return `
    CASE
      WHEN ${normalizedExpr} IN (
        'stateenergymanager',
        'statefibersme',
        'stateispsme',
        'statematerialmanager',
        'stateoperationhead',
        'stateplanningmanager',
        'stateutilitysme'
      )
      THEN 'state_leadership_team'
      WHEN ${normalizedExpr} = 'nocexecutive' THEN 'noc_executive'
      WHEN ${normalizedExpr} LIKE 'analyst%' THEN 'analyst'
      WHEN ${normalizedExpr} = 'cmplead' THEN 'cmp_lead'
      WHEN ${normalizedExpr} = 'technician' THEN 'technician'
      WHEN ${normalizedExpr} = 'rigger' THEN 'rigger'
      WHEN ${normalizedExpr} = 'utilitysupervisor' THEN 'utility_supervisor'
      WHEN ${normalizedExpr} = 'utilityengineer' THEN 'utility_engineer'
      WHEN ${normalizedExpr} = 'ispengineer' THEN 'isp_engineer'
      WHEN ${normalizedExpr} IN ('whinchargecumsecurity', 'warehouseincharge', 'warehouseinchargecumsecurity')
      THEN 'wh_incharge_cum_security'
      WHEN ${normalizedExpr} = 'splicer' THEN 'splicer'
      WHEN ${normalizedExpr} = 'assistantsplicer' THEN 'assistant_splicer'
      WHEN ${normalizedExpr} IN ('fiberhelper', 'fibrehelper', 'frthelper') THEN 'fiber_helper'
      WHEN ${normalizedExpr} = 'patroller' THEN 'patroller'
      WHEN ${normalizedExpr} IN ('fibersupervisor', 'fibresupervisor') THEN 'fiber_supervisor'
      WHEN ${normalizedExpr} IN ('fiberengineer', 'fibreengineer') THEN 'fibre_engineer'
      WHEN ${normalizedExpr} = 'fttxsplicer' THEN 'fttx_splicer'
      WHEN ${normalizedExpr} = 'fttxassistantsplicer' THEN 'fttx_assistant_splicer'
      WHEN ${normalizedExpr} = 'fttxsupervisor' THEN 'fttx_supervisor'
      WHEN ${normalizedExpr} = 'fttxhelper' THEN 'fttx_helper'
      WHEN ${normalizedExpr} = 'fttxengineer' THEN 'fttx_engineer'
      WHEN ${normalizedExpr} = 'fttxtechnician' THEN 'fttx_technician'
      WHEN ${normalizedExpr} = 'technicianb' THEN 'technicianb'
      WHEN ${normalizedExpr} = 'riggerb' THEN 'riggerb'
      ELSE NULL
    END
  `;
}

function scrumRoleKeyCaseSql(normalizedExpr) {
  return `
    CASE
      WHEN ${normalizedExpr} IN ('stateleadershipteam', 'stateleadership') THEN 'state_leadership_team'
      WHEN ${normalizedExpr} = 'nocexecutive' THEN 'noc_executive'
      WHEN ${normalizedExpr} = 'analyst' THEN 'analyst'
      WHEN ${normalizedExpr} = 'cmplead' THEN 'cmp_lead'
      WHEN ${normalizedExpr} = 'technician' THEN 'technician'
      WHEN ${normalizedExpr} = 'rigger' THEN 'rigger'
      WHEN ${normalizedExpr} = 'utilitysupervisor' THEN 'utility_supervisor'
      WHEN ${normalizedExpr} = 'utilityengineer' THEN 'utility_engineer'
      WHEN ${normalizedExpr} = 'ispengineer' THEN 'isp_engineer'
      WHEN ${normalizedExpr} IN ('warehouseinchargecumsecurity', 'whinchargecumsecurity') THEN 'wh_incharge_cum_security'
      WHEN ${normalizedExpr} = 'splicer' THEN 'splicer'
      WHEN ${normalizedExpr} = 'assistantsplicer' THEN 'assistant_splicer'
      WHEN ${normalizedExpr} IN ('fiberhelper', 'fibrehelper') THEN 'fiber_helper'
      WHEN ${normalizedExpr} = 'patroller' THEN 'patroller'
      WHEN ${normalizedExpr} IN ('fibersupervisor', 'fibresupervisor') THEN 'fiber_supervisor'
      WHEN ${normalizedExpr} IN ('fiberengineer', 'fibreengineer') THEN 'fibre_engineer'
      WHEN ${normalizedExpr} = 'fttxsplicer' THEN 'fttx_splicer'
      WHEN ${normalizedExpr} = 'fttxassistantsplicer' THEN 'fttx_assistant_splicer'
      WHEN ${normalizedExpr} = 'fttxsupervisor' THEN 'fttx_supervisor'
      WHEN ${normalizedExpr} = 'fttxhelper' THEN 'fttx_helper'
      WHEN ${normalizedExpr} = 'fttxengineer' THEN 'fttx_engineer'
      WHEN ${normalizedExpr} = 'fttxtechnician' THEN 'fttx_technician'
      WHEN ${normalizedExpr} = 'technicianb' THEN 'technicianb'
      WHEN ${normalizedExpr} = 'riggerb' THEN 'riggerb'
      ELSE NULL
    END
  `;
}

module.exports = {
  normalizeRoleSql,
  physicalRoleKeyCaseSql,
  scrumRoleKeyCaseSql,
};
