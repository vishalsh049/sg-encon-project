import { createContext, useContext } from "react";

// Carries the logged-in user's circle-permission scope (already computed
// once in HrDashboard.jsx) down to RagTable / DrilldownModal without
// threading 3 extra props through every <TablePanel>/<RagTable> call site.
export const HrDashboardCircleContext = createContext({
  isAllCircleUser: true,
  userCircleLabel: null,
  allowedCircleLabels: [],
});

export function useHrDashboardCircleContext() {
  return useContext(HrDashboardCircleContext);
}
