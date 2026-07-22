import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { calcYAxis, getChartTheme, getEntityColor, getLabelStride } from "../../utils/chartMath";
import { ChartTooltip } from "./Tooltip";
import { createValueLabel } from "./ValueLabel";

// Grouped bars are unreadable/slow past ~7 dates with 4-6 entities each —
// cap the rendered window and surface a note instead of forcing the caller
// to know about this limitation.
const BAR_CAP = 7;

export default function BarChartView({ chartData, entities, hiddenEntities, variant = "compact", dark = false, verticalLabels = false }) {
  const isCompact = variant === "compact";
  const theme = getChartTheme(dark);
  const source = chartData || [];
  const capped = source.length > BAR_CAP;
  const data = capped ? source.slice(-BAR_CAP) : source;
  const stride = getLabelStride(data.length, variant);
  // Narrow grouped bars (compact card + several entities) collide
  // horizontally with a horizontal label — rotate vertical instead.
  const rotate = (isCompact && entities.length > 3) || verticalLabels;
  // Headroom for rotated labels near the top of the plot (see LineChartView).
  const topMargin = verticalLabels ? (isCompact ? 34 : 46) : 10;

  const allVals = useMemo(() =>
    data.flatMap(row => entities.map(e => Number(row[e])).filter(v => v > 0)),
    [data, entities]
  );

  const { domain, ticks, tickFormatter } = useMemo(() => {
    if (!allVals.length) return { domain: [0, 100], ticks: undefined, tickFormatter: v => `${v}%` };
    return calcYAxis(allVals);
  }, [allVals]);

  if (!data.length) {
    return (
      <div className={`flex ${isCompact ? "h-40" : "h-72"} items-center justify-center rounded-2xl bg-surface-muted`}>
        <p className="text-xs text-text-muted">No data for selected range</p>
      </div>
    );
  }

  return (
    <div>
      {capped && (
        <p className="mb-1 px-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
          Bar view limited to the last {BAR_CAP} days — switch to Line/Area for the full range.
        </p>
      )}
      <div className={isCompact ? "h-36 w-full" : "h-[360px] w-full"}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: topMargin, right: isCompact ? 4 : 20, left: isCompact ? -28 : -8, bottom: 0 }} barCategoryGap="20%" barGap={2}>
            <CartesianGrid strokeDasharray="2 2" stroke={theme.grid} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: isCompact ? 8 : 11, fill: theme.tick }} axisLine={false} tickLine={false} />
            <YAxis
              domain={domain}
              ticks={ticks}
              tick={{ fontSize: isCompact ? 7.5 : 11, fill: theme.tickDim }}
              axisLine={false}
              tickLine={false}
              width={isCompact ? 28 : 44}
              tickFormatter={tickFormatter}
            />
            <Tooltip content={<ChartTooltip chartData={data} />} />
            {entities.map((e, i) => hiddenEntities.has(e) ? null : (
              <Bar
                key={e}
                dataKey={e}
                name={e}
                fill={getEntityColor(e, i)}
                radius={[3, 3, 0, 0]}
                maxBarSize={isCompact ? 14 : 32}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey={e}
                  content={createValueLabel({ mode: "bar", seriesIndex: i, stride, variant, dark, rotate })}
                />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
