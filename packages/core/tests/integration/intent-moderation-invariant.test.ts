import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { auditSource } from "../../src/auditor.js";
import type { AuditOptions, AuditSummary, RuleResult, Verdict } from "../../src/types.js";

const LADDER: Verdict[] = ["ready", "caution", "concerning", "critical"];
const idx = (v: Verdict) => LADDER.indexOf(v);
const ruleIds = (s: AuditSummary): string[] =>
  [...s.issues.blockers, ...s.issues.shouldFix, ...s.issues.informational]
    .map((f: RuleResult) => f.ruleId)
    .sort();

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.map((d) => rm(d, { recursive: true, force: true })));
  tempDirs.length = 0;
});

/** A spam-dominated location-pages fixture: near-duplicate templated LLC pages. */
async function fixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pseolint-intent-"));
  tempDirs.push(dir);
  const shared = Array.from({ length: 70 }, () => "Step choose name file articles appoint agent submit report").join(" ");
  const page = (state: string) =>
    `<html><body><h1>${state} LLC Template</h1><p>${shared} ${state} LLC filing guide with annual fee details.</p></body></html>`;
  for (const state of ["California", "Nevada", "Texas", "Florida"]) {
    await writeFile(join(dir, `${state.toLowerCase()}-llc.html`), page(state), "utf-8");
  }
  return dir;
}

// effort 20 is NEUTRAL for the effort moderator (between strictAt 5 and lenientAt 25),
// so it doesn't move the verdict on its own — but it's >= the intent farm-floor (10),
// so it satisfies tier 3's genuine-effort gate. This isolates the intent effect.
const base: AuditOptions = {
  rules: { templateDiversityMinUniqueRatio: 0.8, boilerplateMaxRatio: 0.4 },
  strict: true,
  contentEffortScore: 20,
  archetype: "directory",
};

describe("intent moderation — deterministic-safe invariant", () => {
  test("raw risk and findings are byte-identical with intent moderation on vs off; only the verdict may soften", async () => {
    const dir = await fixture();

    const off = await auditSource(dir, base);
    const on = await auditSource(dir, { ...base, intentModeration: true });

    // THE invariant: intent moderation is verdict-only. Raw risk never moves.
    expect(on.risk).toBe(off.risk);
    // It never changes which rules fired.
    expect(ruleIds(on)).toEqual(ruleIds(off));

    // Premise sanity: this fixture is spam-problematic, so `off` isn't already "ready"
    // (otherwise there'd be nothing to soften and the test would be vacuous).
    expect(idx(off.verdict)).toBeGreaterThan(idx("ready"));

    // The verdict softens by exactly one tier (directory + spam driver + effort >= 10),
    // and NEVER escalates.
    expect(idx(on.verdict)).toBe(idx(off.verdict) - 1);
  });

  test("with intent moderation off (default), the verdict is untouched by archetype/effort injection", async () => {
    const dir = await fixture();
    const withInjection = await auditSource(dir, base); // archetype + effort present, but intentModeration off
    const without = await auditSource(dir, {
      rules: base.rules,
      strict: true,
      contentEffortScore: 20,
    }); // no archetype at all
    expect(withInjection.verdict).toBe(without.verdict);
    expect(withInjection.risk).toBe(without.risk);
  });
});
