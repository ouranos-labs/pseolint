---
"@pseolint/core": patch
---

content-effort is now a recall driver, not just a ±1 nudge. When the AI content-effort score is very low (≤3 — below the lowest reputable site in the calibration corpus), the verdict escalates two tiers, so a verbose AI content farm (which defeats the thin-content/unique-value/near-duplicate rules by writing rich, entity-distinct prose) gets flagged on the effort signal alone. Effort 4–5 keeps the conservative ±1 escalation and ≥25 keeps the −1 soften, so reputable low-content directories are unaffected. Raw `risk` is untouched (verdict-only moderation), so CI gates stay deterministic. On the calibration corpus this lifts addressable recall 67%→80% with no new false positives. Only active when `--content-effort` is enabled.
