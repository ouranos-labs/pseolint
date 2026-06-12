# Authority-Moderated Risk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pluggable domain-authority provider (OpenPageRank + Common Crawl) and feed its score into the existing `shiftVerdictForAuthority` so high-authority domains get a lenient verdict shift — fixing reputable over-flagging without dropping recall.

**Architecture:** A pure `AuthorityProvider` interface with a `CompositeAuthorityProvider` (max-combine, fail-safe to `null`), backed by an OpenPageRank API client and a Common-Crawl table lookup. The auditor resolves an authority score (explicit option → provider) before scoring and passes it to the already-wired `shiftVerdictForAuthority`. All of this is unit-testable now with mocked fetch / synthetic data. The **CC data table, per-corpus snapshot seeding, and the end-to-end recall/precision measurement are GATED** on obtaining a real authority dataset (an OpenPageRank API key and/or a processed Common Crawl webgraph) — see Task 5; do not build or measure those until the data exists.

**Tech Stack:** TypeScript (NodeNext, `.js` specifiers), vitest. Reuses `registrableDomain` (`algorithms/fact-extraction.ts`) and `shiftVerdictForAuthority` (`auditor.ts:614`).

**Spec:** `docs/superpowers/specs/2026-06-12-authority-moderation-design.md`.

---

## File Structure

- **Create** `packages/core/src/algorithms/authority/provider.ts` — `AuthorityProvider`, `CompositeAuthorityProvider` (pure).
- **Create** `packages/core/src/algorithms/authority/openpagerank.ts` — OPR API client (fetch injectable).
- **Create** `packages/core/src/algorithms/authority/commoncrawl.ts` — CC table-lookup provider (loads an optional bundled table; returns `null` when absent — table itself is gated).
- **Create** tests under `packages/core/tests/algorithms/authority/`.
- **Modify** `packages/core/src/auditor.ts` — resolve authority before scoring; build a default provider from options.
- **Modify** `packages/core/src/types.ts` — `AuditOptions.openPageRankApiKey?`, `AuditOptions.authorityProvider?`; `AuditSummary.authority?`.
- **Modify** `packages/core/src/index.ts` — export the authority module.

Conventions: `.js` import specifiers; run core tests from `packages/core` (`npx vitest run <file>`).

---

## Task 1: AuthorityProvider interface + CompositeAuthorityProvider (TDD)

**Files:**
- Create: `packages/core/src/algorithms/authority/provider.ts`
- Test: `packages/core/tests/algorithms/authority/provider.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/algorithms/authority/provider.test.ts`:
```ts
import { describe, test, expect } from "vitest";
import { CompositeAuthorityProvider, type AuthorityProvider } from "../../../src/algorithms/authority/provider.js";

function stub(map: Record<string, number | null>): AuthorityProvider {
  return { authorityFor: async (d) => (d in map ? map[d] : null) };
}

describe("CompositeAuthorityProvider", () => {
  test("returns the max non-null score across sources", async () => {
    const p = new CompositeAuthorityProvider([stub({ "x.com": 40 }), stub({ "x.com": 83 })]);
    expect(await p.authorityFor("x.com")).toBe(83);
  });
  test("uses the one source that has a value", async () => {
    const p = new CompositeAuthorityProvider([stub({}), stub({ "x.com": 53 })]);
    expect(await p.authorityFor("x.com")).toBe(53);
  });
  test("returns null when all sources are null (fail-safe)", async () => {
    const p = new CompositeAuthorityProvider([stub({}), stub({})]);
    expect(await p.authorityFor("x.com")).toBeNull();
  });
  test("a throwing source is treated as null, not fatal", async () => {
    const boom: AuthorityProvider = { authorityFor: async () => { throw new Error("network"); } };
    const p = new CompositeAuthorityProvider([boom, stub({ "x.com": 70 })]);
    expect(await p.authorityFor("x.com")).toBe(70);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `packages/core`): `npx vitest run tests/algorithms/authority/provider.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/algorithms/authority/provider.ts`:
```ts
/** A source of domain authority on a 0–100 scale (higher = more authoritative). */
export interface AuthorityProvider {
  /** Authority for a registrable domain; null when unknown/unavailable. */
  authorityFor(domain: string): Promise<number | null>;
}

/**
 * Combines several providers. Returns the MAX non-null score (any source
 * vouching for authority is sufficient evidence). All-null → null → callers
 * apply no moderation (fail-safe). A source that throws is treated as null.
 */
export class CompositeAuthorityProvider implements AuthorityProvider {
  constructor(private readonly sources: ReadonlyArray<AuthorityProvider>) {}

