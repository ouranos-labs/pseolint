---
type: pSEO Audit Rule
title: "Entity-Swap Pages: When Only the Noun Changes Between URLs"
description: "Entity-swap pages are identical once you mask the swapped city, role, or product. How spam/entity-swap masks entities, then SimHash-fingerprints the rest at 95%."
resource: https://pseolint.dev/rules/entity-swap
ruleId: "spam/entity-swap"
tags: [spam, "entity swap pages SEO"]
---

# Entity-Swap Pages: When Only the Noun Changes Between URLs

> spam/entity-swap masks the variable noun on every page (by default US state names and 5-digit ZIP codes) then computes a 64-bit SimHash of what is left and fires at critical severity when two pages score 95% similarity or higher, the convergence signal Google's SpamBrain has used against entity-swap doorways since the March 5, 2024 scaled-content-abuse update.

_Rule `spam/entity-swap` · [live explainer](https://pseolint.dev/rules/entity-swap)_

# What it detects
spam/entity-swap is the rule that catches the single cleanest fingerprint of programmatic generation: a page whose only real difference from its siblings is the entity you swapped in. The rule masks every page's main content with your entity patterns, the defaults cover all 50 US state names and 5-digit ZIP codes, and you add your own dimensions (cities, SKUs, job titles) in pseolint.config.ts, and then computes a 64-bit SimHash over the masked text.

Masking is what separates this rule from spam/near-duplicate. Near-duplicate hashes the raw text and fires at 85%, so two location pages with genuinely different city paragraphs can slip under its bar. Entity-swap removes the entity tokens first, so if the remaining sentence frames are identical the masked similarity rockets toward 100%. The pairwise O(n²) sweep flags any pair scoring 95% or above at critical severity, and records the pair as a PairMatch that spam/doorway-pattern later consumes as one of the three signals it needs to converge.

# Why it matters
An entity-swap pair is the hardest pattern to defend because it admits what it is. When /plumbers/ohio and /plumbers/nevada say the same thing in the same order with two words changed, there is no argument that the second page serves a need the first does not. Google's classifiers treat the masked-similarity signal as near-conclusive precisely because the false-positive rate is so low: real local pages diverge once you remove the place name, and generated ones do not.

The 95% floor is deliberately conservative so the rule rarely cries wolf, which means a finding is worth acting on the day it appears. Field reports after the March 5, 2024 rollout showed entity-swap clusters losing the bulk of their long-tail impressions inside a 6-week window, and because the pairs feed spam/doorway-pattern, an unaddressed entity-swap problem tends to escalate from a quiet near-duplicate warning into the critical doorway stack that draws manual review.

# Failing example
/grants/small-business-grants-texas and /grants/small-business-grants-florida. Strip 'Texas' and 'Florida' and the two pages are byte-for-byte identical: same 'How to qualify' intro, same three eligibility bullets, same 'Apply before the deadline' close. Masked SimHash similarity 99%. The rule fires at critical and hands the pair to spam/doorway-pattern, where the identical structure and shared meta description complete the three-signal stack.

# Passing example
/grants/small-business-grants-texas and /grants/small-business-grants-florida, rebuilt from a state grants dataset. The Texas page leads with the Texas Enterprise Fund and a franchise-tax exemption; the Florida page leads with the absence of a state income tax and county-level economic-development grants. Different agencies, different dollar amounts, different deadlines. Masked similarity drops to 38% because the sentence frames themselves now differ, not just the state name, and the entity-swap pair never forms.

# How to fix
- Bind real per-entity data, not synonyms. Swapping 'top' for 'best' or rewording a sentence leaves the masked SimHash untouched; the rule already ignores the entity token, so only genuinely different facts move the score.
- Lead each page with the one thing that entity has and its siblings lack (a local statute, a region-specific fee, a SKU's actual spec) so the opening sentence frame diverges, not just the noun.
- Audit your data source for thin records. An entity-swap cluster usually traces back to rows that carry no distinguishing fields; if the data cannot differentiate the page, the page probably should not exist as a separate URL.
- Consolidate entities you cannot differentiate. Five states with identical programs are better served by one page that names all five than five pages that pretend to be different.
- Re-run after each fix. Because the rule is pairwise, breaking one page out of a cluster can drop several findings at once as the remaining pairs fall below 95%.

# Related rules
- [near-duplicate](../spam/near-duplicate.md)
- [doorway-pattern](../spam/doorway-pattern.md)
- [thin-content](../spam/thin-content.md)

# Sources
- [Google Search Central: Spam policies: doorways](https://developers.google.com/search/docs/essentials/spam-policies#doorway-pages): Google's doorway-pages policy targets pages that differ only in a swapped city, state, or product noun, the precise pattern spam/entity-swap detects by masking all 50 US state names and 5-digit ZIP codes before computing a 64-bit SimHash; two pages scoring 95% or higher after masking are structurally identical doorways under that policy definition.
- [Google Search Central: Spam policies: scaled content abuse](https://developers.google.com/search/docs/essentials/spam-policies): The March 5, 2024 scaled-content-abuse update identified entity-swap generation as one of the clearest fingerprints of programmatic spam; the 95% post-masking similarity ceiling the rule enforces is set higher than spam/near-duplicate's 85% threshold because entity replacement is a deliberate evasion strategy: the masking step removes the only variable before the fingerprint comparison runs.
- [Google Search Central: Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content): Google's Helpful Content guidance asks whether a page would exist if search rankings were not the motivation; a URL whose body is indistinguishable from its siblings once the swapped state name or ZIP code is redacted fails that test categorically; the rule's critical-severity firing reflects how directly entity-swap pages violate the 'created for people' criterion.
- [Google Search Central: Spam policies for Google web search](https://developers.google.com/search/docs/essentials/spam-policies): Spam policies treat interchangeable pages targeting query variants ({service} in {state}, {service} near {zip}) as a documented enforcement category; the configurable entity-pattern system that lets you extend beyond US states and ZIP codes to cities, SKUs, and job titles maps each custom dimension to the same convergence check Google's classifier applies to geographic doorway clusters.
