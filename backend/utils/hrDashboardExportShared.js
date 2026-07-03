/*
 * Shared constants + filtering logic for the HR Dashboard Excel export.
 * These are verbatim copies of the constants/logic in
 * frontend/src/pages/HrDashboard.jsx so the exported workbook always
 * matches what is rendered on screen.
 */

const physicalDesignationColumns = [
  { key: "state_leadership_team", label: "State Leadership Team" },
  { key: "noc_executive", label: "NOC Executive" },
  { key: "analyst", label: "Analyst" },
  { key: "cmp_lead", label: "CMP Lead" },
  { key: "technician", label: "Technician" },
  { key: "rigger", label: "Rigger" },
  { key: "utility_supervisor", label: "Utility Supervisor" },
  { key: "utility_engineer", label: "Utility Engineer" },
  { key: "isp_engineer", label: "ISP Engineer" },
  { key: "wh_incharge_cum_security", label: "WH Incharge cum Security" },
  { key: "splicer", label: "Splicer" },
  { key: "assistant_splicer", label: "Assistant Splicer" },
  { key: "fiber_helper", label: "Fiber Helper" },
  { key: "patroller", label: "Patroller" },
  { key: "fiber_supervisor", label: "Fiber Supervisor" },
  { key: "fibre_engineer", label: "Fibre Engineer" },
  { key: "fttx_splicer", label: "FTTx Splicer" },
  { key: "fttx_assistant_splicer", label: "FTTx Assistant Splicer" },
  { key: "fttx_supervisor", label: "FTTx Supervisor" },
  { key: "fttx_helper", label: "FTTx Helper" },
  { key: "fttx_engineer", label: "FTTx Engineer" },
  { key: "fttx_technician", label: "FTTx Technician" },
];

const scrumDesignationColumns = physicalDesignationColumns;

const cmpGroups = [
  {
    title: "Delhi SHQ",
    items: [
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
  },
  {
    title: "Haryana SHQ",
    items: [
      "Haryana SHQ",
      "Ambala",
      "Hissar",
      "Karnal",
      "Panipat",
      "Palwal",
      "Rewari",
      "Rohtak",
    ],
  },
  {
    title: "Punjab SHQ",
    items: [
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
  },
  {
    title: "UP East SHQ",
    items: [
      "UP East SHQ",
      "Allahabad",
      "Azamgarh",
      "Faizabad",
      "Gorakhpur",
      "Raibareilly",
      "Varanasi",
    ],
  },
];

// Mirrors the dashboard's statCardConfig / categoryTotals grouping.
// Used to build the 3-row category header in the exported workbook.
const categoryGroups = [
  {
    key: "admin",
    label: "ADMIN",
    roleKeys: ["state_leadership_team", "noc_executive", "analyst", "cmp_lead"],
  },
  {
    key: "utility",
    label: "UTILITY & ISP",
    roleKeys: [
      "technician",
      "rigger",
      "utility_supervisor",
      "utility_engineer",
      "isp_engineer",
      "wh_incharge_cum_security",
    ],
  },
  {
    key: "fiber",
    label: "FIBER",
    roleKeys: [
      "splicer",
      "assistant_splicer",
      "fiber_helper",
      "patroller",
      "fiber_supervisor",
      "fibre_engineer",
    ],
  },
  {
    key: "fttx",
    label: "FTTX",
    roleKeys: ["fttx_splicer", "fttx_assistant_splicer", "fttx_supervisor", "fttx_helper"],
  },
  {
    key: "fttxPo",
    label: "FTTX PO BASED",
    roleKeys: ["fttx_engineer", "fttx_technician"],
  },
];

const normalizeCircle = (value = "") =>
  value
    .replace("Uttar Pradesh (East)", "UP East")
    .replace(/\s+/g, "")
    .toLowerCase()
    .trim();

const normalizeCmpName = (value = "") =>
  value.replace("Bhatinda", "Bathinda").trim().toLowerCase();

// Verbatim port of the `filteredGroups` useMemo in HrDashboard.jsx.
function buildFilteredGroups({ search = "", circle = "", cmp = "" }) {
  return cmpGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((cmpName) => {
        const searchMatch = cmpName.toLowerCase().includes(search.toLowerCase());

        const circleMatch =
          circle === "" ? true : group.title.toLowerCase().includes(circle.toLowerCase());

        const cmpMatch = cmp === "" ? true : cmpName === cmp;

        return searchMatch && circleMatch && cmpMatch;
      }),
    }))
    .filter((group) => group.items.length > 0);
}

module.exports = {
  physicalDesignationColumns,
  scrumDesignationColumns,
  cmpGroups,
  categoryGroups,
  normalizeCircle,
  normalizeCmpName,
  buildFilteredGroups,
};
