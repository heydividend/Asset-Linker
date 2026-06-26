// Single source of truth for "what day is it" across the app.
// The user is on the US West Coast (BOC exam timezone is irrelevant — what
// matters is *their* local day so the daily plan rolls over at midnight
// Pacific, not midnight UTC which would flip mid-evening).
const TZ = "America/Los_Angeles";

// en-CA gives YYYY-MM-DD which is exactly the format the rest of the app
// stores schedule dates in. `tz` is any IANA timezone name.
export function todayStrInTz(tz: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: tz });
}

// Current wall-clock time in the given timezone as "HH:MM" (24h, zero-padded).
export function nowHHmmInTz(tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date())
    // Some runtimes format midnight as "24:00"; normalize to "00:00".
    .replace(/^24:/, "00:");
}

// Day of week (0=Sunday … 6=Saturday, matching JS Date.getDay) in the given
// timezone. Used by the reminder scheduler to honor a user's silenced weekdays.
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};
export function weekdayInTz(tz: string): number {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(new Date());
  return WEEKDAY_INDEX[short] ?? new Date().getDay();
}

// True when `tz` is a valid IANA timezone the runtime can resolve.
export function isValidTimeZone(tz: string): boolean {
  if (typeof tz !== "string" || tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Date helpers fixed to the app's reference timezone (Pacific). The daily plan
// rolls over at midnight Pacific regardless of where the user is.
export function todayStrPT(): string {
  return todayStrInTz(TZ);
}

export function nowHHmmPT(): string {
  return nowHHmmInTz(TZ);
}

// Returns the UTC instant that corresponds to 00:00 in Pacific time on the
// current Pacific day. Useful for "completed today" range queries against
// timestamp columns that store UTC.
export function startOfTodayPT(): Date {
  const ymd = todayStrPT(); // YYYY-MM-DD in PT
  // Get the offset for that date (handles PST vs PDT). Format the current PT
  // wall time as ISO and let Date parse it.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    timeZoneName: "shortOffset",
  }).formatToParts(new Date());
  const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-8";
  // Examples: "GMT-7", "GMT-8", "GMT-7:00"
  const m = offsetPart.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/);
  const hours = m ? parseInt(m[1], 10) : -8;
  const mins = m && m[2] ? parseInt(m[2], 10) * Math.sign(hours || 1) : 0;
  const sign = hours >= 0 ? "+" : "-";
  const hh = String(Math.abs(hours)).padStart(2, "0");
  const mm = String(Math.abs(mins)).padStart(2, "0");
  return new Date(`${ymd}T00:00:00${sign}${hh}:${mm}`);
}
