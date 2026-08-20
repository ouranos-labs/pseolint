# Crawler-Legibility Detection: Design Spec

**Date:** 2026-06-17
**Status:** Approved design, pre-implementation
**Origin:** `docs/case-studies/2026-06-paperforge-csr-bailout-detection-brief.md` (external handoff), re-scoped after codebase audits + a render smoke test.

## 1. Problem

A pSEO failure class de-indexed ~5,000 paperforge.dev pages: the page's real value (an interactive tool) rendered only after client hydration, so it was absent from the HTML crawlers and Google's first pass see. Two adjacent failures share the meta-pattern **"the HTML Google indexes ≠ what the developer sees"**:

- **CSR bailout / partial shell**: interactive value (and sometimes content) exists in the hydrated DOM but not the raw server HTML.
- **Soft-404 on synthetic URLs**: unknown URLs return HTTP 200 with a not-found/shell body (PPR streamed a 200 shell before `notFound()`), so crawlers index nonexistent pages.

## 2. Audit findings that shape this design

**Finding 1, `--render` is unwired, but the renderer works (verified).** `renderPages()` (`renderer.ts:137`) is fully written but **never called**; `--render` only flips a `RenderMode` label (`auditor.ts:2269`). **Smoke test 2026-06-17:** under Node, `renderPages()` rendered a fixture with 0 raw `<input>` into 1 `<input>` + 1 `<button>` post-JS via `page.content()`. It is unwired, not broken. Two prerequisites this work must own:
- **Browser binary:** needs the Chromium revision pinned to the installed `playwright-core` (`npx playwright install chromium-headless-shell`); the renderer already throws a helpful message when it's missing.
- **Node only, not bun:** under bun, launch hangs (CDP-over-pipe handshake times out: bun `child_process` lacks Playwright's pipe fds). pseolint runs under Node, so unaffected; documented so nobody runs the auditor under bun expecting render.

**Finding 2, raw HTML alone cannot detect the partial shell.** A standalone raw-only `tech/csr-bailout` rule fails YAGNI/FP: the empty-shell case already fires `spam/thin-content` (`thin-content.ts:16`, double-report); the partial-shell case (paperforge: substantial prose, tool missing) is indistinguishable from a healthy content/catalog page in raw HTML, "few interactive elements" fires on every Next.js content page, "near-identical cluster structure" is the catalog shape `spam/doorway-pattern` already guards against (`doorway-pattern.ts:24-34`, the 2026-05-03 calibration finding), and the missing content lives in JS bundles. **The honest signal is the raw-vs-rendered diff**, which Finding 1 proves is achievable.

## 3. Decisions (locked)

- **The real CSR-bailout detection is the render diff**: a new `tech/csr-bailout` rule comparing raw vs rendered DOM. High confidence, catches paperforge's partial shell. Gated on `--render` (opt-in; default audits don't render).
- **Wire `renderPages()` into the pipeline** (Finding 1 makes this glue, not infrastructure) and expose the rendered DOM to rules via `ParsedPage.renderedHtml`.
- **Ship the soft-404 synthetic probe** (default-on; independently valuable; catches the 200-shell class).
- **Dropped:** the raw-only thin-content CSR tweak (render supersedes it: render catches empty shells too, at higher confidence); the brief's `aeo/non-replicable-value` cross-ref (now `aeo/summary-bait`).
- **Default-mode behavior:** with render off, empty shells still surface via the existing `spam/thin-content`; `tech/csr-bailout` simply no-ops (no `renderedHtml`).

## 4. Component 1: wire render into the pipeline

### 4.1 ParsedPage
Add `renderedHtml?: string` (`types.ts`). Present only for pages successfully rendered in `--render` mode; absent otherwise.

### 4.2 Auditor wiring (`auditor.ts`)
After pages are crawled+parsed and before rules run, when `options.render` is set:
1. Call `renderPages(pages.map(p => ({ url: p.url })), null, { concurrency, timeoutMs, analyticsMode, extraBlockedHosts })`: live-URL mode (`sourceDir = null`, no `localPath`). `analyticsMode`/`extraBlockedHosts` come from `options.render` (already plumbed from CLI, `cli.ts:484`). `concurrency` reuses the crawl concurrency; `timeoutMs` default `30000`.
2. Match each `{url, html}` back to its `ParsedPage` by `url`; set `page.renderedHtml = html`. Pages the renderer skipped (failed/timeout) get no `renderedHtml` → the rule skips them.
3. Pre-flight: when `--render` is set and neither a browser nor a CDP endpoint is available, surface the renderer's `playwright install` hint at audit start (lift the existing throw into a pre-flight check) instead of failing mid-crawl.

