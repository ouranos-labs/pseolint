# Scoring honesty: unmute catalog-shaped spam without chasing verbose farms

**Status:** PROPOSAL · awaiting greenlight before implementation
**Date:** 2026-09-22
**Depends on:** v0.4 scoring (`auditor.ts`), v0.4.3 profiles, v0.6 template rollup, two-sided harness (`2026-06-12-two-sided-calibration-harness-design.md`), recall-leak diagnosis (`2026-06-29-recall-leak-structural-rules-suppressed.md`)
**Plan:** `docs/superpowers/plans/2026-09-22-scoring-honesty-unmute.md`

## 1. Problem in one sentence

The rules already see catalog-shaped spam. Scoring then demotes, clusters, confidence-discounts, and coverage-gates it until a 200-page doorway looks like one warning. That was fitted so Zapier/G2/Wise stay ≤ `caution`. The same valves pardon farms that share the catalog shape.

This is **not** “add more rules.” It is not the verbose-AI-farm problem. That one is already documented: entity-swap/near-dup/thin do not fire on rich per-entity prose; un-suppressing `PSEO_ONLY_RULE_IDS` moved recall 0 points (`2026-06-29`). Verbose farms stay on `--content-effort`. This spec only makes the **deterministic** path honest when those rules *do* fire.

## 2. What we will not do

- Do not globally tighten simhash / word-count thresholds (thin 300 → 500, near-dup 0.85 → 0.7). The detectors are loud; scoring mutes them.
- Do not unmute `spam/thin-content` on `programmatic-directory` or `unclear`. Catalog records are often 200–300 words by design; the 300-word default is the wrong threshold, not a scoring-profile problem. Per-type `minWords` is a later spec.
- Do not unmute AEO / EEAT / OG / heading-structure / image-alt / missing-author. Those are structurally mismatched to catalogs; keep them `info`+`low`.
- Do not unmute `spam/boilerplate-ratio` on catalogs. Shared chrome is the template.
- Do not delete the orchestrator, citation-lift, or content-effort in this change. They become deletable *after* scoring is honest, not as part of it.
- Do not claim addressable recall will jump to 80% without `--content-effort`. This spec recovers score for **fired** structural clusters.

## 3. Design

Five product changes, one plumbing change they all need, plus copy that currently lies.

### 3.0 Plumbing: score the cluster, not the finding row

`enrichFindings` collapses pairwise `near-duplicate` / `entity-swap` / `doorway-pattern` to **one** `RuleResult` with `context.type === "cluster"` and `context.clusterSize === members.length`. `scoreFromFindings` and `per-template-scoring.ts` then use `group.length` (almost always 1), so `perInstance` never applies. Report UX stays one line; scoring currently pretends the cluster is one page.

`applyGrouping` does the same to unique-value / meta-uniqueness / orphans / dead-ends / link-depth when >3 pages, **without** attaching cluster context.

**Change:**

1. Extract `RULE_IMPACTS`, `DEFAULT_RULE_IMPACT`, `CONFIDENCE_MULTIPLIER`, `categoryForRule`, and the bucket math into `packages/core/src/scoring.ts`. `auditor.ts` and `per-template-scoring.ts` both import it. Delete the hand-synced duplicate. `rule-impact-parity.test.ts` becomes “scoring.ts is the only table” (or is deleted).
2. Add `FindingContext` variant `{ type: "group"; size: number; members: string[] }`. `applyGrouping` sets it when it rolls up.
3. Instance count for a finding:
   - cluster → `context.clusterSize`
   - group → `context.size`
   - else → `1`
   Sum instance counts across a ruleId group (unclustered per-page findings still add).
4. Impact formula unchanged: `min(maxImpact, base + (instances - 1) * perInstance) × confidence`.
5. Blocker density uses the same instance count: an `error`/`critical` cluster of 40 pages is 40 blockers, not 1. Comment in `scoreFromFindings` about “Zapier 5 blockers / 500 pages” stays valid for unclustered errors; clustered integrity must not hide behind the 1-row collapse.
6. `spam/doorway-pattern` impact today is `{ 30, perInstance: 0, maxImpact: 30 }` — “one template defect.” A doorway *cluster* is not one defect. Change it to match entity-swap: `{ baseImpact: 30, perInstance: 5, maxImpact: 80 }`.

Worked example (native critical entity-swap, high confidence, programmatic-directory integrity weight 0.55):

| Scoring | 40-page cluster |
|---|---|
| Today | `count=1` → 25 × 1.0 × 0.55 ≈ **14 risk** → `ready`/`caution` |
| After | `min(80, 25+39*5)=80` × 1.0 × 0.55 ≈ **44 risk** → `concerning` |

If the same finding is demoted to `warning`+`medium` (today’s unclear table): 80 × 0.6 × 0.55 ≈ 26 → still `caution`. That is why §3.1 also restores severity on `unclear`. Cluster-size scoring alone is not enough if we leave spam as warning×0.6.

