import { useState } from "react";
import { useLocation } from "wouter";
import { TrendingUp, TrendingDown, Minus, CheckCircle2, XCircle, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate, formatDateShort } from "@/lib/formatDate";

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
  return formatDateShort(d);
}

function formatAttemptDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const date = formatDate(d);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
  return `${date} · ${time}`;
}

export interface SparklineAttempt {
  answeredAt: string;
  correct: boolean;
  topicName?: string;
  /** When provided, the row becomes a link that opens this quiz attempt's review. */
  quizId?: number;
  /** When provided alongside quizId, the review scrolls to and highlights this question. */
  questionId?: number;
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
  /**
   * When provided (and non-empty), the spark renders as a clickable button
   * that opens a popover listing each attempt's date, topic, and result.
   */
  attempts?: SparklineAttempt[];
  /** Heading shown at the top of the attempts popover. */
  popoverTitle?: string;
  /** Test id for the attempts popover content (and its `${id}-list` ul). */
  popoverTestId?: string;
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
  attempts,
  popoverTitle,
  popoverTestId,
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

  const inner = (
    <>
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
    </>
  );

  const interactive = attempts && attempts.length > 0;

  if (interactive) {
    return (
      <InteractiveSparkline
        attempts={attempts!}
        popoverTitle={popoverTitle}
        popoverTestId={popoverTestId}
        testId={testId}
        fullTitle={fullTitle}
      >
        {inner}
      </InteractiveSparkline>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1"
      data-testid={testId}
      title={fullTitle}
    >
      {inner}
    </span>
  );
}

interface InteractiveSparklineProps {
  attempts: SparklineAttempt[];
  popoverTitle?: string;
  popoverTestId?: string;
  testId?: string;
  fullTitle: string;
  children: React.ReactNode;
}

function InteractiveSparkline({
  attempts,
  popoverTitle,
  popoverTestId,
  testId,
  fullTitle,
  children,
}: InteractiveSparklineProps) {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const sorted = [...attempts].sort((a, b) =>
    b.answeredAt.localeCompare(a.answeredAt),
  );
  const heading =
    popoverTitle ?? `Last ${sorted.length} attempt${sorted.length === 1 ? "" : "s"}`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-sm px-1 -mx-1 hover-elevate active-elevate-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid={testId}
          title={fullTitle}
          aria-label={`Show details of recent ${sorted.length} attempt${sorted.length === 1 ? "" : "s"}`}
          onFocus={() => setOpen(true)}
        >
          {children}
        </button>
      </PopoverTrigger>
        <PopoverContent
          align="start"
          side="top"
          className="w-72 p-3"
          data-testid={popoverTestId}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="space-y-2">
            <p className="text-xs font-semibold leading-snug">{heading}</p>
            <ul
              className="space-y-1.5"
              data-testid={popoverTestId ? `${popoverTestId}-list` : undefined}
            >
              {sorted.map((a, i) => {
                const itemTestId = popoverTestId
                  ? `${popoverTestId}-item-${i}`
                  : undefined;
                const inside = (
                  <>
                    {a.correct ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0 text-left">
                      <p className="font-medium truncate" title={a.topicName ?? ""}>
                        {a.topicName ?? "Unknown topic"}
                      </p>
                      <p className="text-muted-foreground tabular-nums">
                        {formatAttemptDate(a.answeredAt)}
                        <span className="ml-1.5">
                          · {a.correct ? "Correct" : "Incorrect"}
                        </span>
                      </p>
                    </div>
                    {a.quizId != null && (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    )}
                  </>
                );
                if (a.quizId != null) {
                  const qid = a.quizId;
                  const questionId = a.questionId;
                  return (
                    <li key={`${a.answeredAt}-${i}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          navigate(
                            questionId != null
                              ? `/quiz/${qid}?q=${questionId}`
                              : `/quiz/${qid}`,
                          );
                        }}
                        className="w-full flex items-start gap-2 text-xs rounded-sm px-1.5 py-1 -mx-1.5 hover-elevate active-elevate-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        data-testid={itemTestId}
                        title={`Open quiz attempt #${qid}`}
                        aria-label={`Open quiz attempt for ${a.topicName ?? "this question"} on ${formatAttemptDate(a.answeredAt)}`}
                      >
                        {inside}
                      </button>
                    </li>
                  );
                }
                return (
                  <li
                    key={`${a.answeredAt}-${i}`}
                    className="flex items-start gap-2 text-xs"
                    data-testid={itemTestId}
                  >
                    {inside}
                  </li>
                );
              })}
            </ul>
          </div>
        </PopoverContent>
      </Popover>
  );
}
