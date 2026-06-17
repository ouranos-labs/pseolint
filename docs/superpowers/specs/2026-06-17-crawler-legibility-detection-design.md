# Crawler-Legibility Detection — Design Spec

**Date:** 2026-06-17
**Status:** Approved design, pre-implementation
**Origin:** `docs/case-studies/2026-06-paperforge-csr-bailout-detection-brief.md` (external handoff), re-scoped twice after codebase audits.

## 1. Problem

A pSEO failure class de-indexed ~5,000 paperforge.dev pages: the page's real value (an interactive tool) rendered only after client hydration, so it was absent from the HTML crawlers and Google's first pass see. Two adjacent failures share the meta-pattern **"the HTML Google indexes ≠ what the developer sees"**:

- **CSR bailout / partial shell** — interactive value (and sometimes content) exists in the hydrated DOM but not the raw server HTML.
- **Soft-404 on synthetic URLs** — unknown URLs return HTTP 200 with a not-found/shell body (PPR streamed a 200 shell before `notFound()`), so crawlers index nonexistent pages.

## 2. Two audit findings that shape (and shrink) this design

**Finding 1 — `--render` is unwired, but the renderer itself works.** `renderPages()` (`renderer.ts:137`) is fully written but **never called**; `--render` only flips a `RenderMode` label (`auditor.ts:2269`). Every rule sees only raw, no-JS HTTP HTML, so the brief's raw-vs-rendered diff cannot run *today*.

