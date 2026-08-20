# content/unique-value: density redesign

**Date:** 2026-06-16
**Status:** spec (approved direction; not yet implemented)
**Author:** session work after the pseolint.dev self-audit

## Goal

Make `content/unique-value` stop shuffling and stop penalizing large, tightly-themed
sites, while still catching the near-duplicate / boilerplate / entity-swap pages it was
built for. Smallest change that does this: swap the metric from an **absolute count of
exactly-page-exclusive words** to a **density of word-rarity**.

## Problem (grounded in the current code)

`packages/core/src/rules/content/unique-value.ts` today:

```js
if ((frequencies.get(token) ?? 0) === 1) uniqueCount += 1;   // binary: word counts only if on EXACTLY 1 page
...
if (uniqueCount < minUniqueWords)                            // absolute floor (default 100)
```

Three coupled choices break it:

1. **Binary credit.** A word on even 2 pages gives 0 credit to both. One shared phrase
   flips a word from "counts" to "worthless" → the metric is a step function evaluated on
   a 1-word margin → the flagged set **shuffles** when content is added anywhere.
2. **Absolute threshold (100).** Not scaled to corpus size or page length.
3. **Corpus-relative count.** More genuinely-distinct pages on a cohesive topic → *fewer*
   page-exclusive words each (shared domain vocab gets counted on more pages). The rule
   conflates "large + cohesive" (good) with "low unique value" (bad).

Observed live on pseolint.dev: adding real content drove the flagged set 41 → 16 → 18 → 7
without converging, it just moved which same-topic pages sit at 96–99. A genuinely
near-duplicate page scores far lower (~0–40), so detection of the *real* bad case is fine;
the failure is instability + false-positive bias at the top of the range. This is the same
false-positive-on-reputable-pSEO risk the calibration work guards against.

## Approaches considered

- **A. IDF-weighted *sum*, absolute threshold.** Smoother credit, but still an absolute
  mass → still corpus-size- and length-sensitive. Rejected: only half the fix.
- **B. Rarity *density* (ratio): chosen.** Per-token graded weight, divided by the page's
  distinct-token count. Continuous (no shuffle), length-robust (ratio), corpus-robust (IDF
  normalizes by N). Catches near-dupes (low density) and clears large originals (high density).
- **C. Percentile within the crawl** (flag bottom X%). Rejected: always flags X% even on a
  flawless site, wrong for a pass/fail gate.
- **D. Merge into `spam/near-duplicate` (SimHash).** Rejected: that rule catches *pairs*;
  unique-value catches a page diluted by boilerplate spread across many pages with no single
  twin. Complementary, keep separate.

## Design (Approach B)

Per page, over its distinct tokens `D` (same tokenizer as today, lowercase, split on
whitespace, strip edge punctuation):

```
N        = number of pages in the crawl
df(t)    = number of pages containing token t
w(t)     = ln(N / df(t)) / ln(N)          // normalized IDF in [0,1]; df=1 → 1, df=N → 0
density  = ( Σ_{t∈D} w(t) ) / |D|         // mean rarity per distinct word, in [0,1]
```

Fire when `density` is low:

```
density < errorBelow   → severity "error"
density < passBelow    → severity "info"   (borderline band; the 99-vs-100 case)
otherwise              → no finding
```

- **No stoplist.** IDF already drives stopwords to w≈0; they sit in the denominator and
  mildly lower density for filler-heavy pages, which is acceptable. `ponytail:` calibration
  knob if the corpus run shows stopwords distort separation.
- **N=1** → every df=1 → density=1 → never fires (matches today).
- Two thresholds only. The `info` band directly fixes "borderline reads as a ship-blocker."

### Thresholds
`errorBelow` / `passBelow` are **calibration outputs, not guesses**, pick from the density
distribution of the reputable-pSEO corpus vs known-spam fixtures (see Validation). Starting
placeholders for the first calibration run: `passBelow ≈ 0.20`, `errorBelow ≈ 0.12`.

