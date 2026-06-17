# Calibration Recall — Session Handoff

**Date:** 2026-06-17
**Branch:** `claude/pseolint-machine-language-xcnjss`
**Status:** corpus hygiene done + partial engine fix landed; **scale-seeding executed
2026-06-17 and MEASURED AS A DEAD END for recall** (see [§Scale-seeding result](#scale-seeding-result-2026-06-17--measured-dead-end)).
The real lever is the `programmatic-directory` demotion profile, not scale.

## TL;DR

The calibration corpus's ground truth was substantially mislabeled (the "winners"
were stale; the "losers" blended three incompatible kinds). We cleaned it, landed a
*measured* partial recall fix, and made sitemap handling gzip + recursive. Scale-seeding
(the previously-blocked next step) ran on 2026-06-17 — it works mechanically but does
**not** move recall: a seeded farm flips to `programmatic-directory`, runs the v0.6
per-template audit, and *still* scores "ready" because the demotion profile crushes its
spam signals. **Next lever:** gate the `programmatic-directory` spam-rule demotions on
per-template uniformity (handoff [§Open decisions #2](#open-decisions--next)).

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
  (5000 URLs). This asymmetry was *hypothesized* to be a large part of the inverted AUC.
  **2026-06-17 update: tested and falsified — see below.**

## Scale-seeding result (2026-06-17) — MEASURED DEAD END

Ran `--seed-classifier-urls` against the live farms (gzip + recursive-index safe).

**Farm liveness has rotted since this handoff was written** — only 1 of 5 "live" farms
both resolves and exposes scale:

| Farm | 2026-06-17 result | Effect |
| --- | --- | --- |
| `newsunzip` | robots.txt → 2 sitemaps → **5000 URLs** | flips to `programmatic-directory`@0.9 ✓ |
| `fresherslive` | sitemap-index → 1 sub-sitemap → **18 nav URLs** (lastmod 2024-12, stale) | stays `small-marketing` |
| `thehairpin` | redirect loop on `/404.html` (parked) | dead |
| `equityatlas` | `/sitemap.xml` serves HTML redirect to `/lander` (parked) | dead |
| `popularnetworth` | DNS no-resolve | dead |

**The decisive measurement (newsunzip, the one farm that seeded):**

```
classification: programmatic-directory @ 0.90   ← flip worked
templateCount: 8 · v6PathExecuted: true          ← v0.6 per-template audit ran
verdict: "ready" · risk: 12                       ← STILL clean
topDrivers: citation-coverage(impact 60, warning), unreachable-from-root(48, warning),
            freshness-signals(25, info), title-uniqueness(15, info), image-alt-text(15, info)
```

Risk went 13 → 12 (noise). Addressable-subset AUC unchanged at **0.27**. The scale
handicap was **not** the confound. The `programmatic-directory` profile
(`auditor.ts:265-343`) unconditionally demotes every spam rule
(`template-diversity`/`near-duplicate`/`doorway-pattern`/`boilerplate-ratio` → warning;
`thin-content` + all AEO/EEAT → info). Those demotions exist to protect *reputable*
directories but fire for **any** programmatic-directory, so newsunzip's real signals
survive only at warning → net 12. This is the **value-signal wall** the open-decisions
section predicted.

Caveat: newsunzip's fixture is only 5 pages (`pageCount: 5`), so per-template uniformity
is computed over a thin sample — but the demotion mechanism is the same at any page count.

## Current measured state (addressable subset, `--fixtures-only`)

After the `unique-value` entity-mask fix + scale-seeding: **recall still ~13%, AUC ~0.27,
precision ~83%**. Scale-seeding did not move the addressable subset.

## Reproduce the starting point

Confirm your env matches before changing anything:

```
git fetch && git checkout claude/pseolint-machine-language-xcnjss
bun install            # also installs cheerio (parser dep); without it the audit throws
bun scripts/calibration-corpus.ts --fixtures-only
```

Expect: `Audited 24` and an **"addressable subset"** calibration block reporting recall
~13% / AUC ~0.27. The run exits 1 (ratchet vs the stale committed baseline + the numbeo
ceiling) — that is expected, not a setup failure. CI uses Bun 1.3.14; any recent Bun
works. Unit tests: `cd packages/core && bunx vitest run tests/calibration/` —
`score`/`scorecard` green; `reputable-corpus` soft-fails are pre-existing (see
[§Gotchas](#gotchas)).

**No PR is open** — the branch is pushed; open one when ready.

## Where the code lives

- Demotion table / scoring profiles — `packages/core/src/auditor.ts:194` (`SCORING_PROFILES`);
  the `programmatic-directory` spam-rule demotions (the lever) are at `:265-343`;
  profile pick + 0.70 confidence gate at `:452` (`profileFor`).
- `classifierUrls` → template detection — `auditor.ts:2642` (consume), `:2869` (`detectTemplates`).
- Per-template uniformity signal — `packages/core/src/per-template-scoring.ts:215-217`
  (`uniformityScore`, `topDriver`, `ruleFireRates`) — the signal to gate demotions on.
- `unique-value` entity-mask fix — rule `packages/core/src/rules/content/unique-value.ts`;
  call site `auditor.ts:796`.
- Classifier scale thresholds — `packages/core/src/site-classifier.ts:410` (≥1000 →
  `programmatic-directory`@0.9), `:420` (≥500 + top-3 cluster ≥0.7).
- Calibration metrics / ratchet — `packages/core/calibration/score.ts:170`
  (`calibrationMetrics`), `:222` (`perRuleFiringTable`), `:259` (`ratchet`).
- Runner modes — `scripts/calibration-corpus.ts`: `--seed-classifier-urls [substr]`
  (now takes an optional URL-substring filter, mirrors `--repin`; dispatch `:1018`,
  impl `:909`), `--fixtures-only` (`:559`), `--write-baseline` (`:740`).
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
| *uncommitted (2026-06-17)* | `--seed-classifier-urls [substr]` filter; `newsunzip` seeded to 5000 classifierUrls in corpus (the honest-scale test artifact); `fresherslive` → 18 |

## Open decisions / next

> **2026-06-17 correction.** An initial pass concluded "both structural levers dead, only
> content-effort works." That was WRONG — an artifact of the 5-page fixtures (`computeVariance`
> over n≈1 per template is degenerate → uniformity 1.0, empty fireRates). A **live
> multi-page probe** (`auditSource` with `sampleSize` 25–30, since deleted) over 2 farms + 4
> legit catalogs overturned it. Real fire-rates below.

- **⭐⭐ DOMINANT CONFOUND (found 2026-06-17): farm fixture under-sampling + corpus rot.**
  The addressable farms are audited on **1–6 fixture pages** each (`pinnedUrls`-driven; healthyceleb=1,
  newsunzip=5, equityatlas=5, zacjohnson/popularnetworth/beingselfish/thehairpin=6) while every
  reputable site has **24–25**. Pairwise/rate/cluster rules (`spam/near-duplicate`,
  `spam/doorway-pattern`, `content/title-uniqueness` *rate*, `spam/template-diversity`) need
  multiple pages to fire — so they engage on well-sampled legit sites and stay silent on the
  under-sampled farms (healthyceleb fires NOTHING on 1 page → risk 6; numbeo fires
  near-duplicate+doorway on 25 pages → risk 60). **The inverted AUC is substantially a
  fixture-collection artifact, not engine quality.** 4 of 8 farms (popularnetworth, equityatlas,
  thehairpin, beingselfish) are dead/parked and cannot be re-sampled.
  - **Parity re-snapshot experiment (2026-06-17, run then reverted — null result, informative.)**
    Re-pinned+re-snapshotted the 2 live farms. `fresherslive` was ALREADY at 27 pages (no gain);
    `newsunzip` capped at 5 pages (90s repin hard-timeout on its 16k-URL sitemap). Addressable
    AUC **unchanged at 0.27**. The live `fresherslive`→54 improvement **did NOT transfer to
    fixtures-only**: live it classifies `unclear` (strict→54); in fixtures-only it classifies
    `small-marketing@0.85` (lenient, because the local fixtures carry no scale signal) →
    `spam/thin-content` **demoted**, `title-uniqueness` fires but can't escalate under small-site
    weights → risk 27. So the binding constraint is **(i) the fixtures-only classification path
    handing farms the lenient profile + (ii) those profiles demoting the spam signals** — NOT
    page count, for the live farms.
  - **✅ DONE 2026-06-17 — corpus REBUILT with fresh live farms.** Sourced + verified + added 7
    currently-live on-page spam farms (parity-sampled to ~25 pages each): `thepersonage` (24k bio),
    `wikibioworth` (bio), `trustanalytica` (140k scraped reviews), `bestprosintown` (1.6M city×biz),
    `fresherslike` (4.3k jobs), `grokipedia` (5.8M AI encyclopedia), `cookcraze` (AI recipes).
    Addressable subset grew 8→**15 policy** farms; **AUC 0.27 → 0.41**, risk bands now near-monotone
    (0-20→83%, 40-60→100%, 60-80→75%). Fresh positives the engine catches: grokipedia (64 critical),
    thepersonage + trustanalytica (60 concerning). Documented misses (recall gaps): bestprosintown
    (15), fresherslike (13), wikibioworth (20), cookcraze (39 caution). Note fresherslike/cookcraze
    score LOWER in fixtures-only (13/39) than live (41/58) — same `small-marketing@0.85`
    misclassification (no scale signal from local fixtures), reproduced on fresh data → the engine
    classification path is the next lever. Still <0.5 AUC, but now a HONEST benchmark on real live
    farms instead of rotted fixtures.
  - **Implication (pre-rebuild): the OLD addressable corpus could not produce a trustworthy recall
    number, and corpus hygiene alone can't fix it** (under-sampled farms are dead; live farms already-sampled
    or timeout-capped; fixtures-only classification suppresses scores regardless). Two real paths:
    (a) **source FRESH live spam farms** to rebuild the addressable set; (b) address the binding
    engine constraint — the lenient `small-marketing`/`programmatic-directory` profiles
    unconditionally demote `spam/*` — but that's shared with the verified reputable 8 (regression
    risk), and the residual hard case (clean AI farms like newsunzip that trip zero `spam/*` even
    when sampled) is the **content-effort** (AUC 0.77) case. Engine micro-tuning against the
    current corpus = tuning against a broken ruler.

- **❌ uniformity-gated demotions — still DEAD, but for a refined reason.** Per-template
  `uniformityScore` (`per-template-scoring.ts:221`) is 1.000 for newsunzip's main templates
  *and* legit catalogs — no separation. Refined cause: the rules that fire on the farm are
  **site/cluster-level, not template-attributed**, so within-template variance sees ~nothing.
  Gating demotions on uniformity can't work.
- **✅ NEW LEVER (live-validated, n=6) — `content/title-uniqueness` fire-rate discriminates.**
  Both farms fire it at **0.74–0.80** of pages; all 3 usable legit catalogs at **0.12–0.16**
  (wise n=1, ignored). It is NOT demoted on `programmatic-directory`, fires at full severity
  on newsunzip — *yet newsunzip still scores risk 20 ("ready")* because of bucket weighting.
  The signal exists and separates; it's being wasted. `content/citation-coverage` partially
  separates too (newsunzip 0.92, legit 0.16–0.48) but is noisier (fresherslive ~0).
  **Validate on a broader site set before acting — could FP on legit sites with templated
  titles.**
- **✅ NEW & important — profile-LENIENCY INVERSION (the core recall bug).** Verdicts are
  literally inverted: newsunzip (worst actor) = **risk 20 "ready"**; legit winners
  typeform/zapier/numbeo = **30/49/60**. Cause: the uniform spam farm classifies
  `programmatic-directory@0.7` and gets the **lenient** catalog profile (heavy demotions),
  while the messier legit catalogs fall to `unclear@0.5` and get a **stricter** profile. The
  more templated/spammy a site, the more confidently it earns the lenient profile. This — not
  scale, not uniformity — is a primary driver of the inverted AUC. Investigate
  `site-classifier.ts` (why farms land prog-dir-confident) + the prog-dir vs unclear profile
  weight gap (`auditor.ts:265` vs `:367`).
- **❌ NO-GO — affiliate/ad-density axis.** Build-cheap (raw `<script>` already on
  `ParsedPage.html` at `parser.ts:173`), but the signal measures "ad-supported publisher",
  not "spam": Forbes Advisor / CNN Underscored / ramp.com carry the same
  Outbrain/Taboola/AdSense/Mediavine markers; 3 of 8 named farms have ZERO markers; reputable
  baseline fixtures are script-stripped so it's unvalidatable. Would FP on reputable
  publishers — the exact FP class v0.7.1/v0.7.2 killed.
- **⭐ content-effort feature (AUC 0.77) still the strongest lever for the spam/* DETECTION
  gap** — the `spam/*` rules (thin-content, near-duplicate, boilerplate, doorway,
  template-diversity) genuinely under-fire on modern AI farms (newsunzip tripped ZERO of
  them live). But it is no longer the *only* option: the title-uniqueness signal + the
  profile-inversion fix are non-LLM, tractable, and live-validated. Sequence: cheap
  structural fixes first, content-effort for the residual. See `core_spambrain_gap_audit`.
- **Scale-seeding is done — do NOT repeat it expecting recall gains.** Falsified (newsunzip
  seeded to 5000, still "ready").
- **Wire the calibration ratchet into CI.** The `--fixtures-only` no-regression gate is
  built (ratchet already exits 1 on verdict regressions). Deferred until the baseline is
  recall-healthy. Refresh with `--write-baseline` **only after** recall work, so we don't
  ratify the current regression as the floor.
- **Made-for-monetization blind spot.** Farms like `zacjohnson` monetize via
  auto-affiliation scripts (ShareASale/Skimlinks), which live in stripped `<script>`
  content → pseolint never sees them. Possible new detection axis (affiliate/ad density
  from raw HTML pre-strip).
- **Dead farms** (`thehairpin`, `equityatlas`, `popularnetworth`, `beingselfish`): their
  fixtures still drive calibration, but live re-seeding is impossible. If the addressable
  subset needs fresh real farms, source new ones — these four have rotted.

## Gotchas

- `reputable-corpus.test.ts` soft-fails on `numbeo` (over-flag) + `citable-facts` firing
  100% — pre-existing aspirational-ceiling debt; skips in CI when `calibration-results.json`
  is absent/stale.
- `bestfirenze-regression.test.ts` needs `cheerio` installed (`bun install`) — env-flaky.
- AI `fetch_sitemap` tool defaults `maxDepth = 1` (root + one level) — bump if pointing it
  at a deeply-nested farm index.
- `--seed-classifier-urls` SKIPs (leaves existing value) on a dead/parked domain; on a
  reachable-but-empty sitemap it writes `[]`. It rewrites the matched site(s) and saves
  the whole corpus JSON — use the `[substr]` filter to seed one site without touching the
  verified reputable 8 (the old `git add -p` mitigation can't run; this env's git is
  non-interactive).
