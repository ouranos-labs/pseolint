# Rule design audit (post unique-value): 2026-06-16

Applied the `unique-value` lens (binary thresholds / absolute counts on relative
quantities / crude heuristics / markup-presence-not-quality / FP bias on
reputable sites) to all 47 other rules. Tally: **13 NEEDS-REDESIGN, 21 MINOR,
13 SOUND**. Full per-rule findings: `.pseolint/rule-review/*.json` (gitignored).

The 34 issues collapse into **6 root causes**. Fixing the cause beats fixing 34
symptoms.

## Root cause A: Crawl-sampling blind spot (FALSE POSITIVES) ⭐ highest value
Rules draw absolute conclusions from the *crawled subset*; on a sampled / pinned
audit the real data is in uncrawled pages, so they fire on healthy sites.
- **links/orphan-pages**: fires `error`; the `sampled` flag (already wired into
  link-depth) was never passed here. Max score damage. Fix: wire `sampled`,
  demote to `warning` when sampled. **S, bug.**
- **links/cluster-connectivity**: same missing `sampled` guard; cross-cluster
  links to uncrawled targets read as silos. **S.**
- **tech/canonical-consistency**: the live "58 findings" FP: canonicals point at
  prod host, crawl seeded elsewhere → one "outside crawl scope" per page. Fix:
  collapse same-alternate-host to one site finding; dedup HTTP-vs-HTML. **M.**
- **tech/sitemap-completeness**: sitemap URLs not run through `normalizeAuditUrl`
  → trailing-slash/query mismatches read as "missing"; `error` on sampled. **M.**
- (minor) links/dead-ends, host-section-divergence inbound ratio: same artifact,
  mitigated by `warning` / 2-of-4 gate.

## Root cause B: Severity/confidence mismatch (FALSE POSITIVES) ⭐
`error`/`critical` on weak, forecast, or low-coverage signals, no confidence band.
- **spam/thin-content**: medium-confidence band still `error` though the rule
  says the page "could legitimately be short". **S.**
- **spam/near-duplicate**: `critical` on every pair ≥0.85 (partly mitigated by a
  downstream auditor override; a band removes the need). **S.**
- **spam/entity-swap**: `critical` even when entity-mask coverage is low (it then
  is just near-duplicate). **M** (emit coverage, demote).
- **aeo/summary-bait**: `error` on a self-described "forecast". **S.**
- **tech/soft-404**: `error` on a narrow `wordCount<50 AND title~pattern` AND-gate.
- **content/translation-no-op**: `error` on a hard 0.95 SimHash.

## Root cause C: Binary threshold on a continuous/relative quantity (the literal unique-value class)
Instability / shuffling + corpus-size bias. Higher effort (each is a real redesign).
- **spam/boilerplate-ratio**: 80% skeleton cutoff is a hard flip; add/remove a
  page reshuffles all ratios. Fix: graded block weight (freq/N) + band. **M.**
- **spam/template-diversity**: exact tag-count `structureSignature` is brittle (one
  ad `<div>` → distinct sig → FN) + hard 0.35. NOTE: `structureSignature` is SHARED
  with near-duplicate + doorway-pattern → high blast radius; redesign carefully. **L.**
- **content/value-add**: binary 1/7 grid of upstream rules + hard 0.5; duplicates
  eeat logic. Largely improves if its inputs become graded. **M.**
- **content/wikipedia-paraphrase**: 0.4 on a page-length-dependent bloom hit-rate
  (~91% bloom-noise FP on short pages) + topic-vocab conflation (over-fires on
  legal/medical pSEO, note: paperforge.dev is legal). Fix: length guard + topic
  baseline, or demote to advisory. **M/L.**
- (minor) data/data-binding + data/identical-across-pages: absolute field/page counts.

## Root cause D: Presence-not-quality (FALSE NEGATIVES: junk passes)
Lower urgency than A/B (too lenient, not too aggressive).
- **schema/required-fields**: whitespace/`false`/`'TBD'`/`[]` pass; only 3 types.
- **schema/json-ld-valid**: any non-empty `@type` passes; `http://schema.org` ok'd;
  array `@type` wrongly rejected.
- **tech/og-completeness**: space-only content passes; no severity gradation.
- **content/eeat-signals**: substring match in footer/JS; `/about` matches outbound.

## Root cause E: Site-wide vs per-cluster scoping (FALSE POSITIVES) ⭐
- **schema/consistency**: fires on ANY multi-`@type` site (a homepage + blog +
  product = guaranteed FP). Fix: group by `structureSignature` cluster, flag
  `@type` variance only WITHIN a cluster. **M.** (Seen live on pseolint.dev.)
- (minor) spam/template-coverage: Cartesian denominator treats correlated slug
  segments as independent dimensions → phantom sparse coverage.

## Root cause F: Correctness bug
- **aeo/crawler-access**: robots parser records `Disallow` but ignores `Allow`;
  `Disallow: / / Allow: /public/` (or allow-all WAF default) reported as fully
  blocked → `error`/high FP. RFC 9309 specificity tie-break needed. **M.**

## Challenged / skipped (not worth a fix)
- tech/redirect-chain "2-hop should warn": threshold opinion; 2 hops is tolerable.
- spam/publication-velocity "silent zero when no dates": no data = no finding is
  correct; a "skipped" notice is cosmetic.
- cannibal/url-pattern O(n²): real but only a perf note; add a scale guard if it
  bites, not a redesign.

## Recommended v0.7.1 scope: "stop the false positives"
The calibration North Star is *don't flag sites that win*. Root causes **A + B + E
+ F** are almost all FALSE-POSITIVE eliminations, mostly **S/M**, and several are
outright bugs (orphan/cluster `sampled` gap, crawler-access `Allow`). Ship those.
Defer **C** (unique-value-class redesigns, real but higher effort/blast-radius,
esp. template-diversity's shared signature) and **D** (presence-quality, false
*negatives*) to v0.7.2. Each v0.7.1 rule fix follows the unique-value playbook:
TDD + validate against the reputable-pSEO fixtures before shipping.
