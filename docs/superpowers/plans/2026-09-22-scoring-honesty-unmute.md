# Scoring Honesty Unmute Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make fired structural-spam clusters move the site verdict, without re-opening catalog chrome demotions or chasing verbose AI farms the rules do not fire on.

**Architecture:** Extract the duplicated impact table into `scoring.ts` so site and template paths share instance-count math. Enrichment already stores `clusterSize`; scoring must read it. Profile tables, `--strict`, template activation, and authority veto are small call-site changes on top of that.

**Tech Stack:** TypeScript (NodeNext, `.js` specifiers), vitest, existing `auditSource` fixtures, hermetic `bun run calibrate:corpus`.

**Spec:** `docs/superpowers/specs/2026-09-22-scoring-honesty-unmute.md`

## Global Constraints

- Do not unmute `spam/thin-content`, AEO, EEAT, OG, headings, alt, missing-author, or boilerplate on `programmatic-directory` / `unclear`.
- Do not change simhash or `thinContentMinWords` defaults.
- Do not remove rules from `PSEO_ONLY_RULE_IDS` (measured no-op on farms).
- Do not make content-effort default-on.
- If a reputable ceiling breaks: classifierUrls first, then an explicit ceiling bump — never re-demote the three spam rules on `unclear`.
- Bump `CORE_RULESET_VERSION` from `"19"` to `"20"` in the same PR as the scoring change.
- Imports keep the `.js` extension. Tests: `vitest` from `packages/core`.

## File Structure

**New:**
- `packages/core/src/scoring.ts` — `RULE_IMPACTS`, multipliers, `categoryForRule`, `instancesForFinding`, `scoreFromFindings`, `verdictForRisk`, `gradeForPenalty`.
- `packages/core/tests/scoring.test.ts` — instance count, cluster vs singleton, doorway table, blocker density.

**Modify:**
- `packages/core/src/types.ts` — `FindingContext` group variant.
- `packages/core/src/auditor.ts` — delete duplicated tables; import scoring; profile edits; `canActivateV6`; authority veto; `--strict` empty overrides; bump comments.
- `packages/core/src/per-template-scoring.ts` — import scoring; delete duplicate table.
- `packages/core/src/enrich-findings.ts` — group context.
- `packages/core/src/ruleset-version.ts` — `"20"`.
- `packages/core/src/formatters/console.ts` — `SCORED_RULE_COUNT`.
- `packages/cli/src/cli.ts` — `--strict` help text.
- `packages/core/tests/rule-impact-parity.test.ts` — coverage against `scoring.ts` only.
- `packages/core/tests/calibration/reputable-corpus.test.ts` — `gateFloor` loop + `MIN_GATED_POLICY_SITES`.
- `packages/core/calibration/corpus-types.ts` + `calibration-corpus.schema.json` + `calibration-corpus.json`.
- Tests listed per task.

---

### Task 1: Shared scoring module + cluster instance count

**Files:**
- Create: `packages/core/src/scoring.ts`
- Create: `packages/core/tests/scoring.test.ts`
- Modify: `packages/core/src/types.ts` (`FindingContext`)
- Modify: `packages/core/src/auditor.ts` (move tables, call `scoreFromFindings` from scoring, re-export if anything imported `categoryForRule` from auditor)
- Modify: `packages/core/src/per-template-scoring.ts`
- Modify: `packages/core/src/enrich-findings.ts` (`applyGrouping`)
- Modify: `packages/core/tests/rule-impact-parity.test.ts`

**Interfaces:**

```ts
export function instancesForFinding(f: RuleResult): number;
// cluster → context.clusterSize; group → context.size; else 1

export function scoreFromFindings(
  findings: RuleResult[],
  classification: SiteClassification | undefined,
  pageCount?: number,
): ScoreOutput;

export const RULE_IMPACTS: Record<string, RuleImpact>;
export const DEFAULT_RULE_IMPACT: RuleImpact;
```

`spam/doorway-pattern` becomes `{ baseImpact: 30, perInstance: 5, maxImpact: 80 }`.

`FindingContext` adds:

```ts
| { type: "group"; size: number; members: string[] }
```

`applyGrouping` on rollup (>3 pages) sets `context: { type: "group", size: rulefindings.length, members: urls }`.

Blocker count: for each finding with severity `error`|`critical`, add `instancesForFinding(f)`, not `1`.

- [ ] **Step 1: Write failing tests in `tests/scoring.test.ts`**

