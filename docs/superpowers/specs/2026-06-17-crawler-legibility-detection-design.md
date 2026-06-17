# Crawler-Legibility Detection — Design Spec

**Date:** 2026-06-17
**Status:** Approved design, pre-implementation
**Origin:** `docs/case-studies/2026-06-paperforge-csr-bailout-detection-brief.md` (external handoff), re-scoped after codebase audit.

## 1. Problem

A pSEO failure class de-indexed ~5,000 paperforge.dev pages: the page's real value (an interactive tool) rendered only after client hydration, so it was absent from the HTML crawlers and Google's first pass see. Two adjacent failures share the meta-pattern **"the HTML Google indexes ≠ what the developer sees"**:

- **CSR bailout / partial shell** — interactive value (and sometimes content) exists in the hydrated DOM but not the raw server HTML.
- **Soft-404 on synthetic URLs** — unknown URLs return HTTP 200 with a not-found body (PPR streamed a 200 shell before `notFound()`), so crawlers index nonexistent pages.

## 2. The constraint that shapes this design (audit finding)

The brief assumed pseolint has a working `--render` mode producing a rendered DOM, and that the new rule diffs raw-vs-rendered. **It does not.** `renderPages()` (`packages/core/src/renderer.ts:137`) is written but **never called**; `--render` only flips a `RenderMode` label (`auditor.ts:2269`) for state-tracking. Every rule sees only raw, no-JS HTTP HTML (`ParsedPage.html` / `ParsedPage.contentText`, `types.ts`).

A second audit finding constrains the rule's gate: `spam/doorway-pattern` (`rules/spam/doorway-pattern.ts:24-34`) documents the **2026-05-03 calibration finding** — healthy catalogs (Zapier, Segment, Wise) are by-design near-duplicate + entity-swap + identical-structure; structural sameness alone produced a flood of false criticals, so a content-quality gate was required.

**Consequence:** the paperforge *partial* shell (prose present, interactive tool missing) is **not detectable from raw HTML at acceptable false-positive cost**:

1. "Few interactive elements" fires on every healthy Next.js content page.
2. "Near-identical cluster structure" is the exact catalog shape doorway-pattern guards against.
3. "Text in the `self.__next_f` RSC payload but absent from body" does not work — a bailed *client* component's labels live in the JS bundle, not the RSC payload.

The missing content lives in JS that only executes in a browser. Therefore the high-confidence partial-shell detection **requires render** and is deferred to Phase 2. Phase 1 ships only what raw HTML proves honestly, plus the synthetic-probe (which is independently valuable).

## 3. Decisions (locked)

- **Detection approach:** Hybrid — ship raw-detectable value now (confidence `medium`/`high` per signal), design the render-diff as a Phase-2 confidence/coverage upgrade. Do **not** productionize browser rendering in this work.
- **Scope:** both crawler-legibility gaps in this spec — (1) new `tech/csr-bailout` rule, (2) `tech/soft-404` synthetic probe.
- **Dropped from the brief:** the "content-bail" variant (raw 120 words → rendered 1,600). Without render it collapses into the existing `spam/thin-content` rule. The brief's `aeo/non-replicable-value` cross-reference retargets to `aeo/summary-bait` (the rule that absorbed it).

## 4. Component 1 — `tech/csr-bailout` (Phase 1: empty-shell, raw-only)

### 4.1 What it detects
A page served by a client-side framework whose **server HTML body is essentially empty** — the classic blank-SSR SPA shell. Unambiguous and low-FP: no healthy catalog or content page has a near-empty body, so it cannot retrigger the doorway false-positive.

### 4.2 Fire condition (all must hold)
```
hasClientFrameworkMarkers(page.html)         // see 4.3
&& visibleWordCount(page.contentText) < csrShellMaxWords   // default 30
&& interactiveCount(page) === 0              // input/textarea/select/button/form
&& !isErrorPageShape(page)                   // don't double-fire with soft-404
```
- `interactiveCount` is read from the existing `page.structureSignature` tag-counts (`parser.ts:10`), summing `input|textarea|select|button|form`. No re-parse, no new `ParsedPage` field.
- `isErrorPageShape` reuses the soft-404 not-found pattern check so a framework-rendered 404 shell is reported once, as soft-404, not twice.

