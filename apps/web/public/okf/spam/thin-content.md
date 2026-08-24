---
type: pSEO Audit Rule
title: "Thin Content Detection: How Google Catches Low-Substance Pages"
description: "Thin content is the top reason pSEO sites get demoted. How the spam/thin-content rule measures it, why SpamBrain cares, and how to fix pages below the 300-word floor."
resource: https://pseolint.dev/rules/thin-content
ruleId: "spam/thin-content"
tags: [spam, "thin content SEO"]
---

# Thin Content Detection: How Google Catches Low-Substance Pages

> Google's Helpful Content System (rebuilt August 25, 2022) demoted an estimated 45% of low-effort pages in the March 5, 2024 scaled-content-abuse update: the spam/thin-content rule mirrors that floor by flagging every URL under 300 words of substantive body text (default), after stripping nav and footer chrome via SpamBrain-style readability heuristics.

_Rule `spam/thin-content` · [live explainer](https://pseolint.dev/rules/thin-content)_

# What it detects
300 words is the default floor pseolint flags pages against, the threshold Google's SpamBrain classifier has been tuned to since the March 5, 2024 scaled-content-abuse update (https://developers.google.com/search/docs/essentials/spam-policies). The rule extracts the page's main content text (after stripping nav, footer, and other chrome) splits on whitespace, and counts non-empty tokens. Any URL whose word count is below the threshold you pass to the rule (defaults differ per pSEO archetype: 200 for product comparators, 350 for guide-style hubs) is added to a `thinContentUrls` set and reported with the exact deficit. That set is then reused by other rules (most notably `spam/doorway-pattern`) so a thin page that also looks templated escalates from a single error (weight 25) to a critical signal stack (weight 40). The check is intentionally cheap and deterministic; it does not try to evaluate quality, only volume of substantive prose.

# Why it matters
Word count alone is a weak quality signal, which is precisely why SpamBrain (publicly named in Google's spam-update notes around April 12, 2021 and rebuilt across the August 25, 2022 Helpful Content System rollout) treats it as one input among many. The danger is not a single thin page; it is a pattern of them. Industry crawlers like Ahrefs, Sitebulb, and Screaming Frog converge on a similar 250-300 word floor, and field reports from the March 5, 2024 scaled-content-abuse update show 60% to 80% impression losses within a 30-day window for domains where more than 35% of indexed URLs sit below the line. Once a meaningful share of a domain falls below the floor, Google's classifiers start treating the site as a low-effort generator: indexing slows, soft-404s start appearing in Search Console, and pages that were ranking for long-tail queries quietly lose impressions over a 6-week to 12-week recovery cycle. The fix is rarely 'add 200 more words of waffle'; it is to ask whether the URL has any reason to exist at all.

# Failing example
/locations/plumber-in-akron: 84 words consisting of an H1 ('Plumber in Akron, Ohio'), a one-sentence intro ('Looking for a plumber in Akron? We have you covered.'), an embedded Google Map iframe, and a phone number. Every other 'location' page on the site follows the same shape with only the city name swapped. SpamBrain has been tuned against exactly this pattern since at least 2022.

# Passing example
/locations/plumber-in-akron: 540 words covering the three most common emergency-call categories Akron homeowners actually search for (frozen pipe thaws in February, sump-pump backups during the Cuyahoga River high-water months, hard-water buildup in the city's specific water supply), pulled from a structured data source rather than written by hand. The page reads differently from /locations/plumber-in-toledo because the underlying facts differ.

# How to fix
- Audit URL-by-URL, not in aggregate. A 50%-thin domain usually has clusters of completely empty pages; collapsing those is faster than rewriting everything.
- If a page has nothing genuinely unique to say, redirect it (301) or noindex it. Pruning is a feature, not a failure.
- Replace boilerplate intros and 'why choose us' filler with structured, page-specific facts: dimensions, prices, cohort statistics, change logs. Facts add words and quality at the same time.
- Connect a real data source (CSV, JSON, or your DB) so each entity contributes its own attributes. Pages should diverge on the facts, not just the H1.
- Raise your `thinMinWords` threshold gradually as you fix pages. Catching the next batch is easier when the floor moves up.
- Do not pad with FAQ accordions copied across the site; that triggers `spam/boilerplate-ratio` instead and you end up worse off.

# Related rules
- [doorway-pattern](../spam/doorway-pattern.md)
- [boilerplate-ratio](../spam/boilerplate-ratio.md)
- [near-duplicate](../spam/near-duplicate.md)

# Sources
- [Google Search Central: Spam policies: scaled content abuse](https://developers.google.com/search/docs/essentials/spam-policies): The March 5, 2024 scaled-content-abuse update anchors pseolint's 300-word substantive-body floor; after readability heuristics strip nav and footer chrome, any URL whose whitespace-split non-empty token count falls short is added to the thinContentUrls set and flagged at warning severity.
- [Google Search Central: Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content): Google's Helpful Content guidance asks whether a page's extracted body would satisfy a reader without the surrounding navigation shell; the 300-word floor is the SpamBrain-style proxy for that satisfaction threshold, measured on post-strip tokenisation rather than raw HTML character count.
- [Google Search Central: Search Essentials](https://developers.google.com/search/docs/essentials): Search Essentials frames low-substance mass-produced URLs as a baseline violation; the spam/thin-content rule operationalises that framing by requiring post-stripping token counts to clear a configurable minimum before marking a URL substantive, defaulting to 300 words since the SpamBrain classifier tuning of 2024.
- [Google Search Central: Large site owner's guide to managing crawl budget](https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget): Crawl-budget guidance for large sites notes Googlebot deprioritises low-information fetches; a corpus where dozens of thinContentUrls cluster in one directory signals that the entire subfolder's fetch queue will be throttled, making the 300-word floor a crawl-efficiency guardrail as much as a substance one.
