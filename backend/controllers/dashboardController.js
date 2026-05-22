const util = require("util");
const { db, isConnected } = require("../config/db");

const query = util.promisify(db.query).bind(db);

function safeCount(value) {
  return Number(value || 0);
}

function normalizeDateLabel(value) {
  if (!value) return "Unknown";
  return String(value);
}

async function getReportsSummary(req, res) {
  if (!isConnected()) {
    return res.status(503).json({
      message:
        "Backend cannot reach the database. Please verify DB host/credentials or firewall rules.",
    });
  }

  try {
    const [towerRow] = await query(
      "SELECT COUNT(*) AS count FROM report_uploads WHERE site_category = 'tower'"
    );
    const [nsoRow] = await query(
      "SELECT COUNT(*) AS count FROM nso_report_files"
    );
    const [fiberRow] = await query(
      "SELECT COUNT(*) AS count FROM fiber_inventory"
    );

    const breakdownRows = await query(
      `SELECT
        COALESCE(site_type, 'Unknown') AS category,
        COUNT(*) AS count
      FROM report_uploads
      WHERE site_category = 'tower'
      GROUP BY category
      ORDER BY count DESC
      LIMIT 5`
    );

    const monthlyCounts = await query(
      `SELECT
        DATE_FORMAT(report_date, '%Y-%m') AS period,
        COUNT(*) AS count
      FROM report_uploads
      WHERE site_category = 'tower' AND report_date IS NOT NULL
      GROUP BY period
      ORDER BY period ASC
      LIMIT 12`
    );

    const weeklyTrend = await query(
      `SELECT
        DATE_FORMAT(report_date, '%Y-%m-%d') AS period,
        COUNT(*) AS count
      FROM report_uploads
      WHERE site_category = 'tower'
        AND report_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY period
      ORDER BY period ASC`
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
      ORDER BY uploaded_at DESC
      LIMIT 8`
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
    const rows = await query(
      `SELECT
        id,
        file_name,
        report_date,
        total_records,
        uploaded_by,
        uploaded_at
      FROM nso_report_files
      ORDER BY uploaded_at DESC
      LIMIT 8`
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
      ORDER BY created_at DESC
      LIMIT 8`
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
        GROUP BY month
        UNION ALL
        SELECT
          DATE_FORMAT(report_date, '%Y-%m') AS month,
          0 AS towerCount,
          COUNT(*) AS nsoCount,
          0 AS fiberCount
        FROM nso_report_files
        WHERE report_date IS NOT NULL
        GROUP BY month
        UNION ALL
        SELECT
          DATE_FORMAT(created_at, '%Y-%m') AS month,
          0 AS towerCount,
          0 AS nsoCount,
          COUNT(*) AS fiberCount
        FROM fiber_inventory
        WHERE created_at IS NOT NULL
        GROUP BY month
      ) AS unioned
      GROUP BY month
      ORDER BY month ASC
      LIMIT 12`
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
