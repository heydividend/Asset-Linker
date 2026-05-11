import { useEffect, useState } from "react";

export const TREND_WINDOW_OPTIONS = [3, 5, 10, 20] as const;
export type TrendWindow = (typeof TREND_WINDOW_OPTIONS)[number];
const DEFAULT_WINDOW: TrendWindow = 5;
const STORAGE_KEY = "boc:trendWindow";
// Custom event so multiple hook instances in the same tab stay in sync
// immediately (the native `storage` event only fires across tabs).
const CHANGE_EVENT = "boc:trendWindowChange";

function read(): TrendWindow {
  if (typeof window === "undefined") return DEFAULT_WINDOW;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WINDOW;
    const n = Number(raw);
    if ((TREND_WINDOW_OPTIONS as readonly number[]).includes(n)) {
      return n as TrendWindow;
    }
  } catch {
    // ignore
  }
  return DEFAULT_WINDOW;
}

export function useTrendWindow(): [TrendWindow, (n: TrendWindow) => void] {
  const [value, setValue] = useState<TrendWindow>(() => read());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || e.newValue == null) return;
      const n = Number(e.newValue);
      if ((TREND_WINDOW_OPTIONS as readonly number[]).includes(n)) {
        setValue(n as TrendWindow);
      }
    };
    const onChange = (e: Event) => {
      const n = (e as CustomEvent<number>).detail;
      if ((TREND_WINDOW_OPTIONS as readonly number[]).includes(n)) {
        setValue(n as TrendWindow);
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onChange as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onChange as EventListener);
    };
  }, []);

  const update = (n: TrendWindow) => {
    setValue(n);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(n));
    } catch {
      // ignore quota / privacy errors
    }
    try {
      window.dispatchEvent(new CustomEvent<number>(CHANGE_EVENT, { detail: n }));
    } catch {
      // ignore
    }
  };

  return [value, update];
}
