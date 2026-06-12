# Entity auto-masking — corpus-derived entity patterns

**Date:** 2026-06-12
**Status:** Design (approved in brainstorm; pending spec review → implementation plan)
**Program:** "The credibility leap" — **sub-project 2 (foundations)**, first increment. Measured against the two-sided calibration baseline shipped in sub-project 1 (`packages/core/calibration/baseline-scorecard.json`, recall 44%).
**Context:** The audit (`2026-06-12-core-spambrain-gap-audit.md`) named the near-empty entity mask (`DEFAULT_ENTITY_PATTERNS` = US states + 5-digit numbers only) the single highest-leverage weakness. The two-sided baseline empirically confirmed it: the constructed `doorwayspam.example` fixture — six near-identical `{city}` pages funneling to one destination — scored only `caution`, with `spam/near-duplicate`, `spam/entity-swap`, and `spam/doorway-pattern` all **silent**, because city names aren't masked so the entity-swapped pages don't collapse to a common skeleton.

---

## 1. Goal & non-goals

**Goal:** Derive entity-mask patterns from the corpus under audit — the tokens that vary across templated sibling pages — and merge them into the existing `entityPatterns` so every masking consumer (`entity-swap`, `meta-uniqueness`, `citable-facts`, `answer-first`, `summary-bait`, `citation-coverage`, `template-coverage`) sees templated pages collapse to a common skeleton. Success = measured recall gain on the calibration baseline with no reputable false-positive regression.

**Non-goals (out of scope here):**
- **Cluster-aware sampling** (a separate sub-project-2 increment). Auto-masking works on whatever pages are present; the fixture corpus is fully pinned (all siblings present), so masking can be built and measured now without it.
- **Full unification of the three URL normalizers** (`site-classifier.ts:85`, `template-detection.ts:145`, `stratified-sample.ts:6`). This increment reuses ONE existing clusterer (`template-detection`); unifying all three is noted as a follow-up, not done here.
- No new rules; no scoring/weight changes.

---

## 2. Background — the integration point

`entityPatterns: EntityMaskPattern[]` (`{placeholder: string, pattern: RegExp}`) is assembled from `DEFAULT_ENTITY_PATTERNS` + caller-supplied patterns (`auditor.ts:~2601`) and passed to seven rule functions (`auditor.ts:756–942`). `maskEntities(text, patterns)` (`algorithms/entity-mask.ts`) is a simple ordered regex-replace. So the entire feature is: **compute derived patterns from the parsed pages, append them to `entityPatterns` once, before the rule block.** No rule changes.

---

## 3. Design

### 3.1 Module

