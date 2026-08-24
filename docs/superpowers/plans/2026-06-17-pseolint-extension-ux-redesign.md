# pseolint extension UX redesign: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the extension into a two-tier UX (a zero-permission auto "landscape" on the SERP (reach) plus an opt-in deep scan in a persistent side panel (power)) per `docs/superpowers/specs/2026-06-17-pseolint-extension-ux-redesign-design.md`.

**Architecture:** Tier-1 reads only the SERP DOM (no fetch, no permission) and renders descriptive "templated saturation" + neutral per-result markers, auto on load. Tier-2 reuses the existing service-worker fetch + core Tier-1 rules, triggered from a side panel that replaces the popup (popups die on blur mid-fetch). Inline shadow-DOM badges are the shared payoff; the SaaS deep-link is the funnel.

**Tech Stack:** Plain JS, MV3, `bun build --format=iife` per entry, `@pseolint/core` via subpath exports, runnable `node` assert tests (no framework). Vanilla everywhere (§4), no UI framework.

---

## File structure

Under `apps/extension/`:

- `src/content/serp/landscape.js`: **new.** Pure Tier-1 analysis: results → templated clusters + summary.
- `src/content/serp/reach.js`: **new.** In-page landscape chip (shadow DOM glue).
- `src/content/serp/overlay.js`: **modify.** Add neutral `templated` badge level.
- `src/content/serp/index.js`: **rewrite.** Auto Tier-1 on load; handle `pseolint:landscape` + `pseolint:deep-scan`.
- `src/content/serp/detect.js`: unchanged (reused).
- `src/content/site/pattern.js`: unchanged (reused by landscape).
- `src/shared/parse.js`, `src/shared/rules-client.js`: unchanged (reused by deep scan).
- `src/shared/coverage.js`: **new.** Pure coverage summary from scan results.
- `src/background.js`: **modify.** `analyze` returns `ok`; set side-panel behavior on install.
- `src/ui/sidepanel.js`: **new.** Side-panel logic (landscape, deep-scan gesture, results list).
- `sidepanel.html`: **new.** Side-panel page (CSP-safe, external script).
- `src/ui/popup.js`, `popup.html`: **delete.**
- `manifest.json`: **modify.** Add `side_panel` + `sidePanel`; drop `default_popup`; drop `activeTab` (re-audited unused).
- `package.json`: **modify.** Build `sidepanel.js` (not `popup.js`); add new tests.
- `tests/landscape.test.js`, `tests/coverage.test.js`: **new.**
- `tests/overlay.test.js`: **modify** (templated level).
- `PRIVACY.md`, `STORE.md`, `README.md`: **modify** (two-tier behavior).

---

# Phase 1: Reach tier (auto, zero-permission)

### Task 1: Tier-1 landscape analysis (pure)

**Files:**
- Create: `apps/extension/src/content/serp/landscape.js`
- Test: `apps/extension/tests/landscape.test.js`

- [ ] **Step 1: Write the failing test**

