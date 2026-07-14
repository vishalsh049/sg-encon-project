const express = require("express");
const router = express.Router();

const { db } = require("../config/db");
const { isAllCircle } = require("../middleware/circleAccess");
const { buildCircleCmpFilter, buildRangeSql } = require("../utils/uptimeDateRange");

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });

const normalizeUptimeValue = (value, scaleFraction = false) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  // Only tables that store uptime as a 0-1 marker (e.g. AG1 inserts a literal 1
  // per row) opt into rescaling. Real availability uploads (OSC, HPODSC, ...)
  // must keep 0, 0.1, 0.5, 1.0 exactly as uploaded.
  if (scaleFraction && numericValue > 0 && numericValue <= 1) {
    return Number((numericValue * 100).toFixed(2));
  }

  return Number(numericValue.toFixed(2));
};

router.get("/tower-uptime", async (req, res) => {

  try {

    const siteTables = [

      {
        name: "AG1",
        table: "ag1",
        color: "blue",
        scaleFraction: true,
        possibleColumns: [
          "kpi_value",
          "availability",
        ],
      },

      {
        name: "ENB",
        table: "enb",
        color: "emerald",
        possibleColumns: [
          "availability",
          "kpi_value",
        ],
      },

    {
  name: "ESC",
  table: "esc",
  color: "violet",
  possibleColumns: [
    "total_availability",
    "kpi_value",
    "availability",
  ],
},

      {
        name: "GNB",
        table: "gnb",
        color: "orange",
        possibleColumns: [
          "kpi_value",
          "availability",
        ],
      },

      {
        name: "OSC",
        table: "osc",
        color: "cyan",
        possibleColumns: [
          "availability",
          "kpi_value",
        ],
      },

    {
  name: "HPODSC",
  table: "hpodsc",
  color: "rose",
  possibleColumns: [
    "total_availability",
    "kpi_value",
    "availability",
  ],
},

    ];

    const finalData = [];

    for (const site of siteTables) {

      try {

        // CHECK TABLE EXISTS

        const tableCheck = await query(`
          SHOW TABLES LIKE '${site.table}'
        `);

        if (tableCheck.length === 0) {

          console.log(
            `Table not found: ${site.table}`
          );

          continue;

        }

        // GET TABLE COLUMNS

        const columns = await query(`
          SHOW COLUMNS FROM ${site.table}
        `);

        const columnNames =
          columns.map((c) => c.Field);

        // AUTO DETECT KPI COLUMN

        const kpiColumn =
          site.possibleColumns.find((c) =>
            columnNames.includes(c)
          );

        if (!kpiColumn) {

          console.log(
            `No KPI column found in ${site.table}`
          );

          continue;

        }

        // AUTO DETECT DATE COLUMN

     const possibleDateColumns = [
  "Date",
  "date",
  "created_at",
  "report_date",
  "timestamp",
];

        const dateColumn =
          possibleDateColumns.find((c) =>
            columnNames.includes(c)
          );

        if (!dateColumn) {

          console.log(
            `No date column found in ${site.table}`
          );

          continue;

        }

        // MAIN QUERY
        const hasCircleColumn = columnNames.includes("circle");
        const hasCmpColumn = columnNames.includes("cmp");

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

        const rows = await query(`
          SELECT
            DATE_FORMAT(${dateColumn}, '%Y-%m-%d') AS report_date,
            ${entitySelectSql}
            ROUND(AVG(CAST(REPLACE(${kpiColumn}, '%', '') AS DECIMAL(10,2))), 2) AS uptime
          FROM ${site.table}
          WHERE ${rangeSql}
          ${whereClause}
          GROUP BY DATE(${dateColumn})${entityGroupSql}
          ORDER BY DATE(${dateColumn}) ASC${orderEntitySql}
        `, [...rangeParams, ...params]);

        const normalizedRows = rows.map((row) => ({
          ...row,
          uptime: normalizeUptimeValue(row.uptime, site.scaleFraction),
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
                let cmps = [];

if (hasCmpColumn) {
  const cmpRows = await query(`
    SELECT DISTINCT TRIM(cmp) AS cmp
    FROM ${site.table}
    WHERE cmp IS NOT NULL
      AND TRIM(cmp) <> ''
    ${selectedCircle ? "AND LOWER(TRIM(circle)) = LOWER(TRIM(?))" : ""}
    ORDER BY cmp
  `, selectedCircle ? [selectedCircle] : []);

  cmps = cmpRows.map(r => r.cmp);
}
        const allVals = Object.values(rawGrouped).flatMap(day => Object.values(day)).map(Number);

        const avg = allVals.length > 0
          ? (allVals.reduce((a, b) => a + b, 0) / allVals.length).toFixed(2)
          : "0.00";

        finalData.push({
          name:     site.name,
          uptime:   `${avg}%`,
          increase: "+0.00%",
          color:    site.color,
          chartData,
          circles:  entities,  // kept for backward compat
          entities,
          cmps,
          groupBy:  groupByCmp ? "cmp" : "circle",
        });

      } catch (siteError) {

        console.log(

          `Error in ${site.table}:`,

          siteError.sqlMessage ||
          siteError.message

        );

      }

    }


    res.json(finalData);

  } catch (error) {

    console.log(

      "Tower uptime error:",

      error.sqlMessage ||
      error.message

    );

    res.status(500).json({

      success: false,

      message:
        "Failed to fetch tower uptime data",

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

    const siteConfigs = {
      AG1:    { table: "ag1",    kpiCols: ["kpi_value", "availability"], scaleFraction: true },
      ENB:    { table: "enb",    kpiCols: ["availability", "kpi_value"] },
      ESC:    { table: "esc",    kpiCols: ["total_availability", "kpi_value", "availability"] },
      GNB:    { table: "gnb",    kpiCols: ["availability", "kpi_value"] },
      OSC:    { table: "osc",    kpiCols: ["availability", "kpi_value"] },
      HPODSC: { table: "hpodsc", kpiCols: ["total_availability", "kpi_value", "availability"] },
    };

    const config = siteConfigs[String(kpi).toUpperCase()];
    if (!config) {
      return res.status(400).json({ message: "Invalid KPI type" });
    }

    const { table } = config;

    const tableCheck = await query(`SHOW TABLES LIKE '${table}'`);
    if (!tableCheck.length) {
      return res.json({ chartData: [], summary: { avg: 0, highest: 0, lowest: 0, total: 0, trend: "stable" }, circles: [], cmps: [] });
    }

    const cols = await query(`SHOW COLUMNS FROM \`${table}\``);
    const columnNames = cols.map(c => c.Field);

    const kpiColumn = config.kpiCols.find(c => columnNames.includes(c));
    if (!kpiColumn) {
      return res.json({ chartData: [], summary: { avg: 0, highest: 0, lowest: 0, total: 0, trend: "stable" }, circles: [], cmps: [] });
    }

    const hasCircleCol = columnNames.includes("circle");
    const hasCmpCol   = columnNames.includes("cmp");
    const dateColumn  = columnNames.includes("date") ? "date" : "created_at";

    // Determine latest date in the table
    const [{ maxDate } = {}] = await query(
      `SELECT DATE(MAX(\`${dateColumn}\`)) AS maxDate FROM \`${table}\``
    );

    // Build period WHERE clause
    const normalizedPeriod = period  || "last7";
    const normalizedYear   = year    ? Number(year)  : new Date().getFullYear();
    const normalizedMonth  = month   ? Number(month) : (new Date().getMonth() + 1);

    let periodSql = "1=1";
    const periodParams = [];

    if (maxDate) {
      switch (normalizedPeriod) {
        case "last7":
          periodSql = `DATE(\`${dateColumn}\`) >= DATE(?) - INTERVAL 6 DAY AND DATE(\`${dateColumn}\`) <= DATE(?)`;
          periodParams.push(maxDate, maxDate);
          break;
        case "last30":
          periodSql = `DATE(\`${dateColumn}\`) >= DATE(?) - INTERVAL 29 DAY AND DATE(\`${dateColumn}\`) <= DATE(?)`;
          periodParams.push(maxDate, maxDate);
          break;
        case "current_month":
          periodSql = `MONTH(\`${dateColumn}\`) = MONTH(CURDATE()) AND YEAR(\`${dateColumn}\`) = YEAR(CURDATE())`;
          break;
        case "prev_month":
          periodSql = `MONTH(\`${dateColumn}\`) = MONTH(CURDATE() - INTERVAL 1 MONTH) AND YEAR(\`${dateColumn}\`) = YEAR(CURDATE() - INTERVAL 1 MONTH)`;
          break;
        case "custom_month":
          periodSql = `MONTH(\`${dateColumn}\`) = ? AND YEAR(\`${dateColumn}\`) = ?`;
          periodParams.push(normalizedMonth, normalizedYear);
          break;
        case "yearly":
          periodSql = `YEAR(\`${dateColumn}\`) = ?`;
          periodParams.push(normalizedYear);
          break;
        case "month_range": {
          const fmY = fromMonthYear ? Number(fromMonthYear) : normalizedYear;
          const fmM = fromMonth     ? Number(fromMonth)     : 1;
          const tmY = toMonthYear   ? Number(toMonthYear)   : normalizedYear;
          const tmM = toMonth       ? Number(toMonth)       : 12;
          periodSql = `DATE(\`${dateColumn}\`) >= ? AND DATE(\`${dateColumn}\`) <= LAST_DAY(?)`;
          periodParams.push(
            `${fmY}-${String(fmM).padStart(2, "0")}-01`,
            `${tmY}-${String(tmM).padStart(2, "0")}-01`
          );
          break;
        }
        case "date_range": {
          const fDate = fromDate || new Date().toISOString().split("T")[0];
          const tDate = toDate   || fDate;
          periodSql = `DATE(\`${dateColumn}\`) BETWEEN ? AND ?`;
          periodParams.push(fDate, tDate);
          break;
        }
        case "quarterly": {
          const qY = quarterYear ? Number(quarterYear) : normalizedYear;
          const q  = Math.min(4, Math.max(1, Number(quarter || Math.ceil((new Date().getMonth() + 1) / 3))));
          periodSql = `YEAR(\`${dateColumn}\`) = ? AND MONTH(\`${dateColumn}\`) BETWEEN ? AND ?`;
          periodParams.push(qY, (q - 1) * 3 + 1, q * 3);
          break;
        }
        default:
          periodSql = `DATE(\`${dateColumn}\`) >= DATE(?) - INTERVAL 6 DAY AND DATE(\`${dateColumn}\`) <= DATE(?)`;
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

    // Chart data
    const chartSql = `
      SELECT
        ${dateFormatSql} AS date,
        ${entitySelectSql}
        ROUND(AVG(CAST(REPLACE(\`${kpiColumn}\`, '%', '') AS DECIMAL(12,4))), 2) AS uptime
      FROM \`${table}\`
      ${whereClause}
      GROUP BY ${groupByExpr}${entityGroupSql}
      ORDER BY ${groupByExpr} ASC${orderEntitySql}
    `;
    const chartRows = await query(chartSql, allParams);

    // Summary stats
    const summarySql = `
      SELECT
        ROUND(AVG(CAST(REPLACE(\`${kpiColumn}\`, '%', '') AS DECIMAL(12,4))), 2) AS avg_uptime,
        ROUND(MAX(CAST(REPLACE(\`${kpiColumn}\`, '%', '') AS DECIMAL(12,4))), 2) AS highest_uptime,
        ROUND(MIN(CAST(REPLACE(\`${kpiColumn}\`, '%', '') AS DECIMAL(12,4))), 2) AS lowest_uptime,
        COUNT(*) AS total_records
      FROM \`${table}\`
      ${whereClause}
    `;
    const [summaryRow = {}] = await query(summarySql, allParams);

    // Available circles (always full list, unfiltered except by user role)
    let circles = [];
    if (hasCircleCol) {
      let cq = `SELECT DISTINCT TRIM(circle) AS circle FROM \`${table}\` WHERE circle IS NOT NULL AND TRIM(circle) != ''`;
      const cqp = [];
      if (!isAllCircle(req.authUser)) {
        cq += ` AND LOWER(TRIM(circle)) = LOWER(TRIM(?))`;
        cqp.push(req.authUser.circle);
      }
      cq += ` ORDER BY circle`;
      const cr = await query(cq, cqp);
      circles = cr.map(r => r.circle).filter(Boolean);
    }

    // Available CMPs (filtered by selected circle if provided)
    let cmps = [];
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
      const mr = await query(mq, mqp);
      cmps = mr.map(r => r.cmp).filter(Boolean);
    }

    // Normalize values and detect trend
    const normalizedRows = chartRows.map(row => ({
      ...row,
      uptime: normalizeUptimeValue(row.uptime, config.scaleFraction),
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

    res.json({
      chartData: normalizedRows,
      summary: {
        avg:     normalizeUptimeValue(summaryRow.avg_uptime     || 0, config.scaleFraction),
        highest: normalizeUptimeValue(summaryRow.highest_uptime || 0, config.scaleFraction),
        lowest:  normalizeUptimeValue(summaryRow.lowest_uptime  || 0, config.scaleFraction),
        total:   Number(summaryRow.total_records || 0),
        trend,
      },
      circles,
      cmps,
      groupBy: groupByCmp ? "cmp" : "circle",
    });

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

// ─── Dedicated CMP list endpoint ─────────────────────────────────────────────
// Returns all unique, real CMP names across every KPI table.
// When ?circle= is provided, only CMPs belonging to that circle are returned.
router.get("/tower-uptime/cmps", async (req, res) => {
  try {
    const selectedCircle = req.query.circle || "";
    const knownTables    = ["ag1", "enb", "esc", "gnb", "osc", "hpodsc"];
    const allCmps        = new Set();

    for (const table of knownTables) {
      try {
        const tableCheck = await query(`SHOW TABLES LIKE '${table}'`);
        if (!tableCheck.length) continue;

        const cols        = await query(`SHOW COLUMNS FROM \`${table}\``);
        const columnNames = cols.map(c => c.Field);

        if (!columnNames.includes("cmp")) continue;

        const hasCircleCol = columnNames.includes("circle");
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
        rows.forEach(r => { if (r.cmp) allCmps.add(r.cmp.trim()); });
      } catch (e) {
        console.log(`CMP fetch for ${table}:`, e.message);
      }
    }

    res.json({ cmps: Array.from(allCmps).sort() });
  } catch (error) {
    console.error("CMP list error:", error.message);
    res.status(500).json({ cmps: [] });
  }
});

module.exports = router;