### Scope (unchanged responsibilities, now cleaner)
- Volume/thinness → `spam/thin-content` (a short original page passes unique-value, fails
  thin-content if too short, clean separation; today's rule blurs the two).
- Exact near-dupe pairs → `spam/near-duplicate` (SimHash).
- Text quality / spun gibberish → `content/value-add` (unique-but-meaningless tokens still
  read as high density here; documented non-goal, same gaming surface as today).

## Files to change

| File | Change |
|---|---|
| `packages/core/src/rules/content/unique-value.ts` | the ~6-line metric (w + density + 2-band severity); rewrite message/fix copy |
| `packages/core/src/auditor.ts` | DEFAULTS (L118): `uniqueValueMinWords:100` → `uniqueValueMinDensity:{passBelow,errorBelow}`; resolvedRules type (L705); invocation (L796); resolve (L2210) |
| `packages/core/src/types.ts` | `AuditOptions.rules` knob (L464): replace `uniqueValueMinWords?` |
| `packages/core/src/enrich-findings.ts` | L195/216/231 parse the unique-word *count* out of the message: update to the new shape (density), or have the rule attach a structured field instead of regexing prose |
| `packages/core/src/per-template-scoring.ts` | RULE_IMPACTS entry (L68): likely unchanged; re-check after severity mix shifts |
| `packages/core/tests/rules/content/unique-value.test.ts` | rewrite for density (see Test plan) |
| `apps/web/src/lib/marketing-rules.ts` | `/rules/unique-value` explainer (L539, L543) describes "exactly one" + "100 page-unique words": rewrite to density |
| `apps/web/src/lib/marketing-rules.test.ts` | dogfood calls `uniqueValueRule(corpus, 100)`: switch to density signature |
| CHANGELOG / changeset | scoring-affecting change → version bump per repo convention |

Signature change: `uniqueValueRule(pages, minUniqueWords)` →
`uniqueValueRule(pages, { passBelow, errorBelow })`. Breaking for direct callers + the
`uniqueValueMinWords` config knob; acceptable because it is already a calibrated scoring
change requiring a version bump. No back-compat shim (`ponytail:` add only if a real
external caller is found).

## Validation / calibration (the gate: do NOT ship without it)

This changes scoring for every user. Before merge:

1. Run **old vs new** against the reputable-pSEO calibration corpus
   (`[[calibration_against_reputable_pseo]]`) + known near-dup / entity-swap / boilerplate
   fixtures.
2. Acceptance:
   - **No false-negative regression:** every near-dup/entity-swap/boilerplate fixture the
     old rule flagged still flags.
   - **False-positive reduction:** reputable large cohesive sites that the old rule tripped
     no longer error (the whole point).
   - **Separation exists:** reputable and spam density distributions are visibly separable;
     set `passBelow`/`errorBelow` in the gap. If they do **not** separate, the metric is
     wrong, stop and reconsider (e.g., weight by token count, or a different rarity fn).
   - **Stability:** re-run with +10 sibling pages added; a clearly-original page's verdict
     does not flip (the anti-shuffle check).

## Test plan (minimal runnable checks)

In `unique-value.test.ts`:
- **near-dup fires:** two entity-swap pages (identical but one swapped noun) → density low → error.
- **original clears:** a page with a distinctive lead among shared siblings → above `passBelow`.
- **no-shuffle / stability:** original page's density barely moves when a sibling is added.
- **corpus-size invariance:** same page measured in a 10-page vs 40-page same-topic corpus → density within tolerance (the old rule's count would roughly halve).
- **length invariance:** long and short original pages both clear (ratio, not count).
- **N=1:** single page → never fires.

## Rollout
Minor-or-major bump (scoring change) + changeset. Update the `/rules/unique-value` explainer
and dogfood in the same change. After deploy, re-audit pseolint.dev: the ~7 residual
unique-value pages should clear (they are high-density, just under the old absolute line),
which also closes the open item from `[[dev_self_audit_citation_uniquevalue]]` without
keyword-stuffing.

## Out of scope
Percentile mode; stoplist; TF/length weighting beyond the ratio; embeddings; merging with
SimHash; the AI content-effort feature (`[[core_spambrain_gap_audit]]`, separate track).
