import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList } from "recharts";
import { calcYAxis, getChartTheme, getEntityColor, getLabelStride } from "../../utils/chartMath";
import { ChartTooltip } from "./Tooltip";
import { createValueLabel } from "./ValueLabel";

export default function LineChartView({ chartData, entities, hiddenEntities, variant = "compact", dark = false }) {
  const isCompact = variant === "compact";
  const theme = getChartTheme(dark);
  const stride = getLabelStride(chartData?.length, variant);

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
        <LineChart data={chartData} margin={{ top: 10, right: isCompact ? 8 : 20, left: isCompact ? -24 : -8, bottom: 0 }}>
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
                content={createValueLabel({ mode: "point", seriesIndex: i, stride, variant, dark })}
              />
            </Line>
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