**Verified 2026-06-17 (smoke test):** `renderPages()` works end-to-end under Node — a fixture with 0 raw `<input>` returned 1 `<input>` + 1 `<button>` post-JS via `page.content()`. It is unwired, not broken. Two operational prerequisites the Phase-2 work must own:
- **Browser binary:** render needs the Chromium revision pinned to the installed `playwright-core` (`npx playwright install chromium-headless-shell`); the code emits a helpful error if it's missing.
- **Node only, not bun:** under bun, launch hangs (CDP-over-pipe handshake times out — bun `child_process` lacks Playwright's pipe fds). pseolint runs under Node, so unaffected; document so nobody runs the auditor under bun expecting render.

**Finding 2 — a standalone raw-only `tech/csr-bailout` rule fails YAGNI.** Two sub-cases:
- *Empty shell* (framework + near-empty body): **already fires `spam/thin-content`** (`thin-content.ts:16` flags any page `< minWords`, default 300; a near-empty SPA shell fires at `error`/high). A new rule would double-report — the exact noise `enrich-findings` collapse and the v0.7.x FP work exist to remove.
- *Partial shell* (paperforge: substantial prose, interactive tool missing): **not detectable from raw HTML at acceptable FP**. "Few interactive elements" fires on every healthy Next.js content page; "near-identical cluster structure" is the catalog shape `spam/doorway-pattern` already guards against (the 2026-05-03 calibration finding, `doorway-pattern.ts:24-34`); the missing content lives in JS bundles that only execute in a browser.

**Consequence.** High-confidence partial-shell detection requires render and is deferred to Phase 2. Phase 1 ships only the two things raw HTTP allows honestly and non-redundantly: (A) correcting thin-content's remediation on framework shells, and (B) the soft-404 synthetic probe. **No new rule id is introduced.**

## 3. Decisions (locked)

- **Approach:** Hybrid — ship raw-detectable value now; the render-diff is a deferred Phase-2 upgrade. Do **not** productionize browser rendering in this work.
- **Scope:** both crawler-legibility gaps — (A) CSR-aware thin-content remediation, (B) `tech/soft-404` synthetic probe.
- **Dropped:** the standalone `tech/csr-bailout` rule (redundant/FP-prone, per Finding 2); the brief's "content-bail" variant (collapses into `spam/thin-content`); the `aeo/non-replicable-value` cross-ref (that rule is now `aeo/summary-bait`).

## 4. Component A — CSR-aware thin-content remediation

### 4.1 Rationale
`thin-content.ts:39` advises *"Add at least N more words of substantive content."* For a client-rendered shell that advice is wrong: the content already exists, it just isn't server-rendered. This component corrects the advice on the empty-shell sub-case **without adding a rule or changing when thin-content fires** — so zero new findings, zero new FP, no double-report.

### 4.2 Framework detection (new, minimal)
New module `packages/core/src/framework-detect.ts`:
```ts
export type ClientFramework = "nextjs" | "react" | "vite" | "astro";
export function detectClientFrameworkFromHtml(html: string): ClientFramework | null;
```
Regex markers: nextjs = `self.__next_f` / `/_next/static/` / `id="__next"`; vite = `/@vite/` / `<script type="module" src="/...">`; astro = `astro-island` / `/_astro/`; react = `id="root"` + a bundled script. ~15 lines. Reused by Phase 2.

### 4.3 Change in `thin-content.ts`
Inside the existing loop, after a finding is built, when the page is a near-empty framework shell, replace the `fix` (and append a cause clause to `message`):
```
if (words < csrShellFloor && detectClientFrameworkFromHtml(page.html)) { ... }
```
- `csrShellFloor` (default `30`) — only the genuinely-empty shell, not merely-short pages; a config option declared/defaulted/resolved via the same plumbing as `thinContentMinWords` (`types.ts`, `auditor.ts:113`, `auditor.ts:2201`), passed positionally into the rule.
- Severity/confidence unchanged (already `error`/high for empty bodies).
- Replacement fix (Next): "This page is served by `<framework>` but its content isn't in the server HTML — crawlers and Google's first pass see an empty shell. Server-render or prerender the content. Next.js: `useSearchParams()`/dynamic hooks need a `<Suspense>` boundary; under `cacheComponents`/PPR, move `new Date()`/`Math.random()` out of the client render path into `useEffect`. Verify with `next build && next start`, not `next dev`. For pages that have prose but missing interactive value, run pseolint `--render` (Phase 2)." Non-Next frameworks get the generic SSR/prerender sentence only.

### 4.4 What it deliberately does not do
It does not detect the *prose* shell (paperforge) — that body is > 300 words, so thin-content never fires, so there is nothing to enrich. That case is Phase 2 (render).

## 5. Component B — `tech/soft-404` synthetic probe

### 5.1 Gap
`soft404Rule` (`rules/tech/soft-404.ts:27`) only inspects already-crawled URLs. Nothing crawls nonexistent URLs, so the "200-shell for unknown slug" class (paperforge Bug 3) is invisible.

### 5.2 The correct, lazier signal
For a *synthetic* URL we constructed to be nonexistent, the failure is simply: **it returned `200`.** A correct site returns `404`/`410`. This needs no body-text match (unlike `soft404Rule`, which requires a not-found pattern and would miss a pattern-less 200 shell). Body text only raises confidence.

### 5.3 Mechanism (auditor-side; rules stay pure)
Active fetching is a pipeline concern. Add a probe step in the auditor:
1. `detectTemplates(discoveredUrls)` (`template-detection.ts:49`) → `TemplateCandidate[]`.
2. For each qualifying cluster (skip `_longtail`): take representative `candidate.urls[0]`, replace its last path segment with a random nonexistent token (`pseolint-404-probe-<n>`), preserving the cluster prefix.
3. GET via the existing robots-respecting central fetch (`cachedFetch`), honoring the same rate-limit/robots/concurrency governance. One probe per cluster, hard-capped (default `25`); `log()` the count probed and any cap hit (no silent truncation).
4. Evaluate (small exported helper in `soft-404.ts`, e.g. `evaluateProbe`):
   - status `200` → finding. `confidence: high` if the body matches `SOFT_404_PATTERNS` (an error shell served at 200) **or** is near-empty; else `confidence: medium` ("returns 200 for nonexistent URLs — verify it should 404").
   - status `404`/`410`/`3xx` → no finding.
   - network error → skip, logged (fail-open).

### 5.4 Emission
Reuse `ruleId: "tech/soft-404"` (no new rule id). `severity: warning`. Message: "`<cluster>` returns HTTP 200 for nonexistent URLs (probed `<synthetic-url>`). Crawlers can index unlimited junk pages. Return a real 404/410 (edge gate / middleware) for unknown slugs."

### 5.5 Gating
- Only when site classifies as `programmatic-directory` (clusters are well-formed; soft-404s matter most there). Skip otherwise.
- Respect `skipDetectedAuth` / `detectAuthPage` — never probe behind auth.
- Default-on within those gates (bounded footprint, standard SEO-audit behavior). An opt-out flag is trivial to add later if users object — not built speculatively.

## 6. False-positive guards (summary)
- Component A changes only the *advice string* on already-firing thin-content findings → cannot introduce findings.
- Probe gated to `programmatic-directory`, auth-skipped, capped, logged, fail-open. A rare legit catch-all that 200s for any slug is itself an SEO smell; `medium` confidence covers it.

## 7. Files touched
- `packages/core/src/framework-detect.ts` — **new** (~15 lines): `detectClientFrameworkFromHtml`.
- `packages/core/src/rules/spam/thin-content.ts` — framework-shell branch on the `fix`/`message`; `CSR_SHELL_FLOOR`.
- `packages/core/src/rules/tech/soft-404.ts` — export `evaluateProbe` (probe-response → finding). No change to the crawled-URL path.
- `packages/core/src/auditor.ts` — synthetic-probe pipeline step (fetch + gating + cap + log); thread `csrShellFloor` default/resolution.
- `packages/core/src/types.ts` — `csrShellFloor` in the rules options type.
- Tests + fixtures (§8).
- `CHANGELOG.md`. (No `scope.ts`, `SCORING_PROFILES`, or `rule-references.ts` changes — no new rule id.)

## 8. Tests / fixtures
Component A (`packages/core/tests/rules/spam/thin-content.test.ts`, golden raw HTML):
1. `empty-shell-next` — Next markers + `<div id="__next"></div>` + ~5 words → thin-content still fires `error`/high, **and** fix mentions client-rendering / `build && start` (not "add words").
2. `empty-shell-no-framework` — thin body, no framework markers → fix unchanged ("add words").
3. `prose-page` — > 300 words → no thin-content finding (confirms the prose/paperforge case is out of Phase-1 scope).

Component B (`packages/core/tests/rules/tech/soft-404.test.ts`; mock the fetch path):
4. `probe-200-pattern` — synthetic URL → 200 + not-found body → finding `high`.
5. `probe-200-shell` — synthetic URL → 200 + near-empty body, no pattern → finding `high` (proves the status-first signal `soft404Rule` would miss).
6. `probe-real-404` — synthetic URL → 404 → no finding.
7. `probe-non-programmatic` — small-marketing site → probe skipped entirely.

## 9. Live regression check (post-implementation)
Audit `https://paperforge.dev` (now fixed; 44 inputs in raw server HTML, edge gate returns real 404):
- thin-content must **not** fire on `/templates/*` (substantial prose) → no CSR fix shown. Correct: Phase 1 doesn't target the prose shell.
- soft-404 probe of `/templates/<random>` must **not** fire (real 404 now).
Both confirm no false-positive on a real, healthy programmatic directory in the calibration corpus.

## 10. Phase 2 — the real CSR-bailout detection (render diff)

**Render is verified working (Finding 1), so this is glue, not infrastructure.** Remaining work, scoped small:
1. Wire `renderPages()` into the auditor when `--render` is set: collect crawled URLs, call it, map each `{url, html}` back onto its `ParsedPage` as `renderedHtml` (re-parse with `parseHtmlPage` for `renderedContentText` / interactive counts).
2. New `tech/csr-bailout` rule (the *only* point a new rule id is justified): when `renderedHtml` is present, diff raw vs rendered — `renderedInteractive >= 3 && (rawInteractive === 0 || rawInteractive/renderedInteractive <= 0.10)` → catches paperforge's partial shell at **high** confidence. Skip silently when `renderedHtml` absent (render off).
3. Browser-prerequisite UX: surface the `playwright install` hint at audit start when `--render` is set and no browser/CDP endpoint is available (the renderer already throws the message; lift it to a pre-flight check).
4. Tests: a renderer smoke test (none exists today — the 2026-06-17 throwaway proved the path; make it a permanent `tests/renderer.test.ts`) + golden raw/rendered `ParsedPage` pairs for the diff rule.
5. Perf: headless render of large crawls is expensive; respect `--render`'s opt-in nature and the existing concurrency cap. Consider stratified sampling (render a per-cluster sample, not all N) — reuse `stratified-sample.ts`.

**Decision deferred to the user:** whether Phase 2 is pulled into this body of work (render is proven and the glue is modest) or kept as a follow-up. Until decided, Phase 1 (§4–§5) ships independently and is not blocked by it.
