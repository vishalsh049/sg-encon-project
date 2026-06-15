const util = require("util");
const ExcelJS = require("exceljs");
const { db } = require("../config/db");
const { isAllCircle } = require("../middleware/circleAccess");

const query = util.promisify(db.query).bind(db);

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

  if (filters.length === 0) {
    return "";
  }

  return `AND ${filters.join(" AND ")}`;
}

function formatWeekLabel(week) {
  if (!week) return "Unknown";
  return String(week).startsWith("WK-") ? String(week) : `WK-${week}`;
}

function safeNumber(value) {
  return Number(value || 0);
}

function formatChange(current, previous) {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

async function ensureNsoReportsSchema() {
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
      ftkm DECIMAL(10,2) NULL,
      scope VARCHAR(255) NULL,
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
    ["ftkm", "DECIMAL(10,2) NULL"],
    ["scope", "VARCHAR(255) NULL"],
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
  ];

  for (const [indexName, column] of indexes) {
    try {
      await query(`ALTER TABLE nso_reports ADD INDEX ${indexName} (${column})`);
    } catch (error) {
      if (error?.code !== "ER_DUP_KEYNAME") {
        throw error;
      }
    }
  }
}

async function getLatestWeeks(req, maxCount = 2) {
  const params = [];
  const filters = buildFilterClauses(req, params);
  const rows = await query(
    `SELECT DISTINCT year, week
     FROM nso_reports
     WHERE 1=1 ${filters}
     ORDER BY year DESC, week DESC
     LIMIT ${maxCount}`,
    params
  );
  return rows;
}

async function getSummary(req) {
  const params = [];
  const filters = buildFilterClauses(req, params);

  const [{ totalCuts = 0, totalFTKM = 0, avgMTTR = 0, activeCMP = 0 }] =
    await query(
      `SELECT
         COUNT(*) AS totalCuts,
         ROUND(SUM(ftkm),2) AS totalFTKM,
         ROUND(AVG(mttr),2) AS avgMTTR,
         COUNT(DISTINCT cmp) AS activeCMP
       FROM nso_reports
       WHERE 1=1 ${filters}`,
      params
    );

  const latestWeeks = await getLatestWeeks(req, 2);
  const latest = latestWeeks[0] || null;
  const previous = latestWeeks[1] || null;

  const currentStats = latest
    ? await query(
        `SELECT
           COUNT(*) AS cuts,
           ROUND(SUM(ftkm),2) AS ftkm,
           ROUND(AVG(mttr),2) AS mttr
         FROM nso_reports
         WHERE 1=1 ${filters}
           AND year = ?
           AND week = ?`,
        [...params, latest.year, latest.week]
      )
    : [{ cuts: 0, ftkm: 0, mttr: 0 }];

  const previousStats = previous
    ? await query(
        `SELECT
           COUNT(*) AS cuts,
           ROUND(SUM(ftkm),2) AS ftkm,
           ROUND(AVG(mttr),2) AS mttr
         FROM nso_reports
         WHERE 1=1 ${filters}
           AND year = ?
           AND week = ?`,
        [...params, previous.year, previous.week]
      )
    : [{ cuts: 0, ftkm: 0, mttr: 0 }];

  const current = currentStats[0] || { cuts: 0, ftkm: 0, mttr: 0 };
  const previousRow = previousStats[0] || { cuts: 0, ftkm: 0, mttr: 0 };

  return {
    totalCuts: safeNumber(totalCuts),
    totalFTKM: safeNumber(totalFTKM),
    avgMTTR: Number(Number(avgMTTR || 0).toFixed(2)),
    activeCMP: safeNumber(activeCMP),
    currentWeek: latest ? formatWeekLabel(latest.week) : null,
    previousWeek: previous ? formatWeekLabel(previous.week) : null,
    previousCuts: safeNumber(previousRow.cuts),
    previousFTKM: safeNumber(previousRow.ftkm),
    previousMTTR: Number(Number(previousRow.mttr || 0).toFixed(2)),
    cutsChangePct: formatChange(safeNumber(current.cuts), safeNumber(previousRow.cuts)),
    ftkmChangePct: formatChange(safeNumber(current.ftkm), safeNumber(previousRow.ftkm)),
    mttrChangePct: formatChange(Number(current.mttr || 0), Number(previousRow.mttr || 0)),
  };
}

