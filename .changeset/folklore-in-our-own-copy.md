---
"@pseolint/web": patch
---

Remove the SEO folklore our own marketing surfaces were publishing. The checklist tools told users to keep titles under 60 characters and meta descriptions between 140 and 155, which is exactly what `docs/folklore.md` and `/research/seo-folklore-vs-google-docs` document as unsupported: Google states no length limit for either, and SERP truncation is display-side cropping rather than an indexing event. Same-origin contradictions are a real citability problem for a product whose pitch is being cited by answer engines.

Rewritten to check what the primary sources actually document (presence, uniqueness, and the quality triggers behind Google's title rewrites) across `/tools/programmatic-seo-checklist` (static + interactive), `/tools/nextjs-programmatic-seo`, and five code comments that carried the same belief. Also corrects blind-spots spec section 1.5, which had listed title-length detection as a gap to close, and drops the unsupported `host:` directive from `robots.txt` (flagged by our own new `tech/robots-txt-limits` rule when auditing pseolint.dev).
