# Two-sided calibration harness — completing the recall side

**Date:** 2026-06-12
**Status:** Design (approved in brainstorm; pending spec review → implementation plan)
**Program:** "The credibility leap" — make pseolint defensibly *measure* against Google's named spam policies instead of eyeballing weights. This is **sub-project 1 of 3**.
**Context:** Follows `2026-06-12-core-spambrain-gap-audit.md` (the full core-engine weakness audit). The audit's central critique: every rule is a single signal, fused by a hand-tuned linear sum that was calibrated by eyeballing ~6 reputable sites — overfitting, not calibration. This sub-project builds the instrument that makes "we measurably improved" provable. Sub-projects 2 (cross-rule fusion) and 3 (calibrate weights/thresholds) depend on it and are **out of scope here**.

---

## 1. Goal & non-goals

**Goal:** Complete the existing calibration harness so it measures **both** error types — false positives on reputable sites (already covered) **and** recall on policy-violating sites (the gap) — and emits a per-rule firing table that converts the audit's assertions into committed baseline numbers. Sub-project 2 (foundation fixes) and sub-project 3 (cross-rule fusion + weight calibration) both depend on this instrument and are out of scope here (see §8).

**Non-goals (explicitly deferred):**
- No detection-logic changes (entity masking, sampling, new rules) — those are sub-project 2.
- No weight/threshold fitting or auto-calibration — that is sub-project 3. The harness only *reports*; it does not *tune*.
- No academic web-spam corpora (ClueWeb/WEBSPAM). Dropped during brainstorm: 2006–2012, host-level, general-web-spam — a category mismatch with 2026 programmatic-content abuse, largely dead URLs, and possibly misleading as a correlation. External validity comes instead from documented Google-enforcement evidence on each fixture (the `groundTruth.evidence` field).

---

## 2. Background — what already exists vs the gap

The harness is ~80% built and well-designed. **Reuse unchanged:**
- **Faithful fixtures** — `packages/core/calibration/fixtures/<host>/`: raw HTML (scripts/styles stripped, JSON-LD preserved), `_manifest.json` (URL→file map), `robots.txt`, `sitemap.xml`. The engine's directory loader restores real URLs so link-graph/canonical/hreflang rules work.
- **Disk-replay runner** — `scripts/calibration-reputable-pseo.ts` audits from disk via `auditSource(fixtureAbsDir, opts)` (line 288), bypasses sampling with `pinnedUrls`, and captures fixtures via `--snapshot` (line 553+). Verdict ordering via `VERDICT_RANK`; results to `calibration-results.{json,md}`.
- **Corpus + schema** — `reputable-pseo-corpus.json` + `.schema.json`: each site has `expectedVerdictCeiling` (`ready|caution|concerning|critical`), `groundTruth {status, trafficClass, evidence}`, `pinnedUrls`, `localFixtureDir`, `classifierUrls`.

**The gap (the asymmetry that is the credibility hole):** all 9 fixture sites are **reputable**, and the only metric is a verdict **ceiling** (verdict must be *at or below* the ceiling). The harness therefore measures exactly one error type — false positives on good sites. It is structurally blind to **recall**: there is no labeled policy-violating side, so it cannot tell whether the engine catches real spam. This matches the `calibration_against_reputable_pseo` memo ("framework shipped; corpus run pending").

---

## 3. Design

Three pieces of new work; everything else reused.

### 3.1 Unified labeled corpus (file structure decision: option A)

Generalize `reputable-pseo-corpus.json` → **`calibration-corpus.json`** with an explicit `class` per site. One labeled source of truth (chosen over a parallel bad-corpus file — more intelligible, and this is a dev-only harness with no external consumers, so the rename is cheap). Schema additions to `CorpusSite`:

- **`class`** — `"reputable" | "policy-violating" | "subject"` (required). `reputable` and `policy-violating` are the **labeled, gated** classes (ceiling / floor respectively). `subject` is a **tracked, non-gated** dogfood target (e.g. our own site, paperforge.dev): audited and reported like any other site — verdict, risk, fired rules — but **excluded from the confusion matrix and the ratchet**, because it has no ground-truth pass/fail. It exists so we can watch a real site move as detection improves. (`borderline` is still omitted — add only if a genuinely ambiguous *labeled* site forces it.)
- **`expectedVerdictFloor`** — `ready|caution|concerning|critical`. An **aspirational ground-truth label** for `policy-violating` sites: the verdict the engine *should* reach (rank ≥ floor). It is NOT a CI gate (see §3.3/§3.4) — at baseline the engine is expected to fall short of it, and that shortfall is the measurement. Used only for the per-site label-alignment report. Omitted for `reputable` and `subject`.
- **`visiblePolicies`** — `string[]` of named spam policies the site *visibly* violates (e.g. `["scaled-content-abuse","doorway","thin-affiliation"]`), drawn from the audit's policy taxonomy. Required for `policy-violating`, optional for `subject` (a hypothesis to watch), omitted for `reputable`.
- **Direction (state once to prevent inversion):** `risk` is 0–100 **low = good**, and the verdict ladder `ready < caution < concerning < critical` increases with risk. So a `policy-violating` site should produce *high* risk / verdict ≥ floor; a `reputable` site *low* risk / verdict ≤ ceiling.
- `groundTruth.status` enum extends to include a negative state (e.g. `"penalized"` / `"deindexed"`) so bad sites can carry their real-world fate; `evidence` (already required) cites the documentation.

