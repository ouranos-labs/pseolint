---
"@pseolint/core": patch
---

A truncated run can no longer present as a confident clean verdict

Found by re-running `pseolint https://paperforge.dev` against the live site: the
backpressure watchdog (correctly) aborts the cold-start origin after ~11 fetches,
but the 1-page salvage was then run through the normal classify → score → verdict
pipeline and emerged as `small-marketing` + suppressed pSEO rules + **`READY ✓`**
— reproducing the original case-study false-negative via the watchdog rather than
via discovery (which works). Two fixes:

- **Classification:** when a run is truncated BEFORE classification (a
  backpressure abort salvaged only a fragment), the site type is forced to
  `unclear` (confidence 0, no rule suppression). Classifying a salvaged fragment
  as a confident `small-marketing` site — and suppressing the pSEO rules off it —
  is what produced the false green.
- **Verdict:** any truncated run's verdict is floored to at least `caution` — it
  can never read `ready`, so the headline matches the partial-coverage banner.

The watchdog itself is unchanged: it exists to protect exactly this origin (its
crawl fans out into uncached DB queries), so it should keep aborting — the fix is
that the salvaged report is now honest about being incomplete.
