import { Award, Gauge, TrendingDown, TrendingUp } from "lucide-react";
import { getHealthStatus } from "./kpiHealth";

function parseUptime(str) {
  const n = parseFloat(str);
  return Number.isFinite(n) ? n : null;
}

const pct = (n) => `${n.toFixed(2)}%`;

// Derives the six headline tiles from the already-fetched tower cards — no
// extra request. Lives in utils (not in SummaryRow) so the PDF/print report
// renders the identical numbers the user sees rather than recomputing them.
export function computeSummaryTiles(towerCards = []) {
  const kpiUptimes = towerCards
    .map(c => ({ name: c.name, value: parseUptime(c.uptime) }))
    .filter(c => c.value != null);

  const overallUptime = kpiUptimes.length
    ? kpiUptimes.reduce((a, b) => a + b.value, 0) / kpiUptimes.length
    : null;

  const highestKpi = kpiUptimes.length ? kpiUptimes.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  const lowestKpi  = kpiUptimes.length ? kpiUptimes.reduce((a, b) => (b.value < a.value ? b : a)) : null;

  // Best/lowest circle — only among cards actually grouped by circle. A card
  // grouped by CMP has no comparable circle entities and would otherwise get a
  // CMP name compared against a circle name.
  const circleVals = {};
  towerCards
    .filter(c => c.groupBy === "circle")
    .forEach(c => {
      (c.entities || []).forEach(entity => {
        const vals = (c.chartData || [])
          .map(row => Number(row[entity]))
          .filter(v => Number.isFinite(v) && v > 0);
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
    const rows = c.chartData || [];
    const last = rows[rows.length - 1];
    if (!last) return [];
    return (c.entities || []).map(e => Number(last[e])).filter(v => Number.isFinite(v) && v > 0);
  });
  const latestAvg = latestVals.length ? latestVals.reduce((a, b) => a + b, 0) / latestVals.length : null;

  const overallHealth = overallUptime != null ? getHealthStatus(overallUptime) : null;

  return [
    { label: "Overall Uptime", value: overallUptime != null ? pct(overallUptime) : "—", icon: Gauge, sub: overallHealth?.label ?? null,
      tip: "Unweighted average of the six KPI averages for the selected filters." },
    { label: "Best Circle",    value: bestCircle?.circle   || "—", icon: TrendingUp,   sub: bestCircle   ? pct(bestCircle.avg)   : null,
      tip: "Highest average uptime across circle-grouped KPIs." },
    { label: "Lowest Circle",  value: lowestCircle?.circle || "—", icon: TrendingDown, sub: lowestCircle ? pct(lowestCircle.avg) : null,
      tip: "Lowest average uptime across circle-grouped KPIs — the first place to investigate." },
    { label: "Highest KPI",    value: highestKpi?.name     || "—", icon: Award,        sub: highestKpi   ? pct(highestKpi.value) : null,
      tip: "Best-performing KPI over the selected period." },
    { label: "Lowest KPI",     value: lowestKpi?.name      || "—", icon: Award,        sub: lowestKpi    ? pct(lowestKpi.value)  : null,
      tip: "Worst-performing KPI over the selected period." },
    { label: "Latest Avg",     value: latestAvg != null ? pct(latestAvg) : "—",        icon: Gauge,      sub: "Most recent day",
      tip: "Average across all KPIs on each table's most recent reported date." },
  ];
}