Keep `expectedVerdictCeiling` optional rather than required (only reputable sites use it). Update `reputable-pseo-corpus.schema.json` → `calibration-corpus.schema.json` accordingly. Migrate the 9 existing sites by stamping `class: "reputable"`.

### 3.2 Policy-violating fixtures (the long pole)

Source ~10–15 policy-violating sites with **documented evidence**, captured in the existing fixture format via `--snapshot`. Sourcing + labeling is the human-judgment work and gets a **sign-off gate** (§4).

- **Selection criteria:** publicly-documented Google enforcement (March-2024 deindexed cohort, named doorway/AI-content farms from trade coverage) OR sites that unambiguously exhibit a named on-page policy violation. Spread across policies so each major detector has ≥1 positive example (scaled content, doorway, thin affiliation, site-reputation abuse, keyword stuffing, etc.).
- **Labeling rule (honesty constraint):** label by **"visibly violates policies our on-page engine is scoped to detect,"** NEVER "was penalized." A site deindexed purely for off-page reasons (link spam, manual action) our engine cannot see is *not* a valid recall target and must not be added as one. `visiblePolicies` records the specific on-page violations; `evidence` records the enforcement citation.
- **Capture feasibility:** prefer currently-live sites (clean `--snapshot`). For documented-but-dead sites, capture via Wayback or exclude — never fabricate. Same scripts/styles-stripped, JSON-LD-preserved treatment; pin a representative page set (≈25, matching reputable fixtures) plus `classifierUrls` so site-classification still sees true scale.

### 3.3 Two-sided scorer

The scorer **reports**; the CI gate (§3.4) is a separate ratchet. Reporting has three parts plus a distribution:

1. **Label-alignment report (vs aspirational labels).** Per site: reputable → is verdict ≤ `expectedVerdictCeiling`? policy-violating → is verdict ≥ `expectedVerdictFloor`? This is a *report*, not a pass/fail gate — policy-violating sites are expected to fall short at baseline, and the size of that shortfall is the headline measurement.
2. **Classifier metrics (headline numbers).** Treat "flagged" = verdict rank ≥ a fixed positive threshold (default `concerning`) as the engine's positive prediction; label-positive = `policy-violating`. Emit confusion matrix (TP/FP/TN/FN), precision, recall, F1. Alongside it, the **per-class risk distribution** — median (and min/max) `risk` for reputable vs policy-violating, and whether a single threshold cleanly separates the two. (This replaces a Spearman coefficient, which is statistically noisy and hard to read at ~25–30 sites with a binary label; the distribution answers "does the score discriminate?" at a glance.)
3. **Per-rule firing table (the gold artifact).** A rule "**fired**" on a site if it emitted ≥1 `RuleResult` of any severity. Per `ruleId`: number/fraction of sites in each class where it fired (site-level) and page-fire-rate, plus two attribution columns from the summary — **suppressed** (`siteClassification.suppressedRules`) and **demoted** (`appliedSeverityDemotions`). This directly quantifies every audit claim (e.g. `spam/entity-swap` firing on 1/10 policy-violating farms) *and* distinguishes "didn't fire" from "was suppressed by the site-classifier" — turning the classifier-suppression confound the audit found into an explicit, visible finding. Recall contributors = rules firing on policy-violating; FP contributors = rules firing on reputable. (Labeled classes only — `subject` sites are excluded from these counts.)
4. **Tracked-subjects report.** For each `subject` site: its current verdict, risk, and top fired rules — a plain watch list, no pass/fail. Lets us follow a real dogfood target (paperforge.dev) across detection changes without it polluting the labeled metrics.

Output extends `calibration-results.{json,md}`: the md gains a confusion-matrix block, a metrics line (P/R/F1 + per-class risk medians), the label-alignment table, and the per-rule table; the json carries the structured equivalents for diffing across runs (and is the artifact the ratchet compares against).

### 3.4 CI gate — a ratchet against the committed baseline, not the aspirational labels

`tests/integration/audit-fixture-manifest.test.ts` already exercises fixtures in the test suite. The gate is a **ratchet vs the last committed `calibration-results.json`**, so it is green at baseline by construction and only tightens as detection improves:

- **Reputable sites:** hard gate on `expectedVerdictCeiling` (the existing check at lines 329–334; already green today — these sites pass their ceilings).
- **Policy-violating sites:** verdict must not **regress below its committed-baseline verdict** (recall must not drop). NOT gated on the aspirational `expectedVerdictFloor` — that target is what sub-project 2 works toward, not a precondition for merging this one.
- **Subject sites:** **never gated.** Their verdict appears in the tracked-subjects report only; a verdict change is informational, never a CI failure.
- **Per-rule table:** recall counts must not fall and FP counts must not rise vs baseline (warn-only initially, promotable to hard once stable).

