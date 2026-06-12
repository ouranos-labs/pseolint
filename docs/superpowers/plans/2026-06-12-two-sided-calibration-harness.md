# Two-Sided Calibration Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the existing reputable-only calibration harness so it also measures recall against a labeled policy-violating corpus, emitting a confusion matrix, per-class risk stats, and a per-rule firing table, gated by a no-regression ratchet.

**Architecture:** Extract the corpus types and a new pure scoring module under `packages/core/calibration/`, unit-tested with vitest. The existing `bun` runner (renamed `scripts/calibration-corpus.ts`) becomes a thin orchestrator that audits fixtures, feeds the pure scorer, writes the extended results, and exits non-zero on a verdict regression vs the committed baseline. Detection logic is untouched — this only measures.

**Tech Stack:** TypeScript (NodeNext, `.js` import specifiers), vitest, `bun` for the runner script, the existing `auditSource` engine + fixture directory loader.

**Spec:** `docs/superpowers/specs/2026-06-12-two-sided-calibration-harness-design.md`. This plan implements **Phase 1** (schema + types + scorer + ratchet, fully TDD against the existing reputable corpus). **Phase 2** (sourcing/labeling the policy-violating fixtures + committing the real baseline) is the final operational task and requires a human sign-off gate, so it is procedural, not test-driven.

---

## File Structure

**New files:**
- `packages/core/calibration/corpus-types.ts` — shared corpus types (`CorpusSite`, `Corpus`, `SiteClass`, `VERDICT_RANK`). Imported by both the runner and the scorer.
- `packages/core/calibration/score.ts` — pure scoring functions (alignment, flag, confusion matrix, median + risk stats, per-rule firing table, ratchet). No I/O, no engine calls — fully unit-testable.
- `packages/core/tests/calibration/score.test.ts` — unit tests for `score.ts`.

**Modified files:**
- `packages/core/calibration/reputable-pseo-corpus.json` → renamed `calibration-corpus.json`; every site gets `"class"`.
- `packages/core/calibration/reputable-pseo-corpus.schema.json` → renamed `calibration-corpus.schema.json`; adds `class` / `expectedVerdictFloor` / `visiblePolicies`, relaxes `expectedVerdictCeiling`, extends `groundTruth.status`.
- `scripts/calibration-reputable-pseo.ts` → renamed `scripts/calibration-corpus.ts`; imports the new modules, captures all fired/suppressed/demoted rule IDs, wires the scorer into the normal run, and applies the ratchet.
- `packages/core/tests/calibration/reputable-corpus.test.ts` — updated for the renamed results + new structure.

**Conventions to follow (already in this codebase):**
- All relative imports use the `.js` extension even for `.ts` sources (NodeNext). Example: `import { Verdict } from "../src/types.js"`.
- Tests: `import { describe, test, expect } from "vitest"`.
- Run core tests from `packages/core/`: `npm test` → `vitest run --passWithNoTests tests/**/*.test.ts`. Run a single file: `npx vitest run tests/calibration/score.test.ts`.

---

## Task 1: Rename corpus, schema, and runner; update references

**Files:**
- Rename: `packages/core/calibration/reputable-pseo-corpus.json` → `calibration-corpus.json`
- Rename: `packages/core/calibration/reputable-pseo-corpus.schema.json` → `calibration-corpus.schema.json`
- Rename: `scripts/calibration-reputable-pseo.ts` → `scripts/calibration-corpus.ts`
- Modify: the renamed JSON's `$schema` field; the renamed script's `CORPUS_PATH`; any references found by grep.

- [ ] **Step 1: Rename the three files with git**

```bash
cd /d/phili/SSD_Projects/pseolint
git mv packages/core/calibration/reputable-pseo-corpus.json packages/core/calibration/calibration-corpus.json
git mv packages/core/calibration/reputable-pseo-corpus.schema.json packages/core/calibration/calibration-corpus.schema.json
git mv scripts/calibration-reputable-pseo.ts scripts/calibration-corpus.ts
```

- [ ] **Step 2: Find every reference to the old names**

Run:
```bash
grep -rn "reputable-pseo-corpus\|calibration-reputable-pseo" --include="*.ts" --include="*.json" --include="*.md" . | grep -v node_modules
```
Expected: hits in `scripts/calibration-corpus.ts` (`CORPUS_PATH`, header comment), `packages/core/calibration/calibration-corpus.json` (`$schema`), `packages/core/src/auditor.ts` (a calibration comment near line 274), and possibly docs/memos. Note each path.

- [ ] **Step 3: Update the `$schema` pointer in the corpus JSON**

In `packages/core/calibration/calibration-corpus.json`, change the first line value:
```json
  "$schema": "./calibration-corpus.schema.json",
```

- [ ] **Step 4: Update `CORPUS_PATH` and the header comment in the runner**

In `scripts/calibration-corpus.ts`:
```ts
const CORPUS_PATH = resolve(__dirname, "../packages/core/calibration/calibration-corpus.json");
```
And update the file header's `Usage:` line to `bun run scripts/calibration-corpus.ts`.

- [ ] **Step 5: Update the remaining references**

For each non-rename hit from Step 2 (e.g. the `auditor.ts` comment, any doc), replace `reputable-pseo-corpus` → `calibration-corpus` and `calibration-reputable-pseo.ts` → `calibration-corpus.ts`. These are comments/strings only; no logic changes.

- [ ] **Step 6: Verify nothing still references the old names**

Run:
```bash
grep -rn "reputable-pseo-corpus\|calibration-reputable-pseo" --include="*.ts" --include="*.json" . | grep -v node_modules
```
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(calibration): rename reputable corpus/runner to calibration-corpus"
```

---

## Task 2: Extract & extend corpus types; migrate existing sites to `class: reputable`

**Files:**
- Create: `packages/core/calibration/corpus-types.ts`
- Modify: `packages/core/calibration/calibration-corpus.schema.json`
- Modify: `packages/core/calibration/calibration-corpus.json` (stamp `class`)
- Modify: `scripts/calibration-corpus.ts` (import shared types, drop the local duplicates)

- [ ] **Step 1: Create the shared types module**

Create `packages/core/calibration/corpus-types.ts`:
```ts
import type { Verdict } from "../src/types.js";

export type SiteClass =
  | "reputable"        // gated: verdict must be <= expectedVerdictCeiling
  | "policy-violating" // gated: verdict should reach expectedVerdictFloor; ratcheted on recall
  | "subject";         // NON-gated dogfood target (e.g. paperforge.dev); tracked, never pass/fail

export type Status =
  | "winning" | "stable" | "declining"   // reputable real-world fates
  | "penalized" | "deindexed";           // policy-violating real-world fates

export type TrafficClass = "very-high" | "high" | "medium" | "low";

