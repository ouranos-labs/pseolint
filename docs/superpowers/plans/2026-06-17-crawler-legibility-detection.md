# Crawler-Legibility Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect CSR-bailout (interactive value present after hydration but missing from server HTML) via a raw-vs-rendered diff, and catch soft-404s on synthetic invalid URLs.

**Architecture:** Wire the existing-but-unwired `renderPages()` into the auditor so each `ParsedPage` carries a `renderedHtml`; a new `tech/csr-bailout` rule diffs raw vs rendered interactive/word counts (opt-in `--render`, high confidence). Independently, a default-on auditor step probes one synthetic invalid URL per template cluster and flags HTTP 200 responses as soft-404s.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), cheerio (installed), playwright-core (installed optional peer), vitest, bun available but **render runs under Node only**.

## Global Constraints

- ESM imports use `.js` extension even for `.ts` files (e.g. `import { x } from "../../types.js"`).
- Severity ∈ `"info" | "warning" | "error" | "critical"`; Confidence ∈ `"high" | "medium" | "low" | "speculative"` (`types.ts`).
- Run tests with `npx vitest run <path>` from `packages/core` (script: `vitest run --passWithNoTests tests/**/*.test.ts`).
- Render is **Node-only** (fails under bun: CDP-over-pipe handshake). Render needs the pinned Chromium: `node node_modules/playwright-core/cli.js install chromium-headless-shell`.
- New rule id `tech/csr-bailout` → update CHANGELOG and any rule-count mentions.
- Follow existing rule conventions: pure functions over `ParsedPage[]` returning `RuleResult[]`; registration in `rules/scope.ts` + `rule-references.ts`; invocation guarded by `isEnabled(...)`/`modeOk(...)` in `auditor.ts`.

---

### Task 1: Framework + interactive-element helpers

**Files:**
- Create: `packages/core/src/framework-detect.ts`
- Test: `packages/core/tests/framework-detect.test.ts`

**Interfaces:**
- Produces: `detectClientFrameworkFromHtml(html: string): "nextjs" | "react" | "vite" | "astro" | null`; `countInteractive(html: string): number`; `type ClientFramework`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/tests/framework-detect.test.ts
import { describe, it, expect } from "vitest";
import { detectClientFrameworkFromHtml, countInteractive } from "../src/framework-detect.js";

describe("detectClientFrameworkFromHtml", () => {
  it("detects Next.js from streaming marker", () => {
    expect(detectClientFrameworkFromHtml('<script>self.__next_f.push([1,"x"])</script>')).toBe("nextjs");
  });
  it("detects Next.js from static chunk path", () => {
    expect(detectClientFrameworkFromHtml('<script src="/_next/static/chunks/main.js"></script>')).toBe("nextjs");
  });
  it("detects astro and vite", () => {
    expect(detectClientFrameworkFromHtml("<astro-island></astro-island>")).toBe("astro");
    expect(detectClientFrameworkFromHtml('<script type="module" src="/@vite/client"></script>')).toBe("vite");
  });
  it("detects bare React mount", () => {
    expect(detectClientFrameworkFromHtml('<div id="root"></div><script src="/bundle.js"></script>')).toBe("react");
  });
  it("returns null for plain server HTML", () => {
    expect(detectClientFrameworkFromHtml("<html><body><h1>Hi</h1><p>words</p></body></html>")).toBeNull();
  });
});

