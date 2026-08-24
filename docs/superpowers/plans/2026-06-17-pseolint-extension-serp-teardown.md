# pseolint extension: SERP competitive teardown: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the deep scan from a flag-list into a side-panel **SERP competitive scorecard** (saturation + content bar + per-result fact tags + the "opening" + an "audit your own site" CTA), per `docs/superpowers/specs/2026-06-17-pseolint-extension-serp-teardown-design.md`.

**Architecture:** The service worker stops returning only a verdict and instead returns a per-result **signal set** (words, OG-complete, shell flag, fired flags, verdict). The side panel computes pure "reads" (median content bar, descriptive row tags, saturation, the opening) and renders a scorecard. Free + MIT + no auth; descriptive facts only (§6/§11); the deep teardown + your-own-site audit stay in the SaaS (§14).

**Tech Stack:** Plain JS, MV3, `bun build --format=iife`, `@pseolint/core` subpath exports, runnable `node` assert tests. Vanilla, no framework.

**Scope:** v1 = Phases 1–2 (A saturation + B content bar + C vulnerability map) + Phase 4 docs. Phase 3 (D, AEO race) is the fast-follow.

---

## File structure

Under `apps/extension/`:

- `src/shared/rules-client.js`: **modify.** Add `scanPage()` → full signal set; keep `verdictFor` as a thin wrapper.
- `src/shared/teardown.js`: **new.** Pure reads: content bar (median), row tags, saturation, opening.
- `src/background.js`: **modify.** `analyze()` returns the signal set, not just `{verdict}`.
- `src/content/serp/index.js`: **modify.** `deepScan()` enriches each result with `templated` + `rank`, mounts the in-page badge from `verdict`, returns the enriched list.
- `src/ui/sidepanel.js`: **modify.** Replace the flag-list render with the scorecard (uses `teardown.js`).
- `sidepanel.html`: **modify.** Scorecard styles (bar chart, tags, headline, CTA).
- `tests/rules-client.test.js`: **modify** (scanPage). `tests/teardown.test.js`: **new.**
- `README.md`, `STORE.md`: **modify** (recon positioning).
- Phase 3 only: `src/shared/parse.js` (schema flag), `core/package.json` (aeo subpath exports).

---

# Phase 1: Signal surfacing

### Task 1: `scanPage()`: full per-page signal set

**Files:**
- Modify: `apps/extension/src/shared/rules-client.js`
- Test: `apps/extension/tests/rules-client.test.js`

- [ ] **Step 1: Add the failing test**: append to `tests/rules-client.test.js` before the final `console.log`:

```js
import { scanPage } from "../src/shared/rules-client.js";

// scanPage returns the full signal set (words, ogComplete, isLikelyShell, flags, verdict).
const richBody = "widget ".repeat(320);
const clean = `<html><head><title>W</title>
  <meta property="og:title" content="t"><meta property="og:description" content="d"><meta property="og:image" content="i">
  </head><body><main>${richBody}</main></body></html>`;
const cs = scanPage(clean, "https://x.com", 200);
assert.strictEqual(cs.ogComplete, true, "all og present");
assert.strictEqual(cs.isLikelyShell, false);
assert.ok(cs.words >= 300, `word count surfaced (${cs.words})`);
assert.deepStrictEqual(cs.flags, [], "clean page → no flags");
assert.strictEqual(cs.verdict, null, "clean page → no verdict");

const thin = scanPage(`<html><head><title>404 Not Found</title></head><body><main>Sorry, not found here at all today.</main></body></html>`, "https://x.com/g", 200);
assert.strictEqual(thin.ogComplete, false, "missing og");
assert.ok(thin.flags.includes("thin"), `thin flagged (${thin.flags})`);
assert.strictEqual(thin.verdict.level, "flag", "thin → red verdict");

// verdictFor stays a thin wrapper over scanPage.
assert.strictEqual(verdictFor(clean, "https://x.com", 200), null, "verdictFor back-comp");
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/extension && node tests/rules-client.test.js`
Expected: FAIL, `scanPage` not exported.

- [ ] **Step 3: Implement**: replace the `toVerdict`/`verdictFor` section of `rules-client.js` with:

```js
// findings → { level, label } for overlay.badgeView, or null = do not badge.
// fail-closed by design (§9): only high-confidence findings.
export function toVerdict(findings) {
  const sure = findings.filter((f) => (f.confidence ?? "high") === "high");
  if (sure.length === 0) return null;
  const blocking = sure.some((f) => f.severity === "error" || f.severity === "critical");
  const label = sure.length === 1 ? (TAG[sure[0].ruleId] ?? "flagged") : `${sure.length} flags`;
  return { level: blocking ? "flag" : "warn", label };
}

// Full per-page signal set for the SERP scorecard. `flags` = high-confidence
// finding tags (descriptive facts), `verdict` = the overall in-page badge.
export function scanPage(html, url, status) {
  const page = parseSignals(html, url, status);
  const words = page.contentText ? page.contentText.split(/\s+/).filter(Boolean).length : 0;
  const ogComplete = !!(page.og.title && page.og.description && page.og.image);
  if (page.isLikelyShell) {
    return { words, ogComplete, isLikelyShell: true, flags: [], verdict: null };
  }
  const findings = [
    ...ogCompletenessRule([page]),
    ...soft404Rule([page]),
    ...thinContentRule([page], THIN_MIN_WORDS).findings,
  ];
  const flags = findings
    .filter((f) => (f.confidence ?? "high") === "high")
    .map((f) => TAG[f.ruleId] ?? "flagged");
  return { words, ogComplete, isLikelyShell: false, flags, verdict: toVerdict(findings) };
}

// (rawHtml, url, httpStatus) → verdict | null. Back-compat thin wrapper.
export function verdictFor(html, url, status) {
  return scanPage(html, url, status).verdict;
}
```

