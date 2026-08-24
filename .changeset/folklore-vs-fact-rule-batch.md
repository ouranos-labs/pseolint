---
"@pseolint/core": minor
"pseolint": patch
---

Folklore-vs-fact rule batch: 11 new statically-checkable rules, each cross-referenced against a primary source (Google Search Central, sitemaps.org, ogp.me, Lighthouse), plus `docs/folklore.md`: the counterpart list of widely-repeated checks the primary sources contradict, which pseolint deliberately refuses to run (title/description character limits, "70-char og:description", meta keywords, sitemap priority/changefreq, word-count minimums).

New rules:

- **`links/crawlable-anchors`** (warning→error): links Google cannot follow: `<a>` without `href`, `javascript:` hrefs, onclick/router-attribute pseudo-links. Escalates to error when a page's navigation is effectively invisible to crawlers, the classic silent pSEO orphaning failure.
- **`tech/language-mismatch`** (error/warning/info): declared language (html `lang` / self-referencing hreflang) vs the Unicode script of the actual text, e.g. `lang="ja"` on Cyrillic content. Google indexes by *detected* language, so mismatched declarations silently break all targeting. The missing-`lang` finding is info by design and says explicitly that Google ignores the attribute for ranking.
- **`tech/hreflang-validity`** (warning): invalid hreflang codes (`en_US`, `jp`, `en-UK`) that Google silently ignores; validation via `Intl.DisplayNames` (no bundled ISO tables), with did-you-mean fixes (jp→ja, UK→GB).
- **`tech/meta-robots-conflict`** (error/warning): contradictory directives across meta robots / meta googlebot / `X-Robots-Tag`; Google applies the most restrictive, so an accidental `noindex` silently wins.
- **`tech/html-size`** (error/warning): HTML approaching Googlebot's crawl cutoff of 2 MB per file, uncompressed (the limit documented in the Feb 2026 Googlebot-doc revision, down from the widely-cited 15 MB). Per-file, not total page weight.
- **`tech/sitemap-hygiene`** (error/warning): cross-host sitemap URLs (dropped per sitemaps.org), unparseable URLs, and lastmod pathologies (future dates, unparseable values, ≥95% mass-identical timestamps; Google ignores lastmod it can't trust).
- **`tech/robots-txt-limits`** (warning/info): robots.txt beyond Google's 500 KiB parse limit; unsupported directives, with `noindex:`-in-robots.txt escalated (ignored since 2019, so pages are NOT excluded).
- **`tech/snippet-suppression`** (warning/info): `nosnippet` / `max-snippet:0` kill SERP snippets and AI Overview / answer-engine citability; `data-nosnippet` coverage reported as info.
- **`tech/viewport-meta`** (warning): missing viewport meta under mobile-first indexing.
- **`content/meta-description-presence`** (warning): missing/empty meta description. Length is deliberately NOT linted: Google documents no character limit.
- **`links/generic-anchor-text`** (info): ≥50% of a page's internal links anchored on "click here"/"read more"/empty text.

Also: `tech/og-completeness` now checks the two remaining ogp.me-required tags (`og:type`, `og:url`) at info severity; `CORE_RULESET_VERSION` bumped so change-driven monitoring re-fetches previously-skipped URLs. (This batch bumped it to 16; two later rules in the same release, `tech/resource-weight` and `content/image-attributes`, bumped it again, so the value this release ships is **18**.)
