import { useEffect, useState } from "react";

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
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
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

  const updatePrefs = (patch) => setPrefs(prev => ({ ...prev, ...patch }));

  return [prefs, updatePrefs];
}
