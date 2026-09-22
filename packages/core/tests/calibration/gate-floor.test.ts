/**
 * Unit tests for the policy-violating `gateFloor` assertion helper.
 * Fake payloads only — does not require calibration-results.json.
 */
import { describe, it, expect } from "vitest";
import { assertGateFloor } from "../../calibration/gate-floor.js";
import type { Verdict } from "../../src/types.js";

function site(partial: {
  url?: string;
  gateFloor?: boolean;
  expectedVerdictFloor?: Verdict;
  verdict?: Verdict | null;
  error?: string;
}) {
  const verdict = partial.verdict;
  return {
    url: partial.url ?? "https://example.test/",
    gateFloor: partial.gateFloor,
    expectedVerdictFloor: partial.expectedVerdictFloor,
    audit: verdict == null ? null : { verdict },
    error: partial.error,
  };
}

describe("assertGateFloor", () => {
  it("throws when gateFloor is true and verdict is below expectedVerdictFloor", () => {
    expect(() =>
      assertGateFloor(
        site({
          gateFloor: true,
          expectedVerdictFloor: "concerning",
          verdict: "caution",
        }),
      ),
    ).toThrow(/below expectedVerdictFloor|gateFloor/i);
  });

  it("does not throw when gateFloor is true and verdict meets the floor", () => {
    expect(() =>
      assertGateFloor(
        site({
          gateFloor: true,
          expectedVerdictFloor: "concerning",
          verdict: "concerning",
        }),
      ),
    ).not.toThrow();
  });

  it("does not throw when gateFloor is true and verdict exceeds the floor", () => {
    expect(() =>
      assertGateFloor(
        site({
          gateFloor: true,
          expectedVerdictFloor: "concerning",
          verdict: "critical",
        }),
      ),
    ).not.toThrow();
  });

  it("is a no-op when gateFloor is omitted or false", () => {
    expect(() =>
      assertGateFloor(
        site({
          expectedVerdictFloor: "concerning",
          verdict: "ready",
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertGateFloor(
        site({
          gateFloor: false,
          expectedVerdictFloor: "concerning",
          verdict: "ready",
        }),
      ),
    ).not.toThrow();
  });
});
