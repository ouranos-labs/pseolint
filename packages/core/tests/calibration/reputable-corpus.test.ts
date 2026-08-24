/**
 * Reputable-pSEO calibration regression test.
 *
 * This test reads the most recent output of
 * `scripts/calibration-corpus.ts` and asserts that no site in the
 * curated reputable-pSEO corpus scored worse than its expected verdict
 * ceiling. Any failure here means the engine has regressed in a way that
 * causes it to flag sites that demonstrably win at pSEO: which is a bug
 * in OUR calibration, not the sites.
 *
 * Locally the test is a *soft* gate: it skips when no calibration results
 * exist or when the most recent run is older than 14 days, because a full run
 * makes live HTTP audits that take minutes and need network access, neither of
 * which belongs in `bun test`. Read a local skip as: "calibration has not been
 * run recently, so this says nothing."
 *
 * In CI it is a HARD gate. A gate that skips when its input is missing is
 * indistinguishable from a gate that passed, and that is exactly how this
 * suite came to never run: `scripts/calibration-results.json` is gitignored,
 * so on a fresh checkout the file cannot exist and every assertion below
 * silently evaporated. The `calibration` job in .github/workflows/ci.yml now
 * runs `bun run calibrate:corpus` (hermetic, `--fixtures-only`, no network)
 * immediately before this suite, so under CI a missing/stale results file, a
 * per-site fetch error, or a corpus that shrank below its coverage floor are
 * all FAILURES rather than skips.
 *
 * To run the calibration and refresh the gate:
 *
 *   bun run calibrate:corpus          # hermetic, committed fixtures, ~4 min
 *   bun run scripts/calibration-corpus.ts   # full run, live HTTP
 *
 * See:
 *   - docs/superpowers/specs/2026-05-03-calibration-against-reputable-pseo.md
 *   - packages/core/calibration/calibration-corpus.json
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Verdict } from "../../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_PATH = resolve(__dirname, "../../../../scripts/calibration-results.json");
const BASELINE_PATH = resolve(__dirname, "../../calibration/baseline-scorecard.json");
const STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * In CI there is no such thing as "calibration has not been run": the
 * `calibration` job runs it. So every soft skip below becomes a hard failure,
 * and "the gate did not run" stops being spelled the same way as "the gate
 * passed".
 *
 * The `checks` job also runs this file (it is part of `bun run test`) but does
 * NOT produce the results, so it opts out with PSEOLINT_CALIBRATION_MAY_SKIP.
 * The opt-out is deliberately the exception rather than the default: a new CI
 * job that runs the test suite without thinking about calibration gets a loud
 * failure telling it which knob to reach for, instead of a silent pass. Setting
 * this outside CI does nothing, since the local default is already to skip.
 */
const IS_CI =
  (process.env.CI === "true" || process.env.CI === "1") &&
  !process.env.PSEOLINT_CALIBRATION_MAY_SKIP;

/**
 * Floor on how many reputable sites the run actually gated. `--fixtures-only`
 * drops any corpus site whose committed fixture directory is missing, so a
 * deleted or mis-pathed fixture set would quietly reduce this suite to zero
 * assertions and still report green. 6 is the current count; it may only be
 * raised, and lowering it is a deliberate act that shows up in review.
 */
const MIN_GATED_REPUTABLE_SITES = 6;

/**
 * Tolerance for the scorecard ratchet. A `--fixtures-only` run is fully
 * deterministic (same fixtures, same ruleset => bit-identical metrics), so this
 * only absorbs float noise. It is NOT headroom for "a small regression is fine".
 */
const METRIC_EPSILON = 0.01;

const VERDICT_RANK: Record<Verdict, number> = {
  ready: 0,
  caution: 1,
  concerning: 2,
  critical: 3,
};

interface SiteResult {
  url: string;
  vertical: string;
  class?: "reputable" | "policy-violating" | "subject";
  expectedVerdictCeiling?: Verdict;
  pass: boolean;
  failureReason?: string;
  audit: null | { verdict: Verdict; risk: number; topDrivers: Array<{ ruleId: string; count: number; impact: number }> };
  error?: string;
}

/** Subset of packages/core/calibration/score.ts's output that this gate reads. */
interface Scorecard {
  confusion: { tp: number; fp: number; tn: number; fn: number; precision: number; recall: number; f1: number };
  calibration: { nReputable: number; nPolicy: number; auc: number; separationGap: number };
}

