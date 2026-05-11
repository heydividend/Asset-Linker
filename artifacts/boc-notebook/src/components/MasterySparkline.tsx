import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export type TrendDirection = "up" | "down" | "flat";

export function trendDelta(trend: boolean[]): { dir: TrendDirection; delta: number } {
  if (trend.length < 2) return { dir: "flat", delta: 0 };
  const half = Math.max(1, Math.floor(trend.length / 2));
  const recent = trend.slice(-half);
  const prior = trend.slice(0, trend.length - half);
  const avg = (a: boolean[]) => (a.length ? a.filter(Boolean).length / a.length : 0);
  const delta = Math.round((avg(recent) - avg(prior)) * 100);
  if (delta > 5) return { dir: "up", delta };
  if (delta < -5) return { dir: "down", delta };
  return { dir: "flat", delta };
}

export function formatRelativeAttempt(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < day) return "today";
  const days = Math.floor(diffMs / day);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface MasterySparklineProps {
  trend: boolean[];
  testId?: string;
  width?: number;
  height?: number;
  emptyLabel?: string;
  /** Short muted text shown next to the spark, e.g. "5 of 23 attempts". */
  caption?: string;
  /** Extra context appended to the tooltip, e.g. "across 4 of 7 topics · latest 2d ago". */
  tooltipExtra?: string;
  /** Optional test id for the caption span (so tests can assert on it). */
  captionTestId?: string;
}

export function MasterySparkline({
  trend,
  testId,
  width = 44,
  height = 14,
  emptyLabel = "no attempts",
  caption,
  tooltipExtra,
  captionTestId,
}: MasterySparklineProps) {
  if (trend.length === 0) {
    return (
      <span className="text-[10px] text-muted-foreground" data-testid={testId}>
        {emptyLabel}
      </span>
    );
  }
  const w = width;
  const h = height;
  const step = trend.length > 1 ? w / (trend.length - 1) : 0;
  const pts = trend
    .map((c, i) => `${(i * step).toFixed(1)},${(c ? 2 : h - 2).toFixed(1)}`)
    .join(" ");
  const { dir, delta } = trendDelta(trend);
  const Icon = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;
  const iconCls =
    dir === "up"
      ? "text-primary"
      : dir === "down"
        ? "text-destructive"
        : "text-muted-foreground";
  const baseTitle = `Last ${trend.length} attempt${trend.length === 1 ? "" : "s"}: ${trend
    .map((c) => (c ? "✓" : "✗"))
    .join(" ")}${dir !== "flat" ? ` (${delta > 0 ? "+" : ""}${delta}%)` : ""}`;
  const fullTitle = tooltipExtra ? `${baseTitle} — ${tooltipExtra}` : baseTitle;
  return (
    <span
      className="inline-flex items-center gap-1"
      data-testid={testId}
      title={fullTitle}
    >
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        className="overflow-visible"
      >
        <polyline
          points={pts}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {trend.map((c, i) => (
          <circle
            key={i}
            cx={i * step}
            cy={c ? 2 : h - 2}
            r={1.6}
            fill={c ? "hsl(var(--primary))" : "hsl(var(--destructive))"}
          />
        ))}
      </svg>
      <Icon className={`h-3 w-3 ${iconCls}`} />
      {caption ? (
        <span
          className="text-[10px] text-muted-foreground tabular-nums"
          data-testid={captionTestId}
        >
          {caption}
        </span>
      ) : null}
    </span>
  );
}
