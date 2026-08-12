// Master Circle / CMP list — the single approved source used by both the
// New Joining and Physical pages, for manual add/edit, API requests and
// Excel/report uploads alike. Mirrors the structure of ./designations.js so
// both master lists stay consistent. The frontend never hardcodes these
// lists; it fetches them from GET /api/circles (see ../routes/circlesRoutes.js).
const CIRCLES = [
  "Punjab",
  "Haryana",
  "Delhi",
  "UP East",
  "RJIO-NHQ",
  "TVI-HR",
  "TVI-PO",
  "PKL Project Team",
  "R.S Construction-M.P",
  "Eagle Infra India-Jodhpur",
  "L&T- Sirohi",
  "RJIL-Jaipur",
  "Indus-RJ",
  "HMEL",
];

// "Mohali" is a confirmed real-world exception: 17 live Physical Manpower
// employees are recorded under circle "UP East" with this CMP. Geographically
// Mohali sits in Punjab, but it is grandfathered in here (approved) so those
// existing records remain valid to edit/save. "Nanded" was found in an older
// local copy of this map elsewhere in the codebase but has zero matching rows
// in either table, so it is intentionally not carried forward.
const CIRCLE_CMP_MAP = {
  Punjab: [
    "Punjab SHQ",
    "Amritsar",
    "Bathinda",
    "Chandigarh",
    "Jalandhar",
    "Ludhiana-1",
    "Ludhiana-2",
    "Pathankot",
    "Patiala",
    "Sangrur",
  ],
  Haryana: [
    "Haryana SHQ",
    "Ambala",
    "Hissar",
    "Karnal",
    "Panipat",
    "Palwal",
    "Rewari",
    "Rohtak",
  ],
  Delhi: [
    "Delhi SHQ",
    "Delhi-1 (West)",
    "Delhi-2 (South)",
    "Delhi-3 (Central-East)",
    "Delhi-4 (North)",
    "Faridabad (NCR)",
    "Ghaziabad (NCR)",
    "Gurgaon (NCR)",
    "Noida (NCR)",
  ],
  "UP East": [
    "UP East SHQ",
    "Allahabad",
    "Azamgarh",
    "Faizabad",
    "Gorakhpur",
    "Raibareilly",
    "Varanasi",
    "Mohali",
  ],
  "RJIO-NHQ": ["NHQ"],
  "TVI-HR": [
    "Haryana",
    "Kaithal",
    "Jhajjar",
    "Rohtak",
    "Rewari",
    "Hissar",
    "Jind",
    "Sirsa",
    "Fatehabad",
    "Sonipat",
    "Panipat",
    "Noida",
    "Faridabad",
    "Palwal",
    "Circle Office",
  ],
  "TVI-PO": ["Ludhiana", "Jalandhar", "Amritsar", "Mohali"],
  "PKL Project Team": ["PKL"],
  "R.S Construction-M.P": ["Mandleshwar (M.P)-R.S Construction"],
  "Eagle Infra India-Jodhpur": ["Jodhpur-Eagle"],
  "L&T- Sirohi": ["Sirohi-L&T"],
  "RJIL-Jaipur": ["Jaipur"],
  "Indus-RJ": ["Kota", "SHQ", "Alwar"],
  HMEL: ["PKL"],
};

// Case-insensitive, whitespace-collapsed comparison, same convention as
// normalizeDesignation() in ./designations.js.
function normalizeCircleKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

const CIRCLE_LOOKUP = new Map(
  CIRCLES.map((circle) => [normalizeCircleKey(circle), circle])
);

