---
"@pseolint/core": patch
"pseolint": patch
"@pseolint/mcp": patch
"@pseolint/web": patch
"@pseolint/action": patch
---

v0.7.1 — rule false-positive elimination batch (post unique-value design review).

Stops the engine flagging healthy sites without weakening real detection. Each fix
is TDD'd and validated against the reputable-pSEO fixtures.

- **links/orphan-pages, links/cluster-connectivity** — suppressed on sampled crawls
  (the linking/target page is often un-fetched; reliable only on a full crawl).
- **tech/canonical-consistency** — collapse "canonicalizes outside crawl scope" to
  one site-level note when all pages point at the same alternate host (staging/
  preview/localhost), instead of one finding per page; dedup HTTP-vs-HTML.
- **tech/sitemap-completeness** — normalize sitemap URLs before the set-diff (kills
  trailing-slash/query false "missing"); demote the missing aggregate to warning.
- **schema/consistency** — flag @type variance per template cluster (structureSignature),
  not site-wide (was a guaranteed FP on any multi-template site).
- **aeo/crawler-access** — honor robots `Allow` directives per RFC 9309 (allow-all
  no longer reported as fully blocked).
- **Severity/confidence bands** — error/critical demoted to warning on weak or
  forecast signals: thin-content medium band, summary-bait, translation-no-op,
  entity-swap (low mask coverage), soft-404 (OR-weighted confidence model).

Note: bundled as a patch (0.x) despite a behavior/scoring shift and the
`rules.uniqueValueMinWords` → `rules.uniqueValueDensity` config rename.
