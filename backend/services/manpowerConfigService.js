/*
 * Single source of truth for manpower master data: Main Profiles, Sub
 * Profiles (designation -> role_key mapping), Circles/CMPs, and Validation
 * Rules. Replaces the hardcoded copies previously scattered across
 * backend/constants/designations.js, backend/constants/circles.js,
 * backend/utils/roleKeyMapping.js and the duplicated SQL CASE-WHEN blocks in
 * physicalRoutes.js / hrDashboardExport.js / hrAnalyticsV2Routes.js /
 * manpowerRoutes.js.
 *
 * Tables are created (and seeded, once) lazily on first use, following the
 * same runtime-DDL convention as ensureAccessTables()/ensurePhysicalInfrastructure()
 * elsewhere in this codebase — there is no migration framework in this repo.
 */

const { db } = require("../config/db");
const { MAIN_PROFILES, SUB_PROFILES, VALIDATION_RULES } = require("../constants/manpowerSeedData");
const { CIRCLES, CIRCLE_CMP_MAP } = require("../constants/circles");

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });

// Same real-world spelling exceptions previously hardcoded in
// backend/constants/circles.js, folded into the seed as row-level aliases.
const CIRCLE_ALIAS_SEED = {
  "UP East": ["Uttar Pradesh East", "Uttar Pardesh East", "U P East"],
};
const CMP_ALIAS_SEED = {
  Hissar: ["Hisar"],
};

let ensureTablesPromise = null;

function ensureManpowerTables() {
  if (!ensureTablesPromise) {
    ensureTablesPromise = ensureManpowerTablesOnce().catch((error) => {
      ensureTablesPromise = null;
      throw error;
    });
  }
  return ensureTablesPromise;
}

async function ensureManpowerTablesOnce() {
  await query(`
    CREATE TABLE IF NOT EXISTS manpower_main_profiles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      role_key VARCHAR(100) NOT NULL UNIQUE,
      label VARCHAR(150) NOT NULL,
      has_signoff_column TINYINT(1) NOT NULL DEFAULT 1,
      display_order INT NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS manpower_sub_profiles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      main_profile_id INT NULL,
      designation_label VARCHAR(150) NOT NULL,
      match_type ENUM('exact','prefix') NOT NULL DEFAULT 'exact',
      source_scope ENUM('physical','scrum','both') NOT NULL DEFAULT 'both',
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_sub_profiles_main_profile (main_profile_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS manpower_circles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      aliases JSON NULL,
      display_order INT NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS manpower_cmps (
      id INT AUTO_INCREMENT PRIMARY KEY,
      circle_id INT NOT NULL,
      name VARCHAR(150) NOT NULL,
      aliases JSON NULL,
      display_order INT NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_cmps_circle (circle_id),
      UNIQUE KEY uniq_cmp_per_circle (circle_id, name)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS manpower_validation_rules (
      id INT AUTO_INCREMENT PRIMARY KEY,
      field_key VARCHAR(100) NOT NULL,
      rule_type ENUM('regex','enum','required','range') NOT NULL,
      rule_value TEXT NOT NULL,
      error_message VARCHAR(255) NULL,
      applies_to JSON NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_field_rule_type (field_key, rule_type)
    )
  `);

  await seedIfEmpty();
}

