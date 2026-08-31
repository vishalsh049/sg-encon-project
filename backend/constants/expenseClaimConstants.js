// -----------------------------------------------------------------------------
// Expense Claims module — shared constants.
//
// This is the employee reimbursement claim workflow. It is a DIFFERENT module
// from the operational "Expense Management" (backend/routes/expenseRoutes.js),
// which tracks company spend by circle/CMP/domain via Excel upload. The two do
// not share tables or routes.
// -----------------------------------------------------------------------------

// Claim-level status. The employee moves draft -> pending_l1; approvers move it
// down the chain; finance closes it. "returned" and "rejected" are terminal
// only in the sense that the claim stops advancing until acted on.
const CLAIM_STATUSES = [
  "draft",
  "pending_l1",
  "pending_l2",
  "pending_final",
  "final_approved",
  "pending_finance",
  "processing",
  "on_hold",
  "completed",
  "rejected",
  "returned",
];

// Which workflow stage currently "owns" the claim.
const CLAIM_STAGES = ["employee", "l1", "l2", "final", "finance", "completed"];

// A claim can only be edited by the employee while it is in one of these.
const EMPLOYEE_EDITABLE_STATUSES = ["draft", "returned"];

// Per expense-item decision vocabulary (used from Phase 2 onwards).
const ITEM_DECISIONS = ["pending", "approved_full", "approved_partial", "rejected"];

// Default master data — seeded once into their tables if empty. Everything is
// editable later from the Admin screen (Phase 9) with no code change.
const DEFAULT_CATEGORIES = [
  { name: "Travel", requiresBill: 1 },
  { name: "Hotel", requiresBill: 1 },
  { name: "Food", requiresBill: 0 },
  { name: "Local Conveyance", requiresBill: 0 },
  { name: "Fuel", requiresBill: 1 },
  { name: "Parking", requiresBill: 0 },
  { name: "Communication", requiresBill: 1 },
  { name: "Office Expense", requiresBill: 1 },
  { name: "Medical", requiresBill: 1 },
  { name: "Other", requiresBill: 0 },
];

const DEFAULT_SUB_CATEGORIES = {
  Travel: ["Air", "Train", "Bus", "Cab (Intercity)", "Toll", "Other"],
  Hotel: ["Room Tariff", "Meals (Hotel)", "Other"],
  Food: ["Breakfast", "Lunch", "Dinner", "Team Meal", "Other"],
  "Local Conveyance": ["Auto", "Taxi", "Metro", "Own Vehicle", "Other"],
  Fuel: ["Petrol", "Diesel", "CNG", "Other"],
  Parking: ["Airport", "Hotel", "Client Site", "Other"],
  Communication: ["Mobile Bill", "Internet", "Data Card", "Other"],
  "Office Expense": ["Stationery", "Courier", "Printing", "Pantry", "Other"],
  Medical: ["Consultation", "Medicines", "Diagnostics", "Other"],
  Other: ["Other"],
};

// Cost centres seeded on first run. Admin can add/deactivate later.
const DEFAULT_COST_CENTRES = [
  { name: "Head Office", code: "HO" },
  { name: "Delhi", code: "DEL" },
  { name: "Haryana", code: "HR" },
  { name: "Punjab", code: "PB" },
  { name: "Uttar Pradesh East", code: "UPE" },
];

// ---------------------------------------------------------------------------
// Dynamic Raise Expense — per-item classification (enhancement).
// UI labels are mapped here so the DB stores stable short values.
// ---------------------------------------------------------------------------

// Who the expense is for.
const EXPENSE_FOR = ["employee", "vendor"];

// Claim type — applies to both Employee and Vendor expenses.
const CLAIM_TYPES = [
  { value: "advance", label: "Advance", hint: "Request funds before spending" },
  {
    value: "reimbursement",
    label: "Reimbursement / After Expense",
    hint: "Claim an expense that has already been incurred",
  },
];

const BILLING_TYPES = [
  { value: "billable", label: "Billable" },
  { value: "non_billable", label: "Non-Billable" },
];

// The dynamic driver. Fixed set (not admin-editable) — the form logic keys off
// these exact names.
const WORK_CATEGORIES = ["O&M", "OOS", "Project"];

// Domain choices for O&M work.
const EXPENSE_CLAIM_DOMAINS = ["Fiber", "FTTx", "Utility", "Others"];

// Seed lists for the small admin-editable masters.
const DEFAULT_VENDOR_TYPES = [
  "Contractor",
  "Supplier",
  "Service Provider",
  "Transporter",
  "Manpower Agency",
  "Other",
];
const DEFAULT_EMPLOYEE_TYPES = [
  "On-Roll",
  "Off-Roll / Contract",
  "Third Party",
  "Sub-Contractor",
];

// Bill upload rules.
const ALLOWED_BILL_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"];
const ALLOWED_BILL_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];
const MAX_BILL_BYTES = 10 * 1024 * 1024; // 10 MB

// Page ids used by requirePagePermission() and the frontend permission map.
const PAGE_IDS = {
  employee: "my-expenses",
  approvals: "expense-approvals",
  finance: "expense-finance",
  dashboard: "expense-claims-dashboard",
  admin: "expense-claims-admin",
};

module.exports = {
  CLAIM_STATUSES,
  CLAIM_STAGES,
  EMPLOYEE_EDITABLE_STATUSES,
  ITEM_DECISIONS,
  DEFAULT_CATEGORIES,
  DEFAULT_SUB_CATEGORIES,
  DEFAULT_COST_CENTRES,
  EXPENSE_FOR,
  CLAIM_TYPES,
  BILLING_TYPES,
  WORK_CATEGORIES,
  EXPENSE_CLAIM_DOMAINS,
  DEFAULT_VENDOR_TYPES,
  DEFAULT_EMPLOYEE_TYPES,
  ALLOWED_BILL_EXTENSIONS,
  ALLOWED_BILL_MIME_TYPES,
  MAX_BILL_BYTES,
  PAGE_IDS,
};
