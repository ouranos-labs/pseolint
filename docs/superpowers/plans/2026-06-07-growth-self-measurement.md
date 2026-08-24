# Growth Self-Measurement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instrument pseolint.dev's own organic-search acquisition (indexation → impressions → clicks, by page and query) for its growth pages, surfaced on an owner-only internal dashboard, so the depth-first/data-moat strategy can be measured.

**Architecture:** A weekly Inngest cron pulls pseolint.dev's *own* GSC property (page+query dims) by reusing the existing GSC OAuth/token code, runs a pure aggregation, and upserts into a dedicated `growthSearchMetrics` table (kept separate from the Pro `gscPageMetrics`). An owner-gated `/admin/growth` server page reads the latest weekly buckets and shows indexation rate + per-URL acquisition + week-over-week trend. Acquisition only; conversion funnel is a deferred Phase 2.

**Tech Stack:** Next.js App Router (server components), TypeScript, Drizzle ORM (Postgres), Inngest cron, better-auth session, Vitest (`bun run test`), `@/` alias → `apps/web/src`.

**Reference spec:** `docs/superpowers/specs/2026-06-07-pseolint-growth-self-measurement-design.md`

**Run all commands from `apps/web/`.** Test: `bun run test`. Typecheck: `bun run typecheck`.

---

## File Structure

- `apps/web/src/lib/env.ts`: **Modify.** Add 3 optional env vars (`GROWTH_GSC_SITE_URL`, `GROWTH_GSC_OWNER_EMAIL`, `OWNER_EMAILS`).
- `apps/web/src/lib/owner.ts`: **Create.** Owner-allowlist gate (`emailInAllowlist` pure + `isOwnerEmail` env wrapper).
- `apps/web/src/lib/owner.test.ts`: **Create.** Unit tests for the gate.
- `apps/web/src/db/schema.ts`: **Modify.** Add `growthSearchMetrics` table.
- `apps/web/src/db/migrations/*`: **Generate.** Drizzle migration for the new table.
- `apps/web/src/lib/gsc.ts`: **Modify.** Add `weekBucketUtc` + `querySearchAnalyticsByPageQuery` + `GscPageQueryRow` type.
- `apps/web/src/lib/gsc.test.ts`: **Create.** Unit test for `weekBucketUtc`.
- `apps/web/src/lib/growth-metrics.ts`: **Create.** Pure aggregation: `aggregateGrowthRows`, `growthIndexationSummary`, `publishedGrowthUrls`, `GROWTH_PREFIXES`, types.
- `apps/web/src/lib/growth-metrics.test.ts`: **Create.** Unit tests (the core).
- `apps/web/src/lib/growth-sync-core.ts`: **Create.** `growthSyncOnce()`: resolve config → load tokens → query → aggregate → upsert.
- `apps/web/tests/integration/growth-sync.test.ts`: **Create.** Integration test (mocks gsc/db/env, real aggregation).
- `apps/web/src/inngest/functions/sync-growth-metrics.ts`: **Create.** Weekly cron wrapping `growthSyncOnce()`.
- `apps/web/src/app/api/inngest/route.ts`: **Modify.** Register the new cron.
- `apps/web/src/app/admin/growth/page.tsx`: **Create.** Owner-only dashboard.

---

## Task 1: Env vars + owner-allowlist gate

**Files:**
- Modify: `apps/web/src/lib/env.ts`
- Create: `apps/web/src/lib/owner.ts`
- Test: `apps/web/src/lib/owner.test.ts`

- [ ] **Step 1: Add env vars**

In `apps/web/src/lib/env.ts`, add three optional keys to `envSchema` (after the `GOOGLE_CLIENT_SECRET` line, matching the existing `.optional()` style):

```ts
  GROWTH_GSC_SITE_URL: z.string().min(1).optional(),
  GROWTH_GSC_OWNER_EMAIL: z.string().min(1).optional(),
  OWNER_EMAILS: z.string().min(1).optional(),
```

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/lib/owner.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { emailInAllowlist } from "@/lib/owner";