describe("countInteractive", () => {
  it("counts form controls", () => {
    expect(countInteractive("<form><input><textarea></textarea><button>Go</button></form>")).toBe(4); // form+input+textarea+button
  });
  it("returns 0 for a shell", () => {
    expect(countInteractive('<div id="__next"></div>')).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/framework-detect.test.ts`
Expected: FAIL, cannot find module `../src/framework-detect.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/framework-detect.ts
import { load } from "cheerio";

export type ClientFramework = "nextjs" | "react" | "vite" | "astro";

const NEXT = [/self\.__next_f/, /\/_next\/static\//, /id="__next"/];
const VITE = [/\/@vite\//, /<script[^>]+type="module"[^>]+src="\//i];
const ASTRO = [/astro-island/, /\/_astro\//];

/** Detect a client-side framework from raw HTML body markers (not headers). */
export function detectClientFrameworkFromHtml(html: string): ClientFramework | null {
  if (NEXT.some((re) => re.test(html))) return "nextjs";
  if (VITE.some((re) => re.test(html))) return "vite";
  if (ASTRO.some((re) => re.test(html))) return "astro";
  if (/id="root"/.test(html) && /<script[^>]+src=/i.test(html)) return "react";
  return null;
}

const INTERACTIVE = "input, select, textarea, button, form";

/** Count interactive form controls present in HTML. Used symmetrically on raw + rendered. */
export function countInteractive(html: string): number {
  return load(html)(INTERACTIVE).length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/framework-detect.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/framework-detect.ts packages/core/tests/framework-detect.test.ts
git commit -m "feat(core): framework + interactive-element detection helpers"
```

---

### Task 2: `tech/csr-bailout` render-diff rule

**Files:**
- Modify: `packages/core/src/types.ts` (add `ParsedPage.renderedHtml?`)
- Create: `packages/core/src/rules/tech/csr-bailout.ts`
- Modify: `packages/core/src/rules/scope.ts` (register)
- Modify: `packages/core/src/rule-references.ts` (docs URL)
- Test: `packages/core/tests/rules/tech/csr-bailout.test.ts`

**Interfaces:**
- Consumes: `countInteractive`, `detectClientFrameworkFromHtml` (Task 1); `ParsedPage` with optional `renderedHtml`.
- Produces: `csrBailoutRule(pages: ParsedPage[]): RuleResult[]`.

- [ ] **Step 1: Add the `renderedHtml` field to `ParsedPage`**

In `packages/core/src/types.ts`, locate the `ParsedPage` interface (the `html: string` field, ~`html` near `contentText`). Add directly below `html`:

```ts
  /** Post-hydration DOM (page.content()) when audited with --render; absent in static mode. */
  renderedHtml?: string;
```

- [ ] **Step 2: Write the failing test**

```ts
// packages/core/tests/rules/tech/csr-bailout.test.ts
import { describe, it, expect } from "vitest";
import { csrBailoutRule } from "../../../src/rules/tech/csr-bailout.js";
import type { ParsedPage } from "../../../src/types.js";

function page(p: Partial<ParsedPage> & { url: string; html: string }): ParsedPage {
  // Minimal ParsedPage for rule tests, only fields the rule reads matter.
  return { contentText: "", title: "", url: p.url, html: p.html, ...p } as ParsedPage;
}

const FORM = "<form><input name=a><input name=b><input name=c><textarea></textarea><button>Generate</button></form>";

describe("csr-bailout", () => {
  it("flags partial shell: 0 raw interactive, many rendered (high)", () => {
    const out = csrBailoutRule([page({
      url: "https://x.com/t/1",
      html: '<div id="__next"></div><script>self.__next_f.push([1])</script>',
      renderedHtml: `<div id="__next">${FORM}</div>`,
    })]);
    expect(out).toHaveLength(1);
    expect(out[0].ruleId).toBe("tech/csr-bailout");
    expect(out[0].confidence).toBe("high");
    expect(out[0].message).toMatch(/next build && next start/i);
  });

  it("does not flag healthy page: raw ~ rendered", () => {
    const html = `<div id="__next">${FORM}</div>`;
    expect(csrBailoutRule([page({ url: "https://x.com/t/2", html, renderedHtml: html })])).toHaveLength(0);
  });

  it("flags content bail: tiny raw words, large rendered words (medium)", () => {
    const big = "<p>" + "word ".repeat(400) + "</p>";
    const out = csrBailoutRule([page({
      url: "https://x.com/a",
      html: "<div id=root></div><script src=/b.js></script><p>hi there friend</p>",
      renderedHtml: `<div id=root>${big}</div>`,
    })]);
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe("medium");
  });

  it("no-ops when renderedHtml is absent (render off)", () => {
    expect(csrBailoutRule([page({ url: "https://x.com/t/3", html: "<div id=__next></div>" })])).toHaveLength(0);
  });

  it("does not flag a tiny client widget below MIN_INTERACTIVE", () => {
    expect(csrBailoutRule([page({
      url: "https://x.com/m",
      html: "<div id=root></div><script src=/b.js></script>",
      renderedHtml: "<div id=root><button>Subscribe</button></div>",
    })])).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/rules/tech/csr-bailout.test.ts`
Expected: FAIL, cannot find module `csr-bailout.js`.

- [ ] **Step 4: Write the rule**

```ts
// packages/core/src/rules/tech/csr-bailout.ts
import { load } from "cheerio";
import type { ParsedPage, RuleResult, Confidence } from "../../types.js";
import { countInteractive, detectClientFrameworkFromHtml } from "../../framework-detect.js";

// ponytail: render-diff thresholds, tuned to the paperforge case (0 raw / 44
// rendered interactive). Surface via rules options only if real audits need it.
const MIN_INTERACTIVE = 3;
const RATIO_FLOOR = 0.1;
const MIN_WORD_DELTA = 250;
const CONTENT_RATIO_FLOOR = 0.5;

function visibleWordCount(html: string): number {
  const $ = load(html);
  $("script, style, noscript, template").remove();
  return ($("body").text() || "").split(/\s+/).filter(Boolean).length;
}

/**
 * Flags pages whose interactive value (or substantive content) exists in the
 * rendered DOM but not the raw server HTML: invisible to crawlers that don't
 * run JS. Requires --render (no-op when page.renderedHtml is absent).
 */
export function csrBailoutRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];
  for (const page of pages) {
    if (!page.renderedHtml) continue;

    const rawI = countInteractive(page.html);
    const rendI = countInteractive(page.renderedHtml);
    const rawW = visibleWordCount(page.html);
    const rendW = visibleWordCount(page.renderedHtml);

    const interactiveBail =
      rendI >= MIN_INTERACTIVE && (rawI === 0 || rawI / rendI <= RATIO_FLOOR);
    const contentBail =
      rendW - rawW >= MIN_WORD_DELTA && rawW / Math.max(rendW, 1) <= CONTENT_RATIO_FLOOR;
    if (!interactiveBail && !contentBail) continue;

    const confidence: Confidence = interactiveBail ? "high" : "medium";
    const nextHint =
      detectClientFrameworkFromHtml(page.html) === "nextjs"
        ? " Next.js: keep useSearchParams()/dynamic hooks inside a <Suspense> boundary, and move new Date()/Math.random() out of client render paths under cacheComponents (into useEffect). Verify with `next build && next start`, not `next dev`."
        : "";

    findings.push({
      ruleId: "tech/csr-bailout",
      severity: "warning",
      confidence,
      pageUrl: page.url,
      message:
        `${page.url} exposes ${rendI} interactive elements after hydration but ${rawI} in the server HTML ` +
        `(${rawW}→${rendW} words). Crawlers and Google's first pass see an incomplete shell, making the page look thin or duplicate.${nextHint}`,
      fix: "Server-render or prerender the interactive content so it is present in the raw HTML.",
    });
  }
  return findings;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/rules/tech/csr-bailout.test.ts`
Expected: PASS (5 cases).

- [ ] **Step 6: Register the rule**

In `packages/core/src/rules/scope.ts`, in the `// tech` block of `RULE_SCOPE`, add:

```ts
  "tech/csr-bailout": "page",
```

In `packages/core/src/rule-references.ts`, add a docs-URL entry alongside the other `tech/*` rules (match the existing key/format used for `tech/soft-404`).

- [ ] **Step 7: Invoke the rule in the auditor**

In `packages/core/src/auditor.ts`: add the import near the other rule imports:

```ts
import { csrBailoutRule } from "./rules/tech/csr-bailout.js";
```

In `runRulesOnPages()` (where other page-scoped rules are invoked, e.g. the `thin-content`/`soft-404` blocks), add:

```ts
if (isEnabled("tech/csr-bailout") && modeOk("tech/csr-bailout")) {
  pushAll(findings, tag(csrBailoutRule(pages)));
}
```

(Use the exact `tag`/`pushAll` helpers the neighboring rules use in that function.)

- [ ] **Step 8: Run the full core test suite + typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: PASS (no type errors from the new field/import).

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/rules/tech/csr-bailout.ts packages/core/src/rules/scope.ts packages/core/src/rule-references.ts packages/core/src/auditor.ts packages/core/tests/rules/tech/csr-bailout.test.ts
git commit -m "feat(core): tech/csr-bailout render-diff rule"
```

---

### Task 3: Wire `renderPages()` into the auditor + permanent renderer test

**Files:**
- Modify: `packages/core/src/auditor.ts` (call `renderPages`, populate `renderedHtml`, pre-flight)
- Test: `packages/core/tests/renderer.test.ts`

**Interfaces:**
- Consumes: `renderPages(pages: Array<{url: string; localPath?: string}>, sourceDir: string|null, options: { browserWsEndpoint?: string; concurrency: number; timeoutMs: number; analyticsMode?: AnalyticsMode; extraBlockedHosts?: readonly string[] }): Promise<Array<{url: string; html: string}>>` (`renderer.ts:137`).
- Produces: `ParsedPage.renderedHtml` populated for rendered pages.

- [ ] **Step 1: Read the wiring context**

Read `packages/core/src/auditor.ts` around `currentRenderMode` (`:2269`) and the point where `pages: ParsedPage[]` exist and before `runRulesOnPages` is called. Read how `options.render` is shaped (`browserWsEndpoint`, `analyticsMode`, `extraBlockedHosts`) from `cli.ts:484-493`. Note the crawl concurrency variable name.

- [ ] **Step 2: Write the renderer smoke test (permanent)**

```ts
// packages/core/tests/renderer.test.ts
import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderPages } from "../src/renderer.js";

// JS injects a form via DOM API, raw bytes contain zero <input>/<button>.
const SHELL = `<!doctype html><html><head><title>s</title></head><body>
<div id="app"></div>
<script>
  var f=document.createElement('form');
  f.appendChild(document.createElement('input'));
  var b=document.createElement('button'); b.textContent='Go'; f.appendChild(b);
  document.getElementById('app').appendChild(f);
</script></body></html>`;

function hasBrowser(): boolean {
  try { require("playwright-core"); } catch { return false; }
  return true;
}

describe("renderPages (Node only, JS executes, post-render DOM returned)", () => {
  it.skipIf(!hasBrowser())("renders injected DOM not present in raw HTML", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pseolint-render-"));
    try {
      await writeFile(join(dir, "shell.html"), SHELL, "utf8");
      const out = await renderPages(
        [{ url: "http://local/shell.html", localPath: "shell.html" }],
        dir,
        { concurrency: 1, timeoutMs: 20000, analyticsMode: "allow" },
      );
      const strip = (s: string) => s.replace(/<script[\s\S]*?<\/script>/gi, "");
      const rendered = strip(out[0]?.html ?? "");
      expect((rendered.match(/<input/gi) ?? []).length).toBeGreaterThanOrEqual(1);
      expect((rendered.match(/<button/gi) ?? []).length).toBeGreaterThanOrEqual(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 40000);
});
```

- [ ] **Step 3: Ensure the browser binary is installed, then run the test**

Run: `node node_modules/playwright-core/cli.js install chromium-headless-shell`
Run: `npx vitest run tests/renderer.test.ts`
Expected: PASS (renders ≥1 input + button). If no browser, the case skips cleanly, that is acceptable for CI.

- [ ] **Step 4: Add the render step in the auditor**

In `auditor.ts`, after `pages: ParsedPage[]` are parsed and before `runRulesOnPages`, when `options?.render` is set:

```ts
if (options?.render) {
  const { renderPages } = await import("./renderer.js");
  const rendered = await renderPages(
    pages.map((p) => ({ url: p.url })),
    null,
    {
      browserWsEndpoint: options.render.browserWsEndpoint,
      concurrency: /* the crawl concurrency variable */,
      timeoutMs: 30000,
      analyticsMode: options.render.analyticsMode,
      extraBlockedHosts: options.render.extraBlockedHosts,
    },
  );
  const byUrl = new Map(rendered.map((r) => [r.url, r.html]));
  for (const p of pages) {
    const html = byUrl.get(p.url);
    if (html) p.renderedHtml = html;
  }
}
```

(Use the actual crawl concurrency variable found in Step 1; default to `4` if none is in scope.)

- [ ] **Step 5: Add the pre-flight browser check**

Before the render call, when `options.render` is set and neither `options.render.browserWsEndpoint` nor `process.env.PSEOLINT_BROWSER_WS` is set, attempt `await import("playwright-core")` in a try/catch; on failure, surface the same install hint the renderer throws (`renderer.ts:82-88`) via the auditor's normal user-facing warning channel, and continue in static mode (do not crash the audit). This converts a mid-crawl throw into an upfront, actionable message.

- [ ] **Step 6: Manual integration verification**

Run a render audit against a known client-rendered page (any Next.js app) via the CLI `--render` flag and confirm no crash and that `tech/csr-bailout` can fire. (Document the command used in the commit body.)

- [ ] **Step 7: Run full suite + typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/auditor.ts packages/core/tests/renderer.test.ts
git commit -m "feat(core): wire renderPages into the audit pipeline (populates ParsedPage.renderedHtml)"
```

---

### Task 4: `tech/soft-404` synthetic probe

**Files:**
- Modify: `packages/core/src/rules/tech/soft-404.ts` (add `evaluateProbe`)
- Modify: `packages/core/src/auditor.ts` (probe step)
- Test: `packages/core/tests/rules/tech/soft-404.test.ts` (extend)

**Interfaces:**
- Consumes: `detectTemplates(urls: string[]): TemplateCandidate[]` + `LONGTAIL_SIGNATURE` (`template-detection.ts`); the central fetch (`cachedFetch`); `detectAuthPage` / `skipDetectedAuth`.
- Produces: `evaluateProbe(probedUrl: string, status: number, body: string): RuleResult | null`.

- [ ] **Step 1: Write the failing test for `evaluateProbe`**

```ts
// append to packages/core/tests/rules/tech/soft-404.test.ts
import { evaluateProbe } from "../../../src/rules/tech/soft-404.js";

describe("evaluateProbe (synthetic invalid URL)", () => {
  it("flags 200 + not-found body at high confidence", () => {
    const f = evaluateProbe("https://x.com/t/pseolint-404-probe-1", 200, "<h1>Page not found</h1>");
    expect(f?.ruleId).toBe("tech/soft-404");
    expect(f?.confidence).toBe("high");
  });
  it("flags 200 + near-empty shell at high confidence (no pattern)", () => {
    const f = evaluateProbe("https://x.com/t/pseolint-404-probe-2", 200, "<div id=__next></div>");
    expect(f?.confidence).toBe("high");
  });
  it("flags 200 + substantive body at medium confidence", () => {
    const f = evaluateProbe("https://x.com/t/p", 200, "<p>" + "real content ".repeat(60) + "</p>");
    expect(f?.confidence).toBe("medium");
  });
  it("does not flag a real 404", () => {
    expect(evaluateProbe("https://x.com/t/p", 404, "<h1>not found</h1>")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/rules/tech/soft-404.test.ts`
Expected: FAIL, `evaluateProbe` is not exported.

- [ ] **Step 3: Add `evaluateProbe` to `soft-404.ts`**

```ts
// add to packages/core/src/rules/tech/soft-404.ts (reuses SOFT_404_PATTERNS + THIN_BODY_THRESHOLD)
import { load } from "cheerio";

/**
 * Evaluate a synthetic-invalid-URL probe response. A correct site returns
 * 404/410 for a URL that cannot exist; a 200 is the soft-404 signal: no body
 * pattern required (unlike soft404Rule). Body pattern/emptiness raises confidence.
 */
export function evaluateProbe(probedUrl: string, status: number, body: string): RuleResult | null {
  if (status !== 200) return null;
  const $ = load(body);
  $("script, style, noscript, template").remove();
  const text = ($("body").text() || "").trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  const strong = SOFT_404_PATTERNS.test(text) || words < THIN_BODY_THRESHOLD;
  return {
    ruleId: "tech/soft-404",
    severity: "warning",
    confidence: strong ? "high" : "medium",
    pageUrl: probedUrl,
    message: `${probedUrl} is a nonexistent URL but returned HTTP 200. Crawlers can index unlimited junk pages.`,
    fix: "Return a real HTTP 404/410 (edge gate or middleware) for unknown slugs.",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/rules/tech/soft-404.test.ts`
Expected: PASS (existing soft-404 tests + 4 new probe cases).

- [ ] **Step 5: Read the probe-step context**

Read `template-detection.ts` (`detectTemplates`, `LONGTAIL_SIGNATURE`), the `cachedFetch` signature (grep `export.*cachedFetch`), and how `auditor.ts` reads `siteType` and `skipDetectedAuth`. Confirm the response shape `cachedFetch` returns (status + body text).

- [ ] **Step 6: Add the probe step in the auditor**

In `auditor.ts`, after pages are parsed, gated on `siteType === "programmatic-directory"`:

```ts
import { detectTemplates, LONGTAIL_SIGNATURE } from "./template-detection.js";
import { evaluateProbe } from "./rules/tech/soft-404.js";

const PROBE_CAP = 25;
if (isEnabled("tech/soft-404") && siteType === "programmatic-directory") {
  const clusters = detectTemplates(pages.map((p) => p.url))
    .filter((c) => c.signature !== LONGTAIL_SIGNATURE && c.urls.length > 0)
    .slice(0, PROBE_CAP);
  log(`soft-404 probe: ${clusters.length} cluster(s)`);
  for (const c of clusters) {
    const rep = new URL(c.urls[0]);
    rep.pathname = rep.pathname.replace(/\/[^/]+\/?$/, `/pseolint-404-probe-${Math.abs(hashString(c.signature))}`);
    const target = rep.toString();
    try {
      const resp = await cachedFetch(target); // confirm shape in Step 5
      const finding = evaluateProbe(target, resp.status, resp.body ?? "");
      if (finding) pushAll(findings, tag([finding]));
    } catch {
      log(`soft-404 probe: skipped ${target} (fetch error)`);
    }
  }
}
```

Use a deterministic token (hash of the cluster signature, reuse any existing string-hash util; if none, a tiny inline `[...s].reduce((h,c)=>((h<<5)-h+c.charCodeAt(0))|0,0)`). Respect `skipDetectedAuth` if the representative page was auth-detected. Adapt `cachedFetch`'s real return shape and the `tag`/`pushAll`/`log` helpers to those in scope.

- [ ] **Step 7: Run full suite + typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/rules/tech/soft-404.ts packages/core/src/auditor.ts packages/core/tests/rules/tech/soft-404.test.ts
git commit -m "feat(core): soft-404 synthetic probe (200 on an invented URL = soft-404)"
```

---

### Task 5: Site-type weighting, cluster collapse, docs

**Files:**
- Modify: `packages/core/src/auditor.ts` (`SCORING_PROFILES`)
- Modify: `packages/core/src/enrich-findings.ts` (cluster-collapse for `tech/csr-bailout`)
- Modify: `CHANGELOG.md` and rule-count mentions

- [ ] **Step 1: Add the scoring override**

In `auditor.ts` `SCORING_PROFILES` (~194-427): under `programmatic-directory`, leave `tech/csr-bailout` at native `warning` (full weight); under `small-marketing`, add `severityOverrides: { "tech/csr-bailout": "info" }`.

- [ ] **Step 2: Verify weighting with a test**

Add a focused test asserting that a `tech/csr-bailout` finding contributes full weight under `programmatic-directory` and is demoted under `small-marketing` (mirror an existing scoring-profile test in the suite).

Run: `npx vitest run` → Expected: PASS.

- [ ] **Step 3: Cluster collapse**

Read `enrich-findings.ts` `CLUSTERABLE_RULES`/`GROUPABLE_RULES` and how they collapse by template. Add `tech/csr-bailout` to whichever set collapses per-template findings into one (so a 5,600-page network yields one finding per cluster). If collapse requires `relatedUrls`, populate it in the rule by grouping pages per `detectTemplates` signature before emitting. Add a test asserting N same-cluster bailout pages collapse to one finding.

Run: `npx vitest run` → Expected: PASS.

- [ ] **Step 4: Docs**

Add a `CHANGELOG.md` entry: new `tech/csr-bailout` rule (render-diff, `--render`) + soft-404 synthetic probe. Update any rule-count references (grep for the current count, e.g. `grep -rn "47 rules\|rules)" README.md apps/web docs`) and bump by one.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/auditor.ts packages/core/src/enrich-findings.ts CHANGELOG.md
git commit -m "feat(core): csr-bailout scoring weight + cluster collapse; docs"
```

---

### Task 6: Live regression check

- [ ] **Step 1:** Run `--render` audit of `https://paperforge.dev` (in the calibration corpus). Confirm `tech/csr-bailout` does **not** fire (raw ≈ rendered; 44 inputs now in server HTML) and the soft-404 probe of `/templates/<random>` does **not** fire (real 404).
- [ ] **Step 2:** Record the result in the commit body / calibration notes. No code change unless a false positive surfaces (then open a follow-up).

## Self-Review

- **Spec coverage:** Component 1 render wiring → Task 3; `ParsedPage.renderedHtml` → Task 2 Step 1 + Task 3. Component 2 `tech/csr-bailout` → Task 2 (logic) + Task 5 (weighting, collapse). Component 3 soft-404 probe → Task 4. framework-detect helpers → Task 1. Pre-flight → Task 3 Step 5. Tests/fixtures → Tasks 1,2,3,4,5. Live regression → Task 6. CHANGELOG/rule-count → Task 5. All spec sections mapped.
- **Placeholder scan:** Integration steps in Tasks 3/4 intentionally include a read-first step because `auditor.ts` internals and `cachedFetch`'s shape were not fully read during planning; the surrounding code is given concretely. All pure-unit code (Tasks 1, 2, 4 evaluateProbe) is complete.
- **Type consistency:** `csrBailoutRule(pages): RuleResult[]`, `countInteractive(html): number`, `detectClientFrameworkFromHtml(html): ClientFramework|null`, `evaluateProbe(url, status, body): RuleResult|null`, `ParsedPage.renderedHtml?: string`: consistent across tasks. Rule id `tech/csr-bailout` consistent in scope.ts, rule, auditor, scoring, docs.
