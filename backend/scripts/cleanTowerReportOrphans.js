/**
 * Tower Reports — orphan data cleanup.
 *
 * An "orphan" is a row in a report data table (enb, gnb, ag2, ...) whose
 * file_id no longer has a matching row in report_uploads. These rows are
 * invisible in the UI, cannot be deleted through the app, and still get
 * counted by dashboards that aggregate the tables directly.
 *
 * They were produced by two now-fixed defects:
 *   1. DELETE only handled 6 of the 11 report tables, so deleting an
 *      AG1/AG2/ILA/GSC/WIFI report left all of its data behind.
 *   2. A failed file part-way through a bulk upload committed its data rows
 *      before the report_uploads row was ever written.
 *
 * SAFETY
 *   Preview is the default. Nothing is deleted unless you pass --delete.
 *   Deletes run in batches inside a transaction, one table at a time, and
 *   only ever target rows whose file_id has no report_uploads row.
 *
 * USAGE
 *   node scripts/cleanTowerReportOrphans.js                  # preview only
 *   node scripts/cleanTowerReportOrphans.js --table=ag2      # preview one table
 *   node scripts/cleanTowerReportOrphans.js --table=ag2 --delete
 *   node scripts/cleanTowerReportOrphans.js --delete         # every table
 *
 * TAKE A DATABASE BACKUP BEFORE USING --delete.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mysql = require("mysql2/promise");

const REPORT_TABLES = [
  "ag1", "ag2", "enb", "esc", "gnb", "gsc",
  "hpodsc", "ila", "isc", "osc", "wifi",
];

const BATCH_SIZE = 5000;

const args = process.argv.slice(2);
const shouldDelete = args.includes("--delete");
const tableArg = args.find((a) => a.startsWith("--table="));
const targetTables = tableArg
  ? [tableArg.split("=")[1].toLowerCase()].filter((t) => REPORT_TABLES.includes(t))
  : REPORT_TABLES;

if (tableArg && !targetTables.length) {
  console.error(`Unknown table. Allowed: ${REPORT_TABLES.join(", ")}`);
  process.exit(1);
}

// Scanning a large table without a file_id index can outlast the server's
// idle timeout, so each table gets its own short-lived connection.
const connect = () =>
  mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT),
    dateStrings: true,
    connectTimeout: 60_000,
  });

async function main() {
  const connection = await connect();

  console.log(shouldDelete
    ? "MODE: DELETE — orphan rows will be permanently removed.\n"
    : "MODE: PREVIEW — nothing will be deleted. Add --delete to actually remove.\n");

  // A NULL file_id in report_uploads would make a NOT IN comparison match
  // nothing and silently skip the cleanup, so verify there are none first.
  const [[nullCheck]] = await connection.query(
    "SELECT SUM(file_id IS NULL) AS null_file_ids FROM report_uploads"
  );
  if (Number(nullCheck.null_file_ids || 0) > 0) {
    console.error(
      `ABORTING: report_uploads has ${nullCheck.null_file_ids} row(s) with a NULL file_id.\n` +
      "Fix those rows first — otherwise this cleanup cannot tell orphans from valid data."
    );
    await connection.end();
    process.exit(1);
  }

  await connection.end();

  let grandTotal = 0;

  for (const table of targetTables) {
    const connection = await connect();
    try {
      const [[stats]] = await connection.query(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN u.id IS NULL THEN 1 ELSE 0 END) AS orphans
           FROM \`${table}\` d
           LEFT JOIN report_uploads u ON u.file_id = d.file_id`
      );

      const orphans = Number(stats.orphans || 0);
      const total = Number(stats.total || 0);
      grandTotal += orphans;

      if (!orphans) {
        console.log(`${table.padEnd(8)} clean (${total} rows, 0 orphaned)`);
        continue;
      }

      console.log(`${table.padEnd(8)} ${orphans} of ${total} rows are orphaned`);

      // Show which file_ids are affected so the result can be sanity-checked.
      const [samples] = await connection.query(
        `SELECT d.file_id, COUNT(*) AS rows_affected
           FROM \`${table}\` d
           LEFT JOIN report_uploads u ON u.file_id = d.file_id
          WHERE u.id IS NULL
          GROUP BY d.file_id
          ORDER BY rows_affected DESC`
      );
      samples.slice(0, 10).forEach((s) =>
        console.log(`           file_id=${s.file_id}  ${s.rows_affected} rows`));
      if (samples.length > 10) {
        console.log(`           ...and ${samples.length - 10} more file_id(s)`);
      }

      if (!shouldDelete) continue;

      // Delete one orphan file_id at a time, in batches. A multi-table
      // DELETE ... JOIN cannot take a LIMIT, so batching is done per file_id —
      // which also lets the file_id index do the work.
      let removed = 0;
      for (const { file_id: orphanFileId } of samples) {
        for (;;) {
          await connection.beginTransaction();
          try {
            const [result] = await connection.query(
              `DELETE FROM \`${table}\` WHERE file_id <=> ? LIMIT ${BATCH_SIZE}`,
              [orphanFileId]
            );
            await connection.commit();

            removed += result.affectedRows;
            process.stdout.write(`\r           deleted ${removed}/${orphans}...`);
            if (result.affectedRows < BATCH_SIZE) break;
          } catch (err) {
            await connection.rollback();
            throw err;
          }
        }
      }
      console.log(`\r           deleted ${removed} orphan rows from ${table}          `);
    } catch (err) {
      console.log(`${table.padEnd(8)} skipped (${err.code || err.message})`);
    } finally {
      try { await connection.end(); } catch { /* already closed */ }
    }
  }

  console.log(
    `\nTotal orphan rows ${shouldDelete ? "deleted" : "found"}: ${grandTotal}`
  );
  if (!shouldDelete && grandTotal) {
    console.log("Re-run with --delete to remove them (after taking a backup).");
  }
}

main().catch((err) => {
  console.error("Cleanup failed:", err.message);
  process.exit(1);
});
