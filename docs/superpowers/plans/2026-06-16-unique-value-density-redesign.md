# content/unique-value Density Redesign: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `content/unique-value`'s binary exactly-page-exclusive-word count (absolute floor 100) with a rarity-**density** ratio so the rule stops shuffling and stops false-positiving on large, tightly-themed sites, while still catching near-duplicate / boilerplate / entity-swap pages.

**Architecture:** Per page, weight each distinct token by normalized IDF (`ln(N/df)/ln(N)`), average over the page's distinct tokens → `density ∈ [0,1]`. Fire `error` below `errorBelow`, `info` in the borderline band below `passBelow`. Continuous (no shuffle), ratio (length-robust), IDF-normalized (corpus-size-robust). New signature: `uniqueValueRule(pages, { passBelow, errorBelow })`.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), vitest, bun, turbo. Spec: `docs/superpowers/specs/2026-06-16-unique-value-density-redesign-design.md`.

**Hard gate:** This changes scoring for every user. Task 5 (calibration) is mandatory before merge, do not ship if the reputable-vs-spam density distributions don't separate.

---

## File map

- `packages/core/src/rules/content/unique-value.ts`: the metric (rewrite, ~30 lines) + new exported `UniqueValueThresholds`.
- `packages/core/tests/rules/content/unique-value.test.ts`: rewrite for density.
- `packages/core/src/auditor.ts`: DEFAULTS (L118), resolvedRules type (L705), invocation (L796), resolve (L2210).
- `packages/core/src/types.ts`: `AuditOptions.rules` knob (L464).
- `packages/core/src/enrich-findings.ts`: `extractSortKey` (L210), `extractWorstDetail` (L230).
- `apps/web/src/lib/marketing-rules.ts`: `/rules/unique-value` explainer copy (`whatItDetects` ~L539, `failingExample` ~L543).
- `apps/web/src/lib/marketing-rules.test.ts`: dogfood call `uniqueValueRule(corpus, 100)`.
- `packages/core/calibration/*` + `packages/core/tests/calibration/reputable-corpus.test.ts`: the gate (Task 5).
- `.changeset/*`: version bump (Task 6).

---

### Task 1: Density metric in the rule

**Files:**
- Modify: `packages/core/src/rules/content/unique-value.ts` (full rewrite)
- Test: `packages/core/tests/rules/content/unique-value.test.ts` (full rewrite)

- [ ] **Step 1: Write the failing tests**: replace the file contents:

