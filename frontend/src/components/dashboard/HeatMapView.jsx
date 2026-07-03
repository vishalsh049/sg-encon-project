import { useMemo } from "react";

// Green >=99.5%, Yellow 98-99.5%, Red <98%, gray = no data — same thresholds
// as utils/kpiHealth.js so the heat map and the card health badges agree.
function cellColor(value, dark) {
  if (value == null) return dark ? "bg-slate-800 text-slate-600" : "bg-slate-100 text-slate-300";
  if (value >= 99.5) return dark ? "bg-emerald-500/25 text-emerald-300" : "bg-emerald-100 text-emerald-700";
  if (value >= 98) return dark ? "bg-amber-500/25 text-amber-300" : "bg-amber-100 text-amber-700";
  return dark ? "bg-rose-500/25 text-rose-300" : "bg-rose-100 text-rose-700";
}

export default function HeatMapView({ chartData, entities, hiddenEntities, variant = "compact", dark = false }) {
  const visibleEntities = entities.filter(e => !hiddenEntities?.has(e));
  const isCompact = variant === "compact";

  const dates = useMemo(() => (chartData || []).map(row => row.date), [chartData]);

  if (!chartData?.length) {
    return (
      <div className={`flex ${isCompact ? "h-40" : "h-72"} items-center justify-center rounded-2xl bg-surface-muted`}>
        <p className="text-xs text-text-muted">No data for selected range</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate" style={{ borderSpacing: isCompact ? "3px" : "5px" }}>
        <thead>
          <tr>
            <th className="w-0" />
            {dates.map(d => (
              <th key={d} className={`whitespace-nowrap font-medium text-text-muted ${isCompact ? "text-[8px]" : "text-[11px]"}`}>
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleEntities.map(entity => (
            <tr key={entity}>
              <td className={`whitespace-nowrap pr-2 text-right font-medium text-text-secondary ${isCompact ? "text-[8px]" : "text-xs"}`}>
                {entity}
              </td>
              {chartData.map((row, i) => {
                const v = row[entity];
                return (
                  <td key={i}>
                    <div
                      title={v != null ? `${entity} · ${row.date}: ${Number(v).toFixed(2)}%` : `${entity} · ${row.date}: no data`}
                      className={`flex items-center justify-center rounded-md font-semibold ${cellColor(v, dark)} ${isCompact ? "h-5 w-5 text-[7px]" : "h-8 w-10 text-[10px]"}`}
                    >
                      {v != null ? Number(v).toFixed(0) : ""}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {!isCompact && (
        <div className="mt-3 flex items-center gap-4 text-[11px] text-text-muted">
          <span className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded ${cellColor(99.8, dark)}`} /> 99.5%+</span>
          <span className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded ${cellColor(98.5, dark)}`} /> 98%–99.5%</span>
          <span className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded ${cellColor(90, dark)}`} /> Below 98%</span>
        </div>
      )}
    </div>
  );
}
