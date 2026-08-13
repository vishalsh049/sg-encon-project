import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, RotateCcw } from "lucide-react";

import { DATE_RANGE_OPTIONS, DEFAULT_DATE_RANGE, dateRangeLabel, isDefaultDateRange } from "../../lib/attendanceDateRange";

export default function DateRangeFilter({ value, onChange }) {
  const containerRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  const selectPreset = (key) => {
    if (key === "custom") {
      onChange({ range: "custom", from: value.from || "", to: value.to || "" });
      return; // keep menu open so the user can pick from/to
    }
    onChange({ range: key, from: "", to: "" });
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange(DEFAULT_DATE_RANGE);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title="Filter every card, table and export by this date range"
        className="flex h-9 items-center gap-2 rounded-lg border border-border-color bg-surface px-3 text-sm font-medium text-text-secondary transition hover:text-text-primary"
      >
        <CalendarDays size={14} />
        <span>{dateRangeLabel(value)}</span>
        <ChevronDown size={14} className="text-text-muted" />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute left-0 top-11 z-[60] min-w-[220px] rounded-2xl border border-border-color bg-surface p-1.5 shadow-[0_10px_40px_rgba(15,23,42,0.18)]"
        >
          {DATE_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              role="menuitem"
              onClick={() => selectPreset(opt.key)}
              className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                value.range === opt.key
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
                  : "text-text-secondary hover:bg-surface-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}

          {value.range === "custom" && (
            <div className="mt-1 space-y-1.5 border-t border-border-color px-2 pt-2">
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                From
              </label>
              <input
                type="date"
                value={value.from}
                max={value.to || undefined}
                onChange={(e) => onChange({ range: "custom", from: e.target.value, to: value.to })}
                className="h-8 w-full rounded-lg border border-border-color bg-surface px-2 text-xs text-text-secondary outline-none focus:ring-2 focus:ring-blue-100"
              />
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                To
              </label>
              <input
                type="date"
                value={value.to}
                min={value.from || undefined}
                onChange={(e) => onChange({ range: "custom", from: value.from, to: e.target.value })}
                className="h-8 w-full rounded-lg border border-border-color bg-surface px-2 text-xs text-text-secondary outline-none focus:ring-2 focus:ring-blue-100"
              />
              {(!value.from || !value.to) && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">Pick both dates to apply.</p>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleClear}
            disabled={isDefaultDateRange(value)}
            className="mt-1 flex w-full items-center gap-2 rounded-xl border-t border-border-color px-3 pt-2 text-left text-xs font-medium text-text-muted transition hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw size={12} />
            Clear (reset to This Month)
          </button>
        </div>
      )}
    </div>
  );
}
