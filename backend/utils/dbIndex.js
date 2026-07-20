/*
 * Shared "create index if it doesn't already exist" helper.
 *
 * Extracted out of backend/routes/hrDashboardExport.js so
 * backend/routes/scrumDashboard.js can reuse the exact same additive-index
 * warm-up convention instead of redefining it. CREATE INDEX is a no-op on an
 * existing index name (ER_DUP_KEYNAME is swallowed) and adding an index never
 * changes query results — only the plan used to produce them.
 */

function makeEnsureIndex(query) {
  return async function ensureIndex(table, indexName, columns) {
    try {
      await query(`CREATE INDEX ${indexName} ON ${table} (${columns})`);
    } catch (error) {
      if (error?.code !== "ER_DUP_KEYNAME") {
        throw error;
      }
    }
  };
}

module.exports = { makeEnsureIndex };
