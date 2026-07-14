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
// `vertical` renders every label rotated -90° (fullscreen analytics popup) —
// the host chart must reserve extra top margin for the rotated text height.
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
  vertical = false,
  minSegmentHeight = 13,
  fill,
}) {
  const isCompact = variant === "compact";
  const fontSize = isCompact ? 7 : 10;
  const textFill = fill || (dark ? "#e5e7eb" : "#374151");
  const band = seriesIndex % 3;
  // Approximate rendered length of "99.99%" — how far a rotated label
  // extends from its anchor, and the minimum stacked-segment height that
  // can contain it.
  const rotatedTextLength = Math.ceil(fontSize * 4);

  return function ValueLabel(props) {
    const { x, y, width = 0, height = 0, value, index } = props;
    if (value == null || (index != null && stride > 1 && index % stride !== 0)) return null;

    const text = formatPercentLabel(value);
    if (!text) return null;

    if (mode === "stackCenter") {
      const cx = x + width / 2;
      const cy = y + height / 2;
      if (vertical) {
        // Rotated text runs along the segment's height — hide it unless the
        // segment is tall enough to contain the full string.
        if (height < rotatedTextLength + 4) return null;
        return (
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={fontSize} fontWeight={700} fill="#ffffff" transform={`rotate(-90 ${cx} ${cy})`}>
            {text}
          </text>
        );
      }
      if (height < minSegmentHeight) return null;
      return (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={fontSize} fontWeight={700} fill="#ffffff">
          {text}
        </text>
      );
    }

    if (mode === "bar") {
      const cx = x + width / 2;
      const cy = y - (isCompact ? 3 : 5);
      if (rotate || vertical) {
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
    if (vertical) {
      // Rotated labels are only ~1 line thick, so instead of the horizontal
      // 3-band vertical stagger, spread same-date series into 3 narrow
      // columns around the point so close values can't overlap.
      const cx = x + (band - 1) * (fontSize + 2);
      const cy = y - 6;
      return (
        <text
          x={cx}
          y={cy}
          textAnchor="start"
          dominantBaseline="middle"
          fontSize={fontSize}
          fontWeight={600}
          fill={textFill}
          transform={`rotate(-90 ${cx} ${cy})`}
        >
          {text}
        </text>
      );
    }
    const dy = -(6 + band * (isCompact ? 7 : 9));
    return (
      <text x={x} y={y + dy} textAnchor="middle" fontSize={fontSize} fontWeight={600} fill={textFill}>
        {text}
      </text>
    );
  };
}
