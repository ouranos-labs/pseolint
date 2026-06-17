---
type: pSEO Audit Rule
title: "Translation No-Op — Locale Folders That Were Never Actually Translated"
description: "A /fr/ page identical to /en/ is a wasted hreflang, not a translation. How content/translation-no-op uses SimHash at 95% to catch locale folders that ship untranslated."
resource: https://pseolint.dev/rules/translation-no-op
ruleId: "content/translation-no-op"
tags: [content, "untranslated locale pages SEO"]
---

# Translation No-Op — Locale Folders That Were Never Actually Translated

> content/translation-no-op groups URLs that differ only by a leading locale segment like /en/ or /fr/, computes a 64-bit SimHash of each extracted body, and fires an error the moment any pair scores at or above 95% similarity — the fake-i18n pattern Google has told site owners to fix with real hreflang pairs, not duplicated English.

_Rule `content/translation-no-op` · [live explainer](https://pseolint.dev/rules/translation-no-op)_

# What it detects
content/translation-no-op catches a specific failure of programmatic internationalisation: a site ships /en/, /fr/, /de/ folders that look multilingual in the URL but carry the same untranslated body on every locale.

The rule reads each page's path and matches a leading locale segment with a regular expression covering two-letter codes and region variants — /en/, /fr/, /it/, /fr-ca/. Pages without a locale prefix are skipped. It strips that segment to a base path so /en/openings and /fr/openings both collapse to /openings, then buckets every locale variant under that shared base path. A bucket with fewer than two members is ignored, because one lone locale is not a translation problem.

Within each bucket it computes a 64-bit SimHash from the extracted main content text, measures Hamming distance between every variant pair, and converts that distance to a similarity score in [0,1]. If any pair scores at or above the 0.95 threshold, the rule emits one error per cluster naming the locale count, the base path, and the exact similarity percentage so you can see how identical the variants really are.

# Why it matters
An untranslated locale folder is worse than no locale folder at all. You have paid the full engineering cost of a multilingual URL structure and an hreflang setup, then handed search engines two or more URLs whose bodies are byte-for-byte the same — so the hreflang annotations point at pages that are not actually alternates, and Google falls back to picking one canonical and discounting the rest.

Google's own internationalisation guidance is blunt about this: hreflang exists to connect genuinely translated or regionally-adapted versions, and shipping the source language under a foreign locale tag is a known anti-pattern that wastes crawl budget and confuses the canonical signal. A /fr/ page that is 100% English is not a French page; it is a duplicate wearing a locale costume.

At scale the harm compounds. A template that generates 30 locale folders but only translates 3 of them produces 27 folders of duplicated source-language content, which reads to a classifier exactly like scaled duplication. The error severity here reflects that: this is not a soft suggestion but a structural defect that breaks the one promise a locale URL makes.

# Failing example
An international chess federation ships /en/openings/sicilian-najdorf and /fr/openings/sicilian-najdorf, both serving the same 1,400-word English explainer on the Najdorf gambit — knight to f6, the poisoned-pawn line, the typical rook lift, and the endgame plans. The /fr/ URL carries a French hreflang tag but not one translated sentence; after content extraction the two bodies hit 0.98 SimHash similarity. The rule groups the two locale variants of /openings/sicilian-najdorf and fires error: both share identical content at 98%, so translate the body or consolidate to the canonical version.

# Passing example
The same federation actually translates the page. /en/openings/sicilian-najdorf keeps the English Najdorf walkthrough; /fr/openings/sicilian-najdorf is rewritten in French — la variante Najdorf, le pion empoisonné, le plan de finale — with FIDE-rating context and tournament-pairing examples localised for francophone players. After extraction the two bodies share almost no token shingles and SimHash similarity falls to 0.21, far below the 95% floor. The rule stays silent, the hreflang pair now connects two genuinely distinct translations, and each locale ranks for searchers in its own language.

# How to fix
- Translate the body for real, not just the title and nav — the SimHash is computed on extracted main content, so a translated heading over an English article still trips the rule at 95%.
- If a locale was never meant to ship, delete the untranslated folder and remove its hreflang entry rather than leaving a duplicate live under a foreign tag.
- Where you genuinely cannot translate yet, redirect every untranslated locale variant to the canonical URL and keep hreflang only on the canonical until real translations exist.
- Audit your i18n pipeline for partial coverage: a template that translated 4 of 12 locales leaves 8 folders of duplicated source language that this rule will flag cluster by cluster.
- Re-run after each translation pass — the rule fires once per cluster of near-identical variants, so clearing one base path does not silence the others until their bodies actually diverge.

# Related rules
- [near-duplicate](../spam/near-duplicate.md)
- [unique-value](../content/unique-value.md)
- [meta-uniqueness](../content/meta-uniqueness.md)

# Sources
- [Google Search Central — Tell Google about localized versions (hreflang)](https://developers.google.com/search/docs/specialty/international/localized-versions) — Hreflang is intended to route searchers to a genuinely localised version of a page — content/translation-no-op exposes when that intent is absent: locale folders like /fr/ or /fr-ca/ that score 95% or higher SimHash similarity against their /en/ counterpart are duplicate English masquerading as translated content, making hreflang annotations misleading.
- [Google Search Central — Spam policies: scaled content abuse](https://developers.google.com/search/docs/essentials/spam-policies) — Scaled-content-abuse policy covers any high-volume production method that yields pages with little added value; locale-folder duplication is a scaled pattern — the same body republished under N language prefixes at once — and the 95% SimHash ceiling is the rule's operationalisation of that low-value threshold.
- [Google Search Central — Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) — People-first guidance requires that content serve the actual audience of the page; a /de/ URL whose body is byte-for-byte English fails that test, and content/translation-no-op's SimHash check surfaces those failures before Googlebot assigns them to the wrong regional audience.
