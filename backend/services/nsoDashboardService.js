const util = require("util");
const ExcelJS = require("exceljs");
const { db } = require("../config/db");
const { isAllCircle } = require("../middleware/circleAccess");
const { getBaseFtkm, getCircleBaseFtkmTotal } = require("../constants/baseFtkm");

const query = util.promisify(db.query).bind(db);

// ─── Filters ───────────────────────────────────────────────────────────────
// NOTE on naming: the dashboard UI calls the top-level grouping "CMP" and the
// sub-grouping "Scope" — but those map to this table's `circle` and `cmp`
// columns respectively (verified against real data: circle="Delhi",
// cmp="Delhi-1 (West)", matching the reference design's "CMP: Delhi" /
// "Scope: Delhi-1 (West)"). SQL below still filters the real `circle`/`cmp`
// columns; only the JS response shapes relabel them for the UI.

function parseFilterValue(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    return value.flatMap(parseFilterValue);
  }
  return String(value)
    .split(",")
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function buildFilterClauses(req, params, options = {}) {
  const filters = [];

  const circleValues = isAllCircle(req.authUser)
    ? parseFilterValue(req.query.circle)
    : [req.authUser.circle];

  if (circleValues.length) {
    const values = circleValues.map((value) => String(value).toLowerCase());
    if (values.length === 1) {
      filters.push("LOWER(TRIM(circle)) = ?");
      params.push(values[0]);
    } else {
      filters.push(
        `LOWER(TRIM(circle)) IN (${values.map(() => "?").join(",")})`
      );
      params.push(...values);
    }
  }

  const cmpValues = parseFilterValue(req.query.cmp).map((value) =>
    String(value).toLowerCase()
  );
  if (cmpValues.length) {
    if (cmpValues.length === 1) {
      filters.push("LOWER(TRIM(cmp)) = ?");
      params.push(cmpValues[0]);
    } else {
      filters.push(
        `LOWER(TRIM(cmp)) IN (${cmpValues.map(() => "?").join(",")})`
      );
      params.push(...cmpValues);
    }
  }

  const yearValues = parseFilterValue(req.query.year);
  if (yearValues.length) {
    if (yearValues.length === 1) {
      filters.push("year = ?");
      params.push(yearValues[0]);
    } else {
      filters.push(`year IN (${yearValues.map(() => "?").join(",")})`);
      params.push(...yearValues);
    }
  }

  const monthValues = parseFilterValue(req.query.month);
  if (monthValues.length) {
    if (monthValues.length === 1) {
      filters.push("month = ?");
      params.push(monthValues[0]);
    } else {
      filters.push(`month IN (${monthValues.map(() => "?").join(",")})`);
      params.push(...monthValues);
    }
  }

  const weekValues = parseFilterValue(req.query.week);
  if (weekValues.length) {
    if (weekValues.length === 1) {
      filters.push("week = ?");
      params.push(weekValues[0]);
    } else {
      filters.push(`week IN (${weekValues.map(() => "?").join(",")})`);
      params.push(...weekValues);
    }
  }

  // Week-range filter (from the dashboard's Week Range dropdown) — resolved
  // by the caller into concrete (year, week) pairs via resolveWeekRange()
  // below, since "between week 19 and week 22" isn't expressible as a plain
  // column comparison once the stored `week` value is a formatted string.
  if (options.weekPairs && options.weekPairs.length) {
    const pairClauses = options.weekPairs.map(() => "(year = ? AND week = ?)");
    filters.push(`(${pairClauses.join(" OR ")})`);
    options.weekPairs.forEach((pair) => params.push(pair.year, pair.week));
  }

  if (filters.length === 0) {
    return "";
  }

  return `AND ${filters.join(" AND ")}`;
}

// ─── Week parsing / sorting / formatting ──────────────────────────────────
// Real stored `week` values look like "WK-22'26" or sometimes just "WK-52"
// (no embedded year suffix) — already fully formatted by whatever produced
// them, not a plain number. The previous code did CONCAT('WK-', week),
// which double-prefixed every already-formatted value, and sorted with
// `ORDER BY year DESC, week DESC` as a plain string comparison, which is
// wrong once week numbers or formats vary (e.g. "WK-9" > "WK-52" as text).
// Fix: extract just the leading digits for both sorting and display, and
// always trust the separate `year` column (reliable) over any embedded
// year suffix (not always present).

