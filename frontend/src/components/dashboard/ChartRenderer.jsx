import { memo, useMemo, useState } from "react";
import LineChartView from "./LineChartView";
import BarChartView from "./BarChartView";
import AreaChartView from "./AreaChartView";
import TableView from "./TableView";
import HeatMapView from "./HeatMapView";
import StackedBarChart from "./StackedBarChart";
import ComboChartView from "./ComboChartView";
import SparklineView from "./SparklineView";
import ChartLegend from "./Legend";
import { orderEntities, getEntityColor } from "../../utils/chartMath";
import { useIsDarkMode } from "../../hooks/useIsDarkMode";

// Chart types whose legend is meaningless or handled internally.
const NO_LEGEND_TYPES = ["table", "sparkline"];

// Pure/presentational — dispatches to the selected chart view. No fetching;
// used both inside the compact per-card view and the fullscreen popup.
// `verticalLabels` rotates every on-chart value label -90° — set only by the
// fullscreen analytics popup; dashboard cards keep horizontal labels.
function ChartRendererBase({ chartData, entities, chartType, variant = "compact", verticalLabels = false }) {
  const [hidden, setHidden] = useState(() => new Set());
  const dark = useIsDarkMode();

  const orderedEntities = useMemo(() => orderEntities(entities), [entities]);

  const toggleEntity = (entity) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(entity)) next.delete(entity);
      else next.add(entity);
      return next;
    });
  };

  const commonProps = { chartData, entities: orderedEntities, hiddenEntities: hidden, variant, dark, verticalLabels };

  return (
    <div>
      {!NO_LEGEND_TYPES.includes(chartType) && (
        <ChartLegend entities={orderedEntities} colorFor={getEntityColor} hidden={hidden} onToggle={toggleEntity} />
      )}
      {chartType === "line" && <LineChartView {...commonProps} />}
      {chartType === "bar" && <BarChartView {...commonProps} />}
      {chartType === "area" && <AreaChartView {...commonProps} />}
      {chartType === "heatmap" && <HeatMapView {...commonProps} />}
      {chartType === "stacked" && <StackedBarChart {...commonProps} />}
      {chartType === "combo" && <ComboChartView {...commonProps} />}
      {chartType === "sparkline" && <SparklineView chartData={chartData} entities={orderedEntities} hiddenEntities={hidden} />}
      {chartType === "table" && <TableView chartData={chartData} entities={orderedEntities} variant={variant} />}
    </div>
  );
}

export default memo(ChartRendererBase);
