// One-time sync: adds the required Circle -> CMP mappings to manpower_circles /
// manpower_cmps (the live source for GET /api/circles, which both the
// Physical and New Joining page dropdowns consume via useCircleOptions()).
//
// Matching uses the same normalization conventions already used by
// constants/circles.js (case/whitespace-insensitive exact match, plus a
// loose punctuation-insensitive pass) so formatting differences don't cause
// accidental duplicates. Existing rows are never modified.
//
// NOTE: constants/circles.js is a SEPARATE, still-live file used by the
// backend's save-path validation (manual add/edit, Excel upload, New
// Joining -> Physical transfer) — it is edited by hand alongside this
// script, not derived from the DB. Both must be kept in sync.
//
//   node scripts/sync-circle-cmp-master-list.js          -> dry run (prints plan)
//   node scripts/sync-circle-cmp-master-list.js --apply  -> writes the inserts
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mysql = require("mysql2/promise");

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}
function normalizeLooseKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[.\-_()&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// [circleName, [cmpName, ...]], in the order given in the master list.
const MASTER_MAP = [
  ["RJIO-NHQ", ["NHQ"]],
  [
    "TVI-HR",
    [
      "Haryana", "Kaithal", "Jhajjar", "Rohtak", "Rewari", "Hissar", "Jind", "Sirsa",
      "Fatehabad", "Sonipat", "Panipat", "Noida", "Faridabad", "Palwal", "Circle Office",
    ],
  ],
  ["TVI-PO", ["Ludhiana", "Jalandhar", "Amritsar", "Mohali"]],
  ["PKL Project Team", ["PKL"]],
  ["R.S Construction-M.P", ["Mandleshwar (M.P)-R.S Construction"]],
  ["Eagle Infra India-Jodhpur", ["Jodhpur-Eagle"]],
  ["L&T- Sirohi", ["Sirohi-L&T"]],
  ["RJIL-Jaipur", ["Jaipur"]],
  ["Indus-RJ", ["Kota", "SHQ", "Alwar"]],
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

  const [circleRows] = await conn.query(
    `SELECT id, name, display_order FROM manpower_circles WHERE is_active = 1`
  );
  const circleByNorm = new Map();
  const circleByLoose = new Map();
  let maxCircleOrder = -1;
  circleRows.forEach((row) => {
    circleByNorm.set(normalizeKey(row.name), row);
    circleByLoose.set(normalizeLooseKey(row.name), row);
    if (row.display_order > maxCircleOrder) maxCircleOrder = row.display_order;
  });

  const [cmpRows] = await conn.query(
    `SELECT id, circle_id, name, display_order FROM manpower_cmps WHERE is_active = 1`
  );
  const cmpByCircle = new Map(); // circle_id -> Map(normKey -> row)
  const cmpLooseByCircle = new Map();
  const cmpMaxOrderByCircle = new Map();
  cmpRows.forEach((row) => {
    if (!cmpByCircle.has(row.circle_id)) cmpByCircle.set(row.circle_id, new Map());
    if (!cmpLooseByCircle.has(row.circle_id)) cmpLooseByCircle.set(row.circle_id, new Map());
    cmpByCircle.get(row.circle_id).set(normalizeKey(row.name), row);
    cmpLooseByCircle.get(row.circle_id).set(normalizeLooseKey(row.name), row);
    const cur = cmpMaxOrderByCircle.get(row.circle_id) ?? -1;
    if (row.display_order > cur) cmpMaxOrderByCircle.set(row.circle_id, row.display_order);
  });

  const plan = []; // { circleName, circleAction: 'existing'|'new', circleId, cmps: [{name, action}] }
  let nextCircleOrder = maxCircleOrder + 1;

  for (const [circleName, cmpNames] of MASTER_MAP) {
    let circleRow = circleByNorm.get(normalizeKey(circleName)) || circleByLoose.get(normalizeLooseKey(circleName));
    const circleAction = circleRow ? "existing" : "new";
    const entry = { circleName, circleAction, matchedName: circleRow ? circleRow.name : null, cmps: [] };

    let circleId = circleRow ? circleRow.id : null;
    let cmpOrder = circleRow ? (cmpMaxOrderByCircle.get(circleRow.id) ?? -1) + 1 : 0;

    for (const cmpName of cmpNames) {
      let existingCmp = null;
      if (circleRow) {
        existingCmp =
          cmpByCircle.get(circleRow.id)?.get(normalizeKey(cmpName)) ||
          cmpLooseByCircle.get(circleRow.id)?.get(normalizeLooseKey(cmpName));
      }
      entry.cmps.push({
        name: cmpName,
        action: existingCmp ? "existing" : "new",
        matchedName: existingCmp ? existingCmp.name : null,
        order: cmpOrder,
      });
      if (!existingCmp) cmpOrder += 1;
    }

    entry.newCircleOrder = circleRow ? null : nextCircleOrder++;
    plan.push(entry);
  }

  let newCircles = 0;
  let newCmps = 0;
  let existingCircles = 0;
  let existingCmpCount = 0;

  console.log("-- Plan --");
  for (const entry of plan) {
    if (entry.circleAction === "existing") {
      existingCircles += 1;
      console.log(`Circle "${entry.circleName}": EXISTING (matched "${entry.matchedName}")`);
    } else {
      newCircles += 1;
      console.log(`Circle "${entry.circleName}": NEW (display_order ${entry.newCircleOrder})`);
    }
    for (const cmp of entry.cmps) {
      if (cmp.action === "existing") {
        existingCmpCount += 1;
        console.log(`   = CMP "${cmp.name}" already exists (matched "${cmp.matchedName}")`);
      } else {
        newCmps += 1;
        console.log(`   + CMP "${cmp.name}" -> to be added`);
      }
    }
  }

  console.log(
    `\nCircles: ${existingCircles} existing, ${newCircles} new. CMPs: ${existingCmpCount} existing, ${newCmps} new (total mappings ${existingCmpCount + newCmps}).`
  );

  if (!apply) {
    console.log("\nDRY RUN — no rows written. Re-run with --apply to insert the above.");
    await conn.end();
    return;
  }

  for (const entry of plan) {
    let circleId;
    if (entry.circleAction === "existing") {
      circleId = (circleByNorm.get(normalizeKey(entry.circleName)) || circleByLoose.get(normalizeLooseKey(entry.circleName))).id;
    } else {
      const result = await conn.query(
        `INSERT INTO manpower_circles (name, aliases, display_order) VALUES (?, '[]', ?)`,
        [entry.circleName, entry.newCircleOrder]
      );
      circleId = result[0].insertId;
    }

    for (const cmp of entry.cmps) {
      if (cmp.action === "existing") continue;
      await conn.query(
        `INSERT INTO manpower_cmps (circle_id, name, aliases, display_order) VALUES (?, ?, '[]', ?)`,
        [circleId, cmp.name, cmp.order]
      );
    }
  }

  console.log(`\nAPPLIED — inserted ${newCircles} new circle rows and ${newCmps} new CMP rows.`);
  await conn.end();
})().catch((err) => {
  console.error("SYNC FAILED:", err.message);
  process.exit(1);
});
