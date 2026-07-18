# Tier-3 Intent Moderation — Calibration Gate

**Date:** 2026-07-17
**Status:** Mechanism shipped, **default OFF**. This doc is the decision procedure for turning it on.

---

## What tier 3 does

`shiftVerdictForIntent` (auditor.ts) softens the verdict **one tier** for a
cluster-tolerant archetype (directory / location-pages / aggregator) whose
penalty risk is *structural* similarity (near-duplicate / entity-swap fired at
error+) **with genuine content effort** (≥ 10, above the farm floor). It is
soften-only, never escalates, and never reads or writes raw `risk`. Gated behind
`AuditOptions.intentModeration` (default off) because a new verdict shift must
not ship on uncalibrated data.

## The calibration run

Reproducible, offline (committed fixtures + injected content-effort scores — no
network, no LLM, no spend):

```
bun run calibrate:intent      # scripts/calibrate-intent.ts
```

It audits every fixtured corpus site twice — intent **off vs on** — and checks
three guardrails. Any failure exits non-zero (→ do not enable):

1. **Invariant** — raw risk identical off vs on, every site.
2. **Farm safety** — NO policy-violating site softens (the effort floor must
   block them; a softened farm is a false positive).
3. **Reputable ceilings** — still hold with intent on.

It also counts **wins**: reputable sites that were *over* their ceiling with
intent off and land at/under it with intent on. **Enable the default only when
wins > 0 with farm-softened = 0.**

## Current result (2026-07-17, 31 fixtured sites)

```
Sites softened: 1  — numbeo.com/cost-of-living (reputable, effort 28): caution → ready
Guardrails:  ✓ raw risk unchanged   ✓ no farm softened (0/23)   ✓ ceilings hold
Wins: 0   ·   SAFE
```

**Verdict: SAFE but 0 wins → keep it gated.** Tier 3 is proven harmless on this
corpus — no farm was wrongly softened (the effort floor works), risk never
moved, no ceiling broke. But it produces **no net benefit** here: the one site
it moved (numbeo) was already passing its ceiling, so nothing was rescued.
Enabling it now would add verdict-surface risk for zero measured upside.

**Flip the default when:** the corpus grows a reputable directory that is
*currently over its ceiling* because of structural near-duplication at genuine
effort — i.e. an over-penalized legitimate directory — and this run reports
`Wins ≥ 1` with `farm softened = 0`. Re-run after any corpus or effort-score
change.
