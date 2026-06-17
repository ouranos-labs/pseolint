---
type: pSEO Audit Rule
title: "Template Coverage — How Sparse Keyword Matrices Expose pSEO"
description: "A template filling 8% of its keyword cells looks generated. How spam/template-coverage measures URL-dimension coverage across a cluster, and why sparse matrices read as pSEO."
resource: https://pseolint.dev/rules/template-coverage
ruleId: "spam/template-coverage"
tags: [spam, "template coverage pSEO"]
timestamp: 2026-06-17T06:42:03.371Z
---

# Template Coverage — How Sparse Keyword Matrices Expose pSEO

> spam/template-coverage groups URLs in the same directory, masks the entity tokens in each filename, and reports how many of the possible dimension combinations a template actually fills — surfacing, at info severity, the sparse high-dimension matrices Google's March 27, 2026 core update down-weighted on programmatic sites.

_Rule `spam/template-coverage` · [live explainer](https://pseolint.dev/rules/template-coverage)_

# What it detects
spam/template-coverage is a diagnostic, not an accusation. It groups your URLs into clusters by parent directory, and within each cluster of at least 5 pages it looks only at the filename — the last path segment, extension stripped. It masks the entity tokens in that filename using your entity patterns, then splits the masked name on hyphens into positional tokens.

For each position where more than one distinct value appears, the rule records a 'dimension'. A cluster like /jobs/[role]-jobs-in-[city] has two dimensions: role and city. The rule multiplies the number of distinct values in each dimension to get the total possible combinations, then divides the pages you actually built by that total to produce a coverage percentage. If a template has 12 services and 50 cities — 600 possible cells — but you shipped 96 pages, coverage is 16% and the rule reports the dimensions, the sample values, and the ratio at info severity. A cluster where every token varies, or none does, produces no finding because there is no matrix to measure.

# Why it matters
A sparse matrix is a behavioural confession. Filling 16% of a 600-cell grid almost always means a script generated the combinations that had search volume and skipped the rest — the definition of building pages for keywords rather than for users. A human team that genuinely served every service in every city would either cover the grid densely or never have framed the work as a grid at all.

The rule fires at info severity on purpose: sparse coverage is not inherently spam. A directory legitimately serving 96 real markets is fine; the signal only matters when the sparsity pairs with thin or near-duplicate content in the same cluster. Google's March 27, 2026 core update down-weighted exactly this shape — high-dimension templates with low fill rates — because the combinatorial ambition is a reliable marker of coverage-driven generation. Treat a coverage finding as a question: can you actually differentiate every cell you intend to fill, or are you claiming a matrix you cannot substantiate?

# Failing example
/locations/ holds 96 pages of the form [service]-in-[city]. Masking the entity tokens reveals two dimensions: 12 services and 50 cities, implying 600 possible combinations. The cluster also trips spam/near-duplicate and spam/thin-content. The coverage finding reads: '/locations has 96 pages across 2 dimensions: 12 values (e.g. plumbing, roofing, hvac) x 50 values (e.g. austin, dallas, houston). Coverage: 96 of 600 combinations (16.0%).' Read together, the picture is a template that generated the high-volume cells and left the grid mostly empty.

# Passing example
The same /locations/ cluster, narrowed to the combinations the business can actually differentiate: 12 services in the 8 cities where it has a physical branch, 96 pages covering 96 of 96 cells. Coverage is 100%. Each page carries the branch address, local pricing, and named staff for that city, so the dense grid reflects genuine market presence rather than a keyword script that filled the easy cells of a 600-cell matrix.

# How to fix
- Narrow the matrix to what you can differentiate. If you cannot write genuinely distinct content for all 600 cells, do not claim the grid — build the cells you can substantiate and drop the dimensions you cannot.
- Raise coverage by subtraction, not addition. Pruning empty intent often beats generating the missing cells, because the missing cells are usually the ones with no demand and nothing unique to say.
- Check the paired findings first. A coverage finding next to spam/thin-content or spam/near-duplicate in the same cluster is the combination that matters; coverage alone is a diagnostic to note, not an emergency.
- Collapse a dimension. If one axis (say, modifier words like cheap/best/top) adds combinations without adding user value, remove it from the URL structure and fold it into a single page.
- Treat info severity as guidance. The rule never blocks a verdict on its own — it tells you where a template's ambition outruns its substance so you can decide before Google does.

# Related rules
- [template-diversity](../spam/template-diversity.md)
- [doorway-pattern](../spam/doorway-pattern.md)
- [near-duplicate](../spam/near-duplicate.md)

# Sources
- [Google Search Central — Spam policies: scaled content abuse](https://developers.google.com/search/docs/essentials/spam-policies) — Google's scaled-content-abuse policy, tightened March 5 2024, targets sites generating permutations of dimension combinations — city × service, state × regulation — precisely the sparse high-dimension matrices spam/template-coverage exposes by computing how many of the theoretically possible filename token combinations a cluster actually fills.
- [Google Search Central — Spam policies: doorways](https://developers.google.com/search/docs/essentials/spam-policies#doorway-pages) — The doorways policy warns that pages created to rank for every variant of a query — without added value per combination — are doorway clusters; spam/template-coverage's coverage ratio is the structural measurement that quantifies how thinly a template's dimensional grid has been populated.
- [Google Search Central — Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) — Google's helpful-content guidance asks whether a page was made primarily for search engines rather than users; a template that fills only 12% of its own dimension space reveals that most URLs exist to claim keyword combinations, not to satisfy distinct informational needs.
- [Google Search Central — Large site owner's guide to managing crawl budget](https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget) — Crawl-budget guidance recommends avoiding URL sprawl that yields no incremental value; spam/template-coverage's info-severity diagnostic surfaces exactly the low-fill clusters — say, 40 actual pages out of 800 possible permutations — that inflate a sitemap without improving the index.
