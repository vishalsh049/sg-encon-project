/*
 * One-time seed data for the manpower_* settings tables, transcribed
 * verbatim from the hardcoded sources it replaces:
 *   - Main Profile list + labels: backend/routes/hrAnalyticsV2Routes.js
 *     (ROLE_KEY_LABELS / SIGNOFF_ROLE_KEYS / ALL_ROLE_KEYS)
 *   - Sub Profile / role_key mapping: backend/utils/roleKeyMapping.js
 *     (physicalRoleKeyCaseSql / scrumRoleKeyCaseSql), also duplicated in
 *     backend/routes/physicalRoutes.js, hrDashboardExport.js, manpowerRoutes.js
 *   - Designation dropdown master list: backend/constants/designations.js
 *   - Validation rules: frontend/src/pages/Physical.jsx (validateEmployeeForm)
 *     and frontend/src/pages/NewJoining.jsx (validateEmployeeForm)
 *
 * Only used once, by manpowerConfigService.ensureManpowerTables(), to
 * populate the tables the first time they're empty. Safe to edit after
 * go-live has no effect — from then on the Manpower Settings page is the
 * source of truth.
 */

// [roleKey, label, hasSignoffColumn]. Order matches the existing dashboards.
// technicianb/riggerb are real-world job roles with no sanctioned-headcount
// column on `signoff` (see hrAnalyticsV2Routes.js comment) — kept as valid
// "Available" buckets, just flagged as not backed by a Signoff column.
const MAIN_PROFILES = [
  ["state_leadership_team", "State Leadership Team", true],
  ["noc_executive", "NOC Executive", true],
  ["analyst", "Analyst", true],
  ["cmp_lead", "CMP Lead", true],
  ["technician", "Technician", true],
  ["rigger", "Rigger", true],
  ["utility_supervisor", "Utility Supervisor", true],
  ["utility_engineer", "Utility Engineer", true],
  ["isp_engineer", "ISP Engineer", true],
  ["wh_incharge_cum_security", "WH Incharge cum Security", true],
  ["splicer", "Splicer", true],
  ["assistant_splicer", "Assistant Splicer", true],
  ["fiber_helper", "Fiber Helper", true],
  ["patroller", "Patroller", true],
  ["fiber_supervisor", "Fiber Supervisor", true],
  ["fibre_engineer", "Fibre Engineer", true],
  ["fttx_splicer", "FTTx Splicer", true],
  ["fttx_assistant_splicer", "FTTx Assistant Splicer", true],
  ["fttx_supervisor", "FTTx Supervisor", true],
  ["fttx_helper", "FTTx Helper", true],
  ["fttx_engineer", "FTTx Engineer", true],
  ["fttx_technician", "FTTx Technician", true],
  ["technicianb", "Technician B", false],
  ["riggerb", "Rigger B", false],
];

