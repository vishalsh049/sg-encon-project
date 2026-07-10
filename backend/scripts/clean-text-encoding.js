// One-time cleanup: repairs mojibake ("A-circumflex" U+00C2 left behind by
// UTF-8 bytes C2 A0 being decoded as Windows-1252) and normalizes invisible
// whitespace in existing rows.
//
//   node scripts/clean-text-encoding.js          -> dry run (prints changes)
//   node scripts/clean-text-encoding.js --apply  -> writes the changes
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mysql = require("mysql2/promise");
const { sanitizeText } = require("../utils/sanitizeText");

const A_CIRC = String.fromCharCode(0x00c2); // "Â"

const TARGETS = [
  {
    table: "new_joining",
    columns: ["employee_code", "employee_name", "circle", "cmp", "designation", "aadhaar_no"],
  },
  {
    table: "training_employees",
    columns: ["full_name", "circle", "training_batch", "designation_applied"],
  },
];

function cleanValue(value) {
  if (value === null || value === undefined) return value;

  // Stray U+00C2 before whitespace or at the end of the string is a mojibake
  // remnant whose NBSP partner was already trimmed off at insert time.
  const prepared = String(value)
    .normalize("NFC")
    .replace(new RegExp(A_CIRC + "(?=\s|$)", "g"), "");

  return sanitizeText(prepared);
}

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

  for (const target of TARGETS) {
    const [existingCols] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [process.env.DB_NAME, target.table]
    );
    const available = new Set(existingCols.map((c) => c.COLUMN_NAME));

    if (!available.has("id")) {
      console.log(`-- skipping ${target.table} (table or id column not found)`);
      continue;
    }

    const columns = target.columns.filter((c) => available.has(c));
    if (!columns.length) continue;

    const [rows] = await conn.query(
      `SELECT id, ${columns.map((c) => "`" + c + "`").join(", ")} FROM \`${target.table}\``
    );

    const changes = [];
    for (const row of rows) {
      const updates = {};
      for (const col of columns) {
        const cleaned = cleanValue(row[col]);
        if (cleaned !== row[col]) updates[col] = { before: row[col], after: cleaned };
      }
      if (Object.keys(updates).length) changes.push({ id: row.id, updates });
    }

    console.log(`\n== ${target.table}: ${changes.length} of ${rows.length} rows need cleanup ==`);
    for (const change of changes.slice(0, 10)) {
      for (const [col, diff] of Object.entries(change.updates)) {
        console.log(`  id ${change.id} ${col}: ${JSON.stringify(diff.before)} -> ${JSON.stringify(diff.after)}`);
      }
    }
    if (changes.length > 10) console.log(`  ... and ${changes.length - 10} more rows`);

    if (apply && changes.length) {
      await conn.beginTransaction();
      try {
        for (const change of changes) {
          const cols = Object.keys(change.updates);
          await conn.query(
            `UPDATE \`${target.table}\` SET ${cols.map((c) => "`" + c + "` = ?").join(", ")} WHERE id = ?`,
            [...cols.map((c) => change.updates[c].after), change.id]
          );
        }
        await conn.commit();
        console.log(`  APPLIED ${changes.length} row updates to ${target.table}`);
      } catch (err) {
        await conn.rollback();
        throw err;
      }
    }

    totalChanged += changes.length;
  }

  console.log(`\n${apply ? "DONE" : "DRY RUN"} — ${totalChanged} rows ${apply ? "updated" : "would be updated"}.`);
  await conn.end();
})().catch((err) => {
  console.error("CLEANUP FAILED:", err.message);
  process.exit(1);
});
