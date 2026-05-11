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

interface MasterySparklineProps {
  trend: boolean[];
  testId?: string;
  width?: number;
  height?: number;
  emptyLabel?: string;
}

export function MasterySparkline({
  trend,
  testId,
  width = 44,
  height = 14,
  emptyLabel = "no attempts",
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
  return (
    <span
      className="inline-flex items-center gap-1"
      data-testid={testId}
      title={`Last ${trend.length} attempt${trend.length === 1 ? "" : "s"}: ${trend
        .map((c) => (c ? "✓" : "✗"))
        .join(" ")}${dir !== "flat" ? ` (${delta > 0 ? "+" : ""}${delta}%)` : ""}`}
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
    </span>
  );
}