/** Verdict ladder rank — higher = more concerning (and higher risk). */
export const VERDICT_RANK: Record<Verdict, number> = {
  ready: 0,
  caution: 1,
  concerning: 2,
  critical: 3,
};

export interface CorpusSite {
  url: string;
  vertical: string;
  expectedSiteType: string;
  /** Binary label. Reputable uses `expectedVerdictCeiling`; policy-violating uses `expectedVerdictFloor` + `visiblePolicies`. */
  class: SiteClass;
  /** Reputable only: engine verdict must be <= this (hard gate). */
  expectedVerdictCeiling?: Verdict;
  /** Policy-violating only: ASPIRATIONAL target — verdict should be >= this. NOT a CI gate. */
  expectedVerdictFloor?: Verdict;
  /** Policy-violating only: named spam policies the site visibly violates. */
  visiblePolicies?: string[];
  groundTruth: {
    status: Status;
    trafficClass: TrafficClass;
    evidence: string;
  };
  samplingHint?: { sampleSize?: number; noRender?: boolean };
  pinnedUrls?: string[];
  localFixtureDir?: string;
  classifierUrls?: string[];
}

export interface Corpus {
  version: string;
  rationale: string;
  sites: CorpusSite[];
}
```

- [ ] **Step 2: Point the runner at the shared types**

In `scripts/calibration-corpus.ts`:
- Delete the local `VERDICT_RANK`, `Status`, `TrafficClass`, `CorpusSite`, and `Corpus` declarations (lines ~72–108 in the original).
- Add to the import block near the top:
```ts
import { VERDICT_RANK, type CorpusSite, type Corpus } from "../packages/core/calibration/corpus-types.js";
```
(Keep the existing `import type { RuleResult, Verdict } from "../packages/core/src/types.js";`.)

- [ ] **Step 3: Migrate the corpus JSON — add `class: "reputable"` to every site**

Run this one-shot migration (stamps `class` only where missing; idempotent):
```bash
cd /d/phili/SSD_Projects/pseolint
node -e '
const fs=require("fs");
const p="packages/core/calibration/calibration-corpus.json";
const c=JSON.parse(fs.readFileSync(p,"utf8"));
for(const s of c.sites){ if(!s.class) s.class="reputable"; }
fs.writeFileSync(p, JSON.stringify(c,null,2)+"\n");
console.log("stamped",c.sites.length,"sites");
'
```
Expected: `stamped N sites`.

- [ ] **Step 4: Update the JSON schema**

In `packages/core/calibration/calibration-corpus.schema.json`, inside `definitions.CorpusSite.properties`, add:
```json
        "class": { "type": "string", "enum": ["reputable", "policy-violating"] },
        "expectedVerdictFloor": { "type": "string", "enum": ["ready", "caution", "concerning", "critical"] },
        "visiblePolicies": { "type": "array", "items": { "type": "string" } },
```
Change `definitions.CorpusSite.required` to:
```json
      "required": ["url", "vertical", "expectedSiteType", "class", "groundTruth"],
```
(Removes `expectedVerdictCeiling` from required — reputable sites still have it, policy-violating sites use the floor.) In `groundTruth.properties.status.enum`, extend to:
```json
            "status": { "type": "string", "enum": ["winning", "stable", "declining", "penalized", "deindexed"] },
```

- [ ] **Step 5: Verify the runner still type-checks and runs against fixtures**

Run:
```bash
cd /d/phili/SSD_Projects/pseolint
bun run scripts/calibration-corpus.ts 2>&1 | tail -20
```
Expected: it audits the corpus (fixture-backed sites show `[fixture]`), prints a Summary, and writes `scripts/calibration-results.{json,md}`. No type/import errors. (Verdicts should be unchanged from before — this task added a field, not logic.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(calibration): shared corpus types + binary class label; migrate sites to reputable"
```

---

## Task 3: Pure scorer — site alignment

**Files:**
- Create: `packages/core/calibration/score.ts`
- Test: `packages/core/tests/calibration/score.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/calibration/score.test.ts`:
```ts
import { describe, test, expect } from "vitest";
import { evaluateAlignment, type ScoredAudit } from "../../calibration/score.js";
import type { CorpusSite } from "../../calibration/corpus-types.js";

function audit(partial: Partial<ScoredAudit>): ScoredAudit {
  return { verdict: "ready", risk: 0, firedRuleIds: [], suppressedRuleIds: [], demotedRuleIds: [], ...partial };
}
function site(partial: Partial<CorpusSite>): CorpusSite {
  return {
    url: "https://x.test/", vertical: "v", expectedSiteType: "t", class: "reputable",
    groundTruth: { status: "stable", trafficClass: "medium", evidence: "e" }, ...partial,
  };
}

describe("evaluateAlignment", () => {
  test("reputable passes when verdict is at or below its ceiling", () => {
    const s = site({ class: "reputable", expectedVerdictCeiling: "caution" });
    expect(evaluateAlignment(s, audit({ verdict: "caution" })).aligned).toBe(true);
    expect(evaluateAlignment(s, audit({ verdict: "ready" })).aligned).toBe(true);
  });
  test("reputable fails when verdict exceeds its ceiling", () => {
    const s = site({ class: "reputable", expectedVerdictCeiling: "caution" });
    expect(evaluateAlignment(s, audit({ verdict: "concerning" })).aligned).toBe(false);
  });
  test("policy-violating passes when verdict is at or above its floor", () => {
    const s = site({ class: "policy-violating", expectedVerdictFloor: "concerning" });
    expect(evaluateAlignment(s, audit({ verdict: "concerning" })).aligned).toBe(true);
    expect(evaluateAlignment(s, audit({ verdict: "critical" })).aligned).toBe(true);
  });
  test("policy-violating fails (under-flagged) when verdict is below its floor", () => {
    const s = site({ class: "policy-violating", expectedVerdictFloor: "concerning" });
    expect(evaluateAlignment(s, audit({ verdict: "caution" })).aligned).toBe(false);
  });
  test("subject is always 'aligned' (never gated) regardless of verdict", () => {
    const s = site({ class: "subject" });
    expect(evaluateAlignment(s, audit({ verdict: "critical" })).aligned).toBe(true);
    expect(evaluateAlignment(s, audit({ verdict: "ready" })).aligned).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd /d/phili/SSD_Projects/pseolint/packages/core
npx vitest run tests/calibration/score.test.ts
```
Expected: FAIL — cannot resolve `../../calibration/score.js` (module not created yet).

- [ ] **Step 3: Write the minimal implementation**

