import { cn } from "@/lib/utils";

/**
 * Brand mark: ascending bars topped by a rising arrow — domain mastery and the
 * readiness score climbing toward a passing result. The tile uses the brand
 * green; the glyph inherits the foreground so it stays crisp in light/dark.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 180 180"
      className={cn("h-8 w-8", className)}
      role="img"
      aria-label="BOC Study Notebook"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="180" height="180" rx="40" className="fill-primary" />
      <rect x="48" y="104" width="18" height="28" rx="6" className="fill-primary-foreground" />
      <rect x="78" y="84" width="18" height="48" rx="6" className="fill-primary-foreground" />
      <rect x="108" y="62" width="18" height="70" rx="6" className="fill-primary-foreground" />
      <path
        d="M100 70 L132 44 M118 44 L132 44 L132 58"
        className="stroke-primary-foreground"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function Logo({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className={markClassName} />
      <span className="text-sm font-semibold tracking-tight">
        BOC Study Notebook
      </span>
    </div>
  );
}