**Tests:** unit-test `instancesForFinding` / `scoreFromFindings` with a synthetic 40-member cluster vs one pairwise leftover; expect risk to jump a verdict band. Extend `per-template-scoring.test.ts` the same way. Keep `enrich-findings-large-cluster.test.ts` (report still one finding).

**Export:** `scoreFromFindings` (today private) must be exported so scoring tests do not go through `auditSource` HTML fixtures.

### 3.1 Profiles: stop demoting the four spam rules on `unclear`; leave catalogs’ chrome demotions

**`unclear` (the default when classifier confidence < 0.7):**

Remove from `severityOverrides` and `confidenceOverrides`:

- `spam/near-duplicate`
- `spam/entity-swap`
- `spam/doorway-pattern`

Keep thin / AEO / EEAT / OG / headings / alt / boilerplate / missing-author as they are.

Rewrite the comment that says “Real spam signals (near-dup, doorway, thin) keep their severity.” Thin stays demoted; the other three actually keep native severity. The `profileFor` comment that says “never demote when unsure” must match the code: unsure → `unclear` profile, which still demotes *catalog-mismatch* rules, not integrity spam.

**`programmatic-directory`:**

- `spam/entity-swap` is already not demoted. Leave it.
- Keep `spam/near-duplicate` and `spam/doorway-pattern` at **warning** (catalog pair shape is real; the extra doorway gate of thin-OR-identical-meta is the FN/FP trade we keep).
- Remove their **confidence** override (`medium` → omit, so they stay `high`). The 0.6 multiplier was a second mute on top of the severity demote.
- Keep thin / AEO / chrome demotions.

Why not unmute near-dup/doorway to `critical` on programmatic-directory: Segment/Zapier fired doorway as critical *because the pages are thin catalog records*. Native critical + clusterSize + blocker density would blow the reputable ceiling. Warning + high confidence + clusterSize is the catalog-side compromise: a 40-page cluster still hits the impact cap; a 2-page pair does not tank G2.

**`small-marketing`:** unchanged except `--strict` (§3.6). Degeneration guard still returns empty overrides. Do not expand `PSEO_ONLY_RULE_IDS` un-suppression here (measured no-op on farms, 2026-06-29).

**FP protocol (mandatory, not optional):** after the profile change, run `bun run calibrate:corpus`. If a reputable site exceeds its ceiling:

1. Do **not** put the three spam rules back on the unclear demotion table.
2. First: give it working `classifierUrls` so it lands `programmatic-directory` instead of `unclear` (Airbyte @0.5 is the historical case).
3. Only then: raise that site’s `expectedVerdictCeiling` one tier, with a comment naming the top driver. Ceiling edits are reviewable; silent re-demotion is how we got here.

### 3.2 Template headline on `unclear`

Today `canActivateV6` is false for `unclear` and `small-marketing`. Unclear is where both catalogs and farms land. Worst-template-wins is the product; it must not be off for the common misclass.

**Change:** activate template detection + `siteVerdictFromTemplates` when `shouldActivateTemplateScoring` is true, **including `unclear`**. Keep `small-marketing` off (real 20-page brochure sites). Degeneration-guarded corpora that become `unclear` *and* have ≥2 qualifying clusters get the template path.

Coverage floor stays 5%. Longtail still excluded.

Authority currently applies only to `legacyVerdict`. After this change, apply the authority/effort pipeline to **whichever** headline won (`templateVerdict ?? legacyFromRisk`), with the integrity veto in §3.3.

**Tests:** `per-template-scoring` already covers worst-of-qualifying. Add an auditor integration (or a narrow unit around the `canActivateV6` predicate) proving `type: unclear` + two ≥5% clusters produces `templates.length >= 2` and a template-derived verdict.

### 3.3 Authority must not rescue an integrity cluster

`shiftVerdictForAuthority`: ≥80 → one tier lenient; ≤30 → one tier strict. Parasite sections live on high-DA hosts (Forbes Advisor / CNN Underscored class). The authority spec already called this out as out of scope; this spec puts a cheap veto on the lenient arm only.

**Lenient arm is skipped when any of:**

- `categories.integrity.grade` is `D` or `F`, or
- a finding with `ruleId` in `{spam/near-duplicate, spam/entity-swap, spam/doorway-pattern, links/host-section-divergence}` has cluster/group instance count ≥ 10 and severity `warning` or worse.

Strict arm unchanged. Fail-open (no score) unchanged. Effort shift still runs after authority.

**Tests:** existing `authority-score.test.ts` / `auditor-wiring.test.ts` keep the ≥80 soften on a site *without* a large integrity cluster. New case: inject `authorityScore: 95` on a fixture with a 12-page entity-swap cluster at warning+; verdict must not drop a tier vs `authorityScore` omitted.

### 3.4 Policy-violating floors: a real gate, but only where the engine can see it

