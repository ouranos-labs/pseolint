---
type: pSEO Audit Rule
title: "Language Mismatch: When the Declared Language Isn't the One You Published"
description: "A Japan travel guide declared ja while shipping Cyrillic body text. How tech/language-mismatch compares your declared language against the script readers actually see."
resource: https://pseolint.dev/rules/language-mismatch
ruleId: "tech/language-mismatch"
tags: [tech, "declared language mismatch SEO"]
---

# Language Mismatch: When the Declared Language Isn't the One You Published

> 70% is the trigger: once that share of a page's script-classified letters belongs to a script no declared language uses, tech/language-mismatch fires an error at high confidence, the threshold that caught a Japan travel guide serving Russian Cyrillic body copy under a self-referencing hreflang="ja", with a 200-letter floor below which the comparison is never attempted.

_Rule `tech/language-mismatch` · [live explainer](https://pseolint.dev/rules/language-mismatch)_

# What it detects
Two declarations are read per page and only two: the `lang` attribute on `<html>`, and the self-referencing hreflang entry whose href matches the page's own URL once trailing slashes are stripped and case is folded. Every other hreflang entry describes an alternate rather than this page, so the rule ignores them, and `x-default` is skipped outright because it names a fallback, not a language. Both values collapse to their primary subtag, so `ja-JP` and `ja` are the same declaration.

The rule then walks the extracted content text character by character, sorting each letter into one of 11 Unicode scripts (Latin, Cyrillic, Greek, Arabic, Hebrew, Han, Hiragana, Katakana, Hangul, Thai, Devanagari) using `\p{Script=…}` property escapes. Characters that match none of the 11 (digits, punctuation, emoji, whitespace) are never counted, so the denominator is letters rather than bytes or words.

Below 200 classified letters the comparison is abandoned: a stub cannot produce a trustworthy script histogram, and a false error on an empty page costs more than a missed one. Above that floor, each declared primary subtag is looked up in a 38-entry table mapping ISO 639-1 codes to the scripts they are normally written in: `ru` to Cyrillic, `ja` to Han plus Hiragana plus Katakana, `ko` to Hangul plus Han, `sr` to both Cyrillic and Latin. A declared language absent from that table is never judged, which is how the rule avoids inventing findings for languages it does not model. Latin is then added to the allowed set for every language unconditionally, so brand names, inline code, and URLs sitting inside Japanese or Thai prose can never push a page toward a mismatch.

Letters in scripts outside the allowed set are summed. When that incompatible share reaches 70% of all classified letters, the rule fires an error at high confidence naming the offending script and the exact percentage. When the dominant script is compatible but one incompatible non-Latin script still covers 30% or more, it fires a warning at medium confidence instead: the side-by-side-translation shape, where Google asks for a single language per page for both content and navigation. Separately, a page that carries hreflang annotations or non-Latin body text while having no `lang` attribute at all produces an info finding. Info is deliberate. Google states it does not use code-level language information such as `lang` attributes, so the attribute is an accessibility signal and the prerequisite for this rule's comparison, never a ranking input.

# Why it matters
Google's multi-regional documentation settles the question directly: page language is determined from visible content, and code-level signals such as the `lang` attribute and the URL are not used. That one sentence is what turns a language mismatch from cosmetic into expensive. The declaration does not lose an argument with the content, it never enters the argument. A page whose `<html lang="ja">` sits above Russian prose is indexed as a Russian page, and every mechanism downstream of the declared value stops working without complaint: the hreflang cluster the page anchors, the localized sitemap that lists it, the language filter a searcher sets in Search settings.

The failure has no error channel. Search Console will not report it, the page returns 200, the HTML validates, and the hreflang block is syntactically perfect. The only symptom visible from outside is that traffic from the intended locale never arrives while impressions accumulate from a country nobody planned for, with a bounce pattern that reads like a ranking problem and is in fact an indexing one. That is why the error tier is pinned at 70%: by the time two-thirds of the rendered letters disagree with the tag, there is no reading of the page under which the declaration is still true.

The 30% warning tier catches a quieter version of the same fault. Pages that run two languages down the same document split their own relevance across two language indexes and win neither cleanly. Google's recommendation is one language per page, with alternates living on their own URLs and connected by hreflang rather than stacked in one file.

# Failing example
`/ja/kyoto-hanami-guide` on a Japan travel guide ships `<html lang="ja">` and a self-referencing `hreflang="ja"` pointing at its own URL, but the body was pasted from an unlocalised Russian feed. Of 4,180 script-classified letters, 3,902 are Cyrillic (93%); the remaining 278 are 210 Latin characters from romanised place names (Fushimi Inari, JR Nara Line) and 68 Han characters in temple names. Declared `ja` permits Han, Hiragana, and Katakana, plus Latin as always, so the incompatible share is 93% and the rule fires an error at high confidence. Google indexes the page as Russian, and the `ja`/`en`/`ko` hreflang cluster it was built to anchor never resolves.

# Passing example
The guide is re-cut into two URLs. `/ja/kyoto-hanami-guide` now carries genuine Japanese copy: of 5,640 classified letters, 5,331 are Hiragana, Katakana, or Han, and 309 are Latin from JR Pass, Wi-Fi, and romanised temple names. Latin is tolerated for every declared language, so the incompatible share is 0% and nothing fires. The Russian text moves to `/ru/kyoto-hanami-guide` with `<html lang="ru">` and its own self-referencing `hreflang="ru"`, where 96% Cyrillic is exactly what the declaration promises, and the two pages now point at each other as alternates that Google can actually act on.

# How to fix
- Decide which side is wrong before you edit anything: if the Russian copy is the real deliverable, move it to its own /ru/ URL and declare ru; if the Japanese page is the deliverable, replace the body rather than the tag.
- Check the self-referencing hreflang as well as the lang attribute. The rule reads both, and a page whose self entry disagrees with its html lang is declaring two languages at once.
- Find the point in the pipeline where a translation can silently no-op. A missing locale key that falls back to the source string is the usual origin of an entire directory of mismatched pages.
- Split side-by-side bilingual documents into one URL per language, each with its own lang declaration, and connect them with hreflang instead of stacking both in one file.
- Add <html lang> everywhere even though it is not a ranking factor: it is an accessibility signal, and it is what lets this rule and your own QA verify locale targeting at all.
- Re-run the audit as each locale ships. The 200-letter floor means near-empty stub translations stay silent until real copy lands, so a clean run on placeholder pages proves nothing.

# Related rules
- [hreflang-validity](../tech/hreflang-validity.md)
- [translation-no-op](../content/translation-no-op.md)
- [regurgitated-content](../content/regurgitated-content.md)

# Sources
- [Google Search Central: Managing multi-regional and multilingual sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites): Google's multi-regional guidance states it does not use code-level language information such as lang attributes or the URL, and detects language from visible content instead; that is the exact asymmetry tech/language-mismatch measures by comparing declared subtags against the Unicode script of the rendered letters. It is also why a missing lang attribute is reported at info severity here rather than as a ranking defect.
- [Google Search Central: Tell Google about localized versions (hreflang)](https://developers.google.com/search/docs/specialty/international/localized-versions): The localized-versions documentation defines the self-referencing annotation that this rule treats as the page's second declaration, alongside html lang; only the entry whose href matches the page's own URL is read, since every other entry describes an alternate. x-default is skipped because it names a fallback rather than a language.
- [Google Search Central: Spam policies: scaled content abuse](https://developers.google.com/search/docs/essentials/spam-policies): The March 5, 2024 scaled-content-abuse policy lists translating content from another source without adding sufficient value as a violation, which is the pipeline failure that most often produces a whole directory of ja declarations sitting over untranslated Cyrillic body text. The 70% incompatible-script threshold is what makes that residue visible from a crawl.
