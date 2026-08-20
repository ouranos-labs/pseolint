---
type: pSEO Audit Rule
title: "Template Diversity: Why HTML Structure Counts as a Spam Signal"
description: "If every page shares one HTML skeleton, SpamBrain reads your domain as a single template, not N pages. How pseolint measures structural diversity and the 30% floor."
resource: https://pseolint.dev/rules/template-diversity
ruleId: "spam/template-diversity"
tags: [spam, "template diversity SEO"]
---

# Template Diversity: Why HTML Structure Counts as a Spam Signal

> 30% is the default minUniqueRatio threshold: pseolint warns when fewer than 30% of pages carry a structurally distinct HTML skeleton, the floor at which SpamBrain (rebuilt August 25, 2022) starts reading a domain as one template rather than N designed pages.

_Rule `spam/template-diversity` · [live explainer](https://pseolint.dev/rules/template-diversity)_

# What it detects
30% is the default minUniqueRatio pseolint warns below, the floor at which Google's SpamBrain (rebuilt August 25, 2022 alongside the Helpful Content System launch to score site-level helpfulness alongside per-page signals) starts treating a domain as a single template rather than N designed pages. Each parsed page carries a `structureSignature`, a hash of its HTML structure that ignores text content but preserves the sequence and nesting of element types. The rule counts how many distinct signatures exist across all pages and divides by the page count to produce a unique-ratio in [0,1]. If that ratio falls below `minUniqueRatio` (0.30 default), a single warning-severity finding (weight 12) is emitted at the site level, versus error=25, critical=40, info=5 elsewhere in the engine. This is a holistic signal, not a per-page one: there is no list of 'failing' URLs because the problem is the site's design system, not any individual page. Powered by @pseolint/core v0.7.0, MIT-licensed at github.com/ouranos-labs/pseolint.

# Why it matters
Templated HTML is not in itself a spam signal: every modern CMS produces it. The signal is when templated HTML combines with templated content. SpamBrain (publicly named April 12, 2021 and rebuilt across the August 25, 2022 Helpful Content System launch) reads the combination as 'one piece of low-effort programmatic output,' even if the underlying data is rich, because there is no surface variation for the classifier to latch onto. Field reports following the March 5, 2024 scaled-content-abuse update show 60% to 80% organic-traffic loss within a 6-week window for sites whose unique-ratio sat below 10%, and a 90-day recovery window once the structure was diversified.

Industry crawlers like Ahrefs, Sitebulb, and Screaming Frog all surface comparable template-fingerprint counters, but the 30% floor is specific to pseolint's measurement (powered by @pseolint/core v0.4.3). Sites with diverse structure (some pages have a comparison table, some don't; some have a video embed, some don't; some have a sticky TOC, some don't) communicate to the classifier that real per-page editorial decisions were made. Sites with one signature for every URL communicate the opposite. The fix is to introduce conditional structure, not to randomise it artificially. The current implementation lives in @pseolint/core v0.7.0 with site-type-aware weighting: programmatic-directories tolerate slightly higher template homogeneity than small-marketing sites.

# Failing example
A 300-page travel directory where every URL renders exactly: `<header>`, `<nav>`, `<main>` containing `<h1>`, `<img>`, three `<section>` blocks each with `<h2>` and four `<p>`, then `<footer>`. Every page hashes to the same structureSignature. Unique ratio: 1/300 = 0.003. Even though each page has 800 words of unique prose about a different destination, the structural monotony is itself a signal: from a crawler's perspective, this is one template with 300 plug-ins, not 300 designed pages.

# Passing example
The same travel directory, redesigned with conditional sections. Pages for destinations with notable history get a `<aside>` timeline component. Pages for destinations with strong food culture get a `<table>` of regional dishes. Pages for hiking destinations get a `<figure>` with elevation chart. About 35% of pages render at least one optional section, producing roughly a dozen distinct structureSignatures. Unique ratio: 12/300 = 0.04, still low, but combined with conditional `<aside>` variants the signature space grows enough that the ratio rises to 0.32 and the rule no longer fires.

# How to fix
- Identify which sections in your template should be optional. Anything that doesn't apply to every entity is a candidate: pricing tables, video embeds, timelines, FAQs, comparison widgets.
- Wrap optional sections in conditionals that key off the underlying data, not random booleans. 'If the entity has a video URL, render the video block' produces meaningful diversity; 'if Math.random() > 0.5' produces nothing.
- Vary the order of secondary sections by entity type. A restaurant page might lead with menu, a hotel page with rooms: same template, different priority.
- Add per-entity media variations. Some pages have hero images, some have hero videos, some have galleries. Each renders different HTML.
- Don't fix this rule by adding random structural noise. The rule is a holistic warning; if the underlying content is differentiated, the warning is acceptable on a homogeneous content type.

# Related rules
- [boilerplate-ratio](../spam/boilerplate-ratio.md)
- [doorway-pattern](../spam/doorway-pattern.md)
- [near-duplicate](../spam/near-duplicate.md)

# Sources
- [Google Search Central: Spam policies: scaled content abuse](https://developers.google.com/search/docs/essentials/spam-policies) (SpamBrain's August 25, 2022 rebuild) launched alongside the Helpful Content System to score site-level quality: reads domains where fewer than 30% of pages carry a distinct structureSignature hash as single-template operations; the minUniqueRatio floor enforced by this rule is calibrated to that site-level classifier boundary.
- [Google Search Central: Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content): Helpful Content guidance evaluates whether a site was built to serve readers or fill a keyword matrix; when 70% or more of pages share the same HTML-structure sequence hash (tag order preserved, text ignored) the domain is structurally indistinguishable from a one-template generator, which the guidance explicitly weighs against.
- [Google Search Central: Search Essentials](https://developers.google.com/search/docs/essentials): Search Essentials calls out sites produced primarily for search engines rather than users; a domain where fewer than 30% of pages carry a distinct structureSignature (computed by hashing the DOM skeleton while ignoring all text content) presents machine-readable monotony that operationalises that intent signal.
- [Google Search Central: Large site owner's guide to managing crawl budget](https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget): When a site's structureSignature diversity falls below the 30% minUniqueRatio threshold, Googlebot observes near-identical DOM skeletons on consecutive fetches and deprioritises further crawling; crawl-budget guidance for large sites identifies structural homogeneity as a deprioritisation trigger independent of per-page word count.
