import { useMemo } from "react";
import { formatDateShort } from "@/lib/formatDate";
import type { ReadinessHistoryPoint } from "@workspace/api-client-react";
import {
  READINESS_RANGE_OPTIONS,
  type ReadinessRange,
} from "@/hooks/use-readiness-range";

interface ReadinessTrendProps {
  points: ReadinessHistoryPoint[];
  /** Height of the SVG plot area in px. */
  height?: number;
  testId?: string;
  /** Selected time window (in days) for the trend. */
  range?: ReadinessRange;
  /** Called when the user picks a different time window. */
  onRangeChange?: (range: ReadinessRange) => void;
}

// Compact line chart of the honest readiness score over time with the 80–85
// goal band shaded. Renders inside the (primary-colored) readiness card, so it
// draws in currentColor / primary-foreground tones. Falls back to a helpful
// note when there isn't enough history yet to draw a line.
export function ReadinessTrend({
  points,
  height = 52,
  testId,
  range,
  onRangeChange,
}: ReadinessTrendProps) {
  const W = 100; // viewBox width units (responsive via preserveAspectRatio="none")
  const H = height;
  const PAD_Y = 4;

  const rangeSelector =
    range != null && onRangeChange ? (
      <div
        className="flex items-center gap-0.5 rounded-full bg-primary-foreground/15 p-0.5"
        role="group"
        aria-label="Readiness trend time range"
        data-testid={testId ? `${testId}-range` : undefined}
      >
        {READINESS_RANGE_OPTIONS.map((opt) => {
          const active = opt.days === range;
          return (
            <button
              key={opt.days}
              type="button"
              onClick={() => onRangeChange(opt.days)}
              aria-pressed={active}
              className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none transition-colors ${
                active
                  ? "bg-primary-foreground/90 text-primary font-medium"
                  : "opacity-70 hover:opacity-100"
              }`}
              data-testid={testId ? `${testId}-range-${opt.days}` : undefined}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    ) : null;

  const model = useMemo(() => {
    if (points.length === 0) return null;
    const min = points[0]?.goalMin ?? 80;
    const max = points[0]?.goalMax ?? 85;
    const scoreToY = (s: number) => {
      const clamped = Math.max(0, Math.min(100, s));
      return PAD_Y + (1 - clamped / 100) * (H - PAD_Y * 2);
    };
    const n = points.length;
    const xAt = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
    const coords = points.map((p, i) => ({ x: xAt(i), y: scoreToY(p.score), p }));
    const line = coords.map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(" ");
    const area = `0,${H} ${line} ${W},${H}`;
    return {
      coords,
      line,
      area,
      bandTop: scoreToY(max),
      bandBottom: scoreToY(min),
      goalMin: min,
      goalMax: max,
      last: coords[coords.length - 1],
    };
  }, [points, H]);

  if (!model || points.length === 0) {
    return (
      <div className="mt-1.5" data-testid={testId ? `${testId}-empty-wrap` : undefined}>
        {rangeSelector && <div className="flex justify-end">{rangeSelector}</div>}
        <p className="text-[10px] opacity-70 mt-1.5" data-testid={testId ? `${testId}-empty` : undefined}>
          Trend builds as you study — check back tomorrow.
        </p>
      </div>
    );
  }

  const first = points[0];
  const last = points[points.length - 1];
  const delta = last.score - first.score;
  const deltaLabel =
    points.length < 2
      ? "First reading recorded"
      : delta > 0
        ? `+${delta} since ${formatDateShort(first.date)}`
        : delta < 0
          ? `${delta} since ${formatDateShort(first.date)}`
          : `Flat since ${formatDateShort(first.date)}`;

  return (
    <div className="mt-2" data-testid={testId}>
      {rangeSelector && <div className="flex justify-end mb-1">{rangeSelector}</div>}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: `${H}px` }}
        role="img"
        aria-label={`Readiness trend, goal band ${model.goalMin} to ${model.goalMax}`}
      >
        {/* Goal band 80–85 */}
        <rect
          x={0}
          y={model.bandTop}
          width={W}
          height={Math.max(1, model.bandBottom - model.bandTop)}
          fill="currentColor"
          opacity={0.18}
        />
        {/* Lower goal line */}
        <line
          x1={0}
          y1={model.bandBottom}
          x2={W}
          y2={model.bandBottom}
          stroke="currentColor"
          strokeWidth={0.5}
          strokeDasharray="2 2"
          opacity={0.5}
        />
        {/* Filled area under the score line */}
        <polygon points={model.area} fill="currentColor" opacity={0.12} />
        {/* Score line */}
        {points.length > 1 && (
          <polyline
            points={model.line}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {/* Latest point marker */}
        <circle cx={model.last.x} cy={model.last.y} r={2} fill="currentColor" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex items-center justify-between gap-2 mt-1">
        <span className="text-[10px] opacity-70">
          Goal band {model.goalMin}–{model.goalMax}
        </span>
        <span className="text-[10px] opacity-80" data-testid={testId ? `${testId}-delta` : undefined}>
          {deltaLabel}
        </span>
      </div>
    </div>
  );
}
