# Core engine audit: weaknesses vs Google SpamBrain + real-world calibration data

**Date:** 2026-06-12
**Status:** Findings / pre-spec (no implementation committed)
**Trigger:** Follow-on to `2026-06-11-richer-fact-extraction-design.md`. After making `algorithms/fact-extraction.ts` smarter, audit *all* core modules for weak detection elements that could be enhanced to come closer to how Google's SpamBrain reasons, and find real-world data to calibrate against.
**Method:** 4 parallel adversarial code-audit agents (one per module cluster) + 2 research agents (SpamBrain/policy grounding; portable datasets). All `file:line` citations verified against source; the two load-bearing facts (default entity mask, scoring fusion) re-confirmed by direct read.

---

## 1. Executive synthesis

### 1.1 Strategic reframe — policy linter, not SpamBrain emulator

SpamBrain cannot be emulated. Google has **never disclosed its inputs**. The only public *facts*: it is an ML/AI spam-prevention platform, introduced 2018 (named publicly 2022), it *neutralizes* (does not just penalize) link spam with unrecoverable benefit loss, and it runs continuously inside core and spam updates. Everything about its feature set is community inference.

What *is* documented and defensible to approximate: Google's **~16 named spam policies** (the targets SpamBrain enforces). The product should be framed as a **Google-spam-policy / penalty-risk linter** that approximates documented, named policies — every rule citing the specific policy section it maps to. Any "information gain" feature must be labeled an *approximation of a patent concept Google has never confirmed is in production*. This frame matches the existing positioning (penalty-risk audit, symptom front door).

### 1.2 The headline gap

Across all four code audits the finding is uniform: **every rule is a single deterministic signal, and the scoring engine fuses them with a fixed linear weighted sum** (`auditor.ts:1144-1148`). SpamBrain's whole reason for existing is *non-linear signal fusion* — thin content, entity-swap, and near-duplication are each individually benign, but **co-occurring on the same URLs is the doorway signal**. The engine sums them independently into one capped bucket, so the co-occurrence — the actual abuse pattern — is invisible. There is no cross-rule interaction term anywhere. `links/host-section-divergence` is the only multi-signal rule (4 signals), and even it is an unweighted vote-count.

### 1.3 The five structural weaknesses (highest leverage)

1. **Lexical, not semantic.** SimHash (3-word shingles), the Wikipedia trigram bloom, the 42-phrase cliché list, and TF-IDF are all exact-token. The universal evasion is synonym-spinning one word per n-gram, which collapses all of them while leaving content semantically identical — exactly what Google scores as `GibberishScore`. Deterministic mitigations: MinHash/unigram + char-shingle lanes alongside the trigram hash; gzip compression-ratio as a spin/repetition detector.

2. **Entity masking is the keystone, and it is nearly empty.** The default mask (`auditor.ts:657-664`) is US states + bare 5-digit numbers, nothing else. This single fact caps `spam/entity-swap`, masked TF-IDF, `content/meta-uniqueness`, and the AEO fact rules at once, and it **misses the canonical "Plumbers in {city}" pSEO farm** because city names are unmasked. Highest-ROI single fix in the report: **corpus-derived auto-masking** — diff sibling templated pages and mask the slots that vary. Zero external data; fixes 4+ modules simultaneously.

3. **Sampling co-occurrence ceiling silently caps recall near zero.** Pairwise rules (near-dup, entity-swap, doorway, cannibal) run on a √-proportional stratified *sample*. For a duplicate pair in a cluster of size C with allocation a, P(both sampled) ≈ (a/C)² ≈ 0 on large clusters — i.e. on exactly the big farms that matter most. The rules *appear* to run but are structurally blind. Fix: cluster-aware mini-batch pairwise sampling that guarantees co-occurrence within a template.

4. **Scoring is hand-tuned, linear, uncalibrated.** Every weight was eyeballed against ~6 named sites (Stripe/Zapier/bestfirenze) until verdicts "looked right" — overfitting a tiny unlabeled set, not calibration. No interaction terms; bucket caps erase signal (3 issues and 30 issues both saturate at 100); discontinuous blocker-floor cliffs; best-confidence-wins promotes a whole mixed cluster to its highest-confidence instance (`auditor.ts:1112-1123`, deliberate but debatable). The two moves that most "look like fusion": **(a) cross-rule composite signals** computed before bucketing (co-occurrence already available in `findingsByUrl`), and **(b) a labeled calibration harness**.

5. **Content rules check presence, not quality.** 8 of 10 content rules pass with a static template string: `<meta name=author>`, one `<a href=wikipedia.org>`, any `alt` value, or the literal text "Reviewed by" (matched against *raw HTML*, so an HTML comment satisfies it). They measure markup existence, not first-hand experience / originality / information gain. The fix pattern is the two rules that resist evasion (`unique-value`, `translation-no-op`): both measure cross-page overlap, not markup presence.

### 1.4 Cheap wins — named policies with zero coverage today

Deterministic, high-confidence, currently completely uncovered:

| Gap | Policy | Effort |
|---|---|---|
| Hidden text / CSS cloaking (`opacity:0`, `font-size:0`, white-on-white, `text-indent:-9999px`; allowlist ARIA/`sr-only`/tabs) | Hidden Text Abuse | Low, high-confidence |
| Keyword stuffing (term-density outliers, city/phone lists, repeated exact-match in title/h1/alt) | Keyword Stuffing | Low |
| Thin affiliation (affiliate-link-to-original-text ratio, merchant-copy detection) | Thin Affiliation | Low–med |
| Unqualified commercial outbound links (missing `rel=sponsored/nofollow/ugc`) | Link Spam (on-page subset) | Low |
| Misleading functionality (title claims a "generator/converter" tool; DOM has only ad slots) | Misleading Functionality | Med |
| Fake freshness (`dateModified` bumped, content hash unchanged across audits — audit history exists in the web DB) | anti-pattern | Med (needs DB join) |
| Sneaky/UA-conditional redirects & cloaking diffs (Googlebot UA vs browser) | Cloaking / Sneaky Redirects | Med (needs differential fetch) |