Create `packages/core/calibration/score.ts`:
```ts
import type { Verdict } from "../src/types.js";
import { VERDICT_RANK, type CorpusSite, type SiteClass } from "./corpus-types.js";

/** Minimal per-site audit shape the scorer needs (decoupled from AuditSummary). */
export interface ScoredAudit {
  verdict: Verdict;
  risk: number;
  /** Every rule that emitted >= 1 finding (any severity). */
  firedRuleIds: string[];
  /** Rules the site-classifier suppressed (siteClassification.suppressedRules). */
  suppressedRuleIds: string[];
  /** Rules whose severity the scoring profile demoted (appliedSeverityDemotions). */
  demotedRuleIds: string[];
}

export interface ScoreRow {
  url: string;
  siteClass: SiteClass;
  audit: ScoredAudit;
}

export interface Alignment {
  aligned: boolean;
  note: string;
}

/**
 * Report (not a gate): does the engine's verdict sit on the correct side of the
 * site's aspirational label? Reputable → verdict <= ceiling. Policy-violating →
 * verdict >= floor (falling short is expected at baseline and IS the measurement).
 */
export function evaluateAlignment(site: CorpusSite, audit: ScoredAudit): Alignment {
  const rank = VERDICT_RANK[audit.verdict];
  if (site.class === "subject") {
    return { aligned: true, note: `tracked subject — verdict ${audit.verdict} (no gate)` };
  }
  if (site.class === "reputable") {
    const ceiling = site.expectedVerdictCeiling ?? "critical";
    const aligned = rank <= VERDICT_RANK[ceiling];
    return { aligned, note: `verdict ${audit.verdict} ${aligned ? "<=" : ">"} ceiling ${ceiling}` };
  }
  const floor = site.expectedVerdictFloor ?? "concerning";
  const aligned = rank >= VERDICT_RANK[floor];
  return {
    aligned,
    note: aligned ? `verdict ${audit.verdict} >= floor ${floor}` : `verdict ${audit.verdict} < floor ${floor} (under-flagged)`,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd /d/phili/SSD_Projects/pseolint/packages/core
npx vitest run tests/calibration/score.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /d/phili/SSD_Projects/pseolint
git add packages/core/calibration/score.ts packages/core/tests/calibration/score.test.ts
git commit -m "feat(calibration): site alignment scoring (reputable ceiling / policy floor)"
```

---

## Task 4: Pure scorer — flag prediction + confusion matrix

**Files:**
- Modify: `packages/core/calibration/score.ts`
- Test: `packages/core/tests/calibration/score.test.ts`

- [ ] **Step 1: Write the failing test (append to score.test.ts)**

Add these imports at the top of the existing test file (merge into the existing import line):
```ts
import { evaluateAlignment, confusionMatrix, isFlagged, type ScoredAudit, type ScoreRow } from "../../calibration/score.js";
```
Append:
```ts
function row(siteClass: ScoreRow["siteClass"], verdict: ScoredAudit["verdict"]): ScoreRow {
  return { url: `https://${siteClass}-${verdict}.test/`, siteClass, audit: audit({ verdict }) };
}

describe("isFlagged", () => {
  test("flags at or above the default 'concerning' threshold", () => {
    expect(isFlagged(audit({ verdict: "concerning" }))).toBe(true);
    expect(isFlagged(audit({ verdict: "critical" }))).toBe(true);
    expect(isFlagged(audit({ verdict: "caution" }))).toBe(false);
  });
});

