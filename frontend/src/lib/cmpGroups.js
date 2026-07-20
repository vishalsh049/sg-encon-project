// Single source of truth for the Circle -> CMP hierarchy on the frontend.
// Extracted out of frontend/src/pages/HrDashboard.jsx so the new drilldown
// popup (frontend/src/components/hrDashboard/DrilldownModal.jsx) can reuse
// the exact same list without duplicating it or creating a circular import
// between the page and the popup. Values are unchanged from the original
// HrDashboard.jsx definition.
export const cmpGroups = [
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

// Circle label derived straight from the cmpGroups titles, so adding a new
// circle group above automatically makes it a selectable circle everywhere
// on this page — no separate circle list to keep in sync.
export const circleLabelFromTitle = (title = "") =>
  title.replace(/\s*SHQ\s*$/i, "").trim();
