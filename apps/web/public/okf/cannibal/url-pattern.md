---
type: pSEO Audit Rule
title: "URL Pattern Cannibalization: When Two Slugs Are the Same Words Reordered"
description: "Two URLs in one directory built from the same slug words in a different order compete for one query. How cannibal/url-pattern detects token-reorder URL cannibalization."
resource: https://pseolint.dev/rules/url-pattern
ruleId: "cannibal/url-pattern"
tags: [cannibal, "URL cannibalization"]
---

# URL Pattern Cannibalization: When Two Slugs Are the Same Words Reordered

> cannibal/url-pattern splits each URL's last slug on hyphens, sorts the tokens, and flags at info severity any two pages in the same directory whose sorted token sets match exactly: the reordered-slug keyword cannibalization Google has resolved by collapsing competing URLs to one canonical result since well before its March 2026 core update.

_Rule `cannibal/url-pattern` · [live explainer](https://pseolint.dev/rules/url-pattern)_

# What it detects
cannibal/url-pattern looks for two URLs that are, word for word, the same page wearing a different word order. For every page it takes the final path segment (the slug after the last slash, trailing slashes removed) splits it on hyphens, drops empty tokens, and sorts what remains alphabetically. Two slugs that differ only in the order of their words produce an identical sorted token list.

The rule then compares pages pairwise, but only within the same parent directory: the path up to that last slash must match, and it must not be empty. When two distinct URLs in one directory collapse to the same sorted tokens, the rule fires once at info severity, naming both URLs and reporting that they carry the same tokens in a different order. Pages in different directories never compare against each other, and a slug with no tokens is skipped. The match is exact after sorting (not fuzzy) so it fires only when the two slugs really are the same word set reshuffled.

# Why it matters
Two URLs assembled from one word set are two pages chasing a single query. A vintage-synth marketplace that ships /moog-analog-synthesizer and /analog-synthesizer-moog in the same listings directory has not built two products; it has built one product twice and asked Google to choose. The crawler usually does choose; it folds the pair to a single canonical result and splits the link equity, anchor text, and click history that should have accrued to one strong page across two weaker ones.

The damage is quiet because nothing 404s and nothing looks broken. Both pages index, both rank somewhere, and neither ranks as well as the consolidated page would. On a programmatic catalog the reorder is rarely intentional; it usually comes from a slug builder that concatenates attribute tokens in whatever order the data arrives, so /eurorack-modular-oscillator and /oscillator-eurorack-modular both get minted from the same record. The rule sits at info severity because a reordered pair is a signal to consolidate, not proof of spam, but every such pair is link equity you are dividing against yourself.

# Failing example
A vintage-synthesizer marketplace mints two listing URLs from one record: /listings/moog-modular-oscillator and /listings/oscillator-moog-modular. Both live in /listings, and after splitting each slug on hyphens and sorting, both collapse to modular-moog-oscillator, the same three tokens reshuffled. The rule fires at info: 'these URLs have the same tokens in different order'. Google indexed both, picked one as canonical 9 days after launch, and the patch-cable and CV-gate detail on the losing page now earns nothing toward the ranking page.

# Passing example
The same marketplace settles on one canonical slug order for every listing and 301-redirects the reordered twin: /listings/oscillator-moog-modular permanently points at /listings/moog-modular-oscillator. Within the /listings directory no two slugs now share a sorted token set, so the rule stays silent. The MIDI spec, the filter-cutoff range, and the modular-rack photos all consolidate onto one URL, and the page that was splitting equity with its anagram now holds the full signal for the query.

# How to fix
- Pick one canonical token order for every slug your builder emits, so the same record can never mint both /moog-analog-oscillator and /oscillator-moog-analog.
- Add a 301 redirect from the reordered twin to the canonical URL, collapsing the pair into one address before the link equity finishes splitting.
- Set a rel=canonical on any duplicate you cannot redirect, pointing every reordered variant at the single slug you want Google to rank.
- Audit the slug-generation code, not the pages: the reorder almost always comes from a builder concatenating attribute tokens in whatever order the data arrives.
- Sort or fix the token order at write time in your data pipeline, so new listings are minted in canonical order and the pair never appears again.
- Check internal links and your sitemap for both variants, and repoint every reference at the canonical slug so crawlers stop discovering the twin.

# Related rules
- [near-duplicate](../spam/near-duplicate.md)
- [title-uniqueness](../content/title-uniqueness.md)
- [meta-uniqueness](../content/meta-uniqueness.md)

# Sources
- [Google Search Central: Consolidate duplicate URLs (canonicalization)](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls): Google's canonical-URL guidance describes how duplicate or near-duplicate URLs compete for ranking against each other and prompts Google to consolidate them, often discarding the signal of all but one. cannibal/url-pattern surfaces the reordered-slug variant of this: two pages in the same directory whose hyphen-split, alphabetically sorted token sets are identical resolve to the same keyword intent, triggering the same consolidation logic even though neither carries a rel=canonical pointing at the other.
- [Google Search Central: Spam policies: doorways](https://developers.google.com/search/docs/essentials/spam-policies#doorway-pages): Google's doorways policy targets pages built for query permutations that differ only in word arrangement with no substantive change in destination or content. cannibal/url-pattern fires at info severity when two slugs produce an identical sorted token list (/best-cheap-hotel versus /cheap-best-hotel) the exact reordering pattern the doorways guidance would classify as permutation-driven rather than editorially distinct.
- [Google Search Central: Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview): Google's sitemaps documentation recommends submitting only canonical URLs. Including both reordered-slug variants in a sitemap amplifies the cannibalization signal: Google indexes two entries, splits authority between them, and is then more likely to pick neither as the preferred representative. Fixing the slug collision before sitemap submission is the cleaner approach than relying on post-hoc canonicalization hints.
