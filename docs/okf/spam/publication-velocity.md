---
type: pSEO Audit Rule
title: "Publication Velocity — When Your Publish Dates Betray Bulk Generation"
description: "Thousands of pages sharing one publish date is a bulk-generation tell. How spam/publication-velocity flags date-stacked corpora past a 100/day or 10%-of-corpus ceiling."
resource: https://pseolint.dev/rules/publication-velocity
ruleId: "spam/publication-velocity"
tags: [spam, "publication velocity SEO"]
timestamp: 2026-06-17T06:37:51.696Z
---

# Publication Velocity — When Your Publish Dates Betray Bulk Generation

> spam/publication-velocity groups your pages by publish date and warns when any single day exceeds the greater of 100 pages or 10% of your whole corpus — the date-stacking signal Google's March 27, 2026 core update tightened against programmatically generated sites.

_Rule `spam/publication-velocity` · [live explainer](https://pseolint.dev/rules/publication-velocity)_

# What it detects
spam/publication-velocity reads the publish date off every page — from article:published_time, a datePublished meta, or the first time[datetime] element — truncates it to a calendar day, and groups the corpus by that day. Pages with no detectable date are skipped, so the rule only judges what it can actually see.

The ceiling is corpus-relative. The effective limit for any day is the greater of two numbers: the absolute floor of 100 pages per day, and 10% of your total page count. A 400-page site is governed by the 100/day floor; a 50,000-page site can legitimately publish up to 5,000 pages on one date before the rule says anything. Any day that exceeds its effective limit emits a single warning naming the date, the count, and which ceiling it breached. The corpus-relative design is what keeps the rule from punishing large, legitimately busy publishers while still catching the small site that stamped 800 generated pages with one timestamp.

# Why it matters
Real editorial calendars are lumpy but human. Pages trickle out across days and weeks; a backlog clears in a burst, then quiet returns. A corpus where ten thousand URLs all carry the same publish date did not come from an editorial process — it came from a single generation job, and the timestamp is the receipt. Date-stacking is one of the few scaled-content signals that survives even when each individual page looks acceptable, because it describes the corpus, not the page.

Google's March 27, 2026 core update explicitly tightened how date-stacked corpora are weighed, which is why this rule moved from a curiosity to a real signal. The fix costs nothing in content quality — you are not rewriting anything, only spreading out the dates you expose — but ignoring it leaves a structural fingerprint that pairs badly with thin-content or near-duplicate findings on the same template. When several scaled-content signals stack, the corpus gets re-scored as a unit.

# Failing example
A recipe site imports 2,400 pages from a spreadsheet on a Sunday and ships them at once. Every page carries an article:published_time of 2026-02-15. The corpus is 3,000 pages, so the effective ceiling is the greater of 100 and 300, which is 300; the 2,400-page spike on a single date blows through it and the rule warns: '2,400 pages share publish date 2026-02-15, exceeding 10% of the 3,000-page corpus (300/day).'

# Passing example
The same 2,400 imported recipes, but the import script backdates each page to the day its source recipe was actually created and drip-publishes new ones on a real cadence. No single day holds more than roughly 40 pages. The effective ceiling of 300/day is never approached, the rule stays silent, and the corpus reads like something a kitchen team built over years rather than a spreadsheet dumped in an afternoon.

# How to fix
- Spread real dates, do not fabricate them. If your pages were genuinely created over time, surface that true history in article:published_time instead of stamping every record with the import date.
- Drip-publish new batches. Releasing generated pages over days or weeks both lowers the per-day count and matches how Google expects a healthy site to grow.
- Raise the corpus, not the spike. The ceiling scales with total page count, so the rule naturally relaxes as a site earns scale — but only if growth is distributed, not stacked.
- Check which field you expose. If you have no real publish dates, consider omitting them rather than stamping a placeholder, since the rule skips pages with no detectable date.
- Treat a velocity warning as a prompt to audit the same template for thin-content and near-duplicate — date-stacking rarely travels alone.

# Related rules
- [template-diversity](../spam/template-diversity.md)
- [boilerplate-ratio](../spam/boilerplate-ratio.md)
- [thin-content](../spam/thin-content.md)

# Sources
- [Google Search Central — Spam policies: scaled content abuse](https://developers.google.com/search/docs/essentials/spam-policies) — Google's scaled-content-abuse policy — tightened in the March 27, 2026 core update — treats publication-date stacking as a machine-generation fingerprint; spam/publication-velocity flags any calendar day where the page count exceeds the greater of 100 pages or 10% of the total corpus, reading article:published_time, datePublished meta, and the first time[datetime] element to reconstruct each page's publish date.
- [Google Search Central — Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) — Google's Helpful Content guidance frames mass-scheduling of pages as evidence of ranking-first intent; when a single day's batch exceeds the corpus-relative ceiling, the date-stacking pattern is statistically inconsistent with editorial publishing rhythms — the rule skips pages with no detectable date so only confirmed-date evidence informs the verdict.
- [Google Search Central — Large site owner's guide to managing crawl budget](https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget) — Sudden large publication batches force Googlebot to allocate disproportionate crawl budget to a single day's output; the crawl-budget guidance for large sites explains that fetch queues prioritise fresh URLs by discovery order, meaning a velocity spike buries earlier pages and dilutes the crawl signal the whole domain relies on for timely indexing.