// Loose key: punctuation/hyphen/parenthesis-insensitive, and strips a
// trailing "circle"/"ii"/"2" token so suffixed variants like
// "Uttar Pradesh East-2", "Uttar Pradesh East-II" and
// "Uttar Pradesh East Circle" collapse to the same shape as "Uttar Pradesh East".
function normalizeCircleLooseKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[.\-_()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b(circle)\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*\b(ii|2)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const CIRCLE_LOOKUP_LOOSE = new Map(
  CIRCLES.map((circle) => [normalizeCircleLooseKey(circle), circle])
);

// Known real-world spelling/wording variants (not just formatting) that must
// still resolve to a canonical circle above.
const CIRCLE_ALIASES = {
  "uttar pradesh east": "UP East",
  "uttar pardesh east": "UP East",
  "u p east": "UP East", // "U.P. East" after period-stripping
};

const CIRCLE_ALIAS_LOOKUP = new Map(
  Object.entries(CIRCLE_ALIASES).map(([alias, canonical]) => [
    normalizeCircleLooseKey(alias),
    canonical,
  ])
);

// Resolves free-form circle input to its canonical name, or null if it
// doesn't match any entry in the approved list (directly, via loose
// formatting match, or via a known alias).
function resolveCircle(value) {
  const exactMatch = CIRCLE_LOOKUP.get(normalizeCircleKey(value));
  if (exactMatch) return exactMatch;

  const looseMatch = CIRCLE_LOOKUP_LOOSE.get(normalizeCircleLooseKey(value));
  if (looseMatch) return looseMatch;

  return CIRCLE_ALIAS_LOOKUP.get(normalizeCircleLooseKey(value)) || null;
}

function normalizeCmpKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// Loose CMP key: hyphens/underscores/parens/dots replaced with spaces (not
// removed) so "Delhi-1(West)" and "Delhi 1 West" both collapse to the same
// shape as the canonical "Delhi-1 (West)".
function normalizeCmpLooseKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[-_().]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CMP_LOOKUP = {};
const CMP_LOOKUP_LOOSE = {};
Object.entries(CIRCLE_CMP_MAP).forEach(([circle, cmps]) => {
  CMP_LOOKUP[circle] = new Map(cmps.map((cmp) => [normalizeCmpKey(cmp), cmp]));
  CMP_LOOKUP_LOOSE[circle] = new Map(
    cmps.map((cmp) => [normalizeCmpLooseKey(cmp), cmp])
  );
});

// Known real-world CMP spelling variants, flat (not circle-scoped) since no
// collisions are expected across circles in this list.
const CMP_ALIASES = {
  hisar: "Hissar",
};

const CMP_ALIAS_LOOKUP = new Map(
  Object.entries(CMP_ALIASES).map(([alias, canonical]) => [
    normalizeCmpLooseKey(alias),
    canonical,
  ])
);

// Resolves free-form CMP input, scoped to a circle, to its canonical name, or
// null if it doesn't belong to that circle's approved list. `circleInput` may
// be a raw (unresolved) circle string or an already-canonical one.
function resolveCmp(circleInput, value) {
  const circle = CIRCLE_CMP_MAP[circleInput]
    ? circleInput
    : resolveCircle(circleInput);
  if (!circle) return null;

  const looseValue = normalizeCmpLooseKey(value);
  const circlePrefix = normalizeCmpLooseKey(circle);

  // "State Team" (bare, or prefixed with its own circle name) is a known
  // real-world stand-in for that circle's SHQ bucket.
  if (looseValue === "state team" || looseValue === `${circlePrefix} state team`) {
    const shq = `${circle} SHQ`;
    return CIRCLE_CMP_MAP[circle].includes(shq) ? shq : null;
  }

  const exactMatch = CMP_LOOKUP[circle]?.get(normalizeCmpKey(value));
  if (exactMatch) return exactMatch;

  const looseMatch = CMP_LOOKUP_LOOSE[circle]?.get(looseValue);
  if (looseMatch) return looseMatch;

  const aliasMatch = CMP_ALIAS_LOOKUP.get(looseValue);
  // Defensive: only honour the alias if it's actually on this circle's list.
  if (aliasMatch && CIRCLE_CMP_MAP[circle].includes(aliasMatch)) return aliasMatch;

  return null;
}

module.exports = {
  CIRCLES,
  CIRCLE_CMP_MAP,
  resolveCircle,
  resolveCmp,
};
