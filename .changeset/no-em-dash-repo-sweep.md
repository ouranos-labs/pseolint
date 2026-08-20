---
"@pseolint/core": patch
"@pseolint/mcp": patch
"pseolint": patch
---

Punctuation-only sweep: every em dash in the repo is replaced with the punctuation its context calls for (colon for an elaboration or a "Title: Subtitle" heading, semicolon before an independent clause, comma for a loose afterthought, parentheses for a paired aside, hyphen inside numeric ranges). Rule message and fix strings are affected, so consumers doing exact string matching on finding text should re-check their matchers; rule IDs, severities, thresholds, and every documented URL are untouched.

`scripts/no-em-dash.mjs` is the codemod that did it, kept for future use: `bun run lint:emdash` gates newly added lines in CI, `--write` applies the deterministic tiers, and `--write --fallback` force-resolves the remainder.
