import {
  getFixItStreak,
  markFixItComplete,
  type FixItStreak,
} from "@workspace/api-client-react";

export const FIX_IT_COMPLETED_KEY = "boc.fixItPlan.completedDates";
export const FIX_IT_QUIZ_IDS_KEY = "boc.fixItPlan.quizIds";

export const todayStr = () => new Date().toISOString().slice(0, 10);

function safeParseStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is string => typeof v === "string");
    }
  } catch {
    // ignore
  }
  return [];
}

function safeParseNumberArray(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    }
  } catch {
    // ignore
  }
  return [];
}

export function getCompletedDates(): string[] {
  if (typeof window === "undefined") return [];
  return safeParseStringArray(window.localStorage.getItem(FIX_IT_COMPLETED_KEY));
}

export const FIX_IT_COMPLETED_EVENT = "boc:fixItPlan:completed";

function writeCompletedDates(dates: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    FIX_IT_COMPLETED_KEY,
    JSON.stringify([...new Set(dates)].sort()),
  );
}

/**
 * Mark today completed locally (optimistic). Always writes to localStorage so
 * an offline streak is preserved, then fires-and-forgets a sync to the server.
 * The server response is merged back into localStorage so other devices'
 * completions are picked up too.
 */
export function markCompletedToday(): void {
  if (typeof window === "undefined") return;
  const dates = new Set(getCompletedDates());
  const today = todayStr();
  const alreadyLocal = dates.has(today);
  if (!alreadyLocal) {
    dates.add(today);
    writeCompletedDates([...dates]);
    window.dispatchEvent(new Event(FIX_IT_COMPLETED_EVENT));
  }
  // Sync to the server (best-effort). On success, merge server dates so we
  // pick up completions made on other devices.
  void markFixItComplete()
    .then((streak) => mergeServerStreak(streak))
    .catch(() => {
      // Offline / server down — local copy is already updated.
    });
}

export function isCompletedToday(): boolean {
  return getCompletedDates().includes(todayStr());
}

/**
 * Merge the server's authoritative completion dates into localStorage so
 * the dashboard reflects activity from other devices and sessions.
 */
export function mergeServerStreak(streak: FixItStreak): string[] {
  if (typeof window === "undefined") return streak.completedDates;
  const local = new Set(getCompletedDates());
  const before = local.size;
  for (const d of streak.completedDates) local.add(d);
  const merged = [...local].sort();
  writeCompletedDates(merged);
  if (local.size !== before) {
    window.dispatchEvent(new Event(FIX_IT_COMPLETED_EVENT));
  }
  return merged;
}

/**
 * Fetch the server-side streak and merge it into local state. Returns the
 * merged list of completion dates, or null if the request fails (offline).
 */
export async function syncStreakFromServer(): Promise<FixItStreak | null> {
  try {
    const streak = await getFixItStreak();
    mergeServerStreak(streak);
    return streak;
  } catch {
    return null;
  }
}

/**
 * Consecutive day count ending at today (if completed today) or yesterday
 * (so the streak is still visible the morning after). Returns 0 if neither.
 */
export function computeStreak(dates: string[] = getCompletedDates()): number {
  if (dates.length === 0) return 0;
  const set = new Set(dates);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  let cursor = new Date(today);
  if (!set.has(fmt(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!set.has(fmt(cursor))) return 0;
  }
  let streak = 0;
  while (set.has(fmt(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

type FixItQuizEntry = { id: number; date: string };

function safeParseEntries(raw: string | null): FixItQuizEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((v) => {
          if (v && typeof v === "object") {
            const id = (v as { id?: unknown }).id;
            const date = (v as { date?: unknown }).date;
            if (typeof id === "number" && typeof date === "string") {
              return { id, date };
            }
          }
          return null;
        })
        .filter((v): v is FixItQuizEntry => v !== null);
    }
  } catch {
    // ignore
  }
  // Migrate any legacy plain-id list — drop entries since we don't know their
  // date and cannot trust them for "today" completion checks.
  if (safeParseNumberArray(raw).length > 0) return [];
  return [];
}

function getFixItQuizEntries(): FixItQuizEntry[] {
  if (typeof window === "undefined") return [];
  return safeParseEntries(window.localStorage.getItem(FIX_IT_QUIZ_IDS_KEY));
}

function writeFixItQuizEntries(entries: FixItQuizEntry[]): void {
  if (typeof window === "undefined") return;
  // Keep only the last 14 days to avoid unbounded growth.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const fresh = entries.filter((e) => e.date >= cutoffStr);
  window.localStorage.setItem(FIX_IT_QUIZ_IDS_KEY, JSON.stringify(fresh));
}

export function rememberFixItQuizId(id: number): void {
  if (typeof window === "undefined") return;
  const entries = getFixItQuizEntries().filter((e) => e.id !== id);
  entries.push({ id, date: todayStr() });
  writeFixItQuizEntries(entries);
}

/**
 * True only if this quiz id was launched from today's fix-it plan. Quizzes
 * remembered on previous days will not retrigger today's completion.
 */
export function isTodayFixItQuiz(id: number): boolean {
  return getFixItQuizEntries().some(
    (e) => e.id === id && e.date === todayStr(),
  );
}

export function forgetFixItQuizId(id: number): void {
  if (typeof window === "undefined") return;
  writeFixItQuizEntries(getFixItQuizEntries().filter((e) => e.id !== id));
}
