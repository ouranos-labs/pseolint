---
"@pseolint/core": patch
"pseolint": patch
"@pseolint/mcp": patch
"@pseolint/web": patch
"@pseolint/action": patch
---

fix(core): schema/consistency no longer false-positives on pages with multiple
JSON-LD blocks.

The v0.7.1 per-cluster rewrite compared the UNION of @types across a cluster, so
a template where every page legitimately emits several blocks (e.g. TechArticle +
FAQPage + Organization) read as "mixed types" and fired on every cluster (6 FPs
on pseolint.dev's own audit). Now it compares each page's @type SET signature and
fires only when pages in the same template cluster genuinely disagree.
