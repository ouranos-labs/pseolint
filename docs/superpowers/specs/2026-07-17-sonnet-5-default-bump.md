# Sonnet 5 Default Bump + Content-Effort Calibration Gate

**Date:** 2026-07-17
**Scope:** Move the general AI default to `claude-sonnet-5`; keep the content-effort judge on its calibrated model behind a documented gate.

---

## What changed

The anthropic provider default (`adapters/index.ts` → `defaultModel`) moved from `claude-sonnet-4-6` to **`claude-sonnet-5`**. This drives the two paths that have **no calibrated numeric thresholds**:

- **Triage** (`ai/triage.ts`) — groups findings into root causes.
- **Orchestrator** (`ai/orchestrator/*`) — the agentic fix-manifest loop.

Both are quality-only surfaces: Sonnet 5 is a strict upgrade there, cost is bounded by the orchestrator's per-session USD cap, and no threshold depends on the model's output scale. Safe to bump without a calibration run.

## What did NOT change, and why

The **content-effort judge** stays pinned to `claude-sonnet-4-6` via `CONTENT_EFFORT_MODEL` (`auditor.ts`). It was already decoupled (its own literal, not the provider default); this just makes the lock explicit and named.

The judge emits a 0–100 effort score, and the verdict moderator cuts that score at **hard thresholds**:

| Constant | Value | Effect |
|---|---|---|
| `EFFORT_VERY_LOW_AT` | 3 | ≤3 → two-tier escalation ("no-reputable zone") |
| `EFFORT_STRICT_AT` | 5 | ≤5 → escalate one tier (farm cluster) |
| `EFFORT_LENIENT_AT` | 25 | ≥25 → soften one tier (proprietary-data winners) |

These cut points are calibrated to **this model's score distribution** (reputable median ≈ 8.5; leaking farms at 1–3: popularnetworth 1, healthyceleb 2, equityatlas 2, bestprosintown 3; the lowest reputable ≈ 4). Sonnet 5 uses a different tokenizer and adaptive thinking on by default — its effort scores can land on a **different scale**, which would silently move which sites cross 3 / 5 / 25. Bumping the judge without re-deriving the thresholds risks both false escalations (flagging a winner) and recall leaks (missing a farm). So the judge bump is **gated on a calibration run** — which requires an `ANTHROPIC_API_KEY` and live site fetches, and was therefore not executed as part of this change.

## Procedure to complete the judge bump

The infrastructure is already parameterized — this is a two-command validation:

1. **Regenerate the committed score map with the new model** (phase 1 — real LLM, cost-guarded):
   ```
   PSEO_EFFORT_MODEL=claude-sonnet-5 bun run packages/core/scripts/content-effort-validate.ts
   ```
   Writes `packages/core/calibration/content-effort-scores.json` (model + per-site scores). The cost guard now knows Sonnet 5's rate ($3/$15); raise the ceiling with `PSEO_EFFORT_MAX_USD` if needed.

2. **Check the gap still separates cleanly.** In the new scores, the max farm/leaking-farm score must stay strictly below the min reputable score, with the current cuts landing in the gap:
   - farms cluster at/below `EFFORT_VERY_LOW_AT` (3) and `EFFORT_STRICT_AT` (5),
   - reputable sits above them,
   - proprietary-data winners stay at/above `EFFORT_LENIENT_AT` (25).
   If Sonnet 5 compresses or shifts the scale, retune the three constants in `auditor.ts` to the new gap **before** proceeding.

3. **Confirm verdict ceilings still pass** (phase 2 — offline, injects the new scores):
   ```
   bun run scripts/calibration-corpus.ts
   ```
   Every reputable corpus site must stay at or below its `expectedVerdictCeiling`.

4. **Only then** move `CONTENT_EFFORT_MODEL` to `claude-sonnet-5` and update the `--content-effort-model` CLI default text.

## Non-goals

- Retuning the thresholds speculatively — do it against real Sonnet 5 scores, not by guessing.
- Bumping the judge on any provider other than the one whose scores were validated.
