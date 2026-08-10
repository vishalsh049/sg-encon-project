const express = require("express");
const router = express.Router();

const { db } = require("../config/db");
const { isAllCircle } = require("../middleware/circleAccess");
const { buildCircleCmpFilter, buildRangeSql } = require("../utils/uptimeDateRange");
const { getKpiTableSchemas } = require("../utils/kpiSchemaCache");
const { getCachedValue, setCachedValue } = require("../services/physicalDomainService");

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });

const KPI_TABLES = ["ag1", "enb", "esc", "gnb", "osc", "hpodsc"];

// /tower-uptime and /tower-uptime/analytics each aggregate up to a few
// million rows across 6 tables on every request — with no response cache,
// every page load and every filter click re-ran all of that live. A short
// shared-across-users cache absorbs repeat/identical requests (the common
// case) while an explicit Refresh click still bypasses it via `noCache=1`.
const KPI_CACHE_TTL_MS = 60 * 1000;

function kpiCacheScopeKey(req, queryKeys) {
  const query = {};
  queryKeys.forEach((key) => { query[key] = req.query[key] || ""; });
  return {
    circle: isAllCircle(req.authUser) ? "ALL" : String(req.authUser?.circle || "").trim().toLowerCase(),
    query,
  };
}

const normalizeUptimeValue = (value) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  // Values are displayed exactly as stored (0, 0.1, 0.5, 1.0, ...). Marker
  // tables like AG1 (kpi_value = 1 per row) are converted to percent in SQL
  // via buildKpiValueSql, not rescaled here.
  return Number(numericValue.toFixed(2));
};

// Builds the SQL expression for a row's uptime value. Marker tables (markerKpi)
// store kpi_value = 1 per site for counting; their real uptime lives in the
// `availability` column (added 2026-07). Old rows without it fall back to
// kpi_value * 100, matching the historical 100% display.
const buildKpiValueSql = ({ markerKpi, kpiColumn, columnNames }) => {
  if (markerKpi) {
    const availabilityCol = findColumn(columnNames, "availability");
    return availabilityCol
      ? `COALESCE(CAST(REPLACE(\`${availabilityCol}\`, '%', '') AS DECIMAL(12,4)), kpi_value * 100)`
      : "kpi_value * 100";
  }
  return `CAST(REPLACE(\`${kpiColumn}\`, '%', '') AS DECIMAL(12,4))`;
};

// information_schema reports column names in their stored case, which varies
// per table (`Date` vs `date`). Every lookup below must be case-insensitive or
// a table using a different case silently loses its date/KPI column and the
// card is dropped from the response.
const findColumn = (columnNames, wanted) =>
  (columnNames || []).find((c) => c.toLowerCase() === String(wanted).toLowerCase()) || null;

const hasColumn = (columnNames, wanted) => findColumn(columnNames, wanted) !== null;

// First of `candidates` that actually exists, in priority order. Returns the
// real (correctly-cased) column name so it can be used directly in SQL.
const pickColumn = (columnNames, candidates) => {
  for (const candidate of candidates) {
    const match = findColumn(columnNames, candidate);
    if (match) return match;
  }
  return null;
};

// Single source of truth for every KPI table. Both /tower-uptime and
// /tower-uptime/analytics read this, so a card and its drill-down popup can
// never disagree about which column holds the uptime value.
const SITE_TABLES = [
  {
    name: "AG1",
    table: "ag1",
    color: "blue",
    markerKpi: true,
    possibleColumns: ["kpi_value", "availability"],
  },
  {
    name: "ENB",
    table: "enb",
    color: "emerald",
    possibleColumns: ["availability", "kpi_value"],
  },
  {
    name: "ESC",
    table: "esc",
    color: "violet",
    possibleColumns: ["total_availability", "kpi_value", "availability"],
  },
  {
    name: "GNB",
    table: "gnb",
    color: "orange",
    // `availability` is GNB's real uptime percentage; kpi_value is only a
    // fallback for legacy rows. Priority must match the analytics endpoint or
    // the card and its drill-down popup report different numbers.
    possibleColumns: ["availability", "kpi_value"],
  },
  {
    name: "OSC",
    table: "osc",
    color: "cyan",
    possibleColumns: ["availability", "kpi_value"],
  },
  {
    name: "HPODSC",
    table: "hpodsc",
    color: "rose",
    possibleColumns: ["total_availability", "kpi_value", "availability"],
  },
];

