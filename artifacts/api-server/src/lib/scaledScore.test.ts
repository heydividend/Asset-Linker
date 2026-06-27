import { test } from "node:test";
import assert from "node:assert/strict";
import { toScaledScore, domainBand, scaledReadout, PASSING_SCALED_SCORE } from "./scaledScore";

test("scaled: pass percent maps to 500", () => {
  assert.equal(toScaledScore(75, 75), 500);
});
test("scaled: endpoints map to 200 and 800", () => {
  assert.equal(toScaledScore(0, 75), 200);
  assert.equal(toScaledScore(100, 75), 800);
});
test("scaled: monotonic and clamped", () => {
  assert.ok(toScaledScore(50) < toScaledScore(75));
  assert.ok(toScaledScore(75) < toScaledScore(90));
  assert.equal(toScaledScore(-20), 200);
  assert.equal(toScaledScore(150), 800);
});
test("scaled: midpoints", () => {
  assert.equal(toScaledScore(37.5, 75), 350); // halfway up the lower leg
  assert.equal(toScaledScore(87.5, 75), 650); // halfway up the upper leg
});

test("domainBand: at/marginal/considerable", () => {
  assert.equal(domainBand(80, 75), "at or above passing");
  assert.equal(domainBand(75, 75), "at or above passing");
  assert.equal(domainBand(70, 75), "marginally lower"); // within 10
  assert.equal(domainBand(66, 75), "marginally lower");
  assert.equal(domainBand(64, 75), "considerably lower"); // > 10 below
  assert.equal(domainBand(40, 75), "considerably lower");
});

test("scaledReadout: passing + points-to-pass", () => {
  const fail = scaledReadout(60, 75);
  assert.equal(fail.passing, false);
  assert.equal(fail.passingScaledScore, PASSING_SCALED_SCORE);
  assert.ok(fail.pointsToPass > 0);
  const pass = scaledReadout(80, 75);
  assert.equal(pass.passing, true);
  assert.equal(pass.pointsToPass, 0);
});
