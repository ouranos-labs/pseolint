---
type: pSEO Audit Rule
title: "robots.txt Limits: The 500 KiB Cutoff and Four Directives Google Ignores"
description: "Google parses the first 500 KiB of robots.txt and drops the rest, and noindex: lines there have done nothing since September 2019. Inside tech/robots-txt-limits."
resource: https://pseolint.dev/rules/robots-txt-limits
ruleId: "tech/robots-txt-limits"
tags: [tech, "robots.txt size limit"]
---

# robots.txt Limits: The 500 KiB Cutoff and Four Directives Google Ignores

> 500 KiB is the hard ceiling: Google parses the first 512,000 bytes of a robots.txt file and silently ignores every rule beyond it, so tech/robots-txt-limits measures the file's UTF-8 byte length and raises a warning the moment a generated faceted-navigation file crosses that line, then separately reports the four directives Google's parser never supported.

_Rule `tech/robots-txt-limits` · [live explainer](https://pseolint.dev/rules/robots-txt-limits)_

# What it detects
Two independent checks run against the fetched robots.txt, and an empty or absent file short-circuits both before either executes. The first measures the content's UTF-8 byte length, bytes rather than characters, so multibyte path segments in localised Disallow lines count for more than their character count suggests, and compares it against 500 KiB, which is 512,000 bytes exactly. Above that, a warning-severity, high-confidence finding reports the measured byte count alongside the limit and states that every rule past the cutoff is dropped. Its fix text points at wildcard consolidation of repetitive Disallow patterns and at relocating per-page exclusions onto the pages themselves.

The second check scans line by line for four directives Google's parser does not support, matching them only when they lead the line ahead of the colon: `noindex`, `crawl-delay`, `nofollow` and `host`. Whichever are present roll up into a single finding rather than one per line, each annotated with the reason it does nothing, so `crawl-delay` is marked as ignored by Google though honoured by Bing, `nofollow` as not a robots.txt directive at all, and `host` as unsupported with canonical URLs or redirects named as the replacement. Severity on this finding is conditional: it sits at info when only the harmless three appear, and escalates to warning as soon as `noindex` is among them, because that is the one an operator is likely to believe is working.

# Why it matters
Faceted navigation is the workload that breaks robots.txt. A marketplace carrying 40 brands, 18 sizes, 12 colours and 9 price bands mints parameter permutations faster than any exclusion list can enumerate them, and the standard response, a build step appending one line per discovered facet URL, turns a configuration file into a growing artefact. At 700 KiB, roughly 200 KiB of that file sits past the point Google reads. Which 200 KiB is determined by the generator's ordering, which usually means alphabetical, which usually means the facets nobody thought about are the ones still being crawled.

The `noindex:` lines are the more serious half. Google announced on July 2, 2019 that it would stop supporting the directive, and did so on September 1, 2019. A URL listed under `noindex:` in robots.txt has since been crawlable and indexable exactly as if the line were absent. An operator reading their own robots.txt sees thousands of facet URLs apparently excluded; Search Console shows them indexed. The two views never reconcile, because one of them describes a directive the parser discards. Meanwhile the crawl spend on `?colour=navy&size=11&sort=price_asc` permutations is real, and it comes out of the same allocation the actual product pages need.

# Failing example
marketplace.example generates robots.txt from its facet index at build time: 11,400 `Disallow:` lines and 6,900 `noindex:` lines covering filtered category URLs, 717,312 bytes in total. pseolint returns two findings, a warning that the file is 717,312 bytes against the 512,000-byte limit with roughly 205,000 bytes never parsed, and a second warning for the unsupported `noindex` and `crawl-delay` directives. Every facet URL the team believed was excluded is indexed, and 40 of them outrank the canonical category pages.

# Passing example
The same marketplace after the generator is replaced by 9 wildcard patterns, `Disallow: /*?*colour=`, `Disallow: /*?*sort=` and 7 siblings, bringing robots.txt to 2,144 bytes and well inside the 512,000-byte budget. The 6,900 `noindex:` lines are deleted and the exclusions they were meant to express move to `<meta name="robots" content="noindex, follow">` rendered on the filtered views themselves, while `crawl-delay` is dropped. pseolint returns no findings for the rule.

# How to fix
- Measure the file in bytes rather than lines: `curl -s https://example.com/robots.txt | wc -c` tells you immediately whether you are anywhere near 512,000.
- Collapse per-URL Disallow lines into wildcard patterns keyed on the query parameter name rather than its values, so one `/*?*colour=` line replaces every colour permutation.
- Delete every `noindex:` line, since it has had no effect since September 2019, and re-express the intent as a robots meta tag or an X-Robots-Tag header on the filtered pages.
- Decide per facet whether you want it crawled-but-not-indexed or not crawled at all, because a Disallow blocks the fetch and therefore stops Google ever seeing a noindex tag on that URL.
- Keep `crawl-delay` only where Bing traffic justifies it, and use Search Console's crawl-rate controls for Google, which ignores the directive entirely.
- Add a build-time assertion that fails CI when robots.txt exceeds a byte budget you set comfortably below the 512,000-byte cutoff.

# Related rules
- [crawler-access](../aeo/crawler-access.md)
- [meta-robots-conflict](../tech/meta-robots-conflict.md)
- [url-pattern](../cannibal/url-pattern.md)

# Sources
- [Google Search Central: How Google interprets the robots.txt specification](https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt): Google's robots.txt specification documents both halves of this rule: the 500 KiB parse ceiling of 512,000 bytes beyond which rules are ignored, and the directives its parser does not support, with noindex unsupported since September 1, 2019.
- [Google Search Central: Large site owner's guide to managing crawl budget](https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget): The large-site crawl-budget guidance names faceted navigation as a leading source of wasted crawling, which is why a 717 KiB generated exclusion list is treated here as evidence of an unbounded URL space rather than merely a file-size problem.
