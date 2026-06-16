---
"@pseolint/core": patch
"pseolint": patch
"@pseolint/mcp": patch
"@pseolint/web": patch
"@pseolint/action": patch
---

fix(core): v0.7.2 rule-design batch — graded thresholds + presence-quality.

Follow-up to the v0.7.1 FP-elimination batch, addressing the two deferred root
causes (C: binary/absolute thresholds, D: presence-not-quality). Verified
against the 24-fixture calibration corpus: zero new false positives vs the prior
metrics, and the crawl-size verdict flips are gone.

C — binary-threshold redesigns:
- spam/boilerplate-ratio: continuous document-frequency weighting replaces the
  floor(N*0.8)+1 skeleton cliff; 2-band severity. Verdict no longer flips when
  one more sibling page is crawled.
- spam/template-diversity: log-bucketed coarsening of the structureSignature so
  single-template sites with minor chrome variation are no longer read as
  diverse (the exact-count signature shared with near-duplicate/doorway-pattern
  is untouched); confidence band.
- content/value-add: continuous categoriesPresent/4 E-E-A-T sub-score replacing
  the 3-step hard-threshold value; 2-band severity (drops "critical").
- content/wikipedia-paraphrase: min-length guard + threshold 0.40→0.55 above the
  legal/medical topic-overlap baseline; advisory language, stays low-confidence.

D — presence-quality (validate the value, not just its presence):
- schema/required-fields: empty arrays / whitespace / nameless author objects
  count as missing.
- schema/json-ld-valid: @type accepts string OR all-string array
  (["Article","NewsArticle"] no longer false-positives).
- tech/og-completeness: whitespace values count as missing; severity graded
  (title/description warning, image-only info).
- content/eeat-signals: transparency signal reads contentText not raw html;
  about-link must be same-host.
