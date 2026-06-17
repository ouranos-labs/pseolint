---
type: pSEO Audit Rule
title: "Missing Author — Why Anonymous pSEO Pages Fail E-E-A-T"
description: "A missing author E-E-A-T gap is a trust signal Google's raters notice. How content/missing-author flags pages with no byline, meta author tag, schema author, or rel=author link."
resource: https://pseolint.dev/rules/missing-author
ruleId: "content/missing-author"
tags: [content, "missing author E-E-A-T"]
timestamp: 2026-06-17T06:37:51.696Z
---

# Missing Author — Why Anonymous pSEO Pages Fail E-E-A-T

> Google added the second E for Experience to its E-A-T trust framework on December 15, 2022, and content/missing-author mirrors that shift by flagging at warning severity, medium confidence, every page that exposes none of four author signals — a meta author tag, a schema author field, a byline element, or a rel=author link.

_Rule `content/missing-author` · [live explainer](https://pseolint.dev/rules/missing-author)_

# What it detects
content/missing-author checks one thing per page: is there any machine-readable claim of who wrote it? The rule reads four independent author signals the parser extracts and fires only when all four are absent.

The signals are precise. (1) Meta author — a non-empty content value on a `<meta name="author">` tag, after whitespace normalisation, so an empty tag does not count. (2) Schema author — any JSON-LD object on the page that carries an `author` key, which covers Article, BlogPosting, and NewsArticle structured data. (3) Byline element — at least one element whose class contains 'author' or 'byline', or which carries `rel='author'`, catching the visible '.byline' or '.author-name' markup most templates ship. (4) Rel=author link — an `<a rel="author">` or `<link rel="author">` anchor pointing at a profile.

A page passes if even one of the four is present, so the bar is deliberately low. Severity is fixed at warning and confidence at medium, because technical docs, product pages, and pricing pages legitimately omit bylines — attribution matters most on blog and news content where authorship is the primary trust signal.

# Why it matters
Authorship is the cheapest E-E-A-T signal to add and one of the easiest to omit at scale, which is exactly why a fleet of anonymous programmatic pages reads as low-effort to a classifier. Google's Search Quality Rater Guidelines — the document its quality systems are trained to approximate — ask raters to identify who is responsible for a page and judge whether that source has the experience and expertise to write it. A page that names nobody gives the rater, and the classifier, nothing to weigh.

The danger is the pattern, not the single page. One unsigned changelog is fine; ten thousand unsigned 'expert guides' is a corpus that cannot answer the most basic trust question Google asks. This is why the rule escalates its messaging when every page on a site over three pages deep is anonymous, emitting a single site-wide finding that names the count and calls it a site-wide E-E-A-T risk rather than burying it in per-URL noise.

Authorship alone will not rank a thin page, but its absence removes a defence that costs almost nothing to mount and is disproportionately missing on generated content.

# Failing example
/guides/how-to-refinance-a-mortgage — a 900-word 'expert guide' with no `<meta name="author">`, no author field anywhere in its Article JSON-LD, no element classed 'byline' or 'author', and no rel=author link. The page asserts financial expertise in its prose but attributes it to nobody, so a quality rater asked 'who is responsible for this?' has no answer. All four signals are absent and the rule fires at warning.

# Passing example
/guides/how-to-refinance-a-mortgage — the same guide, now signed. The `<head>` carries `<meta name="author" content="Dana Mercer, CFP">`, the Article JSON-LD includes an `author` object with a name and a sameAs profile link, and the visible byline sits in a `<div class="byline">By Dana Mercer</div>` above the lede. Any one of those would satisfy the rule; shipping all three gives both Google and readers a consistent, verifiable source.

# How to fix
- Add a `<meta name="author" content="Full Name">` to every content page's head — it is the single cheapest signal and clears the rule on its own.
- Put the author into your JSON-LD: an Article or BlogPosting node with an `author` object carrying a name and, ideally, a sameAs link to a real profile.
- Render a visible byline in markup the rule recognises — an element classed 'author' or 'byline', or one carrying rel='author' — so humans and the parser see the same attribution.
- Link the byline to a genuine author bio page that documents the writer's relevant experience, not a stub; the link is what turns a name into an E-E-A-T signal.
- Decide which page types actually need authors. Technical docs and pricing pages can stay unsigned; blog, news, and 'guide' content should not, since that is where attribution carries the most trust weight.
- Audit site-wide before launch: if every page is anonymous on a site deeper than three pages, the rule emits one site-level E-E-A-T warning instead of per-URL findings, so fix the template once rather than page by page.

# Related rules
- [thin-content](../spam/thin-content.md)
- [unique-value](../content/unique-value.md)
- [meta-uniqueness](../content/meta-uniqueness.md)

# Sources
- [Google Search Central — Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) — Google's Helpful Content framework asks whether expertise and first-hand experience are evident on the page itself; content/missing-author fires at warning severity when all four machine-readable author signals are absent — a non-empty meta author tag, a JSON-LD schema.org author property, a byline element, and a rel=author link — leaving the classifier with zero attribution evidence.
- [Google Search Central — Search Essentials](https://developers.google.com/search/docs/essentials) — Search Essentials states that Google rewards pages demonstrating genuine subject-matter knowledge; the absence of all four author signals content/missing-author checks means no E-E-A-T claim has been made in any form the parser can extract — no byline, no linked-data attribution, no declarative author meta tag.
- [Google Search Central — Introduction to structured data markup](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data) — Schema.org's Person type exposed via JSON-LD is the most machine-readable authorship assertion available; content/missing-author specifically checks for a JSON-LD object carrying a non-empty author property anywhere in the page's linked-data graph, making a missing schema author field one of its four distinct individually-evaluated failure conditions.
- [Google Search Central — AI features and your website](https://developers.google.com/search/docs/appearance/ai-features) — Google's AI Overviews pipeline preferentially surfaces content with identifiable, attributable authors; when none of the four byline signals passes — not the meta author tag, not the JSON-LD Person node, not the rel=author link, not the in-body byline element — the page is treated as anonymous and deprioritised for passage extraction.