async function getCircleRanking(req) {
  const params = [];
  const filters = buildFilterClauses(req, params);

  const rows = await query(
    `SELECT
       COALESCE(NULLIF(TRIM(circle), ''), 'Unknown') AS circle,
       COUNT(*) AS cuts,
       ROUND(SUM(ftkm),2) AS ftkm,
       ROUND(AVG(mttr),2) AS mttr
     FROM nso_reports
     WHERE 1=1 ${filters}
     GROUP BY circle
     ORDER BY cuts DESC, circle ASC`,
    params
  );

  return rows.map((row) => ({
    circle: row.circle,
    cuts: safeNumber(row.cuts),
    ftkm: safeNumber(row.ftkm),
    mttr: Number(Number(row.mttr || 0).toFixed(2)),
    status:
      row.mttr < 3 ? "Good" : row.mttr <= 5 ? "Warning" : "Critical",
  }));
}

async function getCutsTrend(req) {
  const params = [];
  const filters = buildFilterClauses(req, params);
  const rows = await query(
    `SELECT
       CONCAT('WK-', week) AS week,
       COUNT(*) AS cuts
     FROM nso_reports
     WHERE 1=1 ${filters}
     GROUP BY year, week
     ORDER BY year DESC, week DESC
     LIMIT 4`,
    params
  );
  return rows
    .map((row) => ({
      week: row.week,
      cuts: safeNumber(row.cuts),
    }))
    .reverse();
}

async function getMttrTrend(req) {
  const params = [];
  const filters = buildFilterClauses(req, params);
  const rows = await query(
    `SELECT
       CONCAT('WK-', week) AS week,
       ROUND(AVG(mttr),2) AS mttr
     FROM nso_reports
     WHERE 1=1 ${filters}
     GROUP BY year, week
     ORDER BY year DESC, week DESC
     LIMIT 4`,
    params
  );
  return rows
    .map((row) => ({
      week: row.week,
      mttr: Number(Number(row.mttr || 0).toFixed(2)),
    }))
    .reverse();
}

async function getCmpSummary(req) {
  const latestWeeks = await getLatestWeeks(req, 2);
  const latest = latestWeeks[0] || null;
  const previous = latestWeeks[1] || null;

  const params = [];
  const filters = buildFilterClauses(req, params);

  const rows = await query(
    `SELECT
       COALESCE(TRIM(cmp), 'Unknown') AS cmp,
       ANY_VALUE(scope) AS scope,
       SUM(CASE WHEN year = ? AND week = ? THEN 1 ELSE 0 END) AS currentCuts,
       ROUND(SUM(CASE WHEN year = ? AND week = ? THEN ftkm ELSE 0 END),2) AS currentFTKM,
       ROUND(AVG(CASE WHEN year = ? AND week = ? THEN mttr END),2) AS currentMTTR,
       SUM(CASE WHEN year = ? AND week = ? THEN 1 ELSE 0 END) AS previousCuts,
       ROUND(SUM(CASE WHEN year = ? AND week = ? THEN ftkm ELSE 0 END),2) AS previousFTKM,
       ROUND(AVG(CASE WHEN year = ? AND week = ? THEN mttr END),2) AS previousMTTR
     FROM nso_reports
     WHERE 1=1 ${filters}
     GROUP BY cmp
     ORDER BY currentCuts DESC, cmp ASC`,
    [
      latest?.year || "",
      latest?.week || "",
      latest?.year || "",
      latest?.week || "",
      latest?.year || "",
      latest?.week || "",
      previous?.year || "",
      previous?.week || "",
      previous?.year || "",
      previous?.week || "",
      previous?.year || "",
      previous?.week || "",
      ...params,
    ]
  );

  return rows.map((row) => {
    const currentCuts = safeNumber(row.currentCuts);
    const previousCuts = safeNumber(row.previousCuts);
    const currentFTKM = safeNumber(row.currentFTKM);
    const previousFTKM = safeNumber(row.previousFTKM);
    const currentMTTR = Number(Number(row.currentMTTR || 0).toFixed(2));
    const previousMTTR = Number(Number(row.previousMTTR || 0).toFixed(2));

    return {
      cmp: row.cmp,
      scope: row.scope || "-",
      currentCuts,
      currentFTKM,
      currentMTTR,
      previousCuts,
      previousFTKM,
      previousMTTR,
      cutsChangePct: formatChange(currentCuts, previousCuts),
      ftkmChangePct: formatChange(currentFTKM, previousFTKM),
      mttrChangePct: formatChange(currentMTTR, previousMTTR),
      trend:
        currentCuts > previousCuts
          ? "up"
          : currentCuts < previousCuts
          ? "down"
          : "flat",
      status:
        currentMTTR < 3
          ? "Good"
          : currentMTTR <= 5
          ? "Warning"
          : "Critical",
    };
  });
}

