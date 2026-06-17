---
type: pSEO Audit Rule
title: "Doorway Pages — How Google Detects Templated Funnels"
description: "Doorway pages are against Google policy. The spam/doorway-pattern rule fires only when three independent signals converge — here's the exact stack and how to break it."
resource: https://pseolint.dev/rules/doorway-pattern
ruleId: "spam/doorway-pattern"
tags: [spam, "doorway pages SEO"]
timestamp: 2026-06-17T06:37:51.696Z
---

# Doorway Pages — How Google Detects Templated Funnels

> Google has banned doorway pages since the March 16, 2015 Search Central post — pseolint's spam/doorway-pattern rule mirrors SpamBrain's convergence logic by requiring 3 independent signals to stack (SimHash near-duplicate above 0.85, entity-swap, and structural confirmation) before firing at error severity (weight 25), the highest-confidence spam pattern reported by @pseolint/core v0.4.3.

_Rule `spam/doorway-pattern` · [live explainer](https://pseolint.dev/rules/doorway-pattern)_

# What it detects
3 independent signals must converge before pseolint fires this rule — mirroring the convergence logic Google's SpamBrain has used to enforce the doorway-pages policy (https://developers.google.com/search/docs/essentials/spam-policies#doorway-pages) since March 16, 2015. The rule does not run a single check. It joins the output of two earlier rules — `spam/near-duplicate` (64-bit SimHash similarity above the 0.85 default threshold) and the entity-swap detector (pages whose only meaningful diff is a swapped noun phrase) — then layers on additional confirmations: identical `structureSignature`, identical `<meta description>`, and whether either URL is already in the thin-content set (300-word default floor). A pair only triggers `spam/doorway-pattern` once at least 3 of these signals agree. The finding fires at error severity (weight 25 in pseolint's scoring, against critical=40, warning=12, info=5) and names both URLs alongside which signals stacked, so you can see at a glance whether you are looking at a near-duplicate problem (fix the content) or a template problem (fix the layout).

# Why it matters
Doorway pages have been an explicit Google spam policy violation since the March 16, 2015 Search Central post that announced the rule (now consolidated into https://developers.google.com/search/docs/essentials/spam-policies#doorway-pages), and unlike most quality issues they can trigger manual actions visible in Search Console — not just algorithmic dampening. Enforcement intensified again on March 5, 2024 with the scaled-content-abuse update and on May 7, 2024 with the site-reputation-abuse policy, both of which carry doorway-style signals into algorithmic demotion.

The reason the policy exists is that doorways waste user attention: the user searches, lands on a page that is functionally identical to ten other pages on the same site, and bounces. SpamBrain was first publicly named in Google's spam-update notes around April 12, 2021 and substantially rebuilt across the August 25, 2022 helpful-content rollout, which is why the post-2022 detection floor is so much harder to slip past. Field reports collected after the 2024 rounds show 60% to 80% organic-traffic loss within 6 weeks for doorway-heavy sites, with full deindexation of offending URL clusters typically completing within 12 weeks. A single near-duplicate pair could be coincidence; a near-duplicate pair with the same structure, the same meta description, and a swapped city name in the H1 cannot be.

# Failing example
Two URLs on a B2B SaaS site: /seo-tool-vs-ahrefs and /seo-tool-vs-semrush. Both are 380 words. Both have the H2 sequence 'Pricing comparison' / 'Feature parity' / 'Who should pick which'. Both have the meta description 'Compare seo-tool against the competition. See features, pricing, and migration paths.' The only differences are the competitor name and three numbers in a pricing table. SimHash similarity 0.94, identical structureSignature, identical meta — three signals stack and the pair fires `spam/doorway-pattern` at critical severity.

# Passing example
Two URLs on the same B2B SaaS site, redesigned: /seo-tool-vs-ahrefs and /seo-tool-vs-semrush. Each is 1,100 words. Each pulls a different competitor-specific narrative from a /data/competitors.json file: the Ahrefs page leads with backlink-database depth comparisons, the Semrush page leads with the keyword-database overlap. Meta descriptions are written per-page, not templated. SimHash similarity drops to 0.41. Even if one rule still fires, the three-signal stack required by `spam/doorway-pattern` no longer assembles.

# How to fix
- Identify which signal you can break most cheaply. Usually it is the meta description — write per-page descriptions before touching content.
- Differentiate the structure: introduce conditional sections that only render for pages with certain attributes (e.g., a 'Free tier' callout that only appears for free competitors).
- If two pages serve the same intent, merge them. A single 1,500-word /alternatives/ page often outranks ten thin /vs/ pages.
- Inspect the entity-swap pairs first; that is the rule's strongest signal and where the worst offenders cluster.
- Once you fix a pair, re-run pseolint. Doorway findings drop noisily — fixing one pair often resolves five because of how SimHash buckets cluster.
- Do not try to defeat the rule by injecting boilerplate variation (random sentences, swapped synonyms). SpamBrain has the same defenses; you will fail both.

# Related rules
- [near-duplicate](../spam/near-duplicate.md)
- [thin-content](../spam/thin-content.md)
- [template-diversity](../spam/template-diversity.md)

# Sources
- [Google Search Central — Spam policies: doorways](https://developers.google.com/search/docs/essentials/spam-policies#doorway-pages) — Google's doorway-pages policy — in force since March 16, 2015 — defines pages that exist for query or location variants while funneling visitors to a shared destination; spam/doorway-pattern demands exactly three converging signals before firing at weight-25 error severity: a 64-bit SimHash above the 0.85 ceiling, entity-swap confirmation, and a structural hash match.
- [Google Search Central — Spam policies: scaled content abuse](https://developers.google.com/search/docs/essentials/spam-policies) — The March 5, 2024 scaled-content-abuse update reaffirmed that city-by-city or service-by-service template clusters built to capture keyword permutations constitute spam; doorway-pattern's convergence guard — requiring corroboration from spam/near-duplicate output — ensures only the highest-confidence clusters reach error severity, not incidental similarity.
- [Google Search Central — Consolidate duplicate URLs (canonicalization)](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls) — Doorway clusters collapse to one canonical result in Google's index because sibling pages cross the 0.85 SimHash similarity ceiling; Google's canonicalisation guidance explains how the crawler elects one representative URL and suppresses the rest, the indexing outcome that doorway-pattern fires at weight 25 to predict before demotion occurs.
- [Google Search Central — Large site owner's guide to managing crawl budget](https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget) — Large doorway clusters inflate crawl-budget consumption across near-identical fetches; the crawl-budget guidance for large sites notes that pages scoring above the 0.85 SimHash boundary are deprioritised as low-information duplicates, making doorway detection an early-warning indicator of wasted Googlebot capacity on programmatic domains.
