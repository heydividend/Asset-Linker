// BOC-style scaled-score model for the readiness display.
//
// The real BOC reports results on a 200–800 scaled score with a fixed passing
// point of 500 (per the "Explanation of BOC Exam Results"). The actual scaling
// is IRT-based and not published, so this is a TRANSPARENT, monotonic stand-in:
// it maps the app's honest readiness percentage onto the same 200–800 / cut-500
// frame so the in-app number speaks the same language as the official score
// report — it does not claim to reproduce BOC's psychometric scaling.

export const PASSING_SCALED_SCORE = 500;
export const MIN_SCALED = 200;
export const MAX_SCALED = 800;

// Percentage that maps to the passing scaled score of 500. The BOC cut score is
// set by standard-setting (Angoff) and commonly lands near this region; it is a
// tunable assumption, not an official value.
export const DEFAULT_PASS_PERCENT = 75;

/**
 * Map a 0–100 performance percentage to a 200–800 scaled score, with passPercent
 * pinned to 500. Piecewise-linear: [0, pass] → [200, 500], [pass, 100] → [500, 800].
 */
export function toScaledScore(percent: number, passPercent = DEFAULT_PASS_PERCENT): number {
  const p = Math.max(0, Math.min(100, percent));
  const pass = Math.max(1, Math.min(99, passPercent));
  const scaled =
    p <= pass
      ? MIN_SCALED + (p / pass) * (PASSING_SCALED_SCORE - MIN_SCALED)
      : PASSING_SCALED_SCORE + ((p - pass) / (100 - pass)) * (MAX_SCALED - PASSING_SCALED_SCORE);
  return Math.round(Math.max(MIN_SCALED, Math.min(MAX_SCALED, scaled)));
}

export type DomainBand = "at or above passing" | "marginally lower" | "considerably lower";

/**
 * Band a domain's performance relative to the passing standard, mirroring the
 * BOC failing-result report language ("Marginally lower" / "Considerably lower"
 * than passing candidates). `marginalPoints` is the width (in percentage points
 * below the pass mark) of the "marginally lower" zone.
 */
export function domainBand(
  domainPercent: number,
  passPercent = DEFAULT_PASS_PERCENT,
  marginalPoints = 10,
): DomainBand {
  const diff = domainPercent - passPercent;
  if (diff >= 0) return "at or above passing";
  if (diff >= -marginalPoints) return "marginally lower";
  return "considerably lower";
}

/** Convenience: full scaled-score readout for a readiness percentage. */
export function scaledReadout(percent: number, passPercent = DEFAULT_PASS_PERCENT) {
  const scaled = toScaledScore(percent, passPercent);
  return {
    scaledScore: scaled,
    passingScaledScore: PASSING_SCALED_SCORE,
    passing: scaled >= PASSING_SCALED_SCORE,
    pointsToPass: Math.max(0, PASSING_SCALED_SCORE - scaled),
  };
}
