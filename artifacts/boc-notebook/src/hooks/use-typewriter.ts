import { useEffect, useRef, useState } from "react";

/**
 * Smooths out an SSE-fed text buffer into a typewriter-paced display.
 *
 * The model often emits content in bursts (a few words arrive together),
 * which feels janky. This hook keeps a `displayed` slice of `buffer` and
 * advances it on each animation frame at a rate proportional to how far
 * behind it is, so it never falls more than a frame behind the network
 * but always feels like it's typing.
 *
 * - Resetting `buffer` to "" (or shrinking it) instantly resets `displayed`.
 * - When `instant` is true (e.g. the stream is done), `displayed` jumps to
 *   the full buffer immediately so the user isn't left waiting for the
 *   typewriter to catch up after the network finished.
 */
export function useTypewriter(buffer: string, instant = false): string {
  const [displayed, setDisplayed] = useState("");
  const rafRef = useRef<number | null>(null);
  const bufRef = useRef(buffer);
  bufRef.current = buffer;

  useEffect(() => {
    if (buffer.length === 0) {
      setDisplayed("");
      return;
    }
    if (instant) {
      setDisplayed(buffer);
      return;
    }

    const tick = () => {
      setDisplayed((prev) => {
        const target = bufRef.current;
        if (prev.length >= target.length) return prev;
        const lag = target.length - prev.length;
        // Catch up faster when far behind, but never gulp the whole thing.
        // ~30 chars/frame baseline + 1/8 of remaining lag.
        const step = Math.max(2, Math.min(lag, 30 + Math.ceil(lag / 8)));
        return target.slice(0, prev.length + step);
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [buffer, instant]);

  return displayed;
}