### 4.3 Framework detection (new helper)
`detectDevServer()` (`fetch-observer.ts:66`) only inspects HTTP *headers*. Add a body-based helper in a new focused module `packages/core/src/framework-detect.ts` — `detectClientFrameworkFromHtml(html): "nextjs" | "react" | "vite" | "astro" | null`:
- **nextjs:** `self.__next_f` / `/_next/static/` / `id="__next"`
- **react:** `id="root"` + a bundled `<script src=...>` and near-empty body
- **vite:** `/@vite/` / `type="module"` chunk markers
- **astro:** `astro-island` / `/_astro/`

Returns `null` when no client-framework marker is present → rule never fires (plain SSR/static = what you see is what crawlers get).

### 4.4 Emission
```ts
{
  ruleId: "tech/csr-bailout",
  severity: "warning",
  confidence: "medium",                 // Phase-1 cap; Phase 2 render-diff upgrades to "high"
  pageUrl: <url>,
  relatedUrls: [<other shells in same cluster>],   // enrich-findings collapses per cluster
  message: "...",
  fix: "...",
}
```
- **Scope:** `"page"` in `RULE_SCOPE` (per-page detectable; runs in diff audits). Cluster collapse is handled post-hoc by `enrich-findings`, same as `spam/doorway-pattern` (emit `pageUrl` + `relatedUrls`).
- **Message:** "`<url>` is served by `<framework>` but its server HTML body is essentially empty (`N` words, 0 interactive elements). Crawlers that don't run JS — and Google's first indexing pass — see a blank shell. Common Next.js App Router causes: `useSearchParams()`/dynamic hooks without a `<Suspense>` boundary (wrap them in a `null`-rendering Suspense child); under `cacheComponents`/PPR, `new Date()`/`Math.random()`/`Date.now()` in a client component's render path drops it from the prerender (move to `useEffect`). **Verify with `next build && next start`, not `next dev` — dev SSR hides this.** Pages with prose but missing interactive value need pseolint `--render` to detect (Phase 2)." Framework-specific hint emitted only for the detected framework.

### 4.5 Site-type weighting
Add a `SCORING_PROFILES.severityOverrides` entry (`auditor.ts` ~194-427), the existing idiom — rule emits native `warning`; profiles remap per site type:
- `programmatic-directory`: full weight (`warning`).
- `small-marketing`: keep at `warning` (a marketing SPA rendering nothing to crawlers is genuinely bad) — do not down-weight the empty-shell case below `warning`.
- `blog` / `docs`: `info` (content-light routes are plausibly intentional there).

### 4.6 Thresholds (configurable via the `thinContentMinWords` mechanism)
Declared in the rules options type (`types.ts`), defaulted in `DEFAULTS` (`auditor.ts:113`), resolved at `auditor.ts:2201`, passed positionally into the rule (as `spam/thin-content` does):
- `csrShellMaxWords` (default `30`).
- Interactive floor fixed at `0` (an empty shell has none; >0 means something rendered).

### 4.7 Phase 2 (design-only, not built now)
When a `renderedHtml` field later exists on `ParsedPage` (requires wiring `renderPages()` into the pipeline — out of scope here):
- Compare raw vs rendered interactive counts and visible word counts.
- Partial-shell detection: `renderedInteractive >= 3 && (rawInteractive === 0 || rawInteractive/renderedInteractive <= 0.10)` → catches paperforge.
- Confirmed pages upgrade `confidence: medium → high`. This is the only place high-confidence partial-shell detection is honest.

## 5. Component 2 — `tech/soft-404` synthetic probe (active)

### 5.1 Gap
`tech/soft-404` (`rules/tech/soft-404.ts`) only inspects already-crawled URLs. It never probes a synthetic invalid URL, so the PPR "200-shell for unknown slug" class (paperforge Bug 3) is invisible.

### 5.2 Mechanism (auditor-side pipeline step)
Rules are pure functions over `ParsedPage[]`; active fetching is a pipeline concern. Add a probe step in the auditor:
1. `detectTemplates(discoveredUrls)` (`template-detection.ts:49`) → `TemplateCandidate[]` (`{signature, urls[], count, ratio}`).
2. For each qualifying cluster (skip `_longtail`), take a representative `candidate.urls[0]`, replace its last path segment with a random nonexistent token (e.g. `pseolint-404-probe-<n>`), preserving the cluster prefix.
3. GET each synthetic URL via the existing robots-respecting fetch path used by the crawler (`cachedFetch`), honoring the same rate-limit/robots/skip rules. One probe per cluster, hard-capped (default `cap = 25`); `log()` the cluster count probed and any cap hit (no silent truncation).
4. Parse each 200 response with `parseHtmlPage` into a synthetic `ParsedPage`, tag it as probe-origin, and run the existing soft-404 detector on it. A 200 + not-found body/title pattern (or a near-identical shell of a real cluster page) → finding.