  async authorityFor(domain: string): Promise<number | null> {
    const results = await Promise.all(
      this.sources.map(async (s) => {
        try {
          return await s.authorityFor(domain);
        } catch {
          return null;
        }
      }),
    );
    const vals = results.filter((v): v is number => v !== null && Number.isFinite(v));
    return vals.length ? Math.max(...vals) : null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/algorithms/authority/provider.test.ts` → Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/algorithms/authority/provider.ts packages/core/tests/algorithms/authority/provider.test.ts
git commit -m "feat(core): AuthorityProvider interface + composite (max-combine, fail-safe)"
```

---

## Task 2: OpenPageRank client (TDD, mocked fetch)

**Files:**
- Create: `packages/core/src/algorithms/authority/openpagerank.ts`
- Test: `packages/core/tests/algorithms/authority/openpagerank.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/algorithms/authority/openpagerank.test.ts`:
```ts
import { describe, test, expect } from "vitest";
import { OpenPageRankProvider } from "../../../src/algorithms/authority/openpagerank.js";

function mockFetch(body: unknown, status = 200) {
  return async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
}

describe("OpenPageRankProvider", () => {
  test("maps page_rank_decimal (0–10) to a 0–100 score", async () => {
    const p = new OpenPageRankProvider("KEY", mockFetch({
      status_code: 200,
      response: [{ status_code: 200, error: "", page_rank_decimal: 8.3, domain: "x.com" }],
    }));
    expect(await p.authorityFor("x.com")).toBe(83);
  });
  test("returns null on a per-domain error entry", async () => {
    const p = new OpenPageRankProvider("KEY", mockFetch({
      status_code: 200,
      response: [{ status_code: 404, error: "Domain not found", domain: "x.com" }],
    }));
    expect(await p.authorityFor("x.com")).toBeNull();
  });
  test("returns null when no API key is configured (does not call fetch)", async () => {
    let called = false;
    const p = new OpenPageRankProvider("", (async () => { called = true; return {} as Response; }));
    expect(await p.authorityFor("x.com")).toBeNull();
    expect(called).toBe(false);
  });
  test("returns null on HTTP failure", async () => {
    const p = new OpenPageRankProvider("KEY", mockFetch({}, 500));
    expect(await p.authorityFor("x.com")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/algorithms/authority/openpagerank.test.ts` → Expected: FAIL.

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/algorithms/authority/openpagerank.ts`:
```ts
import type { AuthorityProvider } from "./provider.js";

type FetchFn = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

interface OprEntry {
  status_code: number;
  page_rank_decimal?: number;
  domain: string;
}

/**
 * Open PageRank authority source. Returns 0–100 (page_rank_decimal × 10).
 * Requires a free API key; with no key it returns null (no calls). Any network
 * or per-domain error → null. Attribution ("Open PageRank by DomCop") is the
 * caller's responsibility when displaying.
 */
export class OpenPageRankProvider implements AuthorityProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: FetchFn = globalThis.fetch as unknown as FetchFn,
    private readonly timeoutMs = 8000,
  ) {}

