import { useMemo, useState } from "react";
import { formatDate, formatDateShort } from "@/lib/formatDate";

export interface DailyScorePoint {
  /** Pacific YYYY-MM-DD for the quiz. */
  date: string;
  /** Whole-number percent score, 0–100. */
  pct: number;
  correctCount: number;
  totalQuestions: number;
}

interface DailyScoreTrendProps {
  /** Points in chronological order (oldest first). */
  points: DailyScorePoint[];
  testId?: string;
}

// Compact bar chart of each daily quiz's score by date, oldest on the left.
// Gives an at-a-glance sense of whether scores are climbing day over day.
// Handles the single-attempt case with a gentle note instead of a trend delta.
export function DailyScoreTrend({ points, testId }: DailyScoreTrendProps) {
  const H = 56; // plot height in px
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const model = useMemo(() => {
    if (points.length === 0) return null;
    const n = points.length;
    // Bar geometry in percentage units so the SVG scales responsively.
    const slot = 100 / n;
    const barW = Math.min(slot * 0.6, 14);
    const bars = points.map((p, i) => {
      const clamped = Math.max(0, Math.min(100, p.pct));
      const barH = (clamped / 100) * (H - 4);
      const xCenter = slot * (i + 0.5);
      return {
        p,
        x: xCenter - barW / 2,
        width: barW,
        y: H - barH,
        height: Math.max(barH, 0.5),
        xCenter,
      };
    });
    return { bars };
  }, [points]);

  if (!model || points.length === 0) return null;

  const first = points[0];
  const last = points[points.length - 1];
  const delta = last.pct - first.pct;
  const trendLabel =
    points.length < 2
      ? "One quiz so far — your trend builds as you finish more days."
      : delta > 0
        ? `+${delta}% since ${formatDateShort(first.date)}`
        : delta < 0
          ? `${delta}% since ${formatDateShort(first.date)}`
          : `Flat since ${formatDateShort(first.date)}`;

  const active = activeIndex == null ? null : model.bars[activeIndex] ?? null;

  return (
    <div data-testid={testId}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-xs font-medium">Score trend</span>
        <span
          className="text-[10px] text-muted-foreground tabular-nums"
          data-testid={testId ? `${testId}-delta` : undefined}
        >
          {trendLabel}
        </span>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 100 ${H}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height: `${H}px` }}
          role="img"
          aria-label={`Daily quiz score trend across ${points.length} quiz${points.length === 1 ? "" : "zes"}`}
        >
          {model.bars.map((b, i) => (
            <rect
              key={b.p.date}
              x={b.x}
              y={b.y}
              width={b.width}
              height={b.height}
              rx={1}
              fill="hsl(var(--primary))"
              opacity={active && activeIndex !== i ? 0.45 : 0.9}
              onPointerEnter={() => setActiveIndex(i)}
              onPointerLeave={() => setActiveIndex(null)}
              data-testid={testId ? `${testId}-bar-${i}` : undefined}
            >
              <title>{`${formatDate(b.p.date)}: ${b.p.pct}% (${b.p.correctCount}/${b.p.totalQuestions})`}</title>
            </rect>
          ))}
        </svg>
        {active && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-foreground px-1.5 py-1 text-center text-background shadow-md"
            style={{
              left: `${Math.min(88, Math.max(12, active.xCenter))}%`,
              top: `${Math.max(0, active.y - 4)}px`,
            }}
            role="status"
            data-testid={testId ? `${testId}-tooltip` : undefined}
          >
            <span className="block text-[10px] font-medium leading-tight whitespace-nowrap">
              {formatDate(active.p.date)}
            </span>
            <span className="block text-[11px] font-semibold leading-tight tabular-nums">
              {active.p.pct}% ({active.p.correctCount}/{active.p.totalQuestions})
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 mt-1">
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {formatDateShort(first.date)}
        </span>
        {points.length > 1 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {formatDateShort(last.date)}
          </span>
        )}
      </div>
    </div>
  );
}
