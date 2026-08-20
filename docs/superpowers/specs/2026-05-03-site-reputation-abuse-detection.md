# Site Reputation Abuse Detection: Design Proposal

**Status:** shipped in v0.5.1 (2026-05-03)
**Date:** 2026-05-03
**Author:** pseolint maintainers

**Implementation notes:**
- Rule lives at `packages/core/src/rules/links/host-section-divergence.ts`.
- Added a "minority section only" gate (section size < corpus/2) to avoid
  symmetric findings on both halves of a binary section split. A 50/50 split
  is treated as a multi-topic site, not abuse.
- Suppressed for non-pSEO sites via `PSEO_ONLY_RULE_IDS`.
- Reference URL: `https://developers.google.com/search/docs/essentials/spam-policies#site-reputation`.

## Why

pseolint's marketing surfaces (homepage, `state-of-pseo-2026`, `marketing-symptoms.ts`,
`abuse` page, tools page) prominently reference site-reputation-abuse, Google's
May 2024 spam-policy update targeting third-party content hosted under an
established host's reputation (e.g. coupon sections inside news domains). The
audit engine currently has no rule that detects this pattern. Either we ship
detection, or we trim the marketing.

The user's own `state-of-pseo-2026` page predicts: *"Expect 2027 enforcement to
extend to first-party programmatic content that is structurally indistinguishable
from rented inventory."* That extension is exactly what a graph-aware pSEO linter
should be in position to flag.

## What we're detecting

Site-reputation-abuse manifests as one or more **sub-corpora** within a host that
behave like a different site than the host's primary content. Concretely:

1. **Section-isolation.** Pages under a path prefix (`/coupons/`, `/deals/`,
   `/best-of/*`) link densely *within* the prefix but receive few inbound links
   from the rest of the host's graph.
2. **Topic divergence.** Top TF-IDF terms inside the prefix differ sharply from
   the host's primary content.
3. **Template/structure divergence.** DOM `structureSignature` and template
   matrices inside the prefix differ from the host's modal template.
4. **Authorship/E-E-A-T divergence.** The prefix has different (or missing)
   `author` schema, byline patterns, or about-page links compared to the host.

Any single signal alone has too many legitimate explanations (e.g. a docs section
inside a marketing site). The rule fires only when **multiple signals stack** for
a sub-corpus that exceeds a minimum size.

## Proposed rule: `links/host-section-divergence`

Severity: `warning` (escalates to `error` when 3+ signals stack and the section
has >50 pages, that's the rented-inventory pattern Google penalizes most often).

### Algorithm

1. **Section discovery.** Group all crawled pages by their first non-trivial
   path prefix (`/{first}/...`). Sections with <10 pages are excluded, sub-
   corpus signals are unreliable below that.

2. **Per-section signals.** For each candidate section vs. the rest of the host:

   - `inboundExternalRatio`: fraction of section pages with at least one
     inbound internal link from *outside* the section. Signal trips when
     `< 0.20`.
   - `topicJaccard`: Jaccard distance between the section's top-100 TF-IDF
     terms and the host-wide top-100. Signal trips when `> 0.75`.
   - `templateOverlap`: fraction of section pages whose `structureSignature`
     matches a signature also seen in the rest of the host. Signal trips when
     `< 0.10`.
   - `authorshipMismatch`: boolean: section has byline/author-schema coverage
     <30% while the host's other sections have >70% (or vice versa). Signal
     trips when true.

3. **Stacking.** Findings only emit when ≥2 signals trip on the same section.

4. **Output shape.**

   ```json
   {
     "ruleId": "links/host-section-divergence",
     "severity": "warning",
     "message": "Section /coupons/ (84 pages) diverges from the rest of the host on 3 signals: inboundExternalRatio=0.07, topicJaccard=0.82, authorshipMismatch=true.",
     "fix": "Either (a) integrate this section editorially with the rest of the host (cross-link from primary nav, share authorship/schema, align template) or (b) move it to a subdomain so it builds reputation on its own. Google's May 2024 site-reputation-abuse policy targets sections that ride a host's reputation without integrating into it.",
     "relatedUrls": [...up to 20 sample URLs...]
   }
   ```

### Scope

- `RuleScope`: `corpus` (needs the full link graph, term frequencies, and
  structure signatures).
- Diff-mode: skipped (corpus rule).
- Bucket: `spam` (it's a scaled-content-abuse-adjacent signal: the host is
  effectively running two corpora, one of which behaves like the rule's other
  spam targets).
- `PSEO_ONLY_RULE_IDS`: yes: small editorial sites should not trip this.

### Why two signals, not three

Three-of-four would be safe but would miss the most common rented-inventory
shape: a coupon/deals section that's well-cross-linked internally to itself
(beating `inboundExternalRatio` alone) but uses a different template and
different authorship pattern (signals 3 and 4 trip). The two-signal floor with a
size gate of 10 pages keeps false positives manageable while catching that
shape.

## Implementation cost

- **New file:** `packages/core/src/rules/links/host-section-divergence.ts` (~150
  LOC).
- **Auditor wiring:** ~10 LOC in `auditor.ts`, plus default thresholds in
  `DEFAULTS`.
- **Scope map:** 1 entry in `rules/scope.ts`.
- **Score weighting:** belongs in `spam` bucket; no weight changes needed.
- **Ruleset version:** bump (rule logic added → bump per
  `ruleset-version.ts` policy).
- **Tests:** ~6 unit tests covering each signal, the stacking gate, the size
  gate, and a host with no divergence (shouldn't fire).
- **README:** new row in the SpamBrain Risk Detection table.
- **Estimated effort:** 1–2 days end-to-end including tests and review.

## Open questions

1. Should `links/host-section-divergence` live in `links/` or `spam/`? It's a
   link-graph signal but its policy target is in `spam`. Recommend `links/`
   because it scopes naturally with the other graph-shape rules.

2. Should section discovery use deeper prefixes (e.g. `/blog/2024/`)? First
   suggestion: no, start with the first path segment. Deeper prefixes can be a
   v2 if false positives demand it.

3. How to handle subdomains? Currently pseolint normalizes against a single
   host. Cross-subdomain reputation is out of scope for v1 of this rule.

4. Score weight: drop into `spam` bucket as-is (current weight 0.40 of total),
   or carve out a small standalone slice? Recommend in-bucket, keeps the score
   formula stable.

## Alternative: trim the marketing instead

If we don't ship this, the marketing references to site-reputation-abuse on
the homepage, `state-of-pseo-2026` page, and `marketing-symptoms.ts` should be
softened to make clear that pseolint flags the *adjacent* signals
(boilerplate-ratio, template-coverage, link-graph isolation) rather than the
abuse pattern directly. Risk of leaving as-is: a savvy reader notices the
absence and the credibility argument we make against overstated SEO tools turns
on us.

## Decision needed

- [ ] Ship the rule (estimated 1–2 days): recommended path
- [ ] Trim marketing to match current detection scope
- [ ] Defer (note: each month deferred extends the window where the marketing
      claims something the engine doesn't enforce)
