const { db } = require("../config/db");

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });

// The KPI endpoints previously ran `SHOW TABLES LIKE ...` + `SHOW COLUMNS`
// for every table on every request (up to 12 metadata queries per page load).
// Table structure changes rarely, so we resolve all of it in ONE
// information_schema query and cache the result for a short TTL.
const SCHEMA_TTL_MS = 5 * 60 * 1000;

let cache = null; // { at: timestamp, tables: Map<tableName, string[] columns> }
let inflight = null;

async function loadSchemas(tableNames) {
  const placeholders = tableNames.map(() => "?").join(", ");
  const rows = await query(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND LOWER(TABLE_NAME) IN (${placeholders})
     ORDER BY ORDINAL_POSITION`,
    tableNames.map((t) => t.toLowerCase())
  );

  const tables = new Map();
  for (const row of rows) {
    const key = String(row.tableName).toLowerCase();
    if (!tables.has(key)) tables.set(key, []);
    tables.get(key).push(row.columnName);
  }
  return tables;
}

// Minimum cache age before a missing table triggers an early refresh — keeps
// a permanently-absent table from bypassing the cache on every request.
const MISSING_RECHECK_MS = 30 * 1000;

// Returns Map<tableName, columnNames[]>. A table absent from the map does not
// exist in the database (same signal SHOW TABLES LIKE used to give).
async function getKpiTableSchemas(tableNames) {
  const now = Date.now();
  if (cache && now - cache.at < SCHEMA_TTL_MS) {
    // Self-heal: if a requested table isn't in the cache (e.g. just created by
    // an upload), refresh early instead of waiting out the full TTL.
    const allPresent = tableNames.every((t) => cache.tables.has(t.toLowerCase()));
    if (allPresent || now - cache.at < MISSING_RECHECK_MS) {
      return cache.tables;
    }
  }
  if (!inflight) {
    inflight = loadSchemas(tableNames)
      .then((tables) => {
        cache = { at: Date.now(), tables };
        return tables;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

function invalidateKpiSchemaCache() {
  cache = null;
}

module.exports = { getKpiTableSchemas, invalidateKpiSchemaCache };