async function seedIfEmpty() {
  const [{ count }] = await query("SELECT COUNT(*) AS count FROM manpower_main_profiles");
  if (Number(count) > 0) return;

  const roleKeyToId = {};
  for (let i = 0; i < MAIN_PROFILES.length; i += 1) {
    const [roleKey, label, hasSignoffColumn] = MAIN_PROFILES[i];
    const result = await query(
      `INSERT INTO manpower_main_profiles (role_key, label, has_signoff_column, display_order) VALUES (?, ?, ?, ?)`,
      [roleKey, label, hasSignoffColumn ? 1 : 0, i]
    );
    roleKeyToId[roleKey] = result.insertId;
  }

  for (const [roleKey, designationLabel, matchType, sourceScope] of SUB_PROFILES) {
    const mainProfileId = roleKey ? roleKeyToId[roleKey] || null : null;
    await query(
      `INSERT INTO manpower_sub_profiles (main_profile_id, designation_label, match_type, source_scope) VALUES (?, ?, ?, ?)`,
      [mainProfileId, designationLabel, matchType, sourceScope]
    );
  }

  for (let i = 0; i < CIRCLES.length; i += 1) {
    const circleName = CIRCLES[i];
    const aliases = CIRCLE_ALIAS_SEED[circleName] || null;
    const result = await query(
      `INSERT INTO manpower_circles (name, aliases, display_order) VALUES (?, ?, ?)`,
      [circleName, aliases ? JSON.stringify(aliases) : null, i]
    );
    const circleId = result.insertId;

    const cmps = CIRCLE_CMP_MAP[circleName] || [];
    for (let j = 0; j < cmps.length; j += 1) {
      const cmpName = cmps[j];
      const cmpAliases = CMP_ALIAS_SEED[cmpName] || null;
      await query(
        `INSERT INTO manpower_cmps (circle_id, name, aliases, display_order) VALUES (?, ?, ?, ?)`,
        [circleId, cmpName, cmpAliases ? JSON.stringify(cmpAliases) : null, j]
      );
    }
  }

  for (const [fieldKey, ruleType, ruleValue, errorMessage, appliesTo] of VALIDATION_RULES) {
    await query(
      `INSERT INTO manpower_validation_rules (field_key, rule_type, rule_value, error_message, applies_to) VALUES (?, ?, ?, ?, ?)`,
      [fieldKey, ruleType, ruleValue, errorMessage, JSON.stringify(appliesTo || [])]
    );
  }
}

// Same normalization convention already used across the codebase (see
// backend/utils/roleKeyMapping.js normalizeRoleSql and
// backend/constants/designations.js normalizeDesignation).
function normalizeRoleText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-_.]/g, "");
}

function normalizeLooseText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[-_().]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CACHE_TTL_MS = 60 * 1000;
let cache = null;
let cacheLoadedAt = 0;

function clearManpowerConfigCache() {
  cache = null;
  cacheLoadedAt = 0;
}

async function loadRawConfig() {
  await ensureManpowerTables();

  if (cache && Date.now() - cacheLoadedAt < CACHE_TTL_MS) {
    return cache;
  }

  const [mainProfiles, subProfiles, circles, cmps, validationRules] = await Promise.all([
    query(`SELECT * FROM manpower_main_profiles ORDER BY display_order ASC, id ASC`),
    query(`SELECT * FROM manpower_sub_profiles ORDER BY id ASC`),
    query(`SELECT * FROM manpower_circles ORDER BY display_order ASC, id ASC`),
    query(`SELECT * FROM manpower_cmps ORDER BY display_order ASC, id ASC`),
    query(`SELECT * FROM manpower_validation_rules ORDER BY field_key ASC, rule_type ASC`),
  ]);

  cache = {
    mainProfiles,
    subProfiles,
    circles,
    cmps,
    validationRules,
    indexes: buildIndexes(mainProfiles, subProfiles, circles, cmps),
  };
  cacheLoadedAt = Date.now();
  return cache;
}

