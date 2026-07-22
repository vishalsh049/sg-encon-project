import { memo, useCallback, useMemo, useState } from "react";
import LineChartView from "./LineChartView";
import BarChartView from "./BarChartView";
import TableView from "./TableView";
import StackedBarChart from "./StackedBarChart";
import ChartLegend from "./Legend";
import { orderEntities, getEntityColor } from "../../utils/chartMath";
import { useIsDarkMode } from "../../hooks/useIsDarkMode";

// The table renders its own header row; a colour legend above it means nothing.
const NO_LEGEND_TYPES = ["table"];

// Pure/presentational — dispatches to the selected chart view. No fetching;
// used both inside the compact per-card view and the fullscreen analytics popup.
// `verticalLabels` rotates every on-chart value label -90° — set only by the
// fullscreen analytics popup; dashboard cards keep horizontal labels.
function ChartRendererBase({ chartData, entities, chartType, variant = "compact", verticalLabels = false }) {
  const [hidden, setHidden] = useState(() => new Set());
  const dark = useIsDarkMode();

  const orderedEntities = useMemo(() => orderEntities(entities), [entities]);

  const toggleEntity = useCallback((entity) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(entity)) next.delete(entity);
      else next.add(entity);
      return next;
    });
  }, []);

  const commonProps = { chartData, entities: orderedEntities, hiddenEntities: hidden, variant, dark, verticalLabels };

  return (
    <div>
      {!NO_LEGEND_TYPES.includes(chartType) && (
        <ChartLegend entities={orderedEntities} colorFor={getEntityColor} hidden={hidden} onToggle={toggleEntity} />
      )}
      {chartType === "bar"     && <BarChartView {...commonProps} />}
      {chartType === "stacked" && <StackedBarChart {...commonProps} />}
      {chartType === "table"   && <TableView chartData={chartData} entities={orderedEntities} variant={variant} />}
      {/* Line is the default: any unrecognised type (e.g. a chart type removed
          after a user persisted it to localStorage) still renders something. */}
      {!["bar", "stacked", "table"].includes(chartType) && <LineChartView {...commonProps} />}
    </div>
  );
}

export default memo(ChartRendererBase);
