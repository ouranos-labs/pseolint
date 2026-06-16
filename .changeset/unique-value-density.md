---
"@pseolint/core": minor
---

content/unique-value now scores originality as a rarity **density** (normalized-IDF
average over a page's distinct tokens) instead of an absolute count of
exactly-page-exclusive words. This fixes margin instability (the flagged set no
longer "shuffles" when content is added) and false positives on large, tightly-
themed sites — validated against the reputable-pSEO fixtures: doorway/entity-swap
spam fires at density ~0.09 while reputable corpora (incl. paperforge.dev) clear
at ≥0.28, with floors `passBelow 0.20` / `errorBelow 0.12` in the gap.

Config knob renamed: `rules.uniqueValueMinWords: number` →
`rules.uniqueValueDensity: { passBelow, errorBelow }`. The rule signature is now
`uniqueValueRule(pages, { passBelow, errorBelow })`. Borderline pages fire `info`
rather than `error` so a near-miss no longer reads as a ship-blocker.