function parseWeekNumber(week) {
  const match = String(week || "").match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function weekSortKey(year, week) {
  const weekNum = parseWeekNumber(week);
  const yearNum = Number(year) || 0;
  return yearNum * 1000 + (weekNum === null ? 0 : weekNum);
}

function formatWeekLabel(year, week) {
  const weekNum = parseWeekNumber(week);
  if (weekNum === null) return String(week || "Unknown");
  const yy = String(year || "").slice(-2);
  return yy ? `Wk-${String(weekNum).padStart(2, "0")}'${yy}` : `Wk-${String(weekNum).padStart(2, "0")}`;
}

// Every distinct (year, week) combination matching the request's non-week
// filters, sorted chronologically (oldest first). Feeds both the Week Range
// dropdown's option list and resolveWeekRange()'s range-slicing below.
async function getSortedWeeks(req) {
  const params = [];
  const filters = buildFilterClauses(req, params);
  const rows = await query(
    `SELECT DISTINCT year, week FROM nso_reports WHERE 1=1 ${filters}`,
    params
  );
  return rows
    .map((row) => ({
      year: row.year,
      week: row.week,
      label: formatWeekLabel(row.year, row.week),
      sortKey: weekSortKey(row.year, row.week),
    }))
    .sort((a, b) => a.sortKey - b.sortKey);
}

// Resolves the dashboard's Week Range dropdown (?weekFromYear&weekFromRaw
// &weekToYear&weekToRaw) into the concrete list of (year, week) pairs it
// covers. With no range params, defaults to the full available range (i.e.
// no additional narrowing) rather than an empty/all-time-unbounded guess.
async function resolveWeekRange(req) {
  const { weekFromYear, weekFromRaw, weekToYear, weekToRaw } = req.query;
  if (!weekFromRaw && !weekToRaw) return null;

  const allWeeks = await getSortedWeeks(req);
  if (!allWeeks.length) return [];

  const fromKey = weekFromRaw
    ? weekSortKey(weekFromYear, weekFromRaw)
    : allWeeks[0].sortKey;
  const toKey = weekToRaw
    ? weekSortKey(weekToYear, weekToRaw)
    : allWeeks[allWeeks.length - 1].sortKey;

  const lo = Math.min(fromKey, toKey);
  const hi = Math.max(fromKey, toKey);
  return allWeeks.filter((w) => w.sortKey >= lo && w.sortKey <= hi);
}

async function buildScopedFilters(req) {
  const weekPairs = await resolveWeekRange(req);
  const params = [];
  const filters = buildFilterClauses(req, params, { weekPairs: weekPairs || undefined });
  return { params, filters, weekPairs };
}

function safeNumber(value) {
  return Number(value || 0);
}

function round2(value) {
  return Number(Number(value || 0).toFixed(2));
}

function formatChange(current, previous) {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }
  return round2(((current - previous) / previous) * 100);
}

// FTKM = ((Cuts / 7) * 31) / BaseFTKM * 1000 — verified against the user's
// real spreadsheet formula and 3 real (CMP, Scope, Week) data points. This
// is the ONLY place this formula is implemented; every KPI/chart/table/
// export below calls this, so they can never disagree. Returns null (not 0)
// when no Base FTKM is registered for that circle+cmp, so callers can render
// an honest "N/A" instead of a fabricated number — never silently invent data.
function computeFtkm(cuts, baseFtkmKm) {
  if (!baseFtkmKm) return null;
  return (((safeNumber(cuts) / 7) * 31) / baseFtkmKm) * 1000;
}