const POSSIBLE_DATE_COLUMNS = ["date", "report_date", "created_at", "timestamp"];

// Every "no data" exit from the analytics endpoint returns this exact shape so
// the client never has to guard for missing keys.
const EMPTY_ANALYTICS = Object.freeze({
  chartData: [],
  summary: { avg: 0, highest: 0, lowest: 0, total: 0, trend: "stable" },
  circles: [],
  cmps: [],
  groupBy: "circle",
});

// Builds one KPI card. Runs the aggregate query and the cmp-list query in
// parallel; returns null when the table/columns are missing or errored so the
// caller can filter it out (same behavior as the old sequential loop).
async function buildTowerCard(site, columnNames, req) {
  try {
    if (!columnNames) {
      console.log(`Table not found: ${site.table}`);
      return null;
    }

    const kpiColumn = pickColumn(columnNames, site.possibleColumns);
    if (!kpiColumn) {
      console.log(`No KPI column found in ${site.table}`);
      return null;
    }

    const dateColumn = pickColumn(columnNames, POSSIBLE_DATE_COLUMNS);
    if (!dateColumn) {
      console.log(`No date column found in ${site.table}`);
      return null;
    }

    const hasCircleColumn = hasColumn(columnNames, "circle");
    const hasCmpColumn = hasColumn(columnNames, "cmp");

    const selectedCircle = req.query.circle || "";
    const selectedCmp    = req.query.cmp    || "";
    const selectedRange  = req.query.range  || "last7";
    const rangeFrom      = req.query.from   || "";
    const rangeTo        = req.query.to     || "";

    // Switch to CMP-wise grouping when a specific circle is selected and cmp column exists
    const groupByCmp = selectedCircle !== "" && hasCmpColumn;

    const { conditions: whereConditions, params } = buildCircleCmpFilter({
      authUser: req.authUser,
      hasCircleCol: hasCircleColumn,
      hasCmpCol: hasCmpColumn,
      selectedCircle,
      selectedCmp,
    });

    const whereClause = whereConditions.length > 0
      ? "AND " + whereConditions.join(" AND ")
      : "";

    const { sql: rangeSql, params: rangeParams } = buildRangeSql({
      range: selectedRange,
      table: site.table,
      dateColumn,
      filterWhereSql: whereClause,
      filterParams: params,
      from: rangeFrom,
      to: rangeTo,
    });

    // Build entity SELECT / GROUP expressions based on grouping mode
    let entitySelectSql, entityGroupSql;
    if (groupByCmp) {
      entitySelectSql = `TRIM(cmp) AS entity,`;
      entityGroupSql  = `, TRIM(cmp)`;
    } else if (hasCircleColumn) {
      entitySelectSql = `TRIM(circle) AS entity,`;
      entityGroupSql  = `, TRIM(circle)`;
    } else {
      entitySelectSql = `'Overall' AS entity,`;
      entityGroupSql  = ``;
    }

    const orderEntitySql = entityGroupSql ? entityGroupSql + " ASC" : "";

    const kpiValueSql = buildKpiValueSql({
      markerKpi: site.markerKpi,
      kpiColumn,
      columnNames,
    });

    const rows = await query(`
      SELECT
        DATE_FORMAT(${dateColumn}, '%Y-%m-%d') AS report_date,
        ${entitySelectSql}
        ROUND(AVG(${kpiValueSql}), 2) AS uptime
      FROM ${site.table}
      WHERE ${rangeSql}
      ${whereClause}
      GROUP BY DATE(${dateColumn})${entityGroupSql}
      ORDER BY DATE(${dateColumn}) ASC${orderEntitySql}
    `, [...rangeParams, ...params]);

    const normalizedRows = rows.map((row) => ({
      ...row,
      uptime: normalizeUptimeValue(row.uptime),
    }));

    // Group flat rows into { date → { entity → uptime } }
    const rawGrouped = {};
    const entitySet  = new Set();
    for (const row of normalizedRows) {
      if (!rawGrouped[row.report_date]) rawGrouped[row.report_date] = {};
      const e = (row.entity || "Overall").trim();
      if (e) { entitySet.add(e); rawGrouped[row.report_date][e] = Number(row.uptime || 0); }
    }

    const allDateKeys = Object.keys(rawGrouped).sort();

    // Build chart data from dates that actually have records — no
    // zero-filled gap days, since `range` now spans anywhere from a
    // single day (today) to 30 days or an arbitrary custom span.
    const chartData = allDateKeys.map((dateKey) => {
      const d = new Date(`${dateKey}T00:00:00`);
      const label = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      return { date: label, ...rawGrouped[dateKey] };
    });

    const entities = Array.from(entitySet).sort();

    // Headline % is the mean of every (date, entity) cell actually plotted, so
    // the number on the card is always the average of the chart beside it.
    const allVals = Object.values(rawGrouped).flatMap(day => Object.values(day)).map(Number);

    const avg = allVals.length > 0
      ? (allVals.reduce((a, b) => a + b, 0) / allVals.length).toFixed(2)
      : "0.00";

    return {
      name:     site.name,
      uptime:   `${avg}%`,
      color:    site.color,
      chartData,
      entities,
      dataPoints: allVals.length,
      groupBy:  groupByCmp ? "cmp" : "circle",
    };
  } catch (siteError) {
    console.log(`Error in ${site.table}:`, siteError.sqlMessage || siteError.message);
    return null;
  }
}

