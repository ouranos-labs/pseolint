---
"@pseolint/web": minor
---

Publish `/folklore`, the list of checks pseolint deliberately does not run. Thirteen widely-repeated SEO rules that Google's own documentation contradicts (title and meta-description character limits, meta keywords, sitemap priority/changefreq, word-count minimums, the "2 MB total site size" misread), each with its primary source, its verdict, and the rule we run instead where a real documented failure sits nearby. Competing tools ship most of these, so refusing them with citations is a positioning asset rather than a missing feature, and it is the natural mirror of the existing blind-spots section on `/methodology`.

The 13 entries live in `apps/web/src/lib/folklore.ts` and are the single source of truth: `bun run gen:folklore` regenerates `docs/folklore.md` from the same array, so the contributor doc and the public page cannot drift. The page carries FAQPage and BreadcrumbList JSON-LD, and is linked from `/methodology`, `sitemap.xml`, and `llms.txt`.
