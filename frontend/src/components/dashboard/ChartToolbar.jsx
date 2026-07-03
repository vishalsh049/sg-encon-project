import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, Image as ImageIcon, Maximize2, MoreVertical, RefreshCw } from "lucide-react";
import { exportChartAsCsv, exportChartAsPng } from "../../utils/chartExport";

export default function ChartToolbar({ kpiName, chartData, entities, containerRef, onFullscreen, onRefresh }) {
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const handleExportPng = () => {
    const svg = containerRef?.current?.querySelector("svg");
    if (svg) exportChartAsPng(svg, `${kpiName}_uptime.png`);
  };

  const handleExportCsv = () => {
    exportChartAsCsv(chartData, entities, `${kpiName}_uptime.csv`);
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
        title="Fullscreen"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition hover:bg-surface-muted hover:text-text-secondary"
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </button>

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(o => !o)}
          title="More options"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition hover:bg-surface-muted hover:text-text-secondary"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-8 z-40 min-w-[160px] rounded-xl border border-border-color bg-surface p-1.5 shadow-[0_10px_40px_rgba(15,23,42,0.14)]">
            <button
              onClick={() => { handleExportPng(); setMenuOpen(false); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-text-secondary hover:bg-surface-muted"
            >
              <ImageIcon className="h-3.5 w-3.5 text-text-muted" /> Export PNG
            </button>
            <button
              onClick={() => { handleExportCsv(); setMenuOpen(false); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-text-secondary hover:bg-surface-muted"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-text-muted" /> Export CSV
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
