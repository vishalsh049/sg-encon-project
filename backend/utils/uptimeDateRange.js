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
function buildRangeSql({ range, table, dateColumn, filterWhereSql, filterParams, from, to }) {
  const r = range || "last7";

  if (r === "last7" || r === "last15" || r === "last30") {
    const days = r === "last7" ? 6 : r === "last15" ? 14 : 29;
    const sql = `DATE(\`${dateColumn}\`) >= (
      SELECT DATE(MAX(\`${dateColumn}\`)) - INTERVAL ${days} DAY
      FROM \`${table}\`
      WHERE 1=1 ${filterWhereSql}
    )`;
    return { sql, params: [...filterParams] };
  }

  if (r === "today") {
    return { sql: `DATE(\`${dateColumn}\`) = CURDATE()`, params: [] };
  }
  if (r === "yesterday") {
    return { sql: `DATE(\`${dateColumn}\`) = CURDATE() - INTERVAL 1 DAY`, params: [] };
  }
  if (r === "this_week") {
    return { sql: `YEARWEEK(\`${dateColumn}\`, 1) = YEARWEEK(CURDATE(), 1)`, params: [] };
  }
  if (r === "this_month") {
    return {
      sql: `MONTH(\`${dateColumn}\`) = MONTH(CURDATE()) AND YEAR(\`${dateColumn}\`) = YEAR(CURDATE())`,
      params: [],
    };
  }
  if (r === "custom" && from && to) {
    return { sql: `DATE(\`${dateColumn}\`) BETWEEN ? AND ?`, params: [from, to] };
  }

  // Fallback: same as last7
  const sql = `DATE(\`${dateColumn}\`) >= (
    SELECT DATE(MAX(\`${dateColumn}\`)) - INTERVAL 6 DAY
    FROM \`${table}\`
    WHERE 1=1 ${filterWhereSql}
  )`;
  return { sql, params: [...filterParams] };
}

module.exports = { buildCircleCmpFilter, buildRangeSql };