This is the honest gate: "don't get worse," measured against a concrete committed scorecard — never "already meet a target we haven't built the detection for yet."

---

## 4. Corpus sourcing & sign-off gate

Because the labeled corpus *is* the credibility foundation, site selection is not a silent implementation detail. Implementation produces a **candidate list** — each entry: URL, proposed `class`, proposed `visiblePolicies`, and the `evidence` citation — and pauses for user sign-off before fixtures are captured and committed. This keeps labeling judgment with the human and avoids baking in a contestable corpus.

**This forces a two-phase sequencing of the implementation plan, which de-risks it:**
- **Phase 1 (no sign-off needed):** schema migration, the scorer, and the CI ratchet, validated against the existing reputable-only corpus (a degenerate all-negative confusion matrix — TP/FN undefined — which is correct for wiring and tests). The machinery is built and green before any contestable data lands.
- **Phase 2 (after sign-off):** capture the policy-violating fixtures, run the full two-sided scorer, and commit the real baseline scorecard. Phase 2 is purely additive data + a baseline snapshot; no further code.

---

## 5. Success metric / definition of done

- `calibration-corpus.json` (+ schema) unified with `class` / `expectedVerdictFloor` / `visiblePolicies`; 9 existing sites migrated to `class: reputable`.
- ≥10 policy-violating fixtures captured (sign-off complete), spread so each major detector family has ≥1 positive example.
- Runner emits the confusion matrix, P/R/F1 + per-class risk medians, the label-alignment table, and the per-rule firing table. **Determinism:** every corpus site runs in fixture mode (`localFixtureDir` set, read from disk, no network); the harness **fails loudly if any corpus site lacks a fixture** rather than silently falling back to a live fetch.
- Baseline numbers for the **current** engine captured and committed. Expected shape (and the point of the exercise): high true-negative rate on reputable, **low true-positive rate on policy-violating** — i.e. the recall hole, now quantified rather than asserted.
- CI ratchet green at baseline by construction (it compares against the committed baseline, not the aspirational floors).

This baseline is the explicit input to sub-project 2: the foundations succeed iff they raise the per-rule recall numbers on the policy-violating side without raising the false-positive numbers on the reputable side.

---

## 6. Risks & mitigations

- **Small-corpus overfitting.** 25–30 sites is a regression benchmark, not a statistical training set. Mitigation: frame all numbers as a *directional gate* (did recall rise / FP hold), never as absolute accuracy claims; the spec forbids weight-fitting here (that's sub-project 3, which must use held-out splits).
- **Label subjectivity.** "Visibly violates" is a judgment. Mitigation: the sign-off gate + the required `evidence` citation per site + recording specific `visiblePolicies` rather than a vague good/bad bit.
- **Bad-site staleness / death.** Spam sites churn. Mitigation: fixtures are frozen snapshots (the existing model already treats drift as a refresh signal); Wayback fallback; exclude rather than fabricate.
- **Corpus storage size.** Raw HTML × ~25 bad sites. Mitigation: reuse the existing script/style-stripping; cap pinned pages at ≈25/site as reputable fixtures already do.
- **Selection bias toward detectable spam.** Choosing sites our engine *can* see inflates apparent recall. Mitigation: deliberately include a few sites that violate currently-uncovered policies (hidden text, keyword stuffing) so the table also exposes whole-detector gaps, not just tuning gaps.

---

## 7. File-level change list

- `packages/core/calibration/reputable-pseo-corpus.json` → **rename** `calibration-corpus.json`; add `class` to all sites; add bad-side entries.
- `packages/core/calibration/reputable-pseo-corpus.schema.json` → **rename** `calibration-corpus.schema.json`; add `class`, `expectedVerdictFloor`, `visiblePolicies`; relax `expectedVerdictCeiling` to optional; extend `groundTruth.status` enum.
- `packages/core/calibration/fixtures/<bad-host>/` → new fixture dirs (HTML + `_manifest.json` + robots/sitemap) for the policy-violating set.
- `scripts/calibration-reputable-pseo.ts` → **rename** `scripts/calibration-corpus.ts`: add the label-alignment report + CI ratchet, confusion matrix + P/R/F1 + per-class risk medians, per-rule firing table (with suppressed/demoted columns); update results writers and the `--snapshot`/`--repin`/`--seed-classifier-urls` mode references.
- `scripts/calibration-results.{json,md}` → regenerated with the new two-sided output (baseline committed).
- `packages/core/tests/integration/audit-fixture-manifest.test.ts` (and/or `tests/calibration/`) → assert the CI ratchet (no verdict regresses vs the committed baseline; reputable ceilings stay hard).
- Update references to the old corpus/script names (the `auditor.ts:274` calibration comment, the memos).

---

## 8. Decomposition recap (where this sits)

- **Sub-project 1 (this):** two-sided measurement harness + labeled corpus. Output: a committed baseline scorecard.
- **Sub-project 2:** foundation fixes (entity auto-masking, cluster-aware sampling, normalizer unification), each validated as a measured delta on this harness.
- **Sub-project 3:** cross-rule fusion (composite/interaction signals) + calibration of weights/thresholds against the labels, on held-out splits.
