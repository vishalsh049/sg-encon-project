import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  MoreHorizontal,
  Network,
  PieChart,
  RefreshCcw,
  Waypoints,
  Zap,
} from "lucide-react";
import { useIsDarkMode } from "../../hooks/useIsDarkMode";

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
// Categorical slots 1-4 of the same validated enterprise palette the Uptime
// Trend card uses, so a circle/domain keeps one identity across the dashboard.
// Verified with the dataviz palette validator (light, surface #fcfcfb):
//   lightness band PASS · chroma floor PASS · CVD separation PASS
//   (worst adjacent pair #eda100 <-> #1baf7a, protan dE 9.1) · normal-vision PASS
//   contrast WARN -> relief is required, which is why every segment carries a
//   visible leader-line label AND a summary card rather than relying on hue.
//
// Assignment is fixed and never cycled or re-ordered by value: Fiber always
// reads blue, Utility always green, no matter which filter is active.
const SEGMENTS = [
  { key: "fiber", name: "Fiber", light: "#2a78d6", dark: "#3987e5", Icon: Waypoints },
  { key: "fttx", name: "FTTx", light: "#eb6834", dark: "#d95926", Icon: Network },
  { key: "utility", name: "Utility", light: "#1baf7a", dark: "#199e70", Icon: Zap },
  { key: "others", name: "Others", light: "#eda100", dark: "#c98500", Icon: MoreHorizontal },
];

// ---------------------------------------------------------------------------
// Geometry (SVG user units; the wrapper locks the matching aspect ratio so the
// absolutely-positioned HTML labels map onto the same coordinate space)
// ---------------------------------------------------------------------------
// Height is tuned so the ring plus its labels fill the box — a taller viewBox
// leaves the dead band under the donut that made the old card look empty.
const VIEW = { w: 460, h: 268 };
const CX = 230;
const CY = 134;
const R_OUT = 88;
const R_IN = 60;
const R_MID = (R_OUT + R_IN) / 2;
const RING_W = R_OUT - R_IN;
const CIRCUMFERENCE = 2 * Math.PI * R_MID;

// Half-extent of the ring including the hover lift (RING_W + 7), used to crop
// the compact viewBox tightly around the donut without clipping it.
const RING_HALF = R_OUT + 8;

const LEADER_R = R_OUT + 14; // where the diagonal leg ends
const LABEL_X_RIGHT = 356;
const LABEL_X_LEFT = 104;
const LABEL_MIN_GAP = 58; // three text lines + breathing room
const LABEL_Y_MIN = 26;
const LABEL_Y_MAX = VIEW.h - 26;

// Angular gap between arcs. The dataviz spec asks for a surface-coloured gap
// rather than a stroke outline, so this is a real hole the card shows through.
const GAP_PX = 6;

const COMPACT_BREAKPOINT = 470;

const formatCount = (value) => Number(value || 0).toLocaleString("en-IN");

const polar = (radius, angleDeg) => {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) };
};

// ---------------------------------------------------------------------------
// Motion helpers
// ---------------------------------------------------------------------------
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return reduced;
}

// Eased count-up for the centre total, so a filter change reads as a
// transition rather than a jump. Skipped entirely under reduced-motion.
// displayRef mirrors what is currently on screen, so an interrupted run
// always resumes from the visible number rather than snapping.
function useCountUp(value, reduced, duration = 650) {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);

  useEffect(() => {
    if (reduced) return undefined;

    const from = displayRef.current;
    if (from === value) return undefined;

    const start = performance.now();
    let frame = 0;

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (value - from) * eased);
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced, duration]);

  return reduced ? value : display;
}

