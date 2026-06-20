# Render Mode + Audit-Correctness Batch (Spec A) — Design

**Date:** 2026-06-20
**Status:** approved, pre-implementation
**Branch:** `feat/web-engine-surfacing` (off `main`; continues the Tier-1 surfacing commit `d8c26aa`)

## Context

A three-way audit (core capability inventory × web pipeline usage × web UI/UX) found the web app under-uses the engine. **Tier 1** (per-template cards on the public report, AI triage root-causes UI, content-effort/authority pills) shipped on this branch (`d8c26aa`). This spec covers **Tier 2 + Tier 3**: closing the remaining capability/contradiction gaps that don't require new architecture.

The one architectural item — an **R2-backed HTTP cache** (Vercel's filesystem is ephemeral; core's cache is `dir`-based) — is deliberately **deferred to Spec B** so it gets its own design. Everything else lives here.

### Locked decisions (from brainstorming)
- **Render mode:** Pro-only, exposed on **both** the audit form and a per-domain setting.
- **skip-flags drift:** fix the **code** — actually skip cookie/legal + search-result pages (the doc's original intent).
- **sampleSeed:** set a stable per-domain seed (monitoring determinism). (The R2 cache half of that decision is Spec B.)

## Goals / Non-goals

**Goals**
- Make the advertised "Pro browser rendering" real (render is plumbed to `auditSource` but no UI sets it).
- Sharpen hosted audits to marketing surface (skip boilerplate/search pages) — aligning code with its own docs.
- Make monitoring diffs deterministic (stable per-domain `sampleSeed`).
- Surface two computed-but-dark engine outputs: `appliedSeverityDemotions`.
- Remove stale/contradictory copy (rule count, "future work" authority, truncation cause).

**Non-goals (Spec B / out of scope)**
- The R2-backed HTTP cache (`cache` option wiring) — separate spec.
- Any new engine rules or scoring changes.
- Reworking the AI orchestrator path.

## Design

### 1. Render mode (Pro) — form + per-domain setting
The engine already accepts `render` and run-audit forwards `RunAuditInput.render` → `auditSource(..., { render: render ? {} : undefined })`. Two entry points gain a control; both gate on Pro.

- **Audit form (one-shot):** add a "Render JS-heavy pages (browser)" checkbox to the public audit form, shown/enabled **only for Pro sessions**. It sets `render: true` in the `POST /api/audits` body (already typed `render?: boolean`). The route must **enforce** the gate server-side: ignore/reject `render: true` from non-Pro callers (don't trust the client). Anon/free see the option disabled with a "Pro" affordance (reuse the existing Pro-badge/paywall pattern, e.g. `export-menu.tsx`).
- **Per-domain setting (monitoring + re-audit):** add a nullable `renderMode boolean` column to `monitored_domain` (additive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS render_mode boolean`, applied directly per the push-managed-prod gotcha; default off). A toggle in the per-domain Pro settings page persists it. `loadAuditEnrichments` reads it; `executeAudit` enables render when `input.render || domainRenderMode`.
- **run-audit wiring:** `buildAuditCall` already maps `render` → `{}`. Thread the per-domain value into the `render` decision.

**Files:** `api/audits/route.ts` (Pro gate), the audit form component(s), `dashboard/[host]/settings/{page.tsx,actions.ts}`, `db/schema.ts`, `run-audit.ts` (`loadAuditEnrichments` + the render decision).

### 2. skipBoilerplate + skipSearchPages
Set both `true` in `buildAuditCall`'s `auditSource` options (alongside the existing `respectNoindex: true`, `skipDetectedAuth: true`). Cookie/legal/imprint + search-result pages aren't marketing surface; skipping them matches the `AuditOptions` doc comment (which already claims the hosted form does this) and sharpens findings. Behavior change: marginally fewer pages audited; acceptable and intended.

**Files:** `run-audit.ts` (one block).

### 3. sampleSeed — monitoring determinism
For **monitored-domain** audits (re-audit, add-domain, monitoring cron), set `sampleSeed` to a stable integer derived from the host (e.g. a small FNV-1a/`hashToInt(host)`), so repeated runs sample the same pages and the diff reflects real content change, not sampling variance. One-shot public audits omit it (single run; variance irrelevant). The seed lives where the host is known — derive it in `run-audit.ts` (monitored paths) or pass it from the monitored-domain enrichment.

**Files:** `run-audit.ts` (+ a tiny `hashToInt` helper).

### 4. Surface `appliedSeverityDemotions`
The engine emits `summary.appliedSeverityDemotions` (rule IDs the scoring profile softened) "so users can see the engine's reasoning." Render a compact, collapsible disclosure — "*N* rules softened by the *{siteClassification.type}* profile" with the rule-id list — near the category/classification block on **both** the public report (`r/[slug]`) and the dashboard. Server component; reads the field already present in the R2 summary; renders nothing when the array is empty/absent.

**Files:** new `components/report/severity-demotions.tsx`; wired into `r/[slug]/page.tsx` + `dashboard/[host]/page.tsx`.

### 5. Stale-copy fixes
- **Rule count — single source of truth.** Replace the 6+ hardcoded "44 rules" with a value imported from `@pseolint/core`. Add a `SCORED_RULE_COUNT` (or equivalent) export derived from the rule registry / `RULE_SCOPE` if one doesn't exist; the web imports it. Sites to update (from the audit): `mcp-server/page.tsx`, `landing/rule-ring.tsx`, `llms.txt/route.ts`, `methodology/page.tsx` (×2), `marketing-source-notes.ts`. The exact number is whatever the export yields — **derive, never hardcode**.
- **"Future work" authority contradiction.** `methodology/page.tsx` describes bring-your-own-authority as future work; it shipped (FAQ + settings + run-audit all use it). Rewrite that passage to present it as a current capability.
- **Truncation banner cause.** `TruncatedBanner` (`r/[slug]/page.tsx`) hardcodes the "origin degraded under load" explanation. Branch on `summary.truncatedKind`: `"coverage"` → "couldn't reach all sitemap-declared URLs (partial coverage)"; `"backpressure"` (or absent) → the existing degraded-origin copy.

**Files:** `packages/core` (one export if needed), the 6 copy sites, `r/[slug]/page.tsx` (banner).

## Testing
- **Render gate:** a server-side test that `POST /api/audits` with `render: true` from a non-Pro caller does not enable render (gate enforced server-side, not just UI-disabled).
- **sampleSeed:** unit test that the host→seed helper is stable (same host → same seed) and varies across hosts.
- **Truncation banner:** component/unit test that `truncatedKind: "coverage"` yields coverage copy and `"backpressure"` yields the degraded-origin copy.
- **Rule-count SOT:** assert the web renders the core-exported count (and a guard that the literal "44 rules" no longer appears in the updated copy sites).
- **Severity-demotions + render setting:** light render tests (renders nothing when absent; toggle persists).
- tsc clean for `apps/web` + any touched package; existing suites stay green.

## Risks
- **Render cost/abuse:** Playwright is slow + egress-heavy. Mitigated by the **server-side Pro gate** (not just a disabled checkbox) and render staying opt-in/off by default.
- **skip-flags behavior change:** fewer pages audited could shift a verdict on sites with many legal/search pages. Acceptable (those pages aren't marketing surface); covered by the existing calibration ratchet in core (unchanged here).
- **Prod DB column:** `render_mode` must be applied to prod via direct `ALTER ... IF NOT EXISTS` (drizzle-kit push-managed), like the `authority_score` column.
- **Rule-count export:** must reflect the *scored* rule set (exclude internal `audit/*`), so the public number stays defensible.

## Deploy gates (carry into the plan)
- `ALTER TABLE monitored_domain ADD COLUMN IF NOT EXISTS render_mode boolean;` on web prod before the per-domain setting ships.
- Render adds real Playwright cost on Pro audits — confirm the hosting/browser endpoint supports it before enabling broadly.
