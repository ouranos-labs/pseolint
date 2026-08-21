---
type: pSEO Audit Rule
title: "Missing Meta Descriptions: What Google Writes When You Do Not"
description: "With no meta description, Google composes your snippet from arbitrary page text. Why pseolint flags absence at warning severity and refuses to lint description length."
resource: https://pseolint.dev/rules/meta-description-presence
ruleId: "content/meta-description-presence"
tags: [content, "missing meta description"]
---

# Missing Meta Descriptions: What Google Writes When You Do Not

> A page shipping no meta description hands Google's snippet generator the job of writing its search result, which is why content/meta-description-presence flags every such URL at warning severity with high confidence, and why the rule checks presence alone: Google's snippet documentation states no character limit for descriptions exists.

_Rule `content/meta-description-presence` · [live explainer](https://pseolint.dev/rules/meta-description-presence)_

# What it detects
The check is one boolean per page and is deliberately shallow. content/meta-description-presence reads the parsed page's metaDescription value, trims it, and reports every URL where what remains is an empty string. Whitespace-only content counts as absent, since a tag containing a single space communicates nothing to a snippet generator. Pages that carry no HTML at all are skipped rather than reported, so a failed fetch never masquerades as a missing tag. Each finding lands at warning severity with high confidence, names the offending URL, and states the consequence in the message itself: Google will compose the snippet from page text, so the site loses control of its own click-through pitch. The attached fix is a single instruction, to add a description to the head written for that specific page rather than a site-wide line pasted everywhere.

What the rule refuses to do carries as much weight. It never measures length. Google's snippet documentation states there is no limit on how long a meta description can be, and truncation in a result listing is a device-width display behaviour rather than an indexing event, so a 155-character maximum check would encode folklore instead of policy; pseolint publishes that claim as entry 1 in its folklore table and declines pull requests adding it. The rule likewise ignores keyword usage, and it does not flag duplication. Descriptions repeated across a cluster are a separate finding, content/meta-uniqueness. Presence and uniqueness fail differently and are fixed differently, and merging them into one score is how audit tools produce a 4,000-row report nobody can triage.

# Why it matters
A B2B integrations catalog for payroll and HRIS connectors ships 4,000 pages generated from a connector registry: /integrations/gusto-to-workday, /integrations/bamboohr-to-adp-workforce-now, and 3,998 siblings. The layout component that renders them was never given a description tag, so all 4,000 URLs are flagged in a single audit. Google then composes each snippet itself, drawing whatever on-page text best matches the query, which on these pages almost always lands on the opening sentence of the shared How this sync works block. Four thousand results in the index, and the same 22 words of boilerplate underneath every one of them, describing the mechanism rather than the connector a buyer searched for.

The buying context makes the loss concrete. Someone searching for a Gusto to Workday employee sync is deciding in the result listing whether the connector handles what they need, and the facts that settle it are all in the registry already: sync direction, whether the cadence is hourly or nightly, which objects are covered, and whether the connector is generally available or in beta. None reach the snippet while the tag is absent. Google's snippet documentation is direct that a good description is the site's chance to advertise the page to searchers, and its AI-features guidance ties inclusion in generated answers to content whose subject is plainly stated. One template line reading from four registry fields fixes all 4,000 pages, provided the resulting text differs per connector.

# Failing example
/integrations/bamboohr-to-adp-workforce-now on the connector catalog renders a full page: an h1, a field-mapping table with 34 rows, and a setup walkthrough. Its head contains a title, a canonical, and og:image, but no meta name="description" element at all. content/meta-description-presence flags it at warning severity, along with the other 3,999 registry-generated URLs, and Google composes the snippet from the shared opening line How this sync works: connectors run on a scheduled job and reconcile records between systems, which appears verbatim beneath every connector in the catalog.

# Passing example
The same URL after the layout emits a description assembled from registry fields: "Sync BambooHR employees, compensation and time-off balances into ADP Workforce Now on an hourly schedule. One-way, 34 mapped fields, generally available since March 2025." Every one of the 4,000 pages produces different text because the direction, cadence, mapped-field count and availability date differ per connector, so the catalog clears content/meta-description-presence and content/meta-uniqueness at the same time rather than trading one finding for the other.

# How to fix
- Emit the description from the same data source that generates the page, so each URL draws on fields that genuinely differ between entities.
- Write for the searcher's decision rather than for a keyword: state what the page offers and which constraint it resolves.
- Check content/meta-uniqueness immediately after fixing presence, since a template that fills the tag with one shared sentence trades one finding for another.
- Ignore any tool telling you to stay under 155 or 160 characters; Google documents no limit, and truncation is a display behaviour that varies by device width.
- Prioritise pages that already earn impressions, because a rewritten snippet changes click-through on results that are being seen today.
- Leave descriptions off pages you have deliberately excluded from indexing, and add the URL patterns to the ignore list in pseolint.config.ts so the report stays actionable.

# Related rules
- [meta-uniqueness](../content/meta-uniqueness.md)
- [title-uniqueness](../content/title-uniqueness.md)
- [summary-bait](../aeo/summary-bait.md)

# Sources
- [Google Search Central: How to write meta descriptions (snippets)](https://developers.google.com/search/docs/appearance/snippet): Google's snippet documentation supplies both halves of this rule: absence means Google composes the result text itself from page content, and the same page states no character limit exists for descriptions, which is why pseolint checks presence and declines to grade length.
- [Google Search Central: Meta tags and HTML attributes Google supports](https://developers.google.com/search/docs/crawling-indexing/special-tags): The supported-tags reference lists description as a meta tag Google reads and keywords as one it does not use, so the rule tests for the one tag that changes snippet output and ignores the tag that has had no effect on indexing since 2009.
- [Google Search Central: Robots meta tag, data-nosnippet, and X-Robots-Tag](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag): The robots meta tag specification documents the directives that genuinely control snippet output, including max-snippet and data-nosnippet; a connector catalog wanting shorter results should reach for those rather than for a folklore character count.
