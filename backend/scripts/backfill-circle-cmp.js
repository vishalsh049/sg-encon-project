// One-time cleanup: normalizes existing Circle/CMP values in new_joining and
// physical to the canonical names in ../constants/circles.js, using the same
// resolveCircle/resolveCmp resolver used by every write path (manual add,
// Excel/report upload, the New Joining -> Physical transfer endpoint). Fixes
// historical rows that predate that validation (e.g. circle stored as
// "Uttar Pradesh East-II" instead of "UP East").
//
//   node scripts/backfill-circle-cmp.js          -> dry run (prints diff/counts)
//   node scripts/backfill-circle-cmp.js --apply  -> writes the changes
//
// Never deletes rows. Rows whose Circle/CMP cannot be resolved at all are
// reported separately as "unresolved" (not silently skipped) so they can be
// reviewed and fixed by hand.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mysql = require("mysql2/promise");
const { resolveCircle, resolveCmp } = require("../constants/circles");

const TARGETS = [
  { table: "new_joining", circleColumn: "circle", cmpColumn: "cmp" },
  { table: "physical", circleColumn: "circle", cmpColumn: "cmp" },
];

(async () => {
  const apply = process.argv.includes("--apply");

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT),
    charset: "utf8mb4",
  });

  let totalChanged = 0;
  let totalUnresolved = 0;
  const allChanges = [];

  for (const target of TARGETS) {
    const [existingCols] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [process.env.DB_NAME, target.table]
    );
    const available = new Set(existingCols.map((c) => c.COLUMN_NAME));

    if (!available.has("id") || !available.has(target.circleColumn) || !available.has(target.cmpColumn)) {
      console.log(`-- skipping ${target.table} (table or required columns not found)`);
      continue;
    }

    const [rows] = await conn.query(
      `SELECT id, \`${target.circleColumn}\` AS circle, \`${target.cmpColumn}\` AS cmp FROM \`${target.table}\``
    );

    const changes = [];
    const unresolved = [];
    let unchanged = 0;

    for (const row of rows) {
      const resolvedCircle = resolveCircle(row.circle);

      if (!resolvedCircle) {
        unresolved.push({ id: row.id, circle: row.circle, cmp: row.cmp, reason: "circle" });
        continue;
      }

      const resolvedCmp = resolveCmp(resolvedCircle, row.cmp);

      if (!resolvedCmp) {
        unresolved.push({ id: row.id, circle: row.circle, cmp: row.cmp, reason: "cmp" });
        continue;
      }

      if (resolvedCircle !== row.circle || resolvedCmp !== row.cmp) {
        changes.push({
          id: row.id,
          before: { circle: row.circle, cmp: row.cmp },
          after: { circle: resolvedCircle, cmp: resolvedCmp },
        });
      } else {
        unchanged++;
      }
    }

    console.log(`\n== ${target.table}: ${rows.length} rows total ==`);
    console.log(`  ${changes.length} would be normalized, ${unchanged} already canonical, ${unresolved.length} unresolved`);

    for (const change of changes.slice(0, 10)) {
      console.log(
        `  id ${change.id}: circle ${JSON.stringify(change.before.circle)} -> ${JSON.stringify(change.after.circle)}, ` +
          `cmp ${JSON.stringify(change.before.cmp)} -> ${JSON.stringify(change.after.cmp)}`
      );
    }
    if (changes.length > 10) console.log(`  ... and ${changes.length - 10} more rows`);

    if (unresolved.length) {
      console.log(`  UNRESOLVED (needs manual review):`);
      for (const row of unresolved.slice(0, 20)) {
        console.log(`    id ${row.id}: circle=${JSON.stringify(row.circle)} cmp=${JSON.stringify(row.cmp)} (${row.reason} did not match the approved list)`);
      }
      if (unresolved.length > 20) console.log(`    ... and ${unresolved.length - 20} more rows`);
    }

    allChanges.push({ table: target.table, changes });
    totalChanged += changes.length;
    totalUnresolved += unresolved.length;
  }

  if (apply && totalChanged) {
    await conn.beginTransaction();
    try {
      for (const { table, changes } of allChanges) {
        for (const change of changes) {
          await conn.query(
            `UPDATE \`${table}\` SET circle = ?, cmp = ? WHERE id = ?`,
            [change.after.circle, change.after.cmp, change.id]
          );
        }
      }
      await conn.commit();
      console.log(`\nAPPLIED ${totalChanged} row updates.`);
    } catch (err) {
      await conn.rollback();
      throw err;
    }
  }

  console.log(
    `\n${apply ? "DONE" : "DRY RUN"} — ${totalChanged} rows ${apply ? "updated" : "would be updated"}, ${totalUnresolved} unresolved (left untouched).`
  );
  await conn.end();
})().catch((err) => {
  console.error("BACKFILL FAILED:", err.message);
  process.exit(1);
});
