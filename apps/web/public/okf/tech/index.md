---
type: Category
title: "tech rules"
description: "pseolint tech audit rules for programmatic SEO."
resource: https://pseolint.dev/rules
---

# tech rules

- [Language Mismatch: When the Declared Language Isn't the One You Published](./language-mismatch.md): 70% is the trigger: once that share of a page's script-classified letters belongs to a script no declared language uses, tech/language-mismatch fires an error at high confidence, the threshold that caught a Japan travel guide serving Russian Cyrillic body copy under a self-referencing hreflang="ja", with a 200-letter floor below which the comparison is never attempted.
- [Hreflang Validity: The Invalid Codes Google Silently Discards](./hreflang-validity.md): Three code shapes make Google discard an hreflang annotation outright: the underscore in en_US, the country code jp standing where the language ja belongs, and en-UK when the United Kingdom's ISO 3166-1 region is GB, and tech/hreflang-validity catches all three by resolving every value through the CLDR data Node already ships, one warning per distinct bad value per page.
- [Sitemap Hygiene: Cross-Host URLs, Build-Stamped lastmod, and Ignored Fields](./sitemap-hygiene.md): Google uses lastmod only when the value is consistently and verifiably accurate, so tech/sitemap-hygiene reports a sitemap as build-stamped once at least 100 URLs carry the field and 95% of them repeat one identical value, one of five rollup checks it runs alongside cross-host locs, unparseable URLs, dates more than 24 hours in the future, and non-W3C datetimes.
- [Meta Robots Conflict: How a Stray noindex Header Deindexes Live Pages](./meta-robots-conflict.md): Google honours the most restrictive robots directive it finds rather than the nearest one, so an `index, follow` meta tag cannot override a stray `X-Robots-Tag: noindex` response header: tech/meta-robots-conflict fires at error severity the moment the two disagree across a URL's robots meta tag, its googlebot meta tag and its headers.
- [Snippet Suppression: How nosnippet Removes a Page From AI Answers](./snippet-suppression.md): A page carrying `nosnippet` or `max-snippet:0` in any robots source forfeits its SERP description and its eligibility to be cited in AI Overviews and answer engines at the same moment, which is why tech/snippet-suppression reports every such URL at warning severity while deliberately leaving `max-snippet:-1` and every positive character budget untouched.
- [robots.txt Limits: The 500 KiB Cutoff and Four Directives Google Ignores](./robots-txt-limits.md): 500 KiB is the hard ceiling: Google parses the first 512,000 bytes of a robots.
- [HTML Size: The 2 MB Per-File Cutoff That Truncates Your Markup](./html-size.md): Googlebot reads only the first 2 MB of any single fetched file, uncompressed, so tech/html-size warns the moment a document's UTF-8 byte length reaches 1,572,864 bytes (1.
- [Viewport Meta: Pages Google Renders as a Shrunken Desktop](./viewport-meta.md): A viewport meta tag satisfies tech/viewport-meta only when its content attribute actually contains the substring width=, which means content="initial-scale=1" is treated as no viewport at all, and every page failing that single test collects one high-confidence warning because Google crawls with a smartphone agent and evaluates the shrunken desktop render it receives.
