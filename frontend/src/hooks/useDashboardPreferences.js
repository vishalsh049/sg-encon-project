import { useCallback, useEffect, useState } from "react";
import { isChartType } from "../utils/chartTypes";

const STORAGE_KEY = "kpiDashboardPrefs";

const DEFAULT_PREFS = {
  chartType:      "line",
  selectedCircle: "",
  selectedCmp:    "",
  dateRange:      "last7",
  customFrom:     "",
  customTo:       "",
  collapsedCards: [],
};

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const stored = { ...DEFAULT_PREFS, ...JSON.parse(raw) };

    // A user whose last view was a since-removed chart type (area / heatmap /
    // combo / sparkline / kpi-comparison) would otherwise be stuck on a blank
    // dashboard forever, because the persisted value is restored on every load.
    if (!isChartType(stored.chartType)) stored.chartType = DEFAULT_PREFS.chartType;
    if (!Array.isArray(stored.collapsedCards)) stored.collapsedCards = [];

    return stored;
  } catch {
    return DEFAULT_PREFS;
  }
}

// Persists { chartType, selectedCircle, selectedCmp, dateRange } to
// localStorage so the dashboard restores the user's last view on reload.
export function useDashboardPreferences() {
  const [prefs, setPrefs] = useState(loadPrefs);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // localStorage unavailable (private mode / quota) — preferences just won't persist.
    }
  }, [prefs]);

  // Stable identity (useCallback) so memoized consumers don't re-render just
  // because the hook re-ran. Accepts either a patch object or a function of
  // the previous prefs returning a patch.
  const updatePrefs = useCallback((patch) => {
    setPrefs(prev => ({
      ...prev,
      ...(typeof patch === "function" ? patch(prev) : patch),
    }));
  }, []);

  return [prefs, updatePrefs];
}
