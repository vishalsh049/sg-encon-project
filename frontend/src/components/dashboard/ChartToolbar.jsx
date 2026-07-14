import { useState } from "react";
import { Maximize2, RefreshCw } from "lucide-react";

// Compact per-card toolbar: Refresh + Fullscreen. Exports (PNG/CSV/PDF) live
// in the fullscreen analytics popup, so the card itself carries no menu.
export default function ChartToolbar({ onFullscreen, onRefresh }) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={handleRefresh}
        title="Refresh"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition hover:bg-surface-muted hover:text-text-secondary"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
      </button>

      <button
        onClick={onFullscreen}
        title="Open full analytics view"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition hover:bg-surface-muted hover:text-text-secondary"
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
