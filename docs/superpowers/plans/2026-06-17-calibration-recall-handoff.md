# Calibration Recall — Session Handoff

**Date:** 2026-06-17
**Branch:** `claude/pseolint-machine-language-xcnjss`
**Status:** corpus hygiene done + partial engine fix landed; scale-seeding blocked on
network egress in the web session — pick up in a local env with open egress.

## TL;DR

The calibration corpus's ground truth was substantially mislabeled (the "winners"
were stale; the "losers" blended three incompatible kinds). We cleaned it, landed a
*measured* partial recall fix, and made sitemap handling gzip + recursive. The next
step — seeding the spam farms' true scale and re-measuring recall — needs network
egress (blocked here). Run it locally; commands in [§Do in local env](#do-in-local-env-has-egress).

## Core findings (why this work happened)

- **Reputable "winners" were stale assertions.** June-2026 verification found only
  `typeform` still truly winning. `nerdwallet`/`jasper` declined (AI Overviews),
  `segment` 301s off-domain to twilio, `stripe.com/atlas/states` is a 404. Tuning the
  engine to "stop flagging" these would have made it worse — the engine was arguably
  right and the labels wrong.
- **"policy-violating" blended 3 incompatible kinds** that must never share one recall
  metric: **8 real on-page-detectable** spam farms (legit targets), **6 off-page-only**
  parasites (site-reputation-abuse — an on-page linter *cannot* detect by construction),
  **2 synthetic** fixtures (circular — built to fire our rules). Raw recall over all 16
  is meaningless; only the **addressable subset** (real + on-page) is fair.
- **The farms are audited blind to their scale.** Every farm has `classifierUrls = 0`,
  so it classifies as `small-marketing` (seen as a 6-page site, handed the lenient
  small-site profile) and **never runs the v0.6 per-template audit** (which needs
  `classifierUrls` to detect templates). The reputable sites are seen at full scale
  (5000 URLs). This asymmetry is a large part of the inverted AUC.

## Current measured state (addressable subset, `--fixtures-only`)

After the `unique-value` entity-mask fix: **recall ~13%, AUC ~0.27, precision ~83%**
(up from 0% / 0.21 / 67%). Dominant remaining confound: the scale handicap above.

## Reproduce the starting point

Confirm your env matches before changing anything:

```
git fetch && git checkout claude/pseolint-machine-language-xcnjss
bun install            # also installs cheerio (parser dep); without it the audit throws
bun scripts/calibration-corpus.ts --fixtures-only
```

Expect: `Audited 24 · Passed 23 · Failed 1` (numbeo over its ceiling) and an
**"addressable subset"** calibration block reporting recall ~13% / AUC ~0.27. The run
exits 1 (ratchet vs the stale committed baseline + the numbeo ceiling) — that is
expected, not a setup failure. CI uses Bun 1.3.14; any recent Bun works. Unit tests:
`cd packages/core && bunx vitest run tests/calibration/` — `score`/`scorecard` green;
`reputable-corpus` soft-fails are pre-existing (see [§Gotchas](#gotchas)).

**No PR is open** — the branch is pushed; open one when ready.

## Where the code lives

- Demotion table / scoring profiles — `packages/core/src/auditor.ts:194` (`SCORING_PROFILES`);
  profile pick + 0.70 confidence gate at `:452` (`profileFor`).
- `classifierUrls` → template detection — `auditor.ts:2642` (consume), `:2869` (`detectTemplates`).
- Per-template uniformity signal — `packages/core/src/per-template-scoring.ts:215-217`
  (`uniformityScore`, `topDriver`, `ruleFireRates`).
- `unique-value` entity-mask fix — rule `packages/core/src/rules/content/unique-value.ts`;
  call site `auditor.ts:796`.
- Classifier scale thresholds — `packages/core/src/site-classifier.ts:410` (≥1000 →
  `programmatic-directory`@0.9), `:420` (≥500 + top-3 cluster ≥0.7).
- Calibration metrics / ratchet — `packages/core/calibration/score.ts:170`
  (`calibrationMetrics`), `:222` (`perRuleFiringTable`), `:259` (`ratchet`).
- Runner modes — `scripts/calibration-corpus.ts`: `--seed-classifier-urls` (dispatch `:1018`),
  `--fixtures-only` (`:559`), `--write-baseline` (`:740`).
- gzip sitemap decode — `packages/core/src/cache.ts` (`decodeBody`).



## What was done (commits on the branch)

| commit | change |
| --- | --- |
| `c20e3e2` | hermetic `--fixtures-only` runner mode (deterministic, CI-safe) |
| `d62ae51` | mark synthetic fixtures; runner reports the **addressable subset** |
| `16b3fb5` | `groundTruth.source` + `asOf` provenance fields |
| `349f7e0` | corrected all 12 reputable labels against live verification |
| `c70465e` + `22ed644` | corpus **v2**: drop `stripe`/`segment` (broken URLs), demote `nerdwallet`/`jasper` to non-gated `subject`, reputable set → 8 verified |
| `626b2dc` | **engine fix** — entity-mask `content/unique-value` so scaled-content farms stop scoring high-density (measured: recall 0→13%, precision 67→83%, no reputable regression) |
| `cb772c2` + `8bfbf93` | gzip + recursive sitemap handling, centralized in `cachedFetch` (fixes AI `fetch_sitemap` tool, core audit, and seeder uniformly) |

## Do in local env (has egress)

1. **Seed farm scale** (now gzip + recursive-index safe):
   ```
   bun scripts/calibration-corpus.ts --seed-classifier-urls
   ```
   - Should populate `classifierUrls` for the **live** farms (`popularnetworth`,
     `thehairpin`, `fresherslive`, `newsunzip`, `equityatlas`).
   - **Success target:** a farm needs enough clustering URLs to leave `small-marketing`.
     The classifier flips to `programmatic-directory` at ≥1000 URLs (@0.9) or ≥500 with a
     dominant template (top-3 cluster ≥0.7) — `site-classifier.ts:410,420`. Confirm by
     re-running `--fixtures-only` and checking each farm's classified type in the per-site
     output: today it prints `small-marketing`; you want `programmatic-directory`.
   - ⚠️ It rewrites `classifierUrls` for **all** sites from live fetches. **Stage only the
     farm hunks:** `git add -p packages/core/calibration/calibration-corpus.json` (accept the
     policy-farm `classifierUrls` blocks), then `git checkout -p` to discard any
     reputable/`subject` changes — so a flaky live fetch can't regress the verified 8.
2. **Deindexed farms** (`zacjohnson`, `beingselfish`) have no live sitemap → capture
   their Wayback sitemap and set `classifierUrls` (or commit as fixtures). Offline
   fixture-internal-link harvest was tried and rejected: ~90% WordPress cruft
   (`wp-json`/`wp-content`/`category`/`tag`), root-slug articles don't cluster, and
   100–650 URLs badly misrepresents a 60k-page farm.
3. **Re-measure**:
   ```
   bun scripts/calibration-corpus.ts --fixtures-only
   ```
   Compare the **addressable subset** recall/AUC before vs after scale-seeding to
   quantify how much of the 0% was the handicap vs the engine.

## Open decisions / next

- **Wire the calibration ratchet into CI.** The `--fixtures-only` no-regression gate is
  built (ratchet already exits 1 on verdict regressions). Deferred until the baseline is
  recall-healthy. Refresh with `--write-baseline` **only after** recall work, so we don't
  ratify the current regression as the floor.
- **Scale-seeding may not fully fix recall.** The demotion profiles protect *any* catalog
  shape — spam or legit (the value-signal wall). The likely real lever: make the
  `SCORING_PROFILES` demotions conditional on **per-template uniformity** (gate structural
  rules on per-template fire-rate, which v0.6 already computes as `uniformityScore`),
  rather than a blanket per-site-type demotion. ~85% of the 46-entry demotion table is
  over-firing compensation that this would subsume; ~3 are genuine relevance escalations
  (keep), ~3 are the broken `freshness-signals` proxy (refine separately to data-freshness).
- **Made-for-monetization blind spot.** Farms like `zacjohnson` monetize via
  auto-affiliation scripts (ShareASale/Skimlinks), which live in stripped `<script>`
  content → pseolint never sees them. Possible new detection axis (affiliate/ad density
  from raw HTML pre-strip).

## Gotchas

- `reputable-corpus.test.ts` soft-fails on `numbeo` (over-flag) + `citable-facts` firing
  100% — pre-existing aspirational-ceiling debt; skips in CI when `calibration-results.json`
  is absent/stale.
- `bestfirenze-regression.test.ts` needs `cheerio` installed (`bun install`) — env-flaky.
- AI `fetch_sitemap` tool defaults `maxDepth = 1` (root + one level) — bump if pointing it
  at a deeply-nested farm index.