```ts
it("a 40-page entity-swap cluster scores like 40 instances, not 1", () => {
  const cluster: RuleResult = {
    ruleId: "spam/entity-swap",
    severity: "critical",
    confidence: "high",
    message: "cluster",
    context: {
      type: "cluster",
      clusterSize: 40,
      members: Array.from({ length: 40 }, (_, i) => `https://x.test/${i}`),
      worstPairs: [],
      similarityRange: [0.95, 0.99],
    },
  };
  expect(instancesForFinding(cluster)).toBe(40);
  const prog = { type: "programmatic-directory", confidence: 0.9, signals: [], suppressedRules: [] };
  const one = scoreFromFindings([{ ...cluster, context: { ...cluster.context!, clusterSize: 1, members: ["https://x.test/0"] } }], prog, 40);
  const many = scoreFromFindings([cluster], prog, 40);
  expect(many.risk).toBeGreaterThan(one.risk);
  expect(many.risk).toBeGreaterThanOrEqual(41); // concerning band
});
```

Also assert grouped unique-value `context.type === "group"` uses `size`.

- [ ] **Step 2: Run `npx vitest run tests/scoring.test.ts` from `packages/core`** — fail (module missing).

- [ ] **Step 3: Move tables + implement `instancesForFinding` / shared `scoreFromFindings`. Point auditor + per-template at it. Attach group context. Change doorway impact.**

- [ ] **Step 4: Rewrite `rule-impact-parity.test.ts` to import `RULE_IMPACTS` from `scoring.ts` and still require every scored `RULE_SCOPE` id. Delete the source-parse of two files.**

- [ ] **Step 5: `npx vitest run tests/scoring.test.ts tests/rule-impact-parity.test.ts tests/per-template-scoring.test.ts` — pass.**

---

### Task 2: Profile tables + `--strict` + comment/CLI copy

**Files:**
- Modify: `packages/core/src/auditor.ts` (`SCORING_PROFILES.unclear`, `programmatic-directory` confidenceOverrides, `profileFor`)
- Modify: `packages/core/src/formatters/console.ts`
- Modify: `packages/cli/src/cli.ts`
- Modify: `packages/core/tests/integration/auditor.test.ts`
- Modify: `packages/core/tests/integration/site-classifier-auditor.test.ts` (or new `tests/scoring-profiles.test.ts`)

**Produces:** `profileFor(classification, { strict?: boolean })`. When `strict` or degeneration-guard: empty override maps, weights from the classified type (degeneration still uses unclear weights as today).

Unclear: delete near-dup / entity-swap / doorway from both override maps.

programmatic-directory: delete those two rules from `confidenceOverrides` only.

`console.ts`: `import { SCORED_RULE_COUNT } from "../rules/scope.js"`; replace `TOTAL_V04_RULE_COUNT`.

CLI `--strict` help: `bypass pSEO-only rule suppression and scoring-profile severity demotions`.

- [ ] **Step 1: Failing tests**

```ts
it("unclear does not remap entity-swap severity", () => {
  const out = applyScoringProfileOverrides(
    [{ ruleId: "spam/entity-swap", severity: "critical", confidence: "high", message: "x" }],
    { type: "unclear", confidence: 0.5, signals: [], suppressedRules: [] },
  );
  expect(out[0].severity).toBe("critical");
  expect(out[0].confidence).toBe("high");
});

it("strict clears thin-content demotion on programmatic-directory", () => {
  // auditSource fixture classified programmatic-directory, options.strict true
  // appliedSeverityDemotions must not include spam/thin-content
});
```

Keep the existing ≥70% docs-profile test.

- [ ] **Step 2: Implement profile + profileFor(strict) + copy.**

- [ ] **Step 3: Run the new tests + `tests/integration/auditor.test.ts`.**

---

### Task 3: Template scoring on `unclear` + authority on the winning headline

**Files:**
- Modify: `packages/core/src/auditor.ts` (`canActivateV6`, verdict assembly ~3321–3426)
- Modify: `packages/core/tests/template-detection.test.ts` or a new `tests/template-activation.test.ts`
- Modify: `packages/core/tests/algorithms/authority/auditor-wiring.test.ts`

**Predicate (extract so it is testable without a crawl):**

```ts
export function shouldUseTemplateScoringPath(
  siteType: SiteType,
  candidates: TemplateCandidate[],
): boolean {
  if (siteType === "small-marketing") return false;
  return shouldActivateTemplateScoring(candidates);
}
```

`unclear` / `programmatic-directory` / `ecommerce` / `docs` / `blog` all allowed.

Verdict:

```ts
const fromRisk = verdictForRisk(risk);
const templateVerdict = siteVerdictFromTemplates(siteTemplates);
const preAuthority = templateVerdict ?? fromRisk;
const afterAuthority = shiftVerdictForAuthority(preAuthority, resolvedAuthorityScore, veto);
const verdict = shiftVerdictForEffort(afterAuthority, resolvedEffort);
```

`veto` is Task 4; in this task pass `allowLenient: true` so wiring is already on both paths.

- [ ] **Step 1: Test `shouldUseTemplateScoringPath("unclear", twoClusters) === true` and `("small-marketing", twoClusters) === false`.**

- [ ] **Step 2: Implement predicate; replace `canActivateV6`; apply authority to `preAuthority` not only `legacyVerdict`.**

- [ ] **Step 3: Run template + authority tests.**

---

### Task 4: Authority lenient veto

**Files:**
- Modify: `packages/core/src/scoring.ts` or `auditor.ts` — `allowAuthorityLenient(findings, categories): boolean`
- Modify: `packages/core/tests/algorithms/authority/auditor-wiring.test.ts`
- Modify: `packages/cli/tests/authority-score.test.ts` if it assumes unconditional ≥80 soften

```ts
const INTEGRITY_VETO_RULES = new Set([
  "spam/near-duplicate",
  "spam/entity-swap",
  "spam/doorway-pattern",
  "links/host-section-divergence",
]);

