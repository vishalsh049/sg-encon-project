// One-time, idempotent index setup for the KPI dashboard tables.
//
// The dashboard filters every query by a date range. Without an index on the
// date column, MySQL scans the full table for each of the 6 KPI tables on
// every page load. This script adds a plain index on each table's date column
// (skipping any that already exist).
//
// Run from the backend folder:  node scripts/addKpiIndexes.js
//
// Safe to run multiple times. On very large tables the initial index build
// can take a little while — run it during a quiet window.

const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

// Same env resolution as server.js
const envCandidates = [".env.production", ".env.development", ".env"]
  .map((f) => path.join(__dirname, "..", f))
  .filter((f) => fs.existsSync(f));
dotenv.config({ path: envCandidates[0] });

const { db } = require("../config/db");

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });

const KPI_TABLES = ["ag1", "enb", "esc", "gnb", "osc", "hpodsc"];
const POSSIBLE_DATE_COLUMNS = ["Date", "date", "created_at", "report_date", "timestamp"];

async function main() {
  const cols = await query(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND LOWER(TABLE_NAME) IN (${KPI_TABLES.map(() => "?").join(",")})`,
    KPI_TABLES
  );

  const tableColumns = new Map();
  for (const row of cols) {
    const key = String(row.tableName).toLowerCase();
    if (!tableColumns.has(key)) tableColumns.set(key, []);
    tableColumns.get(key).push(row.columnName);
  }

  const existingIndexes = await query(
    `SELECT TABLE_NAME AS tableName, INDEX_NAME AS indexName,
            COLUMN_NAME AS columnName, SEQ_IN_INDEX AS seq
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND LOWER(TABLE_NAME) IN (${KPI_TABLES.map(() => "?").join(",")})`,
    KPI_TABLES
  );

  const indexedColumns = new Set(
    existingIndexes
      .filter((r) => r.seq === 1)
      .map((r) => `${String(r.tableName).toLowerCase()}.${r.columnName}`)
  );

  // Composite (circle, cmp) indexes: any index whose first two columns are
  // circle then cmp. Enables MariaDB's loose index scan for the DISTINCT
  // circle/cmp dropdown lists.
  const indexColumnsByName = new Map();
  for (const r of existingIndexes) {
    const key = `${String(r.tableName).toLowerCase()}.${r.indexName}`;
    if (!indexColumnsByName.has(key)) indexColumnsByName.set(key, []);
    indexColumnsByName.get(key)[r.seq - 1] = r.columnName;
  }
  const hasCircleCmpIndex = new Set();
  for (const [key, colsInIndex] of indexColumnsByName) {
    if (colsInIndex[0] === "circle" && colsInIndex[1] === "cmp") {
      hasCircleCmpIndex.add(key.split(".")[0]);
    }
  }

  for (const table of KPI_TABLES) {
    const columns = tableColumns.get(table);
    if (!columns) {
      console.log(`- ${table}: table not found, skipped`);
      continue;
    }

    const dateColumn = POSSIBLE_DATE_COLUMNS.find((c) => columns.includes(c));
    if (!dateColumn) {
      console.log(`- ${table}: no date column found, skipped`);
      continue;
    }

    if (indexedColumns.has(`${table}.${dateColumn}`)) {
      console.log(`- ${table}: index on \`${dateColumn}\` already exists, skipped`);
    } else {
      const indexName = `idx_${table}_${dateColumn.toLowerCase()}`;
      console.log(`- ${table}: creating index ${indexName} on \`${dateColumn}\` ...`);
      await query(`CREATE INDEX \`${indexName}\` ON \`${table}\` (\`${dateColumn}\`)`);
      console.log(`- ${table}: done`);
    }

    if (columns.includes("circle") && columns.includes("cmp")) {
      if (hasCircleCmpIndex.has(table)) {
        console.log(`- ${table}: (circle, cmp) index already exists, skipped`);
      } else {
        const indexName = `idx_${table}_circle_cmp`;
        console.log(`- ${table}: creating index ${indexName} on (circle, cmp) ...`);
        await query(`CREATE INDEX \`${indexName}\` ON \`${table}\` (\`circle\`, \`cmp\`)`);
        console.log(`- ${table}: done`);
      }
    }
  }

  console.log("All KPI indexes are in place.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Index setup failed:", err.sqlMessage || err.message);
  process.exit(1);
});