function buildIndexes(mainProfiles, subProfiles, circles, cmps) {
  const mainProfileById = new Map(mainProfiles.map((row) => [row.id, row]));

  // exactMap: normalized designation label -> array of candidate matches
  // (more than one when the same label is scoped differently, e.g. "Analyst").
  // Every sub-profile is matched exactly against its configured designation
  // label — no prefix/wildcard matching, so a designation only ever rolls up
  // into a Main Profile when it is explicitly listed in Manpower Settings.
  const exactMap = new Map();

  subProfiles
    .filter((row) => row.is_active && row.main_profile_id !== null)
    .forEach((row) => {
      const mainProfile = mainProfileById.get(row.main_profile_id);
      if (!mainProfile || !mainProfile.is_active) return;

      const entry = {
        roleKey: mainProfile.role_key,
        label: mainProfile.label,
        sourceScope: row.source_scope,
      };

      const normalized = normalizeRoleText(row.designation_label);
      const bucket = exactMap.get(normalized) || [];
      bucket.push(entry);
      exactMap.set(normalized, bucket);
    });

  const circleByName = new Map();
  const circleAliasLookup = new Map();
  circles
    .filter((row) => row.is_active)
    .forEach((row) => {
      circleByName.set(normalizeLooseText(row.name), row);
      circleAliasLookup.set(normalizeLooseText(row.name), row.name);
      (parseJsonArray(row.aliases) || []).forEach((alias) => {
        circleAliasLookup.set(normalizeLooseText(alias), row.name);
      });
    });

  const cmpByCircleAndName = new Map();
  cmps
    .filter((row) => row.is_active)
    .forEach((row) => {
      const circle = circles.find((c) => c.id === row.circle_id);
      if (!circle) return;
      const key = `${circle.name}::${normalizeLooseText(row.name)}`;
      cmpByCircleAndName.set(key, row.name);
      (parseJsonArray(row.aliases) || []).forEach((alias) => {
        cmpByCircleAndName.set(`${circle.name}::${normalizeLooseText(alias)}`, row.name);
      });
    });

  return { exactMap, circleAliasLookup, cmpByCircleAndName };
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

// Resolves a raw free-text job_role/designation value to its Main Profile
// role_key, or null if it doesn't match anything (mirrors the old
// `CASE WHEN ... ELSE NULL END` behavior). sourceScope should be 'physical'
// or 'scrum' to match a row's source_scope ('both' rows always match).
// Exact match only, by design — a designation counts toward a role only when
// it is explicitly listed for it in Manpower Settings, never via a
// startsWith()/LIKE-prefix guess that could silently sweep in variants no one
// reviewed (e.g. "Analyst" must never implicitly absorb "Analyst - X").
async function resolveRoleKey(rawText, sourceScope) {
  const normalized = normalizeRoleText(rawText);
  if (!normalized) return null;

  const { indexes } = await loadRawConfig();

  const exactCandidates = indexes.exactMap.get(normalized) || [];
  const exactMatch = exactCandidates.find(
    (candidate) => candidate.sourceScope === "both" || candidate.sourceScope === sourceScope
  );
  if (exactMatch) return { roleKey: exactMatch.roleKey, label: exactMatch.label };

  return null;
}

// Inverse of resolveRoleKey(): given a target role_key, returns every
// normalized designation text that resolves to it for the given sourceScope.
// Lets SQL-level row filtering (drilldown) stay in sync with the same live
// manpower_sub_profiles config the aggregate counts use, instead of a
// separately hand-maintained SQL CASE-WHEN. Exact match only (see
// resolveRoleKey above) — the returned `prefix` array is always empty and
// kept only so callers built around the old {exact, prefix} shape don't need
// to change.
async function getRoleKeyMatchers(roleKey, sourceScope) {
  const { indexes } = await loadRawConfig();

  const exact = [];
  indexes.exactMap.forEach((candidates, normalized) => {
    const isMatch = candidates.some(
      (candidate) =>
        candidate.roleKey === roleKey &&
        (candidate.sourceScope === "both" || candidate.sourceScope === sourceScope)
    );
    if (isMatch) exact.push(normalized);
  });

  return { exact, prefix: [] };
}

async function resolveCircle(raw) {
  const { indexes } = await loadRawConfig();
  return indexes.circleAliasLookup.get(normalizeLooseText(raw)) || null;
}

async function resolveCmp(circleInput, raw) {
  const { circles: circleRows, indexes } = await loadRawConfig();
  const circleName =
    circleRows.find((c) => c.name === circleInput)?.name || (await resolveCircle(circleInput));
  if (!circleName) return null;

  return indexes.cmpByCircleAndName.get(`${circleName}::${normalizeLooseText(raw)}`) || null;
}

async function getDesignationOptions() {
  const { subProfiles } = await loadRawConfig();
  const seen = new Set();
  const options = [];
  subProfiles
    .filter((row) => row.is_active)
    .forEach((row) => {
      if (seen.has(row.designation_label)) return;
      seen.add(row.designation_label);
      options.push(row.designation_label);
    });
  return options;
}

async function getCirclesPayload() {
  const { circles, cmps } = await loadRawConfig();
  const activeCircles = circles.filter((row) => row.is_active);
  const circleCmpMap = {};
  activeCircles.forEach((circle) => {
    circleCmpMap[circle.name] = cmps
      .filter((cmp) => cmp.circle_id === circle.id && cmp.is_active)
      .map((cmp) => cmp.name);
  });
  return {
    circles: activeCircles.map((row) => row.name),
    circleCmpMap,
  };
}

async function getValidationRules() {
  const { validationRules } = await loadRawConfig();
  return validationRules.filter((row) => row.is_active);
}

function toCamelMainProfile(row) {
  return {
    id: row.id,
    roleKey: row.role_key,
    label: row.label,
    hasSignoffColumn: Boolean(row.has_signoff_column),
    displayOrder: row.display_order,
    isActive: Boolean(row.is_active),
  };
}

function toCamelSubProfile(row, mainProfileById) {
  const mainProfile = row.main_profile_id ? mainProfileById.get(row.main_profile_id) : null;
  return {
    id: row.id,
    mainProfileId: row.main_profile_id,
    mainProfileRoleKey: mainProfile ? mainProfile.role_key : null,
    designationLabel: row.designation_label,
    matchType: row.match_type,
    sourceScope: row.source_scope,
    isActive: Boolean(row.is_active),
  };
}

function toCamelCircle(row) {
  return {
    id: row.id,
    name: row.name,
    aliases: parseJsonArray(row.aliases),
    displayOrder: row.display_order,
    isActive: Boolean(row.is_active),
  };
}

function toCamelCmp(row, circleById) {
  const circle = circleById.get(row.circle_id);
  return {
    id: row.id,
    circleId: row.circle_id,
    circleName: circle ? circle.name : null,
    name: row.name,
    aliases: parseJsonArray(row.aliases),
    displayOrder: row.display_order,
    isActive: Boolean(row.is_active),
  };
}

function toCamelValidationRule(row) {
  let ruleValue = row.rule_value;
  try {
    ruleValue = JSON.parse(row.rule_value);
  } catch (_error) {
    // regex rules store a plain string, not JSON — keep as-is.
  }
  return {
    id: row.id,
    fieldKey: row.field_key,
    ruleType: row.rule_type,
    ruleValue,
    errorMessage: row.error_message,
    appliesTo: parseJsonArray(row.applies_to),
    isActive: Boolean(row.is_active),
  };
}

// Full bootstrap payload for the frontend (GET /api/manpower-settings/config)
// and for the Manpower Settings admin page — includes inactive rows so they
// can be reactivated from the UI.
async function getManpowerConfigPayload() {
  const { mainProfiles, subProfiles, circles, cmps, validationRules } = await loadRawConfig();
  const mainProfileById = new Map(mainProfiles.map((row) => [row.id, row]));
  const circleById = new Map(circles.map((row) => [row.id, row]));

  return {
    mainProfiles: mainProfiles.map(toCamelMainProfile),
    subProfiles: subProfiles.map((row) => toCamelSubProfile(row, mainProfileById)),
    circles: circles.map(toCamelCircle),
    cmps: cmps.map((row) => toCamelCmp(row, circleById)),
    validationRules: validationRules.map(toCamelValidationRule),
  };
}

module.exports = {
  query,
  ensureManpowerTables,
  clearManpowerConfigCache,
  resolveRoleKey,
  getRoleKeyMatchers,
  resolveCircle,
  resolveCmp,
  getDesignationOptions,
  getCirclesPayload,
  getValidationRules,
  getManpowerConfigPayload,
  normalizeRoleText,
};
