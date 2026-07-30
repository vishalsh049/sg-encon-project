import React from "react";
import { ResponsiveContainer, AreaChart, Area } from "recharts";

// Minimal axis-free trend indicator used inside KpiCard.
export default function Sparkline({ data, dataKey = "value", color = "#10b981", height = 40 }) {
  if (!data || data.length < 2) {
    return <div style={{ height }} className="flex items-center text-[10px] text-text-muted">No trend data</div>;
  }

  const gradientId = `spark-${color.replace("#", "")}`;

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            isAnimationActive
            animationDuration={600}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