async function getHeatmap(req) {
  const latestWeeks = await getLatestWeeks(req, 4);
  const weekLabels = latestWeeks
    .map((row) => formatWeekLabel(row.week))
    .reverse();

  const params = [];
  const filters = buildFilterClauses(req, params);
  const rows = await query(
    `SELECT
       COALESCE(TRIM(cmp), 'Unknown') AS cmp,
       CONCAT('WK-', week) AS week,
       COUNT(*) AS cuts
     FROM nso_reports
     WHERE 1=1 ${filters}
     GROUP BY cmp, year, week
     ORDER BY cmp ASC, year DESC, week DESC`,
    params
  );

  const byCmp = {};

  rows.forEach((row) => {
    byCmp[row.cmp] = byCmp[row.cmp] || { cmp: row.cmp, values: {} };
    byCmp[row.cmp].values[row.week] = safeNumber(row.cuts);
  });

  const data = Object.values(byCmp).map((item) => {
    const values = {};
    weekLabels.forEach((week) => {
      values[week] = item.values[week] || 0;
    });
    return { cmp: item.cmp, values };
  });

  return {
    weeks: weekLabels,
    rows: data,
  };
}

async function getCmpWeekly(req) {
  const latestWeeks = await getLatestWeeks(req, 4);
  const weekLabels = latestWeeks
    .map((row) => formatWeekLabel(row.week))
    .reverse();

  const params = [];
  const filters = buildFilterClauses(req, params);
  const rows = await query(
    `SELECT
       COALESCE(TRIM(cmp), 'Unknown') AS cmp,
       CONCAT('WK-', week) AS week,
       COUNT(*) AS cuts,
       ROUND(SUM(ftkm),2) AS ftkm,
       ROUND(AVG(mttr),2) AS mttr
     FROM nso_reports
     WHERE 1=1 ${filters}
     GROUP BY cmp, year, week
     ORDER BY cmp ASC, year DESC, week DESC`,
    params
  );

  const byCmp = {};
  rows.forEach((row) => {
    byCmp[row.cmp] = byCmp[row.cmp] || { cmp: row.cmp, details: {} };
    byCmp[row.cmp].details[row.week] = {
      cuts: safeNumber(row.cuts),
      ftkm: safeNumber(row.ftkm),
      mttr: Number(Number(row.mttr || 0).toFixed(2)),
    };
  });

  const data = Object.values(byCmp).map((item) => ({
    cmp: item.cmp,
    details: weekLabels.map((week) => ({
      week,
      ...item.details[week],
      cuts: item.details[week]?.cuts || 0,
      ftkm: item.details[week]?.ftkm || 0,
      mttr: item.details[week]?.mttr || 0,
    })),
  }));

  return {
    weeks: weekLabels,
    rows: data,
  };
}

async function getFilters(req) {
  const params = [];
  const filters = buildFilterClauses(req, params);

  const [circleRows] = await query(
    `SELECT DISTINCT TRIM(circle) AS value
     FROM nso_reports
     WHERE circle IS NOT NULL
       AND TRIM(circle) <> ''
       ${filters}
     ORDER BY value ASC`,
    params
  );

  const [cmpRows] = await query(
    `SELECT DISTINCT TRIM(cmp) AS value
     FROM nso_reports
     WHERE cmp IS NOT NULL
       AND TRIM(cmp) <> ''
       ${filters}
     ORDER BY value ASC`,
    params
  );

  const [yearRows] = await query(
    `SELECT DISTINCT TRIM(year) AS value
     FROM nso_reports
     WHERE year IS NOT NULL
       AND TRIM(year) <> ''
       ${filters}
     ORDER BY value DESC`,
    params
  );

  const [monthRows] = await query(
    `SELECT DISTINCT TRIM(month) AS value
     FROM nso_reports
     WHERE month IS NOT NULL
       AND TRIM(month) <> ''
       ${filters}
     ORDER BY value ASC`,
    params
  );

  const [weekRows] = await query(
    `SELECT DISTINCT TRIM(week) AS value
     FROM nso_reports
     WHERE week IS NOT NULL
       AND TRIM(week) <> ''
       ${filters}
     ORDER BY value ASC`,
    params
  );

  return {
    circles: circleRows.map((row) => row.value),
    cmps: cmpRows.map((row) => row.value),
    years: yearRows.map((row) => row.value),
    months: monthRows.map((row) => row.value),
    weeks: weekRows.map((row) => formatWeekLabel(row.value)),
  };
}