```js
// apps/extension/tests/landscape.test.js
// `node tests/landscape.test.js`, pure, no DOM.
import assert from "node:assert";
import { analyzeLandscape, landscapeChip } from "../src/content/serp/landscape.js";

const r = (url) => ({ url, anchor: { href: url } });

// 3 results share host+pattern → one cluster of 3; a lone /about is not templated.
const results = [
  r("https://acme.com/city/new-york"),
  r("https://acme.com/city/boston"),
  r("https://acme.com/city/miami"),
  r("https://acme.com/about"),
  r("https://other.com/jobs/dev"),
  r("https://other.com/jobs/qa"),
];
const s = analyzeLandscape(results);
assert.strictEqual(s.total, 6, "counts all results");
assert.strictEqual(s.templatedUrls.size, 5, "5 urls in clusters (3 city + 2 jobs)");
assert.ok(!s.templatedUrls.has("https://acme.com/about"), "lone static page not templated");
assert.strictEqual(s.hostCount, 2, "two clustered hosts");
assert.strictEqual(s.clusters[0].count, 3, "biggest cluster first");
assert.strictEqual(s.clusters[0].pattern, "/city/:slug");

// chip text + empty case
assert.strictEqual(landscapeChip(s), "5/6 results templated · 2 hosts");
assert.strictEqual(landscapeChip(analyzeLandscape([r("https://x.com/about")])), null, "nothing templated → no chip");

console.log("landscape: all checks passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/extension && node tests/landscape.test.js`
Expected: FAIL, `Cannot find module ... landscape.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// apps/extension/src/content/serp/landscape.js
// Tier-1 SERP landscape (architecture §6 honesty boundary): describes how
// programmatic the VISIBLE results are. No fetch, no permission, no risk verdict.
import { detectPattern } from "../site/pattern.js";

// results: [{ url, anchor }] from detect.js
// → { total, templatedUrls:Set, clusters:[{host,pattern,count,urls}], hostCount }
export function analyzeLandscape(results) {
  const groups = new Map(); // "host pattern" → { host, pattern, urls:[] }
  for (const { url } of results) {
    let host;
    try {
      host = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    const pattern = detectPattern(url).pattern;
    const key = `${host} ${pattern}`;
    if (!groups.has(key)) groups.set(key, { host, pattern, urls: [] });
    groups.get(key).urls.push(url);
  }
  // A "templated cluster" = ≥2 visible results sharing host+pattern, the sound
  // signal (siblings are right there), and it avoids marking a lone templated URL.
  const clusters = [...groups.values()]
    .filter((g) => g.urls.length >= 2)
    .map((g) => ({ host: g.host, pattern: g.pattern, count: g.urls.length, urls: g.urls }))
    .sort((a, b) => b.count - a.count);
  return {
    total: results.length,
    templatedUrls: new Set(clusters.flatMap((c) => c.urls)),
    clusters,
    hostCount: new Set(clusters.map((c) => c.host)).size,
  };
}

// summary → one-line chip text, or null when nothing is templated (don't badge).
export function landscapeChip(summary) {
  if (!summary || summary.templatedUrls.size === 0) return null;
  const n = summary.templatedUrls.size;
  const h = summary.hostCount;
  return `${n}/${summary.total} results templated · ${h} host${h === 1 ? "" : "s"}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/extension && node tests/landscape.test.js`
Expected: PASS, `landscape: all checks passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/content/serp/landscape.js apps/extension/tests/landscape.test.js
git commit -m "feat(extension): Tier-1 landscape analysis (templated saturation)"
```

---

### Task 2: Neutral `templated` badge level

**Files:**
- Modify: `apps/extension/src/content/serp/overlay.js` (the `LEVELS` map)
- Test: `apps/extension/tests/overlay.test.js`

- [ ] **Step 1: Add the failing assertion** to `tests/overlay.test.js`, right after the existing `badgeView` cases (after the `"unknown level"` line):

```js
assert.deepStrictEqual(
  badgeView({ level: "templated", label: "templated" }),
  { text: "templated", color: "#0969da" },
  "neutral templated level",
);
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/extension && node tests/overlay.test.js`
Expected: FAIL, color is `undefined` (level not in `LEVELS`).

- [ ] **Step 3: Add the level**: in `overlay.js` change the `LEVELS` const:

```js
const LEVELS = { ok: "#1a7f37", warn: "#9a6700", flag: "#cf222e", templated: "#0969da" };
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/extension && node tests/overlay.test.js`
Expected: PASS, `overlay: all safety checks passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/content/serp/overlay.js apps/extension/tests/overlay.test.js
git commit -m "feat(extension): neutral templated badge level"
```

---

### Task 3: In-page landscape chip + auto-run rewrite of the content script

**Files:**
- Create: `apps/extension/src/content/serp/reach.js`
- Rewrite: `apps/extension/src/content/serp/index.js`

> No unit test: this is DOM/messaging glue (repo convention: pure logic is tested in Tasks 1/2, glue is verified live in Task 4). `mountChip` mirrors `overlay.mountBadge`'s shadow-DOM/`textContent` pattern.

- [ ] **Step 1: Create `reach.js`**

```js
// apps/extension/src/content/serp/reach.js
// In-page landscape chip (reach surface, shadow DOM, §9). Informational; the
// per-result templated badges carry the funnel link. Returns the host element
// or null (no chip).
export function mountChip(text, doc = document) {
  if (!text) return null;
  const host = doc.createElement("div");
  const root = host.attachShadow({ mode: "closed" });
  const style = doc.createElement("style");
  style.textContent =
    ":host{all:initial;position:fixed;bottom:16px;right:16px;z-index:2147483647}" +
    ".c{font:12px/1.4 system-ui,sans-serif;background:#1a1a1a;color:#fff;" +
    "padding:6px 10px;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.3)}";
  const chip = doc.createElement("div");
  chip.className = "c";
  chip.textContent = `pseolint, ${text}`; // text is our own summary, never page HTML
  root.append(style, chip);
  doc.body.appendChild(host);
  return host;
}
```

- [ ] **Step 2: Rewrite `index.js`**

```js
// apps/extension/src/content/serp/index.js
// SERP content script. Tier 1 runs automatically on load (zero permission):
// detect ranked results, mark templated clusters, show the landscape chip. Tier 2
// (deep scan) is triggered by the side panel and reuses the service-worker fetch.
import { detectResults } from "./detect.js";
import { analyzeLandscape, landscapeChip } from "./landscape.js";
import { mountBadge } from "./overlay.js";
import { mountChip } from "./reach.js";