```ts
import { describe, expect, test } from "vitest";
import { uniqueValueRule } from "../../../src/rules/content/unique-value.js";
import type { ParsedPage } from "../../../src/types.js";

const TH = { passBelow: 0.2, errorBelow: 0.12 };

function page(url: string, contentText: string): ParsedPage {
  return {
    url, title: "", metaDescription: "", canonical: "", robotsMeta: "",
    og: { title: "", description: "", image: "" }, hreflangs: [],
    headings: { h1: [], h2: [] }, jsonLd: [],
    authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    resolvedHrefs: [], structureSignature: "", contentText, html: "",
  };
}
// A shared boilerplate block + a tiny page-specific tail = near-duplicate shape.
const SHARED = Array.from({ length: 40 }, (_, i) => `shared${i}`).join(" ");
function original(url: string, n: number): ParsedPage {
  // n distinct page-exclusive words → high density.
  return page(url, Array.from({ length: n }, (_, i) => `${url}word${i}`).join(" "));
}

describe("uniqueValueRule (density)", () => {
  test("near-duplicate pages (mostly shared) fire error", () => {
    const pages = [page("a", `${SHARED} aonly`), page("b", `${SHARED} bonly`)];
    const f = uniqueValueRule(pages, TH).find((x) => x.pageUrl === "a");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("error");
    expect(f!.ruleId).toBe("content/unique-value");
  });

  test("a page of page-exclusive words clears", () => {
    const pages = [original("a", 60), original("b", 60)];
    expect(uniqueValueRule(pages, TH)).toEqual([]);
  });

  test("stability: an original page's verdict doesn't flip when a sibling is added", () => {
    const base = [original("a", 60), original("b", 60)];
    const grown = [...base, original("c", 60), original("d", 60), original("e", 60)];
    const firedA = (ps: ParsedPage[]) => uniqueValueRule(ps, TH).some((x) => x.pageUrl === "a");
    expect(firedA(base)).toBe(false);
    expect(firedA(grown)).toBe(false); // would shuffle under the old absolute-count rule
  });

  test("corpus-size invariance: same original page passes in a small and a large same-topic corpus", () => {
    const small = [original("a", 50), page("b", `${SHARED} bonly`)];
    const large = [original("a", 50), ...Array.from({ length: 30 }, (_, i) => page(`s${i}`, `${SHARED} s${i}only`))];
    const firedA = (ps: ParsedPage[]) => uniqueValueRule(ps, TH).some((x) => x.pageUrl === "a");
    expect(firedA(small)).toBe(false);
    expect(firedA(large)).toBe(false);
  });

  test("length invariance: a short all-original page is not penalized for being short", () => {
    const pages = [original("a", 8), page("b", `${SHARED} bonly`)];
    // 'a' is all page-exclusive → high density → no unique-value finding (thinness is thin-content's job).
    expect(uniqueValueRule(pages, TH).some((x) => x.pageUrl === "a")).toBe(false);
  });

  test("borderline density fires info, not error", () => {
    // Half shared, half exclusive → density between errorBelow and passBelow.
    const half = Array.from({ length: 40 }, (_, i) => `aw${i}`).join(" ");
    const pages = [page("a", `${SHARED} ${half}`), page("b", `${SHARED} bonly`)];
    const f = uniqueValueRule(pages, { passBelow: 0.6, errorBelow: 0.12 }).find((x) => x.pageUrl === "a");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("info");
  });

  test("single-page corpus never fires (can't measure rarity)", () => {
    expect(uniqueValueRule([page("a", `${SHARED} aonly`)], TH)).toEqual([]);
  });

  test("message reports density and shared overlap; fix warns axis-shared doesn't count", () => {
    const f = uniqueValueRule([page("a", `${SHARED} aonly`), page("b", `${SHARED} bonly`)], TH)
      .find((x) => x.pageUrl === "a");
    expect(f!.message).toMatch(/density \d+\.\d+/);
    expect(f!.fix).toMatch(/does NOT/i);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd packages/core && bunx vitest run tests/rules/content/unique-value.test.ts`
Expected: FAIL (old signature takes a number; `severity`/`message` assertions don't match).

- [ ] **Step 3: Rewrite the rule**: replace `packages/core/src/rules/content/unique-value.ts`:

```ts
import type { ParsedPage, RuleResult } from "../../types.js";

export interface UniqueValueThresholds {
  /** Unique-content density below this fires (info). Default 0.20. */
  passBelow: number;
  /** Density below this escalates to error. Default 0.12. */
  errorBelow: number;
}

function tokenize(text: string): string[] {
  // Lowercase, split on whitespace, strip edge punctuation so "word", "word."
  // and "(word)" are one token.
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
}

/**
 * Originality as a corpus-relative DENSITY, not an absolute count. Each distinct
 * token is weighted by normalized IDF (ln(N/df)/ln(N)): 1 if page-exclusive, ~0
 * if on every page: and averaged over the page's distinct tokens. A near-
 * duplicate / boilerplate page scores low regardless of corpus size or length; a
 * large original page stays high. Continuous, so it doesn't shuffle at the margin.
 * Volume is spam/thin-content's job; exact twins are spam/near-duplicate's.
 */
export function uniqueValueRule(
  pages: ParsedPage[],
  thresholds: UniqueValueThresholds,
): RuleResult[] {
  const { passBelow, errorBelow } = thresholds;
  const N = pages.length;
  const lnN = Math.log(N);
  if (N <= 1 || lnN === 0) return []; // can't measure rarity against a single page

  const df = new Map<string, number>();
  const pageDistinct = pages.map((p) => new Set(tokenize(p.contentText)));
  for (const distinct of pageDistinct) {
    for (const t of distinct) df.set(t, (df.get(t) ?? 0) + 1);
  }

  const findings: RuleResult[] = [];
  pages.forEach((page, i) => {
    const distinct = pageDistinct[i];
    if (distinct.size === 0) return; // empty page → thin-content handles it
    let mass = 0;
    for (const t of distinct) mass += Math.log(N / (df.get(t) ?? 1)) / lnN;
    const density = mass / distinct.size;
    if (density >= passBelow) return;

    const severity = density < errorBelow ? "error" : "info";
    const pct = (density * 100).toFixed(1);
    findings.push({
      ruleId: "content/unique-value",
      severity,
      message:
        `${page.url} has low unique-content density ${density.toFixed(3)} ` +
        `(${pct}% of its ${distinct.size} distinct words are page-distinctive; floor ${passBelow.toFixed(2)}). ` +
        `Most of its vocabulary also appears on other pages.`,
      pageUrl: page.url,
      fix:
        `Raise originality density: add page-specific text, a distinct lead, this ` +
        `record's own facts, page-specific examples. Content repeated across pages on ` +
        `the same axis (boilerplate, shared legal/spec blocks, per-axis data like a ` +
        `role's regulations across that role's documents) is common vocabulary and ` +
        `does NOT raise density, even when it is useful.`,
    });
  });
  return findings;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd packages/core && bunx vitest run tests/rules/content/unique-value.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/rules/content/unique-value.ts packages/core/tests/rules/content/unique-value.test.ts
