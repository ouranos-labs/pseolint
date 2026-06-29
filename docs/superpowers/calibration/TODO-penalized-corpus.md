# TODO — build the penalized-pSEO calibration corpus (recall side)

**Why:** the calibration harness today is one-sided. `calibration-corpus.json` only
holds *reputable* sites with a verdict **ceiling** (must score at-or-below) — so it
measures false positives only. It's structurally blind to recall: there's no labeled
policy-violating set, so we can't prove the engine *catches* spam. Our own internal
number puts recall around ~56% (entity-masking lifted it 44%→56%) and it isn't gated
or published. This corpus fixes that.

**Goal:** 30–50 labeled policy-violating sites, each with a date + evidence link,
in the same shape as `packages/core/calibration/calibration-corpus.json`.

---

## The data to collect (do this part on the computer)

For each site, an entry mirroring the reputable corpus but **inverted**: instead of
`expectedVerdictCeiling`, a `expectedVerdictFloor` (the engine must score it *at or
above* — anything cleaner is a miss / false negative on our side).

```jsonc
{
  "url": "https://example.com/<a-representative-template-page>",
  "vertical": "programmatic-location|directory|comparison|glossary|...",
  "expectedSiteType": "programmatic-directory",
  "expectedVerdictFloor": "concerning",      // NEW: floor, not ceiling
  "groundTruth": {
    "status": "penalized|deindexed|traffic-collapse",
    "trafficClass": "high|medium|low",
    "evidence": "Lost ~90% organic traffic week of 2024-03-05 core/scaled-content update; manual action reported.",
    "source": "<HN/Reddit/Twitter post-mortem, GSC screenshot writeup, or SISTRIX/Ahrefs cliff>",
    "asOf": "2024-04",
    "enforcement": "scaled-content-abuse-2024-03|site-reputation-abuse-2024-05|manual-action|unknown"
  },
  "samplingHint": { "sampleSize": 25, "noRender": true },
  "pinnedUrls": [],
  "classifierUrls": []   // 5-20 representative template URLs, like the reputable entries
}
```

### Sourcing checklist (target 30–50)
- [ ] **Mar 5 2024 scaled content abuse** casualties — sites that lost rankings/traffic in that core+spam update.
- [ ] **May 7 2024 site-reputation-abuse ("parasite SEO")** casualties.
- [ ] **Documented pSEO death cases** — HN "Show HN / our pSEO got nuked" threads, r/SEO and r/juststart post-mortems, SEO Twitter/X threads with before/after charts.
- [ ] **Manual-action screenshots** (GSC "Thin content" / "Pure spam" notices) shared publicly.
- [ ] **Traffic-cliff evidence** from SISTRIX/Ahrefs/Semrush visibility graphs where the cliff lines up with a named update.
- [ ] Spread across verticals (location pages, directories, comparison, AI-generated glossaries) so recall isn't measured on one pattern.
- [ ] Each entry has BOTH a `date` (`asOf`) and a working `source` link. No unsourced entries.

### Quality bar (so this stays defensible, not a vibe list)
- Prefer sites with a *named* enforcement event over "feels spammy."
- Capture the evidence link content now (screenshot/archive) — post-mortems get deleted.
- Note when a site has since recovered (`status` + `asOf`) — recoveries are useful negatives.

---

## The wiring already exists — this is a DATA task, not a code task

Re-checked the repo: the two-sided harness is already built. Don't rebuild it.

- ✅ Schema + types are two-sided: `class` (reputable | policy-violating | subject),
  `expectedVerdictFloor`, `visiblePolicies`, `detectability` (on-page | off-page-only),
  `synthetic` — `calibration-corpus.schema.json` / `corpus-types.ts`.
- ✅ Metrics exist: `packages/core/calibration/score.ts` has `confusionMatrix`
  (precision/recall/F1), `calibrationMetrics` (Mann-Whitney AUC, class separation,
  per-band penalty rate), `perClassRiskStats`, and the `ratchet` (HARD gate: a
  policy-violating verdict dropping vs baseline = recall regression).
- ✅ Runner prints the scorecard + writes `baseline-scorecard.json`
  (`scripts/calibration-corpus.ts`); the reputable ceiling is gated in
  `tests/calibration/reputable-corpus.test.ts`.
- ✅ ~6 real policy-violating entries already in the corpus (zacjohnson 8.2M→0,
  healthyceleb, fresherslive, beingselfish) + 2 synthetic must-catch fixtures.

**What's actually missing is corpus depth (~6 → 30–50).** Pre-seeded that:
`packages/core/calibration/seed-todo.json` (a staging file the runner does NOT
read) now holds 15 web-sourced draft entries — 12 on-page-detectable AI farms
(causal.app, equityatlas, newsunzip, popularbio, …) and 3 off-page-only parasite
cases (CNN/USA Today/Forbes coupons, tracked but not recall targets).

### Promote workflow (per seed entry)
- [ ] Verify live status (many are dead → use Wayback for the fixture).
- [ ] Capture a fixture under `packages/core/calibration/fixtures/<slug>/` + set
      `pinnedUrls` and `localFixtureDir` so the recall gate runs hermetically.
- [ ] Set `asOf`; confirm `expectedSiteType` + `expectedVerdictFloor` against a real audit.
- [ ] Move the entry from `seed-todo.json` into `calibration-corpus.json` `sites`, drop the `todo` field.
- [ ] Run `bun run scripts/calibration-corpus.ts`, eyeball recall/AUC, commit the refreshed `baseline-scorecard.json`.

### Two small code follow-ups (optional)
- [ ] `confusionMatrix` currently counts every `policy-violating` site as a positive —
      exclude `detectability: "off-page-only"` from the **addressable**-recall denominator
      (parasite SEO is undetectable on-page by construction, so it shouldn't drag the number).
- [ ] Publish the result on `/methodology` (confusion matrix + today's ~56% recall).
      On-brand with `/limits`; the corpus *is* the moat.

## References
- Existing reputable corpus: `packages/core/calibration/calibration-corpus.json`
- Calibration spec / one-sided rationale: `docs/superpowers/specs/2026-05-03-calibration-against-reputable-pseo.md`
- Two-sided harness design: `docs/superpowers/specs/2026-06-12-two-sided-calibration-harness-design.md`