router.get("/tower-uptime", async (req, res) => {
  try {
    const cacheKey = kpiCacheScopeKey(req, ["circle", "cmp", "range", "from", "to"]);
    if (req.query.noCache !== "1") {
      const cached = getCachedValue("kpiTowerUptime", cacheKey);
      if (cached) return res.json(cached);
    }

    const schemas = await getKpiTableSchemas(KPI_TABLES);

    // All 6 KPI tables are independent — query them concurrently instead of
    // one after another. Promise.all preserves the card order.
    const cards = await Promise.all(
      SITE_TABLES.map((site) => buildTowerCard(site, schemas.get(site.table), req))
    );

    const payload = cards.filter(Boolean);
    setCachedValue("kpiTowerUptime", cacheKey, payload, KPI_CACHE_TTL_MS);
    res.json(payload);
  } catch (error) {
    console.log("Tower uptime error:", error.sqlMessage || error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tower uptime data",
    });
  }
});

// ─── Analytics endpoint ──────────────────────────────────────────────────────
router.get("/tower-uptime/analytics", async (req, res) => {
  try {
    const { kpi, circle, cmp, period, month, year, fromMonth, fromMonthYear, toMonth, toMonthYear, fromDate, toDate, quarter, quarterYear } = req.query;

    if (!kpi) {
      return res.status(400).json({ message: "kpi param required" });
    }

    const analyticsCacheKey = kpiCacheScopeKey(req, [
      "kpi", "circle", "cmp", "period", "month", "year",
      "fromMonth", "fromMonthYear", "toMonth", "toMonthYear",
      "fromDate", "toDate", "quarter", "quarterYear",
    ]);
    if (req.query.noCache !== "1") {
      const cachedAnalytics = getCachedValue("kpiTowerUptimeAnalytics", analyticsCacheKey);
      if (cachedAnalytics) return res.json(cachedAnalytics);
    }

    // Resolved from the same SITE_TABLES config the cards use, so the popup
    // can never pick a different uptime column than the card it opened from.
    const config = SITE_TABLES.find((s) => s.name === String(kpi).toUpperCase());
    if (!config) {
      return res.status(400).json({ message: "Invalid KPI type" });
    }

    const { table } = config;

    const schemas = await getKpiTableSchemas(KPI_TABLES);
    const columnNames = schemas.get(table);
    if (!columnNames) {
      return res.json(EMPTY_ANALYTICS);
    }

    const kpiColumn = pickColumn(columnNames, config.possibleColumns);
    if (!kpiColumn) {
      return res.json(EMPTY_ANALYTICS);
    }

    const hasCircleCol = hasColumn(columnNames, "circle");
    const hasCmpCol    = hasColumn(columnNames, "cmp");

    // Must use the same resolver as the cards — hardcoding "date"/"created_at"
    // silently produced an Unknown-column error on tables storing it as `Date`.
    const dateColumn = pickColumn(columnNames, POSSIBLE_DATE_COLUMNS);
    if (!dateColumn) {
      return res.json(EMPTY_ANALYTICS);
    }
    const col = `\`${dateColumn}\``;

    // Circles / CMP option lists don't depend on the period — start them
    // immediately so they overlap with the maxDate lookup below.
    let circlesPromise = Promise.resolve([]);
    if (hasCircleCol) {
      let cq = `SELECT DISTINCT TRIM(circle) AS circle FROM \`${table}\` WHERE circle IS NOT NULL AND TRIM(circle) != ''`;
      const cqp = [];
      if (!isAllCircle(req.authUser)) {
        cq += ` AND LOWER(TRIM(circle)) = LOWER(TRIM(?))`;
        cqp.push(req.authUser.circle);
      }
      cq += ` ORDER BY circle`;
      circlesPromise = query(cq, cqp);
    }

    let cmpsPromise = Promise.resolve([]);
    if (hasCmpCol) {
      let mq = `SELECT DISTINCT TRIM(cmp) AS cmp FROM \`${table}\` WHERE cmp IS NOT NULL AND TRIM(cmp) != ''`;
      const mqp = [];
      if (!isAllCircle(req.authUser) && hasCircleCol) {
        mq += ` AND LOWER(TRIM(circle)) = LOWER(TRIM(?))`;
        mqp.push(req.authUser.circle);
      }
      if (circle && hasCircleCol) {
        mq += ` AND LOWER(TRIM(circle)) = LOWER(TRIM(?))`;
        mqp.push(circle);
      }
      mq += ` ORDER BY cmp`;
      cmpsPromise = query(mq, mqp);
    }

    // Determine latest date in the table (indexed MAX — fast)
    const [{ maxDate } = {}] = await query(
      `SELECT DATE(MAX(${col})) AS maxDate FROM \`${table}\``
    );

    // No dated rows at all — every period clause would degrade to `1=1` and
    // full-scan the table only to aggregate nothing. Return early instead.
    if (!maxDate) {
      const [cr0, mr0] = await Promise.all([circlesPromise, cmpsPromise]);
      return res.json({
        ...EMPTY_ANALYTICS,
        circles: cr0.map(r => r.circle).filter(Boolean),
        cmps:    mr0.map(r => r.cmp).filter(Boolean),
      });
    }

    // Build period WHERE clause. Every condition is a sargable half-open
    // range on the bare column (no DATE()/MONTH()/YEAR() wrappers) so the
    // date index is used. Row sets are identical to the previous expressions.
    const normalizedPeriod = period  || "last7";
    const normalizedYear   = year    ? Number(year)  : new Date().getFullYear();
    const normalizedMonth  = month   ? Number(month) : (new Date().getMonth() + 1);
    const pad2 = (n) => String(n).padStart(2, "0");

    let periodSql = "1=1";
    const periodParams = [];

    if (maxDate) {
      switch (normalizedPeriod) {
        case "last7":
          periodSql = `${col} >= DATE(?) - INTERVAL 6 DAY AND ${col} < DATE(?) + INTERVAL 1 DAY`;
          periodParams.push(maxDate, maxDate);
          break;
        case "last30":
          periodSql = `${col} >= DATE(?) - INTERVAL 29 DAY AND ${col} < DATE(?) + INTERVAL 1 DAY`;
          periodParams.push(maxDate, maxDate);
          break;
        case "current_month":
          periodSql = `${col} >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND ${col} < DATE_FORMAT(CURDATE(), '%Y-%m-01') + INTERVAL 1 MONTH`;
          break;
        case "prev_month":
          periodSql = `${col} >= DATE_FORMAT(CURDATE() - INTERVAL 1 MONTH, '%Y-%m-01') AND ${col} < DATE_FORMAT(CURDATE(), '%Y-%m-01')`;
          break;
        case "custom_month": {
          const monthStart = `${normalizedYear}-${pad2(normalizedMonth)}-01`;
          periodSql = `${col} >= ? AND ${col} < DATE(?) + INTERVAL 1 MONTH`;
          periodParams.push(monthStart, monthStart);
          break;
        }
        case "yearly": {
          const yearStart = `${normalizedYear}-01-01`;
          periodSql = `${col} >= ? AND ${col} < DATE(?) + INTERVAL 1 YEAR`;
          periodParams.push(yearStart, yearStart);
          break;
        }
        case "month_range": {
          const fmY = fromMonthYear ? Number(fromMonthYear) : normalizedYear;
          const fmM = fromMonth     ? Number(fromMonth)     : 1;
          const tmY = toMonthYear   ? Number(toMonthYear)   : normalizedYear;
          const tmM = toMonth       ? Number(toMonth)       : 12;
          periodSql = `${col} >= ? AND ${col} < LAST_DAY(?) + INTERVAL 1 DAY`;
          periodParams.push(
            `${fmY}-${pad2(fmM)}-01`,
            `${tmY}-${pad2(tmM)}-01`
          );
          break;
        }
        case "date_range": {
          const fDate = fromDate || new Date().toISOString().split("T")[0];
          const tDate = toDate   || fDate;
          periodSql = `${col} >= ? AND ${col} < DATE(?) + INTERVAL 1 DAY`;
          periodParams.push(fDate, tDate);
          break;
        }
        case "quarterly": {
          const qY = quarterYear ? Number(quarterYear) : normalizedYear;
          const q  = Math.min(4, Math.max(1, Number(quarter || Math.ceil((new Date().getMonth() + 1) / 3))));
          const qStart = `${qY}-${pad2((q - 1) * 3 + 1)}-01`;
          periodSql = `${col} >= ? AND ${col} < DATE(?) + INTERVAL 3 MONTH`;
          periodParams.push(qStart, qStart);
          break;
        }
        default:
          periodSql = `${col} >= DATE(?) - INTERVAL 6 DAY AND ${col} < DATE(?) + INTERVAL 1 DAY`;
          periodParams.push(maxDate, maxDate);
      }
    }

    // Build access + filter conditions
    const { conditions: filterConds, params: filterParams } = buildCircleCmpFilter({
      authUser: req.authUser,
      hasCircleCol,
      hasCmpCol,
      selectedCircle: circle,
      selectedCmp: cmp,
    });

    const allConds = [periodSql, ...filterConds].filter(Boolean);
    const whereClause = `WHERE ${allConds.join(" AND ")}`;
    const allParams   = [...periodParams, ...filterParams];

    // Group by month for yearly/month-range/quarterly; by date for all others
    const groupByMonth  = ["yearly", "month_range", "quarterly"].includes(normalizedPeriod);
    const groupByExpr   = groupByMonth
      ? `DATE_FORMAT(\`${dateColumn}\`, '%Y-%m')`
      : `DATE(\`${dateColumn}\`)`;
    const dateFormatSql = groupByMonth
      ? `DATE_FORMAT(\`${dateColumn}\`, '%Y-%m')`
      : `DATE_FORMAT(\`${dateColumn}\`, '%Y-%m-%d')`;

    // Switch to CMP-wise grouping when a specific circle is selected and cmp column exists
    const groupByCmp = !!circle && hasCmpCol;

    let entitySelectSql, entityGroupSql;
    if (groupByCmp) {
      entitySelectSql = `TRIM(cmp) AS entity,`;
      entityGroupSql  = `, TRIM(cmp)`;
    } else if (hasCircleCol) {
      entitySelectSql = `COALESCE(TRIM(circle), 'All') AS entity,`;
      entityGroupSql  = `, TRIM(circle)`;
    } else {
      entitySelectSql = `'All' AS entity,`;
      entityGroupSql  = ``;
    }

    const orderEntitySql = entityGroupSql ? entityGroupSql + " ASC" : "";

    const kpiValueSql = buildKpiValueSql({
      markerKpi: config.markerKpi,
      kpiColumn,
      columnNames,
    });

    // Chart data
    const chartSql = `
      SELECT
        ${dateFormatSql} AS date,
        ${entitySelectSql}
        ROUND(AVG(${kpiValueSql}), 2) AS uptime
      FROM \`${table}\`
      ${whereClause}
      GROUP BY ${groupByExpr}${entityGroupSql}
      ORDER BY ${groupByExpr} ASC${orderEntitySql}
    `;

    // Summary stats
    const summarySql = `
      SELECT
        ROUND(AVG(${kpiValueSql}), 2) AS avg_uptime,
        ROUND(MAX(${kpiValueSql}), 2) AS highest_uptime,
        ROUND(MIN(${kpiValueSql}), 2) AS lowest_uptime,
        COUNT(*) AS total_records
      FROM \`${table}\`
      ${whereClause}
    `;

    // Chart + summary + option lists all run concurrently
    const [chartRows, summaryRows, cr, mr] = await Promise.all([
      query(chartSql, allParams),
      query(summarySql, allParams),
      circlesPromise,
      cmpsPromise,
    ]);

    const summaryRow = summaryRows[0] || {};
    const circles = cr.map(r => r.circle).filter(Boolean);
    const cmps    = mr.map(r => r.cmp).filter(Boolean);

    // Normalize values and detect trend
    const normalizedRows = chartRows.map(row => ({
      ...row,
      uptime: normalizeUptimeValue(row.uptime),
    }));

    // Trend: compare first-half avg vs second-half avg across all circles combined
    const dateMap = {};
    normalizedRows.forEach(row => {
      if (!dateMap[row.date]) dateMap[row.date] = [];
      dateMap[row.date].push(Number(row.uptime || 0));
    });
    const dailyAvgs = Object.values(dateMap).map(vals =>
      vals.reduce((a, b) => a + b, 0) / vals.length
    );

    let trend = "stable";
    if (dailyAvgs.length >= 4) {
      const mid   = Math.floor(dailyAvgs.length / 2);
      const first = dailyAvgs.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
      const last  = dailyAvgs.slice(mid).reduce((a, b) => a + b, 0) / (dailyAvgs.length - mid);
      if (last > first + 0.05) trend = "up";
      else if (last < first - 0.05) trend = "down";
    }

    const analyticsPayload = {
      chartData: normalizedRows,
      summary: {
        avg:     normalizeUptimeValue(summaryRow.avg_uptime     || 0),
        highest: normalizeUptimeValue(summaryRow.highest_uptime || 0),
        lowest:  normalizeUptimeValue(summaryRow.lowest_uptime  || 0),
        total:   Number(summaryRow.total_records || 0),
        trend,
      },
      circles,
      cmps,
      groupBy: groupByCmp ? "cmp" : "circle",
    };
    setCachedValue("kpiTowerUptimeAnalytics", analyticsCacheKey, analyticsPayload, KPI_CACHE_TTL_MS);
    res.json(analyticsPayload);

  } catch (error) {
    console.error("Analytics error:", error.sqlMessage || error.message);
    res.status(500).json({
      message: "Failed to fetch analytics",
      chartData: [],
      summary: { avg: 0, highest: 0, lowest: 0, total: 0, trend: "stable" },
      circles: [],
      cmps: [],
    });
  }
});