const AUDIT_PREFILL = "https://pseolint.dev/?prefill=";
const auditHref = (url) => AUDIT_PREFILL + encodeURIComponent(url);

let results = []; // [{ url, anchor }]
let summary = null;

// Tier 1, auto, zero permission.
function runLandscape() {
  results = detectResults(document);
  summary = analyzeLandscape(results);
  for (const { url, anchor } of results) {
    if (!summary.templatedUrls.has(url)) continue;
    const badge = mountBadge({ level: "templated", label: "templated" }, document, auditHref(url));
    if (badge) anchor.insertAdjacentElement("afterend", badge);
  }
  mountChip(landscapeChip(summary));
}

// Tier 2, opt-in deep scan (side panel asked). Fetch+judge via the SW, paint
// risk badges, and return per-result {verdict, ok} so the panel can show coverage.
async function deepScan() {
  if (results.length === 0) results = detectResults(document);
  const anchorByUrl = new Map(results.map((r) => [r.url, r.anchor]));
  const reply = await chrome.runtime.sendMessage({
    type: "pseolint:scan",
    urls: results.map((r) => r.url),
  });
  const out = [];
  for (const { url, verdict, ok } of reply?.results ?? []) {
    const anchor = anchorByUrl.get(url);
    const badge = anchor && verdict && mountBadge(verdict, document, auditHref(url));
    if (badge) anchor.insertAdjacentElement("afterend", badge);
    out.push({ url, verdict, ok });
  }
  return { results: out };
}

// Sets aren't JSON-serializable; flatten the summary for the message channel.
function serializeSummary(s) {
  if (!s) return null;
  return {
    total: s.total,
    templated: s.templatedUrls.size,
    hostCount: s.hostCount,
    clusters: s.clusters.map((c) => ({ host: c.host, pattern: c.pattern, count: c.count })),
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "pseolint:landscape") {
    sendResponse({ summary: serializeSummary(summary) });
    return undefined; // sync reply
  }
  if (msg?.type === "pseolint:deep-scan") {
    deepScan().then(sendResponse);
    return true; // async reply
  }
  return undefined;
});

