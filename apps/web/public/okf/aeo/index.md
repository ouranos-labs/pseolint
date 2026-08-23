---
type: Category
title: "aeo rules"
description: "pseolint aeo audit rules for programmatic SEO."
resource: https://pseolint.dev/rules
---

# aeo rules

- [Freshness Signals: When a Page Gives AI Engines No Sign It Is Current](./freshness-signals.md): aeo/freshness-signals checks every page for a real modification signal (a JSON-LD dateModified, an article:modified_time meta tag, or a visible 'Last updated' line) warns at medium confidence when none exists, then drops to an info note when the best date it can parse is older than the staleness default of 180 days Google has long associated with how AI Overviews weigh recency.
- [llms.txt: A Draft Convention for Guiding AI Engines, Checked at Your Origin](./llms-txt.md): llms.
- [Crawler Access: Is Your robots.txt Blocking AI Answer Engines?](./crawler-access.md): aeo/crawler-access parses your robots.
- [FAQ Coverage: Question Content That Ships With No FAQPage Schema](./faq-coverage.md): aeo/faq-coverage flags any page that reads like an FAQ (at least 2 question-phrased H2 headings starting with how, what, or why, or a /faq, /how-to, or /what-is URL path) yet ships no FAQPage or HowTo JSON-LD, the structured-data gap that matters far more for AI extraction since Google narrowed FAQ rich results to government and health sites in August 2023.
- [Summary Bait: When a Page Front-Loads Every Fact and Leaves the Body Hollow](./summary-bait.md): aeo/summary-bait fires when 70% or more of a page's citable facts are crammed into its first 150 words and nothing fresh waits below, a low-confidence warning that the page is shaped for an AI Overviews snippet Google can lift whole rather than for a reader who scrolls past the opener.
