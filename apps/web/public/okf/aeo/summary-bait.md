---
type: pSEO Audit Rule
title: "Summary Bait: When a Page Front-Loads Every Fact and Leaves the Body Hollow"
description: "Answer-first taken too far. How aeo/summary-bait flags pages that cram 70% of their citable facts into the first 150 words, optimising the AI snippet over the reader."
resource: https://pseolint.dev/rules/summary-bait
ruleId: "aeo/summary-bait"
tags: [aeo, "summary bait AEO"]
---

# Summary Bait: When a Page Front-Loads Every Fact and Leaves the Body Hollow

> aeo/summary-bait fires when 70% or more of a page's citable facts are crammed into its first 150 words and nothing fresh waits below, a low-confidence warning that the page is shaped for an AI Overviews snippet Google can lift whole rather than for a reader who scrolls past the opener.

_Rule `aeo/summary-bait` · [live explainer](https://pseolint.dev/rules/summary-bait)_

# What it detects
aeo/summary-bait measures one ratio: of all the citable facts on a page, what fraction sits in the first 150 words? The rule extracts facts with the same patterns aeo/citable-facts uses (dollar amounts, percentages, timeframes like '11 days' or '4 weeks', month-day dates, and form numbers) once across the whole page and once across the opener alone, then divides the opener count by the full count.

When 70% or more of the page's facts land in that opener, and the page has at least 3 facts to begin with, the rule warns at low confidence. Two gates keep it quiet on healthy pages. First, the opener must already pass aeo/answer-first (a complete, fact-bearing lead) because front-loading a clear answer is good, not a fault. Second, the page must carry no interactive, downloadable, or gated value below the fold: a foraging-calendar widget, a printable spore-print key, or a sign-in-to-continue block all mean there is a real reason to scroll, so the rule stays silent. Only the overlap (strong opener, everything cited up top, nothing new beneath) trips it.

# Why it matters
The nuance is the whole point. A page that answers the question in its first paragraph is doing the right thing, aeo/answer-first rewards exactly that, and an AI engine will happily cite a clean opening line. The failure aeo/summary-bait catches is one step further: a page that dumps every number, date, and figure into the opener and then pads the rest with filler that adds nothing a reader could not get from the snippet alone.

That shape is optimised for the machine at the expense of the human. When 70% of your facts live in 150 words, an AI Overview can lift the whole answer and the click never happens, the searcher gets what they need from the summary and the scroll dies on the fold. The fix is not to weaken the opener but to give the body a reason to exist: distribute facts so the full picture requires reading on, and add value a summary cannot carry. A page that earns the scroll keeps the reader; a page that bait the summary trades a visitor for a citation.

# Failing example
/forage/morel-season, an urban-foraging field guide whose 150-word opener states everything: morels emerge when soil holds at 50 degrees for 4 weeks, the spring window runs roughly April 14 to May 26, a healthy patch yields 26% more by weight near dead elms, and a good spore print sets in 11 days. The 600 words beneath repeat the same claims in looser prose, add no new figure, and link to no tool. 4 of the page's 5 citable facts sit in the opener (80% concentration) so the rule warns: an AI Overview can quote the whole morel calendar without ever sending the forager to the page.

# Passing example
/forage/morel-season: the same field guide, rebalanced. The opener still answers cleanly (morels fruit when the soil hits 50 degrees), but the dated season table, the 26%-near-elms yield data, a spore-print method that sets in 11 days, and a printable hedgerow-by-hedgerow foraging-basket checklist now live in sections below the fold. Fewer than 70% of the facts sit up top, an interactive harvest-calendar widget gives a real reason to scroll, and the snippet can no longer carry the full answer; the reader has to land on the page to get the ramps and chanterelle windows too.

# How to fix
- Keep the answer-first opener, but move the supporting numbers below it. The lead should resolve the question; the dated season tables, yield figures, and method steps belong in sections a reader scrolls to reach.
- Add value a summary cannot carry. A foraging-calendar widget, a printable spore-print identification key, or a region-specific harvest map gives both the reader and the rule a genuine reason the page exists beyond its opener.
- Redistribute citable facts so concentration drops under the 70% threshold. If four of five figures sit in the first 150 words, push two of them into a 'Full season breakdown' section deeper on the page.
- Replace padding prose with new information. The body that merely restates the opener in looser words is exactly what flags the page; every section below the fold should add a fact the snippet did not.
- Gate or download the genuinely valuable asset. A sign-in-to-save patch log or a downloadable hedgerow checklist counts as below-fold value the rule respects, because an AI Overview cannot reproduce it.
- Re-run the audit after rebalancing. The finding clears the moment opener concentration falls below 70% or the page gains real interactive value below the fold.

# Related rules
- [unique-value](../content/unique-value.md)
- [thin-content](../spam/thin-content.md)

# Sources
- [Google Search Central: Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content): People-first guidance asks whether a page gives readers reason to return; aeo/summary-bait operationalises the inverse: when 70% of citable facts (dollar amounts, percentages, timeframes, form numbers) cluster in the first 150 words and nothing original follows, the page is shaped to be consumed without being read.
- [Google Search Central: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features): AI Overviews lift compact, fact-dense openers as verbatim attribution sources; aeo/summary-bait flags the 70%-in-150-words pattern precisely because it is optimised for that extraction path at the expense of depth that would serve an actual reader scrolling past the opener.
