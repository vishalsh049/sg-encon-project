import { computeSummaryTiles } from "../../utils/kpiSummary";

// Six headline tiles derived client-side from the already-fetched towerCards —
// no extra request. The maths lives in utils/kpiSummary so the exported PDF
// report renders the exact same numbers.
export default function SummaryRow({ towerCards }) {
  const tiles = computeSummaryTiles(towerCards);

  return (
    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {tiles.map(t => (
        <div
          key={t.label}
          title={t.tip}
          className="rounded-xl border border-border-color bg-surface p-3 shadow-sm transition hover:border-border-strong hover:shadow-md"
        >
          <div className="flex items-center gap-1 text-text-muted">
            <t.icon className="h-3 w-3 flex-shrink-0" />
            <span className="truncate text-[10px] font-bold uppercase tracking-[0.15em]">{t.label}</span>
          </div>
          <p className="mt-0.5 truncate text-base font-semibold text-text-primary">{t.value}</p>
          {t.sub && <p className="truncate text-[11px] text-text-muted">{t.sub}</p>}
        </div>
      ))}
    </div>
  );
}
