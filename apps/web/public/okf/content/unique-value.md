---
type: pSEO Audit Rule
title: "Unique Value: Originality as a Density, Not a Word Count"
description: "Word count is not uniqueness. How content/unique-value scores each page's originality as a rarity density, and why shared, per-axis data barely moves it."
resource: https://pseolint.dev/rules/unique-value
ruleId: "content/unique-value"
tags: [content, "unique content value SEO"]
---

# Unique Value: Originality as a Density, Not a Word Count

> content/unique-value scores how original each page is as a rarity density (every distinct word weighted by how rare it is across the audit, then averaged) and fires when that density falls below the floor, the page-specific-vocabulary test Google's scaled-content-abuse policy has applied since March 5, 2024 when it asks whether a URL adds anything genuinely new.

_Rule `content/unique-value` · [live explainer](https://pseolint.dev/rules/unique-value)_

# What it detects
content/unique-value asks how original a page is relative to its siblings, as a density rather than a raw count. It tokenises each page's main content, lower-cased, split on whitespace, with leading and trailing punctuation stripped so 'word', 'word.' and '(word)' count as one token, and weights every distinct word by how rare it is across the audited set: a word on one page scores 1, a word on every page scores near 0 (normalised inverse document frequency). The page's score is the average of those weights, its unique-content density, between 0 and 1.

A page whose vocabulary mostly repeats across its siblings (boilerplate, shared spec blocks, an entity-swapped template) scores low and fires. Because it is an average, the metric does not punish a page for being short or for living in a large, tightly-themed site, and it does not flip on a one-word margin the way a hard count does. Volume is spam/thin-content's job; exact twins are spam/near-duplicate's; this rule isolates low originality.

# Why it matters
This is the rule that catches the failure thin-content misses. A page can clear the 300-word thin-content floor with room to spare and still be almost entirely boilerplate with an entity swapped in, long, but not original. content/unique-value measures originality directly by asking what vocabulary exists here and nowhere else on your site, which is much closer to how Google decides whether a URL earns its own slot in the index.

The most expensive mistake on programmatic sites is adding real, useful, but per-axis-shared data and expecting it to count. A regulation repeated across every page for that role, a spec block shared across a product line, a city's statutes echoed on each of that city's pages, all genuinely helpful, all shared, all worth zero toward this metric. The words that move it are the page-specific ones: a distinct lead, this record's particular facts, an example that exists only here. That is the difference between a database export and a page worth ranking.

# Failing example
/api/stripe-vs-square and /api/stripe-vs-paypal on a fintech directory. Each is 900 words, comfortably past the thin-content floor. But the shared 'What is a payment API' intro, the identical feature glossary, and the same integration checklist mean roughly 91% of each page's vocabulary also appears on its sibling. Its unique-content density lands near 9% (well under the 20% floor) so the rule fires error, because a reader gains little from the second page that the first did not already give them.

# Passing example
The same two pages, rebuilt so each leads with provider-specific material: real Stripe Radar fraud-tooling detail on one, Square's in-person hardware fees on the other, each with its own code sample and pricing edge cases. The shared glossary moves to a linked reference page. Now around 64% of each page's vocabulary is distinctive rather than echoed across siblings (its unique-content density clears the 20% floor with room to spare) and the rule passes.

# How to fix
- Write a page-specific lead. The fastest way to raise density is an opening paragraph true of this entity and nothing else. Boilerplate intros are the first thing to cut.
- Move shared blocks to a shared URL. A glossary, a methodology note, or a legal disclaimer that repeats across pages should live on one page the others link to, not embedded everywhere where it dilutes uniqueness.
- Stop expecting per-axis data to count. Content repeated across pages on the same axis (a role's regulations across that role's documents) is common vocabulary and barely moves density. Only text specific to this page raises it.
- Bind distinct records, not shared ones. If two pages pull the same fields from your data source, they will share vocabulary; differentiate the records or merge the pages.
- Read the density and overlap the finding reports. It tells you how distinctive the page is and confirms the problem is overlap, not length.

# Related rules
- [thin-content](../spam/thin-content.md)
- [boilerplate-ratio](../spam/boilerplate-ratio.md)
- [near-duplicate](../spam/near-duplicate.md)

# Sources
- [Google Search Central: Spam policies: scaled content abuse](https://developers.google.com/search/docs/essentials/spam-policies): The March 5, 2024 scaled-content-abuse update added the criterion that individual pages must carry 'very little unique value' to qualify as spam; content/unique-value operationalises that standard by counting only words present on no sibling page in the audit, firing an error when the page-exclusive token tally falls below the 100-word floor.
- [Google Search Central: Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content): Helpful Content guidance asks whether a URL delivers original information beyond what neighbouring pages already say; the rule answers that mechanically: lower-casing tokens, stripping leading and trailing punctuation so 'word.', '(word)', and 'word' resolve to one token, then cross-referencing a cross-audit frequency map to isolate page-exclusive vocabulary.
- [Google Search Central: Spam policies: doorways](https://developers.google.com/search/docs/essentials/spam-policies#doorway-pages): Doorway policy requires that pages differ substantively from their template siblings; a page whose page-exclusive token count falls below 100 after shared boilerplate is subtracted has, by definition, no vocabulary that is not already present across the cluster, the lexical fingerprint doorway enforcement targets most directly.
- [Google Search Central: Consolidate duplicate URLs (canonicalization)](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls): Google's canonicalisation logic favours URLs with the most distinctive content when collapsing near-duplicate clusters; a page below the 100 unique-word floor lacks the page-exclusive signal vocabulary that would distinguish it from siblings, accelerating the canonicaliser's decision to suppress it in favour of a more-distinctive sibling.