(The old `verdictFor` body is replaced; `TAG`, `THIN_MIN_WORDS`, and the three rule imports stay as they are.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/extension && node tests/rules-client.test.js`
Expected: PASS, `rules-client: all verdict checks passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/shared/rules-client.js apps/extension/tests/rules-client.test.js
git commit -m "feat(extension): scanPage() exposes full per-page signal set"
```

---

### Task 2: SW returns the signal set; content script enriches it

**Files:**
- Modify: `apps/extension/src/background.js`
- Modify: `apps/extension/src/content/serp/index.js`

> Glue (build-verified). The signal shape is what the scorecard consumes in Phase 2.

- [ ] **Step 1: SW `analyze` returns signals**: in `background.js`, change the import to `scanPage` and rewrite `analyze`'s success path so every result carries the signal set:

```js
import { scanPage } from "./shared/rules-client.js";
```

```js
async function analyze(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const miss = { url, ok: false, status: 0, words: 0, ogComplete: false, isLikelyShell: false, flags: [], verdict: null };
  try {
    const res = await fetch(url, { credentials: "omit", redirect: "follow", signal: controller.signal });
    const contentType = res.headers.get("content-type") || "";
    if (contentType && !HTML_TYPE.test(contentType)) return { ...miss, ok: true, status: res.status };
    if (Number(res.headers.get("content-length")) > MAX_BYTES) return { ...miss, ok: true, status: res.status };
    const html = await res.text();
    return { url, ok: true, status: res.status, ...scanPage(html, res.url || url, res.status) };
  } catch {
    return miss; // not reached → unscanned
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 2: Content script enriches each result**: in `index.js` `deepScan()`, add `templated` + `rank` from the cached landscape summary, mount the badge from `verdict`, and return the enriched list:

```js
async function deepScan() {
  if (results.length === 0) {
    results = detectResults(document);
    summary = analyzeLandscape(results);
  }
  const rankByUrl = new Map(results.map((r, i) => [r.url, i + 1]));
  const anchorByUrl = new Map(results.map((r) => [r.url, r.anchor]));
  const reply = await chrome.runtime.sendMessage({
    type: "pseolint:scan",
    urls: results.map((r) => r.url),
  });
  const out = [];
  for (const s of reply?.results ?? []) {
    const anchor = anchorByUrl.get(s.url);
    const badge = anchor && s.verdict && mountBadge(s.verdict, document, auditHref(s.url));
    if (badge) anchor.insertAdjacentElement("afterend", badge);
    out.push({ ...s, rank: rankByUrl.get(s.url), templated: summary.templatedUrls.has(s.url) });
  }
  return { results: out };
}
```

- [ ] **Step 3: Build to verify it bundles**

Run: `cd apps/extension && bun run build`
Expected: three bundles, no error.

- [ ] **Step 4: No leaks**

Run: `grep -cE "cheerio|node:|__require" dist/serp.js dist/background.js`
Expected: `0` each.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/background.js apps/extension/src/content/serp/index.js
git commit -m "feat(extension): SW returns per-result signal set; content script adds rank+templated"
```

---

# Phase 2: The scorecard (A + B + C)

### Task 3: `teardown.js`: pure reads

**Files:**
- Create: `apps/extension/src/shared/teardown.js`
- Test: `apps/extension/tests/teardown.test.js`

- [ ] **Step 1: Write the failing test**

```js
// apps/extension/tests/teardown.test.js, `node tests/teardown.test.js`
import assert from "node:assert";
import { contentBar, rowTags, saturation, teardown } from "../src/shared/teardown.js";

const R = [
  { url: "https://a.com/1", rank: 1, ok: true, isLikelyShell: false, words: 2000, ogComplete: true, templated: false, flags: [] },
  { url: "https://a.com/2", rank: 2, ok: true, isLikelyShell: false, words: 1800, ogComplete: true, templated: false, flags: [] },
  { url: "https://dir.com/city/x", rank: 3, ok: true, isLikelyShell: false, words: 240, ogComplete: false, templated: true, flags: ["thin", "no OG tags"] },
  { url: "https://dir.com/city/y", rank: 4, ok: true, isLikelyShell: false, words: 300, ogComplete: true, templated: true, flags: [] },
  { url: "https://b.com/x", rank: 5, ok: false, isLikelyShell: false, words: 0, ogComplete: false, templated: false, flags: [] }, // failed
];

// content bar = median over fetched, non-shell results (excludes the failed one)
assert.strictEqual(contentBar(R), 1050, "median of [240,300,1800,2000] = 1050");

// row tags = non-exclusive facts; strong = none fired
assert.deepStrictEqual(rowTags(R[0]).sort(), [], "deep clean page → strong (no tags)");
assert.deepStrictEqual(rowTags(R[2]).sort(), ["no OG tags", "templated", "thin"], "facts stacked");
assert.deepStrictEqual(rowTags(R[3]).sort(), ["templated"], "templated only");

// saturation
const sat = saturation(R);
assert.strictEqual(sat.templated, 2);
assert.strictEqual(sat.total, 5);
assert.strictEqual(sat.topHost, "dir.com");

// teardown() bundles it + picks the opening (lowest-words ranked result below the bar)
const t = teardown(R);
assert.strictEqual(t.bar, 1050);
assert.strictEqual(t.scanned, 4);
assert.strictEqual(t.failed, 1);
assert.strictEqual(t.opening.url, "https://dir.com/city/x", "weakest below-bar ranked result");
assert.strictEqual(t.rows[0].rank, 1, "rows keep SERP rank order");

console.log("teardown: all checks passed");
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/extension && node tests/teardown.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `teardown.js`**

```js
// apps/extension/src/shared/teardown.js
// Pure "reads" for the SERP competitive scorecard. Descriptive facts only,
// the strategic framing ("the opening") is pseolint's read, surfaced in the
// summary, never stamped on a competitor's row (§6/§11).

const host = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
};

// median word count over results actually fetched + parsed (excl. fails/shells).
export function contentBar(results) {
  const w = results.filter((r) => r.ok && !r.isLikelyShell).map((r) => r.words).sort((a, b) => a - b);
  if (w.length === 0) return 0;
  const mid = Math.floor(w.length / 2);
  return w.length % 2 ? w[mid] : Math.round((w[mid - 1] + w[mid]) / 2);
}

// non-exclusive descriptive facts for one row; [] (strong) when none fired.
export function rowTags(r) {
  const tags = [...(r.flags ?? [])]; // thin / soft 404 / no OG tags (from rules-client)
  if (r.templated && !tags.includes("templated")) tags.push("templated");
  return tags;
}

// how programmatic the SERP is + the dominant host.
export function saturation(results) {
  const templated = results.filter((r) => r.templated);
  const counts = new Map();
  for (const r of templated) counts.set(host(r.url), (counts.get(host(r.url)) ?? 0) + 1);
  let topHost = null, top = 0;
  for (const [h, c] of counts) if (c > top) { top = c; topHost = h; }
  return { templated: templated.length, total: results.length, topHost, topHostCount: top };
}

// the full scorecard model the side panel renders.
export function teardown(results) {
  const bar = contentBar(results);
  const rows = results.map((r) => ({ ...r, host: host(r.url), tags: rowTags(r), belowBar: r.ok && !r.isLikelyShell && r.words < bar }));
  const scanned = results.filter((r) => r.ok && !r.isLikelyShell).length;
  // the opening = the weakest ranked page that still ranks: lowest words among
  // fetched results below the bar (ties → best rank).
  const candidates = rows.filter((r) => r.belowBar).sort((a, b) => a.words - b.words || a.rank - b.rank);
  return {
    bar,
    scanned,
    failed: results.length - scanned,
    flagged: rows.filter((r) => r.tags.length).length,
    saturation: saturation(results),
    opening: candidates[0] ?? null,
    rows, // SERP-rank order (input order)
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/extension && node tests/teardown.test.js`
Expected: PASS, `teardown: all checks passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/shared/teardown.js apps/extension/tests/teardown.test.js
git commit -m "feat(extension): teardown reads, content bar, row facts, saturation, opening"
```

---

### Task 4: The scorecard UI

**Files:**
- Modify: `apps/extension/sidepanel.html` (styles)
- Modify: `apps/extension/src/ui/sidepanel.js` (render)

> Glue (live-verified in Task 5). Renders `teardown()`; all untrusted strings via `textContent` (§9).

- [ ] **Step 1: Add scorecard styles**: in `sidepanel.html`, replace the `li`/`.host`/`.v`/`li a`/`li.clean` block with:

```css
      #headline { margin: 12px 0; font: 12px var(--sans); color: var(--fg); }
      #headline b { font-family: var(--mono); color: var(--primary); }
      #opening { margin: 0 0 12px; font-size: 12px; color: var(--muted); }
      #opening b { color: var(--fg); }
      ul { list-style: none; margin: 0; padding: 0; }
      li { display: grid; grid-template-columns: 1.6em 1fr auto; align-items: center;
        gap: 8px; padding: 7px 0; border-top: 1px solid var(--border); }
      .rank { font: 11px var(--mono); color: var(--muted); text-align: right; }
      .who { min-width: 0; }
      .host { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; }
      .bar { height: 4px; margin-top: 4px; border-radius: 2px; background: var(--primary); opacity: .9; }
      .bar.below { background: var(--warn); }
      .meta { display: flex; align-items: center; gap: 6px; }
      .w { font: 11px var(--mono); color: var(--muted); }
      .tag { font: 600 9.5px var(--mono); letter-spacing: .02em; padding: 1px 5px; border-radius: 6px; color: #fff;
        box-shadow: inset 0 1px 0 0 rgba(255,255,255,.18), 0 1px 2px 0 rgba(0,0,0,.3); }
      .tag.thin, .tag.soft { background: var(--flag); }
      .tag.og { background: var(--warn); color: #3a2a06; }
      .tag.templated { background: var(--templated); }
      .tag.strong { background: transparent; color: var(--primary); box-shadow: none; }
      li a { color: var(--primary); font-size: 11px; white-space: nowrap; text-decoration: none; }
      li a:hover { text-decoration: underline; }
      #cta { display: block; margin: 14px 0 2px; text-align: center; font: 600 13px var(--sans);
        color: var(--primary-fg); background: var(--primary); padding: 9px; border-radius: 10px; text-decoration: none;
        box-shadow: inset 0 1.5px 0 0 rgba(255,255,255,.2), inset 0 -1.5px 0 0 rgba(0,0,0,.4), 0 1.5px 3px 0 rgba(0,0,0,.3); }
```

  Then add the scorecard containers to the body, replacing `<p id="status">…</p><ul id="results"></ul>`:

```html
    <p id="status" role="status" aria-live="polite"></p>
    <p id="headline"></p>
    <p id="opening"></p>
    <ul id="results"></ul>
    <a id="cta" href="https://pseolint.dev" target="_blank" rel="noopener" hidden>Audit your own site →</a>
```

- [ ] **Step 2: Render the scorecard**: in `sidepanel.js`, replace `import { coverage }` with `import { teardown }` and replace the whole `render()` function with:

```js
const TAG_CLASS = { thin: "thin", "soft 404": "soft", "no OG tags": "og", templated: "templated" };

function render(results) {
  const list = $("results");
  list.textContent = "";
  $("headline").textContent = "";
  $("opening").textContent = "";
  $("cta").hidden = true;
  if (results.length === 0) {
    $("status").textContent = "No results found, open a Google results page.";
    return;
  }
  const t = teardown(results);
  const sat = t.saturation;
  $("status").textContent = `Scanned ${t.scanned}/${results.length}` + (t.failed ? ` · ${t.failed} failed` : "");

  const headline = $("headline");
  headline.append(document.createTextNode(`This SERP: `));
  const satB = document.createElement("b"); satB.textContent = `${sat.templated}/${sat.total} templated`; headline.append(satB);
  headline.append(document.createTextNode(` · content bar `));
  const barB = document.createElement("b"); barB.textContent = `${t.bar}w`; headline.append(barB);
  if (sat.topHost) headline.append(document.createTextNode(` · ${sat.topHost} ×${sat.topHostCount}`));

  if (t.opening) {
    const o = $("opening");
    o.append(document.createTextNode("The opening: "));
    const b = document.createElement("b");
    b.textContent = `${t.opening.host} ranks #${t.opening.rank} on ${t.opening.words}w`;
    o.append(b);
    o.append(document.createTextNode(t.opening.tags.length ? ` (${t.opening.tags.join(", ")}).` : "."));
  }

  const maxW = Math.max(1, ...t.rows.map((r) => r.words));
  for (const r of t.rows) {
    const li = document.createElement("li");
    const rank = document.createElement("span"); rank.className = "rank"; rank.textContent = `#${r.rank}`;
    const who = document.createElement("div"); who.className = "who";
    const h = document.createElement("div"); h.className = "host"; h.textContent = r.host;
    const bar = document.createElement("div");
    bar.className = "bar" + (r.belowBar ? " below" : "");
    bar.style.width = `${r.ok && !r.isLikelyShell ? Math.max(4, Math.round((r.words / maxW) * 100)) : 0}%`;
    who.append(h, bar);
    const meta = document.createElement("div"); meta.className = "meta";
    if (!r.ok) {
      const w = document.createElement("span"); w.className = "w"; w.textContent = "unscanned"; meta.append(w);
    } else {
      const w = document.createElement("span"); w.className = "w"; w.textContent = `${r.words}w`; meta.append(w);
      const tags = r.tags.length ? r.tags : ["strong"];
      for (const tag of tags) {
        const el = document.createElement("span");
        el.className = `tag ${TAG_CLASS[tag] ?? "strong"}`;
        el.textContent = tag;
        meta.append(el);
      }
      const a = document.createElement("a");
      a.href = AUDIT_PREFILL + encodeURIComponent(r.url);
      a.target = "_blank"; a.rel = "noopener noreferrer";
      a.textContent = "↗";
      a.setAttribute("aria-label", `Open full pseolint audit for ${r.host}`);
      meta.append(a);
    }
    li.append(rank, who, meta);
    list.append(li);
  }
  $("cta").hidden = false;
}
```

- [ ] **Step 3: Remove the now-dead coverage module**: `teardown()` returns `scanned`/`failed`, superseding `coverage()`:

```bash
git rm apps/extension/src/shared/coverage.js apps/extension/tests/coverage.test.js
```

Then in `package.json` `test` script: drop `&& node tests/coverage.test.js`, add `&& node tests/teardown.test.js`.

- [ ] **Step 4: Build + tests**

Run: `cd apps/extension && bun run build && bun run test 2>&1 | tail -3`
Expected: bundles built; all tests pass (now incl. `teardown`, no `coverage`).

- [ ] **Step 5: Commit**

```bash
git add apps/extension/sidepanel.html apps/extension/src/ui/sidepanel.js apps/extension/package.json
git commit -m "feat(extension): SERP competitive scorecard (saturation, content bar, facts, opening)"
```

---

### Task 5: Live-verify the scorecard

**Files:** none.

- [ ] **Step 1:** `cd apps/extension && bun run build`; reload in `chrome://extensions`.
- [ ] **Step 2:** Open a templated query (`things to do in austin`); toolbar → side panel → **Deep scan**.
- [ ] **Step 3:** Expect: headline (`N/M templated · content bar Xw · host ×k`), the opening line, a depth bar per result (amber when below the bar), word counts + fact tags (`thin`/`templated`/`no OG tags`/`strong`), per-row `↗` audit links, and the "Audit your own site →" CTA. If anything's off, inspect the side-panel devtools + fix.
- [ ] **Step 4 (if fixes):** `git add -A apps/extension && git commit -m "fix(extension): scorecard fixes from live verification"`

---

# Phase 3: AEO race (D): fast-follow

### Task 6: AEO-ready tag

**Files:**
- Modify: `apps/extension/src/shared/parse.js` (add `hasSchema` + jsonLd presence)
- Modify: `packages/core/package.json` (subpath exports for `aeo/answer-first`, `aeo/citable-facts`)
- Modify: `apps/extension/src/shared/rules-client.js` (`scanPage` adds `aeoReady`)
- Modify: `apps/extension/src/shared/teardown.js` (+ AEO line) and `sidepanel.js` (AEO tag/line)
- Test: extend `tests/teardown.test.js` + `tests/rules-client.test.js`

- [ ] **Step 1:** Add `hasSchema` to `parseSignals` (regex for `<script type="application/ld+json">` presence) with a test in `parse.test.js`.
- [ ] **Step 2:** Add core subpath exports for the single-page AEO rules; verify `import` resolves (`node -e`).
- [ ] **Step 3:** In `scanPage`, compute `aeoReady = hasSchema && <aeo single-page checks pass>`; return it. Test in `rules-client.test.js`.
- [ ] **Step 4:** In `teardown`, count `aeoReady`; add an `AEO-ready` tag + a "who's citable" headline clause. Test in `teardown.test.js`.
- [ ] **Step 5:** Render the AEO tag (emerald) + the citability line in `sidepanel.js`.
- [ ] **Step 6:** Build + test + commit (`feat(extension): AEO citability race (D)`).

---

# Phase 4: Docs

### Task 7: Reposition to "competitive recon, free"

**Files:** `apps/extension/README.md`, `apps/extension/STORE.md`

- [ ] **Step 1:** README: describe deep scan as a SERP competitive teardown (saturation/content bar/opening), reiterate free + MIT + the recon-vs-resolution boundary.
- [ ] **Step 2:** STORE: short + detailed description lead with "competitive recon on any SERP, free"; keep permission justifications unchanged.
- [ ] **Step 3:** Commit (`docs(extension): reposition to SERP competitive recon`).

---

## Self-review notes (author)

- **Spec coverage:** A saturation (Task 3 `saturation`, Task 4 headline) · B content bar (Task 3 `contentBar`, Task 4 bar chart) · C vulnerability map (Task 3 `rowTags`/`opening`, Task 4 rows + opening) · D AEO (Phase 3) · free/recon-vs-resolution (Task 4 CTA + Task 7 docs) · descriptive-facts-not-accusations (rowTags are facts; "opening" only in summary) · signal surfacing (Tasks 1–2).
- **Type consistency:** the signal set `{ url, ok, status, words, ogComplete, isLikelyShell, flags, verdict }` is produced by `scanPage` (Task 1) + `analyze` (Task 2), enriched with `{ rank, templated }` (Task 2), and consumed identically by `teardown`/`render` (Tasks 3–4). `flags` are the `TAG`-mapped strings (`"thin"`, `"soft 404"`, `"no OG tags"`) used as both row tags and `TAG_CLASS` keys.
- **No placeholders:** Phases 1–2 + 4 are fully coded. Phase 3 is intentionally a step-outline (fast-follow): it gets full code when promoted to active.
