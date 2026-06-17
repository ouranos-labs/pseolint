---
type: pSEO Audit Rule
title: "E-E-A-T Signals — When a Page Carries No Evidence of Who Wrote It"
description: "A page with no author, date, about link, or sources looks anonymous. How content/eeat-signals counts 4 trust categories per URL and fires below a 2-of-4 floor."
resource: https://pseolint.dev/rules/eeat-signals
ruleId: "content/eeat-signals"
tags: [content, "E-E-A-T signals SEO"]
timestamp: 2026-06-17T06:37:51.696Z
---

# E-E-A-T Signals — When a Page Carries No Evidence of Who Wrote It

> content/eeat-signals checks four trust categories on every page — an about-page link, an author byline, a published date, and a sources or references marker — then fires at info severity for any URL carrying fewer than 2 of the 4, the anonymity pattern Google's E-E-A-T framework has weighed against pages since its December 2022 Quality Rater Guidelines update.

_Rule `content/eeat-signals` · [live explainer](https://pseolint.dev/rules/eeat-signals)_

# What it detects
content/eeat-signals scores each page against four independent trust categories and counts how many it carries. The first is an about-page link: the rule scans the page's resolved hrefs for any URL matching '/about'. The second is an author signal, satisfied if the page exposes a non-empty author meta tag, a schema.org author, a byline element, or a rel=author link. The third is a published date the parser could extract. The fourth is a 'sources' category, matched when the raw HTML contains any of five patterns: 'last updated', 'last modified', 'reviewed by', 'sources:', or 'references:'.

A page passes if it carries 2 or more of those 4 categories. Any page below that floor is flagged. The rule never inspects the quality of the byline or the accuracy of the date — it only asks whether the markers of accountability are present at all. The point is structural: a page that names nobody, dates nothing, links to no about page, and cites no source is anonymous by construction, and anonymity is the baseline condition Google's trust evaluation reads first.

# Why it matters
E-E-A-T — Experience, Expertise, Authoritativeness, Trustworthiness — is how Google's raters decide whether a page deserves trust, and trust starts with knowing who is speaking. A page with no author, no date, and no sources gives a rater nothing to evaluate, so it defaults to the floor. This rule catches the corpora most prone to that failure: programmatically generated pages, where the template binds entity data into the body but forgets that a real publisher signs its work.

The cost is highest on Your-Money-or-Your-Life topics — health, finance, legal, safety — where Google's guidelines demand visible expertise before a page can rank. But the markers are cheap to add and the absence is conspicuous at scale: ten thousand undated, unsigned pages on one template is a clean tell that no human stood behind any of them. The rule fires at info severity because a single missing signal is guidance, not a verdict — but a whole corpus stuck below the 2-of-4 floor is a structural credibility gap that pairs badly with thin-content or near-duplicate findings on the same pages.

# Failing example
/guides/how-to-refinance-a-mortgage on a programmatically generated finance site. The body is 1,200 words of real advice, but there is no byline, no published or updated date, no link to an about page, and no sources or references block anywhere in the HTML. The page carries 0 of the 4 trust categories. The rule fires at info: '/guides/how-to-refinance-a-mortgage has fewer than 2 out of 4 E-E-A-T signal categories.'

# Passing example
The same refinance guide, reissued with accountability attached: a byline reading 'Reviewed by Dana Okafor, CFP' resolves the author category, a visible 'Last updated March 4, 2026' line satisfies both the date and the 'last updated' sources pattern, and a footer link to /about-our-editorial-team adds the about category. The page now carries 4 of 4 categories, clears the 2-of-4 floor with room to spare, and a rater can see exactly who stands behind the advice.

# How to fix
- Add a real author byline to every template. A meta author tag, a schema.org author property, a visible byline element, or a rel=author link each satisfies the author category — pick one and bind a genuine name, not a brand placeholder.
- Expose a published or updated date. The rule reads the date the parser extracts, so surface a real article:published_time or a visible 'Last updated' line rather than leaving the page undated.
- Link to an about page from the template footer or header. Any href matching '/about' resolves the category, and one shared link covers the whole corpus at once.
- Cite sources where the topic warrants it. A 'Sources:' or 'References:' block, or a 'Reviewed by' line, matches the rule's patterns and gives readers and raters something to verify against.
- Treat a site-wide finding as a template fix, not a per-page chore. When every page is below the floor, the cause is one template missing accountability markers — add them once at the template level and the whole cluster clears.
- Prioritise the fix on Your-Money-or-Your-Life pages first, where Google's guidelines weigh visible expertise most heavily before granting trust.

# Related rules
- [missing-author](../content/missing-author.md)
- [thin-content](../spam/thin-content.md)
- [unique-value](../content/unique-value.md)

# Sources
- [Google Search Central — Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) — Google's helpful-content guidance grounds E-E-A-T in demonstrable page-level evidence — who wrote it, when, and what sources back it up; content/eeat-signals scores these as four discrete binary signals, firing an info note on any URL that satisfies fewer than 2, the anonymity profile that aligns with low E-E-A-T in the December 2022 Quality Rater Guidelines.
- [Google Search Central — Search Essentials](https://developers.google.com/search/docs/essentials) — Search Essentials calls out Experience, Expertise, Authoritativeness, and Trustworthiness as the four quality dimensions Google's ranking systems assess; content/eeat-signals maps three of those dimensions — authorship (Experience/Expertise), publication date (Trustworthiness), and a cited sources marker (Authoritativeness) — into binary pass/fail checks alongside an about-page link.
- [Google Search Central — Introduction to structured data markup](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data) — Structured data is the recommended channel for surfacing authorship and publication metadata in a form parsers can extract without relying on visual layout; content/eeat-signals counts a schema.org author field toward its author signal and a JSON-LD datePublished toward its date signal, rewarding publishers who expose these fields explicitly.
- [Google Search Central — AI features and your website](https://developers.google.com/search/docs/appearance/ai-features) — Google's AI Overviews documentation notes that cited, attributed, and datestamped content is more likely to be surfaced in AI-generated answers; content/eeat-signals' four-category check — about-page link, author byline, publish date, sources marker — directly maps to the trust properties AI extraction pipelines weigh when selecting passages.
