import { Award, Gauge, TrendingDown, TrendingUp } from "lucide-react";
import { getHealthStatus } from "../../utils/kpiHealth";

function parseUptime(str) {
  const n = parseFloat(str);
  return Number.isFinite(n) ? n : null;
}

// Computed entirely client-side from the already-fetched towerCards array —
// no backend change needed for this summary.
export default function SummaryRow({ towerCards }) {
  const kpiUptimes = towerCards
    .map(c => ({ name: c.name, value: parseUptime(c.uptime) }))
    .filter(c => c.value != null);

  const overallUptime = kpiUptimes.length
    ? kpiUptimes.reduce((a, b) => a + b.value, 0) / kpiUptimes.length
    : null;

  const highestKpi = kpiUptimes.length ? kpiUptimes.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  const lowestKpi  = kpiUptimes.length ? kpiUptimes.reduce((a, b) => (b.value < a.value ? b : a)) : null;

  // Best/lowest circle — only among cards actually grouped by circle. A
  // card grouped by CMP has no comparable circle entities and would
  // otherwise get a CMP name compared against a circle name.
  const circleVals = {};
  towerCards
    .filter(c => c.groupBy === "circle")
    .forEach(c => {
      (c.entities || []).forEach(entity => {
        const vals = (c.chartData || [])
          .map(row => Number(row[entity]))
          .filter(v => v > 0);
        if (!vals.length) return;
        if (!circleVals[entity]) circleVals[entity] = [];
        circleVals[entity].push(...vals);
      });
    });

  const circleAverages = Object.entries(circleVals).map(([circle, vals]) => ({
    circle,
    avg: vals.reduce((a, b) => a + b, 0) / vals.length,
  }));

  const bestCircle   = circleAverages.length ? circleAverages.reduce((a, b) => (b.avg > a.avg ? b : a)) : null;
  const lowestCircle = circleAverages.length ? circleAverages.reduce((a, b) => (b.avg < a.avg ? b : a)) : null;

  // "Latest Avg" uses each card's own last available date — each KPI table
  // anchors to its own MAX(date) independently, so a literal "today" can be
  // empty on some tables while populated on others.
  const latestVals = towerCards.flatMap(c => {
    const last = (c.chartData || [])[c.chartData.length - 1];
    if (!last) return [];
    return (c.entities || []).map(e => Number(last[e])).filter(v => v > 0);
  });
  const latestAvg = latestVals.length ? latestVals.reduce((a, b) => a + b, 0) / latestVals.length : null;

  const overallHealth = overallUptime != null ? getHealthStatus(overallUptime) : null;

  const tiles = [
    { label: "Overall Uptime",  value: overallUptime != null ? `${overallUptime.toFixed(2)}%` : "—", icon: Gauge,        sub: overallHealth?.label },
    { label: "Best Circle",     value: bestCircle?.circle   || "—",                                    icon: TrendingUp,   sub: bestCircle   ? `${bestCircle.avg.toFixed(2)}%`   : null },
    { label: "Lowest Circle",   value: lowestCircle?.circle || "—",                                    icon: TrendingDown, sub: lowestCircle ? `${lowestCircle.avg.toFixed(2)}%` : null },
    { label: "Highest KPI",     value: highestKpi?.name     || "—",                                    icon: Award,        sub: highestKpi   ? `${highestKpi.value.toFixed(2)}%` : null },
    { label: "Lowest KPI",      value: lowestKpi?.name      || "—",                                    icon: Award,        sub: lowestKpi    ? `${lowestKpi.value.toFixed(2)}%`  : null },
    { label: "Latest Avg",      value: latestAvg != null ? `${latestAvg.toFixed(2)}%` : "—",           icon: Gauge,        sub: null },
  ];

  return (
    <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {tiles.map(t => (
        <div key={t.label} className="rounded-xl border border-border-color bg-surface p-3 shadow-sm">
          <div className="flex items-center gap-1 text-text-muted">
            <t.icon className="h-3 w-3" />
            <span className="text-[10px] font-bold uppercase tracking-[0.15em]">{t.label}</span>
          </div>
          <p className=" truncate text-md font-semibold text-text-primary">{t.value}</p>
          {t.sub && <p className="text-[11px] text-text-muted">{t.sub}</p>}
        </div>
      ))}
    </div>
  );
}
