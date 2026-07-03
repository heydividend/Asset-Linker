// Matches recorded plan completions to the scheduled occurrences of a single
// plan-item key, for reconstructing per-day history.
//
// Keys can recur across the schedule (e.g. "quiz:daily" appears every day), so
// a completion must be attributed to exactly one scheduled occurrence:
//   1. A completion dated exactly on a scheduled occurrence marks THAT day as
//      done on time (this takes priority — completing today's daily quiz must
//      never be misread as a late completion of an older missed day).
//   2. Otherwise the completion clears the EARLIEST still-unmatched occurrence
//      scheduled on or before the completion date — this is the carry-forward
//      case, where a missed item was finished late on a day it wasn't
//      natively scheduled.
//   3. Completions with no eligible occurrence (e.g. ad-hoc flashcard reviews
//      on days the schedule never planned them) are ignored.
//
// Each completion is consumed by at most one occurrence, so one completion can
// never mark multiple days complete.
export function matchCompletionsToOccurrences(
  occurrenceDates: string[], // YYYY-MM-DD, ascending
  completionDates: string[], // YYYY-MM-DD, any order
): Map<string, string> {
  // occurrence date -> completion date that satisfied it
  const matched = new Map<string, string>();
  const comps = [...completionDates].sort();
  const occ = [...occurrenceDates].sort();

  for (const c of comps) {
    // Exact-day match first.
    if (!matched.has(c) && occ.includes(c)) {
      matched.set(c, c);
      continue;
    }
    // Late completion: earliest unmatched occurrence on or before c.
    const prior = occ.find((d) => !matched.has(d) && d <= c);
    if (prior) matched.set(prior, c);
  }
  return matched;
}
