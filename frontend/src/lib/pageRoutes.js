import { hasAccess } from "../utils/access";

/**
 * Single source of truth mapping a page's display name (the exact string passed
 * to <ProtectedRoute page="..."> in App.jsx) to the concrete dashboard route
 * that renders it.
 *
 * The array is ordered the same way the sidebar is: this is also the order in
 * which we pick a landing page for a user who lands on a page they cannot view.
 * Every entry here MUST be a route guarded by <ProtectedRoute page="<page>">
 * with the identical page string, otherwise a redirect could bounce forever.
 */
export const PAGE_ROUTES = [
  // MAIN
  { page: "Dashboard", path: "/dashboard" },
  { page: "Add Data", path: "/dashboard/add-data" },

  // BILLING
  { page: "Billing Dashboard", path: "/dashboard/billing" },
  { page: "Billing Status", path: "/dashboard/billing/status" },
  { page: "Revenue", path: "/dashboard/billing/revenue" },
  { page: "KPIs Penalty", path: "/dashboard/billing/penalties/kpis" },
  { page: "General Penalties", path: "/dashboard/billing/penalties/general" },
  { page: "Expense Management", path: "/dashboard/billing/expenses" },

  // EXPENSE CLAIMS
  { page: "My Expenses", path: "/dashboard/expense-claims/my" },
  { page: "Expense Approvals", path: "/dashboard/expense-claims/approvals" },
  { page: "Expense Finance", path: "/dashboard/expense-claims/finance" },
  { page: "Expense Advances", path: "/dashboard/expense-claims/advances" },
  { page: "Expense Claims Dashboard", path: "/dashboard/expense-claims/dashboard" },
  { page: "Expense Claims Admin", path: "/dashboard/expense-claims/admin" },

  // MANPOWER
  { page: "HR Dashboard", path: "/dashboard/hr-dashboard" },
  { page: "HR Analytics V2", path: "/dashboard/hr-analytics-v2" },
  { page: "Physical", path: "/dashboard/manpower/physical" },
  { page: "Attendance", path: "/dashboard/manpower/attendance" },
  { page: "Scrum", path: "/dashboard/manpower/scrum" },
  { page: "Scrum Dashboard", path: "/dashboard/manpower/scrum-dashboard" },
  { page: "New Joining", path: "/dashboard/manpower/new-joining" },
  { page: "Signoff", path: "/dashboard/manpower/signoff" },
  { page: "Manpower Settings", path: "/dashboard/manpower/settings" },

  // TRAINING
  { page: "Training", path: "/dashboard/training" },

  // REPORTS
  { page: "KPI Dashboard", path: "/dashboard/reports" },
  { page: "Tower Reports", path: "/dashboard/reports/tower" },
  { page: "NSO Fiber Performance", path: "/dashboard/reports/fiber/nso-dashboard" },
  { page: "NSO Reports", path: "/dashboard/reports/fiber/nso" },
  { page: "Fiber Reports", path: "/dashboard/reports/fiber/inventory" },
  { page: "View Reports", path: "/dashboard/reports/view" },

  // UPTIME / KPI
  { page: "Uptime Tower", path: "/dashboard/uptime/tower" },
  { page: "Uptime Fiber", path: "/dashboard/uptime/fiber" },
  { page: "Uptime FTTx", path: "/dashboard/uptime/fttx" },
  { page: "Tower KPI", path: "/dashboard/kpi/tower" },
  { page: "Fiber KPI", path: "/dashboard/kpi/fiber" },

  // SETTINGS
  { page: "Users", path: "/dashboard/users-access" },
];

/**
 * Resolve the first page (in sidebar order) the given user is allowed to View,
 * and return its route. Used to redirect users who open a URL for a page they
 * cannot access, and to pick the landing page right after login.
 *
 * Returns null when the user has View permission for no page at all — callers
 * should then show the "No access assigned" screen instead of redirecting.
 * Never returns a route the user cannot view, so it can't cause a redirect loop.
 *
 * @param {Object} user - user object from the session / /api/me
 * @returns {string|null} a dashboard route path, or null if nothing is permitted
 */
export function getFirstAllowedPath(user) {
  if (!user) return null;

  const match = PAGE_ROUTES.find((entry) => hasAccess(entry.page, user));
  return match ? match.path : null;
}

/**
 * Whether the user can View at least one page.
 * @param {Object} user
 * @returns {boolean}
 */
export function hasAnyAllowedPage(user) {
  return getFirstAllowedPath(user) !== null;
}
