// One-time sync: adds any designation from the provided master list that is
// missing from manpower_sub_profiles (the live Designation dropdown source,
// see services/manpowerConfigService.js) without touching any existing row.
//
// Matching uses the same normalizeRoleText() the app already uses to resolve
// designations (lowercase, strip spaces/hyphens/underscores/dots), so
// "NOC Lead" / "NOC LEAD" and "FTTx SME" / "FTTX SME" are treated as the same
// designation and never duplicated.
//
// New rows are inserted with main_profile_id = NULL, match_type = 'exact',
// source_scope = 'both' — identical shape to the many existing "valid
// dropdown pick, no Main Profile roll-up" rows already in the seed data
// (constants/manpowerSeedData.js lines 158-206).
//
//   node scripts/sync-designation-master-list.js          -> dry run (prints plan)
//   node scripts/sync-designation-master-list.js --apply  -> writes the inserts
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mysql = require("mysql2/promise");

function normalizeRoleText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-_.]/g, "");
}

const MASTER_LIST = [
  "Legal Executive", "National Commercial Manager", "National Operation Manager", "Engineer",
  "Utility PMO", "National Compliance Manager", "National Fiber Head", "National Commercial Executive",
  "Project Manager", "Administration", "MIS Coordinator", "Account Executive", "State Quality Head",
  "National HR Manager", "Zonal Utility SME", "Analyst - Planning", "OMCR Resources", "Analyst - Fiber",
  "Utility Supervisor", "Technician", "Circle Head", "Hr Head", "Supervisor", "State Head",
  "Vehicle Coordinator", "State Operation Head", "Operations Support Manager", "CMP Lead",
  "Cluster Incharge", "Energy MIS", "Electrical Supervisor", "Manager Billing",
  "Electrical Project-Billing", "Engineering Assistant Cum Designer", "Manager- Projects",
  "CAD Designer", "Site Engineer- Projects", "M/C Supervisor", "Project", "O&M Head",
  "Circle Operation Head", "Helper", "Technical Manager", "State HSEF Head", "SME Executive",
  "Energy Executive", "TCU Expert", "IME- Infra Manager", "DG Expert", "FRT Helper",
  "Analyst - Power & Fuel", "Patroller", "Assistant Splicer", "Rigger", "FTTx Engineer",
  "FTTx Splicer", "Splicer", "FTTx Technician", "Analyst - Material", "FTTx Supervisor",
  "NOC Executive", "Analyst - IPcolo", "Fiber Supervisor", "Analyst - Utility", "Analyst - D2D",
  "ISP Engineer", "Utility SME", "NOC Lead", "HSEF Lead", "Energy Lead", "Commercial Executive",
  "MIS Executive", "State ISP SME", "State HSEF Officer", "Utility Coordinator", "Office Boy",
  "Route Guard", "Utility Helper", "Admin Lead", "FTTx Helper", "Project Head", "Fiber SME",
  "FTTx SME", "FTTx Assistant Splicer", "Commercial Lead", "Assistant HR Manager", "Material Lead",
  "Analyst MIS", "Project MIS", "Fiber Engineer", "State Planning Manager", "Warehouse Incharge",
  "FTTx Lead", "Analyst - FTTx", "Analyst - ISP", "OMCR Lead", "Estate Executive", "State Fiber Head",
  "Utility Engineer", "Utility MIS Coordinator", "HR Executive", "State Energy Manager",
  "Zonal Fiber SME", "Analyst - PMO", "Legal Advisor", "Quality Lead", "Warehouse Security Guard",
  "WH Helper", "State FTTx SME", "Office Helper", "Project Technician", "ODSC Supervisor",
  "Warehouse Incharge Cum Security",
];

// Manually confirmed to be spelling typos of existing rows, not distinct
// designations (confirmed with the requester before applying):
//   "UTILITY CO-ORODINATOR" (existing) === "Utility Coordinator" (master list)
//   "ODSC Supevisor" (existing)        === "ODSC Supervisor" (master list)
// Excluded here so they are not inserted as near-duplicate rows.
const TREAT_AS_ALREADY_PRESENT = new Set(
  ["Utility Coordinator", "ODSC Supervisor"].map(normalizeRoleText)
);

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

  const [existingRows] = await conn.query(
    `SELECT id, designation_label FROM manpower_sub_profiles WHERE is_active = 1`
  );

  const existingByNorm = new Map();
  for (const row of existingRows) {
    const norm = normalizeRoleText(row.designation_label);
    if (!existingByNorm.has(norm)) existingByNorm.set(norm, []);
    existingByNorm.get(norm).push(row);
  }

  const alreadyPresent = [];
  const missing = [];
  const seenInMasterList = new Set();

  for (const label of MASTER_LIST) {
    const norm = normalizeRoleText(label);
    if (seenInMasterList.has(norm)) continue; // skip dupes within the master list itself
    seenInMasterList.add(norm);

    const match = existingByNorm.get(norm);
    if (match) {
      alreadyPresent.push({ masterLabel: label, matchedTo: match.map((m) => m.designation_label) });
    } else if (TREAT_AS_ALREADY_PRESENT.has(norm)) {
      alreadyPresent.push({ masterLabel: label, matchedTo: ["(manually confirmed typo of an existing row)"] });
    } else {
      missing.push(label);
    }
  }

  console.log(`Master list: ${MASTER_LIST.length} entries (${seenInMasterList.size} distinct after normalization)`);
  console.log(`Already present in manpower_sub_profiles: ${alreadyPresent.length}`);
  console.log(`Missing (to be added): ${missing.length}`);
  console.log("\n-- Missing designations --");
  missing.forEach((label) => console.log(`  + ${label}`));

  if (apply && missing.length) {
    for (const label of missing) {
      await conn.query(
        `INSERT INTO manpower_sub_profiles (main_profile_id, designation_label, match_type, source_scope) VALUES (NULL, ?, 'exact', 'both')`,
        [label]
      );
    }
    console.log(`\nAPPLIED — inserted ${missing.length} new Sub Profile rows.`);
  } else if (missing.length) {
    console.log("\nDRY RUN — no rows written. Re-run with --apply to insert the above.");
  } else {
    console.log("\nNothing to insert — every master list designation already exists.");
  }

  await conn.end();
})().catch((err) => {
  console.error("SYNC FAILED:", err.message);
  process.exit(1);
});
