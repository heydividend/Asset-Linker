import { useEffect, useState } from "react";

// Time windows (in days) for the readiness trend line. "All" maps to the
// backend's maximum (365) so we pull every available snapshot.
export const READINESS_RANGE_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "All", days: 365 },
] as const;

export type ReadinessRange = (typeof READINESS_RANGE_OPTIONS)[number]["days"];

const VALID_RANGES = READINESS_RANGE_OPTIONS.map((o) => o.days) as readonly number[];
const DEFAULT_RANGE: ReadinessRange = 90;
const STORAGE_KEY = "boc:readinessRange";
// Custom event so multiple hook instances in the same tab stay in sync
// immediately (the native `storage` event only fires across tabs).
const CHANGE_EVENT = "boc:readinessRangeChange";

function read(): ReadinessRange {
  if (typeof window === "undefined") return DEFAULT_RANGE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_RANGE;
    const n = Number(raw);
    if (VALID_RANGES.includes(n)) {
      return n as ReadinessRange;
    }
  } catch {
    // ignore
  }
  return DEFAULT_RANGE;
}

export function useReadinessRange(): [ReadinessRange, (n: ReadinessRange) => void] {
  const [value, setValue] = useState<ReadinessRange>(() => read());

  useEffect(() => {
    setValue(read());
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || e.newValue == null) return;
      const n = Number(e.newValue);
      if (VALID_RANGES.includes(n)) {
        setValue(n as ReadinessRange);
      }
    };
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<ReadinessRange>).detail;
      if (VALID_RANGES.includes(detail)) {
        setValue(detail);
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onChange as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onChange as EventListener);
    };
  }, []);

  const update = (n: ReadinessRange) => {
    setValue(n);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(n));
    } catch {
      // ignore quota / privacy errors
    }
    try {
      window.dispatchEvent(new CustomEvent<ReadinessRange>(CHANGE_EVENT, { detail: n }));
    } catch {
      // ignore
    }
  };

  return [value, update];
}
