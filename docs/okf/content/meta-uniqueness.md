---
type: pSEO Audit Rule
title: "Meta Description Uniqueness — When Snippets Are Templated"
description: "Meta descriptions identical after masking the entity are templated, not written. How content/meta-uniqueness groups masked descriptions and why duplicate snippets hurt."
resource: https://pseolint.dev/rules/meta-uniqueness
ruleId: "content/meta-uniqueness"
tags: [content, "duplicate meta descriptions SEO"]
timestamp: 2026-06-17T06:37:51.696Z
---

# Meta Description Uniqueness — When Snippets Are Templated

> content/meta-uniqueness masks the entity tokens in every page's meta description, lower-cases and trims what remains, and fires an error the moment two or more pages collapse to the same string — the templated-snippet pattern Google has treated as scaled content since the March 5, 2024 spam update.

_Rule `content/meta-uniqueness` · [live explainer](https://pseolint.dev/rules/meta-uniqueness)_

# What it detects
content/meta-uniqueness checks the one piece of copy most teams forget to vary: the meta description. For every page that has one, the rule masks the entity tokens using your entity patterns, then lower-cases and trims the result. Pages whose masked descriptions are byte-for-byte identical are grouped together.

Any group with two or more members fires an error naming the count of pages that share the template. The masking is the important part. A description like 'Compare {tool} against the competition — pricing, features, and migration paths' looks unique on the surface for every tool, but the moment you mask the tool name, all of them collapse to the same sentence. That collapse is the signal: the description was generated from a template, not written for the page. The rule deliberately uses exact-match-after-masking rather than fuzzy similarity, so it only fires when the underlying snippet really is one template wearing different nouns.

# Why it matters
Duplicate meta descriptions waste your single best chance to control how a result looks in the SERP. When Google detects templated or duplicate descriptions it routinely discards them and writes its own snippet from on-page text — so the copy you optimised is replaced by whatever the algorithm grabs. At scale, identical descriptions across a template are also a clean scaled-content tell: a thousand pages with one masked description is a thousand pages a script produced.

Because the meta description is short and structured, it is one of the cheapest signals to get right and one of the most embarrassing to get wrong. A pSEO template that binds real per-entity data into the body but leaves the description as a fixed sentence frame is announcing the template in the one field crawlers read first. Fixing it is low-effort — bind a distinct value into each description — and it clears both this rule and a chunk of the perception that the site is mass-produced.

# Failing example
A jobs board ships 4,000 pages whose descriptions all read 'Find {role} jobs in {city}. Browse openings, salaries, and apply today.' Each looks distinct in the page source, but after masking {role} and {city} every one becomes 'find jobs in. browse openings, salaries, and apply today.' The rule groups all 4,000 and fires error: '4000 pages share the same meta description template after entity masking.'

# Passing example
The same jobs board binds a real per-page figure into each description: 'Compare 312 senior-nurse openings in Austin — median pay $98,000, salaries from $72,000 to $110,000, 41 hiring this week.' After masking the role and city, the descriptions still differ because the counts and salaries differ per page. No two collapse to the same string, the rule stays silent, and the SERP shows the copy the team actually wrote.

# How to fix
- Bind a distinct value into every description. A per-page count, price, date, or named attribute pulled from your data source breaks the masked-match because the variable part survives masking.
- Do not rely on the entity alone. Swapping only the city or role is exactly what the rule masks away; the description must vary on something the mask does not remove.
- Write the description from the page's most specific fact. The best snippets answer 'why this page' in 155 characters — the same discipline that satisfies the rule makes the SERP result more clickable.
- Audit templates, not pages. One bad description template generates thousands of duplicates; fix the template's data binding once and the entire cluster clears.
- Check for empty descriptions too — pages with no meta description are skipped here, but they surface in tech/og-completeness and lose snippet control for a different reason.

# Related rules
- [near-duplicate](../spam/near-duplicate.md)
- [thin-content](../spam/thin-content.md)
- [boilerplate-ratio](../spam/boilerplate-ratio.md)

# Sources
- [Google Search Central — Influencing your title links in search results](https://developers.google.com/search/docs/appearance/title-link) — Google's title-links guidance notes it rewrites snippets when the provided text does not accurately reflect the page; duplicate masked meta descriptions — byte-for-byte identical after entity tokens are removed — are a direct signal that the snippet was templated rather than authored per URL.
- [Google Search Central — Consolidate duplicate URLs (canonicalization)](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls) — When two pages share the same masked meta description, Google's canonicalization system is more likely to collapse them into a single canonical cluster; content/meta-uniqueness fires the error that surfaces this duplication before Google resolves it against the publisher's preferred URL.
- [Google Search Central — Spam policies: scaled content abuse](https://developers.google.com/search/docs/essentials/spam-policies) — The March 5 2024 scaled-content-abuse policy named templated snippets among the signals that betray mass production; content/meta-uniqueness catches the pattern by masking entity tokens and grouping on the normalized residue, so the rule fires even when city names or SKUs make raw strings look different.
- [Google Search Central — Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) — Helpful-content guidance asks whether a page gives readers enough context to decide whether it matches their intent; a meta description that collapses to the same residue as fifty sibling pages provides no such context — it is copy-pasted template text wearing a different noun.
