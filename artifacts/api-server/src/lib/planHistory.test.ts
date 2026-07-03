import { test } from "node:test";
import assert from "node:assert/strict";
import { matchCompletionsToOccurrences } from "./planHistory";

test("history: on-time completion matches its own day", () => {
  const m = matchCompletionsToOccurrences(["2026-07-01"], ["2026-07-01"]);
  assert.equal(m.get("2026-07-01"), "2026-07-01");
});

test("history: late completion clears the earliest missed occurrence", () => {
  const m = matchCompletionsToOccurrences(["2026-07-01"], ["2026-07-03"]);
  assert.equal(m.get("2026-07-01"), "2026-07-03");
});

test("history: recurring key — one completion never marks multiple days", () => {
  // quiz:daily scheduled every day; completed only on the 2nd.
  const m = matchCompletionsToOccurrences(
    ["2026-07-01", "2026-07-02", "2026-07-03"],
    ["2026-07-02"],
  );
  assert.equal(m.get("2026-07-01"), undefined);
  assert.equal(m.get("2026-07-02"), "2026-07-02");
  assert.equal(m.get("2026-07-03"), undefined);
  assert.equal(m.size, 1);
});

test("history: exact-day match wins over late attribution to an older day", () => {
  // Missed the 1st, completed on the 2nd (which is also scheduled): the
  // completion belongs to the 2nd, not to the missed 1st.
  const m = matchCompletionsToOccurrences(
    ["2026-07-01", "2026-07-02"],
    ["2026-07-02"],
  );
  assert.equal(m.get("2026-07-01"), undefined);
  assert.equal(m.get("2026-07-02"), "2026-07-02");
});

test("history: second completion clears the older missed day late", () => {
  const m = matchCompletionsToOccurrences(
    ["2026-07-01", "2026-07-02"],
    ["2026-07-02", "2026-07-04"],
  );
  assert.equal(m.get("2026-07-02"), "2026-07-02");
  assert.equal(m.get("2026-07-01"), "2026-07-04");
});

test("history: completion before any occurrence is ignored", () => {
  const m = matchCompletionsToOccurrences(["2026-07-05"], ["2026-07-02"]);
  assert.equal(m.size, 0);
});

test("history: today's completion of a recurring key is consumed by today, not an old miss", () => {
  // Occurrences include today (the schedule spans past AND future days);
  // completing today's item must not show an old missed day as done late.
  const m = matchCompletionsToOccurrences(
    ["2026-07-01", "2026-07-03"],
    ["2026-07-03"],
  );
  assert.equal(m.get("2026-07-01"), undefined);
  assert.equal(m.get("2026-07-03"), "2026-07-03");
});

test("history: unordered completion input is handled", () => {
  const m = matchCompletionsToOccurrences(
    ["2026-07-01", "2026-07-02"],
    ["2026-07-06", "2026-07-02"],
  );
  assert.equal(m.get("2026-07-02"), "2026-07-02");
  assert.equal(m.get("2026-07-01"), "2026-07-06");
});
