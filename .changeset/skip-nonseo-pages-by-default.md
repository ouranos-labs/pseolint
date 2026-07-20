---
"@pseolint/core": patch
"pseolint": patch
---

Skip non-SEO pages by default in the engine and CLI. `skipDetectedAuth`, `skipBoilerplate`, and `skipSearchPages` now default to `true` (previously off outside the hosted web form) — auth, cookie/legal/consent/imprint, and internal search-result pages are never SEO targets, so auditing them only added noise. Each remains individually disableable via the new negatable CLI flags `--no-skip-detected-auth`, `--no-skip-boilerplate`, and `--no-skip-search-pages` (the old opt-in `--skip-*` forms are replaced). `respectNoindex` was already on; `skipEmptyBody` stays opt-in via `--skip-empty-body`.

Validated against the calibration fixture corpus: the false-positive rate of these filters is ~0 (`packages/core/calibration/fp-rate.ts`), and a before/after calibration run is identical — same scorecard (P=94% R=65% F1=77%), 31/31 sites pass, zero verdict regressions. The only corpus effect is one legitimate terms-and-conditions page dropped from a site's audit, with no change to that site's verdict.
