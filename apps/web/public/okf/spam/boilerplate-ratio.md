---
type: pSEO Audit Rule
title: "Boilerplate Ratio — When Shared Template Text Eats Your Pages"
description: "When 60% of every page is shared paragraphs, you have one page repeated a thousand times. How pseolint measures the boilerplate ratio and what counts as too much."
resource: https://pseolint.dev/rules/boilerplate-ratio
ruleId: "spam/boilerplate-ratio"
tags: [spam, "boilerplate content SEO"]
---

# Boilerplate Ratio — When Shared Template Text Eats Your Pages

> 60% is the default boilerplateMaxRatio: pseolint identifies sentence-level blocks appearing on 80%+ of pages, then flags any URL whose word count is dominated by those repeated blocks (warning severity, weight 12).

_Rule `spam/boilerplate-ratio` · [live explainer](https://pseolint.dev/rules/boilerplate-ratio)_

# What it detects
pseolint flags pages whose boilerplate ratio exceeds 60% — the threshold operationalising the 'producing many pages on the same topic to such a degree that individual pages have very little unique value' clause Google added to the helpful-content guidance in the March 5, 2024 scaled-content-abuse update (https://developers.google.com/search/docs/essentials/spam-policies). The rule splits each page's content into sentence-sized blocks (split on `.!?\n`, lower-cased, blocks shorter than 20 characters discarded). It builds a frequency map across all pages, then defines the 'skeleton' as any block appearing on at least 80% of pages plus one. For each individual page, it sums the words inside skeleton blocks and divides by the page's total word count. Pages above your `boilerplateMaxRatio` (default 0.60) are reported with the exact percentage. Crucially, the skeleton is computed across the actual pages you crawled — so if you sample only 20 pages of a 2,000-page site, the skeleton may be smaller than reality and the ratio is conservatively low.

# Why it matters
A high boilerplate ratio is not a quality signal in isolation; it is a leading indicator of a deeper problem. Sites built off a single template with a thin layer of variable content tend to develop boilerplate ratios in the 50-80% range as they scale, and the moment SpamBrain notices that the variable layer is itself shallow (per-page word counts are low, structure signatures are identical), the boilerplate ratio confirms what the other signals already suggested. The fix is rarely to delete the boilerplate — it is to grow the variable content beneath it. A 60% ratio on a 1,500-word page (600 words of unique substance) ranks fine; a 60% ratio on a 200-word page (80 words of unique substance) does not.

# Failing example
A 240-page recipe site where every page contains the same 180-word 'Why this recipe works' intro, the same 140-word 'A note from our chef' bio, the same 90-word affiliate disclosure, and the same 60-word newsletter CTA. The variable section — actual ingredients and method — averages 220 words. Total page length 730 words; boilerplate share 470/730 = 64%. The rule fires on every page, and rightly so: from a search engine's view, this is one 470-word page repeated 240 times with a different ingredient list grafted on.

# Passing example
The same recipe site, restructured. The 'Why this recipe works' block is removed entirely (it added no information). The chef bio is moved to /about and replaced on each recipe with a 60-word, recipe-specific origin paragraph. The affiliate disclosure is shortened to 18 words and demoted to the footer (under the 20-char-per-block floor, so it is filtered out before frequency counting). The variable section grows to 450 words including measured ingredient yields, technique tips specific to that dish, and substitution tables. New ratio 78/528 = 14%. Comfortably under threshold.

# How to fix
- Find your skeleton blocks first. Run pseolint with `--verbose` and the rule will list which exact sentences it considers boilerplate — that's your edit list.
- Move repeated content out of the page body and into the global footer or a separate /about-style URL where it doesn't count against per-page ratio.
- Shorten or delete sections that aren't load-bearing. 'Why this works' intros and pre-conclusion summaries are the highest-value cuts because they are uniformly low information.
- Grow the variable section. The ratio is a fraction; a smaller numerator is one path, a larger denominator is another. Adding genuine per-page facts is almost always safer than aggressive boilerplate removal.
- Treat anything above 50% as a yellow flag even if it passes the rule. The default 60% threshold is permissive; many domains that pass at 0.60 still feel templated to a reader.
- Re-run after each round of edits. Removing one skeleton block can shift others' frequencies above the 80% cutoff, so the skeleton recomposes.

# Related rules
- [template-diversity](../spam/template-diversity.md)
- [thin-content](../spam/thin-content.md)
- [near-duplicate](../spam/near-duplicate.md)

# Sources
- [Google Search Central — Spam policies: scaled content abuse](https://developers.google.com/search/docs/essentials/spam-policies) — The March 5, 2024 scaled-content-abuse update explicitly targets pages where repeated template blocks — sentences appearing on 80%+ of the corpus — consume more than 60% of a URL's word count, leaving individual pages with negligible unique substance; the boilerplate-ratio rule's 60% ceiling operationalises that clause.
- [Google Search Central — Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) — Google's Helpful Content guidance asks whether a page's body would satisfy a reader independently of its siblings; sentence-level blocks shared across 80% of the crawl fail that test, and the 60% boilerplateMaxRatio threshold is the point at which shared template text statistically dominates over per-URL contribution.
- [Google Search Central — Large site owner's guide to managing crawl budget](https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget) — Pages dominated by cross-site boilerplate are deprioritised in Google's crawl queue as low-information fetches; at the 60% ratio ceiling, the crawler's per-URL signal-to-noise calculation tips against re-fetching those URLs, which the crawl-budget guidance for large sites documents as a known demotion pathway.