interface CalibrationResults {
  ranAt: string;
  rulesetVersion: string;
  corpusVersion: string;
  scorecard?: Scorecard;
  results: SiteResult[];
  ruleAggregates: Record<
    string,
    {
      sitesFired: number;
      sitesAudited: number;
      firingRatio: number;
      /** Finding count by emitted severity, AFTER severityOverrides are applied. */
      severityCounts: Record<string, number>;
    }
  >;
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

  /**
   * Locally: skip and say why. In CI: fail, because the only reason the input
   * can be absent there is that the gate is broken.
   */
  function unavailable(reason: string): void {
    if (IS_CI) {
      it("calibration ratchet must have run (CI)", () => {
        throw new Error(
          `${reason}\n` +
            "This suite is the verdict ratchet. In CI it must never skip: the `calibration` job\n" +
            "in .github/workflows/ci.yml runs `bun run calibrate:corpus` immediately before it.\n" +
            "A skip here would be reported as a pass, which is how the ratchet went unrun for\n" +
            "its entire existence. Fix the workflow, do not relax this check.",
        );
      });
    } else {
      it.skip(reason, () => {});
    }
  }

  if (status.state === "missing") {
    unavailable(
      "calibration not run: execute `bun run calibrate:corpus` to populate scripts/calibration-results.json",
    );
    return;
  }

  if (status.state === "stale") {
    unavailable(
      `calibration is ${status.ageDays} days old: re-run \`bun run calibrate:corpus\` to refresh the gate`,
    );
    return;
  }

  const { data } = status;

  it("ran against current ruleset version (or older: older is fine, the test still gates)", () => {
    expect(typeof data.rulesetVersion).toBe("string");
    expect(data.rulesetVersion.length).toBeGreaterThan(0);
  });