  async authorityFor(domain: string): Promise<number | null> {
    if (!this.apiKey) return null;
    const url = `https://openpagerank.com/api/v1.0/getPageRank?domains[]=${encodeURIComponent(domain)}`;
    let res: Response;
    try {
      res = await this.fetchFn(url, { headers: { "API-OPR": this.apiKey } });
    } catch {
      return null;
    }
    if (!res.ok) return null;
    let body: { response?: OprEntry[] };
    try {
      body = (await res.json()) as { response?: OprEntry[] };
    } catch {
      return null;
    }
    const entry = body.response?.find((e) => e.domain === domain) ?? body.response?.[0];
    if (!entry || entry.status_code !== 200 || typeof entry.page_rank_decimal !== "number") return null;
    return Math.round(entry.page_rank_decimal * 10);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/algorithms/authority/openpagerank.test.ts` → Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/algorithms/authority/openpagerank.ts packages/core/tests/algorithms/authority/openpagerank.test.ts
git commit -m "feat(core): OpenPageRank authority provider (0-10 -> 0-100, fail-safe)"
```

---

## Task 3: Common Crawl table provider (TDD; table itself gated)

**Files:**
- Create: `packages/core/src/algorithms/authority/commoncrawl.ts`
- Test: `packages/core/tests/algorithms/authority/commoncrawl.test.ts`

The provider reads an in-memory normalized rank table (`Map<domain, 0–100>`). Loading/processing the actual Common Crawl host webgraph into that table is the GATED data step (Task 5); this provider just consumes whatever table it is given (empty table → null).

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/algorithms/authority/commoncrawl.test.ts`:
```ts
import { describe, test, expect } from "vitest";
import { CommonCrawlProvider } from "../../../src/algorithms/authority/commoncrawl.js";

describe("CommonCrawlProvider", () => {
  test("returns the normalized score for a known domain", async () => {
    const p = new CommonCrawlProvider(new Map([["x.com", 71]]));
    expect(await p.authorityFor("x.com")).toBe(71);
  });
  test("returns null for an unknown domain (and empty table)", async () => {
    const p = new CommonCrawlProvider(new Map());
    expect(await p.authorityFor("x.com")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/algorithms/authority/commoncrawl.test.ts` → Expected: FAIL.

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/algorithms/authority/commoncrawl.ts`:
```ts
import type { AuthorityProvider } from "./provider.js";

/**
 * Authority from a pre-processed Common Crawl host-webgraph table
 * (registrable domain -> harmonic-centrality rank normalized to 0–100).
 * Owned/permissive data (CC license; attribution courtesy). The table is built
 * offline (gated); this provider is a pure lookup. Empty table -> null.
 */
export class CommonCrawlProvider implements AuthorityProvider {
  constructor(private readonly table: ReadonlyMap<string, number>) {}

  async authorityFor(domain: string): Promise<number | null> {
    const v = this.table.get(domain);
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/algorithms/authority/commoncrawl.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/algorithms/authority/commoncrawl.ts packages/core/tests/algorithms/authority/commoncrawl.test.ts
git commit -m "feat(core): Common Crawl authority provider (pure table lookup)"
```

---

## Task 4: Resolve authority in the auditor + types + export

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/auditor.ts`
- Modify: `packages/core/src/index.ts`

The existing `shiftVerdictForAuthority(verdict, options?.authorityScore)` call (`auditor.ts:2886`) already applies the lenient/strict tier shift. This task resolves a *real* `authorityScore` from a provider when one isn't explicitly supplied, so the shift is driven by sourced data. Fail-safe: no provider/no key/no table → `authorityScore` stays `undefined` → no shift (current behavior).

- [ ] **Step 1: Add options + summary fields in `types.ts`**

In `interface AuditOptions` add:
```ts
  /** OpenPageRank API key; enables live authority lookup when authorityScore is not supplied. */
  openPageRankApiKey?: string;
  /** Custom authority provider (overrides the default OPR/CC composite). For tests + offline corpora. */
  authorityProvider?: import("./algorithms/authority/provider.js").AuthorityProvider;
```
In `interface AuditSummary` add:
```ts
  /** Resolved domain authority used to moderate the verdict (0–100), with sources. Absent when unavailable. */
  authority?: { score: number; domain: string };
```
(`authorityScore?: number` already exists on `AuditOptions` — keep it; explicit value wins.)

- [ ] **Step 2: Build a default provider + resolve the score in `auditSource`**

In `auditor.ts`, add imports near the other `./algorithms/*` imports:
```ts
import { CompositeAuthorityProvider } from "./algorithms/authority/provider.js";
import { OpenPageRankProvider } from "./algorithms/authority/openpagerank.js";
import { registrableDomain } from "./algorithms/fact-extraction.js";
```
Early in `auditSource` (after `source`/options are resolved, before the scoring/verdict near line 2886), add:
```ts
  // Resolve a domain-authority score to moderate the verdict. Explicit option
  // wins; otherwise a provider (custom, or default OPR composite). null/absent
  // → no moderation (fail-safe).
  let resolvedAuthorityScore: number | undefined = options?.authorityScore;
  let resolvedAuthorityDomain: string | undefined;
  if (resolvedAuthorityScore === undefined) {
    const provider =
      options?.authorityProvider ??
      new CompositeAuthorityProvider([new OpenPageRankProvider(options?.openPageRankApiKey ?? "")]);
    try {
      const host = new URL(source.startsWith("http") ? source : `https://${source}`).hostname;
      resolvedAuthorityDomain = registrableDomain(host);
      const a = await provider.authorityFor(resolvedAuthorityDomain);
      if (a !== null) resolvedAuthorityScore = a;
    } catch {
      /* source is a local dir / unparseable → no authority */
    }
  }
```
At the `shiftVerdictForAuthority` call (line ~2886) replace `options?.authorityScore` with `resolvedAuthorityScore`:
```ts
  const legacyVerdict = shiftVerdictForAuthority(verdictForRisk(risk), resolvedAuthorityScore);
```
Where the `AuditSummary` object is assembled, add (only when a score was resolved):
```ts
    ...(resolvedAuthorityScore !== undefined
      ? { authority: { score: resolvedAuthorityScore, domain: resolvedAuthorityDomain ?? "" } }
      : {}),
```

- [ ] **Step 3: Export the authority module from `index.ts`**

```ts
export { CompositeAuthorityProvider } from "./algorithms/authority/provider.js";
export type { AuthorityProvider } from "./algorithms/authority/provider.js";
export { OpenPageRankProvider } from "./algorithms/authority/openpagerank.js";
export { CommonCrawlProvider } from "./algorithms/authority/commoncrawl.js";
```

- [ ] **Step 4: Add an integration test for the wiring (TDD, injected provider)**

Create `packages/core/tests/algorithms/authority/auditor-wiring.test.ts`:
```ts
import { describe, test, expect } from "vitest";
import { auditSource } from "../../../src/auditor.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function fixtureDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "auth-wire-"));
  const html = (t: string) => `<html><head><title>${t}</title></head><body><h1>${t}</h1><p>${"word ".repeat(200)}</p></body></html>`;
  writeFileSync(join(dir, "a.html"), html("Alpha"));
  writeFileSync(join(dir, "b.html"), html("Beta"));
  writeFileSync(join(dir, "_manifest.json"), JSON.stringify({ "https://demo.test/a": "a.html", "https://demo.test/b": "b.html" }));
  return dir;
}

describe("authority wiring in auditSource", () => {
  test("a high-authority injected provider shifts the verdict leniently vs none", async () => {
    const dir = fixtureDir();
    const none = await auditSource(dir, { safeMode: "saas" });
    const high = await auditSource(dir, { safeMode: "saas", authorityScore: 95 });
    const rank = { ready: 0, caution: 1, concerning: 2, critical: 3 } as const;
    // explicit high authorityScore must not make the verdict stricter; for any non-ready verdict it is one tier more lenient.
    expect(rank[high.verdict as keyof typeof rank]).toBeLessThanOrEqual(rank[none.verdict as keyof typeof rank]);
    if (none.verdict !== "ready") {
      expect(rank[high.verdict as keyof typeof rank]).toBe(rank[none.verdict as keyof typeof rank] - 1);
    }
    expect(high.authority?.score).toBe(95);
  });
});
```

- [ ] **Step 5: Run tests + typecheck**

Run (from `packages/core`):
```bash
npx vitest run tests/algorithms/authority/ && npx tsc --noEmit -p tsconfig.json
```
Expected: all authority tests pass; no type errors. (If `auditSource`'s `AuditSummary` assembly is in multiple return paths, ensure the `authority` field is added to the primary summary object; the wiring test confirms it surfaces.)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/auditor.ts packages/core/src/index.ts packages/core/tests/algorithms/authority/auditor-wiring.test.ts
git commit -m "feat(core): resolve domain authority + feed into verdict shift (fail-safe, default OPR)"
```

---

## Task 5 (GATED — do NOT start until a real authority dataset exists): seed corpus + measure

This task is blocked on obtaining an ownable authority dataset for the corpus domains (an OpenPageRank API key and/or a processed Common Crawl host-webgraph table). Do not build the seeding or run the measurement until then — measuring against synthetic authority would be meaningless.

When unblocked:
- [ ] Add `domainAuthority?: number` to `CorpusSite` (`corpus-types.ts`) + the JSON schema.
- [ ] Add a `--seed-authority` mode to `scripts/calibration-corpus.ts` that resolves each site's registrable-domain authority via the chosen provider and writes `domainAuthority` into the corpus (one-time, committed).
- [ ] In the runner's `auditOne`, pass `authorityScore: site.domainAuthority` so the harness uses the frozen snapshot (deterministic, no network).
- [ ] Calibrate: confirm the shift magnitude/threshold actually moves segment & numbeo within their `caution` ceiling — a single lenient tier takes `critical→concerning`, so a two-tier shift for very-high authority (or a risk discount) may be needed; tune against the corpus.
- [ ] Measure vs `baseline-scorecard.json` (recall 56%): **precision up, recall held, ratchet green**. Only then commit a new baseline.

---

## Self-Review

**Spec coverage:** §3.1 provider interface + composite → Task 1; OPR source → Task 2; CC source (table consumer; table gated) → Task 3; §3 wiring into `shiftVerdictForAuthority` + fail-safe + summary surfacing → Task 4. §3.3 reproducibility snapshot + §6 calibration/measurement → Task 5 (gated, per §8). §3.2 Ahrefs display (web app) is a separate plan (out of this core-engine plan, per spec §8). §8 build-gate honored: Tasks 1–4 are buildable/unit-testable now; the data-dependent seeding + measurement are isolated in Task 5.

**Placeholder scan:** every code step is complete; no TBD. Task 5 is intentionally procedural and explicitly gated (not a placeholder — a real blocked-on-data follow-up).

**Type consistency:** `AuthorityProvider.authorityFor(domain) → Promise<number|null>` is identical across Tasks 1–4. `CompositeAuthorityProvider`, `OpenPageRankProvider`, `CommonCrawlProvider` constructors match their tests. `AuditOptions.authorityScore` (existing) + new `openPageRankApiKey`/`authorityProvider`; `AuditSummary.authority` shape `{score, domain}` matches the wiring test assertion (`high.authority?.score`).

**Known follow-ups:** the Ahrefs DR display add-on (web app, separate plan); the two-tier-vs-risk-discount calibration decision (Task 5, needs data); Common Crawl table-builder script (gated).