### 4.3 Shared helper (`framework-detect.ts`, new, small)
- `detectClientFrameworkFromHtml(html): "nextjs" | "react" | "vite" | "astro" | null`: body markers (nextjs: `self.__next_f` / `/_next/static/` / `id="__next"`; vite: `/@vite/` / module script; astro: `astro-island` / `/_astro/`; react: `id="root"` + bundled script). Used for the rule's framework-aware remediation.
- `countInteractive(html): number`: cheerio (already a dep) `load(html)("input,select,textarea,button,form").length`. Used symmetrically on raw and rendered HTML.

## 5. Component 2: `tech/csr-bailout` rule (render diff)

### 5.1 Logic (per page; `RULE_SCOPE` = `"page"`)
```
if (!page.renderedHtml) return;            // render off / page skipped → no-op
rawI  = countInteractive(page.html)
rendI = countInteractive(page.renderedHtml)
rawW  = wordCount(stripText(page.html))
rendW = wordCount(stripText(page.renderedHtml))

interactiveBail = rendI >= MIN_INTERACTIVE            // 3
  && (rawI === 0 || rawI / rendI <= RATIO_FLOOR)      // 0.10
contentBail = (rendW - rawW) >= MIN_WORD_DELTA        // 250
  && rawW / Math.max(rendW, 1) <= CONTENT_RATIO_FLOOR // 0.5
if (interactiveBail || contentBail) FLAG
```
Thresholds are named constants with `ponytail:` comments; surface via the rules-options mechanism (like `thinContentMinWords`) only if users need to tune them, not on day one.

### 5.2 Severity / confidence
- `rawI === 0 && rendI >= MIN_INTERACTIVE` → `severity: warning`, `confidence: high` (unambiguous: interactive value entirely absent from server HTML).
- Otherwise interactive-bail → `confidence: high`.
- content-only bail → `confidence: medium` (some hydration-added text is benign).

### 5.3 Emission
```ts
{ ruleId: "tech/csr-bailout", severity: "warning", confidence,
  pageUrl, relatedUrls: [...other bailed pages in cluster], message, fix }
```
- Cluster-collapse via `enrich-findings` (emit `pageUrl` + `relatedUrls`, same shape as `spam/doorway-pattern`) so a 5,600-page network produces one finding per cluster, not per page.
- Message: "`<url>` exposes `<rendered>` interactive elements after hydration but `<raw>` in the server HTML: crawlers (and Google's first pass) see an incomplete/empty shell, making the page look thin or duplicate. Next.js causes: `useSearchParams()`/dynamic hooks without a `<Suspense>` boundary; under `cacheComponents`/PPR, `new Date()`/`Math.random()` in a client render path drops it from the prerender (move to `useEffect`). **Verify with `next build && next start`, not `next dev`.**" Framework hint only when `detectClientFrameworkFromHtml(page.html)` is `nextjs`.

### 5.4 Site-type weighting
`SCORING_PROFILES.severityOverrides` (`auditor.ts` ~194-427): full weight on `programmatic-directory`; down-weight to `info` on `small-marketing` (a deliberately client-only marketing widget is lower-stakes) per the brief.

### 5.5 Registration
`scope.ts` (`"page"`), `rule-references.ts` (docs URL).

## 6. Component 3: `tech/soft-404` synthetic probe (active, default-on)

### 6.1 Gap & signal
`soft404Rule` (`soft-404.ts:27`) only inspects crawled URLs. For a *synthetic* URL we constructed to be nonexistent, the failure is simply: **it returned `200`** (a correct site returns `404`/`410`). No body-text match needed (unlike `soft404Rule`); body text only raises confidence.

### 6.2 Mechanism (auditor-side; rules stay pure)
1. `detectTemplates(discoveredUrls)` (`template-detection.ts:49`) → clusters with URL lists.
2. Per qualifying cluster (skip `_longtail`): take `candidate.urls[0]`, replace its last path segment with a random nonexistent token (`pseolint-404-probe-<n>`), preserving the prefix.
3. GET via the existing robots-respecting central fetch (`cachedFetch`), honoring rate-limit/robots/concurrency. One probe per cluster, hard-capped (default `25`); `log()` count probed + any cap hit.
4. Evaluate (small exported helper in `soft-404.ts`, e.g. `evaluateProbe`): status `200` → finding (`confidence: high` if body matches `SOFT_404_PATTERNS` or is near-empty; else `medium`); `404`/`410`/`3xx` → no finding; network error → skip, logged (fail-open).