export function allowAuthorityLenient(
  findings: RuleResult[],
  categories: CategoryGrades,
): boolean {
  const g = categories.integrity.grade;
  if (g === "D" || g === "F") return false;
  for (const f of findings) {
    if (!INTEGRITY_VETO_RULES.has(f.ruleId)) continue;
    if (f.severity === "info") continue;
    if (instancesForFinding(f) >= 10) return false;
  }
  return true;
}
```

Lenient arm of `shiftVerdictForAuthority` no-ops when this is false. Strict arm unchanged.

- [ ] **Step 1: Unit-test veto true/false. Integration: 12-page entity-swap cluster HTML + `authorityScore: 95` does not soften vs no authority.** Existing two-page `auditor-wiring` high-authority soften must still hold.

- [ ] **Step 2: Wire veto into the authority call.**

- [ ] **Step 3: Run authority tests.**

---

### Task 5: `gateFloor` CI

**Files:**
- Modify: `packages/core/calibration/corpus-types.ts`
- Modify: `packages/core/calibration/calibration-corpus.schema.json`
- Modify: `packages/core/calibration/calibration-corpus.json` (only `gateFloor` flags, no floor value edits unless §3.1 protocol)
- Modify: `packages/core/tests/calibration/reputable-corpus.test.ts`

After Task 1–4 exist, run `bun run calibrate:corpus` locally to see which policy sites already meet their floor. Set `gateFloor: true` on:

- both `synthetic: true` sites,
- every `policy-violating` site with `detectability` not `off-page-only` whose **current** verdict already satisfies `expectedVerdictFloor`.

Leave verbose-farm misses and off-page parasites ungated.

`MIN_GATED_POLICY_SITES` = that count. Loop mirrors the reputable ceiling loop, inverted.

- [ ] **Step 1: Schema + type + a unit test that a fake results payload with `gateFloor: true` and verdict below floor fails the assertion helper (extract the rank compare if needed).**

- [ ] **Step 2: Stamp corpus JSON. Add the test loop + coverage floor.**

- [ ] **Step 3: Do not rewrite `expectedVerdictFloor` downward in this task.**

---

### Task 6: Ruleset bump, hermetic calibration, baseline

**Files:**
- Modify: `packages/core/src/ruleset-version.ts` → `"20"`
- Modify: any snapshot tests that pin `"19"`
- Possibly: `packages/core/calibration/baseline-scorecard.json` via `--write-baseline` **only if** recall/AUC did not fall and precision/ceiling protocol was followed

- [ ] **Step 1: Grep `CORE_RULESET_VERSION` / `"19"` in tests; bump.**

- [ ] **Step 2: `bun run calibrate:corpus` from repo root (hermetic fixtures).**

- [ ] **Step 3: Apply spec §3.1 FP protocol if a reputable ceiling fails. Re-run.**

- [ ] **Step 4: If metrics improved or stay within ratchet, `--write-baseline` in the same commit as the engine change.**

- [ ] **Step 5: `npx vitest run tests/calibration/reputable-corpus.test.ts` with `CI=true` and results present (or the CI job path).**

---

## Spec coverage

| Spec § | Task |
|---|---|
| 3.0 cluster/group instances, doorway table, extract scoring | 1 |
| 3.1 profile unmute | 2 |
| 3.5 `--strict` + copy | 2 |
| 3.2 template on unclear; authority on winning headline | 3 |
| 3.3 authority veto | 4 |
| 3.4 gateFloor | 5 |
| 3.6 copy | 2 |
| §4/§5 calibration + ruleset | 6 |

Out of scope in the spec has no task. That is intentional.
