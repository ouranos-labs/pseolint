---
type: pSEO Audit Rule
title: "Freshness Signals — When a Page Gives AI Engines No Sign It Is Current"
description: "AI engines favour pages that prove they are current. How aeo/freshness-signals flags a missing dateModified and content older than the 180 days staleness default."
resource: https://pseolint.dev/rules/freshness-signals
ruleId: "aeo/freshness-signals"
tags: [aeo, "content freshness signals SEO"]
timestamp: 2026-06-17T06:37:51.696Z
---

# Freshness Signals — When a Page Gives AI Engines No Sign It Is Current

> aeo/freshness-signals checks every page for a real modification signal — a JSON-LD dateModified, an article:modified_time meta tag, or a visible 'Last updated' line — warns at medium confidence when none exists, then drops to an info note when the best date it can parse is older than the staleness default of 180 days Google has long associated with how AI Overviews weigh recency.

_Rule `aeo/freshness-signals` · [live explainer](https://pseolint.dev/rules/freshness-signals)_

# What it detects
aeo/freshness-signals asks one question of every crawled page: does it carry evidence that it has been touched recently. The rule looks for a true modification signal in three places — a dateModified field anywhere in the page's JSON-LD (found by a recursive walk), a modification meta tag (article:modified_time, last-modified, dc.date.modified, or a <time datetime> element), or visible 'Last updated', 'updated on', 'revised', or 'last modified' text in the rendered content.

A datePublished alone is deliberately not enough. A page born in 2019 and never edited has a publication date but no modification signal, so it falls through to a warning at medium confidence — medium because evergreen pages like an about, pricing, or policy page may legitimately omit a modified date, and re-stamping them would mislead readers.

When a modification signal does exist, the rule parses the best date it can find and measures its age. If that age exceeds maxStaleDays — 180 days by default — it emits an info finding at low confidence, because stale by the clock is not always stale by meaning. The two findings sit at different severities on purpose: a missing signal is a warning, an old-but-present date is only an info note.

# Why it matters
AI engines and the AI Overviews layer prioritise content that can prove it is current, because a synthesised answer that cites a stale page inherits that page's staleness. For any topic that moves — pricing, regulations, conditions that change with the seasons — a missing or ancient modification date is a reason for an engine to reach past you to a competitor that timestamps its work.

The rule catches the failure mode programmatic templates fall into most often: the body binds live data, but the template never surfaces a dateModified, so a page that was regenerated this morning looks, to a crawler, exactly as old as the day it was first published. The data is fresh; the signal is not. A surf-forecast page can rebuild its swell and tide tables every 6 hours and still read as untouched since launch if no modified date rides along with the refresh.

Both findings are gentle by design — a warning for the missing signal, an info note for the aged date — because freshness is contextual. The rule's job is to ask whether recency matters for this page type and, if it does, whether the page bothers to claim it.

# Failing example
/forecast/ocean-beach-weekly on a tide and surf-forecast site. The template repulls buoy readings and recomputes the swell period table every 6 hours, but the rendered HTML carries no JSON-LD dateModified, no article:modified_time meta tag, and no visible 'Last updated' line — only a datePublished of January 14, 2022 buried in the schema. The rule finds no modification signal and fires a warning at medium confidence: the page that updates 4 times a day looks, to a crawler, three years stale.

# Passing example
The same /forecast/ocean-beach-weekly page, instrumented to timestamp its refresh. Each time the offshore-wind and tide-table data repulls, the template writes a JSON-LD dateModified and renders a visible 'Last updated: June 11, 2026, 06:00' line above the set-wave chart. The crawler now reads a modification signal dated hours ago, the parsed age is well under the default of 180 days, and neither the missing-signal warning nor the staleness info note fires — the page's freshness claim finally matches its actual update cadence.

# How to fix
- Add a real dateModified to your JSON-LD schema and bump it whenever the page's underlying data changes, not just when a human edits the prose.
- Render a visible 'Last updated: YYYY-MM-DD' line in the page body so both readers and AI engines see the freshness claim without parsing schema.
- Wire the modified timestamp to your data source for pSEO templates, so a forecast page that repulls every 6 hours stamps the moment it actually regenerated.
- Keep your sitemap <lastmod> accurate and aligned with the on-page date — a contradictory lastmod is worse than none, since it tells the crawler your timestamps cannot be trusted.
- Leave genuinely evergreen pages alone — an about, pricing, or policy page that has not changed should not carry a fake recent date that would mislead a reader.
- Refresh the body, not just the date, on pages older than the 180 days default whose information has actually moved on, then bump dateModified to reflect the real edit.

# Related rules
- [eeat-signals](../content/eeat-signals.md)
- [missing-author](../content/missing-author.md)
- [publication-velocity](../spam/publication-velocity.md)

# Sources
- [Google Search Central — Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) — Google's helpful-content guidance asks site owners to consider whether their content is well-sourced and reflects genuine expertise — a standard that includes temporal accuracy. aeo/freshness-signals checks each page for a true modification signal in three places: a dateModified field in JSON-LD, a modification meta tag such as article:modified_time, or a visible 'Last updated' line. Pages carrying none of these fail to surface even a claimed revision date, leaving AI Overviews with no evidence the content is current.
- [Google Search Central — Search Essentials](https://developers.google.com/search/docs/essentials) — Search Essentials identifies freshness as one factor Google weighs for certain query types, particularly informational and evergreen topics. aeo/freshness-signals applies a staleness ceiling of 180 days: when the best parseable date is older than that threshold, the rule drops from a medium-confidence warning to an info note — reflecting that recency matters more for some templates than others, and the rule deliberately calibrates to that spectrum.