// ─── Schema bootstrap — run once per process, not once per request ───────
// ensureNsoReportsSchema() previously re-ran its full ALTER TABLE / ADD INDEX
// loop on every single dashboard request. Same "run once, cache the promise"
// fix already applied to nsoRoutes.js's ensureNsoTable().
let ensureNsoReportsSchemaPromise = null;
async function ensureNsoReportsSchema() {
  if (!ensureNsoReportsSchemaPromise) {
    ensureNsoReportsSchemaPromise = ensureNsoReportsSchemaOnce().catch((error) => {
      ensureNsoReportsSchemaPromise = null;
      throw error;
    });
  }
  return ensureNsoReportsSchemaPromise;
}

async function ensureNsoReportsSchemaOnce() {
  await query(`
    CREATE TABLE IF NOT EXISTS nso_reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      file_id INT NULL,
      circle VARCHAR(255) NULL,
      cmp VARCHAR(255) NULL,
      week VARCHAR(50) NULL,
      year VARCHAR(50) NULL,
      month VARCHAR(50) NULL,
      ticket_no VARCHAR(255) NULL,
      mttr DECIMAL(10,2) NULL,
      report_date DATE NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const columns = [
    ["circle", "VARCHAR(255) NULL"],
    ["cmp", "VARCHAR(255) NULL"],
    ["week", "VARCHAR(50) NULL"],
    ["year", "VARCHAR(50) NULL"],
    ["month", "VARCHAR(50) NULL"],
    ["ticket_no", "VARCHAR(255) NULL"],
    ["mttr", "DECIMAL(10,2) NULL"],
    ["report_date", "DATE NULL"],
    ["created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"],
  ];

  for (const [column, definition] of columns) {
    try {
      await query(`ALTER TABLE nso_reports ADD COLUMN ${column} ${definition}`);
    } catch (error) {
      if (error?.code !== "ER_DUP_FIELDNAME") {
        throw error;
      }
    }
  }

  const indexes = [
    ["idx_nso_circle", "circle"],
    ["idx_nso_cmp", "cmp"],
    ["idx_nso_year", "year"],
    ["idx_nso_month", "month"],
    ["idx_nso_week", "week"],
    ["idx_nso_report_date", "report_date"],
    // Composite index for the dominant GROUP BY pattern used throughout this
    // file (circle+cmp+year+week) — only single-column indexes existed before.
    ["idx_nso_circle_cmp_year_week", "circle, cmp, year, week"],
  ];

  for (const [indexName, columnExpr] of indexes) {
    try {
      await query(`ALTER TABLE nso_reports ADD INDEX ${indexName} (${columnExpr})`);
    } catch (error) {
      if (error?.code !== "ER_DUP_KEYNAME") {
        throw error;
      }
    }
  }
}

// ─── KPI summary ───────────────────────────────────────────────────────────

async function getSummary(req) {
  const { params, filters } = await buildScopedFilters(req);

  const [{ totalCuts = 0, avgMTTR = 0, activeCircles = 0, totalScopes = 0 }] =
    await query(
      `SELECT
         COUNT(*) AS totalCuts,
         ROUND(AVG(mttr),2) AS avgMTTR,
         COUNT(DISTINCT circle) AS activeCircles,
         COUNT(DISTINCT cmp) AS totalScopes
       FROM nso_reports
       WHERE 1=1 ${filters}`,
      params
    );

  // Total FTKM = sum of each circle's own correctly-computed FTKM (each
  // circle's total cuts over its own Base FTKM total) — never a sum of
  // per-scope FTKM rates, which would double-normalize and be wrong (see
  // computeFtkm's doc comment).
  const circleCuts = await query(
    `SELECT circle, COUNT(*) AS cuts
     FROM nso_reports
     WHERE 1=1 ${filters}
     GROUP BY circle`,
    params
  );
  let totalFTKM = 0;
  let anyFtkmKnown = false;
  circleCuts.forEach((row) => {
    const baseTotal = getCircleBaseFtkmTotal(row.circle);
    const ftkm = computeFtkm(row.cuts, baseTotal);
    if (ftkm !== null) {
      anyFtkmKnown = true;
      totalFTKM += ftkm;
    }
  });

  return {
    totalCuts: safeNumber(totalCuts),
    totalFTKM: anyFtkmKnown ? round2(totalFTKM) : null,
    avgMTTR: round2(avgMTTR),
    activeCircles: safeNumber(activeCircles),
    totalScopes: safeNumber(totalScopes),
  };
}

// ─── Trend charts (Cuts / FTKM / MTTR, weekly) ────────────────────────────

async function getCutsTrend(req) {
  const { params, filters, weekPairs } = await buildScopedFilters(req);
  const rows = await query(
    `SELECT year, week, COUNT(*) AS cuts
     FROM nso_reports
     WHERE 1=1 ${filters}
     GROUP BY year, week`,
    params
  );
  return sortByWeek(rows, weekPairs).map((row) => ({
    week: formatWeekLabel(row.year, row.week),
    cuts: safeNumber(row.cuts),
  }));
}

async function getMttrTrend(req) {
  const { params, filters, weekPairs } = await buildScopedFilters(req);
  const rows = await query(
    `SELECT year, week, ROUND(AVG(mttr),2) AS mttr
     FROM nso_reports
     WHERE 1=1 ${filters}
     GROUP BY year, week`,
    params
  );
  return sortByWeek(rows, weekPairs).map((row) => ({
    week: formatWeekLabel(row.year, row.week),
    mttr: round2(row.mttr),
  }));
}

async function getFtkmTrend(req) {
  const { params, filters, weekPairs } = await buildScopedFilters(req);
  // FTKM has no per-row column — need cuts broken down by circle *and* week
  // so each circle's own Base FTKM total can be applied before summing.
  const rows = await query(
    `SELECT year, week, circle, COUNT(*) AS cuts
     FROM nso_reports
     WHERE 1=1 ${filters}
     GROUP BY year, week, circle`,
    params
  );

  const byWeek = new Map();
  rows.forEach((row) => {
    const key = `${row.year}::${row.week}`;
    if (!byWeek.has(key)) byWeek.set(key, { year: row.year, week: row.week, ftkm: 0, anyKnown: false });
    const bucket = byWeek.get(key);
    const baseTotal = getCircleBaseFtkmTotal(row.circle);
    const ftkm = computeFtkm(row.cuts, baseTotal);
    if (ftkm !== null) {
      bucket.ftkm += ftkm;
      bucket.anyKnown = true;
    }
  });

  const merged = Array.from(byWeek.values());
  return sortByWeek(merged, weekPairs).map((row) => ({
    week: formatWeekLabel(row.year, row.week),
    ftkm: row.anyKnown ? round2(row.ftkm) : null,
  }));
}

// Sorts rows chronologically by (year, week). If a week-range was requested,
// restricts to exactly that range and order (so charts show only — and
// exactly — the selected weeks); otherwise shows every week present, oldest
// to newest, matching the previous behavior of a bounded trailing window
// without hardcoding a week count.
function sortByWeek(rows, weekPairs) {
  const withKeys = rows.map((row) => ({
    ...row,
    sortKey: weekSortKey(row.year, row.week),
  }));
  if (weekPairs && weekPairs.length) {
    const allowed = new Set(weekPairs.map((w) => w.sortKey));
    return withKeys
      .filter((row) => allowed.has(row.sortKey))
      .sort((a, b) => a.sortKey - b.sortKey);
  }
  return withKeys.sort((a, b) => a.sortKey - b.sortKey);
}

// ─── Circle-wise donuts (Cuts / FTKM distribution) + Top 5 MTTR ──────────

async function getCutsByCircle(req) {
  const { params, filters } = await buildScopedFilters(req);
  const rows = await query(
    `SELECT COALESCE(NULLIF(TRIM(circle), ''), 'Unknown') AS circle, COUNT(*) AS cuts
     FROM nso_reports
     WHERE 1=1 ${filters}
     GROUP BY circle
     ORDER BY cuts DESC`,
    params
  );
  const total = rows.reduce((sum, row) => sum + safeNumber(row.cuts), 0);
  return rows.map((row) => ({
    circle: row.circle,
    cuts: safeNumber(row.cuts),
    percentage: total ? round2((safeNumber(row.cuts) / total) * 100) : 0,
  }));
}

async function getFtkmByCircle(req) {
  const { params, filters } = await buildScopedFilters(req);
  const rows = await query(
    `SELECT COALESCE(NULLIF(TRIM(circle), ''), 'Unknown') AS circle, COUNT(*) AS cuts
     FROM nso_reports
     WHERE 1=1 ${filters}
     GROUP BY circle
     ORDER BY cuts DESC`,
    params
  );
  const withFtkm = rows.map((row) => ({
    circle: row.circle,
    ftkm: computeFtkm(row.cuts, getCircleBaseFtkmTotal(row.circle)),
  }));
  const total = withFtkm.reduce((sum, row) => sum + (row.ftkm || 0), 0);
  return withFtkm
    .filter((row) => row.ftkm !== null)
    .sort((a, b) => b.ftkm - a.ftkm)
    .map((row) => ({
      circle: row.circle,
      ftkm: round2(row.ftkm),
      percentage: total ? round2((row.ftkm / total) * 100) : 0,
    }));
}

async function getTopMttrByCircle(req, limit = 5) {
  const { params, filters } = await buildScopedFilters(req);
  const rows = await query(
    `SELECT COALESCE(NULLIF(TRIM(circle), ''), 'Unknown') AS circle, ROUND(AVG(mttr),2) AS mttr
     FROM nso_reports
     WHERE 1=1 ${filters}
     GROUP BY circle
     ORDER BY mttr DESC
     LIMIT ${Number(limit) || 5}`,
    params
  );
  return rows.map((row) => ({
    circle: row.circle,
    mttr: round2(row.mttr),
  }));
}

// Kept for the export workbook's "Circle Ranking" sheet (pre-existing
// feature) — not surfaced as its own section in the redesigned UI, which
// uses the donuts + Top-5-MTTR bar for this same circle-level view instead.
async function getCircleRanking(req) {
  const { params, filters } = await buildScopedFilters(req);
  const rows = await query(
    `SELECT
       COALESCE(NULLIF(TRIM(circle), ''), 'Unknown') AS circle,
       COUNT(*) AS cuts,
       ROUND(AVG(mttr),2) AS mttr
     FROM nso_reports
     WHERE 1=1 ${filters}
     GROUP BY circle
     ORDER BY cuts DESC, circle ASC`,
    params
  );

  return rows.map((row) => {
    const ftkm = computeFtkm(row.cuts, getCircleBaseFtkmTotal(row.circle));
    return {
      circle: row.circle,
      cuts: safeNumber(row.cuts),
      ftkm: ftkm === null ? null : round2(ftkm),
      mttr: round2(row.mttr),
      status: row.mttr < 3 ? "Good" : row.mttr <= 5 ? "Warning" : "Critical",
    };
  });
}

// ─── Fiber Performance Details by CMP & Scope (the main detail table) ────
// One row per (circle="CMP", cmp="Scope"), with a nested per-week
// {cuts, ftkm, mttr} breakdown, a circle-level TOTAL row, and a grand total.
// MTTR at every rollup level is AVG(mttr) computed directly from the
// underlying ticket rows for that level — never an average of sub-row
// averages. FTKM at every rollup level is computeFtkm(that level's own total
// cuts, that level's own Base FTKM total) — never a sum of sub-row FTKM
// rates (verified: Delhi's Wk-19 "DL TOTAL" FTKM of 18.85 in the reference
// image comes from ((56/7)*31)/13153.05*1000, not from summing the 4
// individual scopes' FTKM values, which would give a different number).

async function getCmpScopeDetails(req) {
  const { params, filters, weekPairs } = await buildScopedFilters(req);

  const weeks = weekPairs && weekPairs.length
    ? weekPairs
    : await getSortedWeeks(req);
  const weekLabels = weeks.map((w) => formatWeekLabel(w.year, w.week));

  // Per (circle, cmp, year, week): cuts + mttr, computed directly off rows.
  // `filters` (from buildScopedFilters) already restricts to the selected
  // week range via its own bound params — every query below reuses the same
  // `filters`/`params` pair for that reason, with no extra JS-side
  // week-filtering needed on top.
  const rows = await query(
    `SELECT
       COALESCE(NULLIF(TRIM(circle), ''), 'Unknown') AS circle,
       COALESCE(NULLIF(TRIM(cmp), ''), 'Unknown') AS cmp,
       year, week,
       COUNT(*) AS cuts,
       ROUND(AVG(mttr),2) AS mttr
     FROM nso_reports
     WHERE 1=1 ${filters}
     GROUP BY circle, cmp, year, week`,
    params
  );

  // circle -> cmp -> week label -> { cuts, mttr }
  const byCircleScope = new Map();
  rows.forEach((row) => {
    if (!byCircleScope.has(row.circle)) byCircleScope.set(row.circle, new Map());
    const scopeMap = byCircleScope.get(row.circle);
    if (!scopeMap.has(row.cmp)) scopeMap.set(row.cmp, new Map());
    scopeMap.get(row.cmp).set(formatWeekLabel(row.year, row.week), {
      cuts: safeNumber(row.cuts),
      mttr: round2(row.mttr),
    });
  });

  // Circle+scope level MTTR "total" column also needs to be computed
  // directly from underlying rows across the selected weeks (not averaged
  // from the per-week averages) — fetch separately, grouped without `week`.
  const scopeTotals = await query(
    `SELECT
       COALESCE(NULLIF(TRIM(circle), ''), 'Unknown') AS circle,
       COALESCE(NULLIF(TRIM(cmp), ''), 'Unknown') AS cmp,
       COUNT(*) AS cuts,
       ROUND(AVG(mttr),2) AS mttr
     FROM nso_reports
     WHERE 1=1 ${filters}
     GROUP BY circle, cmp`,
    params
  );
  const scopeTotalMap = new Map(
    scopeTotals.map((row) => [`${row.circle}::${row.cmp}`, row])
  );

  const circleTotals = await query(
    `SELECT
       COALESCE(NULLIF(TRIM(circle), ''), 'Unknown') AS circle,
       COUNT(*) AS cuts,
       ROUND(AVG(mttr),2) AS mttr
     FROM nso_reports
     WHERE 1=1 ${filters}
     GROUP BY circle`,
    params
  );
  const circleTotalMap = new Map(circleTotals.map((row) => [row.circle, row]));

  // Circle-level weekly MTTR needs its own query grouped by (circle, week)
  // only — averaging the per-scope weekly averages would bias toward
  // low-cut scopes, same reason the circle TOTAL above is a fresh query
  // rather than an average of scopeTotals.
  const circleWeeklyMttrRows = await query(
    `SELECT
       COALESCE(NULLIF(TRIM(circle), ''), 'Unknown') AS circle,
       year, week,
       ROUND(AVG(mttr),2) AS mttr
     FROM nso_reports
     WHERE 1=1 ${filters}
     GROUP BY circle, year, week`,
    params
  );
  const circleWeeklyMttrMap = new Map(); // circle -> weekLabel -> mttr
  circleWeeklyMttrRows.forEach((row) => {
    if (!circleWeeklyMttrMap.has(row.circle)) circleWeeklyMttrMap.set(row.circle, new Map());
    circleWeeklyMttrMap.get(row.circle).set(formatWeekLabel(row.year, row.week), round2(row.mttr));
  });

  const circles = Array.from(byCircleScope.entries()).map(([circle, scopeMap]) => {
    const scopes = Array.from(scopeMap.entries()).map(([cmp, weekMap]) => {
      const baseFtkm = getBaseFtkm(circle, cmp);
      const weeklyValues = weekLabels.map((label) => {
        const cell = weekMap.get(label) || { cuts: 0, mttr: 0 };
        const ftkm = computeFtkm(cell.cuts, baseFtkm);
        return { week: label, cuts: cell.cuts, ftkm: ftkm === null ? null : round2(ftkm), mttr: cell.mttr };
      });
      const totalRow = scopeTotalMap.get(`${circle}::${cmp}`) || { cuts: 0, mttr: 0 };
      const totalFtkm = computeFtkm(totalRow.cuts, baseFtkm);
      return {
        scope: cmp,
        baseFtkm,
        weeks: weeklyValues,
        totalCuts: safeNumber(totalRow.cuts),
        avgMttr: round2(totalRow.mttr),
        totalFtkm: totalFtkm === null ? null : round2(totalFtkm),
      };
    });

    const circleBaseFtkm = getCircleBaseFtkmTotal(circle);
    const totalRow = circleTotalMap.get(circle) || { cuts: 0, mttr: 0 };
    const totalFtkm = computeFtkm(totalRow.cuts, circleBaseFtkm);

    // Circle-level per-week totals, same "recompute the rate, don't sum
    // sub-rates" rule as the grand total.
    const weeklyCircleCuts = new Map();
    rows
      .filter((row) => row.circle === circle)
      .forEach((row) => {
        const label = formatWeekLabel(row.year, row.week);
        weeklyCircleCuts.set(label, (weeklyCircleCuts.get(label) || 0) + safeNumber(row.cuts));
      });
    const circleWeekMttrMap = circleWeeklyMttrMap.get(circle) || new Map();
    const weeklyTotals = weekLabels.map((label) => {
      const cuts = weeklyCircleCuts.get(label) || 0;
      const ftkm = computeFtkm(cuts, circleBaseFtkm);
      const mttr = circleWeekMttrMap.has(label) ? circleWeekMttrMap.get(label) : null;
      return { week: label, cuts, ftkm: ftkm === null ? null : round2(ftkm), mttr };
    });

    return {
      circle,
      baseFtkm: circleBaseFtkm,
      scopes: scopes.sort((a, b) => a.scope.localeCompare(b.scope)),
      weeklyTotals,
      totalCuts: safeNumber(totalRow.cuts),
      avgMttr: round2(totalRow.mttr),
      totalFtkm: totalFtkm === null ? null : round2(totalFtkm),
    };
  });

  const grand = await query(
    `SELECT COUNT(*) AS cuts, ROUND(AVG(mttr),2) AS mttr FROM nso_reports WHERE 1=1 ${filters}`,
    params
  );
  const grandRow = grand[0] || { cuts: 0, mttr: 0 };
  const grandBaseFtkm = circles.reduce((sum, c) => sum + (c.baseFtkm || 0), 0) || null;
  const grandFtkm = computeFtkm(grandRow.cuts, grandBaseFtkm);

  return {
    weeks: weekLabels,
    circles: circles.sort((a, b) => a.circle.localeCompare(b.circle)),
    grandTotalCuts: safeNumber(grandRow.cuts),
    grandAvgMttr: round2(grandRow.mttr),
    grandTotalFtkm: grandFtkm === null ? null : round2(grandFtkm),
  };
}

// ─── Filter option lists ──────────────────────────────────────────────────

async function getFilters(req) {
  const params = [];
  const filters = buildFilterClauses(req, params);

  const circleRows = await query(
    `SELECT DISTINCT TRIM(circle) AS value
     FROM nso_reports
     WHERE circle IS NOT NULL AND TRIM(circle) <> '' ${filters}
     ORDER BY value ASC`,
    params
  );

  const cmpRows = await query(
    `SELECT DISTINCT TRIM(cmp) AS value
     FROM nso_reports
     WHERE cmp IS NOT NULL AND TRIM(cmp) <> '' ${filters}
     ORDER BY value ASC`,
    params
  );

  const yearRows = await query(
    `SELECT DISTINCT TRIM(year) AS value
     FROM nso_reports
     WHERE year IS NOT NULL AND TRIM(year) <> '' ${filters}
     ORDER BY value DESC`,
    params
  );

  const monthRows = await query(
    `SELECT DISTINCT TRIM(month) AS value
     FROM nso_reports
     WHERE month IS NOT NULL AND TRIM(month) <> '' ${filters}
     ORDER BY value ASC`,
    params
  );

  const weeks = await getSortedWeeks(req);

  return {
    circles: circleRows.map((row) => row.value),
    cmps: cmpRows.map((row) => row.value),
    years: yearRows.map((row) => row.value),
    months: monthRows.map((row) => row.value),
    // Full chronologically-sorted week list, each carrying its raw
    // (year, week) so the frontend's Week Range dropdown can send them back
    // unambiguously via resolveWeekRange() rather than re-parsing a label.
    weeks: weeks.map((w) => ({ year: w.year, week: w.week, label: w.label })),
  };
}

// ─── Export workbook ───────────────────────────────────────────────────────

async function buildExportWorkbook(req) {
  const [summary, ranking, details] = await Promise.all([
    getSummary(req),
    getCircleRanking(req),
    getCmpScopeDetails(req),
  ]);

  const workbook = new ExcelJS.Workbook();
  const summarySheet = workbook.addWorksheet("KPI Summary");
  summarySheet.columns = [
    { header: "Metric", key: "metric", width: 28 },
    { header: "Value", key: "value", width: 18 },
  ];
  summarySheet.addRows([
    { metric: "Total Cuts", value: summary.totalCuts },
    { metric: "Total FTKM", value: summary.totalFTKM ?? "N/A" },
    { metric: "Average MTTR", value: summary.avgMTTR },
    { metric: "Active CMPs", value: summary.activeCircles },
    { metric: "Total Scopes", value: summary.totalScopes },
  ]);

  const rankingSheet = workbook.addWorksheet("Circle Ranking");
  rankingSheet.columns = [
    { header: "CMP (Circle)", key: "circle", width: 24 },
    { header: "Cuts", key: "cuts", width: 12 },
    { header: "FTKM", key: "ftkm", width: 14 },
    { header: "MTTR", key: "mttr", width: 14 },
    { header: "Status", key: "status", width: 14 },
  ];
  rankingSheet.addRows(ranking.map((row) => ({ ...row, ftkm: row.ftkm ?? "N/A" })));

  const detailsSheet = workbook.addWorksheet("CMP & Scope Weekly Details");
  const columns = [
    { header: "CMP", key: "cmp", width: 20 },
    { header: "Scope", key: "scope", width: 26 },
    { header: "Base FTKM", key: "baseFtkm", width: 14 },
  ];
  details.weeks.forEach((week) => {
    columns.push({ header: `${week} Cuts`, key: `${week}_cuts`, width: 12 });
    columns.push({ header: `${week} FTKM`, key: `${week}_ftkm`, width: 14 });
    columns.push({ header: `${week} MTTR`, key: `${week}_mttr`, width: 14 });
  });
  columns.push({ header: "Total Cuts", key: "totalCuts", width: 14 });
  columns.push({ header: "Avg MTTR", key: "avgMttr", width: 14 });
  detailsSheet.columns = columns;

  details.circles.forEach((circleRow) => {
    circleRow.scopes.forEach((scopeRow) => {
      const record = {
        cmp: circleRow.circle,
        scope: scopeRow.scope,
        baseFtkm: scopeRow.baseFtkm ?? "N/A",
        totalCuts: scopeRow.totalCuts,
        avgMttr: scopeRow.avgMttr,
      };
      scopeRow.weeks.forEach((week) => {
        record[`${week.week}_cuts`] = week.cuts;
        record[`${week.week}_ftkm`] = week.ftkm ?? "N/A";
        record[`${week.week}_mttr`] = week.mttr;
      });
      detailsSheet.addRow(record);
    });

    const totalRecord = {
      cmp: circleRow.circle,
      scope: `${circleRow.circle} TOTAL`,
      baseFtkm: circleRow.baseFtkm ?? "N/A",
      totalCuts: circleRow.totalCuts,
      avgMttr: circleRow.avgMttr,
    };
    circleRow.weeklyTotals.forEach((week) => {
      totalRecord[`${week.week}_cuts`] = week.cuts;
      totalRecord[`${week.week}_ftkm`] = week.ftkm ?? "N/A";
      totalRecord[`${week.week}_mttr`] = "";
    });
    const totalRow = detailsSheet.addRow(totalRecord);
    totalRow.font = { bold: true };
  });

  return workbook;
}

module.exports = {
  ensureNsoReportsSchema,
  getSummary,
  getCutsTrend,
  getMttrTrend,
  getFtkmTrend,
  getCutsByCircle,
  getFtkmByCircle,
  getTopMttrByCircle,
  getCircleRanking,
  getCmpScopeDetails,
  getFilters,
  buildExportWorkbook,
  // exported for tests / reuse
  formatWeekLabel,
  weekSortKey,
  computeFtkm,
};
