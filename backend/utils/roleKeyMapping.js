/*
 * Shared SQL-fragment helper for normalizing free-form job_role/designation
 * text so it can be compared against the (also normalized) designation
 * labels stored in manpower_sub_profiles.
 *
 * This file used to also export physicalRoleKeyCaseSql()/scrumRoleKeyCaseSql()
 * — hardcoded SQL CASE-WHEN blocks classifying a normalized job_role into a
 * role_key. Those were retired because they duplicated (and drifted out of
 * sync with) the live, admin-editable manpower_sub_profiles config already
 * used by resolveRoleKey()/getRoleKeyMatchers() in
 * backend/services/manpowerConfigService.js — see that file for the current
 * single source of truth for designation -> role_key classification.
 */

// Strips spaces/hyphens/underscores/dots and lowercases, so "Fibre-Supervisor",
// "fibre_supervisor" and "FIBRE SUPERVISOR" all normalize identically.
function normalizeRoleSql(columnExpr) {
  return `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(${columnExpr}), ' ', ''), '-', ''), '_', ''), '.', ''))`;
}

module.exports = {
  normalizeRoleSql,
};
