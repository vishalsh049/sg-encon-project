// Shared custom tooltip for Line/Bar/Area chart views. Recharts clones this
// element and injects {active, payload, label}; chartData is passed through
// untouched so we can look up the prior data point for a trend diff.
export function ChartTooltip({ active, payload, label, chartData = [] }) {
  if (!active || !payload?.length) return null;

  const idx = chartData.findIndex(d => d.date === label);
  const prevRow = idx > 0 ? chartData[idx - 1] : null;

  return (
    <div className="min-w-[170px] rounded-xl border border-border-color bg-surface px-3 py-2 shadow-[0_10px_30px_rgba(15,23,42,0.14)]">
      <p className="mb-1 text-xs font-semibold text-text-primary">{label}</p>
      <div className="space-y-0.5">
        {payload.map(p => {
          const current = Number(p.value);
          const prev = prevRow ? Number(prevRow[p.dataKey]) : null;
          const diff = prev != null && Number.isFinite(prev) && Number.isFinite(current) ? current - prev : null;
          const trendUp = diff != null && diff > 0.001;
          const trendDown = diff != null && diff < -0.001;

          return (
            <div key={p.dataKey} className="flex items-center justify-between gap-4 text-[11px]">
              <span className="flex items-center gap-1.5 text-text-secondary">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                {p.dataKey}
              </span>
              <span className="flex items-center gap-1 font-semibold text-text-primary">
                {Number.isFinite(current) ? `${current.toFixed(2)}%` : "—"}
                {diff != null && (
                  <span className={trendUp ? "text-emerald-600 dark:text-emerald-400" : trendDown ? "text-rose-600 dark:text-rose-400" : "text-text-muted"}>
                    {trendUp ? "▲" : trendDown ? "▼" : "–"}{Math.abs(diff).toFixed(2)}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
