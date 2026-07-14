const { isAllCircle } = require("../middleware/circleAccess");

// Shared circle/cmp access-control + filter WHERE-clause builder.
// Used by both /tower-uptime and /tower-uptime/analytics, which previously
// duplicated this logic independently.
function buildCircleCmpFilter({ authUser, hasCircleCol, hasCmpCol, selectedCircle, selectedCmp }) {
  const conditions = [];
  const params = [];

  if (!isAllCircle(authUser) && hasCircleCol) {
    conditions.push("LOWER(TRIM(circle)) = LOWER(TRIM(?))");
    params.push(authUser.circle);
  }
  if (selectedCircle && hasCircleCol) {
    conditions.push("LOWER(TRIM(circle)) = LOWER(TRIM(?))");
    params.push(selectedCircle);
  }
  if (selectedCmp && hasCmpCol) {
    conditions.push("LOWER(TRIM(cmp)) = LOWER(TRIM(?))");
    params.push(selectedCmp);
  }

  return { conditions, params };
}

// Date-range WHERE builder for /tower-uptime's `range` param.
// last7/last15/last30 stay anchored to MAX(date) in the table (data-relative,
// matches the endpoint's previous hardcoded "last 6 days" behavior for the
// default case). today/yesterday/this_week/this_month/custom anchor to
// CURDATE() instead, and can come back empty if the latest upload lags
// behind the calendar date.
// All conditions are written as sargable half-open ranges on the bare column
// (`col >= X AND col < Y`) instead of wrapping the column in DATE()/MONTH()/
// YEARWEEK(), so MySQL can use an index on the date column. The returned row
// sets are identical for both DATE and DATETIME columns.
function buildRangeSql({ range, table, dateColumn, filterWhereSql, filterParams, from, to }) {
  const r = range || "last7";
  const col = `\`${dateColumn}\``;

  if (r === "today") {
    return { sql: `${col} >= CURDATE() AND ${col} < CURDATE() + INTERVAL 1 DAY`, params: [] };
  }
  if (r === "yesterday") {
    return { sql: `${col} >= CURDATE() - INTERVAL 1 DAY AND ${col} < CURDATE()`, params: [] };
  }
  if (r === "this_week") {
    // ISO week (Monday start) — same rows as YEARWEEK(col, 1) = YEARWEEK(CURDATE(), 1)
    return {
      sql: `${col} >= CURDATE() - INTERVAL WEEKDAY(CURDATE()) DAY
        AND ${col} < CURDATE() - INTERVAL WEEKDAY(CURDATE()) DAY + INTERVAL 7 DAY`,
      params: [],
    };
  }
  if (r === "this_month") {
    return {
      sql: `${col} >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
        AND ${col} < DATE_FORMAT(CURDATE(), '%Y-%m-01') + INTERVAL 1 MONTH`,
      params: [],
    };
  }
  if (r === "custom" && from && to) {
    return { sql: `${col} >= ? AND ${col} < DATE(?) + INTERVAL 1 DAY`, params: [from, to] };
  }

  // last7 / last15 / last30 / fallback — anchored to MAX(date) in the table
  const days = r === "last15" ? 14 : r === "last30" ? 29 : 6;
  const sql = `${col} >= (
    SELECT DATE(MAX(\`${dateColumn}\`)) - INTERVAL ${days} DAY
    FROM \`${table}\`
    WHERE 1=1 ${filterWhereSql}
  )`;
  return { sql, params: [...filterParams] };
}

module.exports = { buildCircleCmpFilter, buildRangeSql };