git commit -m "feat(core): unique-value as rarity density (replaces binary count)"
```

---

### Task 2: Wire the new thresholds through the auditor

**Files:**
- Modify: `packages/core/src/types.ts:464`
- Modify: `packages/core/src/auditor.ts` (L118, L705, L796, L2210)

- [ ] **Step 1: Replace the config knob** in `packages/core/src/types.ts`: change line 464 inside `AuditOptions.rules`:

```ts
    // was: uniqueValueMinWords?: number;
    /** content/unique-value density floors. Default { passBelow: 0.20, errorBelow: 0.12 }. */
    uniqueValueDensity?: { passBelow: number; errorBelow: number };
```

- [ ] **Step 2: Update DEFAULTS** in `packages/core/src/auditor.ts:118`:

```ts
  // was: uniqueValueMinWords: 100,
  uniqueValueDensity: { passBelow: 0.20, errorBelow: 0.12 },
```

- [ ] **Step 3: Update the resolvedRules type** in `packages/core/src/auditor.ts:705`:

```ts
    // was: uniqueValueMinWords: number;
    uniqueValueDensity: { passBelow: number; errorBelow: number };
```

- [ ] **Step 4: Update resolve** in `packages/core/src/auditor.ts:2210`:

```ts
    // was: uniqueValueMinWords: options?.rules?.uniqueValueMinWords ?? DEFAULTS.uniqueValueMinWords,
    uniqueValueDensity: options?.rules?.uniqueValueDensity ?? DEFAULTS.uniqueValueDensity,
```

- [ ] **Step 5: Update the invocation** in `packages/core/src/auditor.ts:796`:

```ts
    pushAll(findings, tag(uniqueValueRule(pages, resolvedRules.uniqueValueDensity)));
```

- [ ] **Step 6: Build + run core suite**

Run: `cd packages/core && bunx tsc --noEmit -p tsconfig.json && bunx vitest run`
Expected: typecheck clean; tests pass (any auditor test asserting the old `uniqueValueMinWords` shape fails here, fix those to the new shape in this step).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/auditor.ts
git commit -m "feat(core): wire uniqueValueDensity thresholds through the auditor"
```

---

### Task 3: Fix enrich-findings message parsing

**Files:**
- Modify: `packages/core/src/enrich-findings.ts` (`extractSortKey` L210, `extractWorstDetail` L230)
- Test: add to `packages/core/tests/` (nearest existing enrich-findings test, or create `tests/enrich-findings.test.ts`)

Why: both functions parse the unique-value message. `extractSortKey` does `message.match(/\d+/)` → grabs `0` from `0.123`; `extractWorstDetail` matches `has only (\d+ unique words)` which the new message no longer contains. Worst-first ordering would break.

- [ ] **Step 1: Write the failing test** (append to an enrich-findings test, or create the file):

```ts
import { describe, expect, test } from "vitest";
import { __test } from "../src/enrich-findings.js"; // export extractSortKey/extractWorstDetail under __test, or test via the public enrich path
```
If those helpers aren't exported, instead assert via the public enrichment that two unique-value findings sort worst-first by density (lower density first). Minimal direct check:

```ts
// density 0.05 must sort before density 0.18 for content/unique-value (lower = worse)
expect(extractSortKey("content/unique-value", "x has low unique-content density 0.050 ...")).toBeLessThan(
  extractSortKey("content/unique-value", "y has low unique-content density 0.180 ..."));
```

