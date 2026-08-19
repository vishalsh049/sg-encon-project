// Single source of truth for the KPI Penalty categories, exact spelling as
// used in the source Excel template. Consumed by kpiPenaltyRoutes.js (both
// for row validation and the /meta endpoint), so the frontend filter never
// hardcodes a second copy that can drift.
const KPI_PENALTY_CATEGORIES = [
  "Tower",
  "ODSC",
  "ESC",
  "Facility",
  "Fiber",
  "FTTx F&D",
  "FTTx OLT",
];

module.exports = { KPI_PENALTY_CATEGORIES };