describe("confusionMatrix", () => {
  test("counts TP/FP/TN/FN and derives precision/recall/F1", () => {
    const rows: ScoreRow[] = [
      row("policy-violating", "critical"),   // TP
      row("policy-violating", "caution"),    // FN (under-flagged)
      row("reputable", "ready"),             // TN
      row("reputable", "concerning"),        // FP
    ];
    const m = confusionMatrix(rows);
    expect({ tp: m.tp, fp: m.fp, tn: m.tn, fn: m.fn }).toEqual({ tp: 1, fp: 1, tn: 1, fn: 1 });
    expect(m.precision).toBeCloseTo(0.5);
    expect(m.recall).toBeCloseTo(0.5);
    expect(m.f1).toBeCloseTo(0.5);
  });
  test("precision/recall/F1 are 0 (not NaN) when denominators are empty", () => {
    const m = confusionMatrix([row("reputable", "ready")]);
    expect(m.precision).toBe(0);
    expect(m.recall).toBe(0);
    expect(m.f1).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd /d/phili/SSD_Projects/pseolint/packages/core
npx vitest run tests/calibration/score.test.ts
```
Expected: FAIL — `confusionMatrix`/`isFlagged` are not exported.

- [ ] **Step 3: Write the implementation (append to score.ts)**

```ts
export const DEFAULT_FLAG_THRESHOLD: Verdict = "concerning";

/** Engine "positive" prediction: verdict at or above the flag threshold. */
export function isFlagged(audit: ScoredAudit, threshold: Verdict = DEFAULT_FLAG_THRESHOLD): boolean {
  return VERDICT_RANK[audit.verdict] >= VERDICT_RANK[threshold];
}

export interface Confusion {
  tp: number; fp: number; tn: number; fn: number;
  precision: number; recall: number; f1: number;
}

/** Binary classifier metrics: label-positive = policy-violating, prediction = isFlagged. */
export function confusionMatrix(rows: ScoreRow[], threshold: Verdict = DEFAULT_FLAG_THRESHOLD): Confusion {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const r of rows) {
    const flagged = isFlagged(r.audit, threshold);
    const positive = r.siteClass === "policy-violating";
    if (positive && flagged) tp++;
    else if (positive && !flagged) fn++;
    else if (!positive && flagged) fp++;
    else tn++;
  }
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { tp, fp, tn, fn, precision, recall, f1 };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd /d/phili/SSD_Projects/pseolint/packages/core
npx vitest run tests/calibration/score.test.ts
```
Expected: PASS (all prior tests + 3 new).

- [ ] **Step 5: Commit**

```bash
cd /d/phili/SSD_Projects/pseolint
git add packages/core/calibration/score.ts packages/core/tests/calibration/score.test.ts
git commit -m "feat(calibration): flag prediction + confusion matrix (P/R/F1)"
```

---

## Task 5: Pure scorer — median + per-class risk stats

**Files:**
- Modify: `packages/core/calibration/score.ts`
- Test: `packages/core/tests/calibration/score.test.ts`

- [ ] **Step 1: Write the failing test (append)**

Merge into the score.js import line: `median, perClassRiskStats`. Append:
```ts
describe("median", () => {
  test("odd and even length", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  test("empty is NaN", () => {
    expect(Number.isNaN(median([]))).toBe(true);
  });
});

describe("perClassRiskStats", () => {
  test("computes per-class min/median/max and clean-separation flag", () => {
    const rows: ScoreRow[] = [
      { url: "a", siteClass: "reputable", audit: audit({ risk: 10 }) },
      { url: "b", siteClass: "reputable", audit: audit({ risk: 20 }) },
      { url: "c", siteClass: "policy-violating", audit: audit({ risk: 60 }) },
      { url: "d", siteClass: "policy-violating", audit: audit({ risk: 80 }) },
    ];
    const s = perClassRiskStats(rows);
    expect(s.reputable.median).toBe(15);
    expect(s.policyViolating.median).toBe(70);
    expect(s.cleanlySeparated).toBe(true); // max reputable (20) < min policy (60)
  });
  test("not cleanly separated when ranges overlap", () => {
    const rows: ScoreRow[] = [
      { url: "a", siteClass: "reputable", audit: audit({ risk: 65 }) },
      { url: "c", siteClass: "policy-violating", audit: audit({ risk: 60 }) },
    ];
    expect(perClassRiskStats(rows).cleanlySeparated).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd /d/phili/SSD_Projects/pseolint/packages/core
npx vitest run tests/calibration/score.test.ts
```
Expected: FAIL — `median`/`perClassRiskStats` not exported.

- [ ] **Step 3: Write the implementation (append to score.ts)**

```ts
export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

export interface ClassRisk { n: number; min: number; median: number; max: number; }
export interface RiskStats {
  reputable: ClassRisk;
  policyViolating: ClassRisk;
  /** True when the highest reputable risk is below the lowest policy-violating risk. */
  cleanlySeparated: boolean;
}

function classRisk(risks: number[]): ClassRisk {
  return {
    n: risks.length,
    min: risks.length ? Math.min(...risks) : NaN,
    median: median(risks),
    max: risks.length ? Math.max(...risks) : NaN,
  };
}

export function perClassRiskStats(rows: ScoreRow[]): RiskStats {
  const rep = rows.filter((r) => r.siteClass === "reputable").map((r) => r.audit.risk);
  const pol = rows.filter((r) => r.siteClass === "policy-violating").map((r) => r.audit.risk);
  const reputable = classRisk(rep);
  const policyViolating = classRisk(pol);
  const cleanlySeparated = rep.length > 0 && pol.length > 0 && reputable.max < policyViolating.min;
  return { reputable, policyViolating, cleanlySeparated };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd /d/phili/SSD_Projects/pseolint/packages/core
npx vitest run tests/calibration/score.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /d/phili/SSD_Projects/pseolint
git add packages/core/calibration/score.ts packages/core/tests/calibration/score.test.ts
git commit -m "feat(calibration): per-class risk distribution + separation check"
```

---

## Task 6: Pure scorer — per-rule firing table

**Files:**
- Modify: `packages/core/calibration/score.ts`
- Test: `packages/core/tests/calibration/score.test.ts`

- [ ] **Step 1: Write the failing test (append)**

Merge into the score.js import line: `perRuleFiringTable`. Append:
```ts
describe("perRuleFiringTable", () => {
  test("counts fired/suppressed/demoted per rule, split by class", () => {
    const rows: ScoreRow[] = [
      { url: "good1", siteClass: "reputable", audit: audit({ firedRuleIds: ["spam/thin-content"] }) },
      { url: "bad1", siteClass: "policy-violating", audit: audit({ firedRuleIds: ["spam/thin-content", "spam/entity-swap"] }) },
      { url: "bad2", siteClass: "policy-violating", audit: audit({ firedRuleIds: [], suppressedRuleIds: ["spam/entity-swap"], demotedRuleIds: ["aeo/citable-facts"] }) },
    ];
    const t = perRuleFiringTable(rows);
    expect(t["spam/thin-content"]).toEqual({ reputableFired: 1, reputableTotal: 1, policyFired: 1, policyTotal: 2, suppressedOn: 0, demotedOn: 0 });
    expect(t["spam/entity-swap"]).toEqual({ reputableFired: 0, reputableTotal: 1, policyFired: 1, policyTotal: 2, suppressedOn: 1, demotedOn: 0 });
    expect(t["aeo/citable-facts"].demotedOn).toBe(1);
  });
  test("a duplicate ruleId on one site counts that site once", () => {
    const rows: ScoreRow[] = [
      { url: "bad1", siteClass: "policy-violating", audit: audit({ firedRuleIds: ["spam/thin-content", "spam/thin-content"] }) },
    ];
    expect(perRuleFiringTable(rows)["spam/thin-content"].policyFired).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd /d/phili/SSD_Projects/pseolint/packages/core
npx vitest run tests/calibration/score.test.ts
```
Expected: FAIL — `perRuleFiringTable` not exported.

- [ ] **Step 3: Write the implementation (append to score.ts)**

```ts
export interface RuleFiring {
  reputableFired: number;
  reputableTotal: number;
  policyFired: number;
  policyTotal: number;
  suppressedOn: number;
  demotedOn: number;
}

/**
 * Per-rule firing across the corpus, split by class, plus suppressed/demoted
 * attribution. A rule "fired" on a site if it emitted >=1 finding; each site is
 * counted at most once per rule.
 */
export function perRuleFiringTable(rows: ScoreRow[]): Record<string, RuleFiring> {
  const reputableTotal = rows.filter((r) => r.siteClass === "reputable").length;
  const policyTotal = rows.filter((r) => r.siteClass === "policy-violating").length;
  const table: Record<string, RuleFiring> = {};
  const ensure = (id: string): RuleFiring =>
    (table[id] ??= { reputableFired: 0, reputableTotal, policyFired: 0, policyTotal, suppressedOn: 0, demotedOn: 0 });
  for (const r of rows) {
    for (const id of new Set(r.audit.firedRuleIds)) {
      const e = ensure(id);
      if (r.siteClass === "reputable") e.reputableFired++;
      else e.policyFired++;
    }
    for (const id of new Set(r.audit.suppressedRuleIds)) ensure(id).suppressedOn++;
    for (const id of new Set(r.audit.demotedRuleIds)) ensure(id).demotedOn++;
  }
  return table;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd /d/phili/SSD_Projects/pseolint/packages/core
npx vitest run tests/calibration/score.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /d/phili/SSD_Projects/pseolint
git add packages/core/calibration/score.ts packages/core/tests/calibration/score.test.ts
git commit -m "feat(calibration): per-rule firing table with suppressed/demoted columns"
```

---

## Task 7: Pure scorer — ratchet (no-regression gate)

**Files:**
- Modify: `packages/core/calibration/score.ts`
- Test: `packages/core/tests/calibration/score.test.ts`

- [ ] **Step 1: Write the failing test (append)**

Merge into the score.js import line: `ratchet, type Baseline`. Append:
```ts
describe("ratchet", () => {
  const sites: CorpusSite[] = [
    site({ url: "good1", class: "reputable", expectedVerdictCeiling: "caution" }),
    site({ url: "bad1", class: "policy-violating", expectedVerdictFloor: "critical" }),
  ];
  const baseline: Baseline = {
    perSiteVerdict: { good1: "caution", bad1: "concerning" },
    perRule: { "spam/entity-swap": { policyFired: 1, reputableFired: 0 } },
  };

  test("green when nothing regresses", () => {
    const rows: ScoreRow[] = [
      { url: "good1", siteClass: "reputable", audit: audit({ verdict: "caution", firedRuleIds: [] }) },
      { url: "bad1", siteClass: "policy-violating", audit: audit({ verdict: "concerning", firedRuleIds: ["spam/entity-swap"] }) },
    ];
    const r = ratchet(rows, sites, baseline);
    expect(r.verdictRegressions).toEqual([]);
    expect(r.ruleRegressions).toEqual([]);
  });
  test("flags a reputable site exceeding its ceiling", () => {
    const rows: ScoreRow[] = [
      { url: "good1", siteClass: "reputable", audit: audit({ verdict: "concerning" }) },
    ];
    expect(ratchet(rows, sites, baseline).verdictRegressions.length).toBe(1);
  });
  test("flags a policy-violating site whose verdict dropped below baseline (recall regression)", () => {
    const rows: ScoreRow[] = [
      { url: "bad1", siteClass: "policy-violating", audit: audit({ verdict: "caution" }) },
    ];
    expect(ratchet(rows, sites, baseline).verdictRegressions.length).toBe(1);
  });
  test("reports rule-level recall drop and FP rise as soft regressions", () => {
    const rows: ScoreRow[] = [
      { url: "bad1", siteClass: "policy-violating", audit: audit({ verdict: "concerning", firedRuleIds: [] }) }, // entity-swap stopped firing
    ];
    const r = ratchet(rows, sites, baseline);
    expect(r.ruleRegressions.some((m) => m.includes("recall dropped"))).toBe(true);
  });
  test("a subject site never produces a verdict regression", () => {
    const subjectSites: CorpusSite[] = [site({ url: "mine", class: "subject" })];
    const rows: ScoreRow[] = [{ url: "mine", siteClass: "subject", audit: audit({ verdict: "critical" }) }];
    expect(ratchet(rows, subjectSites, baseline).verdictRegressions).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd /d/phili/SSD_Projects/pseolint/packages/core
npx vitest run tests/calibration/score.test.ts
```
Expected: FAIL — `ratchet`/`Baseline` not exported.

- [ ] **Step 3: Write the implementation (append to score.ts)**

```ts
export interface Baseline {
  /** Last committed verdict per site URL. */
  perSiteVerdict: Record<string, Verdict>;
  /** Last committed firing counts per rule. */
  perRule: Record<string, { policyFired: number; reputableFired: number }>;
}

export interface RatchetResult {
  /** HARD gate: reputable over ceiling, or policy-violating below its baseline verdict. */
  verdictRegressions: string[];
  /** SOFT (warn): a rule's recall dropped or its reputable false-positives rose vs baseline. */
  ruleRegressions: string[];
}

/**
 * No-regression ratchet vs the committed baseline. Green at baseline by
 * construction; it only fires when a change makes the engine worse.
 */
export function ratchet(rows: ScoreRow[], sites: CorpusSite[], baseline: Baseline): RatchetResult {
  const siteByUrl = new Map(sites.map((s) => [s.url, s]));
  const verdictRegressions: string[] = [];
  for (const r of rows) {
    const s = siteByUrl.get(r.url);
    if (!s) continue;
    const curRank = VERDICT_RANK[r.audit.verdict];
    if (s.class === "reputable") {
      const ceiling = s.expectedVerdictCeiling ?? "critical";
      if (curRank > VERDICT_RANK[ceiling]) {
        verdictRegressions.push(`${r.url}: reputable verdict ${r.audit.verdict} exceeds ceiling ${ceiling}`);
      }
    } else if (s.class === "policy-violating") {
      const base = baseline.perSiteVerdict[r.url];
      if (base && curRank < VERDICT_RANK[base]) {
        verdictRegressions.push(`${r.url}: recall dropped — verdict ${r.audit.verdict} < baseline ${base}`);
      }
    }
    // s.class === "subject": never gated — skipped intentionally.
  }
  const ruleRegressions: string[] = [];
  const current = perRuleFiringTable(rows);
  for (const [id, base] of Object.entries(baseline.perRule)) {
    const cur = current[id];
    const curPolicy = cur?.policyFired ?? 0;
    const curRep = cur?.reputableFired ?? 0;
    if (curPolicy < base.policyFired) ruleRegressions.push(`${id}: recall dropped (${base.policyFired} -> ${curPolicy} policy sites)`);
    if (curRep > base.reputableFired) ruleRegressions.push(`${id}: false-positives rose (${base.reputableFired} -> ${curRep} reputable sites)`);
  }
  return { verdictRegressions, ruleRegressions };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd /d/phili/SSD_Projects/pseolint/packages/core
npx vitest run tests/calibration/score.test.ts
```
Expected: PASS (all score.ts tests green).

- [ ] **Step 5: Commit**

```bash
cd /d/phili/SSD_Projects/pseolint
git add packages/core/calibration/score.ts packages/core/tests/calibration/score.test.ts
git commit -m "feat(calibration): no-regression ratchet (verdict hard, per-rule soft)"
```

---

## Task 8: Wire the scorer into the runner

**Files:**
- Modify: `scripts/calibration-corpus.ts`

This task captures all fired/suppressed/demoted rule IDs per site, feeds the pure scorer, extends the results JSON + markdown, and applies the ratchet against the previously-committed results.

- [ ] **Step 1: Add imports and extend the `SiteResult.audit` shape**

In `scripts/calibration-corpus.ts`, add to the import block:
```ts
import {
  confusionMatrix, perClassRiskStats, perRuleFiringTable, ratchet,
  type ScoreRow, type Confusion, type RiskStats, type RuleFiring, type Baseline,
} from "../packages/core/calibration/score.js";
```
In the `SiteResult["audit"]` object type, add three fields after `topDrivers`:
```ts
    /** Every rule that emitted >=1 finding (any severity). */
    firedRuleIds: string[];
    /** Rules the site-classifier suppressed. */
    suppressedRuleIds: string[];
    /** Rules the scoring profile demoted. */
    demotedRuleIds: string[];
```

- [ ] **Step 2: Populate the new fields in `auditOne`**

In `auditOne`, immediately after `const drivers = topDrivers({ ... });` (before `result.audit = {`), add:
```ts
      const firedRuleIds = [...new Set(
        [...summary.issues.blockers, ...summary.issues.shouldFix, ...summary.issues.informational]
          .map((r) => r.ruleId),
      )];
      const suppressedRuleIds = summary.siteClassification?.suppressedRules ?? [];
      const demotedRuleIds = summary.appliedSeverityDemotions ?? [];
```
Then add these three keys into the `result.audit = { ... }` object (after `v6PathExecuted`):
```ts
        firedRuleIds,
        suppressedRuleIds,
        demotedRuleIds,
```

- [ ] **Step 2b: Make `auditOne`'s pass/fail class-aware**

The existing `result.pass = actualRank <= ceilingRank` assumes every site has an `expectedVerdictCeiling`. That field is now optional (only `reputable` sites have it), so a `policy-violating` or `subject` site would compute `VERDICT_RANK[undefined]` and spuriously "fail," wrongly tripping the `if (failed > 0) process.exitCode = 1` gate. Replace the existing pass block in `auditOne` — the lines:
```ts
      const actualRank = VERDICT_RANK[summary.verdict];
      const ceilingRank = VERDICT_RANK[target.expectedVerdictCeiling];
      result.pass = actualRank <= ceilingRank;
      if (!result.pass) {
        result.failureReason =
          `Engine returned verdict='${summary.verdict}' on a site whose ground-truth ` +
          `evidence supports verdict <= '${target.expectedVerdictCeiling}'. The engine is mis-calibrated, not the site.`;
      }
```
with:
```ts
      const actualRank = VERDICT_RANK[summary.verdict];
      if (target.class === "reputable") {
        const ceilingRank = VERDICT_RANK[target.expectedVerdictCeiling ?? "critical"];
        result.pass = actualRank <= ceilingRank;
        if (!result.pass) {
          result.failureReason =
            `Engine returned verdict='${summary.verdict}' on a site whose ground-truth ` +
            `evidence supports verdict <= '${target.expectedVerdictCeiling}'. The engine is mis-calibrated, not the site.`;
        }
      } else {
        // policy-violating + subject are NOT hard-gated by the ceiling logic.
        // Their floor shortfall is surfaced in the scorecard's alignment report,
        // and policy-violating recall is gated by the ratchet (Step 5), not here.
        result.pass = true;
      }
```

- [ ] **Step 3: Extend the `CalibrationResults` type with the scorecard**

Add to the `CalibrationResults` interface (after `ruleAggregates`):
```ts
  /** Two-sided scorecard (added 2026-06). Present once the corpus has class labels. */
  scorecard: {
    confusion: Confusion;
    risk: RiskStats;
    perRule: Record<string, RuleFiring>;
    classCounts: { reputable: number; policyViolating: number; subject: number };
    /** Non-gated dogfood targets — verdict/risk/top fired rules, no pass/fail. */
    trackedSubjects: Array<{ url: string; verdict: string; risk: number; topFired: string[] }>;
  };
```

- [ ] **Step 4: Build score rows and the scorecard in `mainNormal`**

In `mainNormal`, after the `const audited = ...` line and before building `out`, add:
```ts
  const rows: ScoreRow[] = results
    .filter((r) => r.audit !== null)
    .map((r) => {
      const cs = corpus.sites.find((s) => s.url === r.url)!;
      return {
        url: r.url,
        siteClass: cs.class,
        audit: {
          verdict: r.audit!.verdict,
          risk: r.audit!.risk,
          firedRuleIds: r.audit!.firedRuleIds,
          suppressedRuleIds: r.audit!.suppressedRuleIds,
          demotedRuleIds: r.audit!.demotedRuleIds,
        },
      };
    });
  const scorecard = {
    confusion: confusionMatrix(rows),
    risk: perClassRiskStats(rows),
    perRule: perRuleFiringTable(rows),
    classCounts: {
      reputable: rows.filter((r) => r.siteClass === "reputable").length,
      policyViolating: rows.filter((r) => r.siteClass === "policy-violating").length,
      subject: rows.filter((r) => r.siteClass === "subject").length,
    },
    trackedSubjects: rows
      .filter((r) => r.siteClass === "subject")
      .map((r) => ({
        url: r.url,
        verdict: r.audit.verdict,
        risk: r.audit.risk,
        topFired: r.audit.firedRuleIds.slice(0, 8),
      })),
  };
```
Add `scorecard,` to the `out` object literal.

- [ ] **Step 5: Apply the ratchet against the previously-committed results**

Still in `mainNormal`, after `writeFileSync(RESULTS_JSON, ...)` and `writeFileSync(RESULTS_MD, ...)`, add:
```ts
  // Ratchet vs the previously-committed baseline (the results JSON from git HEAD
  // before this run overwrote it). Read it from git so a local re-run doesn't
  // ratchet against itself.
  let baseline: Baseline | null = null;
  try {
    const { execSync } = await import("node:child_process");
    const prior = execSync("git show HEAD:scripts/calibration-results.json", { encoding: "utf-8" });
    const priorOut = JSON.parse(prior) as CalibrationResults;
    baseline = {
      perSiteVerdict: Object.fromEntries(priorOut.results.filter((r) => r.audit).map((r) => [r.url, r.audit!.verdict])),
      perRule: Object.fromEntries(Object.entries(priorOut.scorecard?.perRule ?? {}).map(([id, f]) => [id, { policyFired: f.policyFired, reputableFired: f.reputableFired }])),
    };
  } catch {
    baseline = null; // no committed baseline yet (first run) — nothing to ratchet against
  }
  if (baseline) {
    const rr = ratchet(rows, corpus.sites, baseline);
    if (rr.ruleRegressions.length > 0) {
      console.log("");
      console.log(`${ansi.yellow}Per-rule regressions vs baseline (soft):${ansi.reset}`);
      for (const m of rr.ruleRegressions) console.log(`  ${ansi.yellow}~${ansi.reset} ${m}`);
    }
    if (rr.verdictRegressions.length > 0) {
      console.log("");
      console.log(`${ansi.red}Verdict regressions vs baseline (HARD — gate fails):${ansi.reset}`);
      for (const m of rr.verdictRegressions) console.log(`  ${ansi.red}x${ansi.reset} ${m}`);
      process.exitCode = 1;
    }
  }
```
Note: the existing `if (failed > 0) { process.exitCode = 1; }` block stays — reputable ceiling failures already set a non-zero exit. The ratchet adds the policy-violating recall gate.

- [ ] **Step 6: Add the scorecard blocks to the markdown report**

In `renderMarkdown`, after the existing `## Per-site verdicts` table block (before `## Per-rule fire-rate`), add:
```ts
  if (out.scorecard) {
    const c = out.scorecard.confusion;
    lines.push(`## Scorecard`);
    lines.push("");
    lines.push(`Classes: ${out.scorecard.classCounts.reputable} reputable, ${out.scorecard.classCounts.policyViolating} policy-violating.`);
    lines.push("");
    lines.push(`| | flagged | not flagged |`);
    lines.push(`| ---- | ------: | ----------: |`);
    lines.push(`| **policy-violating** | ${c.tp} (TP) | ${c.fn} (FN) |`);
    lines.push(`| **reputable** | ${c.fp} (FP) | ${c.tn} (TN) |`);
    lines.push("");
    lines.push(`Precision ${(c.precision * 100).toFixed(0)}% · Recall ${(c.recall * 100).toFixed(0)}% · F1 ${(c.f1 * 100).toFixed(0)}%`);
    const rk = out.scorecard.risk;
    lines.push("");
    lines.push(`Risk medians — reputable ${rk.reputable.median}, policy-violating ${rk.policyViolating.median}; cleanly separated: ${rk.cleanlySeparated ? "yes" : "no"}.`);
    lines.push("");
    if (out.scorecard.trackedSubjects.length > 0) {
      lines.push(`### Tracked subjects (non-gated)`);
      lines.push("");
      lines.push(`| Subject | Verdict | Risk | Top fired rules |`);
      lines.push(`| ------- | ------- | ---: | --------------- |`);
      for (const s of out.scorecard.trackedSubjects) {
        lines.push(`| ${s.url} | ${s.verdict} | ${s.risk} | ${s.topFired.map((r) => `\`${r}\``).join(", ")} |`);
      }
      lines.push("");
    }
  }
```

- [ ] **Step 7: Run the runner against the existing reputable corpus**

Run:
```bash
cd /d/phili/SSD_Projects/pseolint
bun run scripts/calibration-corpus.ts 2>&1 | tail -30
```
Expected: a `## Scorecard` section in `scripts/calibration-results.md` showing `policyViolating: 0` (no bad sites yet — TP/FN are 0, recall 0), all reputable sites still PASS their ceilings, exit code 0. Confirm `scripts/calibration-results.json` now has a `scorecard` key:
```bash
node -e "console.log(Object.keys(require('./scripts/calibration-results.json')))" | grep scorecard && echo OK
```
Expected: `OK`.

- [ ] **Step 8: Commit**

```bash
git add scripts/calibration-corpus.ts scripts/calibration-results.json scripts/calibration-results.md
git commit -m "feat(calibration): wire two-sided scorer + ratchet into the runner"
```

---

## Task 9: Update the calibration consumer test; run the full suite

**Files:**
- Modify: `packages/core/tests/calibration/reputable-corpus.test.ts`

- [ ] **Step 1: Read the existing consumer test to see what it asserts**

Run:
```bash
sed -n '1,80p' /d/phili/SSD_Projects/pseolint/packages/core/tests/calibration/reputable-corpus.test.ts
```
Note how it imports `scripts/calibration-results.json` (path + shape) and what it currently asserts (it asserts reputable sites pass their ceiling).

- [ ] **Step 2: Add a test asserting the scorecard shape exists**

Append a test to `reputable-corpus.test.ts` (adjust the results import name to match what the file already uses):
```ts
import calibrationResults from "../../../scripts/calibration-results.json";

describe("two-sided scorecard", () => {
  test("results include a scorecard with a confusion matrix and per-rule table", () => {
    const sc = (calibrationResults as any).scorecard;
    expect(sc).toBeDefined();
    expect(sc.confusion).toHaveProperty("tp");
    expect(sc.confusion).toHaveProperty("recall");
    expect(typeof sc.perRule).toBe("object");
    expect(sc.classCounts.reputable).toBeGreaterThan(0);
  });
  test("no reputable site is a false positive in the committed baseline", () => {
    // FP = reputable site flagged (verdict >= concerning). The committed baseline must have zero.
    expect((calibrationResults as any).scorecard.confusion.fp).toBe(0);
  });
});
```
Note: if the existing file already imports the results JSON under a different identifier, reuse it instead of re-importing.

- [ ] **Step 3: Run the full core test suite**

Run:
```bash
cd /d/phili/SSD_Projects/pseolint/packages/core
npm test
```
Expected: PASS, including `tests/calibration/score.test.ts`, `tests/calibration/reputable-corpus.test.ts`, and `tests/integration/audit-fixture-manifest.test.ts`. If `reputable-corpus.test.ts` fails on the FP assertion, that's a real signal a reputable site regressed — investigate before continuing.

- [ ] **Step 4: Typecheck**

Run:
```bash
cd /d/phili/SSD_Projects/pseolint/packages/core
npm run typecheck
```
Expected: no errors. (If `typecheck`'s tsconfig does not include `calibration/`, the vitest run in Step 3 is the type safety net — note that in the commit message.)

- [ ] **Step 5: Commit**

```bash
cd /d/phili/SSD_Projects/pseolint
git add packages/core/tests/calibration/reputable-corpus.test.ts
git commit -m "test(calibration): assert two-sided scorecard shape + zero reputable FPs"
```

---

## Task 10: Add paperforge.dev as a tracked subject (Phase 1 tail — no sign-off needed)

paperforge.dev is the user's own programmatic-SEO site (legal-document templates, ~5,600 pages on a `/templates/{role}-{document}-{state}` matrix, weak E-E-A-T, YMYL). It is added as a non-gated `subject` so we can watch its verdict move as detection improves. This requires no policy-violating sign-off (it's a tracked subject, not a ground-truth label), so it can run as soon as Task 9 is green.

**Files:**
- Modify: `packages/core/calibration/calibration-corpus.json` (add the subject entry)
- Create: `packages/core/calibration/fixtures/paperforge_dev/` (snapshot)

- [ ] **Step 1: Add the subject entry to the corpus**

Append to `sites[]` in `packages/core/calibration/calibration-corpus.json`:
```json
    {
      "url": "https://paperforge.dev/",
      "vertical": "legal-document-templates",
      "expectedSiteType": "programmatic-directory",
      "class": "subject",
      "visiblePolicies": ["scaled-content-abuse", "doorway", "thin-content"],
      "groundTruth": {
        "status": "stable",
        "trafficClass": "low",
        "evidence": "Own dogfood site; ~5,600 templated role×document×state pages, no E-E-A-T, YMYL (legal). Tracked subject — no pass/fail expectation."
      },
      "samplingHint": { "sampleSize": 25 },
      "pinnedUrls": []
    }
```

- [ ] **Step 2: Pin a representative URL sample (live crawl)**

Run:
```bash
cd /d/phili/SSD_Projects/pseolint
bun run scripts/calibration-corpus.ts --repin paperforge
```
Expected: `OK pinned N URLs` for paperforge.dev; the corpus entry's `pinnedUrls` is populated with a deterministic sample.

- [ ] **Step 3: Snapshot fixtures**

Run:
```bash
bun run scripts/calibration-corpus.ts --snapshot paperforge
```
Expected: `OK <n> HTML files`; creates `packages/core/calibration/fixtures/paperforge_dev/` with `_manifest.json`, page HTML, and (if present) `sitemap.xml`/`robots.txt`; the corpus entry gains `localFixtureDir`.

- [ ] **Step 4: Run normally and confirm the tracked-subjects report**

Run:
```bash
bun run scripts/calibration-corpus.ts 2>&1 | tail -30
grep -A6 "Tracked subjects" scripts/calibration-results.md
```
Expected: a "Tracked subjects (non-gated)" table row for `https://paperforge.dev/` showing its verdict, risk, and top fired rules. The overall run still exits 0 (subjects never gate). Confirm paperforge did NOT affect the confusion matrix (`scorecard.classCounts.subject` is 1; `reputable`/`policyViolating` counts unchanged).

- [ ] **Step 5: Commit**

```bash
git add packages/core/calibration/calibration-corpus.json packages/core/calibration/fixtures/paperforge_dev scripts/calibration-results.json scripts/calibration-results.md
git commit -m "feat(calibration): track paperforge.dev as a non-gated dogfood subject"
```

---

## Task 11 (Phase 2 — operational, not TDD): source the policy-violating corpus + commit the baseline

This task adds real labeled data and captures the first two-sided baseline. It is procedural and **gated on user sign-off** — do not capture fixtures before the candidate list is approved.

- [ ] **Step 1: Assemble a candidate list (no code)**

Research ~10–15 policy-violating sites with documented evidence (March-2024 deindexed cohort, named doorway / AI-content / thin-affiliate farms from trade coverage, or sites that unambiguously exhibit a named on-page violation). Spread across policies so each major detector family (scaled-content, doorway, thin-affiliation, site-reputation, keyword-stuffing, hidden-text) has ≥1 positive example, and deliberately include 1–2 sites that violate currently-uncovered policies so the table exposes whole-detector gaps. For each candidate record: `url`, proposed `class: "policy-violating"`, `expectedVerdictFloor`, `visiblePolicies[]`, `groundTruth` (`status: "deindexed"|"penalized"`, `trafficClass`, `evidence` URL). Label by **"visibly violates policies our on-page engine can detect," never "was penalized."**

- [ ] **Step 2: Present the list and get sign-off**

Present the candidate table to the user. Wait for approval. Adjust per feedback. Do not proceed to capture until approved.

- [ ] **Step 3: Add approved sites to the corpus**

Add each approved site as an object in `packages/core/calibration/calibration-corpus.json` `sites[]` with `class: "policy-violating"`, its `expectedVerdictFloor`, `visiblePolicies`, `groundTruth`, and a `pinnedUrls` list (≈25 representative pages) plus `classifierUrls` where the true site scale matters.

- [ ] **Step 4: Capture fixtures**

For currently-live sites:
```bash
cd /d/phili/SSD_Projects/pseolint
bun run scripts/calibration-corpus.ts --snapshot <filter-substring>
```
For documented-but-dead sites, capture HTML via the Wayback Machine and place it under `packages/core/calibration/fixtures/<host>/` with a hand-written `_manifest.json` (URL→file map) in the same format as existing fixtures, then set `localFixtureDir` on the corpus entry. Exclude any site that cannot be faithfully captured — never fabricate.

- [ ] **Step 5: Run the full two-sided baseline**

Run:
```bash
cd /d/phili/SSD_Projects/pseolint
bun run scripts/calibration-corpus.ts 2>&1 | tail -40
```
Expected: the scorecard now shows real TP/FN, a recall figure, the per-rule firing table populated on the policy-violating side, and the per-class risk medians. The expected shape (and the point of the exercise): high TN on reputable, **low recall on policy-violating** — the quantified hole. The run exits 0 (first baseline has no prior to regress against).

- [ ] **Step 6: Commit the baseline**

```bash
git add packages/core/calibration/calibration-corpus.json packages/core/calibration/fixtures scripts/calibration-results.json scripts/calibration-results.md
git commit -m "feat(calibration): policy-violating corpus + first two-sided baseline scorecard"
```

- [ ] **Step 7: Record the baseline numbers**

Append the headline numbers (recall, per-rule recall on the bad side, FP rate on reputable) to the spec's §5 or a short results note, so sub-project 2 (foundations) has an explicit target to beat.

---

## Self-Review

**Spec coverage:**
- §3.1 unified labeled corpus (`class`/`floor`/`visiblePolicies`, three-class incl. non-gated `subject`, ceiling optional, status enum) → Task 2 (types + JSON + schema); `subject` handling threaded through Tasks 3 (alignment), 7 (ratchet), 8 (tracked-subjects report).
- §3.2 policy-violating fixtures + labeling rule → Task 11.
- §3.3 two-sided scorer (alignment, confusion+P/R/F1, per-class risk, per-rule table with suppressed/demoted, "fired" defined, tracked-subjects report) → Tasks 3–6 + 8.
- §3.4 CI ratchet (reputable ceiling hard, policy-violating no-regression, subject never gated, per-rule soft) → Tasks 7–8 + 9.
- §4 two-phase sequencing + sign-off gate → Phase 1 = Tasks 1–9; paperforge subject (no sign-off) = Task 10; Phase 2 policy-violating corpus = Task 11.
- §5 determinism (fixture-mode) → reuses existing `localFixtureDir` path; §7 file-level change list → Tasks 1–2, 8.

**Placeholder scan:** No TBD/TODO; every code step has complete code; every command has expected output. Task 10 is intentionally procedural (real-world data sourcing can't be unit-tested) and is labeled as such.

**Type consistency:** `ScoredAudit`, `ScoreRow`, `Confusion`, `RiskStats`, `RuleFiring`, `Baseline`, `RatchetResult` are defined in Task 3/4/5/6/7 and consumed unchanged in Task 8. `VERDICT_RANK` and `CorpusSite` come from `corpus-types.ts` (Task 2) and are imported everywhere. `site.class` (binary) is used consistently. The runner's `SiteResult.audit` gains `firedRuleIds`/`suppressedRuleIds`/`demotedRuleIds` (Task 8 Step 1) which exactly match the `ScoredAudit` fields mapped in Step 4.

**Known refinements (deliberately out of Phase 1 scope, noted for the executor):**
- Determinism "fail-loud if a labeled site lacks a fixture" is not enforced in Phase 1 (the existing reputable corpus has some non-fixtured sites audited live). Add the hard guard in Phase 2 once the corpus is fully fixture-backed.
- If `npm run typecheck`'s tsconfig excludes `calibration/`, the vitest run is the type safety net for the new modules.
