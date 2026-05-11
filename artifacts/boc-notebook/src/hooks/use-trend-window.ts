import { useEffect, useMemo, useState } from "react";

export const TREND_WINDOW_OPTIONS = [3, 5, 10, 20] as const;
export type TrendWindow = (typeof TREND_WINDOW_OPTIONS)[number];
const DEFAULT_WINDOW: TrendWindow = 5;
const LEGACY_STORAGE_KEY = "boc:trendWindow";
const STORAGE_KEY_PREFIX = "boc:trendWindow:";
// Custom event so multiple hook instances in the same tab stay in sync
// immediately (the native `storage` event only fires across tabs).
const CHANGE_EVENT = "boc:trendWindowChange";

export type TrendWindowScope = "dashboard" | "bodyMap";

function storageKeyFor(scope: TrendWindowScope): string {
  return `${STORAGE_KEY_PREFIX}${scope}`;
}

function read(scope: TrendWindowScope): TrendWindow {
  if (typeof window === "undefined") return DEFAULT_WINDOW;
  try {
    const key = storageKeyFor(scope);
    let raw = window.localStorage.getItem(key);
    if (!raw) {
      // Fall back to the legacy shared key so existing users keep their pick.
      raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    }
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

type ChangeDetail = { scope: TrendWindowScope; value: TrendWindow };

export function useTrendWindow(
  scope: TrendWindowScope,
): [TrendWindow, (n: TrendWindow) => void] {
  const storageKey = useMemo(() => storageKeyFor(scope), [scope]);
  const [value, setValue] = useState<TrendWindow>(() => read(scope));

  useEffect(() => {
    setValue(read(scope));
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey || e.newValue == null) return;
      const n = Number(e.newValue);
      if ((TREND_WINDOW_OPTIONS as readonly number[]).includes(n)) {
        setValue(n as TrendWindow);
      }
    };
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<ChangeDetail>).detail;
      if (!detail || detail.scope !== scope) return;
      if ((TREND_WINDOW_OPTIONS as readonly number[]).includes(detail.value)) {
        setValue(detail.value);
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onChange as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onChange as EventListener);
    };
  }, [scope, storageKey]);

  const update = (n: TrendWindow) => {
    setValue(n);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, String(n));
    } catch {
      // ignore quota / privacy errors
    }
    try {
      window.dispatchEvent(
        new CustomEvent<ChangeDetail>(CHANGE_EVENT, {
          detail: { scope, value: n },
        }),
      );
    } catch {
      // ignore
    }
  };

  return [value, update];
}
