---
"@pseolint/web": minor
---

Add `/rules` explainer pages for the 11 rules shipped in the folklore-vs-fact batch: `links/crawlable-anchors`, `links/generic-anchor-text`, `content/meta-description-presence`, `tech/language-mismatch`, `tech/hreflang-validity`, `tech/sitemap-hygiene`, `tech/meta-robots-conflict`, `tech/snippet-suppression`, `tech/robots-txt-limits`, `tech/html-size` and `tech/viewport-meta`. `llms.txt` advertised 59 rules while `/rules` indexed 29, so a crawler saw a claim it could not verify; the index, the dynamic route, the sitemap and the JSON-LD all derive from `MARKETING_RULES`, so the entries wire every surface at once.

Each page documents the real implementation (thresholds, severities, and what the rule deliberately skips) and carries a worked example in its own domain, plus per-page authoritative citations. All 11 clear the existing dogfood contract in `marketing-rules.test.ts`, which runs pseolint's own engine over a reconstruction of every reference page: `spam/thin-content`, `content/unique-value`, `content/citation-coverage`, `content/common-phrase-reuse`, `aeo/content-modularity`, `aeo/answer-first`, `content/meta-uniqueness` and `aeo/citable-facts`.
