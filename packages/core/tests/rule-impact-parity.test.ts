import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { RULE_SCOPE } from "../src/rules/scope.js";

/**
 * `RULE_IMPACTS` is declared twice: `auditor.ts` scores the site verdict from
 * its copy, `per-template-scoring.ts` scores the per-template cards from its
 * own. They cannot share a module without closing an ESM cycle (auditor imports
 * per-template-scoring), so they are kept in sync by hand.
 *
 * Hand-sync drifts. `tech/core-web-vitals`, `content/common-phrase-reuse`,
 * `content/wikipedia-paraphrase`, `content/citation-coverage` and
 * `links/host-section-divergence` had already fallen out of the per-template
 * copy, and the 2026-08-19 folklore-vs-fact batch shipped 13 rules with no
 * entry in EITHER table. A missing id is silent: it falls back to
 * `DEFAULT_RULE_IMPACT` (5/1/25), which saturates its 25-point cap on any rule
 * that fires once per audited page, so one template defect scores like 25
 * independent ones. That is what these tests exist to catch.
 *
 * Parsed from source rather than imported because neither table is exported;
 * exporting them purely for a test would widen the public surface of both
 * modules.
 */
type Impact = { baseImpact: number; perInstance: number; maxImpact?: number };

function parseImpacts(relPath: string, declPrefix: string): Record<string, Impact> {
  const src = readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), "utf8");
  const start = src.indexOf(declPrefix);
  expect(start, `${relPath}: could not find "${declPrefix}"`).toBeGreaterThan(-1);
  const body = src.slice(start, src.indexOf("\nconst DEFAULT_RULE_IMPACT", start));
  const out: Record<string, Impact> = {};
  const re =
    /"([^"]+)":\s*\{\s*baseImpact:\s*([\d.]+),\s*perInstance:\s*([\d.]+)(?:,\s*maxImpact:\s*([\d.]+))?\s*\}/g;
  for (const m of body.matchAll(re)) {
    out[m[1]] = {
      baseImpact: Number(m[2]),
      perInstance: Number(m[3]),
      ...(m[4] !== undefined ? { maxImpact: Number(m[4]) } : {}),
    };
  }
  return out;
}

const auditorImpacts = parseImpacts(
  "../src/auditor.ts",
  "const RULE_IMPACTS: Record<string, RuleImpact> = {",
);
const templateImpacts = parseImpacts(
  "../src/per-template-scoring.ts",
  "const RULE_IMPACTS: Record<string, { baseImpact: number; perInstance: number; maxImpact?: number }> = {",
);

describe("RULE_IMPACTS parity", () => {
  it("parses a non-trivial table from each module", () => {
    expect(Object.keys(auditorImpacts).length).toBeGreaterThan(40);
    expect(Object.keys(templateImpacts).length).toBeGreaterThan(40);
  });

  it("declares exactly the same rule ids in both tables", () => {
    const missing = Object.keys(auditorImpacts).filter((id) => !(id in templateImpacts));
    const extra = Object.keys(templateImpacts).filter((id) => !(id in auditorImpacts));
    expect({ missingFromPerTemplate: missing.sort(), extraInPerTemplate: extra.sort() }).toEqual({
      missingFromPerTemplate: [],
      extraInPerTemplate: [],
    });
  });

  it("uses identical values in both tables", () => {
    for (const [id, impact] of Object.entries(auditorImpacts)) {
      expect(templateImpacts[id], `per-template impact for ${id}`).toEqual(impact);
    }
  });
});

describe("RULE_IMPACTS coverage", () => {
  /**
   * Every SCORED rule needs an explicit impact. Falling back to
   * DEFAULT_RULE_IMPACT is never deliberate: it is what shipping a rule and
   * forgetting the table looks like.
   *
   * The backlog this list used to record is CLOSED. `links/unreachable-from-root`,
   * `tech/csr-bailout`, `tech/robots-compliance`, `data/missing-binding` and
   * `data/identical-across-pages` now carry explicit weights derived from what
   * each rule means, and the dead `data/data-binding` entry - an id nothing has
   * ever emitted - is gone.
   *
   * Keep this empty. A rule with no entry silently runs on DEFAULT_RULE_IMPACT
   * (5/1/25), which saturates its 25-point cap on any rule that fires once per
   * page, so one template defect scores like 25 independent ones.
   */
  const KNOWN_UNCOVERED: string[] = [];

  it("has an explicit impact for every scored rule", () => {
    const scored = Object.keys(RULE_SCOPE).filter((id) => !id.startsWith("audit/"));
    const uncovered = scored.filter((id) => !(id in auditorImpacts)).sort();
    expect(uncovered).toEqual([...KNOWN_UNCOVERED].sort());
  });

  it("keeps every impact entry pointed at a rule id that is actually dispatched", () => {
    // Every id in the table must be one some rule actually emits. The one
    // historical exception, `data/data-binding`, was removed: the rule file
    // emits `data/missing-binding` and `data/identical-across-pages`, so the
    // entry had never scored anything.
    const KNOWN_DEAD: string[] = [];
    const dead = Object.keys(auditorImpacts).filter((id) => !(id in RULE_SCOPE)).sort();
    expect(dead).toEqual([...KNOWN_DEAD].sort());
  });

  it("never lets a rule with a zero per-instance step carry a cap above its base", () => {
    // perInstance 0 means "the count is the sample size, not a defect count"
    // (the tech/hreflang-consistency lesson). A cap above the base would then be
    // unreachable and misleading about what the rule can contribute.
    for (const [id, i] of Object.entries(auditorImpacts)) {
      if (i.perInstance === 0 && i.maxImpact !== undefined) {
        expect(i.maxImpact, `${id}: perInstance 0 but cap > base`).toBe(i.baseImpact);
      }
    }
  });
});