describe("emailInAllowlist", () => {
  it("returns false when the allowlist is unset", () => {
    expect(emailInAllowlist("a@b.com", undefined)).toBe(false);
  });

  it("returns false when the email is null/empty", () => {
    expect(emailInAllowlist(null, "a@b.com")).toBe(false);
    expect(emailInAllowlist("", "a@b.com")).toBe(false);
  });

  it("matches a single allowed email case-insensitively", () => {
    expect(emailInAllowlist("Owner@Pseolint.dev", "owner@pseolint.dev")).toBe(true);
  });

  it("matches within a comma-separated list and ignores whitespace", () => {
    expect(emailInAllowlist("b@x.com", "a@x.com, b@x.com , c@x.com")).toBe(true);
  });

  it("returns false for an email not in the list", () => {
    expect(emailInAllowlist("z@x.com", "a@x.com,b@x.com")).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test -- owner`
Expected: FAIL, `@/lib/owner` cannot be resolved.

- [ ] **Step 4: Implement the gate**

Create `apps/web/src/lib/owner.ts`:

```ts
import "server-only";
import { env } from "@/lib/env";

/**
 * Pure allowlist check: is `email` in the comma-separated `allowlistRaw`?
 * Case-insensitive, whitespace-tolerant. Empty/undefined inputs → false.
 */
export function emailInAllowlist(
  email: string | null | undefined,
  allowlistRaw: string | undefined,
): boolean {
  if (!email || !allowlistRaw) return false;
  const allow = allowlistRaw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.toLowerCase());
}

/** Env-backed wrapper: is this email an owner per OWNER_EMAILS? */
export function isOwnerEmail(email: string | null | undefined): boolean {
  return emailInAllowlist(email, env().OWNER_EMAILS);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test -- owner`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/env.ts apps/web/src/lib/owner.ts apps/web/src/lib/owner.test.ts
git commit -m "feat(web): add growth env vars + owner-allowlist gate"
```

---

## Task 2: `growthSearchMetrics` table + migration

**Files:**
- Modify: `apps/web/src/db/schema.ts`
- Generate: `apps/web/src/db/migrations/*`

- [ ] **Step 1: Add the table**

In `apps/web/src/db/schema.ts`, add after the `gscPageMetrics` table definition (it already imports `pgTable, uuid, text, integer, numeric, timestamp, uniqueIndex, index`, reuse them):

```ts
export const growthSearchMetrics = pgTable("growth_search_metrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url").notNull(),
  // '' (empty) = page-level aggregate row; non-empty = a page+query row.
  // Empty-string sentinel (not NULL) so the unique index dedupes page-level
  // rows across weekly runs, Postgres treats NULLs as distinct.
  query: text("query").notNull().default(""),
  weekBucket: text("week_bucket").notNull(), // ISO week "YYYY-Www" (UTC)
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  positionAvg: numeric("position_avg", { precision: 6, scale: 2 }),
  ctrAvg: numeric("ctr_avg", { precision: 6, scale: 4 }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  key: uniqueIndex("growth_metrics_key_uniq").on(t.url, t.query, t.weekBucket),
  weekIdx: index("growth_metrics_week_idx").on(t.weekBucket),
}));
```

- [ ] **Step 2: Verify the import line covers the helpers used**

Open the top of `apps/web/src/db/schema.ts` and confirm `pgTable, uuid, text, integer, numeric, timestamp, uniqueIndex, index` are all imported (they are used by `gscPageMetrics` already). If any is missing, add it to the existing `drizzle-orm/pg-core` import.

- [ ] **Step 3: Generate the migration**

Run: `bun run db:generate`
Expected: a new `src/db/migrations/NNNN_*.sql` (and updated `meta/`) creating `growth_search_metrics` with the unique + week indexes. Do not hand-edit it.

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/db/schema.ts apps/web/src/db/migrations
git commit -m "feat(web): add growth_search_metrics table + migration"
```

---

## Task 3: GSC helpers: `weekBucketUtc` + page+query query

**Files:**
- Modify: `apps/web/src/lib/gsc.ts`
- Test: `apps/web/src/lib/gsc.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/gsc.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { weekBucketUtc } from "@/lib/gsc";

describe("weekBucketUtc", () => {
  it("formats an ISO week key as YYYY-Www (UTC)", () => {
    // 2026-01-05 is a Monday in ISO week 2 of 2026.
    expect(weekBucketUtc(new Date("2026-01-05T00:00:00Z"))).toBe("2026-W02");
  });

  it("zero-pads single-digit weeks", () => {
    // 2026-01-01 falls in ISO week 1.
    expect(weekBucketUtc(new Date("2026-01-01T12:00:00Z"))).toBe("2026-W01");
  });

  it("assigns late-December dates to the correct ISO week-year", () => {
    // 2024-12-30 is ISO week 1 of 2025 (ISO weeks belong to the year of their Thursday).
    expect(weekBucketUtc(new Date("2024-12-30T00:00:00Z"))).toBe("2025-W01");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- gsc.test`
Expected: FAIL, `weekBucketUtc` is not exported.

- [ ] **Step 3: Implement the helpers**

In `apps/web/src/lib/gsc.ts`, add `weekBucketUtc` right after the existing `monthBucketUtc` function:

```ts
/** ISO-8601 week key "YYYY-Www" in UTC (e.g. "2026-W02"). The week-year can
 * differ from the calendar year around Jan 1 / Dec 31: ISO weeks belong to
 * the year containing their Thursday. */
export function weekBucketUtc(d: Date = new Date()): string {
  // Copy to a UTC date at midnight.
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // ISO weekday: Mon=1..Sun=7. Shift to the Thursday of this week.
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const weekYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}
```

Then add the page+query row type and query function. Add the type next to the existing `GscPageRow`:

```ts
export type GscPageQueryRow = {
  url: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};
```

And add this function right after `querySearchAnalyticsByPage`:

```ts
/**
 * Query Search Analytics for a property dimensioned by `page` AND `query`.
 * Used by the growth self-measurement sync (our own property): distinct from
 * the page-only Pro sync. Returns one row per (url, query) in the date range.
 */
export async function querySearchAnalyticsByPageQuery(
  userId: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
): Promise<GscPageQueryRow[]> {
  const tokens = await loadGscTokens(userId);
  if (!tokens) throw new Error("GSC not connected");
  const res = await fetch(
    `${API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokens.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ["page", "query"],
        rowLimit: 5000,
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`GSC searchAnalytics.query (page,query) failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[];
  };
  return (json.rows ?? []).map((r) => ({
    url: r.keys[0],
    query: r.keys[1],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- gsc.test`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/gsc.ts apps/web/src/lib/gsc.test.ts
git commit -m "feat(web): add weekBucketUtc + page+query GSC query for self-measurement"
```

---

## Task 4: Pure aggregation lib (the core)

**Files:**
- Create: `apps/web/src/lib/growth-metrics.ts`
- Test: `apps/web/src/lib/growth-metrics.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/growth-metrics.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  aggregateGrowthRows,
  growthIndexationSummary,
  type GrowthMetricRow,
} from "@/lib/growth-metrics";
import type { GscPageQueryRow } from "@/lib/gsc";

const PREFIXES = ["/symptoms", "/rules", "/tools"];

function row(url: string, query: string, clicks: number, impressions: number, position: number): GscPageQueryRow {
  return { url, query, clicks, impressions, ctr: impressions ? clicks / impressions : 0, position };
}

describe("aggregateGrowthRows", () => {
  it("drops URLs outside the growth prefixes", () => {
    const rows = [
      row("https://pseolint.dev/pricing", "pricing", 5, 100, 3),
      row("https://pseolint.dev/symptoms/x", "x query", 2, 50, 4),
    ];
    const { pageRows } = aggregateGrowthRows(rows, { growthPrefixes: PREFIXES });
    expect(pageRows).toHaveLength(1);
    expect(pageRows[0].url).toBe("https://pseolint.dev/symptoms/x");
  });

  it("emits a page-level row (query='') summing impressions/clicks with impression-weighted position", () => {
    const rows = [
      row("https://pseolint.dev/symptoms/x", "q1", 1, 100, 2), // weight 100
      row("https://pseolint.dev/symptoms/x", "q2", 3, 300, 6), // weight 300
    ];
    const { pageRows } = aggregateGrowthRows(rows, { growthPrefixes: PREFIXES });
    expect(pageRows).toHaveLength(1);
    const p = pageRows[0];
    expect(p.query).toBe("");
    expect(p.impressions).toBe(400);
    expect(p.clicks).toBe(4);
    // weighted avg position = (2*100 + 6*300)/400 = 5
    expect(p.positionAvg).toBeCloseTo(5, 5);
    // ctr = 4/400 = 0.01
    expect(p.ctrAvg).toBeCloseTo(0.01, 5);
  });

  it("returns null positionAvg/ctrAvg when impressions are zero", () => {
    const rows = [row("https://pseolint.dev/rules/y", "q", 0, 0, 0)];
    const { pageRows } = aggregateGrowthRows(rows, { growthPrefixes: PREFIXES });
    expect(pageRows[0].positionAvg).toBeNull();
    expect(pageRows[0].ctrAvg).toBeNull();
  });

  it("keeps only the top-N page+query rows per page by impressions", () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      row("https://pseolint.dev/tools/z", `q${i}`, 1, (i + 1) * 10, 5),
    );
    const { pageQueryRows } = aggregateGrowthRows(rows, { growthPrefixes: PREFIXES, topQueriesPerPage: 10 });
    const forPage = pageQueryRows.filter((r) => r.url === "https://pseolint.dev/tools/z");
    expect(forPage).toHaveLength(10);
    // highest-impression query (q14 → 150) is kept; lowest (q0 → 10) is dropped.
    expect(forPage.some((r) => r.query === "q14")).toBe(true);
    expect(forPage.some((r) => r.query === "q0")).toBe(false);
  });

  it("skips unparseable URLs without throwing", () => {
    const rows = [row("not a url", "q", 1, 10, 3)];
    const { pageRows, pageQueryRows } = aggregateGrowthRows(rows, { growthPrefixes: PREFIXES });
    expect(pageRows).toHaveLength(0);
    expect(pageQueryRows).toHaveLength(0);
  });

  it("handles empty input", () => {
    const out = aggregateGrowthRows([], { growthPrefixes: PREFIXES });
    expect(out.pageRows).toEqual([]);
    expect(out.pageQueryRows).toEqual([]);
  });
});

describe("growthIndexationSummary", () => {
  const pageRows: GrowthMetricRow[] = [
    { url: "https://pseolint.dev/symptoms/a", query: "", impressions: 50, clicks: 2, positionAvg: 4, ctrAvg: 0.04 },
    { url: "https://pseolint.dev/symptoms/b", query: "", impressions: 0, clicks: 0, positionAvg: null, ctrAvg: null },
  ];

  it("counts published URLs that have impressions", () => {
    const published = ["/symptoms/a", "/symptoms/b", "/symptoms/c"];
    const s = growthIndexationSummary(published, pageRows);
    expect(s.published).toBe(3);
    expect(s.withImpressions).toBe(1); // only /symptoms/a has impressions>0
    expect(s.indexationRatePct).toBe(33); // round(1/3*100)
  });

  it("guards against zero published URLs", () => {
    const s = growthIndexationSummary([], pageRows);
    expect(s.indexationRatePct).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- growth-metrics`
Expected: FAIL, `@/lib/growth-metrics` cannot be resolved.

- [ ] **Step 3: Implement the aggregation**

Create `apps/web/src/lib/growth-metrics.ts`:

```ts
import type { GscPageQueryRow } from "@/lib/gsc";
import { allSymptomSlugs } from "@/lib/marketing-symptoms";
import { MARKETING_RULES } from "@/lib/marketing-rules";
import { MARKETING_TOOLS } from "@/lib/marketing-tools";

/** Path prefixes of the indexable growth page-sets we self-measure. */
export const GROWTH_PREFIXES = ["/symptoms", "/rules", "/tools"] as const;

/** One row destined for the `growthSearchMetrics` table. query="" = page-level. */
export interface GrowthMetricRow {
  url: string;
  query: string;
  impressions: number;
  clicks: number;
  positionAvg: number | null;
  ctrAvg: number | null;
}

interface AggregateOptions {
  growthPrefixes: readonly string[];
  /** Max page+query rows kept per page (by impressions). Default 10. */
  topQueriesPerPage?: number;
}

function pathOf(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

function isGrowthUrl(url: string, prefixes: readonly string[]): boolean {
  const path = pathOf(url);
  if (!path) return false;
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Transform raw GSC (page,query) rows into table-ready rows:
 *  - one page-level row per URL (query=""), with impression-weighted avg
 *    position and derived CTR;
 *  - the top-N (page,query) rows per URL by impressions.
 * Pure: no I/O. URLs outside `growthPrefixes` and unparseable URLs are dropped.
 */
export function aggregateGrowthRows(
  rows: readonly GscPageQueryRow[],
  opts: AggregateOptions,
): { pageRows: GrowthMetricRow[]; pageQueryRows: GrowthMetricRow[] } {
  const topN = opts.topQueriesPerPage ?? 10;
  const byUrl = new Map<string, GscPageQueryRow[]>();
  for (const r of rows) {
    if (!isGrowthUrl(r.url, opts.growthPrefixes)) continue;
    const list = byUrl.get(r.url) ?? [];
    list.push(r);
    byUrl.set(r.url, list);
  }

  const pageRows: GrowthMetricRow[] = [];
  const pageQueryRows: GrowthMetricRow[] = [];

  for (const [url, list] of byUrl) {
    const impressions = list.reduce((s, r) => s + r.impressions, 0);
    const clicks = list.reduce((s, r) => s + r.clicks, 0);
    const weightedPos = list.reduce((s, r) => s + r.position * r.impressions, 0);
    pageRows.push({
      url,
      query: "",
      impressions,
      clicks,
      positionAvg: impressions > 0 ? weightedPos / impressions : null,
      ctrAvg: impressions > 0 ? clicks / impressions : null,
    });

    const top = [...list].sort((a, b) => b.impressions - a.impressions).slice(0, topN);
    for (const r of top) {
      pageQueryRows.push({
        url,
        query: r.query,
        impressions: r.impressions,
        clicks: r.clicks,
        positionAvg: r.impressions > 0 ? r.position : null,
        ctrAvg: r.impressions > 0 ? r.ctr : null,
      });
    }
  }

  return { pageRows, pageQueryRows };
}

export interface IndexationSummary {
  published: number;
  withImpressions: number;
  indexationRatePct: number;
}

/**
 * How many published growth URLs are actually surfacing in search (have any
 * impressions). `publishedPaths` are site-relative paths (e.g. "/symptoms/x");
 * `pageRows` carry absolute URLs, so we compare on pathname.
 */
export function growthIndexationSummary(
  publishedPaths: readonly string[],
  pageRows: readonly GrowthMetricRow[],
): IndexationSummary {
  const surfacing = new Set<string>();
  for (const r of pageRows) {
    if (r.query !== "") continue;
    if (r.impressions <= 0) continue;
    const path = pathOf(r.url);
    if (path) surfacing.add(path);
  }
  const published = publishedPaths.length;
  const withImpressions = publishedPaths.filter((p) => surfacing.has(p)).length;
  const indexationRatePct = published > 0 ? Math.round((withImpressions / published) * 100) : 0;
  return { published, withImpressions, indexationRatePct };
}

/** All indexable growth URLs we publish, as site-relative paths. */
export function publishedGrowthUrls(): string[] {
  return [
    ...allSymptomSlugs().map((s) => `/symptoms/${s}`),
    ...MARKETING_RULES.map((r) => `/rules/${r.slug}`),
    ...MARKETING_TOOLS.map((t) => `/tools/${t.slug}`),
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- growth-metrics`
Expected: PASS (8 tests).

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/growth-metrics.ts apps/web/src/lib/growth-metrics.test.ts
git commit -m "feat(web): add growth-metrics aggregation + indexation summary"
```

---

## Task 5: Sync core + weekly cron

**Files:**
- Create: `apps/web/src/lib/growth-sync-core.ts`
- Create: `apps/web/src/inngest/functions/sync-growth-metrics.ts`
- Modify: `apps/web/src/app/api/inngest/route.ts`
- Test: `apps/web/tests/integration/growth-sync.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/integration/growth-sync.test.ts` (mirrors `gsc-sync.test.ts`'s hoisted-mock style; real aggregation runs):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const auditLogMock = vi.fn();
const markGscSyncedMock = vi.fn().mockResolvedValue(undefined);
const loadGscTokensMock = vi.fn();
const queryByPageQueryMock = vi.fn();
const dbInsertMock = vi.fn();
const dbSelectUserMock = vi.fn();
let envMock: Record<string, string | undefined> = {};

vi.mock("@/lib/audit-log", () => ({ auditLog: auditLogMock }));
vi.mock("@/lib/env", () => ({ env: () => envMock }));
vi.mock("@/lib/gsc", () => ({
  markGscSynced: markGscSyncedMock,
  loadGscTokens: loadGscTokensMock,
  querySearchAnalyticsByPageQuery: queryByPageQueryMock,
  weekBucketUtc: () => "2026-W02",
  rollingDateRange: () => ({ startDate: "2026-01-01", endDate: "2026-01-28" }),
}));
vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: () => dbSelectUserMock() }) }) }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: () => dbInsertMock() }) }),
  },
}));
vi.mock("@/db/schema", () => ({
  growthSearchMetrics: { url: {}, query: {}, weekBucket: {} },
  users: { id: {}, email: {} },
}));

const { growthSyncOnce } = await import("@/lib/growth-sync-core");

beforeEach(() => {
  vi.clearAllMocks();
  dbInsertMock.mockResolvedValue(undefined);
  envMock = { GROWTH_GSC_SITE_URL: "sc-domain:pseolint.dev", GROWTH_GSC_OWNER_EMAIL: "owner@pseolint.dev" };
  dbSelectUserMock.mockResolvedValue([{ id: "owner-id" }]);
  loadGscTokensMock.mockResolvedValue({ accessToken: "t", refreshToken: "r", expiresAt: "2999-01-01T00:00:00Z" });
});

describe("growthSyncOnce", () => {
  it("skips when unconfigured", async () => {
    envMock = {};
    const r = await growthSyncOnce();
    expect(r.status).toBe("unconfigured");
    expect(queryByPageQueryMock).not.toHaveBeenCalled();
  });

  it("skips when the owner user is not found", async () => {
    dbSelectUserMock.mockResolvedValue([]);
    const r = await growthSyncOnce();
    expect(r.status).toBe("owner-not-found");
  });

  it("skips when there is no GSC grant", async () => {
    loadGscTokensMock.mockResolvedValue(null);
    const r = await growthSyncOnce();
    expect(r.status).toBe("no-grant");
  });

  it("returns empty and marks synced when GSC returns no rows", async () => {
    queryByPageQueryMock.mockResolvedValue([]);
    const r = await growthSyncOnce();
    expect(r.status).toBe("empty");
    expect(markGscSyncedMock).toHaveBeenCalledWith("owner-id");
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("aggregates growth rows and upserts, logging ok", async () => {
    queryByPageQueryMock.mockResolvedValue([
      { url: "https://pseolint.dev/symptoms/x", query: "q1", clicks: 1, impressions: 100, ctr: 0.01, position: 3 },
      { url: "https://pseolint.dev/pricing", query: "p", clicks: 9, impressions: 900, ctr: 0.01, position: 2 },
    ]);
    const r = await growthSyncOnce();
    expect(r.status).toBe("ok");
    // 1 page-level + 1 page+query row for the single in-prefix URL = 2 rows; /pricing dropped.
    expect(r.rowCount).toBe(2);
    expect(dbInsertMock).toHaveBeenCalledTimes(1);
    expect(markGscSyncedMock).toHaveBeenCalledWith("owner-id");
    expect(auditLogMock).toHaveBeenCalledWith("growth.sync.ok", expect.objectContaining({ rowCount: 2 }));
  });

  it("returns failed when the GSC API throws", async () => {
    queryByPageQueryMock.mockRejectedValue(new Error("token expired"));
    const r = await growthSyncOnce();
    expect(r.status).toBe("failed");
    expect(auditLogMock).toHaveBeenCalledWith("growth.sync.failed", expect.objectContaining({ err: "token expired" }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- growth-sync`
Expected: FAIL, `@/lib/growth-sync-core` cannot be resolved.

- [ ] **Step 3: Implement the sync core**

Create `apps/web/src/lib/growth-sync-core.ts`:

```ts
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { growthSearchMetrics, users } from "@/db/schema";
import { env } from "@/lib/env";
import {
  loadGscTokens,
  markGscSynced,
  querySearchAnalyticsByPageQuery,
  rollingDateRange,
  weekBucketUtc,
} from "@/lib/gsc";
import { aggregateGrowthRows, GROWTH_PREFIXES, type GrowthMetricRow } from "@/lib/growth-metrics";
import { auditLog } from "@/lib/audit-log";

const UPSERT_CHUNK = 500;

export type GrowthSyncResult = {
  status: "unconfigured" | "owner-not-found" | "no-grant" | "empty" | "ok" | "failed";
  rowCount?: number;
};

function toValues(rows: GrowthMetricRow[], weekBucket: string) {
  return rows.map((r) => ({
    url: r.url,
    query: r.query,
    weekBucket,
    impressions: Math.round(r.impressions),
    clicks: Math.round(r.clicks),
    positionAvg: r.positionAvg == null ? null : r.positionAvg.toFixed(2),
    ctrAvg: r.ctrAvg == null ? null : r.ctrAvg.toFixed(4),
    fetchedAt: new Date(),
  }));
}

/**
 * Pull pseolint.dev's own GSC property (page+query), aggregate to growth rows,
 * and upsert them for the current ISO-week bucket. Self-contained and
 * best-effort: any failure is logged and returned as a status, never thrown,
 * so the weekly cron schedule never wedges.
 */
export async function growthSyncOnce(): Promise<GrowthSyncResult> {
  const e = env();
  if (!e.GROWTH_GSC_SITE_URL || !e.GROWTH_GSC_OWNER_EMAIL) {
    auditLog("growth.sync.skip", { reason: "unconfigured" });
    return { status: "unconfigured" };
  }

  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, e.GROWTH_GSC_OWNER_EMAIL))
    .limit(1);
  if (!owner) {
    auditLog("growth.sync.skip", { reason: "owner-not-found" });
    return { status: "owner-not-found" };
  }

  const tokens = await loadGscTokens(owner.id);
  if (!tokens) {
    auditLog("growth.sync.skip", { reason: "no-grant" });
    return { status: "no-grant" };
  }

  const { startDate, endDate } = rollingDateRange(28);
  const weekBucket = weekBucketUtc();

  try {
    const raw = await querySearchAnalyticsByPageQuery(owner.id, e.GROWTH_GSC_SITE_URL, startDate, endDate);
    const { pageRows, pageQueryRows } = aggregateGrowthRows(raw, { growthPrefixes: GROWTH_PREFIXES });
    const all = [...pageRows, ...pageQueryRows];

    if (all.length === 0) {
      await markGscSynced(owner.id);
      auditLog("growth.sync.empty", { siteUrl: e.GROWTH_GSC_SITE_URL });
      return { status: "empty", rowCount: 0 };
    }

    for (let i = 0; i < all.length; i += UPSERT_CHUNK) {
      const values = toValues(all.slice(i, i + UPSERT_CHUNK), weekBucket);
      await db.insert(growthSearchMetrics).values(values).onConflictDoUpdate({
        target: [growthSearchMetrics.url, growthSearchMetrics.query, growthSearchMetrics.weekBucket],
        set: {
          impressions: sql`excluded.impressions`,
          clicks: sql`excluded.clicks`,
          positionAvg: sql`excluded.position_avg`,
          ctrAvg: sql`excluded.ctr_avg`,
          fetchedAt: sql`excluded.fetched_at`,
        },
      });
    }

    await markGscSynced(owner.id);
    auditLog("growth.sync.ok", { siteUrl: e.GROWTH_GSC_SITE_URL, rowCount: all.length });
    return { status: "ok", rowCount: all.length };
  } catch (err) {
    auditLog("growth.sync.failed", { err: err instanceof Error ? err.message : String(err) });
    return { status: "failed" };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- growth-sync`
Expected: PASS (6 tests).

- [ ] **Step 5: Create the cron function**

Create `apps/web/src/inngest/functions/sync-growth-metrics.ts`:

```ts
/**
 * Weekly self-measurement sync: pulls pseolint.dev's OWN GSC property
 * (page+query) for the growth page-sets and upserts into growthSearchMetrics.
 * Distinct from sync-gsc.ts, which syncs customers' domains for the Pro audit.
 * No-ops unless GROWTH_GSC_* env is configured (see growthSyncOnce).
 */
import { inngest } from "@/lib/inngest";
import { growthSyncOnce } from "@/lib/growth-sync-core";

export const syncGrowthMetrics = inngest.createFunction(
  { id: "sync-growth-metrics", retries: 1 },
  { cron: "0 4 * * 1" }, // Mondays 04:00 UTC
  async ({ step }) => {
    return step.run("growth-sync", async () => growthSyncOnce());
  },
);
```

- [ ] **Step 6: Register the cron**

In `apps/web/src/app/api/inngest/route.ts`:
1. Add the import after the `syncGscOnDemand` import:
   ```ts
   import { syncGrowthMetrics } from "@/inngest/functions/sync-growth-metrics";
   ```
2. Add `syncGrowthMetrics` to the `functions: [...]` array passed to `serve`.

- [ ] **Step 7: Run tests + typecheck**

Run: `bun run test -- growth-sync` then `bun run typecheck`
Expected: PASS (6 tests); typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/growth-sync-core.ts apps/web/src/inngest/functions/sync-growth-metrics.ts apps/web/src/app/api/inngest/route.ts apps/web/tests/integration/growth-sync.test.ts
git commit -m "feat(web): weekly growth self-measurement sync (cron + core)"
```

---

## Task 6: Owner-only `/admin/growth` dashboard

**Files:**
- Create: `apps/web/src/app/admin/growth/page.tsx`

This is a read-only server component. The owner gate is already unit-tested (Task 1); the page logic is thin glue over tested units, so no separate test file, keep it minimal.

- [ ] **Step 1: Implement the page**

Create `apps/web/src/app/admin/growth/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { growthSearchMetrics } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";
import { isOwnerEmail } from "@/lib/owner";
import { growthIndexationSummary, publishedGrowthUrls, type GrowthMetricRow } from "@/lib/growth-metrics";

export const metadata = { robots: { index: false, follow: false } };

export default async function GrowthDashboard() {
  const session = await getOptionalSession();
  if (!isOwnerEmail(session?.user?.email)) notFound();

  // Latest week bucket present in the table.
  const [latest] = await db
    .select({ weekBucket: growthSearchMetrics.weekBucket })
    .from(growthSearchMetrics)
    .orderBy(desc(growthSearchMetrics.weekBucket))
    .limit(1);

  if (!latest) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Growth, self-measurement</h1>
        <p>No data yet. The first sync runs Monday 04:00 UTC (requires GROWTH_GSC_* configured and an owner GSC grant).</p>
      </main>
    );
  }

  const rows = await db
    .select()
    .from(growthSearchMetrics)
    .where(eq(growthSearchMetrics.weekBucket, latest.weekBucket));

  const pageRows: GrowthMetricRow[] = rows
    .filter((r) => r.query === "")
    .map((r) => ({
      url: r.url,
      query: "",
      impressions: r.impressions,
      clicks: r.clicks,
      positionAvg: r.positionAvg == null ? null : Number(r.positionAvg),
      ctrAvg: r.ctrAvg == null ? null : Number(r.ctrAvg),
    }))
    .sort((a, b) => b.impressions - a.impressions);

  const summary = growthIndexationSummary(publishedGrowthUrls(), pageRows);

  return (
    <main style={{ padding: 24 }}>
      <h1>Growth, self-measurement</h1>
      <p>Week {latest.weekBucket}</p>
      <p>
        <strong>Indexation rate:</strong> {summary.withImpressions}/{summary.published} growth pages
        surfacing in search ({summary.indexationRatePct}%)
      </p>
      <table cellPadding={6} style={{ borderCollapse: "collapse", marginTop: 16 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
            <th>Page</th><th>Impr.</th><th>Clicks</th><th>Avg pos.</th><th>CTR</th>
          </tr>
        </thead>
        <tbody>
          {pageRows.map((r) => (
            <tr key={r.url} style={{ borderBottom: "1px solid #eee" }}>
              <td>{new URL(r.url).pathname}</td>
              <td>{r.impressions}</td>
              <td>{r.clicks}</td>
              <td>{r.positionAvg == null ? "; " : r.positionAvg.toFixed(1)}</td>
              <td>{r.ctrAvg == null ? "; " : `${(r.ctrAvg * 100).toFixed(1)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck + full test run**

Run: `bun run typecheck` then `bun run test`
Expected: typecheck clean; full suite green (all new unit/integration tests pass, no regressions).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/admin/growth/page.tsx
git commit -m "feat(web): owner-only /admin/growth self-measurement dashboard"
```

---

## Done criteria

- `bun run test` green: owner gate, `weekBucketUtc`, aggregation/indexation, and the sync integration tests all pass; no regressions.
- `bun run typecheck` clean.
- `growth_search_metrics` table + migration exist; `sync-growth-metrics` cron registered in the Inngest route.
- `/admin/growth` renders for an allowlisted owner (404 otherwise), showing indexation rate + per-page acquisition for the latest week, with a clean empty state before the first sync.
- Feature is inert until `GROWTH_GSC_SITE_URL`, `GROWTH_GSC_OWNER_EMAIL`, and `OWNER_EMAILS` are configured (no behavior change for existing deploys).

## Post-merge (operator, not code)
- Set `GROWTH_GSC_SITE_URL` (`sc-domain:pseolint.dev`), `GROWTH_GSC_OWNER_EMAIL`, `OWNER_EMAILS` in the deploy env.
- Connect pseolint.dev's GSC property once via the existing `/dashboard/integrations` connect flow as the owner user.
- After ~4–8 weekly buckets, set the deepen/widen/data-moat + kill-or-scale thresholds against the baseline (parent spec's open item).

## Out of scope (Phase 2 / later)
- Conversion funnel (growth page → run-audit → signup) first-party events.
- Third-party analytics; dimensions beyond page+query; >5000-row pagination.
- Any change to the Pro GSC feature or `gscPageMetrics`.
