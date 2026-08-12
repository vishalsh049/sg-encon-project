// Master Designation / Job Role list — the single approved source used by
// both the New Joining ("Designation") and Physical ("Job Role") pages, for
// manual add/edit, API requests and Excel uploads alike. The frontend never
// hardcodes this list; it fetches it from GET /api/designations (see
// ../routes/designationsRoutes.js) so both sides can never drift apart.
const DESIGNATIONS = [
  "FTTx Technician",
  "Technician",
  "FTTx Engineer",
  "Analyst",
  "State Fiber SME",
  "Fiber SME",
  "Assistant Splicer",
  "FTTx Splicer",
  "Splicer",
  "Rigger",
  "Patroller",
  "NOC Executive",
  "ISP Engineer",
  "Utility Supervisor",
  "FTTx Supervisor",
  "Fiber Supervisor",
  "Commercial Lead",
  "CMP Lead",
  "FTTx Assistant Splicer",
  "HSEF LEAD",
  "Energy Lead",
  "Circle Head",
  "WAREHOUSE SECURITY GUARD",
  "OMCR Lead",
  "FRT Helper",
  "Utility Helper",
  "Office Helper",
  "WH Helper",
  "Commercial Executive",
  "Project Technician",
  "Route Guard",
  "FTTx Helper",
  "State ISP SME",
  "FTTx Lead",
  "Estate Executive",
  "HR Executive",
  "State Utility SME",
  "ADMIN LEAD",
  "ODSC Supevisor",
  "State HR Head",
  "NOC LEAD",
  "QUALITY & PLANING HEAD",
  "UTILITY CO-ORODINATOR",
  "OFFICE BOY",
  "HR HEAD",
  "PROJECT LEAD",
  "FTTX SME",
  "ASSISTANT HR MANAGER",
  "MATERIAL LEAD",
  "HR MANAGER",
  "O & M HEAD",
  "Fiber Engineer",
  "Fiber Helper",
  "Utility Engineer",
  "State Planning Manager",
  "Warehouse Incharge",
  "State Operation Head",
  "State Material Manager",
  "State Energy Manager",
  "Quality Lead",
  "State Fiber Head",
  "State HSEF Officer",
  "State FTTx SME",
  "Warehouse Incharge Cum Security",
  "Warehouse Helper",
  "MIS Executive",
  "PROJECT MIS",
  "OMCR Resources",
  "Analyst - Material",
  "Analyst - Utility",
  "Analyst - Planning",
  "Analyst - Power & Fuel",
  "Analyst - Ipcolo",
  "Analyst - ISP",
  "Analyst - PMO",
  "Analyst - Fttx",
  "Analyst - Fiber",
  "Analyst - D2D",
  "Analyst - HSEF",
  "Asst Fiber SME",
  "Utility SME",
  "Utility MIS Coordinator",
  "MIS Coordinator",
  "Legal Executive",
  "Legal Advisor",
  "Project Head",
  "Material Helper",
  "Material Cordinator",
  "Analyst MIS",
  "Zonal Fiber SME",
  "Other Roles - Temporary Technician",
  // Added from the updated master Job Role list (2026-08-12) — these were
  // already valid in the manpower_sub_profiles dropdown source but missing
  // here, so Excel uploads/manual saves were wrongly rejecting them as
  // "Invalid Job Role" even though the dropdown offered them.
  "National Commercial Manager",
  "National Operation Manager",
  "Engineer",
  "Utility PMO",
  "National Compliance Manager",
  "National Fiber Head",
  "National Commercial Executive",
  "Project Manager",
  "Administration",
  "Account Executive",
  "State Quality Head",
  "National HR Manager",
  "Zonal Utility SME",
  "Supervisor",
  "State Head",
  "Vehicle Coordinator",
  "Operations Support Manager",
  "Cluster Incharge",
  "Energy MIS",
  "Electrical Supervisor",
  "Manager Billing",
  "Electrical Project-Billing",
  "Engineering Assistant Cum Designer",
  "Manager- Projects",
  "CAD Designer",
  "Site Engineer- Projects",
  "M/C Supervisor",
  "Project",
  "Circle Operation Head",
  "Helper",
  "Technical Manager",
  "State HSEF Head",
  "SME Executive",
  "Energy Executive",
  "TCU Expert",
  "IME- Infra Manager",
  "DG Expert",
];

// Case-insensitive, whitespace-collapsed comparison so "  fttx   technician ",
// "FTTX TECHNICIAN" and "FTTx Technician" are all treated as the same entry.
function normalizeDesignation(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

const DESIGNATION_LOOKUP = new Map(
  DESIGNATIONS.map((designation) => [normalizeDesignation(designation), designation])
);

// Historical spelling/formatting variants seen in real-world Excel uploads
// that must keep resolving to a canonical entry above (existing behaviour
// carried over from the Physical page's importer). Hyphens/underscores are
// collapsed to spaces before lookup, so "Fibre-Supervisor" also matches.
const DESIGNATION_ALIASES = {
  "fibre supervisor": "Fiber Supervisor",
  "wh incharge cum security": "Warehouse Incharge Cum Security",
  "anlayst mis": "Analyst MIS",
  "material coordinator": "Material Cordinator",
  "odsc supervisor": "ODSC Supevisor",
  "utility coordinator": "UTILITY CO-ORODINATOR",
  "utility co ordinator": "UTILITY CO-ORODINATOR",
  "quality & planning head": "QUALITY & PLANING HEAD",
  "cad desinger": "CAD Designer",
  "o&m head": "O & M HEAD",
  "manager projects.": "Manager- Projects",
};

function normalizeForAlias(value) {
  return normalizeDesignation(value).replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
}

const ALIAS_LOOKUP = new Map(
  Object.entries(DESIGNATION_ALIASES).map(([alias, canonical]) => [
    normalizeForAlias(alias),
    canonical,
  ])
);

// Hyphen/underscore-insensitive lookup of the canonical list itself, so
// entries like "Analyst - Material" also match "Analyst Material" or
// "Analyst_Material" (the Physical page's importer never required the exact
// punctuation before).
const DESIGNATION_LOOKUP_LOOSE = new Map(
  DESIGNATIONS.map((designation) => [normalizeForAlias(designation), designation])
);

// Resolves free-form input to its canonical (approved) designation string,
// or null if it doesn't match any entry in the approved list (directly, via
// hyphen/underscore-insensitive match, or via a known alias).
function resolveDesignation(value) {
  const exactMatch = DESIGNATION_LOOKUP.get(normalizeDesignation(value));
  if (exactMatch) return exactMatch;

  const looseMatch = DESIGNATION_LOOKUP_LOOSE.get(normalizeForAlias(value));
  if (looseMatch) return looseMatch;

  return ALIAS_LOOKUP.get(normalizeForAlias(value)) || null;
}

module.exports = {
  DESIGNATIONS,
  normalizeDesignation,
  resolveDesignation,
};