### 1.5 The precision/recall tension

Moving toward SpamBrain-grade recall means accepting more false positives — precisely the precision-first conservatism the current thresholds were tuned to avoid (don't flag Stripe/Zapier). The unlock is a **labeled calibration set**: it's what lets recall rise without re-flooding reputable sites. The Waterloo/WEBSPAM corpora plus the existing per-domain audit-history DB are enough to start.

---

## 2. Spam-policy coverage matrix

Source for policy definitions: https://developers.google.com/search/docs/essentials/spam-policies (see Appendix E for per-policy observable signals).

| Google spam policy | pseolint coverage | Notes |
|---|---|---|
| Scaled content abuse ⭐ | **Partial** | thin-content (length only), near-dup/entity-swap (near-exact only), boilerplate (exact-match only), velocity (date-stack only). Spun/paraphrased/padded scaled content largely uncovered. |
| Doorway pages | **Partial** | `doorway-pattern` models "templated near-dup cluster," not the defining destination-convergence/funnel trait. Conservative → low recall. |
| Site reputation abuse ⭐ | **Partial** | `links/host-section-divergence` approximates it (the strongest rule); 4-signal but unweighted vote-count, minority-only, path-segment sectioning. |
| Thin affiliation | **None** | No affiliate-ratio / merchant-copy rule. |
| Hidden text / keyword stuffing | **None** | No CSS-hidden-text or keyword-density detection. High-confidence deterministic gap. |
| Cloaking | **None** | No bot-vs-user differential fetch. |
| Sneaky redirects | **None (this family)** | `tech/redirect-chain` handles chains only; no UA/referrer-conditional or intent-mismatch detection. |
| Link spam | **None (this family)** | No outbound-rel-qualification, anchor-spam, PBN, or sitewide-footer-link detection. Link rules are connectivity/orphan/depth. |
| Misleading functionality | **None** | No "claimed tool absent in DOM" check. |
| Scraping | **None** | near-dup is intra-corpus only; no cross-site verbatim-match. |
| Expired-domain abuse | **None** | Needs WHOIS/Wayback (external data). |
| Machine-generated traffic | **N/A** | Targets operator behavior vs Google, not site content. |
| Malicious practices / UGC spam / legal-PII / scam-fraud | **Out of scope** | Safety/demotion signals, not on-page-linter-approximable. |

**Net:** of ~10 actionable named policies, the engine meaningfully addresses ~2.5 (scaled content [partial], doorway [partial], site-reputation [partial]). Hidden text, keyword stuffing, thin affiliation, link spam (on-page), misleading functionality, scraping, cloaking, sneaky redirects have **zero** coverage.

---

## 3. Prioritized enhancement roadmap

Ordered by (impact × feasibility). All are deterministic-TS-feasible unless flagged `[DATA]` (needs external corpus) or `[HIST]` (needs audit-history DB).

**Tier 0 — structural unlocks (fix the foundations everything else rides on):**
1. **Corpus-derived entity auto-masking** — diff sibling templated pages, mask varying slots. Fixes entity-swap, masked TF-IDF, meta-uniqueness, AEO fact rules, and the city-templated blind spot at once.
2. **Cluster-aware pairwise sampling** — within-cluster mini-batches so near-dup/doorway/entity-swap/cannibal actually see pairs. Lifts the recall ceiling on large farms.
3. **Unify the three divergent URL normalizers** (`site-classifier.ts:85`, `template-detection.ts:145`, `stratified-sample.ts:6`) into one source of truth so stratification/classification/template-scoring reason on the same boundaries.

**Tier 1 — fusion (the biggest conceptual leap toward SpamBrain):**
4. **Cross-rule composite signals** before linear bucketing — e.g. `doorway = thin ∧ entity-swap ∧ near-dup co-firing on same URLs`; `parasite = host-section-divergence ∧ low-authorship`; `fake-freshness = dateModified-present ∧ content-hash-unchanged` `[HIST]`. Emit as their own high-impact findings.
5. **Labeled calibration harness** `[DATA]` — fit `categoryWeights`, `blockerFloor`, verdict thresholds via logistic/isotonic calibration against a labeled ready/not-ready set (audit-history DB + Waterloo ClueWeb percentiles + WEBSPAM-UK). Replace anecdotal "calibration rounds."
6. **Confidence-weighted group aggregation** — replace best-confidence-wins so one high-confidence outlier can't promote a low-confidence cluster.
7. **Unify per-template and site scoring** — eliminate the `per-template-scoring.ts` divergence (different weights, no profile) so worst-template aggregation can't contradict the site score.

**Tier 2 — portable open-source heuristics (real data, no calibration needed):**
8. **Port FineWeb/Gopher/C4/Dolma cleaning heuristics** `[DATA]` as new deterministic rules (~25 threshold-complete rules; Apache/ODC-By). See §4.
9. **Semantic-resistance lanes** — add unigram-MinHash + char-shingle alongside trigram SimHash; entity-mask before near-dup hashing; gzip compression-ratio as a spin detector.

**Tier 3 — new policy coverage (cheap wins from §1.4):**
10. Hidden text / CSS cloaking detector.
11. Keyword-stuffing (density) detector.
12. Thin-affiliation + unqualified-affiliate-link detector.
13. Misleading-functionality detector.
14. Body-text (not title-only) soft-404; multilingual.

**Tier 4 — rule hardening (per-rule fixes, see appendices):**
15. EEAT: match visible `contentText` not raw `html`; validate "reviewed by"/"last updated" co-occur with a real value.
16. missing-author / image-alt / meta-uniqueness: validate content, not presence; wire the dead `_minJaccardForCollision` param.
17. Pass the `sampled` flag to `orphan-pages` / `dead-ends` / `cluster-connectivity` (currently fire on sampling artifacts; only `link-depth` is guarded).
18. hreflang BCP-47 tag validation; schema `@type` vocabulary validation; re-scope `schema/consistency` to per-template.
19. Never *fully* suppress integrity-core spam rules in `site-classifier` (demote, don't disable) — closes the "classify-as-marketing to turn off entity-swap" evasion.
20. Stop leaking evasion advice in fix text (`publication-velocity.ts:32` "stagger dates").

---

## 4. Real-world data catalog (ranked by relevance × accessibility)

| Rank | Source | Usable? | License/Cost | What you get |
|---|---|---|---|---|
| 1 | **FineWeb + C4 + Gopher heuristics** | ✅ Directly portable code | Apache-2.0 / ODC-By, free | Exact numeric thresholds for ~25 spam/boilerplate rules |
| 2 | **Dolma / RefinedWeb pipelines** | ✅ Directly portable | Apache-2.0, free | Same heuristics + URL/domain blocklists + ablation evidence |
| 3 | **API-leak signal names (hexdocs/GitHub)** | ✅ As a rule taxonomy | Leaked docs (gray legality), free to read | 14,014 attribute names → rule vocabulary |
| 4 | **C4 / LDNOOBW blocklist** | ✅ Direct (with caution) | CC0 / open, free | 400+ word blocklist (documented dialect bias) |
| 5 | **OpenPageRank (Common Crawl host graph)** | ✅ Direct (validation) | Free, attribution | 10M-domain authority scores for link-graph calibration |
| 6 | **Waterloo ClueWeb spam rankings** | ⚠️ Validation only | Free (scores); corpus needs license | Per-doc spam percentiles → labeled eval set |
| 7 | **WEBSPAM-UK2006/07** | ⚠️ Validation only | Free, research license | Host-level spam/nonspam labels + link features |
| 8 | **DOJ trial exhibits (Q*, NavBoost)** | 🔵 Inspirational | Public record, free | Conceptual model of Google's two-signal system |
| 9 | **Quality Rater Guidelines PDF** | 🔵 Labeling schema | Free (Google) | E-E-A-T / Lowest-quality rubric → label taxonomy |
| 10 | **RAID / HC3 / M4** | ⚠️ Adjacent | Open, free | AI-text detection corpora (not pSEO-specific) |

**Highest-value, lowest-friction:** the FineWeb/Gopher/C4/Dolma heuristic stack for runtime rules, and the API-leak + Quality-Rater vocabulary for naming/severity. The leak tells you *what* Google checks; FineWeb gives you *how* to threshold it. Full detail, exact thresholds, and URLs in Appendix F.

**Concrete ported-heuristic examples (Appendix F has all):**
- Gopher: word count 50–100k; mean word length 3–10 chars; symbol-to-word ratio ≤ 0.10; ≤ 0.90 lines bullet-started; ≤ 0.30 lines ellipsis-ended; ≥ 0.80 words contain an alpha char; ≥ 2 stop-words present; repetition filters (duplicate line/paragraph/n-gram fractions).
- FineWeb: drop if fraction of lines ending in terminal punctuation ≤ 0.12; drop if ≥ 0.10 of chars are in duplicated lines; drop if ≥ 0.67 of lines are < ~30 chars.
- C4: remove "javascript"/"lorem ipsum"/curly-brace/"terms-of-use"/"cookie policy" lines. **FP lesson:** FineWeb *dropped* C4's terminal-punctuation rule (nuked ~30% of tokens for no gain) — cite as precedent for conservative thresholds.

---

## Appendix A — Algorithms-layer audit (fact-extraction, simhash, tf-idf, wikipedia-paraphrase, entity-mask + dedup rules)

Cross-cutting: default entity mask ships only `[STATE]` + `[ZIP]` (`auditor.ts:657-664`); everything else unmasked. Mask is naive sequential `String.replace`, order-dependent, no overlap arbitration (`entity-mask.ts:3-9`).

**simhash.ts (+ near-duplicate.ts):** 64-bit SimHash over 3-word shingles, FNV-1a-64, near-dup at 0.85 (`auditor.ts:107` ≈ Hamming ≤ 9). Weaknesses: synonym/word-swap evasion (1 word per 3-gram collapses similarity below 0.85); within-sentence word reorder breaks trigrams; no stopword removal / IDF weighting → boilerplate false positives; short-text instability on thin pages; 0.85 loose (literature uses ~3 bits); O(n²) pairwise with no LSH banding. Fixes: IDF-weight shingles (drop stopword-only); add unigram-MinHash + char-shingle lanes (survive single-word swaps); LSH banding for scale; recalibrate threshold `[DATA]`.

**entity-swap.ts:** same SimHash on masked text, threshold 0.95 (`auditor.ts:108`). Mask coverage is the whole ballgame and it's nearly empty → false-negative on the canonical city-templated farm. `[ZIP]` over-masks any 5-digit number (prices/years/IDs) → false positives. No partial-template detection. Fixes (ranked): corpus-derived auto-masking (diff siblings, mask varying slots — highest leverage); constrain `[ZIP]` to ZIP contexts; reuse `extractNamedEntities()` (`fact-extraction.ts:122`) to mask detected proper nouns; add a structural skeleton hash (DOM tag sequence / paragraph-length vector) as a parallel signal.

**tf-idf.ts:** standard TF-IDF on *raw* (unmasked) text → per-page entities dominate top-N keywords; no smoothing (IDF=0 when df=N; div-by-zero edge); linear TF rewards stuffing; unigram-only (no phrase signals); meaningless at N=5–50 audit scale. Fixes: mask entities first; sublinear TF + smoothed IDF; add bigrams/trigrams; ship a static background-IDF table `[DATA]`.

**wikipedia-paraphrase.ts:** bloom of ~10k Wikipedia trigrams inlined base64, fires at rate ≥ 0.4 (`rules/content/wikipedia-paraphrase.ts:5`). Generic-English trigrams ("one of the", "as well as") saturate the filter → systematic false positives on legitimate original prose; bloom only false-positives by design (overstates overlap); trivially evaded by 1-word-per-3gram paraphrase (catches verbatim, misses *paraphrased* Wikipedia — the named abuse); corpus opaque/stale. Fixes: subtract a common-English-trigram baseline `[DATA]`; recalibrate 0.4 `[DATA]`; report matched contiguous run-length (verbatim = long runs, incidental = scattered singletons) instead of global rate; add char-n-gram/MinHash-against-source lane.

**regurgitated-content.ts:** 5 Google-Places signals, fires speculative at ≥2. Trivially evaded by proxying assets to own CDN + removing "powered by google" text → zero signals; narrow to one vendor; star-rating regex brittle/over-broad. Fixes: vendor-agnostic hot-linked-image-ratio + review-schema density + thin-prose; count ratings via `aggregateRating` JSON-LD not text; add an originality discriminator.

**common-phrase-reuse.ts:** 42-cliché static list, substring `includes`, fires at ≥3 distinct. Substring matching false-positives ("a number of" inside "in a number of ways"); en-GB-biased; binary presence not length-normalized despite claiming "density"; no weighting. Fixes: clichés per 1,000 words + spam-correlation weighting `[DATA]`; word-boundary matching; pattern templates not literals; keep as a weak fused feature only (already `low` confidence — correct).

---

## Appendix B — Content-quality rule family audit

Verdict: the entire family is presence/count heuristics, not quality measures. 8 of 10 are trivially passable with a static template string. `unique-value` and `translation-no-op` are the two that resist evasion (both measure cross-page overlap). `value-add` *looks* sophisticated but is a thin re-aggregation of the same presence checks and is the systemic risk (only content rule emitting critical/error).

**eeat-signals (weakest):** counts 4 markup-presence categories, fires `info` if < 2. `EEAT_HTML_PATTERNS` tested against `page.html` not visible text (`:27`) → "Reviewed by" in an HTML comment / hidden div / CSS class name satisfies it. `info`-only severity. The "Experience" pillar (whole point of HCU) is unmeasured. Fixes: match visible `contentText`; require "reviewed by"/"last updated" to co-occur with a proper-noun/parseable-date; cross-check author-entity consistency across corpus; add a first-person experiential lexicon `[DATA]`.

**value-add (false sophistication):** averages 7 binary/ternary sub-signals at 1/7 each, fires < 0.5. Inherits every upstream evasion (5 of 7 are "did rule X fire"); equal weighting means originality = having a `<meta author>` tag; a 100%-scraped page with author meta + date + /about link can clear 0.5. Fixes: re-weight toward originality `[DATA]`; harden the eeat sub-signal; add an information-gain proxy (page-unique tokens across corpus) as a heavy 8th signal; floor: if regurgitated fired, cap composite at 0.3.

**citation-coverage (medium):** fires when ≥4 quantified claims but < 1 authoritative citation. One `<a href=wikipedia.org>` anywhere satisfies it (wikipedia.org on allowlist, itself UGC); citation↔claim binding absent at rule level though `extractGroundedClaims` (`fact-extraction.ts:217-247`) computes it and the rule discards it. Fixes: switch trigger to "claims in blocks with NO citation" using the existing block binding; scale `minAuthoritative` with claim density; drop wikipedia.org from authoritative tier.

**missing-author (weak):** 4 independent trivial-evasion paths. `bylineElement` is `[class*='author']` substring (`parser.ts:140-141`) → `<div class="author-card-skeleton">` passes; `schemaAuthor` only checks key exists → `"author":""` passes; `metaAuthor` accepts any non-empty string. Fixes: require name-shaped non-empty value (reject Admin/Team/Staff); penalize identical author string across corpus at scale; whole-class-token matching.

**unique-value (strongest, narrow):** counts corpus-frequency-1 unigram tokens, fires < minUniqueWords. Brittle to dilution (inject a few random/timestamp/misspelled tokens per page); corpus-relative to audited set only (external scrape varied across local pages looks unique); no phrase awareness. Fixes: move to 3-shingles (the simhash shingler exists); IDF-weight / cap noise tokens; ship a background DF table `[DATA]` so "unique" = unique-vs-web.

**heading-structure (medium):** structural presence only; 600-word threshold arbitrary; declines to check heading uniqueness (`:18-21`) leaving the doorway-template-headings gap. Fixes: corpus masked-H2-sequence identity check; H1≈title coherence.

**image-alt-text (medium):** presence of attribute not quality — `alt="image"` / keyword-stuffed alt passes; the templated-alt pSEO failure (its own stated motivation) is invisible. Fixes: detect templated/degenerate/identical-across-pages alt; flag filename-as-alt; use cheerio not regex.

**meta-uniqueness (medium-strong):** exact-match-after-masking; `_minJaccardForCollision` param accepted but **unused** (`:7`) — fuzzy matching specced, never wired. Round-robin templates defeat exact grouping. Fixes: wire the dead param to shingle-Jaccard/simhash clustering; flag empty/missing metas.

**title-uniqueness (conservative by design):** exact-raw-title dedup only catches literally-identical titles (the dumb failure); deliberately doesn't mask to avoid catalog FPs. Length thresholds are char-not-pixel. Fixes: add entity-masked near-dup title check at lower confidence, gated on body-thinness to stay safe; title-stuffing heuristic; pixel-width estimate.

**translation-no-op (strong, narrow):** simhash ≥ 0.95 within locale-path groups. Measures lexical not linguistic identity → false-positives on technical/tabular translations, false-negatives on bad MT (rewards low-quality MT); locale detection path-only. Fixes: add deterministic n-gram language-ID (flag detected-lang ≠ declared-locale); down-weight shared numeric/proper-noun/code tokens; detect locale by subdomain + query + hreflang.

---

## Appendix C — Spam family + classifiers audit (vs named policies)

All pairwise rules run on the **post-sample** corpus — the dominant blind spot, called out per rule.

**thin-content:** word count < 300 (`auditor.ts:109`). Word count ≠ substance (300 spun/padded words pass); no unique-token/lexical-density floor; boilerplate counts toward the threshold; FP on legit short pages; sampling blind spot. Fixes: type-token-ratio floor; strip boilerplate before counting (share `boilerplate-ratio.ts:26` skeleton); gzip compression-ratio; per-template thin-rate.

**boilerplate-ratio:** exact-string blocks shared ≥80% of pages, per-page ratio > 0.7 (`auditor.ts:112`). Exact match trivially evaded by per-page entity interpolation ("Welcome to {city}'s best plumbers" → frequency 1 → never enters skeleton); 80% cutoff brittle at scale; 0.7 very permissive. Fixes: shingle/SimHash the blocks after entity-masking (highest value); lower maxRatio ~0.55 `[DATA]`; per-template skeleton cutoff.

**doorway-pattern:** AND of near-dup ∩ entity-swap ∩ (thin OR identical-meta), ≥3 signals + one quality signal. The 2026-05-03 calibration that cut catalog FPs widened the evasion surface: per-page meta + 300 padded words = immune. `identical-meta` requires byte-identical metas, but entity-swap *defines* different metas → collapses to "near-dup ∧ entity-swap ∧ thin." **No destination-convergence/funnel signal** — the actual doorway definition (many entries → one destination) is unmodeled. Severe sampling blind spot (needs both pair members sampled). Fixes: add destination-convergence (do pair's internal links converge on a common target? — deterministic from `resolvedHrefs`, raises recall AND lowers catalog FP); decouple from the thin gate (use low-unique-token-ratio); run pairwise inputs on full corpus by template signature.

**publication-velocity:** day-buckets > max(100/day, 10% of corpus). Trivially evaded by date jitter — and the **fix text tells the spammer to "stagger publication dates"** (`:32`); pages with no `publishedDate` silently skipped; legitimate bulk-import FP; sample counts not true counts. Fixes: detect *uniform* spacing (interval-variance/chi-square) not just same-day; treat high missing-date ratio on a large templated corpus as a signal; cross-reference burst dates with content similarity.

**template-coverage:** `info`-only; filename-only (dense matrix of garbage praised, sparse matrix of excellent pages nudged negatively); entity-mask dependent; same-segment-count grouping fragmentable. Fixes: promote to warning when sparse AND near-dup/thin; normalize segment counts; report per-cell uniqueness.

**template-diversity:** unique `structureSignature`/pages < 0.35. `structureSignature` is a sorted tag histogram (`parser.ts:10-21`) — manufactures diversity by injecting decorative spans; fires on essentially every legit templated site (wrong axis — Google penalizes shared *content* not shared HTML). Fixes: replace with content-fingerprint diversity over masked body; compute per-template; harden signature against decorative-tag injection.

**near-duplicate:** see Appendix A. Additionally: hashes *raw* text (not masked) so entity substitution — the thing that makes pages templated — partly blinds it (entity-swap covers this at stricter 0.95); no cross-site detection so scraping/parasite out of reach. Fixes: entity-mask before near-dup too; MinHash-Jaccard second opinion + LSH to run on full corpus; multi-shingle; external-corpus fingerprints `[DATA]` for scraping.

**cannibal/url-pattern:** `info`-only; token-set-equality only catches exact reorder permutations in same directory (rarest case); ignores title/H1/keyword overlap (the real cannibalization signal). Fixes: detect on title/H1/keyword similarity; stem/plural normalization; promote when reorder-dup also near-dup in content.

**page-classifier:** glob router; first-match-wins ordering means a misordered/adversarial config can route spammy pages into a lenient group (self-exemption surface). Fix: warn when a page-group disables spam rules for a group the site-classifier thinks is programmatic.

**site-classifier (highest-leverage attack surface):** `small-marketing`/`blog` **suppress** `PSEO_ONLY_RULE_IDS` including `spam/entity-swap` and `cannibal/url-pattern` (`:66-73`). Classification is input-controlled: `tryClassifyLocalizedMarketing` fires at just ≥30% locale-prefixed URLs (`:330-331`) → a spammer prefixing 1/3 of URLs with `/en/`, `/de/` can **turn off entity-swap**. `degeneration-guard` only checks median words < 50 and ≥50% identical titles — both naturally evaded by entity-swap doorways. Thresholds are uncalibrated magic numbers. Fixes: never fully suppress integrity-core spam rules (demote only); harden the guard (unique-token-ratio, near-dup-pair fraction `[DATA]`); localized-marketing must also require low intra-locale template clustering; surface low-confidence/near-guard classifications.

**template-detection:** normalization gameable — single short tokens (`/austinplumber`, < 12 chars, no hyphen) stay literal → no cluster reaches 1% → **template scoring never activates**; duplicated normalizer (drifts vs site-classifier); 1%/count-5 gate lets many sub-threshold spam templates escape into long-tail. Fixes: positional-variance slug detection; de-dup the normalizer; treat huge internally-near-dup long-tail bucket as a pseudo-template.

**stratified-sample (recall ceiling for the whole family):** √-proportional allocation under-samples big clusters; P(both members of a pair sampled) ≈ (a/C)² ≈ 0; a **third** divergent URL-normalizer; unseeded default `Math.random` → non-reproducible verdicts. Fixes: cluster-aware mini-batch pairwise sampling (highest-leverage spam-recall fix); unify on one normalizer; over-allocate large clusters for the dedup pass; seeded-by-default.

**Whole-detector gaps:** expired-domain abuse, cloaking, sneaky redirects, link spam, hidden text / keyword stuffing — **zero** coverage. Site-reputation abuse only via the out-of-family `host-section-divergence`.

---

## Appendix D — Links / tech / AEO / schema rules + scoring engine

**Cross-cutting (all link rules):** the link graph is built only from crawled→crawled edges (`auditor.ts:2590`). On a sampled crawl this is a near-random vertex-induced subgraph → under-counts inbound, over-reports orphans/dead-ends/silos. `link-depth` was patched (the `sampled` flag) but **`orphan-pages`, `dead-ends`, `cluster-connectivity` were not** — they fire on artifacts. Dominant FP source for the family.

**Links —** orphan-pages: binary in-degree==0, no `sampled` guard, `error` too high. Fixes: pass `sampled` flag + downgrade; in-graph PageRank instead of zero-rank; count distinct source pages. dead-ends: ignores external outbound (a legit hub linking to authorities reads as dead-end); no `sampled` guard. cluster-connectivity: purely lexical directory key (flat-URL site collapses to one cluster); aspirational "topical authority" framing measures directory topology not topical relatedness. link-depth: `rootUrl` selection fragile (first index.html else crawl-order page 0, silent), single-root BFS, `sampled` short-circuit disables the whole unreachable check. host-section-divergence (strongest rule): 4 signals with hand-set trips, **unweighted ≥2 vote** (2 weak == 2 strong); topic Jaccard over top-100 TF-IDF is crude (legit /careers/ or /engineering-blog/ → false error); minority <50% gate gameable (grow section to 51% to escape); path-segment sectioning misses subdomain parasites. Fix: weighted normalized score with single cutoff; embedding topic-distance `[DATA]`; soft minority penalty; host-level sectioning.

**Tech —** canonical-consistency: missing canonical = `error` over-fires (self-canonical is recommended not mandatory; v0.4.3 dogfood regression); no canonical-chain or canonical→noindex/404 detection. soft-404: title-only + English-only + < 50-word gate → high FN (misses body-language soft-404s and the "200 for any slug" doorway soft-404). Fix: match body text; detect "same response for random slug" via structureSignature clustering; multilingual. redirect-chain: `> 2` arbitrary/lenient; no loop / non-200-final / 301-vs-302 detection. sitemap-completeness: "not in sitemap = error" over-fires; no-sitemap-at-all early-returns clean; one giant finding undercounts in scoring. og-completeness: pure presence (og:image to a 404 passes); floods per-page; ignores twitter-card fallback. hreflang-consistency: **no BCP-47 validity check** (`hreflang="en-USA"` passes — a top real bug); reciprocity skip-on-uncrawled → near-total FN on samples. Fix: BCP-47 validation (high-value, missing); cross-check target status.

**AEO (weakest signals, heavily demoted):** answer-first: blunt proper-noun regex ("We Offer Great Service" scores an entity); bare-year counts as a concrete fact; templated-opener detection masks only user entities; `<p>`-only (answer in a `<div>` → silently skipped). citable-facts: regex "facts" are just numbers — "Save 50%! 90% off! 100% guaranteed!" scores 3+ and passes; "$5" vs "$5.00" double-count; spelled-out numbers missed. freshness-signals: **rewards fake freshness** (a "Last updated" string with zero content change passes — the exact pattern Google penalizes); any `<time>` counts. content-modularity: genuinely weak, correctly always-low; mostly stylistic; dilutes the citation bucket. summary-bait: only AEO rule emitting `error`, on a *speculative zero-click forecast* (calibration risk); `.widget` div satisfies "non-replicable value." Fixes: reuse `extractNamedEntities`; drop bare-year; normalize fact forms + weight by kind-diversity; cross-check `dateModified` vs sitemap `lastmod` + content-hash `[HIST]`; demote summary-bait to warning.

**Schema —** json-ld-valid: only JSON-parseability + `@context`/`@type` presence (accepts `"@context":"garbage"`, no Schema.org type validation). required-fields: only 3 types (Article/Product/FAQPage); minimal field lists not aligned to Google rich-result reqs; no nested-entity recursion (`author:{}` passes). consistency: **almost meaningless** — fires `info` on any multi-type site (normal); can't localize. Fixes: validate `@type` against a Schema.org vocabulary; recurse nested entities; **re-scope consistency to per-template** (flag same-template-signature pages with different `@type` sets).

**Scoring engine (biggest SpamBrain lever):** findings → per-group impact `min(maxImpact, base + (count-1)×perInstance)` × best-confidence-multiplier → 4 buckets (info ≤50, non-info ≤100, bucket ≤100) → **linear weighted sum** (`auditor.ts:1144-1148`) → `max(weighted, blockerFloor)` step function → verdict at 20/40/60 → ±1-tier authority shift.
- Weights entirely hand-set (`RULE_IMPACTS` 481-563, confidence multipliers 572-577, per-profile weights 190-435, blocker bands 1161-1165) — tuned by eyeballing ~6 named sites. **No training, no statistical fit, no held-out validation.**
- **No interaction effects** — co-occurrence of thin+entity-swap+near-dup (the doorway signal) is summed independently and invisible.
- No per-niche/YMYL calibration (health directory == currency-converter directory).
- **Best-confidence-wins** (`:1116-1119`) — one high-confidence instance promotes a whole mixed cluster (opposite of conservative).
- Count→impact saturates fast; **site-level multi-URL findings bundled into one `relatedUrls` count as a single instance** (500-page orphan epidemic ≈ 5-page one).
- Bucket cap erases signal (3 issues == 30 issues at 100); blocker-floor is a discontinuous cliff (0.149 → floor 0, 0.15 → 25); authority shift is an unvalidated nudge on a caller-supplied number (gameable).
- **Per-template scoring diverges** (`per-template-scoring.ts:58-103,185`) — different weights (0.40/0.25/0.25/0.10), no site-type profile — so worst-template aggregation can contradict the site score.

Fixes (ranked): cross-rule interaction/composite signals (highest leverage, "looks like fusion"); confidence-weighted aggregate; labeled calibration harness `[DATA]`; smooth the discontinuities; unify per-template and site scoring; volume-aware count→impact; niche/YMYL priors; ground or remove the authority shift.

---

## Appendix E — SpamBrain & spam-policy briefing (research)

### What SpamBrain is — FACT (Google's own words)
- "SpamBrain is our AI-based spam-prevention system." — https://developers.google.com/search/docs/appearance/spam-updates
- Introduced 2018, named publicly in the April 2022 webspam report. "We caught 200 times more spam sites in 2021 compared to when we first started." "Identified nearly six times more spam sites in 2021 than in 2020"; 70% reduction in hacked spam; 75% reduction in gibberish spam on hosted platforms; >99% of searches spam-free.
- December 2022 link spam update used SpamBrain to *neutralize* links: "50 times more link spam sites compared to the previous link spam update." Benefit loss is unrecoverable: "Any potential ranking benefits generated by those links cannot be regained."

### INFERENCE (NOT confirmed by Google)
- Inputs/signals are undisclosed. Community *infers* on-page content features, link-graph features, site-level patterns, possibly engagement. Treat as speculation. **You cannot replicate SpamBrain; approximate the named policies.**

### Named spam policies + observable signals (detector heuristics)
Source: https://developers.google.com/search/docs/essentials/spam-policies
1. **Cloaking** — diff rendered HTML across user-agents; detect `if(UA contains 'Googlebot')` branches; bot-vs-human content divergence.
2. **Doorway** — high cross-page template similarity with a swapped {city/keyword} token; thin pages funneling to one conversion page; near-dup title/h1 differing only by location.
3. **Expired-domain abuse** — domain age vs content-topic mismatch (Wayback); sharp topical pivot in snapshots. (Needs external data.)
4. **Hacked content** — injected obfuscated/base64 JS; off-topic injected pages; referrer/UA conditional redirects; unexpected iframes.
5. **Hidden text/links** — `color≈background`; `font-size:0`/`1px`; `opacity:0`; `display:none` on keyword-dense blocks (allowlist ARIA/`sr-only`/tabs); `text-indent:-9999px`; off-viewport absolute; single-char anchors. *(High-confidence deterministic — strong fit.)*
6. **Keyword stuffing** — term-frequency outliers; city/phone lists without prose; repeated exact-match in title/meta/h1/alt/filename; high keyword-to-text ratio. *(Strong fit.)*
7. **Link spam** — outbound commercial/affiliate links lacking `rel=sponsored/nofollow/ugc`; over-optimized exact-match anchors; sitewide footer/template links; injected-widget keyword links. (Off-page link-graph signals need backlink data — inference only.)
8. **Machine-generated traffic** — operator behavior vs Google; out of scope for a content linter.
9. **Malicious practices** — back-button hijacking JS; auto-downloads; deceptive download buttons. (Mostly out of scope; back-button traps detectable.)
10. **Misleading functionality** — title/h1 claims a tool, DOM has no functional form/script, only ad slots + CTA; result gated behind offer walls.
11. **Scaled content abuse** ⭐ — large page-count + high template similarity; programmatic URL patterns at scale; low unique-content ratio; MT/synonym-spin artifacts; publication-velocity spikes; thin + keyword-targeted. **March-2024: now applies "no matter how it's created"** (removed the automation-only framing).
12. **Scraping** — verbatim/near-verbatim match vs external sources (needs corpus); feed mirrors; missing citations on third-party text.
13. **Site reputation abuse** ⭐ — subsection/subdomain whose topic diverges sharply from host core (maps to `links/host-section-divergence`); third-party/affiliate boilerplate under a high-authority host. Manual-action enforcement began May 2024.
14. **Sneaky redirects** — JS redirects keyed on UA/device/referrer; `meta refresh` to off-topic external; mobile≠desktop redirect; redirect only when referrer is a search engine.
15. **Thin affiliation** — high affiliate-link-to-original-text ratio; product descriptions matching merchant feed; templated review blocks with only the product name swapped; no original images/test data.
16. **User-generated spam** — comment/forum sections with high outbound-link density + exact-match commercial anchors; auto-generated profile pages.
17–20. Legal/PII removals, policy circumvention, scam & fraud — demotion/safety signals, out of linter scope.

### Helpful Content / E-E-A-T / information gain
- People-first vs search-engine-first; warning signs include "extensive automation to produce content on many topics," "mainly summarizing what others say without adding value," writing to a word count, entering a niche "without any real expertise," content that leaves readers needing to search again.
- "Who / How / Why" framework; **Trust is the most important** E-E-A-T aspect; E-E-A-T is not a single ranking factor.
- "Information gain" patent ("Contextual estimation of link information gain," filed 2018, granted 2022) = new information beyond what a user has already seen. **INFERENCE that it's live in ranking — a patent is not confirmation of use.** Approximable as n-gram/entity novelty vs a topic baseline; label clearly as an approximation.
- AI content: "Appropriate use of AI or automation is not against our guidelines"; using automation "to generate content with the primary purpose of manipulating ranking … is a violation."

### March 2024 core + spam update
- Core update + spam update announced together (March 5, 2024); goal to collectively reduce low-quality/unoriginal/unhelpful content by ~40%.
- Three policies: scaled content abuse (broadened "no matter how created"), expired-domain abuse, site reputation abuse (enforcement May 5, 2024).
- Many sites **fully deindexed** (not just demoted). INFERENCE (third-party studies, not Google): affected cohort skewed heavily AI-generated. Google said it targeted *scaled content abuse regardless of production method*, not "AI content."

**Primary sources:** spam-policies, spam-updates, creating-helpful-content, 2023/02 AI-content blog, 2024/03 core-update-spam-policies, 2024/11 site-reputation-abuse, 2022/12 link-spam-update, 2022/04 webspam-report (all developers.google.com/search/...).

---

## Appendix F — Real-world dataset catalog (research, full detail)

### 1. Google Content Warehouse API leak (2024)
2,596 modules / 14,014 attributes; field names + descriptions only, **no weights/thresholds**. Browsable: https://hexdocs.pm/google_api_content_warehouse/0.2.0/api-reference.html (machine-readable; scrape into a rule taxonomy). Origin: https://sparktoro.com/blog/an-anonymous-source-shared-thousands-of-leaked-google-search-api-documents-with-me-everyone-in-seo-should-see-them/ ; analysis: https://mojodojo.io/blog/googleapi-content-warehouse-leak-an-ongoing-analysis , https://searchengineland.com/unpacking-googles-massive-search-documentation-leak-442716

Relevant attributes — *spam:* `uacSpamScore` (0–127, >64 spam-like), `spamtokensContentScore`, `GibberishScore`, `keywordStuffingScore`, `spamMuppetSignals` (hacked: `hackedDateNautilus/Raiden`, `raidenScore`), `scamness`, `badSslCertificate`, `phraseAnchorSpamPenalty`. *Content quality (Panda-like):* `OriginalContentScore` (0–512; thin variant 0–127), `pandaDemotion`/`babyPandaV2`, `contentEffort` (**LLM-based effort estimate for article pages**), `ractorScores` (auto-generated-content classifier → AI-content flag), `lowQuality`, `unauthoritativeScore`, `anchorMismatchDemotion`, `navDemotion`/`clutterScore`, `titlematchScore`, `siteFocusScore`/`siteRadius` (topical concentration vs deviation), `ugcDiscussionEffortScore`, `violatesMobileInterstitialPolicy`, `adsDensityInterstitialViolationStrength`. *Authority/freshness:* `siteAuthority` (confirmed domain-level trust in `CompressedQualitySignals`), `NSR`, `chardScores`, `freshboxArticleScores`, `lastSignificantUpdate`.
Use as **rule taxonomy and naming map** (what to check); no thresholds. Legally gray (leaked IP) — reference, don't redistribute.

### 2. DOJ antitrust exhibits (US v Google)
Index: https://www.justice.gov/atr/us-and-plaintiff-states-v-google-llc-2023-trial-exhibits . Revealed **Q*** (site-level quality/trust, PageRank-influenced), **NavBoost** (click system, 13-month window: `goodClicks`/`badClicks`/`lastLongestClick`/pogosticking), top-level model ≈ ABC (Anchors/Body/Clicks) + NavBoost + Q*; "two fundamental signals" Q* (quality) and P* (popularity). **Inspirational only** — a static linter can't observe clicks; useful to justify the "site-wide quality / domain penalty risk" framing.

### 3. Quality Rater Guidelines PDF
https://guidelines.raterhub.com/searchqualityevaluatorguidelines.pdf (~170pp, updated Sept 2025). Defines E-E-A-T and the Page Quality scale (Lowest→Highest); Lowest = "spammy, undesirable, unhelpful." **Best labeling schema you have** — map each Lowest-quality criterion to a rule, use the PQ ladder as the severity scale. Free, no IP risk.

### 4. LLM dataset-cleaning heuristics ⭐ HIGHEST VALUE (open-source spam filters with published thresholds)
- **FineWeb** (https://arxiv.org/html/2406.17557v1 ; ODC-By): 3 shipped filters — drop if fraction of lines ending in terminal punctuation ≤ 0.12; drop if ≥ 0.10 of chars in duplicated lines; drop if ≥ 0.67 of lines < ~30 chars.
- **C4** (https://arxiv.org/abs/2104.08758): remove lines with "javascript"; drop docs with "lorem ipsum" / curly brace `{` / "terms-of-use" / "cookie policy". **FP lesson:** FineWeb dropped C4's terminal-punctuation rule (nuked ~30% of tokens for no gain). LDNOOBW badwords list (https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words) — ⚠️ documented dialect bias (https://knowingmachines.org/publications/9-ways-to-see/essays/c4); use as a signal, not a hard filter.
- **Gopher** (https://arxiv.org/pdf/2112.11446): word count 50–100,000; mean word length 3.0–10.0 chars; symbol-to-word ratio (# and …) ≤ 0.10; ≤ 0.90 lines bullet-started; ≤ 0.30 lines ellipsis-ended; ≥ 0.80 words contain an alpha char; ≥ 2 stop-words present. Plus repetition filters: duplicate line/paragraph fraction, top-n-gram fraction, duplicate-n-gram fractions n=2…10.
- **Dolma** (https://arxiv.org/pdf/2402.00159 ; Apache-2.0, `pip install dolma`): reimplements Gopher + C4; ablation finds "C4 NoPunc alone outperforms C4-All and Gopher-All." **Cleanest reference impl to port to TS.**
- **RefinedWeb** (https://arxiv.org/pdf/2306.01116): maintained ~4.6M-domain blocklist, URL-pattern filtering, trafilatura extraction. Domain-blocklist concept → "known-spam-host" check.

### 5. Link graphs
- **OpenPageRank** (https://www.domcop.com/openpagerank/): free 10M-domain authority scores (1GB CSV) + API, recomputed ~quarterly from Common Crawl. **Directly usable** domain-authority baseline (flag low-authority hosts publishing high-volume pSEO). Attribution required.
- **Common Crawl host/domain webgraph** (https://commoncrawl.org/): free monthly graphs (harmonic centrality, PageRank); raw input, no spam annotations.

### 6. Labeled eval corpora (validation, not runtime)
- **WEBSPAM-UK2006/07** (http://chato.cl/webspam/datasets/): host-level human spam/nonspam labels + content/link features + webgraph. Free research license. Old (2006/07) → validation-only.
- **Waterloo ClueWeb09/12 spam rankings** (https://github.com/UWaterlooIR/spam-rankings , https://www.mansci.uwaterloo.ca/~msmucker/cw12spam/): per-doc "fusion" spam percentile (0 = spammiest). Scores free; corpus needs a license. Correlate your risk score against the percentiles.

### 7. AI/scaled-content detection corpora (adjacent)
**RAID** (https://github.com/liamdugan/raid , 6M+ generations, adversarial), **HC3**, **M4**. Open. Not pSEO-specific — general human-vs-AI. No public labeled programmatic-SEO doorway corpus found. Closest proxies: the leak's `ractorScores`/`contentEffort` and FineWeb's list-heavy/template-repetition filters.

### Recommendation
1. **Ship now (port to TS):** Gopher 7 quality + repetition filters, FineWeb's 3 filters, C4 boilerplate rules minus terminal-punctuation. Reference: the `dolma` pipeline. Free, legally clean, threshold-complete.
2. **Rule taxonomy / severity:** map rule IDs to leak vocabulary (`keywordStuffingScore`, `OriginalContentScore`, `contentEffort`, `siteFocusScore`/`siteRadius`, `titlematchScore`, `anchorMismatchDemotion`, `ractorScores`) and to Quality-Rater Lowest-quality criteria.
3. **Authority signal:** OpenPageRank CSV.
4. **Validate/calibrate:** correlate risk score with Waterloo percentiles + WEBSPAM host labels; add a RAID-trained AI-text signal as one input.
5. **Document FP lessons:** FineWeb's terminal-punctuation reversal and LDNOOBW dialect bias — justify conservative thresholds.