- [ ] **Step 2: Run, verify fail.** Run: `cd packages/core && bunx vitest run tests/enrich-findings.test.ts` → FAIL.

- [ ] **Step 3: Update `extractSortKey`** (L210): parse the density float:

```ts
function extractSortKey(ruleId: string, message: string): number {
  if (ruleId === "content/unique-value") {
    const m = message.match(/density (\d+\.\d+)/);
    return m ? parseFloat(m[1]) : 0; // lower density = worse → ascending
  }
  const match = message.match(/\d+/);
  const num = match ? parseInt(match[0], 10) : 0;
  if (ruleId === "links/link-depth") return -num;
  return 0;
}
```

- [ ] **Step 4: Update `extractWorstDetail`** (L230): read the density:

```ts
  if (ruleId === "content/unique-value") {
    const match = finding.message.match(/density (\d+\.\d+)/);
    return match ? `density ${match[1]}` : "";
  }
```

- [ ] **Step 5: Run, verify pass.** Run the same command → PASS. Then `bunx vitest run` (full core) → green.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/enrich-findings.ts packages/core/tests/enrich-findings.test.ts
git commit -m "fix(core): enrich-findings parses unique-value density for sort + detail"
```

---

### Task 4: Update the explainer page + dogfood

**Files:**
- Modify: `apps/web/src/lib/marketing-rules.ts` (`/rules/unique-value` `whatItDetects` ~L539, `failingExample` ~L543)
- Modify: `apps/web/src/lib/marketing-rules.test.ts` (dogfood `uniqueValueRule(corpus, 100)`)

- [ ] **Step 1: Update the dogfood call** in `apps/web/src/lib/marketing-rules.test.ts`: find `uniqueValueRule(corpus, 100)` and the surrounding test; change to the density signature and rename the assertion:

```ts
  it("no reference page has low unique-content density (>= passBelow over the full corpus)", () => {
    const findings = uniqueValueRule(corpus, { passBelow: 0.2, errorBelow: 0.12 });
    expect(findings, `unique-value fired on reference pages:\n${describeFindings(findings)}`).toEqual([]);
  });
```
(Use the SAME default thresholds the engine ships in Task 2; if calibration in Task 5 moves them, update here too.)

- [ ] **Step 2: Run the dogfood**: Run: `cd apps/web && bunx vitest run src/lib/marketing-rules.test.ts`
Expected: it tells you whether the reference pages clear the density floor. If a few don't, that is real signal for Task 5 (don't paper over it by lowering the floor here, set the floor in calibration).

- [ ] **Step 3: Rewrite the explainer copy** in `apps/web/src/lib/marketing-rules.ts` for slug `unique-value`: replace the count-based `whatItDetects` and `failingExample` with density wording. `whatItDetects` (keep paragraphs < 180 words each):

```
content/unique-value asks how original a page is relative to its siblings, as a density rather than a raw count. It tokenises each page's main content (lower-cased, whitespace-split, edge punctuation stripped) and weights every distinct word by how rare it is across the audited set, a word on one page scores 1, a word on every page scores near 0 (normalised inverse document frequency). The page's score is the average of those weights: its unique-content density, between 0 and 1.

A page whose vocabulary mostly repeats across its siblings (boilerplate, shared spec blocks, an entity-swapped template) scores low and fires. Because it is an average, the metric does not punish a page for being short or for living in a large, tightly-themed site, and it does not flip on a one-word margin the way a hard count does. Volume is spam/thin-content's job; exact twins are spam/near-duplicate's; this rule isolates low originality.
```
`failingExample`:

```
/api/stripe-vs-square and /api/stripe-vs-paypal on a fintech directory: each is 900 words, but the shared "What is a payment API" intro, the identical feature glossary, and the same integration checklist mean almost every word also appears on the sibling pages. Their unique-content density lands around 0.09, well under the 0.20 floor, so the rule fires, because a reader gains little from the second page that the first did not already give them.
```

- [ ] **Step 4: Typecheck web**: Run: `cd /d/phili/SSD_Projects/pseolint && bunx turbo run typecheck --filter=@pseolint/web`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/marketing-rules.ts apps/web/src/lib/marketing-rules.test.ts
git commit -m "docs(web): unique-value explainer + dogfood use density"
```

