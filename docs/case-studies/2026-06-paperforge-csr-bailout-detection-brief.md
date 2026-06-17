# Handoff Brief — Crawler-Legibility Detection (CSR-Bailout / Prerender-Drop)

**For:** the Claude Code instance working in this (pseolint) repo.
**From:** a Claude Code session that just remediated `paperforge.dev` end-to-end using pseolint's own output.
**TL;DR:** pseolint correctly *hinted* at the failure mode that had de-indexed 5,000+ paperforge pages, but only as a low-confidence `aeo/non-replicable-value` line. The failure — **the page's real interactive value renders only after hydration, so it's absent from the HTML Google/AI crawlers see** — is the single highest-impact pSEO failure class and deserves a dedicated, high-confidence rule. This brief is everything needed to build it.

> ⚠️ I'm an outsider to this codebase — I've read the rule layout (`packages/core/src/rules/<category>/<name>.ts`, tests alongside in `packages/core/tests/rules/...`), confirmed `aeo/non-replicable-value` and `tech/soft-404` exist, and seen there's a `--render` mode and entity auto-masking. **Verify every API/path detail below against the actual code before implementing.** Treat the algorithm + thresholds as the spec; treat the integration points as "confirm these."

---

## 1. Why this matters (the case study)

`paperforge.dev` is a pSEO network of ~5,600 functional micro-tool pages (`/templates/{role}-{document}-{state}` — a form → live A4 preview → PDF generator). It was **94% indexed (≈4,634 pages) on 2026-04-06, then collapsed to ~9% (~513) by 2026-05-05.**

Root causes were two-layered:
- **Acute trigger:** a reliability incident (a crawl blew the DB egress quota → 5XX during recrawl → Google dropped ~4,100 pages). Already fixed by an infra migration.
- **Chronic vulnerability — the relevant one here:** the interactive tool (the *entire* value proposition) was **client-rendered only**. Every page's server HTML was a near-identical prose shell with **zero** form controls. To Googlebot, 5,000 "functional apps" looked like scaled, duplicate doorway content — so once trust dropped, they stayed dropped.

**Hard evidence (measured on the live site):**

| Signal | Before fix | After fix |
|---|---|---|
| `<input>` in **server** HTML (per template page) | **0** | 44 |
| `<textarea>` / `<button>` / tool markers ("Remove Watermark", "PREVIEW ONLY") | absent | present |
| Server HTML size | ~132 KB (prose only) | ~335 KB (with tool) |
| Same page rendered with JS (browser) | full tool present | full tool present |

The tool was *always* there in the browser — just never in the crawlable HTML. **A dev-mode SSR check (`next dev`) showed the form fine; only the production prerender dropped it.** That gap is exactly what a linter should catch and a human/dev-server check won't.

### What pseolint already said (and why it wasn't enough)
pseolint's `aeo/non-replicable-value` rule literally warned:
> "client-only widgets are invisible to this audit AND to most AI crawlers"

That was *correct* — but it surfaced as low-confidence/informational, easy to skate past, and it's framed as an AEO/"reason-to-click" concern, not as **"your core content is missing from the indexable HTML,"** which is a far more severe, higher-confidence, structural problem.

---

## 2. The two mechanisms behind one symptom

Both produce the same observable: **interactive/real content present in the hydrated DOM but absent from the raw server HTML.** Naming the cause is the fix-guidance value-add.

1. **CSR bailout (missing Suspense).** In Next.js App Router, calling `useSearchParams()` (or other dynamic client hooks) in a client component **not** wrapped in `<Suspense>` de-opts the *entire* client subtree to client-only render. Fix: isolate the `useSearchParams` read into a `<Suspense>`-wrapped child that renders `null`; the rest then server-renders. (Paperforge fix: extracted a `SearchParamEffects` child.)

2. **PPR / `cacheComponents` dynamic-bail.** Under Next 16 `cacheComponents` (Partial Prerendering), any non-deterministic call in the prerender path — `new Date()`, `Date.now()`, `Math.random()` — during a client component's render marks it *dynamic* and drops it from the static shell. **This one only manifests in the production build, never in `next dev`.** Fix: keep those calls out of the render path (e.g. default date fields empty in the prerender, fill on the client via `useEffect`).

Detection can't easily tell #1 from #2 — and doesn't need to. **Detect the symptom; emit framework-aware hints for both causes.**

---

## 3. Proposed rule

