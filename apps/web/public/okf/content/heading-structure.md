---
type: pSEO Audit Rule
title: "Heading Structure — Missing, Duplicate, and Unstructured Headings"
description: "Pages with no H1 are a template bug; multiple H1s confuse the topic signal. How content/heading-structure flags missing, duplicate, and unstructured headings."
resource: https://pseolint.dev/rules/heading-structure
ruleId: "content/heading-structure"
tags: [content, "heading structure SEO"]
---

# Heading Structure — Missing, Duplicate, and Unstructured Headings

> content/heading-structure runs three checks on every page Google crawls — a missing H1 fires an error because it is almost always a CMS or template bug, two or more H1 elements raise a warning that the HTML5 outline and accessibility checkers both dislike, and any page past 600 words with no H2 sub-structure emits an info note about Featured Snippet eligibility.

_Rule `content/heading-structure` · [live explainer](https://pseolint.dev/rules/heading-structure)_

# What it detects
content/heading-structure runs three independent checks over every parsed page and emits one finding per problem it sees. First, if a page has zero <h1> elements it fires an error — a page with no top-level heading is almost always a CMS misconfiguration or a template that forgot to render the title, and Google leans on the H1 to disambiguate the page's primary topic when the title tag is weak.

Second, if a page carries more than one <h1>, the rule raises a warning and reports the count. A single H1 per document is the convention every accessibility checker enforces and several SEO heuristics still expect, so multiple H1s read as an ambiguous primary-topic signal.

Third, the rule measures the page's body word count by splitting the main text on whitespace; once that count reaches 600 words and the page has no <h2> at all, it emits an info finding. A long wall of text with no sub-headings is a readability and Featured Snippet problem, not a correctness bug, which is why this third check sits at the gentlest severity.

# Why it matters
Heading hierarchy is one of the few on-page signals that is both machine-read and human-read at once. Google parses the H1 and H2 sequence to build a topic outline of the page, and assistive technology turns the same structure into a navigable table of contents. When the H1 is missing entirely, both readers lose their anchor: the crawler falls back to the title tag or guesses from body text, and a screen-reader user lands on a page with no heading to orient them.

Multiple H1s are a milder failure but a real one. The HTML5 specification's document-outline algorithm tolerates them in theory, yet no mainstream browser ever implemented that algorithm, so in practice the page exposes several competing top-level headings with no defined precedence. That is why the rule treats it as a warning rather than an error — it rarely breaks ranking outright, but it muddies the primary-topic signal and trips accessibility audits.

The 600-word-without-an-H2 case costs you eligibility, not rank. Featured Snippets and the question-answer blocks that feed AI Overviews are extracted from clearly delimited sections; a long page with no H2 gives the extractor nothing to grab, so the content can rank yet never surface in the formats that earn the most visibility.

# Failing example
A pSEO city-services template renders 4,000 pages where the hero block is wrapped in a styled <div> instead of an <h1>, so every page reports zero <h1> elements and fires an error. A handful of long guide pages compound the problem: each runs past 1,800 words of plumbing-permit prose in a single unbroken column with no <h2> anywhere, so they also pick up the 600-word info finding.

# Passing example
The same template, fixed: the hero block is now a single <h1> naming the city and service ('Emergency Plumbers in Austin'), and the long guide pages are broken into <h2> sections — 'Permit requirements', 'Average call-out cost', 'What to ask before hiring'. Every page reports exactly one H1, and no page over 600 words is left without sub-headings, so all three checks pass.

# How to fix
- Add a single <h1> to every page that lacks one — name the page's primary topic in it, since Google uses the H1 to disambiguate when the title tag is unclear.
- Where a page has two or more H1s, keep one and demote the rest to <h2>; the visual size can stay identical via CSS, only the markup level changes.
- Check that your hero title is a real <h1> tag and not a styled <div> or <span> — CSS that merely looks like a heading does not count and still trips the missing-H1 error.
- Break any page over 600 words into sections with <h2> sub-headings; aim for one H2 per distinct idea so Featured Snippet extractors have clear blocks to pull from.
- Fix the template, not the page — a missing or duplicated H1 in a pSEO layout repeats across every generated URL, so one markup change clears the entire cluster at once.
- Re-run the audit after editing the template to confirm all three checks (missing, duplicate, and 600-word-no-H2) clear together.

# Related rules
- [thin-content](../spam/thin-content.md)
- [unique-value](../content/unique-value.md)
- [boilerplate-ratio](../spam/boilerplate-ratio.md)

# Sources
- [Google Search Central — Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) — Google's helpful-content documentation asks whether a page is well-organized and easy for a reader to navigate; content/heading-structure's three independent checks — missing H1 (error), multiple H1 elements (warning), and no H2 sub-structure past 600 words (info) — each correspond to an organizational failure that reduces scannability and signals a CMS or template defect.
- [Google Search Central — Introduction to structured data markup](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data) — The HTML document outline, which structured-data parsers and Google's indexing pipeline both rely on to infer topic hierarchy, depends on correctly ordered heading levels; content/heading-structure's missing-H1 error fires when the top-level heading Google uses to disambiguate the page's primary topic is entirely absent from the DOM.
- [Google Search Central — Influencing your title links in search results](https://developers.google.com/search/docs/appearance/title-link) — Google's title-links guidance explains that when the <title> tag is weak or absent, the H1 is the fallback source for the SERP link; content/heading-structure's H1-missing error directly targets the pages where that fallback does not exist, leaving Google to synthesize a title from anchor text or other less reliable sources.
