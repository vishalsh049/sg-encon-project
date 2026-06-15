const util = require("util");
const { db, isConnected } = require("../config/db");
const { isAllCircle } = require("../middleware/circleAccess");

const query = util.promisify(db.query).bind(db);

function safeCount(value) {
  return Number(value || 0);
}

function normalizeDateLabel(value) {
  if (!value) return "Unknown";
  return String(value);
}

const towerTables = ["ag1", "ag2", "enb", "esc", "gnb", "hpodsc", "ila", "isc", "osc"];

function towerUploadScopeSql(alias, authUser, params) {
  if (isAllCircle(authUser)) return "";

  const existsClauses = towerTables.map(
    (table) =>
      `(${alias}.site_type = '${table}' AND EXISTS (
        SELECT 1 FROM ${table} scoped
        WHERE scoped.file_id = ${alias}.file_id
          AND LOWER(TRIM(scoped.circle)) = LOWER(TRIM(?))
      ))`
  );

  params.push(...towerTables.map(() => authUser.circle));
  return `AND (${existsClauses.join(" OR ")})`;
}

function simpleCircleSql(column, authUser, params, prefix = "AND") {
  if (isAllCircle(authUser)) return "";
  params.push(authUser.circle);
  return `${prefix} LOWER(TRIM(${column})) = LOWER(TRIM(?))`;
}

async function getReportsSummary(req, res) {
  if (!isConnected()) {
    return res.status(503).json({
      message:
        "Backend cannot reach the database. Please verify DB host/credentials or firewall rules.",
    });
  }

  try {
    const towerParams = [];
    const [towerRow] = await query(
      `SELECT COUNT(*) AS count
       FROM report_uploads ru
       WHERE ru.site_category = 'tower'
         ${towerUploadScopeSql("ru", req.authUser, towerParams)}`,
      towerParams
    );
    const nsoParams = [];
    const [nsoRow] = await query(
      `SELECT COUNT(DISTINCT nrf.id) AS count
       FROM nso_report_files nrf
       LEFT JOIN nso_reports nr ON nr.file_id = nrf.id
       WHERE 1=1 ${simpleCircleSql("nr.circle", req.authUser, nsoParams)}`,
      nsoParams
    );
    const fiberParams = [];
    const [fiberRow] = await query(
      `SELECT COUNT(*) AS count
       FROM fiber_inventory fi
       WHERE 1=1 ${simpleCircleSql("fi.circle", req.authUser, fiberParams)}`,
      fiberParams
    );

    const breakdownParams = [];
    const breakdownRows = await query(
      `SELECT
        COALESCE(site_type, 'Unknown') AS category,
        COUNT(*) AS count
      FROM report_uploads ru
      WHERE site_category = 'tower'
        ${towerUploadScopeSql("ru", req.authUser, breakdownParams)}
      GROUP BY category
      ORDER BY count DESC
      LIMIT 5`,
      breakdownParams
    );

    const monthlyParams = [];
    const monthlyCounts = await query(
      `SELECT
        DATE_FORMAT(report_date, '%Y-%m') AS period,
        COUNT(*) AS count
      FROM report_uploads ru
      WHERE site_category = 'tower' AND report_date IS NOT NULL
        ${towerUploadScopeSql("ru", req.authUser, monthlyParams)}
      GROUP BY period
      ORDER BY period ASC
      LIMIT 12`,
      monthlyParams
    );

    const weeklyParams = [];
    const weeklyTrend = await query(
      `SELECT
        DATE_FORMAT(report_date, '%Y-%m-%d') AS period,
        COUNT(*) AS count
      FROM report_uploads ru
      WHERE site_category = 'tower'
        AND report_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        ${towerUploadScopeSql("ru", req.authUser, weeklyParams)}
      GROUP BY period
      ORDER BY period ASC`,
      weeklyParams
    );

    const [latestRow] = await query(
      `SELECT MAX(latest_timestamp) AS lastUpdated FROM (
        SELECT uploaded_at AS latest_timestamp FROM report_uploads
        UNION ALL
        SELECT uploaded_at AS latest_timestamp FROM nso_report_files
        UNION ALL
        SELECT created_at AS latest_timestamp FROM fiber_inventory
      ) AS latest_records`
    );

    res.json({
      towerCount: safeCount(towerRow?.count),
      nsoCount: safeCount(nsoRow?.count),
      fiberCount: safeCount(fiberRow?.count),
      totalReports:
        safeCount(towerRow?.count) + safeCount(nsoRow?.count) + safeCount(fiberRow?.count),
      breakdown: breakdownRows.map((row) => ({
        category: row.category,
        count: safeCount(row.count),
      })),
      monthlyCounts: monthlyCounts.map((row) => ({
        month: normalizeDateLabel(row.period),
        count: safeCount(row.count),
      })),
      weeklyTrend: weeklyTrend.map((row) => ({
        date: normalizeDateLabel(row.period),
        count: safeCount(row.count),
      })),
      lastUpdated: latestRow?.lastUpdated || null,
    });
  } catch (err) {
    console.error("Reports summary error:", err);
    res.status(500).json({
      message:
        err?.code === "ER_NO_SUCH_TABLE"
          ? `Missing table: ${err.sqlMessage}`
          : err?.message || "Reports summary query failed",
    });
  }
}