---

### Task 5: Calibration gate (mandatory before merge)

**Files:**
- Run: `packages/core/tests/calibration/reputable-corpus.test.ts`
- Reference: `packages/core/calibration/calibration-corpus.json`, `packages/core/calibration/fixtures/`, `packages/core/calibration/score.ts`, `packages/core/calibration/baseline-scorecard.json`

- [ ] **Step 1: Run the calibration suite**

Run: `cd packages/core && bunx vitest run tests/calibration/reputable-corpus.test.ts`
Expected: it audits the reputable-pSEO corpus + fixtures and compares to `baseline-scorecard.json`.

- [ ] **Step 2: Inspect the density distribution.** For each corpus page, log `content/unique-value` density (temporarily, via the rule or a one-off script over the corpus). Confirm two clusters: reputable pages high, known near-dup/entity-swap/boilerplate fixtures low.

- [ ] **Step 3: Set the thresholds in the gap.** Pick `errorBelow` ≈ just above the spam cluster, `passBelow` ≈ just below the reputable cluster. Update `DEFAULTS.uniqueValueDensity` (auditor L118) and the dogfood (Task 4) to match.

Acceptance, ALL must hold (else stop and reconsider the metric, per spec):
- No false-negative regression: every near-dup/entity-swap/boilerplate fixture still flags.
- False-positive reduction: reputable large cohesive corpus pages no longer error.
- Separation exists: reputable and spam density ranges don't overlap at the chosen thresholds.
- Stability: adding 10 sibling pages to a reputable page doesn't flip its verdict.

- [ ] **Step 4: Refresh the baseline scorecard** if the suite expects it: `cd packages/core && bunx vitest run tests/calibration/reputable-corpus.test.ts` after updating thresholds; if it writes/compares `baseline-scorecard.json`, regenerate per its existing convention (check the test for an update flag/env).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/auditor.ts apps/web/src/lib/marketing-rules.test.ts packages/core/calibration/baseline-scorecard.json
git commit -m "test(core): calibrate uniqueValueDensity thresholds against reputable corpus"
```

---

### Task 6: Changeset + final review

**Files:**
- Create: `.changeset/unique-value-density.md`

- [ ] **Step 1: Add the changeset** (scoring-affecting → minor bump for core; follow repo convention: check an existing `.changeset/*.md`):

```md
---
"@pseolint/core": minor
---

content/unique-value now scores originality as a rarity density (normalized IDF
average) instead of an absolute count of exactly-page-exclusive words. Fixes
margin instability and false positives on large, tightly-themed sites. Config
knob renamed: rules.uniqueValueMinWords → rules.uniqueValueDensity
{ passBelow, errorBelow }.
```

- [ ] **Step 2: Full build + tests**

Run: `cd /d/phili/SSD_Projects/pseolint && bun run build:packages && (cd packages/core && bunx vitest run) && (cd apps/web && bunx vitest run src/lib/marketing-rules.test.ts)`
Expected: build clean; core green; dogfood green.

- [ ] **Step 3: grep for any stale `uniqueValueMinWords`**

Run: `grep -rn "uniqueValueMinWords" packages apps --include=*.ts`
Expected: no results (every reference migrated).

- [ ] **Step 4: Commit**

```bash
git add .changeset/unique-value-density.md
git commit -m "chore(changeset): unique-value density redesign"
```

---

## Self-review notes
- **Spec coverage:** metric (T1), wiring/config rename (T2), enrich-findings parse (T3), explainer+dogfood (T4), calibration gate + thresholds (T5), version bump + stale-ref sweep (T6). Approaches A/C/D were rejected in the spec: not re-litigated here.
- **Type consistency:** `uniqueValueRule(pages, UniqueValueThresholds)` and `rules.uniqueValueDensity` / `DEFAULTS.uniqueValueDensity` / `resolvedRules.uniqueValueDensity` use the same `{ passBelow, errorBelow }` shape throughout.
- **Out of scope:** percentile mode, stoplist, embeddings, merging with SimHash, the AI content-effort feature.
- `ponytail:` no back-compat shim for the renamed config knob: it's already a breaking scoring change behind a version bump. Add one only if a real external caller of `uniqueValueMinWords` turns up in Step 6 Step 3's grep.
```