New pure module `packages/core/src/algorithms/auto-entity-mask.ts`:
```ts
export interface DerivedMaskOptions {
  minClusterSize?: number;   // default 3 — only derive from real templates
  minTokenLength?: number;   // default 3 — skip short noise tokens
  placeholder?: string;      // default "[ENTITY]"
}
export function deriveEntityPatterns(
  pages: ReadonlyArray<Pick<ParsedPage, "url" | "contentText">>,
  opts?: DerivedMaskOptions,
): EntityMaskPattern[];
```
No I/O, no engine calls — unit-testable in isolation. It internally clusters pages by URL template (reusing `template-detection`'s normalizer/clusterer), runs both derivation strategies, dedupes the token set, and returns a small `EntityMaskPattern[]` (one combined alternation regex per ~chunk, to bound regex size).

### 3.2 Strategy A — URL-slug derivation

1. Cluster pages by URL template (siblings = same normalized path template). Require `≥ minClusterSize` members.
2. For each cluster, identify the slug segment position(s) that **vary** across members (the templated `:slug`/`:n` positions).
3. Collect the distinct token values in varying positions. Split multi-word slugs on `-`/`_` into individual tokens AND keep the full phrase (so `new-york` masks both `new york` and the parts). Lowercase for the token set.
4. Emit each token/phrase as an entity to mask.

This collapses `/emergency-plumber-{city}` and `/templates/{role}-{document}-{state}` directly.

### 3.3 Strategy B — content-diff derivation

1. Within each cluster (`≥ minClusterSize`), tokenize each sibling's `contentText`.
2. A token (or capitalized multi-word phrase) is an **entity candidate** when its presence **varies across siblings** — it appears in at least one but **not all** members of the cluster — AND it is proper-noun-shaped (initial-capitalised in the original text) AND `≥ minTokenLength`.
3. Collect the union of such varying capitalized tokens/phrases per cluster.

This catches body-text entities absent from the URL (business names, person names). The "present in some, not all siblings" rule is what distinguishes an entity (varies) from shared template vocabulary (in all siblings → not masked).

### 3.4 Composition & determinism

- Run A and B, union the token sets, drop tokens already covered by `DEFAULT_ENTITY_PATTERNS`, sort tokens (stable order), and build word-boundary, case-insensitive regex(es): `\b(token1|token2|…)\b` → `placeholder`. Escape regex metacharacters in tokens. Chunk into multiple patterns if the alternation exceeds a size cap (deterministic chunking).
- Fully deterministic: sorted tokens, no randomness, no time. Re-running over the same pages yields identical patterns → stable baselines.

### 3.5 Over-masking guard

Masking too much inflates similarity → reputable false positives. Guards: `minClusterSize ≥ 3`; `minTokenLength ≥ 3`; strategy B requires proper-noun shape + minority-presence; skip pure stopwords; cap total derived tokens (e.g. a few hundred). **The harness is the enforcement mechanism** — the no-regression ratchet fails the change if reputable false-positives rise.

### 3.6 Wiring

In `auditor.ts`, after pages are parsed/sampled and immediately before the rule block (`~line 756`), compute `const derived = deriveEntityPatterns(pages); const effectivePatterns = [...entityPatterns, ...derived];` and pass `effectivePatterns` to the seven masking-consumer rules. Gate behind an option `autoEntityMask !== false` (default on) so it can be disabled for A/B comparison. Surface the derived-token count in diagnostics (weight 0) for transparency.

---

## 4. Success metric (staged, measured against the committed baseline)

Build and measure in two stages so each delta is attributable:
1. **Stage A (URL-slug only):** run the calibration harness (do NOT overwrite the baseline) and diff vs `baseline-scorecard.json`. Expected: `doorwayspam.example` moves `caution → concerning+` (entity-swap/near-dup fire); paperforge and other URL-entity-templated sites flag harder; **reputable verdicts unchanged** (ratchet green on the reputable side).
2. **Stage B (+ content-diff):** re-measure; expected additional recall on content-entity sites, still no reputable regression.

**How the gain must flow (critical).** Masking makes `entity-swap` and `near-duplicate` collapse *every* templated catalog — reputable ones (Zapier `/apps/slack` vs `/apps/notion`) as well as spam doorways. So entity-swap alone cannot discriminate, and must not by itself move reputable verdicts. The recall gain has to flow through the **doorway composite** (`entity-swap ∧ thin`/identical-meta — the existing `spam/doorway-pattern` gate) and the scoring profile's existing entity-swap demotions for programmatic directories. The measurement therefore checks two things, not one: (a) `doorwayspam` reaches `concerning+` **because `spam/doorway-pattern` fires** (entity-swap ∧ thin), and (b) reputable directories (Zapier, Segment) **do not regress** — their pages aren't thin, so the composite stays silent. If a reputable directory regresses, the masking is over-firing or the composite gate is too weak (a signal for sub-project 3, not a reason to ship a regression).

**Scope caveat (honest expectation):** derivation requires `≥ minClusterSize` siblings *present in the audited page set*. The gain concentrates on sites with derivable clusters — `doorwayspam` (6 `{city}` siblings), `paperforge` (25 pinned, multiple templates), larger farms — and will NOT help bad sites whose 4–6 pinned URLs scatter across distinct templates (clusters too small). Expect a focused, not uniform, recall lift; that's correct for this increment.

**Definition of done:** measured recall rises vs the 44% baseline with the reputable false-positive count NOT increasing (ratchet-enforced); `doorwayspam` flags `concerning+` via `spam/doorway-pattern`; a unit-tested `deriveEntityPatterns`; the new baseline committed via `--write-baseline` with the before/after recorded.

---

## 5. Risks & mitigations

- **Entity-swap/near-dup become near-universal signals.** Masking makes them fire on reputable templated catalogs too. This is expected and acceptable *only if* discrimination flows through the doorway composite (`entity-swap ∧ thin`) and existing scoring demotions (see §4). The risk is that the composite gate is too weak and a reputable catalog regresses; mitigation: the ratchet hard-stops it, and the fix then belongs to the composite/scoring (sub-project 3), not to shipping a looser mask.
- **Over-masking → reputable FP.** Mitigation: guards (§3.5) + the ratchet hard-stops a reputable regression; tune `minClusterSize`/`minTokenLength` against the measured FP count.
- **Sampling: siblings absent from the sample → no derivation.** For the pinned fixture corpus all siblings are present, so this doesn't bite now; on live large crawls it's mitigated later by cluster-aware sampling (separate increment). Noted, not blocking.
- **Regex size / ReDoS.** Escape tokens, use a bounded alternation with chunking, anchor on `\b`; no backreferences/nested quantifiers.
- **Three divergent normalizers.** Reuse one (`template-detection`) for now; drift risk noted; unification is a follow-up.

---

## 6. File-level change list

- **Create** `packages/core/src/algorithms/auto-entity-mask.ts` — `deriveEntityPatterns` + the two strategies (pure).
- **Create** `packages/core/tests/algorithms/auto-entity-mask.test.ts` — unit tests (URL-slug, content-diff, determinism, over-masking guards, regex escaping).
- **Modify** `packages/core/src/auditor.ts` — compute `derived` after parse/sample, merge into `effectivePatterns`, pass to the masking-consumer rules; add `autoEntityMask` option + diagnostics count.
- **Modify** the module defining `AuditOptions` (`packages/core/src/types.ts`) — add `autoEntityMask?: boolean`.
- **Export** `deriveEntityPatterns` from `index.ts`.
- **Regenerate + commit** `packages/core/calibration/baseline-scorecard.json` after measuring (records the recall improvement).

---

## 7. Where this sits

Sub-project 2 increment 1 of 3: **entity auto-masking** (this) → cluster-aware sampling → normalizer unification. Then sub-project 3 (cross-rule fusion + weight calibration, incl. fixing the segment/numbeo over-flagging the local soft-gate surfaces).
