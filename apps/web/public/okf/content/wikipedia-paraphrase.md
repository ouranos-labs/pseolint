---
type: pSEO Audit Rule
title: "Wikipedia Paraphrase — When Your Page Is Just the Encyclopedia, Reworded"
description: "Paraphrased Wikipedia content adds nothing original. How content/wikipedia-paraphrase measures trigram overlap against a bundled Wikipedia corpus and the 40% threshold it warns at."
resource: https://pseolint.dev/rules/wikipedia-paraphrase
ruleId: "content/wikipedia-paraphrase"
tags: [content, "paraphrased Wikipedia content SEO"]
---

# Wikipedia Paraphrase — When Your Page Is Just the Encyclopedia, Reworded

> content/wikipedia-paraphrase fires a low-confidence warning the moment a page shares 40% or more of its three-word phrases with a bundled Wikipedia reference corpus, the trigram-overlap point at which Google's helpful-content framing reads a URL as reworded encyclopedia rather than the original analysis a March 2024 audit rewards.

_Rule `content/wikipedia-paraphrase` · [live explainer](https://pseolint.dev/rules/wikipedia-paraphrase)_

# What it detects
content/wikipedia-paraphrase asks one narrow question of each page: how much of your prose is just Wikipedia, lightly reworded? The rule tokenises the main content text — lower-cased, punctuation stripped, split on whitespace — and slides a three-word window across it to produce a list of trigrams. Each trigram is checked against a bundled Wikipedia reference corpus stored as a compact bloom filter (65,536 bits, 3 FNV-1a hash functions, roughly a 5% false-positive rate over about 10,000 curated trigrams). The paraphrase rate is the fraction of a page's trigrams that hit the corpus.

When that rate reaches the 0.40 threshold, the rule emits one finding per qualifying page at warning severity and low confidence, reporting the exact overlap percentage so you can sort worst-first. Pages with fewer than three tokens score zero and are skipped. The framing is deliberate: paraphrased encyclopedic content adds nothing original to the web, so a page that is 40% recycled Wikipedia phrasing is, for ranking purposes, a page that already exists.

The heuristic is honest about its limits — it is a low-confidence signal precisely because the corpus is bundled and finite, and a page about a genuinely encyclopedic subject can share common phrasing without copying anything.

# Why it matters
A page can be accurate, well-written, and completely worthless to search at the same time. If everything it says is the Wikipedia article on the subject rephrased, it earns no slot of its own — Google already indexes the source, and the reworded copy adds nothing a searcher could not get upstream. That is exactly the 'made to help search engines, not people' shape the helpful-content framing targets, and recycled encyclopedic prose is one of its cleanest tells.

This rule is orthogonal to content/regurgitated-content. That rule asks whether your pages repeat each other; this one asks whether your page repeats the encyclopedia. A site can pass every internal-duplication check and still be a thin gloss over Wikipedia on every URL — the overlap is with an external source the other rules never see. A 40% trigram match does not prove plagiarism, and the rule never claims it does; it claims the page reads like the encyclopedia, and asks you to look.

The cost of ignoring it is slow. Reworded-reference pages rarely trigger a hard action; they simply never rank, sitting unseen for 6 months while you wonder why traffic flatlined. The fix — replace borrowed phrasing with first-hand observation — is also what makes the page worth visiting.

# Failing example
An amateur paleontology site publishes /fossils/ammonite as a 700-word page. The opening 300 words are the Wikipedia 'Ammonite' article reworded: the Devonian-to-Cretaceous range, the chambered shell and siphuncle, the suture-line classification, all rephrased sentence by sentence with no first-hand content. The trigram check returns a 47% overlap against the bundled corpus and the rule fires a warning: the page is the encyclopedia in different words, so a searcher gains nothing by clicking it over Wikipedia itself.

# Passing example
The same /fossils/ammonite page, rewritten from the collector's own field notes. It opens with the specific roadcut where the author pulled three ammonites from a grey shale sediment layer over 2 weekends, the exact matrix hardness that needed an air-scribe to prep, the iridescent nacre that survived on one specimen and not the others, and a measured 84-millimetre diameter with a photo scale. Encyclopedic background drops to two linked sentences. Trigram overlap falls to 12%, well under the 40% threshold, and the page clears — because almost none of it exists on Wikipedia.

# How to fix
- Lead with first-hand observation the encyclopedia cannot have — the dig site, the exact sediment layer, the prep tools, the measured dimensions of your actual specimen.
- Replace reworded background with two or three linked sentences, then send the reader to Wikipedia for the textbook taxonomy rather than rephrasing it on your page.
- Add page-specific facts that exist nowhere else: your matrix-removal technique, the failed prep that cracked a trilobite, the locality coordinates, the date you collected it.
- Photograph and describe your own material. A theropod tooth you found, scaled and lit, is content no corpus contains; a reworded description of theropod dentition is not.
- Re-run the audit and sort by overlap percentage. Clear pages above 45% first — those are almost entirely reference text and need the most original substance grafted in.
- Treat the warning as a prompt, not a verdict. On a legitimately encyclopedic topic the heuristic can over-fire, so confirm the page actually reads as reworded Wikipedia before rewriting it.

# Related rules
- [regurgitated-content](../content/regurgitated-content.md)
- [unique-value](../content/unique-value.md)
- [near-duplicate](../spam/near-duplicate.md)

# Sources
- [Google Search Central — Spam policies: scaled content abuse](https://developers.google.com/search/docs/essentials/spam-policies) — Scaled-content-abuse policy explicitly names republishing existing information as a production method that yields little added value; content/wikipedia-paraphrase operationalises that risk at a 40% trigram-overlap threshold against a bloom-filter-encoded reference corpus, the point at which lightly reworded encyclopedia prose becomes statistically distinguishable from original analysis.
- [Google Search Central — Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) — People-first guidance asks whether a page delivers insights or synthesis that readers could not easily find elsewhere; a 40%-trigram match against the Wikipedia reference corpus — checked via a 65,536-bit bloom filter with 3 FNV-1a hashes — is the rule's operationalisation of that originality test.
- [Schema.org — full hierarchy of structured-data types](https://schema.org/) — Schema.org vocabulary — Article, DefinedTerm, AboutPage — signals topical authority that Wikipedia paraphrase directly undercuts; content/wikipedia-paraphrase surfaces the trigram-overlap gap so publishers can decide whether to add structured authorship and sourcing before deploying entity-definition pages at scale.