### 5.3 Emission
Reuse `ruleId: "tech/soft-404"`. Distinguish via message: "`<cluster>` returns HTTP 200 for nonexistent URLs (probed `<synthetic-url>`). Crawlers can index unlimited junk pages. Return a real 404 (edge gate / middleware) for unknown slugs." Severity `warning`, confidence `high` (a synthetic probe returning 200+not-found is direct evidence, not a heuristic).

### 5.4 Gating
- Only probe when the site classifies as `programmatic-directory` (where unbounded soft-404s matter and clusters are well-formed). Skip otherwise.
- Respect `skipDetectedAuth` / `detectAuthPage` so we never probe behind auth.
- Fail-open: a probe network error is logged and skipped, never emitted as a finding (don't punish a transient hiccup).

## 6. False-positive guards (summary)
- `csr-bailout` requires a **near-empty body** → healthy catalogs/content/directories (non-empty bodies) never fire. Framework-gated → static/SSR sites never fire.
- `csr-bailout` defers to `soft-404` on error-page shapes (no double-fire).
- soft-404 probe gated to `programmatic-directory`, auth-skipped, fail-open, capped + logged.

## 7. Files touched
- `packages/core/src/rules/tech/csr-bailout.ts` — **new** rule.
- `packages/core/src/framework-detect.ts` — **new** module: `detectClientFrameworkFromHtml`.
- `packages/core/src/rules/tech/soft-404.ts` — export the existing detector for reuse on probe responses (no behavior change to the crawled-URL path).
- `packages/core/src/auditor.ts` — import + invoke `csr-bailout`; add the synthetic-probe pipeline step; add `SCORING_PROFILES` override; defaults + resolution for `csrShellMaxWords`.
- `packages/core/src/rules/scope.ts` — register `tech/csr-bailout` as `"page"`.
- `packages/core/src/rule-references.ts` — docs URL mapping for `tech/csr-bailout`.
- `packages/core/src/types.ts` — `csrShellMaxWords` in the rules options type.
- Tests + fixtures (§8).
- `CHANGELOG.md` + any rule-count mentions (README / marketing / docs referencing the v0.7.x rule count).

## 8. Tests / fixtures
Under `packages/core/tests/rules/tech/csr-bailout/` (golden raw HTML; no rendered fixtures needed in Phase 1):
1. `empty-shell-next/` — Next markers, body `<div id="__next"></div>` + scripts, ~5 words, 0 inputs → **FLAG** `warning`/`medium`.
2. `healthy-ssr/` — Next markers, full prose + 44 inputs in raw → **no flag**.
3. `content-directory-fp/` — Next markers, differentiated prose per page, 0 inputs, non-empty body → **no flag** (proves the empty-body guard; this is the paperforge partial-shell case Phase 1 deliberately does not catch).
4. `static-no-framework/` — no framework markers, thin body → **never fires**.
5. `error-shell/` — framework + empty body + not-found text → **no `csr-bailout`** (defers to soft-404).

Soft-404 probe tests (mock the fetch path):
6. `probe-200-shell/` — synthetic URL returns 200 + not-found body → **FLAG** `tech/soft-404` `high`.
7. `probe-real-404/` — synthetic URL returns 404 → **no flag**.
8. `probe-non-programmatic/` — small-marketing site → probe skipped entirely.

## 9. Live regression check (post-implementation)
Audit `https://paperforge.dev` (now fixed; 44 inputs in raw server HTML):
- `tech/csr-bailout` must **not** fire (non-empty body + interactive present).
- soft-404 probe of `/templates/<random>` must **not** fire (edge gate now returns real 404).
Both confirm the fixes hold and the rules don't false-positive on a real, healthy programmatic directory in the calibration corpus.

## 10. Out of scope (tracked, not built here)
- Productionizing `--render` (wiring `renderPages()`, retaining `renderedHtml` on `ParsedPage`, perf). Required for Phase 2 partial-shell detection.
- Phase 2 raw-vs-rendered diff for `tech/csr-bailout`.