**ID (proposed):** `tech/csr-bailout` (alternatives: `content/hydration-only-content`, `crawler/value-not-in-html` — pick per your category conventions). It complements, not replaces, `aeo/non-replicable-value`.

**One-liner:** Flags pages whose interactive elements and/or substantive content exist in the rendered DOM but are missing from the raw server HTML — i.e. invisible to crawlers that don't execute JS (and to Google's initial HTML pass).

### Inputs required
This rule is a **rendered-vs-raw diff**, so it needs BOTH:
- `rawHtml` — the page as fetched over HTTP, no JS (pseolint already has this).
- `renderedDom` — the page after browser hydration (pseolint's `--render` mode).

→ **Key integration question to resolve first:** does a rule receive both the raw HTML *and* the rendered DOM for the same URL? If the rule API currently exposes only one, this rule needs the pipeline to retain both for a `--render` run. Gate the rule on `--render` being on; when off, either skip it or emit a low-confidence "run with --render to check crawler legibility" hint.

### Algorithm (pseudocode)
```
INTERACTIVE = ['input','select','textarea','button','form']   // extend: [contenteditable], role=button, etc.

rawCounts      = countTags(rawHtml, INTERACTIVE)
renderedCounts = countTags(renderedDom, INTERACTIVE)
rawWords       = visibleWordCount(stripToText(rawHtml))
renderedWords  = visibleWordCount(stripToText(renderedDom))

rawInteractive      = sum(rawCounts)
renderedInteractive = sum(renderedCounts)

// (A) Interactive value exists only after hydration
interactiveBail =
  renderedInteractive >= MIN_INTERACTIVE          // default 3
  && (rawInteractive === 0
      || rawInteractive / renderedInteractive <= RATIO_FLOOR)   // default 0.10

// (B) Substantive content exists only after hydration
contentBail =
  renderedWords - rawWords >= MIN_WORD_DELTA        // default 250
  && rawWords / max(renderedWords,1) <= CONTENT_RATIO_FLOOR     // default 0.5

if (interactiveBail || contentBail) FLAG
```

### Thresholds (tune against fixtures)
- `MIN_INTERACTIVE = 3` — ignore pages with one stray client-only control.
- `RATIO_FLOOR = 0.10` — raw must have <10% of the rendered interactive count.
- `MIN_WORD_DELTA = 250`, `CONTENT_RATIO_FLOOR = 0.5` — for the content variant.
- Make all four configurable via the rule-options mechanism (paperforge's `pseolint.config.ts` already passes per-rule overrides like `thinContentMinWords`).

### Severity / confidence
- **High confidence** when `rawInteractive === 0 && renderedInteractive >= MIN_INTERACTIVE` — this is unambiguous and structural (a doorway/scaled-content amplifier). Suggest `error`/`concerning` tier on programmatic-directory site types.
- Lower confidence for the content-only variant (B), since some hydration-added text is benign.

### False-positive guards
- Pages legitimately gated behind auth/interaction (you already have `--skip-detected-auth`) — skip.
- Genuinely client-only apps (dashboards) — still bad for SEO, but consider down-weighting on `small-marketing`/SPA site types and keeping full weight on `programmatic-directory`.
- Don't double-fire with `aeo/non-replicable-value`; if both would fire, prefer this one (more specific) and suppress the AEO line, or cross-reference.

### Framework-aware remediation (the differentiator)
Detect framework from the raw HTML (Next.js: `__next` / `self.__next_f` streaming markers, `/_next/static/...` chunks; also look for `cacheComponents`/PPR signals). When Next.js is detected, emit specific guidance:
> Interactive content is missing from the server HTML. Common Next.js App Router causes: (1) `useSearchParams()`/dynamic hooks used **without** a `<Suspense>` boundary → wrap them in a `null`-rendering Suspense child; (2) under `cacheComponents`/PPR, `new Date()`/`Math.random()`/`Date.now()` in a client component's render path drops it from the prerender → move them into a `useEffect`. Verify with `next build && next start` (NOT `next dev` — dev SSR hides this).

That last sentence — **"verify with `build && start`, not `dev`"** — is itself worth surfacing; it's the trap that hides this bug from developers.

### Message copy (suggested)
> `tech/csr-bailout` — **44 interactive elements render after hydration but 0 are in the server HTML.** Crawlers that don't run JS (and Google's initial pass) see an empty shell, making this page look thin/duplicate. [framework hint…]

---

## 4. Build on the two rules you already have

- **`aeo/non-replicable-value`** — keep, but when the new `tech/csr-bailout` confirms the value is client-only, *upgrade the AEO finding's confidence* (the diff is hard evidence, not a heuristic guess). They're complementary: csr-bailout = "crawlers can't see it"; non-replicable-value = "even if they can, there's no reason to click."
- **`tech/soft-404`** — you already have this rule + test. **Heads-up:** paperforge's prod returned **HTTP 200** for unknown `/templates/<random-slug>` URLs (a soft-404 from the Next 16 PPR fallback streaming a 200 shell before the page's in-render `notFound()`), and the v0.7.0 audit didn't surface it. Worth checking whether `tech/soft-404` **actively probes a synthetic-invalid URL per template cluster** (append a random segment, expect 404). If it only inspects crawled URLs, it can't see this class. The paperforge fix was an edge-gate (`proxy.ts`/middleware) returning a real 404 for unknown slugs.