// [roleKey, designationLabel, matchType, sourceScope]
// matchType: 'exact' | 'prefix' ('prefix' reproduces the one existing
// `LIKE 'analyst%'` wildcard). sourceScope: 'physical' | 'scrum' | 'both' —
// makes explicit the (previously undocumented) fact that the Physical-side
// and Scrum-side CASE mappings already disagree on a few aliases.
const SUB_PROFILES = [
  // State Leadership Team
  ["state_leadership_team", "State Energy Manager", "exact", "physical"],
  ["state_leadership_team", "State Fiber SME", "exact", "physical"],
  ["state_leadership_team", "State ISP SME", "exact", "physical"],
  ["state_leadership_team", "State Material Manager", "exact", "physical"],
  ["state_leadership_team", "State Operation Head", "exact", "physical"],
  ["state_leadership_team", "State Planning Manager", "exact", "physical"],
  ["state_leadership_team", "State Utility SME", "exact", "physical"],
  ["state_leadership_team", "State Leadership Team", "exact", "scrum"],
  ["state_leadership_team", "State Leadership", "exact", "scrum"],

  // NOC Executive
  ["noc_executive", "NOC Executive", "exact", "both"],

  // Analyst — prefix rule covers every "Analyst - X" variant on the physical
  // side; scrum only ever matches the bare word "Analyst".
  ["analyst", "Analyst", "prefix", "physical"],
  ["analyst", "Analyst", "exact", "scrum"],
  ["analyst", "Analyst - Material", "exact", "physical"],
  ["analyst", "Analyst - Utility", "exact", "physical"],
  ["analyst", "Analyst - Planning", "exact", "physical"],
  ["analyst", "Analyst - Power & Fuel", "exact", "physical"],
  ["analyst", "Analyst - Ipcolo", "exact", "physical"],
  ["analyst", "Analyst - ISP", "exact", "physical"],
  ["analyst", "Analyst - PMO", "exact", "physical"],
  ["analyst", "Analyst - Fttx", "exact", "physical"],
  ["analyst", "Analyst - Fiber", "exact", "physical"],
  ["analyst", "Analyst - D2D", "exact", "physical"],
  ["analyst", "Analyst - HSEF", "exact", "physical"],
  ["analyst", "Analyst MIS", "exact", "physical"],

  // CMP Lead
  ["cmp_lead", "CMP Lead", "exact", "both"],

  // Technician
  ["technician", "Technician", "exact", "both"],

  // Rigger
  ["rigger", "Rigger", "exact", "both"],

  // Utility Supervisor
  ["utility_supervisor", "Utility Supervisor", "exact", "both"],

  // Utility Engineer
  ["utility_engineer", "Utility Engineer", "exact", "both"],

  // ISP Engineer
  ["isp_engineer", "ISP Engineer", "exact", "both"],

  // WH Incharge Cum Security
  ["wh_incharge_cum_security", "Warehouse Incharge Cum Security", "exact", "both"],
  ["wh_incharge_cum_security", "WH Incharge cum Security", "exact", "both"],
  ["wh_incharge_cum_security", "Warehouse Incharge", "exact", "physical"],

  // Splicer
  ["splicer", "Splicer", "exact", "both"],

  // Assistant Splicer
  ["assistant_splicer", "Assistant Splicer", "exact", "both"],

  // Fiber Helper
  ["fiber_helper", "Fiber Helper", "exact", "both"],
  ["fiber_helper", "Fibre Helper", "exact", "both"],
  ["fiber_helper", "FRT Helper", "exact", "physical"],

  // Patroller
  ["patroller", "Patroller", "exact", "both"],

  // Fiber Supervisor
  ["fiber_supervisor", "Fiber Supervisor", "exact", "both"],
  ["fiber_supervisor", "Fibre Supervisor", "exact", "both"],

  // Fibre Engineer
  ["fibre_engineer", "Fiber Engineer", "exact", "both"],
  ["fibre_engineer", "Fibre Engineer", "exact", "both"],

  // FTTX Splicer
  ["fttx_splicer", "FTTx Splicer", "exact", "both"],

  // FTTX Assistant Splicer
  ["fttx_assistant_splicer", "FTTx Assistant Splicer", "exact", "both"],

  // FTTX Supervisor
  ["fttx_supervisor", "FTTx Supervisor", "exact", "both"],

  // FTTX Helper
  ["fttx_helper", "FTTx Helper", "exact", "both"],

  // FTTX Engineer
  ["fttx_engineer", "FTTx Engineer", "exact", "both"],

  // FTTX Technician
  ["fttx_technician", "FTTx Technician", "exact", "both"],

  // Technician B / Rigger B — no dedicated designation in designations.js
  // today, kept only so stray uploads aren't silently dropped.
  ["technicianb", "Technician B", "exact", "both"],
  ["riggerb", "Rigger B", "exact", "both"],

  // Designations that are valid dropdown picks (designations.js) but do not
  // roll up into any of the 22 Main Profiles today — mainProfileRoleKey is
  // null, same as falling through to ELSE NULL in the old CASE statements.
  ["", "Commercial Lead", "exact", "physical"],
  ["", "HSEF LEAD", "exact", "physical"],
  ["", "Energy Lead", "exact", "physical"],
  ["", "Circle Head", "exact", "physical"],
  ["", "WAREHOUSE SECURITY GUARD", "exact", "physical"],
  ["", "OMCR Lead", "exact", "physical"],
  ["", "Utility Helper", "exact", "physical"],
  ["", "Office Helper", "exact", "physical"],
  ["", "WH Helper", "exact", "physical"],
  ["", "Commercial Executive", "exact", "physical"],
  ["", "Project Technician", "exact", "physical"],
  ["", "Route Guard", "exact", "physical"],
  ["", "State ISP SME", "exact", "physical"],
  ["", "FTTx Lead", "exact", "physical"],
  ["", "Estate Executive", "exact", "physical"],
  ["", "HR Executive", "exact", "physical"],
  ["", "ADMIN LEAD", "exact", "physical"],
  ["", "ODSC Supevisor", "exact", "physical"],
  ["", "State HR Head", "exact", "physical"],
  ["", "NOC LEAD", "exact", "physical"],
  ["", "QUALITY & PLANING HEAD", "exact", "physical"],
  ["", "UTILITY CO-ORODINATOR", "exact", "physical"],
  ["", "OFFICE BOY", "exact", "physical"],
  ["", "HR HEAD", "exact", "physical"],
  ["", "PROJECT LEAD", "exact", "physical"],
  ["", "FTTX SME", "exact", "physical"],
  ["", "ASSISTANT HR MANAGER", "exact", "physical"],
  ["", "MATERIAL LEAD", "exact", "physical"],
  ["", "HR MANAGER", "exact", "physical"],
  ["", "O & M HEAD", "exact", "physical"],
  ["", "Quality Lead", "exact", "physical"],
  ["", "State Fiber Head", "exact", "physical"],
  ["", "State HSEF Officer", "exact", "physical"],
  ["", "State FTTx SME", "exact", "physical"],
  ["", "Warehouse Helper", "exact", "physical"],
  ["", "MIS Executive", "exact", "physical"],
  ["", "PROJECT MIS", "exact", "physical"],
  ["", "OMCR Resources", "exact", "physical"],
  ["", "Asst Fiber SME", "exact", "physical"],
  ["", "Utility SME", "exact", "physical"],
  ["", "Utility MIS Coordinator", "exact", "physical"],
  ["", "MIS Coordinator", "exact", "physical"],
  ["", "Legal Executive", "exact", "physical"],
  ["", "Legal Advisor", "exact", "physical"],
  ["", "Project Head", "exact", "physical"],
  ["", "Material Helper", "exact", "physical"],
  ["", "Material Cordinator", "exact", "physical"],
  ["", "Zonal Fiber SME", "exact", "physical"],
  ["", "Other Roles - Temporary Technician", "exact", "physical"],
];