runLandscape();
```

- [ ] **Step 3: Build to verify it bundles**

Run: `cd apps/extension && bun build src/content/serp/index.js --target=browser --format=iife --outfile=dist/serp.js`
Expected: `Bundled N modules` with no error.

- [ ] **Step 4: Confirm no node deps leaked**

Run: `grep -cE "cheerio|node:|__require" dist/serp.js`
Expected: `0`.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/content/serp/reach.js apps/extension/src/content/serp/index.js
git commit -m "feat(extension): auto Tier-1 landscape on SERP load (reach surface)"
```

---

### Task 4: Live-verify the reach tier

**Files:** none (verification only).

- [ ] **Step 1: Build all bundles**

Run: `cd apps/extension && bun run build`
Expected: three bundles built (background, serp, popup, popup removed later in Task 8).

- [ ] **Step 2: Reload + open a SERP**

In Chrome: `chrome://extensions` → reload pseolint → open `https://www.google.com/search?q=best+project+management+software`.

- [ ] **Step 3: Verify reach behavior (no permission prompt)**

Expected: **no Chrome permission prompt**; a `pseolint, N/M results templated · K hosts` chip appears bottom-right; blue `templated` badges sit next to clustered organic results; clicking one opens `pseolint.dev/?prefill=…`. If the chip/badges don't appear, capture the page console + re-tune `detect`/`landscape`.

- [ ] **Step 4: Commit** (only if tuning changed files)

```bash
git add -A apps/extension/src
git commit -m "fix(extension): tune reach tier against live SERP"
```

---

# Phase 2: Power tier (side panel + deep scan)

### Task 5: Coverage summary (pure) + SW returns `ok`

**Files:**
- Create: `apps/extension/src/shared/coverage.js`
- Test: `apps/extension/tests/coverage.test.js`
- Modify: `apps/extension/src/background.js`

- [ ] **Step 1: Write the failing test**

