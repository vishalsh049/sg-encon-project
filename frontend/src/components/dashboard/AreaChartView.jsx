import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { calcYAxis, getChartTheme, getEntityColor, getLabelStride } from "../../utils/chartMath";
import { ChartTooltip } from "./Tooltip";
import { createValueLabel } from "./ValueLabel";

const gradientId = (entity) => `area-grad-${entity.replace(/[^a-zA-Z0-9]/g, "")}`;

export default function AreaChartView({ chartData, entities, hiddenEntities, variant = "compact", dark = false }) {
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
        <AreaChart data={chartData} margin={{ top: 10, right: isCompact ? 8 : 20, left: isCompact ? -24 : -8, bottom: 0 }}>
          <defs>
            {entities.map((e, i) => (
              <linearGradient key={e} id={gradientId(e)} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={getEntityColor(e, i)} stopOpacity={0.35} />
                <stop offset="100%" stopColor={getEntityColor(e, i)} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
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
            <Area
              key={e}
              type="monotone"
              dataKey={e}
              name={e}
              stroke={getEntityColor(e, i)}
              strokeWidth={isCompact ? 1.5 : 2}
              fill={`url(#${gradientId(e)})`}
              connectNulls
              isAnimationActive={false}
            >
              <LabelList
                dataKey={e}
                content={createValueLabel({ mode: "point", seriesIndex: i, stride, variant, dark })}
              />
            </Area>
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
