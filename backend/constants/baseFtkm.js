// Base FTKM (route length in km) per Circle + CMP/Scope — a static physical
// reference, not present in any uploaded NSO ticket row. It's the denominator
// in the FTKM formula (see getBaseFtkm below) confirmed against the user's
// real reference spreadsheet:
//   =IFERROR((((HI26/7)*31)/$C26)*1000, "0.00")
// where HI26 = that row's weekly Cuts count and $C26 = this table's value.
// Verified by reproducing 3 real (CMP, Scope, Week) rows exactly from the
// reference image, and by summing every scope under each circle and matching
// the shown circle totals (Delhi 13,153.05, Haryana 11,416.51,
// Punjab 18,350.85, UP East 29,624.73) — all four totals check out exactly.
//
// Seeded now per user request ("seed it now from the image, editable later").
// Not every administrative CMP (e.g. "<Circle> SHQ") has a dedicated fiber
// route, so not every entry in circles.js's CIRCLE_CMP_MAP appears here —
// that's expected, not a gap.
const BASE_FTKM_KM = {
  Delhi: {
    "Delhi-1 (West)": 1965.94,
    "Delhi-2 (South)": 1499.29,
    "Delhi-3 (Central-East)": 1530.08,
    "Delhi-4 (North)": 1958.46,
    "Faridabad (NCR)": 1453.70,
    "Ghaziabad (NCR)": 1168.23,
    "Gurgaon (NCR)": 1695.70,
    "Noida (NCR)": 1881.64,
  },
  Haryana: {
    Ambala: 1400.17,
    Hissar: 2192.98,
    Karnal: 1767.87,
    Panipat: 1966.31,
    Rewari: 1982.49,
    Rohtak: 2106.70,
  },
  Punjab: {
    Amritsar: 1858.86,
    // Real NSO ticket data spells this scope "Bhatinda" (no 'h' after the
    // 't'); the reference image spells it "Bathinda". Both are registered
    // below so real tickets resolve regardless of which spelling is used.
    Bathinda: 3837.63,
    Bhatinda: 3837.63,
    Chandigarh: 2117.25,
    Jalandhar: 2786.12,
    "Ludhiana-1": 1083.86,
    "Ludhiana-2": 1774.08,
    Pathankot: 1476.71,
    Patiala: 1502.14,
    Sangrur: 1914.20,
  },
  "UP East": {
    Allahabad: 4416.03,
    Azamgarh: 5587.98,
    Faizabad: 3743.33,
    Gorakhpur: 5392.77,
    Raibareilly: 4051.35,
    Varanasi: 6433.26,
  },
};

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

// circle -> Map(normalized cmp -> km), built once at module load.
const LOOKUP = new Map();
Object.entries(BASE_FTKM_KM).forEach(([circle, cmps]) => {
  const circleMap = new Map();
  Object.entries(cmps).forEach(([cmp, km]) => {
    circleMap.set(normalizeKey(cmp), km);
  });
  LOOKUP.set(normalizeKey(circle), circleMap);
});

// Returns the base route-km for a (circle, cmp) pair, or null if this
// CMP/Scope has no registered route length — callers should render that as
// "N/A", never silently divide by zero or invent a number.
function getBaseFtkm(circle, cmp) {
  const circleMap = LOOKUP.get(normalizeKey(circle));
  if (!circleMap) return null;
  const km = circleMap.get(normalizeKey(cmp));
  return typeof km === "number" ? km : null;
}

// Sum of every registered scope's base-km under a circle — used for
// circle-level FTKM totals. This must NOT be computed by summing individual
// scope FTKM rates (that's the same "averaging rates" error the MTTR rule
// warns about); the circle-level FTKM formula needs a single circle-level
// cuts count and this single circle-level km denominator, not a sum of
// already-normalized per-scope numbers.
// "Bhatinda" is a registered alias of "Bathinda" (same scope, two real-world
// spellings) — excluded here so a circle total doesn't double-count it.
const ALIAS_KEYS_EXCLUDED_FROM_TOTALS = new Set(["bhatinda"]);

const CANONICAL_CIRCLE_KEY = new Map(
  Object.keys(BASE_FTKM_KM).map((circle) => [normalizeKey(circle), circle])
);

function getCircleBaseFtkmTotal(circle) {
  const canonical = CANONICAL_CIRCLE_KEY.get(normalizeKey(circle));
  const entries = Object.entries((canonical && BASE_FTKM_KM[canonical]) || {});
  if (!entries.length) return null;
  let total = 0;
  for (const [cmp, km] of entries) {
    if (ALIAS_KEYS_EXCLUDED_FROM_TOTALS.has(normalizeKey(cmp))) continue;
    total += km;
  }
  return total || null;
}

module.exports = { BASE_FTKM_KM, getBaseFtkm, getCircleBaseFtkmTotal };
