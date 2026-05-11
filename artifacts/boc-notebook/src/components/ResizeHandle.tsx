import { useEffect, useRef } from "react";

interface ResizeHandleProps {
  side: "left" | "right";
  /** Called with the new pixel width as the user drags. */
  onResize: (newWidth: number) => void;
  /** Container width at drag start (pulled from parent ref). */
  getStartWidth: () => number;
  className?: string;
  testId?: string;
}

export function ResizeHandle({ side, onResize, getStartWidth, className, testId }: ResizeHandleProps) {
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - startX.current;
      // For the LEFT rail, dragging right increases width.
      // For the RIGHT rail, dragging right decreases width.
      const next = side === "left" ? startWidth.current + dx : startWidth.current - dx;
      onResize(next);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [side, onResize]);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = getStartWidth();
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      data-testid={testId}
      className={
        "group absolute top-0 bottom-0 w-1.5 cursor-col-resize z-30 " +
        (side === "left" ? "right-0 -mr-0.5" : "left-0 -ml-0.5") +
        " " +
        (className ?? "")
      }
    >
      <div className="h-full w-full bg-transparent group-hover:bg-primary/30 transition-colors" />
    </div>
  );
}
