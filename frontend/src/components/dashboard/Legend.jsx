// Custom, clickable legend — recharts' built-in Legend doesn't give us
// per-entity show/hide toggling without re-implementing this anyway.
export default function ChartLegend({ entities, colorFor, hidden, onToggle }) {
  if (!entities?.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1 px-1 pb-1.5">
      {entities.map((e, i) => {
        const isHidden = hidden.has(e);
        return (
          <button
            key={e}
            type="button"
            onClick={() => onToggle(e)}
            title={isHidden ? `Show ${e}` : `Hide ${e}`}
            className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium transition hover:bg-surface-muted ${isHidden ? "opacity-40" : ""}`}
          >
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: colorFor(e, i) }} />
            <span className="text-text-secondary">{e}</span>
          </button>
        );
      })}
    </div>
  );
}
