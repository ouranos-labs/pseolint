# pseolint browser extension

MV3 extension. Design: [`docs/extension-architecture.md`](../../docs/extension-architecture.md).

**Status:** build-sequence steps 3–5. On a Google results page, click the
toolbar icon → **Scan** (the popup owns the gesture + host-access grant). The
service worker fetches each ranked result, runs the Tier-1 rules locally, and
paints a health badge on the flagged ones — no data sent to pseolint (**Path A**).
Each badge links to the hosted full audit via `pseolint.dev/?prefill=` (**Path B**,
a deep link — no signal egress yet; `signals.js`/`client.js` are reserved for a
future pre-computed handoff).

## Tier-1 rules (the only ones the client badges)

Imported straight from `@pseolint/core` via subpath exports — one implementation,
never forked (architecture §6). Those export lines in `core/package.json` *are*
the documented Tier-1 boundary:

- `tech/og-completeness` (amber) · `tech/soft-404` (red) · `spam/thin-content` (red)

Only **high-confidence** findings badge, and un-hydrated SPA shells are skipped —
fail closed, because a wrong badge on a SERP is credibility death (§9).

### Known ceilings (deliberate, see `ponytail:` comments)

- The worker fetches **raw** HTML, not the rendered DOM Google indexes, so
  content rules see the pre-JS page. Mitigated by the shell skip + high-confidence
  gate; the hosted audit (`--render`) is the sound path for JS-heavy sites.
- Page parsing is regex-based (no DOM in an MV3 worker, no `cheerio` in the
  browser). It mirrors `core/src/parser.ts` closely enough for the badge band.

## Build

```
bun run build      # bundles src/ → dist/background.js + dist/serp.js (gitignored)
bun run test       # runnable assertion checks, no framework
```

## Load unpacked

1. `bun run build` (the manifest points at `dist/`).
2. `chrome://extensions` → enable **Developer mode**.
3. **Load unpacked** → select this folder (`apps/extension`).
4. Open a `https://www.google.com/search?q=…` page → click the Scan button.
