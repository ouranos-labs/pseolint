# Recall leak: the structural spam rules are suppressed across the directory class

**Status:** diagnosis complete, fix proposed (not implemented — FP-sensitive, needs sign-off)
**Date:** 2026-06-29
**Harness:** `scripts/calibration-corpus.ts` (hermetic off `packages/core/calibration/fixtures/`)

## Problem

On the gated corpus (34 sites: 23 policy-violating incl. 2 synthetic, 8 reputable, 3 subject), the score does not separate spam from legit:

| view | precision | recall | AUC | separation |
|------|-----------|--------|-----|-----------|
| full (23 policy vs 6 reputable) | 93% | **57%** | **0.49** | −57 (overlap) |
| addressable (excl. 6 off-page parasite + 2 synthetic) | 91% | **67%** | 0.47 | −54 (overlap) |

AUC ≈ 0.5 means the continuous risk barely ranks a policy-violating site above a reputable one. Confirmed-deindexed AI farms score in **ready/caution**: `healthyceleb` 6, `thehairpin` 6, `newsunzip` 13, `wikibioworth` 20, `zacjohnson` 25, `equityatlas` 25.

## Root cause (evidence-backed)

Per-site firing of the discriminating rules (`spam/thin-content`, `content/unique-value`, `spam/near-duplicate`, `content/value-add`, `content/regurgitated-content`):

```
CAUGHT (rules fire):   grokipedia 64, cookcraze 62, trustanalytica 60, doorwayspam 60,
                       beingselfish 45  → unique-value / near-duplicate / thin-content fire
LEAK (NOTHING fires):  healthyceleb 6, newsunzip 13, thehairpin 6, equityatlas 25,
                       wikibioworth 20, thepersonage 60*  → zero discriminating rules fire
```

**Verbose AI entity-swap farms defeat every content-quality rule by construction:**
- `spam/thin-content` — doesn't fire: the pages are long (AI writes 800+ words).
- `content/unique-value` (rarity density) — doesn't fire: AI prose is lexically rich.
- `spam/near-duplicate` (simhash) — doesn't fire: each "[Name] Net Worth" page is about a different entity, so the text genuinely differs.

The only rules that *can* separate `healthyceleb` (entity-swapped template, no real per-page data) from `zapier.com/apps/*` (entity-swapped template **with** real integration data per page) are the **structural** ones:

- `spam/entity-swap` — same template + swapped entity + no real data variation
- `spam/template-diversity` — identical DOM structure across the cluster

These live in `PSEO_ONLY_RULE_IDS` (`packages/core/src/site-classifier.ts:66`) and are:
1. **suppressed** when a site classifies `small-marketing`/`blog` — which the farms do, because the fixture sample is small (`site-classifier.ts:423`, `urls.length < 50`); and
2. **demoted** under the `programmatic-directory` `SCORING_PROFILES` profile (tuned to avoid false positives on Zapier/G2).

So the structural discriminators are off **on both sides of the class** — legit and spam directories land in the same bucket with the same rules disabled. That is the mechanical reason AUC ≈ 0.5.

## Rejected fixes (both measured, both reverted)

1. **Seed `classifierUrls`** so the classifier sees true scale → `healthyceleb` stayed `small-marketing 0.85`; no effect on score. (Reclassifying into `programmatic-directory` wouldn't help anyway — that profile *also* demotes the structural rules; `healthyceleb` flipped there scored *4*.)
2. **Add a structural-uniformity signal to `applyDegenerationGuard`** (flip `small-marketing → unclear` when ≥50% of pages share a `structureSignature`) → recall **regressed 57% → 52%**. Flipping the class applies a *different* profile's demotions; the discriminating signal never gets to fire as an actual finding. Right signal, wrong layer.

**Lesson:** the structural signal must live **in the rule** (`spam/entity-swap`), gated by data-presence — not in the classifier.

## Proposed fix (scope to ONE rule first)

Quality-gate `spam/entity-swap` the way `spam/doorway-pattern` is already gated (it requires `thin-content OR identical-meta` as a third signal — `CHANGELOG` v0.5.2):

- **Run** `spam/entity-swap` on the directory class instead of suppressing/demoting it wholesale.
- **Gate it to fire only when** structural uniformity is high (cluster shares one template) **AND** real per-page data is absent (`data/data-binding` low / `content/unique-value` weak). This is the discriminator that separates `healthyceleb` (template + no data) from `zapier.com/apps/*` (template + real data), so it should NOT re-introduce false positives on the reputable directories.

### Acceptance criteria (run the harness, both sides)
- Addressable recall ↑ (target ≥ 80%, from 67%) — `healthyceleb`/`newsunzip`/`thehairpin`/`wikibioworth`/`equityatlas` move into `concerning`+.
- AUC ↑ materially (target ≥ 0.7).
- **All 8 reputable verdict ceilings still hold** (no new FP) — this is the gate that makes it safe.
- Reputable `numbeo` (already the over-flagger at risk 60) does not breach.

### Open risk / decision
This trades recall against the reputable ceilings and is a change to a calibrated, CI-gated engine. The gate condition (what counts as "real per-page data") is the hard part and needs a deliberate FP/FN call. Recommend implementing on `spam/entity-swap` alone, measuring, then deciding whether to extend to `spam/template-diversity`.

## Note on the headline metric
Full-corpus recall (57%) is structurally capped: 6 of the 23 policy-violating sites are `detectability: off-page-only` (parasite / site-reputation abuse) that an on-page audit **cannot** detect by construction. The **addressable** recall (67%, those excluded) is the number to optimize and publish.

## Experiment result (2026-06-29): un-suppression ALONE is insufficient

Tested the simplest version of the proposed fix: removed `spam/template-diversity` and `spam/entity-swap` from `PSEO_ONLY_RULE_IDS` so they run on the directory class, then re-ran the harness.

**Result: no change.** Recall stayed full 57% / addressable 67%, FP stayed 1, no reputable ceiling moved. The rules *ran and did not fire* on the farms. Reverted (zero benefit, and the suppression protects reputable sites beyond this 6-site corpus).

Why they don't fire on verbose AI farms:
- `spam/entity-swap` masks entities then simhashes — it needs (a) supplied **entity patterns** (none in this corpus → low coverage → at most a low-confidence warning) and (b) a **rigid** template so masked pages are near-identical. AI farms generate genuinely varied prose per entity, so masked similarity stays below threshold.
- `spam/template-diversity` needs enough pages sharing a DOM skeleton; the ~5-page pinned fixtures don't reliably trip it.

**Conclusion:** catching a *well-built, verbose* AI content farm from on-page signals alone is not solved by re-enabling existing rules. Every current rule — content **and** structural — is defeated either by the prose being rich/varied or by the rule needing inputs (entity patterns, large samples) the audit doesn't have. This is a genuine capability ceiling consistent with the `/limits` disclaimer ("we can't see off-page signals; the score is a heuristic"), not a quick calibration bug.

**What a real fix would require (all larger, separate efforts):**
1. A **prose-level AI/template-origin signal** robust to lexical variation (the `--content-effort` LLM judge is the existing seed of this — but it's opt-in/paid and only moderates the verdict ±1 tier; making it a first-class recall driver is a product decision).
2. **Entity-pattern inference** so `spam/entity-swap` can run without hand-supplied patterns (auto-derive candidate entities from URL slugs / titles).
3. Accept the ceiling and **report addressable recall honestly** on `/methodology` (the two-sided harness already computes it) rather than chase on-page detection of well-built farms.

Recommended next move is (3) + scoping (1) as a deliberate product bet — not further rule re-gating, which this experiment shows won't move the number.