---

## 5. Test fixtures to add

Add golden raw/rendered HTML pairs under `packages/core/tests/rules/tech/csr-bailout/` (or your fixture convention):
1. **`bailed/`** — raw HTML = prose shell, 0 inputs; rendered DOM = same prose + a 40+ control form. → must FLAG (high confidence). *(Source: paperforge `/templates/*` pre-fix — reproducible by fetching an archived version, or hand-craft from the description above.)*
2. **`healthy/`** — raw HTML already contains the form (44 inputs); rendered DOM ~identical. → must NOT flag. *(Source: paperforge post-fix, live now.)*
3. **`content-bail/`** — raw ~120 words, rendered ~1,600 words. → FLAG variant B.
4. **`spa-marketing/`** — small client-only widget (1 button) on a marketing page. → must NOT flag (below `MIN_INTERACTIVE`).
5. **`auth-gated/`** — login form only after JS. → skipped via auth detection, not flagged.

---

## 6. Integration checklist (verify in this repo)

- [ ] Confirm a rule can receive **both** `rawHtml` and `renderedDom` for a URL (or make the `--render` pipeline retain both).
- [ ] Pick the rule id/category per existing conventions; register it like `tech/soft-404`.
- [ ] Wire per-rule option overrides (thresholds) through the same path `thinContentMinWords` uses.
- [ ] Gate on `--render`; define behavior when render is off (skip or low-confidence hint).
- [ ] Site-type weighting: full weight on `programmatic-directory`, down-weight on `small-marketing`/SPA.
- [ ] Add the framework-detection helper (Next.js signals) and the remediation copy.
- [ ] Add fixtures + tests (§5). Calibrate thresholds so all five pass.
- [ ] Update CHANGELOG + any rule-count mentions (README/marketing) — v0.7.0 docs reference a rule count.

## 7. Live regression check
After implementing, audit **`https://paperforge.dev`** with `--render`:
- The template pages should **NOT** flag `tech/csr-bailout` anymore (fixed 2026-06-14 — 44 inputs now in server HTML).
- If you can find/host a pre-fix snapshot, it **should** flag at high confidence. That's the truest end-to-end validation: the rule would have caught, in one line, the thing that took a multi-day human+AI debugging session to find.

---

## Appendix — the exact paperforge bugs (worked examples)

**Bug 1 (CSR bailout).** `app/templates/[slug]/template-client.tsx` called `useSearchParams()` at the top with no Suspense → whole tool client-only. Fix: moved the searchParams reads into `app/templates/[slug]/search-param-effects.tsx` (`"use client"`, renders `null`), wrapped in `<Suspense fallback={null}>`. Result in `next dev`: 0 → 44 inputs in SSR.

**Bug 2 (PPR dynamic-bail).** After Bug 1, `next dev` showed 44 inputs but the **production prerender still showed 0** — because `initialFormData` called `new Date()` for date-field defaults, which `cacheComponents` flags as dynamic, dropping the client component from the static shell. Fix: date fields default to `""` in the prerender; a mount `useEffect` fills today's date. Result in `next build && next start`: 0 → 44 inputs. **This is the subtle one — it passes every dev-mode check.**

**Bug 3 (soft-404).** Unknown `/templates/<slug>` returned 200 + a "not found" body (PPR streamed a 200 shell before `notFound()`). Fix: an edge gate (`proxy.ts`) that checks a Redis published-slug set and returns a real 404 for unknown slugs (fail-open so an infra hiccup can't 404 valid pages).

These three — content-not-in-HTML (×2 causes) and soft-404 — are the same meta-failure: **the HTML Google indexes ≠ what the developer sees.** That's the gap pseolint is uniquely positioned to close.