async function buildExportWorkbook(req) {
  const [summary, ranking, cmpSummary, weeklyDetails] = await Promise.all([
    getSummary(req),
    getCircleRanking(req),
    getCmpSummary(req),
    getCmpWeekly(req),
  ]);

  const workbook = new ExcelJS.Workbook();
  const summarySheet = workbook.addWorksheet("KPI Summary");
  summarySheet.columns = [
    { header: "Metric", key: "metric", width: 28 },
    { header: "Value", key: "value", width: 18 },
  ];
  summarySheet.addRows([
    { metric: "Total Cuts", value: summary.totalCuts },
    { metric: "Total FTKM", value: summary.totalFTKM },
    { metric: "Average MTTR", value: summary.avgMTTR },
    { metric: "Active CMP", value: summary.activeCMP },
    { metric: "Current Week", value: summary.currentWeek || "-" },
    { metric: "Previous Week", value: summary.previousWeek || "-" },
    { metric: "Cuts % Change", value: `${summary.cutsChangePct}%` },
    { metric: "FTKM % Change", value: `${summary.ftkmChangePct}%` },
    { metric: "MTTR % Change", value: `${summary.mttrChangePct}%` },
  ]);

  const rankingSheet = workbook.addWorksheet("Circle Ranking");
  rankingSheet.columns = [
    { header: "Circle", key: "circle", width: 24 },
    { header: "Cuts", key: "cuts", width: 12 },
    { header: "FTKM", key: "ftkm", width: 14 },
    { header: "MTTR", key: "mttr", width: 14 },
    { header: "Status", key: "status", width: 14 },
  ];
  rankingSheet.addRows(ranking);

  const cmpSheet = workbook.addWorksheet("CMP Summary");
  cmpSheet.columns = [
    { header: "CMP", key: "cmp", width: 20 },
    { header: "Scope (KM)", key: "scope", width: 14 },
    { header: "Cuts (This Week)", key: "currentCuts", width: 18 },
    { header: "FTKM (This Week)", key: "currentFTKM", width: 18 },
    { header: "MTTR (This Week)", key: "currentMTTR", width: 16 },
    { header: "Cuts (Last Week)", key: "previousCuts", width: 18 },
    { header: "FTKM (Last Week)", key: "previousFTKM", width: 18 },
    { header: "MTTR (Last Week)", key: "previousMTTR", width: 16 },
    { header: "Change %", key: "cutsChangePct", width: 14 },
    { header: "Status", key: "status", width: 14 },
  ];
  cmpSheet.addRows(
    cmpSummary.map((item) => ({
      ...item,
      cutsChangePct: `${item.cutsChangePct}%`,
    }))
  );

  const detailsSheet = workbook.addWorksheet("CMP Weekly Details");
  const columns = [
    { header: "CMP", key: "cmp", width: 24 },
  ];
  const weeks = weeklyDetails.weeks || [];
  weeks.forEach((week) => {
    columns.push({ header: `${week} Cuts`, key: `${week}_cuts`, width: 12 });
    columns.push({ header: `${week} FTKM`, key: `${week}_ftkm`, width: 14 });
    columns.push({ header: `${week} MTTR`, key: `${week}_mttr`, width: 14 });
  });
  detailsSheet.columns = columns;

  weeklyDetails.rows.forEach((row) => {
    const record = { cmp: row.cmp };
    row.details.forEach((detail) => {
      record[`${detail.week}_cuts`] = detail.cuts;
      record[`${detail.week}_ftkm`] = detail.ftkm;
      record[`${detail.week}_mttr`] = detail.mttr;
    });
    detailsSheet.addRow(record);
  });

  return workbook;
}

module.exports = {
  ensureNsoReportsSchema,
  getSummary,
  getCircleRanking,
  getCutsTrend,
  getMttrTrend,
  getCmpSummary,
  getHeatmap,
  getCmpWeekly,
  getFilters,
  buildExportWorkbook,
};