  for (const site of data.results) {
    if (site.error) {
      // A live run can legitimately hit a flaky origin. The CI run is
      // `--fixtures-only` and touches no network at all, so an error there means
      // a broken/missing fixture, i.e. a site that silently stopped being gated.
      if (IS_CI) {
        it(`${site.url} must audit cleanly from its committed fixture`, () => {
          throw new Error(
            `${site.url} errored during a hermetic --fixtures-only run: ${site.error}\n` +
              "No network is involved, so this is a broken fixture, not a flake. The site is\n" +
              "no longer being gated; repair packages/core/calibration/fixtures for it.",
          );
        });
      } else {
        it.skip(`${site.url} fetch errored: ${site.error}`, () => {});
      }
      continue;
    }
    if (!site.audit) continue;
    // Two-sided corpus: only the reputable class has a verdict ceiling to gate.
    // policy-violating + subject sites are measured by the scorecard, not here.
    if (site.class !== "reputable") continue;

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
      //
      // The AND was documented here but never implemented: the check looked
      // only at firingRatio, so it also failed rules that HAD been demoted,
      // which is the remedy it exists to demand. aeo/freshness-signals has
      // been demoted to info in every profile since the 2026-05-03 round
      // (auditor.ts) and still counted as a violator. severityCounts is
      // already recorded per rule, so "was it demoted" is answerable from the
      // data rather than by re-deriving the profile.
      if (agg.firingRatio > 0.8) {
        const firedAboveInfo = Object.entries(agg.severityCounts)
          .filter(([severity]) => severity !== "info")
          .reduce((sum, [, count]) => sum + count, 0);
        if (firedAboveInfo > 0) {
          violators.push(
            `${ruleId} firing on ${(agg.firingRatio * 100).toFixed(0)}% of reputable-pSEO sites` +
              ` at ${firedAboveInfo} finding(s) above info`,
          );
        }
      }
    }
    expect(violators, [
      "One or more rules fire on >80% of reputable-pSEO sites without a severity demotion.",
      "Per the decision matrix in the calibration spec, these must be suppressed for",
      "programmatic-directory or demoted in SCORING_PROFILES. Violators:",
      ...violators.map((v) => `  - ${v}`),
    ].join("\n")).toEqual([]);
  });

  /**
   * Coverage floor. Every assertion above is generated FROM the results file,
   * so a results file describing zero reputable sites produces zero failing
   * tests and a green run. `--fixtures-only` makes that reachable by accident:
   * it silently drops any corpus site whose fixture directory has gone missing.
   * Assert the gate's own surface area, not just its verdicts.
   */
  it(`gated at least ${MIN_GATED_REPUTABLE_SITES} reputable sites`, () => {
    const gated = data.results.filter((r) => r.class === "reputable" && r.audit !== null && !r.error);
    expect(
      gated.length,
      [
        `Only ${gated.length} reputable site(s) were audited and gated; the floor is ${MIN_GATED_REPUTABLE_SITES}.`,
        "Sites drop out of a --fixtures-only run when packages/core/calibration/fixtures/<site>/",
        "is missing, so this usually means a fixture set was deleted or moved rather than that",
        "the corpus shrank on purpose. Re-snapshot the fixtures, or lower the floor deliberately.",
        `Gated: ${gated.map((r) => r.url).join(", ") || "(none)"}`,
      ].join("\n"),
    ).toBeGreaterThanOrEqual(MIN_GATED_REPUTABLE_SITES);
  });

  /**
   * Scorecard ratchet: the piece the per-site verdict ceilings cannot see.
   *
   * A change can leave every site at or under its ceiling while still making
   * the risk score worse at *ranking* policy-violating sites above reputable
   * ones. That is what AUC measures, and it is the number that collapsed
   * (0.52 -> 0.36) on a branch whose CI stayed green throughout. The runner's
   * own ratchet only compares per-site verdicts and per-rule firing counts, so
   * AUC / precision / recall were ungated. They are gated here.
   *
   * Baseline: packages/core/calibration/baseline-scorecard.json, written only
   * by `bun run scripts/calibration-corpus.ts --write-baseline`. A deliberate
   * improvement is landed by re-writing that file in the same commit; a
   * regression has to be argued for in review rather than merged in silence.
   */
  describe("scorecard ratchet vs the committed baseline", () => {
    const baseline: { scorecard?: Scorecard } | null = existsSync(BASELINE_PATH)
      ? (JSON.parse(readFileSync(BASELINE_PATH, "utf-8")) as { scorecard?: Scorecard })
      : null;

    if (!baseline?.scorecard || !data.scorecard) {
      unavailable(
        !baseline?.scorecard
          ? `no baseline scorecard at ${BASELINE_PATH}: run \`bun run scripts/calibration-corpus.ts --fixtures-only --write-baseline\``
          : "calibration results carry no scorecard: the runner is older than the ratchet",
      );
      return;
    }

    const cur = data.scorecard;
    const base = baseline.scorecard;

    const metrics: Array<[string, number, number, string]> = [
      [
        "AUC (rank separation, policy vs reputable)",
        cur.calibration.auc,
        base.calibration.auc,
        "the risk score got worse at ranking policy-violating sites above reputable ones",
      ],
      ["recall (verdict >= concerning on policy sites)", cur.confusion.recall, base.confusion.recall, "the engine now misses policy-violating sites it used to catch"],
      ["precision (verdict >= concerning)", cur.confusion.precision, base.confusion.precision, "the engine now over-flags reputable sites it used to clear"],
    ];

    for (const [name, actual, expected, why] of metrics) {
      it(`${name} did not regress`, () => {
        expect(Number.isFinite(actual), `${name} is not a finite number (${actual}); the corpus class counts are probably degenerate`).toBe(true);
        expect(
          actual,
          [
            `${name} fell from ${expected.toFixed(4)} to ${actual.toFixed(4)}: ${why}.`,
            "Every per-site verdict can still be under its ceiling while this drops, which is",
            "exactly why the ceilings alone were not enough to catch the last regression.",
            "If the drop is intended, re-write packages/core/calibration/baseline-scorecard.json",
            "with `bun run scripts/calibration-corpus.ts --fixtures-only --write-baseline` in the",
            "same commit, so the new number is reviewed rather than absorbed.",
          ].join("\n"),
        ).toBeGreaterThanOrEqual(expected - METRIC_EPSILON);
      });
    }

    it("compared the same corpus shape as the baseline", () => {
      // AUC/precision/recall are only comparable across runs that scored the
      // same populations. If the class counts move, the metric comparison above
      // is meaningless and the baseline needs re-writing, not reinterpreting.
      expect(
        { nReputable: cur.calibration.nReputable, nPolicy: cur.calibration.nPolicy },
        "the corpus class counts changed since the baseline was written, so the metric " +
          "comparison above is not apples-to-apples: re-write the baseline with --write-baseline",
      ).toEqual({ nReputable: base.calibration.nReputable, nPolicy: base.calibration.nPolicy });
    });
  });
});
