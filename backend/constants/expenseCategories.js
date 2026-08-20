// Default Expense Categories, seeded once into the expense_categories table
// if it's empty. New categories can be added later directly in that table
// (no code change required) — this list only exists to bootstrap it.
const DEFAULT_EXPENSE_CATEGORIES = [
  "Network / O&M",
  "Tower / Site",
  "Power & Energy",
  "Manpower",
  "Vehicle & Transport",
  "Material / Inventory",
  "Vendor / Contractor",
  "Civil Work",
  "Transmission / Fiber",
  "Office / Administration",
  "Travel",
  "IT / Software",
  "Safety",
  "Penalty / Compliance",
  "Other",
];

const EXPENSE_DOMAINS = ["Tower", "Fiber", "FTTx"];

const EXPENSE_STATUSES = ["pending", "approved", "rejected", "paid"];

module.exports = { DEFAULT_EXPENSE_CATEGORIES, EXPENSE_DOMAINS, EXPENSE_STATUSES };
