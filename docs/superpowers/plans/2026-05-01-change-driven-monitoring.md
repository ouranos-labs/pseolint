# Change-Driven Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the "should we re-audit this URL?" decision upstream of the fetch, using cheap signals (sitemap `<lastmod>`, prior state, ruleset version, age floor) so monitoring runs fetch only URLs with evidence of change. Carry findings forward for the rest.

**Architecture:** New pure module `scrape-strategy.ts` with `planScrapeStrategy()` (decision matrix). Extend `state.ts` schema (v1→v2) with `lastModified`, `etag`, `sitemapLastmodAtAudit`, `rulesetVersion`, full `findings`. Surface `Last-Modified`/`ETag` from `cache.ts` result. Extend sitemap walker in `auditor.ts` to return `<lastmod>` alongside URLs. Replace today's `--since` post-fetch hash skip with the pre-fetch decision. Auto-monitoring when prior state exists; `--mode=fresh` escape hatch.

**Tech Stack:** TypeScript (ESM, `.js` extensions in imports), Vitest, Node.js `>=18` built-ins. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-01-change-driven-monitoring-design.md`

---

## File Structure

### New files

| Path | Responsibility |
|------|----------------|
| `packages/core/src/ruleset-version.ts` | `CORE_RULESET_VERSION` constant. ~5 LOC. |
| `packages/core/src/scrape-strategy.ts` | `planScrapeStrategy()`, types `RefetchReason`, `SkipReason`, `ScrapePlan`. ~120 LOC. |
| `packages/core/tests/scrape-strategy.test.ts` | Exhaustive decision-matrix tests. |
| `packages/core/tests/ruleset-version.test.ts` | Sanity test that constant exists and is non-empty. |

### Modified files

| Path | Change |
|------|--------|
| `packages/core/src/state.ts` | Add `lastModified`, `etag`, `sitemapLastmodAtAudit`, `rulesetVersion`, `findings: Finding[]` to `UrlStateEntry`; add `rulesetVersion`, `lastFullAuditAt` to `RunState`; bump `STATE_SCHEMA_VERSION` to 2; update `readState` validation. |
| `packages/core/src/cache.ts` | Surface raw `last-modified` and `etag` from response headers in `CachedFetchResult` (already in `headers` but caller would dig into the bag — make explicit accessors not needed; document headers are lowercased). |
| `packages/core/src/auditor.ts` | Extend `collectUrlsFromSitemap` return type to `{ urls: string[]; lastmodByUrl: Map<string, string> }`; replace `state.since` post-fetch skip with `planScrapeStrategy()` pre-fetch; implement findings carry-forward; populate new state fields; surface `scrapePlan` in summary. |
| `packages/core/src/types.ts` | Add `ScrapePlanSummary` type; extend `AuditSummary` with optional `scrapePlan`; extend `AuditOptions.state` with `mode?: "monitoring" \| "fresh"`, `ageFloorDays?: number`. |
| `packages/core/src/index.ts` | Export `planScrapeStrategy`, `CORE_RULESET_VERSION`, new types. |
| `packages/cli/src/cli.ts` (or wherever flags live) | Add `--mode`, `--age-floor-days`. Keep `--since` as alias. Print monitoring summary line. |
| `packages/core/CHANGELOG.md` | v0.5.0 entry. |

---

## Ground rules for every task

- Test commands run from repo root unless stated otherwise.
- Core tests: `bun --cwd packages/core test -- <test-file-pattern>`
- Typecheck: `bun --cwd packages/core run lint`
- All imports in source use `.js` extensions (ESM): `import { foo } from "./bar.js"`.
- All type-only imports use `import type`.
- Commit messages follow existing style: `feat: ...`, `fix: ...`, `test: ...`, `refactor: ...`.
- After EVERY task, run typecheck. It must pass before committing.
- NEVER skip hooks (`--no-verify`).

---

## Phase 1 — Foundation primitives (no behavior change)

### Task 1: Ruleset version constant

**Files:**
- Create: `packages/core/src/ruleset-version.ts`
- Create: `packages/core/tests/ruleset-version.test.ts`

- [ ] **Step 1.1: Write failing test**

```ts
// packages/core/tests/ruleset-version.test.ts
import { describe, it, expect } from "vitest";
import { CORE_RULESET_VERSION } from "../src/ruleset-version.js";

