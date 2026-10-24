---
"@pseolint/core": minor
"pseolint": minor
---

`pseolint grow`: a growth plan learned from your own Search Console data.

- **`@pseolint/core/growth`.** Sitemap walk → crawl → join GSC pages → per-template show rate → shown-vs-ignored contrast (Mann-Whitney U, template-stratified, Benjamini-Hochberg FDR 10%) over internal inlinks, internal PageRank, content length, H2s, JSON-LD, sibling similarity, title length and URL depth → plan: internal link insertions (from shown pages to striking-distance/ignored pages, never re-suggesting existing links), CTR-outlier title rewrites, unblock (noindex/canonical/error sitemap URLs), sitemap additions, near-clone differentiation, template prune. `growSite()`, `analyze()`, `buildPlan()`, `parseGscPages()` (GSC Pages.csv or searchanalytics JSON), `submitIndexNow()`.
- **CLI.** `pseolint grow <url> --gsc Pages.csv [--out dir] [--json]` and `pseolint indexnow <url> --key <key> [--since days] [--dry-run]`.
- **Parser fix: titles in `<body>`.** `title` now follows `document.title` semantics: the first HTML `<title>` anywhere, never an SVG `<title>`. Next.js 15+ streaming metadata puts `<title>` in `<body>`, for Googlebot too, so every App Router site used to read as untitled. `titleSource` gains `"body"`.
