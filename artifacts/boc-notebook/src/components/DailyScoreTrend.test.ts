import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The app is built with the automatic JSX runtime, so components don't import
// React. Under tsx/esbuild the .tsx sources compile with the classic transform
// (React.createElement), which resolves `React` from the global scope — provide
// it so server-rendering the component works outside the Vite build.
(globalThis as { React?: typeof React }).React = React;

import { DailyScoreTrend, type DailyScorePoint } from "./DailyScoreTrend";

function render(points: DailyScorePoint[]): string {
  return renderToStaticMarkup(
    createElement(DailyScoreTrend, { points, testId: "trend" }),
  );
}

function point(date: string, pct: number): DailyScorePoint {
  return {
    date,
    pct,
    correctCount: Math.round((pct / 100) * 50),
    totalQuestions: 50,
  };
}

describe("DailyScoreTrend", () => {
  it("renders nothing for the empty state", () => {
    assert.equal(render([]), "");
  });

  it("shows the single-quiz note (and no trend delta) for one point", () => {
    const html = render([point("2026-06-01", 72)]);
    assert.ok(
      html.includes(
        "One quiz so far — your trend builds as you finish more days.",
      ),
      "expected the single-quiz note",
    );
    // With one point there is no "since DATE" delta.
    assert.ok(!html.includes("% since "), "did not expect a trend delta");
    // Exactly one bar is drawn.
    assert.ok(html.includes('data-testid="trend-bar-0"'));
    assert.ok(!html.includes('data-testid="trend-bar-1"'));
  });

  it("shows a positive delta since the first date for a rising multi-point trend", () => {
    const html = render([
      point("2026-06-01", 60),
      point("2026-06-02", 70),
      point("2026-06-03", 80),
    ]);
    // delta = 80 - 60 = +20, first date 2026-06-01 -> "06/01"
    assert.ok(html.includes("+20% since 06/01"), "expected +20% since 06/01");
    assert.ok(!html.includes("One quiz so far"));
    // One bar per point.
    assert.ok(html.includes('data-testid="trend-bar-0"'));
    assert.ok(html.includes('data-testid="trend-bar-1"'));
    assert.ok(html.includes('data-testid="trend-bar-2"'));
    assert.ok(!html.includes('data-testid="trend-bar-3"'));
  });

  it("shows a negative delta when scores fall", () => {
    const html = render([point("2026-05-10", 90), point("2026-05-12", 75)]);
    // delta = 75 - 90 = -15
    assert.ok(html.includes("-15% since 05/10"), "expected -15% since 05/10");
  });

  it("shows a flat label when first and last scores match", () => {
    const html = render([point("2026-05-10", 80), point("2026-05-12", 80)]);
    assert.ok(html.includes("Flat since 05/10"), "expected a flat label");
    assert.ok(!html.includes("% since "));
  });

  it("labels the chart with the number of quizzes for accessibility", () => {
    assert.ok(
      render([point("2026-06-01", 50)]).includes(
        "Daily quiz score trend across 1 quiz",
      ),
    );
    assert.ok(
      render([point("2026-06-01", 50), point("2026-06-02", 60)]).includes(
        "Daily quiz score trend across 2 quizzes",
      ),
    );
  });
});