// ---------------------------------------------------------------------------
// Label layout: place each arc's label on its own side, then push overlapping
// neighbours apart so text can never collide at any container width.
// ---------------------------------------------------------------------------
function layoutLabels(slices) {
  const placed = slices.map((slice) => {
    const point = polar(LEADER_R, slice.midAngle);
    const isRight = point.x >= CX;
    return { ...slice, isRight, idealY: point.y, y: point.y };
  });

  ["right", "left"].forEach((side) => {
    const group = placed
      .filter((item) => (side === "right" ? item.isRight : !item.isRight))
      .sort((a, b) => a.idealY - b.idealY);

    // Downward pass: guarantee the minimum gap between successive labels.
    for (let i = 0; i < group.length; i += 1) {
      const min = i === 0 ? LABEL_Y_MIN : group[i - 1].y + LABEL_MIN_GAP;
      group[i].y = Math.max(group[i].y, min);
    }

    // Upward correction: if the stack overflowed the card, walk it back up.
    for (let i = group.length - 1; i >= 0; i -= 1) {
      const max = i === group.length - 1 ? LABEL_Y_MAX : group[i + 1].y - LABEL_MIN_GAP;
      group[i].y = Math.min(group[i].y, max);
    }
  });

  return placed;
}

// ---------------------------------------------------------------------------
// Arc ring
// ---------------------------------------------------------------------------
// Mounted with key={sliceSignature} so a filter change remounts it and the
// draw-in replays from zero — no synchronous setState in an effect required.
function ArcRing({ slices, activeKey, reducedMotion, onEnter, onMove, onLeave }) {
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const open = drawn || reducedMotion;

  return (
    <g transform={`rotate(-90 ${CX} ${CY})`}>
      {slices.map((slice) => {
        const rawLen = slice.fraction * CIRCUMFERENCE;
        const len = Math.max(0.6, rawLen - GAP_PX);
        const offset = -(slice.startAngle / 360) * CIRCUMFERENCE - GAP_PX / 2;
        const isActive = activeKey === slice.key;
        const dim = activeKey && !isActive;

        return (
          <circle
            key={slice.key}
            cx={CX}
            cy={CY}
            r={R_MID}
            fill="none"
            stroke={slice.color}
            strokeWidth={isActive ? RING_W + 7 : RING_W}
            strokeLinecap="round"
            strokeDasharray={
              open ? `${len} ${CIRCUMFERENCE - len}` : `0 ${CIRCUMFERENCE}`
            }
            strokeDashoffset={offset}
            opacity={dim ? 0.28 : 1}
            tabIndex={0}
            role="button"
            aria-label={`${slice.name}: ${formatCount(slice.value)}, ${
              slice.percentage
            } percent`}
            className="cursor-pointer focus:outline-none"
            style={{
              transition: reducedMotion
                ? undefined
                : "stroke-dasharray 700ms cubic-bezier(0.22,1,0.36,1), stroke-width 200ms ease, opacity 200ms ease",
            }}
            onMouseEnter={(e) => onEnter(slice, e)}
            onMouseMove={(e) => onMove(slice, e)}
            onFocus={() => onEnter(slice, null)}
            onBlur={onLeave}
          />
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------
function CardFrame({ children, footer }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border-color/70 bg-surface shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
      {children}
      {footer}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <div className="relative h-[164px] w-[164px] animate-pulse">
        <div className="absolute inset-0 rounded-full bg-surface-muted" />
        <div className="absolute inset-[34px] rounded-full bg-surface" />
      </div>
      <div className="grid w-full grid-cols-2 gap-2">
        {SEGMENTS.map((s) => (
          <div key={s.key} className="h-14 animate-pulse rounded-xl bg-surface-muted" />
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted">
        <PieChart className="h-5 w-5 text-text-muted" />
      </div>
      <p className="text-sm font-semibold text-text-secondary">
        No scrum manpower
      </p>
      <p className="max-w-[240px] text-xs text-text-muted">
        No records match the selected circle, CMP or domain filters.
      </p>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10">
        <AlertTriangle className="h-5 w-5 text-red-500 dark:text-red-400" />
      </div>
      <p className="max-w-[260px] text-xs font-medium text-red-700 dark:text-red-400">
        {message || "Unable to load scrum manpower."}
      </p>
      {onRetry ? (
        <button onClick={onRetry} className="app-button-ghost px-3 py-1.5 text-xs">
          <RefreshCcw size={13} />
          Retry
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export default function ScrumManpowerCard({
  totals,
  status = "success",
  errorMessage = "",
  onRetry,
  lastUpdated = null,
}) {
  const dark = useIsDarkMode();
  const reducedMotion = usePrefersReducedMotion();

  const [activeKey, setActiveKey] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [compact, setCompact] = useState(false);


  const rootRef = useRef(null);
  const chartRef = useRef(null);

  // Width-driven, not viewport-driven: this card sits in a grid column, so the
  // breakpoint that matters is the column's width, not the window's.
  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width || 0;
      setCompact(width < COMPACT_BREAKPOINT);
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const data = useMemo(() => {
    const rows = SEGMENTS.map((segment) => ({
      ...segment,
      color: dark ? segment.dark : segment.light,
      value: Math.max(0, Number(totals?.[segment.key] || 0)),
    }));

    const total = rows.reduce((sum, row) => sum + row.value, 0);

    return {
      total,
      rows: rows.map((row) => ({
        ...row,
        percentage: total ? Number(((row.value / total) * 100).toFixed(1)) : 0,
      })),
    };
  }, [totals, dark]);

  // Only non-zero categories get an arc — a 0% slice has no geometry, so
  // drawing a leader line to it would point at nothing. Zero categories stay
  // fully visible in the summary cards below, marked as having no data.
  const slices = useMemo(() => {
    if (!data.total) return [];

    let cursor = 0;
    return data.rows
      .filter((row) => row.value > 0)
      .map((row) => {
        const fraction = row.value / data.total;
        const startAngle = cursor * 360;
        cursor += fraction;
        return {
          ...row,
          fraction,
          startAngle,
          midAngle: startAngle + (fraction * 360) / 2,
        };
      });
  }, [data]);

  const labels = useMemo(() => layoutLabels(slices), [slices]);

  const animatedTotal = useCountUp(data.total, reducedMotion);

  // Remount key for ArcRing — changes whenever the filtered dataset changes,
  // which replays the draw-in animation.
  const sliceSignature = slices.map((s) => `${s.key}:${s.value}`).join("|");

  const showTooltip = useCallback((slice, event) => {
    const host = chartRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    setTooltip({
      key: slice.key,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      width: rect.width,
    });
  }, []);

  const clearHover = useCallback(() => {
    setActiveKey(null);
    setTooltip(null);
  }, []);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdated) return null;
    const date = lastUpdated instanceof Date ? lastUpdated : new Date(lastUpdated);
    if (Number.isNaN(date.valueOf())) return null;
    return date.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }, [lastUpdated]);

  const header = (
    <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-4">
      <h4 className="text-[15px] font-semibold tracking-[-0.01em] text-text-primary">
        Scrum Manpower
      </h4>
      <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
        By Domain
      </span>
    </div>
  );

  const footer = lastUpdatedLabel ? (
    <div className="flex items-center justify-center gap-1.5 border-t border-border-color/70 px-5 py-2.5 text-[11px] text-text-muted">
      <CalendarClock className="h-3.5 w-3.5" />
      Last Updated: {lastUpdatedLabel}
    </div>
  ) : null;

  if (status === "loading") {
    return (
      <div ref={rootRef} className="h-full">
        <CardFrame footer={footer}>
          {header}
          <LoadingState />
        </CardFrame>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div ref={rootRef} className="h-full">
        <CardFrame footer={footer}>
          {header}
          <ErrorState message={errorMessage} onRetry={onRetry} />
        </CardFrame>
      </div>
    );
  }

  if (!data.total) {
    return (
      <div ref={rootRef} className="h-full">
        <CardFrame footer={footer}>
          {header}
          <EmptyState />
        </CardFrame>
      </div>
    );
  }

  const activeSlice = data.rows.find((row) => row.key === activeKey) || null;
  const tooltipSlice =
    tooltip && data.rows.find((row) => row.key === tooltip.key);

  // Crop the viewBox to the donut when the column is too narrow for side
  // labels — the summary cards below already carry every value. The crop must
  // stay centred on (CX, CY); an off-centre crop combined with a visible
  // overflow lets the ring paint straight over the cards underneath.
  const viewBox = compact
    ? `${CX - RING_HALF} ${CY - RING_HALF} ${RING_HALF * 2} ${RING_HALF * 2}`
    : `0 0 ${VIEW.w} ${VIEW.h}`;
  const aspect = compact ? "1 / 1" : `${VIEW.w} / ${VIEW.h}`;

  return (
    <div ref={rootRef} className="h-full">
      <CardFrame footer={footer}>
        {header}

        <div className="flex flex-1 flex-col px-5 pb-4">
          {/* ---------------- donut + leader labels ---------------- */}
          <div
            ref={chartRef}
            className="relative mx-auto w-full"
            style={{ aspectRatio: aspect, maxWidth: compact ? 300 : "100%" }}
            onMouseLeave={clearHover}
          >
            <svg
              viewBox={viewBox}
              className="h-full w-full"
              role="img"
              aria-label={`Scrum manpower by domain. Total ${formatCount(
                data.total
              )}. ${data.rows
                .map((r) => `${r.name} ${formatCount(r.value)}, ${r.percentage}%`)
                .join(". ")}`}
            >
              {/* track keeps the ring readable when one slice dominates */}
              <circle
                cx={CX}
                cy={CY}
                r={R_MID}
                fill="none"
                strokeWidth={RING_W}
                className="stroke-surface-muted"
                opacity={0.55}
              />

              {/* leader lines (hidden when cropped to compact) */}
              {!compact &&
                labels.map((label) => {
                  const start = polar(R_OUT + 3, label.midAngle);
                  const elbowX = polar(LEADER_R + 6, label.midAngle).x;
                  const endX = label.isRight ? LABEL_X_RIGHT - 8 : LABEL_X_LEFT + 8;
                  const isActive = activeKey === label.key;
                  const dim = activeKey && !isActive;

                  return (
                    <path
                      key={`leader-${label.key}`}
                      d={`M ${start.x} ${start.y} L ${elbowX} ${label.y} L ${endX} ${label.y}`}
                      fill="none"
                      stroke={label.color}
                      strokeWidth={isActive ? 1.6 : 1}
                      strokeLinecap="round"
                      opacity={dim ? 0.2 : isActive ? 0.9 : 0.45}
                      style={{
                        transition: reducedMotion
                          ? undefined
                          : "opacity 180ms ease, stroke-width 180ms ease",
                      }}
                    />
                  );
                })}

              {/* arcs — stroke-dash technique gives rounded caps and a real
                  surface-coloured gap without any per-segment path maths */}
              <ArcRing
                key={sliceSignature}
                slices={slices}
                activeKey={activeKey}
                reducedMotion={reducedMotion}
                onEnter={(slice, event) => {
                  setActiveKey(slice.key);
                  if (event) showTooltip(slice, event);
                }}
                onMove={showTooltip}
                onLeave={clearHover}
              />
            </svg>

            {/* centre readout */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="font-bold leading-none tracking-[-0.02em] text-text-primary"
                style={{ fontSize: compact ? 26 : 30 }}
              >
                {formatCount(activeSlice ? activeSlice.value : animatedTotal)}
              </span>
              <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                {activeSlice ? activeSlice.name : "Total"}
              </span>
            </div>

            {/* leader-line labels, positioned in the SVG's coordinate space */}
            {!compact &&
              labels.map((label) => {
                const isActive = activeKey === label.key;
                const dim = activeKey && !isActive;

                return (
                  <div
                    key={`label-${label.key}`}
                    onMouseEnter={() => setActiveKey(label.key)}
                    className="absolute flex cursor-default flex-col"
                    style={{
                      left: `${((label.isRight ? LABEL_X_RIGHT : 0) / VIEW.w) * 100}%`,
                      width: `${(LABEL_X_LEFT / VIEW.w) * 100}%`,
                      top: `${(label.y / VIEW.h) * 100}%`,
                      transform: "translateY(-50%)",
                      alignItems: label.isRight ? "flex-start" : "flex-end",
                      opacity: dim ? 0.45 : 1,
                      transition: reducedMotion
                        ? undefined
                        : "opacity 180ms ease, transform 180ms ease",
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor: label.color,
                          boxShadow: isActive ? `0 0 0 3px ${label.color}26` : "none",
                        }}
                      />
                      <span className="truncate text-[12px] font-medium text-text-secondary">
                        {label.name}
                      </span>
                    </div>
                    <span className="mt-0.5 text-[17px] font-bold leading-tight tracking-[-0.01em] text-text-primary">
                      {formatCount(label.value)}
                    </span>
                    <span className="text-[11px] font-medium text-text-muted">
                      {label.percentage}%
                    </span>
                  </div>
                );
              })}

            {/* tooltip: values lead, label follows; keyed by a short stroke */}
            {tooltipSlice ? (
              <div
                className="pointer-events-none absolute z-20 w-[178px] rounded-xl border border-border-color bg-surface-elevated p-3 shadow-[0_16px_40px_rgba(15,23,42,0.18)]"
                style={{
                  left: Math.min(
                    Math.max(tooltip.x + 14, 8),
                    Math.max(8, (tooltip.width || 0) - 186)
                  ),
                  top: Math.max(8, tooltip.y - 62),
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-[3px] w-4 shrink-0 rounded-full"
                    style={{ backgroundColor: tooltipSlice.color }}
                  />
                  <span className="text-[11px] font-medium text-text-secondary">
                    {tooltipSlice.name}
                  </span>
                </div>

                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="text-[20px] font-bold leading-none tracking-[-0.02em] text-text-primary">
                    {formatCount(tooltipSlice.value)}
                  </span>
                  <span className="text-[12px] font-semibold text-text-secondary">
                    {tooltipSlice.percentage}%
                  </span>
                </div>

                <div className="mt-1 text-[10px] text-text-muted">
                  of {formatCount(data.total)} total
                </div>

                {lastUpdatedLabel ? (
                  <div className="mt-2 border-t border-border-color/70 pt-1.5 text-[10px] text-text-muted">
                    {lastUpdatedLabel}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* ---------------- summary cards ---------------- */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {data.rows.map((row) => {
              const RowIcon = row.Icon;
              const isActive = activeKey === row.key;
              const hasData = row.value > 0;

              return (
                <div
                  key={row.key}
                  onMouseEnter={() => hasData && setActiveKey(row.key)}
                  onMouseLeave={() => setActiveKey(null)}
                  className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition ${
                    isActive
                      ? "border-border-strong bg-surface-muted shadow-sm"
                      : "border-border-color/70 bg-surface"
                  } ${hasData ? "cursor-pointer" : "opacity-60"}`}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${row.color}1f`, color: row.color }}
                  >
                    <RowIcon className="h-4 w-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-text-muted">
                      {row.name}
                    </p>
                    <p className="text-[15px] font-bold leading-tight tracking-[-0.01em] text-text-primary">
                      {formatCount(row.value)}
                    </p>
                  </div>

                  <span className="shrink-0 text-[11px] font-semibold text-text-secondary">
                    {hasData ? `${row.percentage}%` : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </CardFrame>
    </div>
  );
}
