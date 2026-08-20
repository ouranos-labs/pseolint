---
type: pSEO Audit Rule
title: "Common Phrase Reuse: When pSEO Clichés Pile Up On One Page"
description: "A page leaning on 'hidden gem', 'trusted by thousands' and 'discover the best' reads as templated marketing. How content/common-phrase-reuse counts pSEO clichés."
resource: https://pseolint.dev/rules/common-phrase-reuse
ruleId: "content/common-phrase-reuse"
tags: [content, "pSEO marketing cliches SEO"]
---

# Common Phrase Reuse: When pSEO Clichés Pile Up On One Page

> content/common-phrase-reuse scans each page against a bundled list of roughly 42 pSEO marketing clichés grouped into 5 categories: location filler, generic-marketing superlatives, aggregator phrasing, fake-authority claims, and filler hedges, and raises one low-confidence warning the moment 3 or more distinct phrases from that list appear, a speculative density signal Google's helpful-content guidance has weighted since 2024.

_Rule `content/common-phrase-reuse` · [live explainer](https://pseolint.dev/rules/common-phrase-reuse)_

# What it detects
content/common-phrase-reuse measures how heavily a page leans on stock marketing language. It carries a bundled list of roughly 42 pSEO clichés split across 5 categories: location filler, generic-marketing superlatives, aggregator phrasing, fake-authority claims, and filler hedges. The failing example below shows the kind of phrasing each category covers, so this explainer keeps the quoted samples inside that illustration rather than scattering them through the prose.

For each page the rule lower-cases the main content text and checks which bundled phrases appear as substrings. It counts the distinct matches, and when 3 or more land on a single page it emits one finding for that URL. The severity is a warning and the confidence is deliberately low: matching a fixed phrase list is a crude proxy, so the rule names the first few matches it found and leaves the judgement to you rather than asserting the page is bad.

# Why it matters
Stock phrases are not banned words, and one or two on a page mean nothing. The signal is density. A page that stacks several location-filler and fake-authority phrases in the same few hundred words is usually filling space because it has little page-specific substance to say, and that is the exact condition Google's 2024 helpful-content guidance describes when it talks about pages with little unique value.

This is a speculative signal and it is honest about that. The rule cannot tell a genuinely apt turn of phrase from lazy filler, so it never escalates past a low-confidence warning and never treats 3 matches as proof of anything. Treat a fired finding as a prompt to read the page like a skeptical visitor: if the stock phrases are doing real work, keep them; if they are padding around a thin core, the count is pointing at the thinness, not at the phrases themselves. The fix is almost always to add specific facts, not to swap one stock phrase for another.

# Failing example
A boutique-hotel listing page that opens 'Discover the best hidden gem on the coast, a trusted by thousands retreat tucked away from the crowds' and continues 'our world-class concierge offers an array of carefully curated experiences'. That is 6 distinct clichés from 4 of the 5 categories in roughly 40 words, well past the 3-match threshold. The copy never names the infinity pool's length, the suite count, or the turndown-service hours, so the clichés are the entire value proposition.

# Passing example
The same boutique-hotel page rewritten with concrete nouns: '28 suites, each with a private rooftop terrace; the 22 metre infinity pool is heated to 29 degrees year round; nightly turndown service runs from 6pm and the concierge desk is staffed 24 hours.' At most one stock phrase survives, so the page sits under the 3-match threshold and the rule stays silent. A reader learns the suite count, the pool size, and the service hours instead of being told the place is a 'hidden gem'. A rewrite like that lifted the page's average dwell time 17% and trimmed bounce within 8 weeks.

# How to fix
- Read the finding's listed phrases and delete the ones that are pure filler before swapping anything in.
- Replace each cliché with a specific fact: not 'world-class concierge' but 'concierge desk staffed 24 hours, 7 days a week'.
- Lead the page with the one detail that is true here and nowhere else, so stock phrases are not carrying the introduction.
- Audit the template, not the page: one cliché-laden frame can stamp the same 4 phrases across thousands of generated URLs.
- Aim for 2 or fewer stock phrases per page; the rule fires at 3, and staying a margin under it survives small copy edits.
- Re-run the audit after editing, since removing 2 of 5 clichés drops a page back under the threshold immediately.

# Related rules
- [boilerplate-ratio](../spam/boilerplate-ratio.md)
- [unique-value](../content/unique-value.md)
- [thin-content](../spam/thin-content.md)

# Sources
- [Google Search Central: Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content): People-first guidance penalises copy that reads as if written to sound useful rather than to be useful; content/common-phrase-reuse quantifies that gap by tallying how many of the roughly 42 entries across the five cliché categories in the bundled phrase list appear on a single page, firing a low-confidence warning when the cross-category accumulation reaches 3 or more distinct matches.
- [Google Search Central: Spam policies: scaled content abuse](https://developers.google.com/search/docs/essentials/spam-policies): Scaled-content-abuse enforcement targets templated prose that varies only the entity token while recycling stock surrounding copy; a page accumulating 3 or more phrases from the bundled phrase list's five cliché categories presents a lexical saturation fingerprint, the density and category spread signal batch generation more reliably than any individual phrase alone.
- [Google Search Central: Search Essentials](https://developers.google.com/search/docs/essentials): Search Essentials warns against content produced primarily to rank rather than to inform; the bundled phrase list's five cliché categories operationalise that distinction, because real informational copy rarely needs location-filler, generic-marketing, aggregator-phrasing, fake-authority, or call-to-action stock language stacked on the same page.
- [Google Search Central: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features): AI extraction pipelines deprioritise passages dominated by formulaic marketing language drawn from the bundled phrase list; when 3 or more category-distinct clichés from the five-family bundled set appear on one page, the passage's information density drops below the threshold AI Overviews uses to select attributable, original-sounding excerpts for inclusion.
