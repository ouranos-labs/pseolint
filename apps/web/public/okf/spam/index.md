---
type: Category
title: "spam rules"
description: "pseolint spam audit rules for programmatic SEO."
resource: https://pseolint.dev/rules
---

# spam rules

- [Thin Content Detection: How Google Catches Low-Substance Pages](./thin-content.md): Google's Helpful Content System (rebuilt August 25, 2022) demoted an estimated 45% of low-effort pages in the March 5, 2024 scaled-content-abuse update: the spam/thin-content rule mirrors that floor by flagging every URL under 300 words of substantive body text (default), after stripping nav and footer chrome via SpamBrain-style readability heuristics.
- [Doorway Pages: How Google Detects Templated Funnels](./doorway-pattern.md): Google has banned doorway pages since the March 16, 2015 Search Central post: pseolint's spam/doorway-pattern rule mirrors SpamBrain's convergence logic by requiring 3 independent signals to stack (SimHash near-duplicate above 0.
- [Near-Duplicate Pages: SimHash, SpamBrain, and the Similarity Threshold](./near-duplicate.md): 85% SimHash similarity is the pseolint default threshold: every page pair at or above that mirrors the near-duplicate canonicalisation ceiling Google's web indexing team has used since adopting Charikar's 2002 SimHash paper in 2007, and which the March 5, 2024 scaled-content-abuse update reaffirmed as policy via SpamBrain's 60-second triage queue.
- [Boilerplate Ratio: When Shared Template Text Eats Your Pages](./boilerplate-ratio.md): 60% is the default boilerplateMaxRatio: pseolint identifies sentence-level blocks appearing on 80%+ of pages, then flags any URL whose word count is dominated by those repeated blocks (warning severity, weight 12).
- [Template Diversity: Why HTML Structure Counts as a Spam Signal](./template-diversity.md): 30% is the default minUniqueRatio threshold: pseolint warns when fewer than 30% of pages carry a structurally distinct HTML skeleton, the floor at which SpamBrain (rebuilt August 25, 2022) starts reading a domain as one template rather than N designed pages.
- [Entity-Swap Pages: When Only the Noun Changes Between URLs](./entity-swap.md): spam/entity-swap masks the variable noun on every page (by default US state names and 5-digit ZIP codes) then computes a 64-bit SimHash of what is left and fires at critical severity when two pages score 95% similarity or higher, the convergence signal Google's SpamBrain has used against entity-swap doorways since the March 5, 2024 scaled-content-abuse update.
- [Publication Velocity: When Your Publish Dates Betray Bulk Generation](./publication-velocity.md): spam/publication-velocity groups your pages by publish date and warns when any single day exceeds the greater of 100 pages or 10% of your whole corpus: the date-stacking signal Google's March 27, 2026 core update tightened against programmatically generated sites.
- [Template Coverage: How Sparse Keyword Matrices Expose pSEO](./template-coverage.md): spam/template-coverage groups URLs in the same directory, masks the entity tokens in each filename, and reports how many of the possible dimension combinations a template actually fills: surfacing, at info severity, the sparse high-dimension matrices Google's March 27, 2026 core update down-weighted on programmatic sites.
