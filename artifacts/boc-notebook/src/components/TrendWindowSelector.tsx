import { TREND_WINDOW_OPTIONS, type TrendWindow } from "@/hooks/use-trend-window";

interface TrendWindowSelectorProps {
  value: TrendWindow;
  onChange: (n: TrendWindow) => void;
  testId?: string;
  label?: string;
}

export function TrendWindowSelector({
  value,
  onChange,
  testId = "trend-window-selector",
  label = "Trend window",
}: TrendWindowSelectorProps) {
  return (
    <div
      className="inline-flex items-center gap-2 text-xs text-muted-foreground"
      data-testid={testId}
    >
      <span className="hidden sm:inline">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        className="inline-flex rounded-md border bg-background p-0.5"
      >
        {TREND_WINDOW_OPTIONS.map((n) => {
          const active = n === value;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(n)}
              data-testid={`${testId}-option-${n}`}
              className={`px-2 py-0.5 text-xs font-medium rounded tabular-nums transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}
