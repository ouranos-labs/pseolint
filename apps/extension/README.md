# pseolint browser extension

MV3 extension. Design: [`docs/extension-architecture.md`](../../docs/extension-architecture.md).
UX redesign spec: [`docs/superpowers/specs/2026-06-17-pseolint-extension-ux-redesign-design.md`](../../docs/superpowers/specs/2026-06-17-pseolint-extension-ux-redesign-design.md).

**Status:** two-tier UX.

- **Tier 1: landscape (reach).** Auto on a Google SERP, **zero permission**: marks
  templated result clusters and shows a `N/M results templated · K hosts` chip. It
  reads only the visible page: no fetch, no prompt. Descriptive, not a verdict (§6).
- **Tier 2: deep scan (power).** The toolbar icon opens a **side panel**; clicking
  **Deep scan** grants host access for that scan, the service worker fetches each
  ranked result, and the panel renders a **competitive scorecard**: a one-line
  strategic takeaway, saturation + content-bar headline, the "opening" (weakest
  ranked page), per-result depth bars + fact tags (`thin`/`soft 404`/`no OG`/
  `templated`/`AEO`), and (if you set **your domain**) where you stand. Risk
  badges also paint inline on the SERP; every row links to the hosted full audit.

## Rules (imported from `@pseolint/core`)

One implementation, never forked (§6), subpath exports in `core/package.json`:
`tech/og-completeness` (amber) · `tech/soft-404` (red) · `spam/thin-content` (red).
Only **high-confidence** findings badge; un-hydrated SPA shells are skipped (fail
closed: a wrong badge on a SERP is credibility death, §9).

### Known ceilings (deliberate)

- Deep scan fetches **raw** HTML, not the rendered DOM Google indexes: mitigated by
  the shell-skip + high-confidence gate; the hosted audit (`--render`) is the sound
  path for JS-heavy sites.
- Parsing is regex-based (no DOM in an MV3 worker, no `cheerio` in the browser); it's
  pinned to core's cheerio output by `tests/parse-parity.test.js`.

## Build & test

```
bun run build   # → dist/background.js, dist/serp.js, dist/sidepanel.js (gitignored)
bun run test    # 10 runnable assertion checks, no framework
```

## Load unpacked

1. `bun run build` (the manifest points at `dist/`).
2. `chrome://extensions` → enable **Developer mode**.
3. **Load unpacked** → select this folder (`apps/extension`).
4. Open a `https://www.google.com/search?q=…` page: the landscape chip + templated
   markers appear automatically. Click the **toolbar icon** → **Deep scan** for risk badges.