async function getTowerRecent(req, res) {
  if (!isConnected()) {
    return res.status(503).json({
      message:
        "Backend cannot reach the database. Please verify DB host/credentials or firewall rules.",
    });
  }

  try {
    const params = [];
    const rows = await query(
      `SELECT
        id,
        report_date,
        site_type,
        report_type,
        upload_type,
        uploaded_by,
        file_name,
        uploaded_at
      FROM report_uploads
      WHERE site_category = 'tower'
        ${towerUploadScopeSql("report_uploads", req.authUser, params)}
      ORDER BY uploaded_at DESC
      LIMIT 8`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("Tower recent error:", err);
    res.status(500).json({
      message:
        err?.code === "ER_NO_SUCH_TABLE"
          ? `Missing table: ${err.sqlMessage}`
          : err?.message || "Tower recent query failed",
    });
  }
}

async function getNsoRecent(req, res) {
  if (!isConnected()) {
    return res.status(503).json({
      message:
        "Backend cannot reach the database. Please verify DB host/credentials or firewall rules.",
    });
  }

  try {
    const params = [];
    const rows = await query(
      `SELECT
        nrf.id,
        nrf.file_name,
        nrf.report_date,
        nrf.total_records,
        nrf.uploaded_by,
        nrf.uploaded_at
      FROM nso_report_files nrf
      LEFT JOIN nso_reports nr ON nr.file_id = nrf.id
      WHERE 1=1 ${simpleCircleSql("nr.circle", req.authUser, params)}
      GROUP BY nrf.id, nrf.file_name, nrf.report_date, nrf.total_records, nrf.uploaded_by, nrf.uploaded_at
      ORDER BY uploaded_at DESC
      LIMIT 8`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("NSO recent error:", err);
    res.status(500).json({
      message:
        err?.code === "ER_NO_SUCH_TABLE"
          ? `Missing table: ${err.sqlMessage}`
          : err?.message || "NSO recent query failed",
    });
  }
}

async function getFiberRecent(req, res) {
  if (!isConnected()) {
    return res.status(503).json({
      message:
        "Backend cannot reach the database. Please verify DB host/credentials or firewall rules.",
    });
  }

  try {
    const params = [];
    const rows = await query(
      `SELECT
        id,
        fiber_type,
        span_type,
        cmm_appd,
        ug,
        aerial,
        source_row_number,
        created_at
      FROM fiber_inventory
      WHERE 1=1 ${simpleCircleSql("circle", req.authUser, params)}
      ORDER BY created_at DESC
      LIMIT 8`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("Fiber recent error:", err);
    res.status(500).json({
      message:
        err?.code === "ER_NO_SUCH_TABLE"
          ? `Missing table: ${err.sqlMessage}`
          : err?.message || "Fiber recent query failed",
    });
  }
}

async function getMonthlyStats(req, res) {
  if (!isConnected()) {
    return res.status(503).json({
      message:
        "Backend cannot reach the database. Please verify DB host/credentials or firewall rules.",
    });
  }

  try {
    const towerParams = [];
    const nsoParams = [];
    const fiberParams = [];
    const rows = await query(
      `SELECT
        month,
        SUM(towerCount) AS towerCount,
        SUM(nsoCount) AS nsoCount,
        SUM(fiberCount) AS fiberCount
      FROM (
        SELECT
          DATE_FORMAT(report_date, '%Y-%m') AS month,
          COUNT(*) AS towerCount,
          0 AS nsoCount,
          0 AS fiberCount
        FROM report_uploads
        WHERE site_category = 'tower' AND report_date IS NOT NULL
          ${towerUploadScopeSql("report_uploads", req.authUser, towerParams)}
        GROUP BY month
        UNION ALL
        SELECT
          DATE_FORMAT(report_date, '%Y-%m') AS month,
          0 AS towerCount,
          COUNT(*) AS nsoCount,
          0 AS fiberCount
        FROM nso_report_files
        ${
          isAllCircle(req.authUser)
            ? "WHERE report_date IS NOT NULL"
            : "INNER JOIN nso_reports nr ON nr.file_id = nso_report_files.id WHERE report_date IS NOT NULL AND LOWER(TRIM(nr.circle)) = LOWER(TRIM(?))"
        }
        GROUP BY month
        UNION ALL
        SELECT
          DATE_FORMAT(created_at, '%Y-%m') AS month,
          0 AS towerCount,
          0 AS nsoCount,
          COUNT(*) AS fiberCount
        FROM fiber_inventory
        WHERE created_at IS NOT NULL
          ${simpleCircleSql("circle", req.authUser, fiberParams)}
        GROUP BY month
      ) AS unioned
      GROUP BY month
      ORDER BY month ASC
      LIMIT 12`,
      [
        ...towerParams,
        ...(isAllCircle(req.authUser) ? [] : [req.authUser.circle]),
        ...nsoParams,
        ...fiberParams,
      ]
    );

    res.json(
      rows.map((row) => ({
        month: normalizeDateLabel(row.month),
        towerCount: safeCount(row.towerCount),
        nsoCount: safeCount(row.nsoCount),
        fiberCount: safeCount(row.fiberCount),
      }))
    );
  } catch (err) {
    console.error("Monthly stats error:", err);
    res.status(500).json({
      message:
        err?.code === "ER_NO_SUCH_TABLE"
          ? `Missing table: ${err.sqlMessage}`
          : err?.message || "Monthly stats query failed",
    });
  }
}

module.exports = {
  getReportsSummary,
  getTowerRecent,
  getNsoRecent,
  getFiberRecent,
  getMonthlyStats,
};
