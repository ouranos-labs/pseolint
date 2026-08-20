# SEO folklore: checks pseolint refuses to run

**Status:** living document, updated when a folklore rule is proposed or debunked
**Date:** 2026-08-19

The blind-spots spec ([2026-05-03-pseolint-blind-spots.md](./superpowers/specs/2026-05-03-pseolint-blind-spots.md))
lists real signals we don't detect yet. This document is the opposite: checks
that are widely repeated in SEO folklore but contradicted by the primary
sources. pseolint deliberately does NOT flag any of these, and pull requests
adding them will be declined with a link here.

A linter earns trust by what it refuses to flag as much as by what it catches.
Every entry cites the authoritative source that contradicts the claim.

| # | Folklore claim | Verdict | Primary source |
|---|---------------|---------|----------------|
| 1 | "Meta description must be ≤155–160 characters" | **False.** Google: "There's no limit on how long a meta description can be"; truncation is display-side, fitted to device width. Missing/duplicate descriptions are real issues (we lint those); length is not. | [Snippet doc](https://developers.google.com/search/docs/appearance/snippet) |
| 2 | "Title tag must be ≤60 characters or Google rewrites it" | **False.** No documented character limit. Truncation is pixel-based display behavior; rewrites are triggered by quality problems (half-empty, boilerplate-repeated, inaccurate, stale titles), not by length. | [Title link doc](https://developers.google.com/search/docs/appearance/title-link) |
| 3 | "og:description should be 70 characters" | **Unsupported.** Meta's guidance is "usually between 2 and 4 sentences"; ogp.me says "a one to two sentence description". No numeric limit exists anywhere in either spec. og tags are a social/AI-summary display concern, not a ranking signal. | [Meta sharing guide](https://developers.facebook.com/docs/sharing/webmasters), [ogp.me](https://ogp.me/) |
| 4 | "Search engines can only process 2 MB of total website size" | **Misread.** The real limit (Googlebot doc, Feb 2026 revision) is **2 MB per fetched file**, uncompressed (64 MB for PDFs; previously the widely-cited 15 MB). Each CSS/JS resource is fetched separately with its own limit. There is NO total-page-weight or total-site-size crawl limit. Heavy pages are a Core Web Vitals problem, not a crawl-truncation one. `tech/html-size` checks the real per-file limit. | [Googlebot doc](https://developers.google.com/search/docs/crawling-indexing/googlebot) |
| 5 | "Googlebot indexes the first 15 MB of HTML" | **Outdated.** True until the Feb 2026 docs revision; the documented per-file crawl limit is now 2 MB. Tools and blog posts still citing 15 MB are behind. | [Googlebot doc](https://developers.google.com/search/docs/crawling-indexing/googlebot) |
| 6 | "Missing `<meta keywords>` hurts ranking" | **False.** "Google Search doesn't use the keywords meta tag": no effect on indexing or ranking at all. | [Special tags doc](https://developers.google.com/search/docs/crawling-indexing/special-tags) |
| 7 | "A wrong or missing `<html lang>` attribute is an SEO problem" | **False as stated.** Google: "We don't use any code-level language information such as `lang` attributes, or the URL"; language is detected from visible content. `lang` still matters for accessibility and is the prerequisite for our `tech/language-mismatch` check, which is why that rule reports the missing attribute at info severity and says so. | [Multi-regional sites doc](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites) |
| 8 | "Sitemaps need `<priority>` and `<changefreq>`" | **False.** Google ignores both. `<lastmod>` is used, but only "if it's consistently and verifiably accurate" (which `tech/sitemap-hygiene` checks). | [Build sitemap doc](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) |
| 9 | "Paginated archives need `rel=next/prev`" | **Obsolete.** Google retired rel=next/prev as an indexing signal in 2019. | [Pagination doc](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading) |
| 10 | "Pages need N+ words / an ideal keyword density" | **False.** Google: "Are you writing to a particular word count because you've heard Google has a preferred word count? (No, we don't.)" Our `spam/thin-content` floor exists for doorway/thin-page SPAM detection at template scale: a policy-risk signal, not a word-count ranking factor. | [Helpful content doc](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) |
| 11 | "Multiple meta description tags are penalized" | **Undocumented.** Neither Google's docs nor Lighthouse checks this. Duplicated tags with *different* content are ambiguous (which one wins is undefined). That ambiguity pattern is flagged for robots metas by `tech/meta-robots-conflict`, where the stakes (accidental noindex) are documented. | [Lighthouse meta-description](https://developer.chrome.com/docs/lighthouse/seo/meta-description) |
| 12 | "hreflang requires an x-default entry" | **Overstated.** Google says "consider adding" x-default: recommended, not required. We report its absence at info severity, never as an error. | [Localized versions doc](https://developers.google.com/search/docs/specialty/international/localized-versions) |
| 13 | "CSS complexity (rule count, duplicated selectors, `!important`, old prefixes) hurts ranking" | **Unsupported.** These are code-quality metrics with no documented ranking role. They matter only insofar as they inflate a single file past the per-file fetch limit (#4) or slow rendering enough to hurt Core Web Vitals; those two are the actual documented mechanisms, and the ones we check. | [Page experience doc](https://developers.google.com/search/docs/appearance/page-experience) |

## How to use this list

- **Proposing a rule?** If the claim's only support is an SEO blog, a tool
  vendor's checklist, or "everyone knows", find the primary source first. If
  the primary source contradicts it, the rule lands here instead of in the
  engine.
- **A rule here later becomes real?** Google's docs change (see #5: the 15 MB
  limit was true for years). Each entry cites a living doc; re-verify against
  it before arguing from this table.