Today: reputable `expectedVerdictCeiling` is a hard per-site test; policy `expectedVerdictFloor` is aspirational; the scorecard ratchet only says “don’t get worse than baseline.” A patch can keep Zapier green, drop a doorway fixture from `concerning` to `caution`, and still pass if the *aggregate* recall number is padded.

**Change:**

Add `gateFloor?: boolean` to `CorpusSite` (schema + `corpus-types.ts`). Semantics:

- `true` → CI asserts `VERDICT_RANK[actual] >= VERDICT_RANK[expectedVerdictFloor]` (same style as the reputable ceiling loop in `reputable-corpus.test.ts`).
- omitted/`false` → still reported in the alignment table; still on the recall ratchet; **not** an absolute floor.

**Must set `gateFloor: true` on:**

- every `synthetic: true` site (the doorway fixtures exist to assert a recall floor),
- every `class: "policy-violating"` site with `detectability !== "off-page-only"` whose **current committed baseline** already meets its floor.

**Must leave `gateFloor` off:**

- `detectability: "off-page-only"` parasites (on-page engine cannot see them),
- addressable sites the baseline still misses (healthyceleb-class verbose farms). Their floor stays aspirational. Closing those is content-effort / entity-inference, not this spec.

Add `MIN_GATED_POLICY_SITES` (start at the count of `gateFloor: true` sites at land time; only raise). Same “deleted fixture silently shrinks the gate” protection as reputable.

Do **not** set every on-page policy site to `gateFloor: true` in the same commit as the scoring change and then lower floors to match a weak engine. The point is a non-empty set of sites that *must* stay `concerning+`.

### 3.5 `--strict` actually disables demotions

Formatter copy: “pass `--strict` to disable” demotions. Implementation only clears `suppressedRules`.

**Change:** when `AuditOptions.strict` is true, `profileFor` returns the type’s `categoryWeights` but **empty** `severityOverrides` / `confidenceOverrides` (same shape as degeneration-guard). CLI help string updates to: bypass pSEO-only suppression **and** scoring-profile severity demotions.

`small-marketing` + `--strict` then lets thin/doorway score at native severity. That is the operator escape hatch; default audits stay profiled.

**Tests:** `site-classifier-auditor.test.ts` already covers empty `suppressedRules`. Add: a thin catalog classified `programmatic-directory` with `strict: true` must not appear in `appliedSeverityDemotions` for `spam/thin-content`.

### 3.6 Copy

- `TOTAL_V04_RULE_COUNT = 32` in `formatters/console.ts` → scored rule count from `RULE_SCOPE` (or a derived `SCORED_RULE_COUNT`). Stop freezing v0.4 marketing in the CLI.
- Demotion hint: `--strict` disables demotions (true after §3.5).
- `profileFor` / `unclear` comments: match §3.1.

No marketing-site rewrite in this spec.

## 4. Acceptance

Run from `packages/core` / repo root as today.

| Gate | Pass condition |
|---|---|
| Unit | cluster instance count, doorway impact table, unclear does not remap the three spam rules, `--strict` clears overrides, authority veto, template activation predicate |
| Integration | 40-page near-dup/entity-swap fixture reaches `concerning` without `--content-effort` |
| Calibration | `bun run calibrate:corpus` (hermetic). All reputable ceilings still hold **or** a reviewed ceiling bump per §3.1 FP protocol. All `gateFloor: true` sites meet their floor. Scorecard ratchet: recall and AUC must not fall; precision may fall only if a reputable ceiling was explicitly raised in the same commit |
| Non-goal check | healthyceleb-class sites without effort scores may still sit `ready`/`caution`. Do not reopen `PSEO_ONLY_RULE_IDS` to chase them |

## 5. Rollout

One PR. Scoring + profiles + `--strict` + template gate + authority veto + corpus `gateFloor` + baseline rewrite if metrics *improve*. If reputable ceilings break, follow §3.1 before merging. No flag. This is the default engine.

Ruleset version bump (`CORE_RULESET_VERSION`) because verdicts change for the same HTML.

## 6. Out of scope (named so they are not sneaked in)

- Per-type `thinContentMinWords`
- Entity-pattern inference quality (already a separate spec)
- Making content-effort default-on for the CLI
- Extracting/deleting AI orchestrator tools
- Host-section parasite recall (needs more than the authority veto)

## 7. Decision log

| Option | Verdict |
|---|---|
| Unmute thin on catalogs | Rejected. Wrong threshold. |
| Unmute doorway to critical on programmatic-directory | Rejected. Segment/Zapier history. Warning + high conf + clusterSize instead. |
| Unmute three spam rules on unclear | Accepted. Unclear is the timid default. |
| Absolute floor on every policy site | Rejected. Off-page parasites and verbose farms would fail CI forever or force floor-lowering. |
| `gateFloor` on synthetics + currently-caught addressable sites | Accepted. |
| Apply authority to template headlines | Accepted, with integrity veto. |
