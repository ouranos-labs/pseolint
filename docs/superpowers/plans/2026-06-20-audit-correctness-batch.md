# Audit-Correctness Batch (Spec A) — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-06-20-render-mode-and-audit-correctness-design.md` (160fae5)
**Branch:** `feat/web-engine-surfacing` (worktree `D:/phili/SSD_Projects/pseolint-web`)
**Commit cadence:** one commit per task (logical unit). Verify per task; full `apps/web` tsc + tests before the final commit.

Tasks are ordered so dependencies come first (Task 1 → Task 6). Where files don't overlap, tasks may run in parallel; the report page (`r/[slug]/page.tsx`) is touched by Tasks 4, 7, 8 and the dashboard by Task 4, so those are serialized on those files.

---

## Task 1 — core: single-source rule count
**Goal:** export a canonical scored-rule count so the web stops hardcoding "44".
- In `packages/core`, find the scored-rule registry (`RULE_SCOPE` in `src/rules/scope.ts` / the `RULE_IMPACTS`/category map in `auditor.ts`). Determine the count of **scored** rule IDs (exclude internal `audit/*` diagnostics).
- Add `export const SCORED_RULE_COUNT: number` to the public API (`src/index.ts`), derived from the registry (not a literal), with a one-line doc comment.
- **Verify:** `tsc` core; log/confirm the number equals the scored set (sanity-check against the audit's "~48–51"); add/extend a tiny core test asserting `SCORED_RULE_COUNT === <derived length>` so it can't silently drift.
- **Commit:** `feat(core): export SCORED_RULE_COUNT (single source of truth for rule count)`

## Task 2 — run-audit: skip boilerplate + search pages
**Goal:** align code with the AuditOptions doc; sharpen to marketing surface.
- In `apps/web/src/inngest/functions/run-audit.ts` `buildAuditCall`, add `skipBoilerplate: true` and `skipSearchPages: true` to the `auditSource` options (next to `respectNoindex: true`, `skipDetectedAuth: true`).
- **Verify:** tsc apps/web. (Behavior change is intended; no web test asserts page-skip counts.)
- **Commit:** `fix(web): skip cookie/legal + search-result pages in hosted audits`

## Task 3 — run-audit: per-domain sampleSeed (monitoring determinism)
**Goal:** monitored-domain audits sample the same pages each run.
- Add a small pure `hashToInt(s: string): number` (FNV-1a → unsigned 32-bit) helper (e.g. `apps/web/src/lib/audit-defaults.ts` or a new `apps/web/src/lib/seed.ts`).
- In `run-audit.ts`, for **monitored-domain** audit paths (where the host is known and a `monitoredDomains` row exists — re-audit, add-domain, monitoring cron), set `sampleSize`'s companion `sampleSeed: hashToInt(host)`. Public one-shot audits omit it. Thread via `loadAuditEnrichments`/`executeAudit` as cleanest.
- **Verify:** unit test `seed.test.ts` — `hashToInt` is stable (same host → same int across calls) and differs across distinct hosts. tsc apps/web.
- **Commit:** `fix(web): deterministic per-domain sampleSeed for monitoring diffs`

## Task 4 — surface `appliedSeverityDemotions`
**Goal:** show the engine's "rules I softened and why" credibility signal.
- New server component `apps/web/src/components/report/severity-demotions.tsx`: `SeverityDemotions({ summary })` rendering, when `summary.appliedSeverityDemotions?.length`, a compact collapsible (`<details>`): summary line "*N* rules softened by the *{summary.siteClassification?.type}* profile", body = the rule-id list as mono chips. Renders `null` when empty/absent. Match existing report styling (mirror `severity-demotions` neighbors like the classification badge / category block).
- Wire `<SeverityDemotions summary={summary} />` into `r/[slug]/page.tsx` and `dashboard/[host]/page.tsx`, near the category/classification block.
- **Verify:** tsc apps/web; light render test (null when absent, lists rules when present).
- **Commit:** `feat(web): surface appliedSeverityDemotions (which rules the profile softened)`

## Task 5 — copy: rule-count single source of truth (depends on Task 1)
**Goal:** replace the 6+ hardcoded "44".
- Import `SCORED_RULE_COUNT` from `@pseolint/core` and substitute it in: `mcp-server/page.tsx`, `landing/rule-ring.tsx`, `llms.txt/route.ts`, `methodology/page.tsx` (×2), `lib/marketing-source-notes.ts`. Re-grep for any other "44 rules"/"44 SpamBrain" literals and fix them too. (`llms.txt/route.ts` is a route — interpolate the constant into the served text.)
- **Verify:** tsc apps/web; grep guard — no literal "44 rules"/"44 SpamBrain" remains in the updated sites.
- **Commit:** `fix(web): derive the rule count from @pseolint/core (kill the hardcoded 44)`

## Task 6 — copy: methodology "future work" authority correction
**Goal:** stop calling a shipped feature "future work."
- In `methodology/page.tsx` (the "future work" passage, ~lines 603–614), rewrite bring-your-own-authority as a **current** capability (consistent with the same page's FAQ + the settings input + run-audit wiring).
- **Verify:** tsc apps/web; visual read of the passage.
- **Commit:** `fix(web): methodology — bring-your-own-authority is shipped, not future work`

## Task 7 — copy: correct the false "Pro browser rendering" claim (render deferred)
**Goal:** stop advertising a capability that doesn't run (no browser infra).
- In the report's `HowToRead`/`CoverageCallout` (`r/[slug]/page.tsx`) and any other surface promising Pro "browser rendering": drop the claim or reframe render as roadmap (not a present Pro capability). Grep "render"/"browser rendering" across web copy to catch all surfaces.
- **Verify:** tsc apps/web; grep — no surface still implies render is currently available.
- **Commit:** `fix(web): stop advertising render mode until its browser infra ships`

## Task 8 — copy: TruncatedBanner branches on truncatedKind
**Goal:** correct cause for coverage-kind truncation.
- In `r/[slug]/page.tsx` `TruncatedBanner` (~426–447): branch on `summary.truncatedKind` — `"coverage"` → "couldn't reach all sitemap-declared URLs (partial coverage)"; `"backpressure"`/absent → existing "origin degraded under load" copy. Prefer `summary.truncatedReason` when present, falling back to the kind-specific default.
- **Verify:** unit/component test — `coverage` yields coverage copy, `backpressure` yields degraded copy. tsc apps/web.
- **Commit:** `fix(web): TruncatedBanner explains the real truncation cause (coverage vs backpressure)`

## Task 9 — final verification
- `npx tsc --noEmit -p tsconfig.json` in `apps/web` clean.
- Run the targeted tests added (seed, banner, demotions) + ensure existing apps/web suites stay green.
- Grep guard: no stale "44 rules" / "future work" authority / unqualified render-available copy remains.
- (No `bun run build` required at plan-time; Vercel builds on deploy. Optional: a web build if convenient.)

## Out of scope (future specs)
- Render mode + browser infrastructure (CDP endpoint, cost decision).
- R2-backed HTTP cache (Spec B).
