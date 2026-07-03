import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getChartTheme, getEntityColor, getLabelStride } from "../../utils/chartMath";
import { ChartTooltip } from "./Tooltip";
import { createValueLabel } from "./ValueLabel";

// Total daily uptime composition across entities — stacked so the total bar
// height communicates each date's combined contribution, not a per-entity
// trend comparison (use Line/Area for that).
export default function StackedBarChart({ chartData, entities, hiddenEntities, variant = "compact", dark = false }) {
  const isCompact = variant === "compact";
  const theme = getChartTheme(dark);
  const stride = getLabelStride(chartData?.length, variant);

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
        <BarChart data={chartData} margin={{ top: 10, right: isCompact ? 4 : 20, left: isCompact ? -28 : -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 2" stroke={theme.grid} vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: isCompact ? 8 : 11, fill: theme.tick }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: isCompact ? 7.5 : 11, fill: theme.tickDim }} axisLine={false} tickLine={false} width={isCompact ? 28 : 44} />
          <Tooltip content={<ChartTooltip chartData={chartData} />} />
          {entities.map((e, i) => hiddenEntities.has(e) ? null : (
            <Bar
              key={e}
              dataKey={e}
              name={e}
              stackId="uptime"
              fill={getEntityColor(e, i)}
              radius={i === entities.length - 1 ? [3, 3, 0, 0] : 0}
              isAnimationActive={false}
            >
              <LabelList
                dataKey={e}
                content={createValueLabel({ mode: "stackCenter", stride, variant, dark, minSegmentHeight: isCompact ? 10 : 14 })}
              />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