// ─── Dedicated circle list endpoint ──────────────────────────────────────────
// The circle dropdown used to be derived from whichever cards came back, but
// selecting a circle flips every card to CMP-grouping — so on a reload with a
// circle already persisted the list came back empty and the user was stuck
// unable to see or change their own selection. This endpoint is independent of
// the current filters, so the list is always complete.
router.get("/tower-uptime/circles", async (req, res) => {
  try {
    const schemas = await getKpiTableSchemas(KPI_TABLES);

    const perTableCircles = await Promise.all(
      KPI_TABLES.map(async (table) => {
        try {
          const columnNames = schemas.get(table);
          if (!columnNames || !hasColumn(columnNames, "circle")) return [];

          const conditions = ["circle IS NOT NULL", "TRIM(circle) != ''"];
          const params = [];

          if (!isAllCircle(req.authUser)) {
            conditions.push("LOWER(TRIM(circle)) = LOWER(TRIM(?))");
            params.push(req.authUser.circle);
          }

          const rows = await query(
            `SELECT DISTINCT TRIM(circle) AS circle FROM \`${table}\` WHERE ${conditions.join(" AND ")}`,
            params
          );
          return rows.map((r) => r.circle).filter(Boolean);
        } catch (e) {
          console.log(`Circle fetch for ${table}:`, e.message);
          return [];
        }
      })
    );

    const circles = Array.from(new Set(perTableCircles.flat())).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );

    res.json({ circles });
  } catch (error) {
    console.error("Circle list error:", error.message);
    res.status(500).json({ circles: [] });
  }
});

