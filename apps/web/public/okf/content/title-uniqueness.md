---
type: pSEO Audit Rule
title: "Title Uniqueness: Missing, Unfilled, and Duplicate Page Titles"
description: "The page title is Google's strongest on-page signal. How content/title-uniqueness flags missing titles, unfilled template fields and duplicates, with no character limit."
resource: https://pseolint.dev/rules/title-uniqueness
ruleId: "content/title-uniqueness"
tags: [content, "duplicate page titles SEO"]
---

# Title Uniqueness: Missing, Unfilled, and Duplicate Page Titles

> content/title-uniqueness rolls three checks into one rule: a missing or empty title, a title short enough to read as a template field that never got filled in, and two or more pages sharing the exact same raw title, and every one of the three maps to a reason Google's title-link documentation gives for replacing your title, none of which is a character count.

_Rule `content/title-uniqueness` · [live explainer](https://pseolint.dev/rules/title-uniqueness)_

# What it detects
content/title-uniqueness runs three checks over the title that the existing meta-description rule never touched. First, a missing title: any page whose <head><title> is absent, empty, or whitespace-only fires an error, because the title is the strongest on-page signal Google ranks against. Second, an unfilled template field: a title under 10 characters fires a warning, because that is the shape of Google's own documented example of a broken title, the literal '| Site Name' left behind when the entity never got bound in. Google rewrites titles like that from the H1 or the anchor text, so the copy you wrote never shows.

Third, exact duplicates. The rule groups every page by its raw, trimmed title string and fires an error the moment two or more pages share one. It does NOT entity-mask the way the meta rule does, 'Slack to Google Sheets' and 'Slack to Airtable' are different raw strings and stay separate, so the rule never false-positives on a legitimate templated catalog whose titles already carry the per-record entity.

There is no fourth check, and in particular there is no maximum. Google's title-link page states that there is no limit on how long a title element can be, and that the title link is truncated in search results as needed, typically to fit the device width. That is display-side cropping, so pseolint flags long titles at no length at all. A tool that warns you at 63 characters has not found a problem.

# Why it matters
The title is the single highest-impact on-page element Google reads, and the failure modes this rule catches each waste it differently. A missing title hands Google a blank where your best keyword should sit, so the engine invents a title link from whatever H1 or anchor text it finds. A near-empty title does the same thing for the same documented reason: Google lists 'when part of the title text is missing' among the conditions under which it stops using your title element, and an unbound template variable is exactly that.

Duplicate titles are the most damaging at scale, and they are documented too: repeated boilerplate across a subset of pages within a site is another listed trigger for a rewrite. When a thousand catalog pages carry one identical title, Google cannot tell them apart in the index, clusters them, and demotes all but one. The fix is cheap and the win is immediate: a unique, well-scoped title per URL is the lowest-effort, highest-return change on most programmatic sites, and it is the one field a crawler reads before anything else on the page.

# Failing example
A SaaS integrations catalog ships 600 pages whose <head><title> is the same literal string on every URL: 'Integrations, Connect Your Tools'. The rule groups all 600 and fires an error: '600 pages share the exact title "Integrations, Connect Your Tools".' A second page in the same crawl carries no <head><title> at all, its only <title> is an inline SVG <title> label on the logo ('Acme logo'), which crawlers do not use as the page title, so that page fires a separate error too.

# Passing example
The same catalog binds the per-record entity into every title: 'Slack to Google Sheets Integration, Sync Messages Automatically' on one page, 'Notion to Airtable Integration, Two-Way Database Sync' on the next. Each title is a real <head><title>, each carries its own entity rather than an unbound placeholder, and each is unique across the crawl because the integration pair survives in the raw string. No group has two members, so the rule stays silent. Note what nobody measured to get there: the longer of those two titles would be fine at twice the length.

# How to fix
- Add a non-empty <head><title> to every page. If a template can render without one, that is the first leak to plug; the title is the field Google reads before any other.
- Bind the per-record entity into the title so duplicates cannot form. A raw string carrying the integration name, currency pair, or city is unique by construction and never groups.
- Expand anything under 10 characters, which is almost always an unbound template variable rather than a deliberate choice. Do not shorten anything: no maximum title length is documented.
- Front-load the distinguishing words. Search results crop the title link to fit the device width, so the entity and primary keyword survive best at the start rather than after a long brand suffix.
- Never treat an inline SVG <title> as the page title. That logo accessibility label is decorative and crawlers ignore it: add a real <head><title> with the page entity instead.
- Re-run the audit after editing a template. Fixing one duplicated title clears the whole group at once, since the rule reports per shared string, not per URL.

# Related rules
- [meta-uniqueness](../content/meta-uniqueness.md)
- [heading-structure](../content/heading-structure.md)
- [thin-content](../spam/thin-content.md)

# Sources
- [Google Search Central: Influencing your title links in search results](https://developers.google.com/search/docs/appearance/title-link): Google's title-links documentation states that the <title> element is the strongest on-page signal it uses to generate the blue link shown on the SERP, and that it rewrites titles shorter than a sentence or absent entirely from the H1 or nearby anchor text; content/title-uniqueness's 10-character warning floor and missing-title error both target the conditions that trigger this rewrite.
- [Google Search Central: Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content): Helpful-content guidance flags pages whose title overpromises or fails to reflect what the page actually delivers; content/title-uniqueness's 70-character ceiling catches titles that are truncated in the SERP, and its duplicate-title check catches template families where every page shares one raw string, a sign that no per-URL editorial decision was made.
- [Google Search Central: Consolidate duplicate URLs (canonicalization)](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls): When two pages carry the same raw title, Google's canonicalization logic has one less signal to differentiate them and is more likely to elect one as the canonical and suppress the other; content/title-uniqueness fires an error for any raw-title collision across the corpus, surfacing this de-duplication risk before Google acts on it.
- [Google Search Central: Spam policies: scaled content abuse](https://developers.google.com/search/docs/essentials/spam-policies): Scaled-content-abuse enforcement looks for mass-produced URL sets that are interchangeable from Google's perspective; a template family where every page shares the identical title (differing only in a city or category variable that was omitted from the <title>) is a textbook scaled-content fingerprint that content/title-uniqueness's collision check is designed to catch.