### 6.3 Emission & gating
- `ruleId: "tech/soft-404"` (no new id), `severity: warning`. Message names the cluster + probed URL + "return a real 404/410 for unknown slugs."
- Gate to `programmatic-directory`; respect `skipDetectedAuth`/`detectAuthPage`; fail-open. Default-on within those gates (bounded footprint, standard SEO-audit behavior); an opt-out flag is trivial to add later, not built speculatively.

## 7. False-positive guards (summary)
- `tech/csr-bailout` fires only on a real raw-vs-rendered divergence (`MIN_INTERACTIVE` floor + ratio gate) → healthy SSR pages (raw ≈ rendered) never fire; render-off pages no-op.
- soft-404 probe gated to `programmatic-directory`, auth-skipped, capped, logged, fail-open; a rare legit catch-all is itself an SEO smell (`medium` confidence covers it).

## 8. Files touched
- `packages/core/src/renderer.ts`: no logic change; possibly export a `RenderOptions` default. (Pre-flight check may live here or in auditor.)
- `packages/core/src/framework-detect.ts`: **new**: `detectClientFrameworkFromHtml`, `countInteractive`.
- `packages/core/src/types.ts`: `ParsedPage.renderedHtml?: string`.
- `packages/core/src/auditor.ts`: render wiring (§4.2), invoke `csr-bailout`, soft-404 probe step, `SCORING_PROFILES` override, pre-flight browser check.
- `packages/core/src/rules/tech/csr-bailout.ts`: **new** rule.
- `packages/core/src/rules/tech/soft-404.ts`: export `evaluateProbe` (no change to crawled-URL path).
- `packages/core/src/rules/scope.ts`: register `tech/csr-bailout` (`"page"`).
- `packages/core/src/rule-references.ts`: docs URL for `tech/csr-bailout`.
- Tests + fixtures (§9).
- `CHANGELOG.md` + rule-count mentions (README / docs referencing the v0.7.x rule count, since `tech/csr-bailout` is a new id).

## 9. Tests / fixtures
- `tests/renderer.test.ts`: **new**, permanent version of the 2026-06-17 smoke test: a fixture with 0 raw `<input>` renders to ≥1 post-JS (gated to skip cleanly when no browser is installed, so CI without Chromium doesn't fail).
- `tests/rules/tech/csr-bailout.test.ts`: golden raw/rendered `ParsedPage` pairs:
  1. `partial-shell`: raw 0 inputs, rendered 44 → FLAG `high` (paperforge pre-fix shape).
  2. `healthy`: raw 44 inputs, rendered 44 → no flag (paperforge post-fix).
  3. `content-bail`: raw ~120 words, rendered ~1600 → FLAG `medium`.
  4. `render-off`: no `renderedHtml` → no-op.
  5. `spa-marketing`: rendered 1 button (below `MIN_INTERACTIVE`) → no flag.
- `tests/rules/tech/soft-404.test.ts`: probe cases: `probe-200-pattern` (200+not-found → high), `probe-200-shell` (200+empty, no pattern → high; proves status-first beats `soft404Rule`), `probe-real-404` (404 → none), `probe-non-programmatic` (skipped).

## 10. Live regression check (post-implementation)
Audit `https://paperforge.dev` (now fixed; 44 inputs in raw server HTML, edge gate returns real 404):
- `tech/csr-bailout --render` must **not** fire (raw ≈ rendered).
- soft-404 probe of `/templates/<random>` must **not** fire (real 404 now).
If a pre-fix snapshot can be hosted, it **should** fire `tech/csr-bailout` at high confidence, the truest end-to-end validation.

## 11. Out of scope / follow-ups
- Render perf on very large crawls: `--render` is opt-in and concurrency-capped; consider stratified per-cluster render sampling (`stratified-sample.ts`) rather than rendering all N pages. Build only if real audits prove too slow.
- Auto-detecting when `--render` is warranted (the scraper-backlog "JS-render auto-detect"): separate.