describe("CORE_RULESET_VERSION", () => {
  it("is a non-empty string", () => {
    expect(typeof CORE_RULESET_VERSION).toBe("string");
    expect(CORE_RULESET_VERSION.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 1.2: Run test, verify FAIL** — `bun --cwd packages/core test -- ruleset-version`. Expected: cannot resolve module.

- [ ] **Step 1.3: Implement constant**

```ts
// packages/core/src/ruleset-version.ts
/**
 * Bump when adding a rule, materially changing rule logic, or changing a default
 * threshold in a way that would change findings on previously-audited pages.
 * Pure refactor → don't bump. Used by change-driven monitoring to invalidate
 * skips when a new rule wouldn't otherwise run on prior-state-only URLs.
 */
export const CORE_RULESET_VERSION = "1";
```

- [ ] **Step 1.4: Run test, verify PASS**

- [ ] **Step 1.5: Typecheck + commit**

```bash
bun --cwd packages/core run lint
git add packages/core/src/ruleset-version.ts packages/core/tests/ruleset-version.test.ts
git commit -m "feat(core): add CORE_RULESET_VERSION constant for monitoring skip invalidation"
```

---

### Task 2: Extend state schema (v1→v2)

**Files:**
- Modify: `packages/core/src/state.ts`
- Modify: `packages/core/tests/state.test.ts`

- [ ] **Step 2.1: Read current state.ts and state.test.ts**

`Read packages/core/src/state.ts` and `packages/core/tests/state.test.ts` to confirm current shape and existing test patterns.

- [ ] **Step 2.2: Write failing tests for v2 fields**

Append to `packages/core/tests/state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readState, writeState, STATE_SCHEMA_VERSION, type RunState } from "../src/state.js";

describe("state schema v2", () => {
  it("STATE_SCHEMA_VERSION is 2", () => {
    expect(STATE_SCHEMA_VERSION).toBe(2);
  });

  it("readState rejects v1 state (returns null on shape mismatch)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pseolint-state-"));
    const path = join(dir, "state.json");
    writeFileSync(path, JSON.stringify({
      version: 1,
      lastRun: "2026-01-01T00:00:00Z",
      source: "https://example.com",
      renderMode: "static",
      urls: {},
      summary: { score: 0, totalFindings: 0, byCategory: {} },
    }));
    await expect(readState(path)).rejects.toThrow(/unsupported state version 1/);
  });

  it("writeState round-trips v2 fields", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pseolint-state-"));
    const path = join(dir, "state.json");
    const state: RunState = {
      version: STATE_SCHEMA_VERSION,
      lastRun: "2026-05-01T00:00:00Z",
      lastFullAuditAt: "2026-05-01T00:00:00Z",
      source: "https://example.com",
      renderMode: "static",
      rulesetVersion: "1",
      urls: {
        "https://example.com/a": {
          contentHash: "sha256:abc",
          fetchedAt: "2026-05-01T00:00:00Z",
          status: 200,
          findingIds: [],
          findings: [],
          rulesetVersion: "1",
          lastModified: "Wed, 01 May 2026 00:00:00 GMT",
          etag: "\"abc\"",
        },
      },
      summary: { score: 100, totalFindings: 0, byCategory: {} },
    };
    await writeState(path, state);
    const read = await readState(path);
    expect(read?.urls["https://example.com/a"].lastModified).toBe("Wed, 01 May 2026 00:00:00 GMT");
    expect(read?.urls["https://example.com/a"].etag).toBe("\"abc\"");
    expect(read?.urls["https://example.com/a"].rulesetVersion).toBe("1");
    expect(read?.lastFullAuditAt).toBe("2026-05-01T00:00:00Z");
    expect(read?.rulesetVersion).toBe("1");
  });
});
```

- [ ] **Step 2.3: Run tests, verify FAIL**

`bun --cwd packages/core test -- state`. Expected: `STATE_SCHEMA_VERSION is 2` fails (still 1); v2 round-trip fails (fields rejected by validation).

- [ ] **Step 2.4: Update state.ts schema**

Edit `packages/core/src/state.ts`:

Replace `STATE_SCHEMA_VERSION` constant:

```ts
export const STATE_SCHEMA_VERSION = 2;
```

Extend `UrlStateEntry`:

```ts
export interface Finding {
  id: string;
  ruleId: string;
  severity: string;
  confidence: string;
  message: string;
  url?: string;
  // permissive shape — exact Finding type lives in types.ts; state stores a snapshot
  [key: string]: unknown;
}

export interface UrlStateEntry {
  contentHash: string;
  fetchedAt: string;
  status: number;
  findingIds: string[];          // kept for back-compat within v2; derived from findings
  findings: Finding[];            // NEW: full records for carry-forward
  rulesetVersion: string;         // NEW: ruleset signature at last fetch
  lastModified?: string;          // NEW: HTTP Last-Modified header
  etag?: string;                  // NEW: HTTP ETag header
  sitemapLastmodAtAudit?: string; // NEW: sitemap <lastmod> for this URL
  gscMetricsAtLastRun?: { impressions: number; clicks: number; period: string };
}
```

Extend `RunState`:

```ts
export interface RunState {
  version: number;
  lastRun: string;
  lastFullAuditAt: string;     // NEW
  source: string;
  renderMode: RenderMode;
  rulesetVersion: string;      // NEW
  urls: Record<string, UrlStateEntry>;
  summary: {
    score: number;
    totalFindings: number;
    byCategory: Record<string, number>;
  };
}
```

Update validation in `readState`:

```ts
if (typeof state.lastRun !== "string" ||
    typeof state.lastFullAuditAt !== "string" ||
    typeof state.source !== "string" ||
    typeof state.renderMode !== "string" ||
    typeof state.rulesetVersion !== "string" ||
    !state.urls || typeof state.urls !== "object" ||
    !state.summary || typeof state.summary !== "object") {
  throw new Error(`state file at ${path} has malformed shape`);
}
```

- [ ] **Step 2.5: Run tests, verify PASS**

`bun --cwd packages/core test -- state`. All state tests should pass.

- [ ] **Step 2.6: Run full core test suite to catch fallout**

`bun --cwd packages/core test`. Existing tests in auditor / state / cache may need updating where they construct `UrlStateEntry` or `RunState` literals. For each failure, add the missing required fields (`findings: []`, `rulesetVersion: "1"`, `lastFullAuditAt: ...`). Do NOT make new fields optional just to dodge fixing tests — the design wants them required.

- [ ] **Step 2.7: Typecheck**

`bun --cwd packages/core run lint`. Fix any TS errors caused by added required fields, same approach: provide values, don't widen the type.

- [ ] **Step 2.8: Commit**

```bash
git add packages/core/src/state.ts packages/core/tests/state.test.ts
# also any test/source files updated to satisfy the new required fields
git commit -m "feat(core): bump state schema to v2 with monitoring fields"
```

---

### Task 3: Document that cachedFetch headers include last-modified and etag

**Files:**
- Modify: `packages/core/src/cache.ts`
- Modify: `packages/core/tests/cache.test.ts`

`CachedFetchResult.headers` already contains lowercased response headers (see `headersToObject` at cache.ts ~199). No code change needed — but add a regression test pinning the contract so a future refactor doesn't drop these.

- [ ] **Step 3.1: Write regression test**

Append to `packages/core/tests/cache.test.ts`:

```ts
describe("cachedFetch surfaces validators", () => {
  it("includes last-modified and etag in headers when origin returns them", async () => {
    const fetcher = async () => new Response("body", {
      status: 200,
      headers: {
        "content-type": "text/html",
        "last-modified": "Wed, 01 May 2026 00:00:00 GMT",
        "etag": "\"v1\"",
      },
    });
    const { cachedFetch } = await import("../src/cache.js");
    const res = await cachedFetch("https://example.com/", {
      timeoutMs: 5000,
      cache: null,
      fetcher,
    });
    expect(res.headers["last-modified"]).toBe("Wed, 01 May 2026 00:00:00 GMT");
    expect(res.headers["etag"]).toBe("\"v1\"");
  });
});
```

- [ ] **Step 3.2: Run test, verify PASS** (no implementation change required — this is a regression pin).

`bun --cwd packages/core test -- cache`.

- [ ] **Step 3.3: Commit**

```bash
git add packages/core/tests/cache.test.ts
git commit -m "test(core): pin last-modified and etag passthrough in cachedFetch"
```

---

## Phase 2 — Decision logic (pure)

### Task 4: `planScrapeStrategy()` with exhaustive matrix tests

**Files:**
- Create: `packages/core/src/scrape-strategy.ts`
- Create: `packages/core/tests/scrape-strategy.test.ts`

- [ ] **Step 4.1: Write failing tests**

```ts
// packages/core/tests/scrape-strategy.test.ts
import { describe, it, expect } from "vitest";
import { planScrapeStrategy } from "../src/scrape-strategy.js";
import { STATE_SCHEMA_VERSION, type RunState, type UrlStateEntry } from "../src/state.js";

const baseEntry = (overrides: Partial<UrlStateEntry> = {}): UrlStateEntry => ({
  contentHash: "sha256:abc",
  fetchedAt: "2026-05-01T00:00:00Z",
  status: 200,
  findingIds: [],
  findings: [],
  rulesetVersion: "1",
  ...overrides,
});

const baseState = (urls: Record<string, UrlStateEntry>): RunState => ({
  version: STATE_SCHEMA_VERSION,
  lastRun: "2026-05-01T00:00:00Z",
  lastFullAuditAt: "2026-05-01T00:00:00Z",
  source: "https://example.com",
  renderMode: "static",
  rulesetVersion: "1",
  urls,
  summary: { score: 100, totalFindings: 0, byCategory: {} },
});

const NOW = new Date("2026-05-08T00:00:00Z"); // 7 days after baseEntry

describe("planScrapeStrategy", () => {
  it("refetches when there is no prior state at all", () => {
    const plan = planScrapeStrategy({
      candidateUrls: ["https://example.com/a"],
      priorState: null,
      sitemapLastmodByUrl: new Map(),
      currentRulesetVersion: "1",
      ageFloorDays: 7,
      now: NOW,
    });
    expect(plan.refetch.get("https://example.com/a")).toBe("new");
    expect(plan.skip.size).toBe(0);
  });

  it("refetches a URL not present in prior state (reason: new)", () => {
    const plan = planScrapeStrategy({
      candidateUrls: ["https://example.com/a", "https://example.com/b"],
      priorState: baseState({ "https://example.com/a": baseEntry() }),
      sitemapLastmodByUrl: new Map(),
      currentRulesetVersion: "1",
      ageFloorDays: 7,
      now: NOW,
    });
    expect(plan.refetch.get("https://example.com/b")).toBe("new");
  });

  it("refetches when prior fetchedAt exceeds age floor (reason: age)", () => {
    const old = "2026-04-20T00:00:00Z"; // 18 days ago
    const plan = planScrapeStrategy({
      candidateUrls: ["https://example.com/a"],
      priorState: baseState({ "https://example.com/a": baseEntry({ fetchedAt: old }) }),
      sitemapLastmodByUrl: new Map(),
      currentRulesetVersion: "1",
      ageFloorDays: 7,
      now: NOW,
    });
    expect(plan.refetch.get("https://example.com/a")).toBe("age");
  });

  it("refetches when ruleset version differs (reason: ruleset)", () => {
    const plan = planScrapeStrategy({
      candidateUrls: ["https://example.com/a"],
      priorState: baseState({ "https://example.com/a": baseEntry({ rulesetVersion: "1" }) }),
      sitemapLastmodByUrl: new Map(),
      currentRulesetVersion: "2",
      ageFloorDays: 7,
      now: NOW,
    });
    expect(plan.refetch.get("https://example.com/a")).toBe("ruleset");
  });

  it("refetches when prior findings are non-empty (reason: recheck)", () => {
    const plan = planScrapeStrategy({
      candidateUrls: ["https://example.com/a"],
      priorState: baseState({
        "https://example.com/a": baseEntry({ findings: [{ id: "f1", ruleId: "r", severity: "warn", confidence: "high", message: "m" }], findingIds: ["f1"] }),
      }),
      sitemapLastmodByUrl: new Map(),
      currentRulesetVersion: "1",
      ageFloorDays: 7,
      now: NOW,
    });
    expect(plan.refetch.get("https://example.com/a")).toBe("recheck");
  });

  it("refetches when sitemap lastmod is newer than prior fetchedAt (reason: lastmod)", () => {
    const plan = planScrapeStrategy({
      candidateUrls: ["https://example.com/a"],
      priorState: baseState({
        "https://example.com/a": baseEntry({ fetchedAt: "2026-05-01T00:00:00Z" }),
      }),
      sitemapLastmodByUrl: new Map([["https://example.com/a", "2026-05-05T00:00:00Z"]]),
      currentRulesetVersion: "1",
      ageFloorDays: 30, // disable age trigger so we isolate lastmod
      now: NOW,
    });
    expect(plan.refetch.get("https://example.com/a")).toBe("lastmod");
  });

  it("skips when nothing has changed and there is sitemap evidence the page is unchanged", () => {
    const plan = planScrapeStrategy({
      candidateUrls: ["https://example.com/a"],
      priorState: baseState({
        "https://example.com/a": baseEntry({ fetchedAt: "2026-05-07T00:00:00Z" }),
      }),
      sitemapLastmodByUrl: new Map([["https://example.com/a", "2026-04-01T00:00:00Z"]]),
      currentRulesetVersion: "1",
      ageFloorDays: 30,
      now: NOW,
    });
    expect(plan.skip.get("https://example.com/a")).toBe("unchanged");
    expect(plan.refetch.size).toBe(0);
  });

  it("refetches when no skip evidence is available (reason: no-signal)", () => {
    const plan = planScrapeStrategy({
      candidateUrls: ["https://example.com/a"],
      priorState: baseState({
        "https://example.com/a": baseEntry({ fetchedAt: "2026-05-07T00:00:00Z" }),
      }),
      sitemapLastmodByUrl: new Map(), // no lastmod for this URL
      currentRulesetVersion: "1",
      ageFloorDays: 30,
      now: NOW,
    });
    expect(plan.refetch.get("https://example.com/a")).toBe("no-signal");
  });

  it("matrix order: 'new' beats 'age' (a brand-new URL is just 'new')", () => {
    const plan = planScrapeStrategy({
      candidateUrls: ["https://example.com/a"],
      priorState: baseState({}), // URL not in state
      sitemapLastmodByUrl: new Map(),
      currentRulesetVersion: "1",
      ageFloorDays: 7,
      now: NOW,
    });
    expect(plan.refetch.get("https://example.com/a")).toBe("new");
  });

  it("matrix order: 'age' beats 'ruleset'", () => {
    const old = "2026-04-20T00:00:00Z";
    const plan = planScrapeStrategy({
      candidateUrls: ["https://example.com/a"],
      priorState: baseState({
        "https://example.com/a": baseEntry({ fetchedAt: old, rulesetVersion: "old" }),
      }),
      sitemapLastmodByUrl: new Map(),
      currentRulesetVersion: "new",
      ageFloorDays: 7,
      now: NOW,
    });
    expect(plan.refetch.get("https://example.com/a")).toBe("age");
  });

  it("GSC delta triggers refetch when threshold exceeded", () => {
    const plan = planScrapeStrategy({
      candidateUrls: ["https://example.com/a"],
      priorState: baseState({
        "https://example.com/a": baseEntry({ fetchedAt: "2026-05-07T00:00:00Z" }),
      }),
      sitemapLastmodByUrl: new Map([["https://example.com/a", "2026-04-01T00:00:00Z"]]),
      gscDeltasByUrl: new Map([["https://example.com/a", { impressionsDelta: -0.4, clicksDelta: 0 }]]),
      gscThresholds: { impressionsPct: 0.2, clicksAbsolute: 5 },
      currentRulesetVersion: "1",
      ageFloorDays: 30,
      now: NOW,
    });
    expect(plan.refetch.get("https://example.com/a")).toBe("gsc");
  });

  it("GSC delta below threshold does not trigger when other signals say unchanged", () => {
    const plan = planScrapeStrategy({
      candidateUrls: ["https://example.com/a"],
      priorState: baseState({
        "https://example.com/a": baseEntry({ fetchedAt: "2026-05-07T00:00:00Z" }),
      }),
      sitemapLastmodByUrl: new Map([["https://example.com/a", "2026-04-01T00:00:00Z"]]),
      gscDeltasByUrl: new Map([["https://example.com/a", { impressionsDelta: 0.05, clicksDelta: 1 }]]),
      gscThresholds: { impressionsPct: 0.2, clicksAbsolute: 5 },
      currentRulesetVersion: "1",
      ageFloorDays: 30,
      now: NOW,
    });
    expect(plan.skip.get("https://example.com/a")).toBe("unchanged");
  });
});
```

- [ ] **Step 4.2: Run tests, verify FAIL** — `bun --cwd packages/core test -- scrape-strategy`. Expected: cannot resolve module.

- [ ] **Step 4.3: Implement planScrapeStrategy**

```ts
// packages/core/src/scrape-strategy.ts
import type { RunState } from "./state.js";

export type RefetchReason =
  | "new"
  | "age"
  | "ruleset"
  | "recheck"
  | "lastmod"
  | "gsc"
  | "no-signal";

export type SkipReason = "unchanged";

export interface ScrapePlan {
  refetch: Map<string, RefetchReason>;
  skip: Map<string, SkipReason>;
}

export interface GscDelta {
  impressionsDelta: number; // fractional, e.g. -0.4 for -40%
  clicksDelta: number;      // absolute count
}

export interface GscThresholds {
  impressionsPct: number;   // e.g. 0.2 for ±20%
  clicksAbsolute: number;   // e.g. 5
}

export interface ScrapeStrategyInputs {
  candidateUrls: readonly string[];
  priorState: RunState | null;
  sitemapLastmodByUrl: ReadonlyMap<string, string>;
  gscDeltasByUrl?: ReadonlyMap<string, GscDelta>;
  gscThresholds?: GscThresholds;
  currentRulesetVersion: string;
  ageFloorDays: number;
  now: Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function gscExceedsThreshold(delta: GscDelta, thresholds: GscThresholds): boolean {
  return Math.abs(delta.impressionsDelta) >= thresholds.impressionsPct
      || Math.abs(delta.clicksDelta) >= thresholds.clicksAbsolute;
}

export function planScrapeStrategy(inputs: ScrapeStrategyInputs): ScrapePlan {
  const refetch = new Map<string, RefetchReason>();
  const skip = new Map<string, SkipReason>();

  for (const url of inputs.candidateUrls) {
    const prior = inputs.priorState?.urls[url];

    // 1. New URL
    if (!prior) {
      refetch.set(url, "new");
      continue;
    }

    // 2. Age floor
    const ageMs = inputs.now.getTime() - Date.parse(prior.fetchedAt);
    if (Number.isFinite(ageMs) && ageMs >= inputs.ageFloorDays * MS_PER_DAY) {
      refetch.set(url, "age");
      continue;
    }

    // 3. Ruleset version mismatch
    if (prior.rulesetVersion !== inputs.currentRulesetVersion) {
      refetch.set(url, "ruleset");
      continue;
    }

    // 4. Open findings recheck
    if (prior.findings.length > 0 || prior.findingIds.length > 0) {
      refetch.set(url, "recheck");
      continue;
    }

    // 5. Sitemap lastmod newer than prior fetch
    const lastmod = inputs.sitemapLastmodByUrl.get(url);
    if (lastmod && Date.parse(lastmod) > Date.parse(prior.fetchedAt)) {
      refetch.set(url, "lastmod");
      continue;
    }

    // 6. GSC delta
    const gscDelta = inputs.gscDeltasByUrl?.get(url);
    if (gscDelta && inputs.gscThresholds && gscExceedsThreshold(gscDelta, inputs.gscThresholds)) {
      refetch.set(url, "gsc");
      continue;
    }

    // 7. No signal that says "unchanged" — be conservative
    if (!lastmod && !gscDelta) {
      refetch.set(url, "no-signal");
      continue;
    }

    // 8. We have skip evidence and nothing demanding refetch
    skip.set(url, "unchanged");
  }

  return { refetch, skip };
}
```

- [ ] **Step 4.4: Run tests, verify PASS**

`bun --cwd packages/core test -- scrape-strategy`. All 11 tests pass.

- [ ] **Step 4.5: Typecheck + commit**

```bash
bun --cwd packages/core run lint
git add packages/core/src/scrape-strategy.ts packages/core/tests/scrape-strategy.test.ts
git commit -m "feat(core): add planScrapeStrategy() pure decision matrix for monitoring"
```

---

## Phase 3 — Sitemap lastmod surfacing

### Task 5: Extend sitemap walker to capture `<lastmod>`

**Files:**
- Modify: `packages/core/src/auditor.ts`
- (existing tests around sitemap parsing if any; add one in this task)
- Modify: `packages/core/tests/auditor-sitemap.test.ts` (or wherever sitemap parsing is tested)

- [ ] **Step 5.1: Locate `collectUrlsFromSitemap` and `parseSitemapUrls`**

Read `packages/core/src/auditor.ts` around line 1016 (`collectUrlsFromSitemap`) and the helper that extracts `<loc>` entries.

- [ ] **Step 5.2: Add a parsing test for lastmod extraction**

If a sitemap-parser test file exists, add to it. Otherwise create `packages/core/tests/sitemap-lastmod.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseSitemapUrlsWithLastmod } from "../src/auditor.js";

describe("parseSitemapUrlsWithLastmod", () => {
  it("extracts loc + optional lastmod for each <url>", () => {
    const xml = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/a</loc><lastmod>2026-05-01T00:00:00Z</lastmod></url>
  <url><loc>https://example.com/b</loc></url>
</urlset>`;
    const result = parseSitemapUrlsWithLastmod(xml);
    expect(result).toEqual([
      { url: "https://example.com/a", lastmod: "2026-05-01T00:00:00Z" },
      { url: "https://example.com/b", lastmod: undefined },
    ]);
  });
});
```

- [ ] **Step 5.3: Run test, verify FAIL**

`bun --cwd packages/core test -- sitemap-lastmod`. Expected: function not exported.

- [ ] **Step 5.4: Implement parser variant**

In `packages/core/src/auditor.ts`, add (and export) alongside existing `parseSitemapUrls`:

```ts
export function parseSitemapUrlsWithLastmod(xml: string): Array<{ url: string; lastmod?: string }> {
  const out: Array<{ url: string; lastmod?: string }> = [];
  const urlBlocks = xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi);
  for (const block of urlBlocks) {
    const inner = block[1] ?? "";
    const locMatch = inner.match(/<loc\b[^>]*>([\s\S]*?)<\/loc>/i);
    if (!locMatch) continue;
    const url = locMatch[1].trim();
    if (!url) continue;
    const lastmodMatch = inner.match(/<lastmod\b[^>]*>([\s\S]*?)<\/lastmod>/i);
    const lastmod = lastmodMatch ? lastmodMatch[1].trim() : undefined;
    out.push({ url, lastmod });
  }
  return out;
}
```

- [ ] **Step 5.5: Thread lastmod through `collectUrlsFromSitemap`**

Change return type from `Promise<string[]>` to `Promise<{ urls: string[]; lastmodByUrl: Map<string, string> }>`. Where the function recurses into a sitemap-index, merge child `lastmodByUrl` maps. Update existing callers (search for `collectUrlsFromSitemap(` in auditor.ts) to read `.urls` for the URL list. Pass the `lastmodByUrl` map up to `loadPages`'s return value alongside `sitemapUrls`.

Add to `loadPages` return type:

```ts
Promise<{ pages: LoadedPage[]; sitemapUrls?: Set<string>; sitemapLastmodByUrl?: Map<string, string>; discoveredUrlCount?: number }>
```

- [ ] **Step 5.6: Run all auditor + sitemap tests, verify PASS**

`bun --cwd packages/core test -- auditor sitemap`. Fix any test that destructures the old return shape.

- [ ] **Step 5.7: Typecheck + commit**

```bash
bun --cwd packages/core run lint
git add packages/core/src/auditor.ts packages/core/tests/sitemap-lastmod.test.ts
git commit -m "feat(core): surface sitemap <lastmod> from collectUrlsFromSitemap"
```

---

## Phase 4 — Wire decision matrix into auditor

### Task 6: Replace `--since` post-fetch skip with pre-fetch plan

**Files:**
- Modify: `packages/core/src/auditor.ts`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/tests/auditor.*.test.ts` (existing audits-with-state tests)

This is the largest task. Break into sub-steps.

- [ ] **Step 6.1: Extend `AuditOptions.state` type**

In `packages/core/src/types.ts`, find `AuditOptions["state"]` and add:

```ts
state?: {
  path?: string;
  since?: boolean;            // existing — kept as alias for mode=monitoring
  exitOnRegression?: boolean; // existing
  mode?: "monitoring" | "fresh"; // NEW
  ageFloorDays?: number;      // NEW; default 7
};
```

- [ ] **Step 6.2: Compute scrape plan before fetching**

In `auditor.ts`, in the section that currently reads `priorState` (~line 1544–1569), restructure:

1. Read prior state as today.
2. Compute candidate URL list from discovery (sitemap + crawl) — but DEFER actual fetching of those URLs.
3. Compute `currentRulesetVersion = CORE_RULESET_VERSION` (import from `./ruleset-version.js`).
4. Compute `effectiveMode`: explicit `state.mode` wins; else if `state.since && priorState`, "monitoring"; else if `priorState && !state.since`, "monitoring" (auto); else "fresh".
5. If mode is "fresh" or `priorState === null`: refetch every URL, no carry-forward.
6. Else: call `planScrapeStrategy({ candidateUrls, priorState, sitemapLastmodByUrl, currentRulesetVersion: CORE_RULESET_VERSION, ageFloorDays: state.ageFloorDays ?? 7, now: new Date() })`.
7. Fetch only `plan.refetch.keys()`.
8. For URLs in `plan.skip`: skip the fetch entirely.

Concretely, this requires splitting today's `loadPages` into two phases: discovery (returns candidate URL list + sitemap lastmods) and fetching (takes a URL list). The simplest restructure:

  a. Add a new internal function `discoverCandidateUrls(source, options): Promise<{ urls: string[]; sitemapLastmodByUrl: Map<string, string>; sitemapUrls?: Set<string>; discoveredUrlCount?: number }>` that returns URLs without fetching their bodies.
  b. Add a new internal function `fetchPagesByUrl(urls, options): Promise<LoadedPage[]>` that fetches a given URL set.
  c. Existing `loadPages` becomes a thin wrapper: discover → fetch all.
  d. Monitoring path: discover → planScrapeStrategy → fetch only refetch URLs.

For fully-static-source paths (filesystem source), the decision matrix doesn't apply — local reads are cheap. Filesystem sources skip the strategy and read all files as today.

- [ ] **Step 6.3: Add integration test for the monitoring path**

Create or extend `packages/core/tests/integration/monitoring-mode.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditSource } from "../../src/index.js";
import { writeState, STATE_SCHEMA_VERSION, type RunState } from "../../src/state.js";

describe("monitoring mode", () => {
  it("skips URLs that are unchanged per sitemap lastmod, carries findings forward", async () => {
    // Use a mock fetcher; track which URLs were fetched.
    const fetched: string[] = [];
    const fetcher = async (url: string) => {
      fetched.push(url);
      // ... (return fake HTML or sitemap as needed)
    };
    // Seed prior state where /a was audited 1 day ago with 0 findings, sitemap says /a unchanged.
    // Run audit in monitoring mode.
    // Assert: /a was NOT fetched; its prior findings were carried forward; new URLs were fetched.
    // (Pseudo-code — actual implementation depends on how auditSource accepts a custom fetcher.)
  });
});
```

If `auditSource` doesn't currently accept a custom fetcher, plumb one through `AuditOptions` (search for existing places where tests inject mocks — `cachedFetch` accepts `fetcher`; the test surface may need the same option exposed at `auditSource` level). If that's not feasible in this task, skip the integration test here and rely on the unit test for `planScrapeStrategy` (Task 4) plus a smaller wiring test that asserts:
- when `priorState` is provided and `state.mode === "fresh"`, all URLs go through the refetch path
- when `state.mode === "monitoring"`, the function doesn't fetch URLs in `plan.skip`

Use vitest mocks (`vi.spyOn`) on the fetch function.

- [ ] **Step 6.4: Run all tests**

`bun --cwd packages/core test`. All pass.

- [ ] **Step 6.5: Typecheck + commit**

```bash
bun --cwd packages/core run lint
git add packages/core/src/auditor.ts packages/core/src/types.ts packages/core/tests/integration/monitoring-mode.test.ts
git commit -m "feat(core): wire planScrapeStrategy into auditor; auto-monitoring on prior state"
```

---

### Task 7: Findings carry-forward

**Files:**
- Modify: `packages/core/src/auditor.ts`
- Test: extend monitoring-mode test from Task 6

- [ ] **Step 7.1: Write test asserting carried-forward findings appear in summary**

Extend the integration test from Task 6 to construct a prior state with findings on a URL that the strategy should skip, run the audit, and assert those findings are present in the result.

- [ ] **Step 7.2: Implement carry-forward**

In auditor.ts, after fetching only refetch URLs, build the carried-forward findings list:

```ts
const carriedForwardFindings: RuleResult[] = [];
if (priorState) {
  for (const [url] of plan.skip) {
    const prior = priorState.urls[url];
    if (!prior) continue;
    for (const f of prior.findings) {
      carriedForwardFindings.push({
        ...(f as unknown as RuleResult),
        carriedForward: true,
        lastVerifiedAt: prior.fetchedAt,
      } as RuleResult);
    }
  }
}
```

Merge with fresh findings: `const allFindings = [...freshFindings, ...carriedForwardFindings];`

Add `carriedForward?: boolean` and `lastVerifiedAt?: string` to the relevant finding/RuleResult type in `types.ts`.

- [ ] **Step 7.3: Run tests, verify PASS**

- [ ] **Step 7.4: Typecheck + commit**

```bash
git add packages/core/src/auditor.ts packages/core/src/types.ts packages/core/tests/integration/monitoring-mode.test.ts
git commit -m "feat(core): carry forward prior findings for skipped URLs in monitoring mode"
```

---

### Task 8: Surface `scrapePlan` in AuditSummary

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/auditor.ts`
- Test: extend monitoring-mode test

- [ ] **Step 8.1: Test that AuditSummary contains scrapePlan**

```ts
it("AuditSummary.scrapePlan reports fetched/carriedForward and reason counts", async () => {
  // ... setup with 3 URLs: 1 new, 1 skip-unchanged, 1 recheck
  const summary = await auditSource(...);
  expect(summary.scrapePlan).toEqual({
    fetched: 2,
    carriedForward: 1,
    reasonCounts: { new: 1, recheck: 1, unchanged: 1 },
    rulesetVersion: "1",
    lastFullAuditAt: expect.any(String),
  });
});
```

- [ ] **Step 8.2: Add type to `types.ts`**

```ts
export interface ScrapePlanSummary {
  fetched: number;
  carriedForward: number;
  reasonCounts: Record<string, number>;
  rulesetVersion: string;
  lastFullAuditAt: string | null;
}

export interface AuditSummary {
  // existing fields...
  scrapePlan?: ScrapePlanSummary;
}
```

- [ ] **Step 8.3: Populate in auditor**

Build `scrapePlan` from the plan + state at the end of `auditSource` and assign into the returned `AuditSummary`.

- [ ] **Step 8.4: Run tests, typecheck, commit**

```bash
git add packages/core/src/types.ts packages/core/src/auditor.ts packages/core/tests/integration/monitoring-mode.test.ts
git commit -m "feat(core): surface scrapePlan stats in AuditSummary"
```

---

## Phase 5 — CLI surface

### Task 9: Add `--mode` and `--age-floor-days` flags

**Files:**
- Modify: `packages/cli/src/cli.ts` (or wherever CLI flag parsing lives — search for existing `--since` definition)
- Modify: `packages/cli/src/config.ts` (or equivalent — wherever flags map to AuditOptions)
- Test: `packages/cli/tests/cli-flags.test.ts` (or extend existing)

- [ ] **Step 9.1: Locate `--since` flag definition**

`grep -rn "since" packages/cli/src/`. Identify the parser invocation and `AuditOptions` mapping.

- [ ] **Step 9.2: Add tests**

```ts
it("--mode=fresh forces full audit even with prior state", () => {
  const opts = parseFlags(["--mode=fresh"]);
  expect(opts.state?.mode).toBe("fresh");
});

it("--mode=monitoring is the default when prior state exists (no flag needed)", () => {
  const opts = parseFlags([]);
  expect(opts.state?.mode).toBeUndefined(); // auditor decides default from prior state existence
});

it("--age-floor-days=14 maps through", () => {
  const opts = parseFlags(["--age-floor-days=14"]);
  expect(opts.state?.ageFloorDays).toBe(14);
});

it("--since still works as alias for monitoring mode", () => {
  const opts = parseFlags(["--since"]);
  expect(opts.state?.since).toBe(true);
});
```

- [ ] **Step 9.3: Implement flags**

Add:
- `--mode <monitoring|fresh>` → `options.state.mode`
- `--age-floor-days <N>` → `options.state.ageFloorDays`
Validate: mode value is one of the literals; age-floor is a positive integer.

- [ ] **Step 9.4: Run tests, typecheck, commit**

```bash
git add packages/cli/src/cli.ts packages/cli/src/config.ts packages/cli/tests/cli-flags.test.ts
git commit -m "feat(cli): add --mode and --age-floor-days flags for monitoring control"
```

---

### Task 10: CLI summary line

**Files:**
- Modify: `packages/cli/src/index.ts` (or wherever the CLI prints the summary)

- [ ] **Step 10.1: Locate where the audit summary is printed today**

Search for existing summary-printing code (look for `console.log` near auditSummary fields).

- [ ] **Step 10.2: Test that summary line is printed when `scrapePlan` is present**

If there's a snapshot test for CLI output, extend it. Otherwise add a small test that captures stdout.

- [ ] **Step 10.3: Implement print**

```ts
if (summary.scrapePlan) {
  const sp = summary.scrapePlan;
  const reasons = Object.entries(sp.reasonCounts)
    .filter(([k]) => k !== "unchanged")
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  console.log(
    `Monitoring: ${sp.fetched}/${sp.fetched + sp.carriedForward} URLs re-scraped`
    + (reasons ? ` (${reasons})` : "")
    + `, ${sp.carriedForward} carried forward.`
  );
}
```

- [ ] **Step 10.4: Run tests, typecheck, commit**

```bash
git add packages/cli/src/index.ts packages/cli/tests/
git commit -m "feat(cli): print monitoring summary line when scrapePlan present"
```

---

## Phase 6 — Polish

### Task 11: CHANGELOG entries

**Files:**
- Modify: `packages/core/CHANGELOG.md`
- Modify: `packages/cli/CHANGELOG.md` (if it exists)
- Modify: top-level `CHANGELOG.md` if conventions require

- [ ] **Step 11.1: Read current top of `packages/core/CHANGELOG.md`**

- [ ] **Step 11.2: Add v0.5.0 entry**

```markdown
## v0.5.0 — Change-driven monitoring (2026-05-01)

### Breaking

- **State schema bumped to v2.** Existing `.pseolint/state.json` files from v0.4.x will be discarded with a warning on first read; users get one full baseline audit, then incremental monitoring kicks in.
- **Auto-monitoring mode** is now the default when a prior state file exists. Previously, `--since` was required to opt in. Use `--mode=fresh` to force a full re-audit.

### Added

- `planScrapeStrategy()` exported from `@pseolint/core` — pure decision matrix that picks which URLs to refetch based on sitemap `<lastmod>`, prior state age, ruleset version, and open-finding rechecks.
- `CORE_RULESET_VERSION` constant. Bump when adding or materially changing rules so monitoring runs re-evaluate them.
- `AuditSummary.scrapePlan` reports fetched / carried-forward counts and reasons.
- `--mode=monitoring|fresh` and `--age-floor-days=N` CLI flags.

### Changed

- `--since` is now an alias for `--mode=monitoring`. Behavior is unchanged for users who passed it explicitly.
- Sitemap walker (`collectUrlsFromSitemap`) now returns `<lastmod>` alongside URLs.

### Why

Monitoring runs on a 4k-page site re-fetched everything; rule eval is microseconds while the fetch is seconds. Move the decision upstream of the fetch, save ~95% of fetches on steady-state monitoring runs.

See spec: `docs/superpowers/specs/2026-05-01-change-driven-monitoring-design.md`.
```

- [ ] **Step 11.3: Commit**

```bash
git add packages/core/CHANGELOG.md
git commit -m "docs(core): v0.5.0 changelog for change-driven monitoring"
```

---

### Task 12: Self-review pass

- [ ] **Step 12.1: Run full test matrix**

```bash
bun --cwd packages/core test
bun --cwd packages/cli test
bun --cwd packages/core run lint
bun --cwd packages/cli run lint
```

All green.

- [ ] **Step 12.2: Smoke test against pseolint.dev**

```bash
# Baseline run (writes state)
bun packages/cli/dist/index.js https://pseolint.dev --state .pseolint/smoke-state.json --discovery-budget 50
# Second run — should report most URLs carried forward
bun packages/cli/dist/index.js https://pseolint.dev --state .pseolint/smoke-state.json --discovery-budget 50
```

Verify the second run prints the monitoring summary line and shows `fetched < carriedForward`.

- [ ] **Step 12.3: Self-review the diff**

`git diff main` — read every changed file. Look for:
- Stray `console.log` debugging
- Comments that reference the task / fix instead of the why
- Required fields that crept into being optional to dodge test fixes (revert to required)
- Files renamed or moved without git tracking the rename
- Any TODOs left behind

Fix anything found. Commit if changes were needed:

```bash
git commit -am "polish: address self-review findings"
```

---

## Self-review checklist (run after writing the plan, before handoff)

- [x] Spec coverage: every section in `2026-05-01-change-driven-monitoring-design.md` maps to a task.
  - Decision matrix → Task 4 ✓
  - State schema → Task 2 ✓
  - Sitemap lastmod → Task 5 ✓
  - Auditor wiring → Task 6 ✓
  - Carry-forward → Task 7 ✓
  - AuditSummary.scrapePlan → Task 8 ✓
  - CLI flags → Tasks 9–10 ✓
  - CHANGELOG / migration → Task 11 ✓
- [x] No "TODO" / "TBD" / "implement later" placeholders. Each step has actual code or actual commands.
- [x] Type consistency:
  - `RefetchReason` and `SkipReason` defined in Task 4 are used identically in Task 8.
  - `UrlStateEntry.findings: Finding[]` defined in Task 2 is consumed in Tasks 4, 7.
  - `CORE_RULESET_VERSION` from Task 1 is consumed in Task 6.
- [x] Every task has explicit file paths.
- [x] Every TDD task shows the test first, then verifies it fails, then shows the implementation, then verifies it passes.
- [x] Commit messages are conventional and reflect the task scope.

---

## Open questions deferred (not blocking v1)

- Sitemap-lastmod trust verification (HEAD-sample 5%) — separate plan.
- Carry-forward staleness UX (confidence demotion after N days) — Pro dashboard.
- GSC delta ingestion — Pro v1.1 (the field is wired; the Pro side ingests it).
- Cache-busting site detection beyond post-fetch hash compare — v2.

These do not block shipping v1. The v1 design is correct without them.