// ─── Dedicated CMP list endpoint ─────────────────────────────────────────────
// Returns all unique, real CMP names across every KPI table.
// When ?circle= is provided, only CMPs belonging to that circle are returned.
router.get("/tower-uptime/cmps", async (req, res) => {
  try {
    const selectedCircle = req.query.circle || "";
    const schemas = await getKpiTableSchemas(KPI_TABLES);

    // Query all tables concurrently instead of sequentially
    const perTableCmps = await Promise.all(
      KPI_TABLES.map(async (table) => {
        try {
          const columnNames = schemas.get(table);
          if (!columnNames || !hasColumn(columnNames, "cmp")) return [];

          const hasCircleCol = hasColumn(columnNames, "circle");
          const conditions   = ["cmp IS NOT NULL", "TRIM(cmp) != ''"];
          const params       = [];

          if (!isAllCircle(req.authUser) && hasCircleCol) {
            conditions.push("LOWER(TRIM(circle)) = LOWER(TRIM(?))");
            params.push(req.authUser.circle);
          }

          if (selectedCircle && hasCircleCol) {
            conditions.push("LOWER(TRIM(circle)) = LOWER(TRIM(?))");
            params.push(selectedCircle);
          }

          const sql  = `SELECT DISTINCT TRIM(cmp) AS cmp FROM \`${table}\` WHERE ${conditions.join(" AND ")} ORDER BY cmp`;
          const rows = await query(sql, params);
          return rows.map((r) => r.cmp).filter(Boolean);
        } catch (e) {
          console.log(`CMP fetch for ${table}:`, e.message);
          return [];
        }
      })
    );

    const allCmps = new Set();
    perTableCmps.flat().forEach((cmp) => allCmps.add(cmp.trim()));

    res.json({ cmps: Array.from(allCmps).sort() });
  } catch (error) {
    console.error("CMP list error:", error.message);
    res.status(500).json({ cmps: [] });
  }
});

module.exports = router;
