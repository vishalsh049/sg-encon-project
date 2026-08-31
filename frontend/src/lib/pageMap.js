/**
 * Page ID to Display Name Mapping
 * Maps the page IDs stored in database to the display names used in ProtectedRoute
 */
export const PAGE_ID_MAP = {
  // Dashboard
  "dashboard": "Dashboard",

  // Billing
  "billing-dashboard": "Billing Dashboard",
  "billing-status": "Billing Status",
  "revenue": "Revenue",

  // Penalties
  "kpis-penalty": "KPIs Penalty",
  "general-penalties": "General Penalties",
  "expense-management": "Expense Management",

  // Expense Claims (employee reimbursement workflow)
  "my-expenses": "My Expenses",
  "expense-approvals": "Expense Approvals",
  "expense-finance": "Expense Finance",
  "expense-claims-dashboard": "Expense Claims Dashboard",
  "expense-claims-admin": "Expense Claims Admin",

  // Manpower
  "physical": "Physical",
  "physical dashboard": "Physical",
  "attendance": "Attendance",
  "scrum": "Scrum",
  "scrum-dashboard": "Scrum Dashboard",
  "new-joining": "New Joining",

  // Training
  "training": "Training",

  // Reports
  "tower-reports": "Tower Reports",
  "reports-dashboard": "KPI Dashboard",
  "kpi-dashboard": "KPI Dashboard",
  "nso-fiber-dashboard": "NSO Fiber Performance",
  "nso-reports": "NSO Reports",
  "fiber-reports": "Fiber Reports",

  // Users & Access
  "users": "Users",

  // Other
  "add-data": "Add Data",
  "uptime-tower": "Uptime Tower",
  "uptime-fiber": "Uptime Fiber",
  "uptime-fttx": "Uptime FTTx",
  "tower-kpi": "Tower KPI",
  "fiber-kpi": "Fiber KPI",
  "view-reports": "View Reports",
};

/**
 * Convert page ID (from database) to display name (for ProtectedRoute)
 * @param {string} pageId - The page ID from database (e.g., "tower-reports")
 * @returns {string} - The display name (e.g., "Tower Reports")
 */
export const getPageDisplayName = (pageId) => {
  const normalized = String(pageId || "").trim().toLowerCase();
  return PAGE_ID_MAP[normalized] || pageId;
};

/**
 * Convert display name to page ID
 * @param {string} displayName - The display name (e.g., "Tower Reports")
 * @returns {string} - The page ID (e.g., "tower-reports")
 */
export const getPageId = (displayName) => {
  const normalized = String(displayName || "").trim().toLowerCase();
  // Find the key that maps to this display name
  for (const [id, name] of Object.entries(PAGE_ID_MAP)) {
    if (name.toLowerCase() === normalized) {
      return id;
    }
  }
  // Fallback: convert spaces to hyphens and lowercase
  return displayName.toLowerCase().replace(/\s+/g, "-");
};
