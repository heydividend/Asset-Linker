// Single source of truth for "what day is it" across the app.
// The user is on the US West Coast (BOC exam timezone is irrelevant — what
// matters is *their* local day so the daily plan rolls over at midnight
// Pacific, not midnight UTC which would flip mid-evening).
const TZ = "America/Los_Angeles";

// en-CA gives YYYY-MM-DD which is exactly the format the rest of the app
// stores schedule dates in.
export function todayStrPT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

// Current wall-clock time in Pacific as "HH:MM" (24h, zero-padded). Used by
// the daily reminder scheduler to compare against the user's chosen time,
// which is also stored in PT (the app's single reference timezone).
export function nowHHmmPT(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
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
