---
type: pSEO Audit Rule
title: "Snippet Suppression: How nosnippet Removes a Page From AI Answers"
description: "nosnippet and max-snippet:0 do more than blank a SERP description; they make the page ineligible for AI Overview citation. What tech/snippet-suppression reports and why."
resource: https://pseolint.dev/rules/snippet-suppression
ruleId: "tech/snippet-suppression"
tags: [tech, "nosnippet AI Overviews"]
---

# Snippet Suppression: How nosnippet Removes a Page From AI Answers

> A page carrying `nosnippet` or `max-snippet:0` in any robots source forfeits its SERP description and its eligibility to be cited in AI Overviews and answer engines at the same moment, which is why tech/snippet-suppression reports every such URL at warning severity while deliberately leaving `max-snippet:-1` and every positive character budget untouched.

_Rule `tech/snippet-suppression` · [live explainer](https://pseolint.dev/rules/snippet-suppression)_

# What it detects
Robots directives are collected from the same three declaration sites the conflict check reads: every `<meta name="robots">` tag, every `<meta name="googlebot">` tag, and the `X-Robots-Tag` response header when it is non-empty. Each content string is split on commas and its tokens are trimmed and lowercased. Exactly two token shapes qualify as snippet killers, the bare directive `nosnippet` and `max-snippet:0` with whitespace tolerated on either side of the colon. When at least one source carries either shape, a warning-severity, high-confidence finding names the URL and lists every source that suppressed it, so a recipe page blocked by both a meta tag and a header reports both rather than collapsing them into one.

Two things deliberately do not fire. `max-snippet:-1`, which means unlimited, passes, and so does any positive budget such as `max-snippet:160`, because the rule is testing for suppression rather than for length. And `data-nosnippet` attributes in the body are counted, not condemned: the rule tallies every occurrence of the attribute in the raw HTML and emits an info-severity finding stating the count, on the reasoning that hiding a legal disclaimer or a subscription prompt from snippets is a defensible thing to do. That finding exists to make partial suppression visible before someone wraps an ingredient list in it, and its fix text asks you to review each region rather than strip them all.

# Why it matters
Blocking snippets to deter scrapers is a trade that stopped paying. The directive was designed when the only consumer of a snippet was a SERP result, and its cost was a blank description under a blue link. AI Overviews and answer engines changed that arithmetic: a page that cannot be excerpted cannot be quoted, cannot be attributed, and cannot appear as a source link inside a generated answer. The scraper still copies the recipe, because scrapers do not parse robots directives. The only party that honours `nosnippet` is the party that would have sent the traffic.

Recipe publishing is where the mismatch cuts deepest. Cooking queries are overwhelmingly answer-shaped, asking for oven temperature, substitution ratios, proof times and doneness targets, and those are exactly the extractable figures an AI Overview surfaces with a citation attached. A publisher who ships `nosnippet` across 2,400 recipe URLs keeps the blue links and hands every one of those citation slots to a competitor whose identical 325°F figure is still quotable. Rich-result imagery driven by structured data can keep rendering while the text disappears, which makes the loss harder to spot: the carousel thumbnail still shows up, so the page looks like it is performing while its prose has quietly stopped being eligible for any answer panel.

# Failing example
A recipe publisher adds `<meta name="robots" content="index, follow, nosnippet">` to its base template after a scraper republishes 60 of its recipes, and the directive propagates to all 2,400 recipe URLs plus 180 technique guides. pseolint returns 2,580 warning-severity findings naming `meta robots` as the suppressing source. The braised-short-ribs page still holds position 4 for its head term, shows no description text, and its 325°F / 3-hour figures no longer appear in any AI Overview citation.

# Passing example
The same 2,580 URLs after the template drops `nosnippet` for `<meta name="robots" content="index, follow, max-snippet:-1">`, with `data-nosnippet` retained on exactly 2 regions per page, the affiliate-disclosure line and the newsletter prompt. pseolint returns zero warnings and 2,580 info findings each reporting a count of 2. Scraping is handled where it belongs, in rate limiting and a takedown process, and the 325°F figure is quotable again.

# How to fix
- Replace `nosnippet` with `max-snippet:-1` so the page is explicitly eligible for unlimited excerpting instead of relying on an implicit default.
- Inspect the HTTP response headers as well as the template: a CDN worker adding `X-Robots-Tag: nosnippet` keeps the page suppressed long after the meta tag is corrected.
- Fight scraping with rate limiting, bot fingerprinting and takedown notices, because robots directives are honoured by the crawlers that send traffic, not by the ones that copy content.
- Scope `data-nosnippet` to affiliate disclosures, subscription prompts and legal boilerplate, and never wrap ingredient quantities, temperatures or step timings in it.
- Watch the info-severity `data-nosnippet` counts after every template change: a count jumping from 2 to 9 per page means a shared component started wrapping body content.
- If a snippet length cap is a genuine business requirement, set a real character budget rather than 0, since any value above zero leaves the page citable.

# Related rules
- [meta-robots-conflict](../tech/meta-robots-conflict.md)
- [crawler-access](../aeo/crawler-access.md)
- [faq-coverage](../aeo/faq-coverage.md)

# Sources
- [Google Search Central: Robots meta tag, data-nosnippet, and X-Robots-Tag](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag): The robots meta tag specification defines nosnippet and the max-snippet family, including -1 for unlimited; pseolint's snippet-killer test matches only the bare nosnippet token and max-snippet:0, leaving every positive character budget and the unlimited value alone.
- [Google Search Central: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features): Google's AI-features guidance ties AI Overview citation eligibility to ordinary snippet eligibility, which is the exact mechanism by which a recipe publisher's anti-scraper nosnippet removed 2,400 URLs from the pool of sources a generated answer can quote and link.
