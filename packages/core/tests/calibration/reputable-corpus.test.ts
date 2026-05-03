/**
 * Reputable-pSEO calibration regression test.
 *
 * This test reads the most recent output of
 * `scripts/calibration-reputable-pseo.ts` and asserts that no site in the
 * curated reputable-pSEO corpus scored worse than its expected verdict
 * ceiling. Any failure here means the engine has regressed in a way that
 * causes it to flag sites that demonstrably win at pSEO — which is a bug
 * in OUR calibration, not the sites.
 *
 * The test is a *soft* gate: it skips automatically when no calibration
 * results exist or when the most recent run is older than 14 days. This is
 * deliberate — running the calibration makes 12 live HTTP audits that take
 * minutes to complete and require network access, neither of which belongs
 * in `bun test`. Treat it as: "if calibration has been run recently, its
 * verdict ceilings still hold."
 *
 * To run the calibration and refresh the gate:
 *
 *   bun run scripts/calibration-reputable-pseo.ts
 *
 * See:
 *   - docs/superpowers/specs/2026-05-03-calibration-against-reputable-pseo.md
 *   - packages/core/calibration/reputable-pseo-corpus.json
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Verdict } from "../../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_PATH = resolve(__dirname, "../../../../scripts/calibration-results.json");
const STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

const VERDICT_RANK: Record<Verdict, number> = {
  ready: 0,
  caution: 1,
  concerning: 2,
  critical: 3,
};

interface SiteResult {
  url: string;
  vertical: string;
  expectedVerdictCeiling: Verdict;
  pass: boolean;
  failureReason?: string;
  audit: null | { verdict: Verdict; risk: number; topDrivers: Array<{ ruleId: string; count: number; impact: number }> };
  error?: string;
}

interface CalibrationResults {
  ranAt: string;
  rulesetVersion: string;
  corpusVersion: string;
  results: SiteResult[];
  ruleAggregates: Record<string, { sitesFired: number; sitesAudited: number; firingRatio: number }>;
}

function loadResults(): { state: "ok"; data: CalibrationResults } | { state: "missing" } | { state: "stale"; ageDays: number } {
  if (!existsSync(RESULTS_PATH)) return { state: "missing" };
  const ageMs = Date.now() - statSync(RESULTS_PATH).mtimeMs;
  if (ageMs > STALE_AFTER_MS) {
    return { state: "stale", ageDays: Math.floor(ageMs / (24 * 60 * 60 * 1000)) };
  }
  const data = JSON.parse(readFileSync(RESULTS_PATH, "utf-8")) as CalibrationResults;
  return { state: "ok", data };
}

describe("reputable-pSEO calibration regression", () => {
  const status = loadResults();

  if (status.state === "missing") {
    it.skip(
      "calibration not run — execute `bun run scripts/calibration-reputable-pseo.ts` to populate scripts/calibration-results.json",
      () => {},
    );
    return;
  }

  if (status.state === "stale") {
    it.skip(
      `calibration is ${status.ageDays} days old — re-run \`bun run scripts/calibration-reputable-pseo.ts\` to refresh the gate`,
      () => {},
    );
    return;
  }

  const { data } = status;

  it("ran against current ruleset version (or older — older is fine, the test still gates)", () => {
    expect(typeof data.rulesetVersion).toBe("string");
    expect(data.rulesetVersion.length).toBeGreaterThan(0);
  });

  for (const site of data.results) {
    if (site.error) {
      it.skip(`${site.url} fetch errored: ${site.error}`, () => {});
      continue;
    }
    if (!site.audit) continue;

    const actual = site.audit.verdict;
    const ceiling = site.expectedVerdictCeiling;

    it(
      `${site.url} (${site.vertical}): verdict ≤ ${ceiling}`,
      () => {
        const actualRank = VERDICT_RANK[actual];
        const ceilingRank = VERDICT_RANK[ceiling];
        const driverHint = site.audit?.topDrivers
          .slice(0, 3)
          .map((d) => `${d.ruleId} (impact=${d.impact})`)
          .join(", ");
        expect(actualRank, [
          `Engine returned verdict='${actual}' on a reputable-pSEO site whose ground-truth`,
          `evidence supports verdict <= '${ceiling}'.`,
          `Top drivers: ${driverHint}.`,
          `This is a calibration failure on the engine, not the site. Adjust`,
          `SCORING_PROFILES['programmatic-directory'] severity/confidence overrides`,
          `or rule thresholds. See docs/superpowers/specs/2026-05-03-calibration-against-reputable-pseo.md.`,
        ].join(" ")).toBeLessThanOrEqual(ceilingRank);
      },
    );
  }

  it("aggregate rule fire-rates are within decision-matrix bounds", () => {
    const violators: string[] = [];
    for (const [ruleId, agg] of Object.entries(data.ruleAggregates)) {
      // Per spec decision matrix: any rule firing on >80% of the reputable
      // corpus must be either suppressed for programmatic-directory or
      // demoted to info via severityOverrides. If a rule still fires on
      // >80% AND was never demoted, that's a calibration debt.
      if (agg.firingRatio > 0.8) {
        violators.push(`${ruleId} firing on ${(agg.firingRatio * 100).toFixed(0)}% of reputable-pSEO sites`);
      }
    }
    expect(violators, [
      "One or more rules fire on >80% of reputable-pSEO sites without a severity demotion.",
      "Per the decision matrix in the calibration spec, these must be suppressed for",
      "programmatic-directory or demoted in SCORING_PROFILES. Violators:",
      ...violators.map((v) => `  - ${v}`),
    ].join("\n")).toEqual([]);
  });
});
