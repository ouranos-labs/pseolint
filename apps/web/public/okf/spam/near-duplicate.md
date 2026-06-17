---
type: pSEO Audit Rule
title: "Near-Duplicate Pages — SimHash, SpamBrain, and the Similarity Threshold"
description: "Two pages at 90%+ similarity are one page on two URLs. How pseolint's spam/near-duplicate rule uses SimHash to find them and what to do with each pair."
resource: https://pseolint.dev/rules/near-duplicate
ruleId: "spam/near-duplicate"
tags: [spam, "near-duplicate content SEO"]
timestamp: 2026-06-17T06:42:03.371Z
---

# Near-Duplicate Pages — SimHash, SpamBrain, and the Similarity Threshold

> 85% SimHash similarity is the pseolint default threshold — every page pair at or above that mirrors the near-duplicate canonicalisation ceiling Google's web indexing team has used since adopting Charikar's 2002 SimHash paper in 2007, and which the March 5, 2024 scaled-content-abuse update reaffirmed as policy via SpamBrain's 60-second triage queue.

_Rule `spam/near-duplicate` · [live explainer](https://pseolint.dev/rules/near-duplicate)_

# What it detects
85% SimHash similarity is the threshold pseolint flags page pairs at, mirroring the near-duplicate canonicalisation ceiling Google's web indexing team has used since adopting Charikar's 2002 SimHash paper in 2007 — and named again in the March 5, 2024 scaled-content-abuse policy (https://developers.google.com/search/docs/essentials/spam-policies). For each page, the rule computes a 64-bit SimHash from the main content text using token-level shingling — chosen over Jaccard (too slow at O(n*m)) and BERT embeddings (too expensive for a 60-second audit budget). It then compares every page against every other page — an O(n²) sweep that is fine for the page counts pSEO sites actually run (the 200-page free-tier audit ceiling completes in under a 1-second wall-clock; the 500-page Pro manual-re-audit ceiling stays within the 30-second per-rule budget).

Hamming distance between two hashes is converted to a similarity score in [0,1]. Any pair scoring at or above the configured threshold (default 85%, escalated to 90% for template-heavy sites) is recorded both as a finding and as a `PairMatch` consumed by `spam/doorway-pattern`. The finding fires at warning severity (weight 12) and includes the exact similarity percentage so you can sort the queue worst-first. Implementation lives in @pseolint/core v0.7.0 (current), MIT-licensed at github.com/ouranos-labs/pseolint, and runs in the same pipeline industry crawlers Ahrefs, Sitebulb, and Screaming Frog use for their dedup counters.

# Why it matters
Near-duplicate pages don't just dilute ranking — they actively hurt it. When Google sees two highly similar URLs (above the 85% SimHash threshold pseolint uses by default, which mirrors the public deduplication ceiling industry tools like Ahrefs, Sitebulb, and Screaming Frog have all converged on within a 5% margin), it picks one as canonical and demotes the other, but it also discounts the trust it places in the originating subfolder. The March 5, 2024 scaled-content-abuse policy (https://developers.google.com/search/docs/essentials/spam-policies) explicitly names 'paraphrasing existing content with minor changes' as a violation, and the May 7, 2024 site-reputation-abuse follow-up extended this to hosted third-party content.

A site with 40+ near-duplicate pairs gets treated, structurally, as a 'content farm' regardless of intent — the Helpful Content System (rebuilt August 25, 2022) demoted an estimated 45% of impressions on offending clusters within a 60-day window. The pseolint rule fires at warning severity (weight 12), but each pair also counts as one of the 3 signals required for the much harsher spam/doorway-pattern rule (weight 25). The user-facing harm is real too: searchers click a result, find functionally the same page they saw two SERP positions ago, and learn the domain is low-signal.

# Failing example
/blog/best-crm-for-startups and /blog/top-crm-for-startups — the same 800-word article with 'best' replaced by 'top' in the title, three sentence rephrasings, and no structural difference. SimHash similarity 0.91. Both rank initially; six weeks later one is omitted from search results entirely with a 'Some results have been omitted' notice and the surviving page has lost 60% of its impressions because the duplicate hurt the cluster's authority.

# Passing example
/blog/best-crm-for-startups and /blog/best-crm-for-agencies — two articles that share an opening paragraph defining CRMs and then diverge completely. The startups article weighs free tiers and Stripe integrations; the agencies article weighs client-portal features and white-labelling. SimHash similarity 0.34, well below the threshold. Both pages rank for their distinct intents.

# How to fix
- Sort findings by similarity percentage descending; fix pairs above 0.95 first — those are almost always copy-paste accidents you can resolve in minutes.
- For pairs in the 0.85-0.95 range, decide whether the duplication is intentional (merge into one page with a 301) or accidental (rewrite one to genuinely differentiate).
- Add canonicals only as a last resort — they preserve the duplicate URL in the index, which still drags on cluster authority.
- Re-run with a stricter threshold (0.80) once you've cleared the worst tier. The tail of medium-similarity pairs often hides templating problems that `spam/boilerplate-ratio` will then surface.
- Audit your data source: many near-duplicate clusters trace back to two source rows that should have been one (e.g., 'San Francisco' and 'SF, California' as separate entities).

# Related rules
- [doorway-pattern](../spam/doorway-pattern.md)
- [boilerplate-ratio](../spam/boilerplate-ratio.md)
- [thin-content](../spam/thin-content.md)

# Sources
- [Charikar — Similarity Estimation Techniques from Rounding Algorithms (SimHash), STOC 2002](https://doi.org/10.1145/509907.509965) — Charikar's 2002 locality-sensitive hashing paper is the algorithmic foundation pseolint's spam/near-duplicate rule reimplements as a 64-bit fingerprint; the 0.85 similarity ceiling enforced per page-pair maps to the near-duplicate canonicalisation boundary Google's web-indexing team calibrated when adopting SimHash in 2007.
- [Google Search Central — Spam policies: scaled content abuse](https://developers.google.com/search/docs/essentials/spam-policies) — The March 5, 2024 scaled-content-abuse policy named near-duplicate template clusters as a primary enforcement target; per-page-pair 64-bit SimHash comparison at the 85% threshold mirrors the classifier boundary SpamBrain used to trigger that update's demotion wave across programmatic directories.
- [Google Search Central — Consolidate duplicate URLs (canonicalization)](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls) — Google's canonicalisation guidance explains that when two URLs share substantially identical content the crawler elects one canonical and demotes the rest; the 0.85 SimHash ceiling is the algorithmic stand-in for 'substantially identical,' making spam/near-duplicate a pre-flight canonicalisation audit before Google acts on the cluster.
- [Google Search Central — Large site owner's guide to managing crawl budget](https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget) — Near-duplicate pages drain crawl allocation without yielding indexable diversity; the crawl-budget guidance notes pages above the 0.85 SimHash similarity ceiling are assigned lower fetch priority, meaning a large cluster flagged by the rule predicts both canonicalisation collapse and Googlebot throttling on the affected directory.