// [fieldKey, ruleType, ruleValue, errorMessage, applyModules]
// ruleValue is a regex source string for 'regex', a JSON array for 'enum',
// or a JSON {min,max} object for 'range'. Transcribed from
// Physical.jsx:validateEmployeeForm and NewJoining.jsx:validateEmployeeForm.
const VALIDATION_RULES = [
  ["mobile_number", "regex", "^[6-9]\\d{9}$", "Enter a valid 10-digit mobile number", ["physical"]],
  ["pan_no", "regex", "^[A-Z]{5}[0-9]{4}[A-Z]{1}$", "Enter a valid PAN number", ["physical"]],
  ["aadhaar_no", "regex", "^\\d{12}$", "Enter a valid 12-digit Aadhaar number", ["physical", "new_joining"]],
  ["uan_no", "regex", "^\\d{12}$", "Enter a valid 12-digit UAN number", ["physical"]],
  ["esic_ip_no", "regex", "^\\d{10,17}$", "Enter a valid ESIC IP number", ["physical"]],
  ["ifsc_code", "regex", "^[A-Z]{4}0[A-Z0-9]{6}$", "Enter a valid IFSC code", ["physical"]],
  ["bank_account_no", "range", JSON.stringify({ minLength: 9 }), "Bank account number looks too short", ["physical"]],
  ["employment_status", "enum", JSON.stringify(["Active", "Inactive"]), "Select a valid employment status", ["physical"]],
  ["laptop_status", "enum", JSON.stringify(["Company", "Own", "Not Required"]), "Select a valid laptop status", ["physical"]],
  ["gtli", "enum", JSON.stringify(["Covered", "Pending", "Not Applicable"]), "Select a valid GTLI status", ["physical"]],
  ["pprj_status", "enum", JSON.stringify(["Active", "Inactive", "Pending", "Not Applicable"]), "Select a valid PPRJ status", ["physical"]],
  ["signoff_status", "enum", JSON.stringify(["R", "A", "G"]), "Select a valid signoff status", ["physical"]],
  ["joining_status", "enum", JSON.stringify(["Pending", "Joined", "Not Joined"]), "Select a valid joining status", ["new_joining"]],
  ["l2_status", "enum", JSON.stringify(["Pending", "Approved", "Rejected"]), "Select a valid L2 status", ["new_joining"]],
  ["employee_status", "enum", JSON.stringify(["Active", "Inactive"]), "Select a valid employee status", ["new_joining"]],
];

module.exports = {
  MAIN_PROFILES,
  SUB_PROFILES,
  VALIDATION_RULES,
};
