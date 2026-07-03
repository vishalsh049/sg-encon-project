import { formatPercentLabel } from "../../utils/chartMath";

// Shared value-label renderer used as a recharts `<LabelList content={...}/>`
// across Line/Area/Bar/Stacked/Combo, so "2 decimals + %, readable, no
// overlap" stays consistent instead of each chart reinventing its own label.
//
// - mode "point"       — Line/Area: label above the point, staggered into one
//                        of 3 vertical bands by seriesIndex so nearby series
//                        don't stack their labels directly on top of each other.
// - mode "bar"         — grouped Bar: centered above the bar; can rotate -90
//                        for narrow bars (compact view, many entities).
// - mode "stackCenter" — Stacked Bar: centered inside the segment; hidden if
//                        the segment is too short for the text to fit.
//
// `stride` thins labels on dense series (see getLabelStride) — only every
// Nth point renders a label, first/last always included since index % 1 === 0
// when stride is 1 (the common case: 7-day ranges show every point).
export function createValueLabel({
  mode = "point",
  seriesIndex = 0,
  stride = 1,
  variant = "compact",
  dark = false,
  rotate = false,
  minSegmentHeight = 13,
  fill,
}) {
  const isCompact = variant === "compact";
  const fontSize = isCompact ? 7 : 10;
  const textFill = fill || (dark ? "#e5e7eb" : "#374151");
  const band = seriesIndex % 3;

  return function ValueLabel(props) {
    const { x, y, width = 0, height = 0, value, index } = props;
    if (value == null || (index != null && stride > 1 && index % stride !== 0)) return null;

    const text = formatPercentLabel(value);
    if (!text) return null;

    if (mode === "stackCenter") {
      if (height < minSegmentHeight) return null;
      const cx = x + width / 2;
      const cy = y + height / 2;
      return (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={fontSize} fontWeight={700} fill="#ffffff">
          {text}
        </text>
      );
    }

    if (mode === "bar") {
      const cx = x + width / 2;
      const cy = y - (isCompact ? 3 : 5);
      if (rotate) {
        return (
          <text
            x={cx}
            y={cy}
            textAnchor="start"
            fontSize={fontSize}
            fontWeight={600}
            fill={textFill}
            transform={`rotate(-90 ${cx} ${cy})`}
          >
            {text}
          </text>
        );
      }
      return (
        <text x={cx} y={cy} textAnchor="middle" fontSize={fontSize} fontWeight={600} fill={textFill}>
          {text}
        </text>
      );
    }

    // "point" — Line/Area
    const dy = -(6 + band * (isCompact ? 7 : 9));
    return (
      <text x={x} y={y + dy} textAnchor="middle" fontSize={fontSize} fontWeight={600} fill={textFill}>
        {text}
      </text>
    );
  };
}
