---
type: pSEO Audit Rule
title: "Meta Robots Conflict: How a Stray noindex Header Deindexes Live Pages"
description: "A staging X-Robots-Tag can overrule your meta tag, because Google takes the most restrictive directive it finds. How tech/meta-robots-conflict catches the contradiction."
resource: https://pseolint.dev/rules/meta-robots-conflict
ruleId: "tech/meta-robots-conflict"
tags: [tech, "meta robots noindex conflict"]
---

# Meta Robots Conflict: How a Stray noindex Header Deindexes Live Pages

> Google honours the most restrictive robots directive it finds rather than the nearest one, so an `index, follow` meta tag cannot override a stray `X-Robots-Tag: noindex` response header: tech/meta-robots-conflict fires at error severity the moment the two disagree across a URL's robots meta tag, its googlebot meta tag and its headers. Unlike the robots.txt noindex directive that Google retired in 2019, this conflict is silent, and Search Console reports only that the page is excluded by a noindex tag without naming which source set it.

_Rule `tech/meta-robots-conflict` · [live explainer](https://pseolint.dev/rules/meta-robots-conflict)_

# What it detects
Re-scanning the raw HTML is the first thing this rule does, and it does so deliberately: the parser's `page.robotsMeta` field retains only the first robots meta tag, so a docs template that injects a second one from a layout partial would otherwise go unseen. A regex sweep over every `<meta>` tag keeps the ones whose `name` attribute resolves to `robots` or `googlebot`, whether the value is double-quoted, single-quoted or bare, and records each tag's `content` string against a readable source label. The `X-Robots-Tag` value from the HTTP response is appended as a third declaration and skipped when the header is empty or whitespace-only. Every content string is then split on commas, trimmed and lowercased into individual directive tokens, and each token is indexed against the set of sources that declared it.

Two opposite pairs are then evaluated: `index` against `noindex`, and `follow` against `nofollow`. When both halves of a pair are present anywhere across the gathered sources, the rule emits an error-severity, high-confidence finding that names the offending URL and lists which source declared each side, so a /pricing page showing `index` from `meta robots` and `noindex` from `X-Robots-Tag header` reads unambiguously in the report. A second, quieter check catches a different failure: when the same meta name appears in two or more tags whose content strings differ after trimming and lowercasing, the rule emits a warning that quotes each distinct string, because nothing in the markup settles which one applies. Identical duplicate tags stay silent, and a page that declares no robots directive at all is skipped before any comparison runs.

# Why it matters
The asymmetry is what makes this expensive. A missing `index` directive costs nothing, since indexing is the default behaviour. A stray `noindex` removes the page. Because Google combines directives from every source and honours the most restrictive result, the two are never weighed against each other; the restriction simply applies, with no error surfaced in the markup, no warning in the build log and no visible difference in the rendered page. Search Console will eventually list the URL under `Excluded by 'noindex' tag`, but that report only arrives after a recrawl, which on a low-demand documentation subfolder can take weeks.

Documentation and pricing are the two page types a SaaS site can least afford to lose. Pricing pages carry commercial intent and convert; documentation pages accumulate long-tail queries for error strings, API method names and config keys that nothing else on the domain ranks for. When a staging deployment's blanket `X-Robots-Tag: noindex` survives an environment-variable rename and reaches production, the page template still emits `index, follow`, every visual QA pass looks correct, and the deindexing proceeds quietly underneath. Teams routinely discover it only when a support ticket asks why a documented error code no longer appears in search.

# Failing example
docs.example-saas.com serves 412 documentation URLs plus /pricing behind a reverse proxy whose staging config block was pasted into the production Nginx file. Every response carries `X-Robots-Tag: noindex, nofollow` while the page template still emits `<meta name="robots" content="index, follow">`. The rule reports two error findings per URL, one for the index/noindex pair and one for follow/nofollow, 826 in total, each naming `meta robots` and `X-Robots-Tag header` as the conflicting sources.

# Passing example
The same 412 documentation URLs and /pricing after the proxy's `add_header X-Robots-Tag` line is scoped to the staging server block alone. Production responses carry no `X-Robots-Tag` at all, the template emits exactly one `<meta name="robots" content="index, follow">`, and the 3 internal preview environments declare `noindex` through the header only, with no robots meta tag rendered, so no opposite pair can assemble anywhere. pseolint returns zero findings for the rule.

# How to fix
- Fetch the production URL with `curl -I` and read the response headers directly: an X-Robots-Tag conflict is invisible in view-source and in every browser Elements panel.
- Pick one authoritative source per environment, header-only for preview and staging, meta-tag-only for production. Declaring the same directive twice is how the two drift apart.
- Move the staging noindex out of shared proxy config into a block scoped to the staging server name, so a copy-paste into the production file cannot carry it across.
- Resolve the warning-severity duplicate-tag findings too: two robots meta tags with different content strings mean a layout partial and a page template are both writing directives.
- Add a deploy-time smoke test asserting that /pricing and three sampled /docs URLs return no X-Robots-Tag header and render exactly one robots meta tag.
- After removing the directive, request indexing for the highest-value URLs in Search Console rather than waiting out the natural recrawl of a low-demand docs subfolder.

# Related rules
- [snippet-suppression](../tech/snippet-suppression.md)
- [robots-txt-limits](../tech/robots-txt-limits.md)
- [crawler-access](../aeo/crawler-access.md)

# Sources
- [Google Search Central: Robots meta tag, data-nosnippet, and X-Robots-Tag](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag): Google's robots meta tag specification is the primary source for the combination rule this page rests on: directives declared in the HTML tag and in the X-Robots-Tag header are merged and the most restrictive result applies, which is why a leftover staging header overrides a production meta tag saying index.
- [Google Search Central: Block search indexing with noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing): The block-indexing guidance documents that a noindex directive removes a URL from the index outright rather than demoting it, the outcome a docs-and-pricing SaaS site suffers when 412 documentation URLs inherit a proxy header that was only ever meant for staging.
