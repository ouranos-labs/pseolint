---
"@pseolint/core": patch
---

`content/title-uniqueness` now detects an unfilled title slot by its SHAPE rather than only by how short it is.

Removing the folklore character-limit check cost real recall (12 policy sites down to 4), because keyword-stuffed farm titles happened to be long. The replacement had to come from what Google actually documents as title-rewrite triggers, not from restoring a length threshold in a new costume.

Google's title-link page documents replacing the title link "when part of the title text is missing", and its own example is the literal `| Site Name`: the separator and the boilerplate survive, the per-record value does not. The rule could not see that case at all. Its only check was a 10-character floor, and both `| Site Name` and `Equity Atlas -` are comfortably above it, so the shape Google names by example was passing. The `/folklore` page states in public that pseolint checks this trigger; now it does.

The check is structural and indifferent to length: a separator with nothing on one side of it, two separators in a row, an unsubstituted `{{city}}` / `${city}` / `%s` / `[CITY]` placeholder, or a segment that rendered as `undefined` / `null` / `n/a`. Guards are in place for the punctuation this could otherwise tax: `--` as an em dash is not an empty slot, `%` in "10% Off" is not a placeholder, and `null` is only matched as a whole segment so "Understanding null in JavaScript" is left alone.

This recovers one policy site and adds no reputable false positives, so recall goes 4 to 5, not back to 12. The gap is not closed and is not treated as closed. Two candidate extensions were rejected rather than shipped: a stale-year check ("2024 Toyota Camry Review") cannot be told apart from a correct year-scoped page, which describes much of the pSEO corpus this tool serves; and matching boilerplate-stripped titles across a cluster produced a false positive on wise.com, a reputable winner, in testing. No length ceiling returns in any form.
