import React, { useState } from "react";
import { Info } from "lucide-react";

// Small hover/focus info affordance so every metric can carry a plain-English
// explanation (spec: "Every number should have tooltip, description, meaning").
export default function MetricTooltip({ text, className = "" }) {
  const [open, setOpen] = useState(false);

  if (!text) return null;

  return (
    <span
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        tabIndex={0}
        aria-label={text}
        className="text-text-muted hover:text-primary transition-colors"
      >
        <Info size={12} />
      </button>

      {open && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-xl border border-border-color bg-surface-elevated px-3 py-2 text-[11px] font-medium leading-4 text-text-secondary shadow-panel"
        >
          {text}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-border-color" />
        </span>
      )}
    </span>
  );
}
