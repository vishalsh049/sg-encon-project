import { createContext, useContext } from "react";

// Mirrors frontend/src/components/hrDashboard/hrDashboardCircleContext.js —
// carries the logged-in user's circle-permission scope (computed once in
// ScrumDashboard.jsx) down to the summary tables / EmployeeDrilldownModal
// without threading 3 extra props through every call site.
export const ScrumDashboardCircleContext = createContext({
  isAllCircleUser: true,
  userCircleLabel: null,
  allowedCircleLabels: [],
});

export function useScrumDashboardCircleContext() {
  return useContext(ScrumDashboardCircleContext);
}
