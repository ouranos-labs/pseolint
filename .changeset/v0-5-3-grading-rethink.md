---
"@pseolint/core": patch
"@pseolint/web": patch
---

v0.5.3 — grading rethink: classifier degeneration guard, blocker density floor, verdict/grade alignment.

**Why.** A self-audit on bestfirenze.com (a 6-page tourism directory with 0 unique content per page across `/en` `/fr` `/it` `/de` `/es` locale variants) returned grade B / risk 37 / verdict "caution". Verdict and grade disagreed, and the classifier had labelled the corpus as `small-marketing` — which then demoted `spam/thin-content`, `aeo/citable-facts`, `spam/doorway-pattern`, etc. to `info`. The signals fired correctly; the scoring let them dilute.

**`@pseolint/core`:**
- New `applyDegenerationGuard(classification, corpusStats)` + `corpusStatsFromPages(pages)` exports in `site-classifier.ts`. After the classifier returns `small-marketing` or `blog`, the guard inspects the parsed pages — if median word count < 50 OR ≥50% of pages share an identical title (with ≥4 pages), the classification is downgraded to `unclear` with a `degeneration-guard-tripped` signal. `profileFor()` recognises the signal and returns a no-overrides scoring profile so the natural rule severities fire.
- Blocker DENSITY floor in `scoreFromFindings()`: when `blockers / pageCount` ≥ 0.15 / 0.3 / 0.5, risk is floored at 25 / 45 / 60 respectively. Reputable directories (Zapier, Typeform, Segment) sit at densities <0.05 and are unaffected; bestfirenze.com (5 blockers / 6 pages = 0.83) floors at 60.
- 9 new tests in `tests/site-classifier.test.ts` covering empty corpora, title canonicalisation, type-specific guard behaviour, and the bestfirenze.com replay.

**`@pseolint/web`:**
- `lib/grade.ts` band labels now align with the engine's verdict ladder: B reads "caution" (was "good"), D reads "critical" (was "severe"), tones shift accordingly. A "B 37 / caution" mismatch is no longer possible.
- Vitest now stubs `server-only` (new `tests/server-only-stub.ts` + `vitest.config.ts` alias) so server-side modules load under test. Stale `reserveAnonAuditSlot` import in `audit-rate-limit.test.ts` re-pointed at `lib/anon-rate-limit.ts` (split out in 8499ad9).
