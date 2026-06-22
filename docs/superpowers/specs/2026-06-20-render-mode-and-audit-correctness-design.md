# Audit-Correctness Batch (Spec A) — Design

**Date:** 2026-06-20
**Status:** approved (revised after soundness review), pre-implementation
**Branch:** `feat/web-engine-surfacing` (off `main`; continues the Tier-1 surfacing commit `d8c26aa`)

## Context

A three-way audit (core capability inventory × web pipeline usage × web UI/UX) found the web app under-uses the engine. **Tier 1** (per-template cards on the public report, AI triage root-causes UI, content-effort/authority pills) shipped on this branch (`d8c26aa`). This spec covers the **sound subset of Tier 2 + Tier 3** — the correctness/surfacing gaps that don't require new infrastructure.

### Soundness review — render mode deferred (reversal, with evidence)
Brainstorming chose to build a Pro render-mode toggle. A pre-implementation check **falsified that as shippable**: the hosted app has **no browser runtime** — `apps/web` lists no `playwright-core`/`chromium` runtime dependency (only `@playwright/test` dev dep for e2e), and there is **no CDP endpoint** configured. `run-audit.ts:245` passes `render: render ? {} : undefined`; with no browser, core **degrades gracefully to a static audit**. Building the toggle would therefore ship a Pro feature that silently does nothing — the exact false-promise this audit set out to remove.

**Decision:** render mode needs **browser infrastructure** (a Browserless/Browserbase CDP endpoint + `render.browserWsEndpoint` wiring + a hosting/cost decision) before any toggle is honest. That is its own infra subsystem — **deferred to a future spec, alongside the R2 cache (Spec B).** This spec instead **corrects the copy** that currently promises render (item 4), so we stop advertising a non-functional capability.

### Locked decisions (from brainstorming, as applicable here)
- **skip-flags drift:** fix the **code** — actually skip cookie/legal + search-result pages (the doc's original intent).
- **sampleSeed:** set a stable per-domain seed (monitoring determinism). (The R2 cache half of that decision is Spec B.)

## Goals / Non-goals

**Goals**
- Sharpen hosted audits to marketing surface (skip boilerplate/search pages) — aligning code with its own docs.
- Make monitoring diffs deterministic (stable per-domain `sampleSeed`).
- Surface a computed-but-dark engine output: `appliedSeverityDemotions`.
- Remove stale/contradictory/false copy (rule count, "future work" authority, truncation cause, **the render promise**).

**Non-goals (separate specs / out of scope)**
- Render mode + its browser infrastructure — future infra spec.
- The R2-backed HTTP cache — Spec B.
- Any new engine rules or scoring changes; the AI orchestrator path.

## Design

### 1. skipBoilerplate + skipSearchPages
Set both `true` in `buildAuditCall`'s `auditSource` options (alongside the existing `respectNoindex: true`, `skipDetectedAuth: true`). Cookie/legal/imprint + search-result pages aren't marketing surface; skipping them matches the `AuditOptions` doc comment (which already claims the hosted form does this) and sharpens findings. Behavior change: marginally fewer pages audited; intended.

**Files:** `run-audit.ts` (one block).

### 2. sampleSeed — monitoring determinism
For **monitored-domain** audits (re-audit, add-domain, monitoring cron), set `sampleSeed` to a stable integer derived from the host (a small FNV-1a `hashToInt(host)`), so repeated runs sample the same pages and the diff reflects real content change, not sampling variance. One-shot public audits omit it (single run; variance irrelevant). Derive it where the host is known in `run-audit.ts` (monitored paths).

**Files:** `run-audit.ts` (+ a tiny `hashToInt` helper, with a unit test).

### 3. Surface `appliedSeverityDemotions`
The engine emits `summary.appliedSeverityDemotions` (rule IDs the scoring profile softened) "so users can see the engine's reasoning." Render a compact, collapsible disclosure — "*N* rules softened by the *{siteClassification.type}* profile" with the rule-id list — near the category/classification block on **both** the public report (`r/[slug]`) and the dashboard. Server component; reads the field already present in the R2 summary; renders nothing when the array is empty/absent.

**Files:** new `components/report/severity-demotions.tsx`; wired into `r/[slug]/page.tsx` + `dashboard/[host]/page.tsx`.

### 4. Stale / false-copy fixes
- **Rule count — single source of truth.** Replace the 6+ hardcoded "44 rules" with a value imported from `@pseolint/core`. Add a `SCORED_RULE_COUNT` (or equivalent) export derived from the rule registry / `RULE_SCOPE` (scored set only — exclude internal `audit/*`) if one doesn't exist; the web imports it. Sites to update (from the audit): `mcp-server/page.tsx`, `landing/rule-ring.tsx`, `llms.txt/route.ts`, `methodology/page.tsx` (×2), `marketing-source-notes.ts`. **Derive, never hardcode.**
- **"Future work" authority contradiction.** `methodology/page.tsx` describes bring-your-own-authority as future work; it shipped (FAQ + settings + run-audit all use it). Rewrite that passage to present it as a current capability.
- **Render copy (the deferred-feature correction).** The report's `HowToRead`/`CoverageCallout` (and any other surface) currently promise Pro "browser rendering," which does not run (no browser infra — see review above). Correct these: either drop the claim or frame render as genuinely on the roadmap (not a present Pro capability). Do **not** advertise it as available until the infra spec ships.
- **Truncation banner cause.** `TruncatedBanner` (`r/[slug]/page.tsx`) hardcodes "origin degraded under load." Branch on `summary.truncatedKind`: `"coverage"` → "couldn't reach all sitemap-declared URLs (partial coverage)"; `"backpressure"` (or absent) → the existing degraded-origin copy.

**Files:** `packages/core` (one export if needed), the copy sites listed, `r/[slug]/page.tsx` (banner + render copy), report components for the render claim.

## Testing
- **sampleSeed:** unit test that the host→seed helper is stable (same host → same seed) and varies across hosts.
- **Truncation banner:** component/unit test that `truncatedKind: "coverage"` yields coverage copy and `"backpressure"` yields the degraded-origin copy.
- **Rule-count SOT:** assert the web renders the core-exported count, plus a guard that the literal "44 rules" no longer appears in the updated copy sites.
- **Severity-demotions:** light render test (renders nothing when absent; lists rules when present).
- tsc clean for `apps/web` + any touched package; existing suites stay green.

## Risks
- **skip-flags behavior change:** fewer pages audited could shift a verdict on sites with many legal/search pages. Acceptable (those pages aren't marketing surface); core's calibration ratchet is unaffected.
- **Rule-count export:** must reflect the *scored* rule set (exclude internal `audit/*`) so the public number stays defensible.
- **Render copy:** ensure no surface still implies render is available after the correction (grep for "render"/"browser rendering" claims).

## Deferred (future specs)
- **Render infrastructure + toggle** — provision a browser/CDP endpoint, wire `render.browserWsEndpoint`, Pro-gate it server-side, then add the form + per-domain controls. Its own spec (depends on a hosting/cost decision).
- **R2-backed HTTP cache** — Spec B (core cache-backend interface vs `/tmp` prewarm-flush).