```js
// apps/extension/tests/coverage.test.js, `node tests/coverage.test.js`
import assert from "node:assert";
import { coverage } from "../src/shared/coverage.js";

const results = [
  { url: "a", verdict: { level: "flag", label: "thin" }, ok: true },
  { url: "b", verdict: null, ok: true },
  { url: "c", verdict: { level: "warn", label: "no OG tags" }, ok: true },
  { url: "d", verdict: null, ok: false }, // fetch failed
];
assert.deepStrictEqual(coverage(results), { total: 4, scanned: 3, failed: 1, flagged: 2 });
assert.deepStrictEqual(coverage([]), { total: 0, scanned: 0, failed: 0, flagged: 0 });
console.log("coverage: all checks passed");
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/extension && node tests/coverage.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `coverage.js`**

```js
// apps/extension/src/shared/coverage.js
// Pure summary of a deep-scan result set. `ok` = the page was actually fetched
// and judged; a false "all clear" is impossible because failures count as unscanned.
export function coverage(results) {
  const total = results.length;
  const scanned = results.filter((r) => r.ok).length;
  const flagged = results.filter((r) => r.verdict).length;
  return { total, scanned, failed: total - scanned, flagged };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/extension && node tests/coverage.test.js`
Expected: PASS.

- [ ] **Step 5: Make the SW report `ok`**: in `background.js`, replace the `analyze` function body's returns so every path carries `ok`:

```js
async function analyze(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      credentials: "omit",
      redirect: "follow",
      signal: controller.signal,
    });
    const contentType = res.headers.get("content-type") || "";
    if (contentType && !HTML_TYPE.test(contentType)) return { url, verdict: null, ok: true };
    if (Number(res.headers.get("content-length")) > MAX_BYTES) return { url, verdict: null, ok: true };
    const html = await res.text();
    return { url, verdict: verdictFor(html, res.url || url, res.status), ok: true };
  } catch {
    return { url, verdict: null, ok: false }; // not reached → counts as unscanned
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/extension/src/shared/coverage.js apps/extension/tests/coverage.test.js apps/extension/src/background.js
git commit -m "feat(extension): deep-scan coverage (ok flag) so a false all-clear can't happen"
```

---

### Task 6: Side panel (page + logic)

**Files:**
- Create: `apps/extension/sidepanel.html`
- Create: `apps/extension/src/ui/sidepanel.js`

> Glue (verified live in Task 8). Coverage math is the tested part (Task 5). All untrusted host/URL strings go in via `textContent` (§9).

- [ ] **Step 1: Create `sidepanel.html`** (functional; Phase 3 restyles)

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font: 13px system-ui, sans-serif; margin: 0; padding: 14px; }
      h1 { font-size: 13px; margin: 0 0 4px; }
      .sub, #landscape { color: #555; margin: 0 0 10px; }
      button { cursor: pointer; font: 13px system-ui, sans-serif; background: #1a1a1a;
        color: #fff; border: 0; padding: 8px 12px; border-radius: 8px; width: 100%; }
      button:disabled { opacity: .6; cursor: default; }
      #status { color: #555; margin: 10px 0; min-height: 1.2em; }
      ul { list-style: none; margin: 0; padding: 0; }
      li { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-top: 1px solid #eee; }
      .host { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .v { font-size: 11px; padding: 1px 6px; border-radius: 10px; color: #fff; }
      .v.flag { background: #cf222e; } .v.warn { background: #9a6700; } .v.templated { background: #0969da; }
      a { color: #0969da; font-size: 11px; white-space: nowrap; }
    </style>
  </head>
  <body>
    <h1>pseolint</h1>
    <p id="landscape" class="sub">Open a Google results page to analyze it.</p>
    <button id="scan">Deep scan this SERP</button>
    <p id="status"></p>
    <ul id="results"></ul>
    <script src="dist/sidepanel.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `sidepanel.js`**

```js
// apps/extension/src/ui/sidepanel.js
// Power surface. Owns the deep-scan gesture + host-permission request (only valid
// from an extension page), shows live coverage + a flagged-results list. Talks to
// the active SERP tab's content script (covered by the google.com/search host perm).
import { coverage } from "../shared/coverage.js";

const SCAN_PERMISSION = { origins: ["https://*/*"] };
const AUDIT_PREFILL = "https://pseolint.dev/?prefill=";
const NO_SERP = "Open a Google results page to analyze it.";
const $ = (id) => document.getElementById(id);

async function activeTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function loadLandscape() {
  try {
    const reply = await chrome.tabs.sendMessage(await activeTabId(), { type: "pseolint:landscape" });
    const s = reply?.summary;
    $("landscape").textContent =
      s && s.templated ? `${s.templated}/${s.total} results templated · ${s.hostCount} host(s)` : NO_SERP;
  } catch {
    $("landscape").textContent = NO_SERP;
  }
}

async function deepScan() {
  $("scan").disabled = true;
  $("status").textContent = "Requesting access…";
  const granted = await chrome.permissions.request(SCAN_PERMISSION).catch(() => false);
  if (!granted) {
    $("status").textContent = "Host access is needed to deep-scan the results.";
    $("scan").disabled = false;
    return;
  }
  $("status").textContent = "Scanning…";
  try {
    const reply = await chrome.tabs.sendMessage(await activeTabId(), { type: "pseolint:deep-scan" });
    render(reply?.results ?? []);
  } catch {
    $("status").textContent = NO_SERP;
  }
  $("scan").disabled = false;
}

function render(results) {
  const c = coverage(results);
  $("status").textContent =
    `Scanned ${c.scanned}/${c.total}${c.failed ? ` · ${c.failed} failed` : ""} · ${c.flagged} flagged`;
  const list = $("results");
  list.textContent = ""; // clear
  for (const r of results.filter((x) => x.verdict)) {
    const li = document.createElement("li");
    const host = document.createElement("span");
    host.className = "host";
    try {
      host.textContent = new URL(r.url).hostname.replace(/^www\./, ""); // untrusted → textContent
    } catch {
      host.textContent = r.url;
    }
    const v = document.createElement("span");
    v.className = `v ${r.verdict.level}`;
    v.textContent = r.verdict.label;
    const a = document.createElement("a");
    a.href = AUDIT_PREFILL + encodeURIComponent(r.url);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "full audit ↗";
    li.append(host, v, a);
    list.append(li);
  }
}

$("scan").addEventListener("click", deepScan);
loadLandscape();
```

- [ ] **Step 3: Commit**

```bash
git add apps/extension/sidepanel.html apps/extension/src/ui/sidepanel.js
git commit -m "feat(extension): side panel, deep scan, coverage, flagged-results list"
```

---

### Task 7: Manifest + build + delete popup

**Files:**
- Modify: `apps/extension/manifest.json`
- Modify: `apps/extension/src/background.js` (panel behavior on install)
- Modify: `apps/extension/package.json` (build + test scripts)
- Delete: `apps/extension/popup.html`, `apps/extension/src/ui/popup.js`

- [ ] **Step 1: Update `manifest.json`**: replace the `action` + `permissions` region so it reads:

```json
  "action": {
    "default_title": "pseolint, scan this SERP",
    "default_icon": { "128": "icons/icon-128.png" }
  },
  "side_panel": { "default_path": "sidepanel.html" },
  "background": {
    "service_worker": "dist/background.js"
  },
  "permissions": ["sidePanel"],
  "host_permissions": ["https://www.google.com/search*"],
  "optional_host_permissions": ["https://*/*"],
```

(Removed `default_popup` and `activeTab`; added `side_panel` + `sidePanel`. `tabs.query`/`sendMessage` to the SERP is covered by the google.com/search host permission.)

- [ ] **Step 2: Set the panel to open on the toolbar click**: in `background.js`, replace the `onInstalled` listener:

```js
chrome.runtime.onInstalled.addListener(() => {
  console.log("pseolint extension installed");
});
chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
```

- [ ] **Step 3: Update `package.json` build + test scripts**

```json
    "build": "bun build src/background.js --target=browser --format=iife --outfile=dist/background.js && bun build src/content/serp/index.js --target=browser --format=iife --outfile=dist/serp.js && bun build src/ui/sidepanel.js --target=browser --format=iife --outfile=dist/sidepanel.js",
    "test": "node tests/signals.test.js && node tests/client.test.js && node tests/overlay.test.js && node tests/pattern.test.js && node tests/parse.test.js && node tests/parse-parity.test.js && node tests/detect.test.js && node tests/rules-client.test.js && node tests/landscape.test.js && node tests/coverage.test.js",
```

- [ ] **Step 4: Delete the popup**

```bash
git rm apps/extension/popup.html apps/extension/src/ui/popup.js
```

- [ ] **Step 5: Build + test**

Run: `cd apps/extension && bun run build && bun run test`
Expected: three bundles (background, serp, sidepanel); all 10 tests pass.

- [ ] **Step 6: Confirm no leaks**

Run: `grep -cE "cheerio|node:|__require" dist/background.js dist/serp.js dist/sidepanel.js`
Expected: `0` for each.

- [ ] **Step 7: Commit**

```bash
git add apps/extension/manifest.json apps/extension/src/background.js apps/extension/package.json
git commit -m "feat(extension): side panel replaces popup; drop unused activeTab"
```

---

### Task 8: Live-verify the power tier

**Files:** none (verification only).

- [ ] **Step 1: Reload + open SERP**

`chrome://extensions` → reload → open a Google results page.

- [ ] **Step 2: Verify side panel + deep scan**

Expected: clicking the toolbar icon **opens the side panel** (no popup). It shows the landscape line. Clicking **Deep scan** triggers the host-permission prompt; on grant, status shows progress then `Scanned X/Y · Z flagged`, the list fills with `host · verdict · full audit ↗`, and red/amber badges appear on the SERP. The panel **stays open** when you click back to the page. If anything fails, open the side-panel devtools (right-click panel → Inspect) + the SW console and fix.

- [ ] **Step 3: Commit** (only if fixes were needed)

```bash
git add -A apps/extension
git commit -m "fix(extension): power-tier fixes from live verification"
```

---

# Phase 3: Visual revamp

### Task 9: Visual system across all surfaces

**Files:** `apps/extension/sidepanel.html`, `src/content/serp/reach.js`, `src/content/serp/overlay.js` (styles only), `apps/extension/icons/*`.

- [ ] **Step 1: Invoke the design skills**

Use `frontend-design` and `ui-ux-pro-max` to produce one cohesive visual system for: the in-page chip, the badges (templated/warn/flag), and the side panel (header, landscape, scan button, progress, list, **a badge legend**, empty/partial/error states). Constraints: brand-aligned with pseolint.dev (dark control surfaces, existing risk palette `#1a7f37`/`#9a6700`/`#cf222e`, neutral `#0969da`, the shipped logo), **vanilla + shadow-DOM** for in-page (§4/§9), accessibility basics (contrast, focus, keyboard, aria).

- [ ] **Step 2: Apply styles** to `reach.js` (chip), `overlay.js` (`STYLE` constant), and `sidepanel.html` (`<style>`). Touch styling only: no behavior changes, so the Task 1/2/5 tests stay green.

- [ ] **Step 3: Rebuild + test + live-verify**

Run: `cd apps/extension && bun run build && bun run test`
Expected: all tests still pass. Then reload in Chrome and screenshot the reach chip, badges, and side panel to confirm the look.

- [ ] **Step 4: Commit**

```bash
git add -A apps/extension
git commit -m "feat(extension): visual system across reach chip, badges, side panel"
```

---

# Phase 4: Docs

### Task 10: Update privacy / store / readme to the two-tier behavior

**Files:** `apps/extension/PRIVACY.md`, `apps/extension/STORE.md`, `apps/extension/README.md`

- [ ] **Step 1: PRIVACY.md**: add that the default (Tier-1) reads only the visible SERP and requests **no permission**; deep scan (Tier-2, opt-in) is unchanged. Update the permissions list (no `activeTab`; add side panel; deep-scan host access is gesture-granted).

- [ ] **Step 2: STORE.md**: update the description + permission justifications: default is zero-permission landscape; `sidePanel` for the results panel; `https://*/*` optional, requested only on Deep scan. Remove the `activeTab` justification.

- [ ] **Step 3: README.md**: replace the status section with the two-tier flow (auto reach on SERP; toolbar opens side panel; Deep scan opt-in). Update the load-unpacked steps (toolbar opens panel, not popup).

- [ ] **Step 4: Commit**

```bash
git add apps/extension/PRIVACY.md apps/extension/STORE.md apps/extension/README.md
git commit -m "docs(extension): two-tier behavior in privacy, store, readme"
```

---

## Self-review notes (author)

- **Spec coverage:** Tier-1 reach (Tasks 1–4) · honesty boundary (Task 1 cluster rule) · side panel power tier (Tasks 5–8) · coverage/no-false-all-clear (Task 5) · §9 textContent (Tasks 3,6) · manifest/permission trim incl. activeTab drop (Task 7) · visual revamp via the two skills (Task 9) · docs (Task 10). All spec sections map to a task.
- **Type consistency:** message types `pseolint:scan` (content→SW), `pseolint:deep-scan` + `pseolint:landscape` (panel→content) are used identically across `index.js`, `background.js`, `sidepanel.js`. Scan results carry `{url, verdict, ok}` end to end; `verdict` is `{level, label}` everywhere; `coverage()` consumes that exact shape.
- **No placeholders:** every code step is complete. `client.js`/`signals.js` remain (reserved) and keep their existing tests in the suite.
