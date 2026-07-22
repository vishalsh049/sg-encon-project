import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList } from "recharts";
import { calcYAxis, getChartTheme, getEntityColor, getLabelStride } from "../../utils/chartMath";
import { ChartTooltip } from "./Tooltip";
import { createValueLabel } from "./ValueLabel";

export default function LineChartView({ chartData, entities, hiddenEntities, variant = "compact", dark = false, verticalLabels = false }) {
  const isCompact = variant === "compact";
  const theme = getChartTheme(dark);
  const stride = getLabelStride(chartData?.length, variant);
  // Rotated labels extend upward from their anchor — reserve headroom so
  // labels on points near the top of the plot aren't clipped by the SVG edge.
  const topMargin = verticalLabels ? (isCompact ? 34 : 46) : 10;

  // recharts places category ticks with a "point" scale, which pins the
  // first/last point exactly at the plot's x=0 / x=width edge. A center-
  // anchored value label (or a rotated one, which fans out sideways from its
  // anchor) then draws partway outside the SVG's own bounds and gets clipped
  // — this is what cuts off the first date's label/dot. XAxis `padding`
  // reserves an inset at both ends of the scale so every point has room,
  // without shrinking the plot for every point in between.
  const edgePad = isCompact ? (verticalLabels ? 18 : 14) : (verticalLabels ? 26 : 20);

  const allVals = useMemo(() =>
    (chartData || []).flatMap(row => entities.map(e => Number(row[e])).filter(v => v > 0)),
    [chartData, entities]
  );

  const { domain, ticks, tickFormatter } = useMemo(() => {
    if (!allVals.length) return { domain: [0, 100], ticks: undefined, tickFormatter: v => `${v}%` };
    return calcYAxis(allVals);
  }, [allVals]);

  if (!chartData?.length) {
    return (
      <div className={`flex ${isCompact ? "h-40" : "h-72"} items-center justify-center rounded-2xl bg-surface-muted`}>
        <p className="text-xs text-text-muted">No data for selected range</p>
      </div>
    );
  }

  return (
    <div className={isCompact ? "h-40 w-full" : "h-[360px] w-full"}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: topMargin, right: isCompact ? 6 : 12, left: isCompact ? 2 : 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 2" stroke={theme.grid} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: isCompact ? 8 : 11, fill: theme.tick }}
            axisLine={false}
            tickLine={false}
            tickMargin={6}
            padding={{ left: edgePad, right: edgePad }}
            interval="preserveStartEnd"
            minTickGap={isCompact ? 12 : 20}
          />
          <YAxis
            domain={domain}
            ticks={ticks}
            tick={{ fontSize: isCompact ? 7.5 : 11, fill: theme.tickDim }}
            axisLine={false}
            tickLine={false}
            width={isCompact ? 28 : 44}
            tickFormatter={tickFormatter}
          />
          <Tooltip content={<ChartTooltip chartData={chartData} />} />
          {entities.map((e, i) => hiddenEntities.has(e) ? null : (
            <Line
              key={e}
              type="monotone"
              dataKey={e}
              name={e}
              stroke={getEntityColor(e, i)}
              strokeWidth={isCompact ? 1.75 : 2.25}
              dot={isCompact ? false : { r: 2.5 }}
              activeDot={{ r: 4 }}
              connectNulls
              isAnimationActive={false}
            >
              <LabelList
                dataKey={e}
                content={createValueLabel({ mode: "point", seriesIndex: i, stride, variant, dark, vertical: verticalLabels })}
              />
            </Line>
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
