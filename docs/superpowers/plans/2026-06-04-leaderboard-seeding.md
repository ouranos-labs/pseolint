# Leaderboard Seeding: Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the barren leaderboard immediately by running *real* audits on a curated list of well-known pSEO sites, clean ones appear with a "Notable" chip, failing ones are never named and only feed an aggregate credibility stat.

**Architecture:** A curated host list (`data/seed-sites.ts`) drives an event-triggered Inngest function that, per host, supersedes any prior seed row, inserts a fresh `source="seed"` public audit, and runs it in-process via the existing `executeAuditInProcess`. Plan 1's completion logic already extends clean public audits to permanent, so clean seeds persist and become indexable automatically; failing seeds keep a short expiry and are never listed. A final step recomputes a `seedStats` singleton (audited/passed/median) read by the leaderboard's methodology copy. Clean seeds render a "Notable" chip.

**Tech Stack:** Next.js (App Router, RSC), Drizzle ORM (Postgres/Neon), Inngest, Vitest.

**Scope note:** Plan 2 of 3 from `docs/superpowers/specs/2026-06-04-leaderboard-clean-corpus-design.md` (§7). Depends on Plan 1 (merged): `audits.source` column, `isLeaderboardEligible`, permanent-on-completion, clean-only query. Plan 3 (claims/conversion) is separate. This plan does NOT add claims, badges, or verification.

**Conventions:** All commands from `apps/web`. Tests: `npx vitest run <path>`. Typecheck: `npx tsc --noEmit -p tsconfig.json`. Work on a NEW branch `feat/leaderboard-seeding` cut from `main`.

**Known constraint (document, don't silently cap):** the Inngest route has `maxDuration = 300`. Each seed audit takes ~30–60s, so a single run comfortably handles ~6–8 sites. Inngest `step.run` memoizes completed per-host steps, so a timeout resumes on retry without re-auditing finished hosts. Keep the starter list small; scaling to dozens needs event fan-out (one event per host), noted as future work in `seed-sites.ts`, not built here.

---

### Task 1: `median()` helper (pure, tested)

**Files:**
- Modify: `apps/web/src/lib/leaderboard.ts`
- Modify: `apps/web/src/lib/leaderboard.test.ts`

- [ ] **Step 1: Add failing tests**: append to `apps/web/src/lib/leaderboard.test.ts`:

```ts
import { median } from "./leaderboard";

describe("median", () => {
  it("returns null for an empty list", () => {
    expect(median([])).toBeNull();
  });
  it("returns the single value", () => {
    expect(median([42])).toBe(42);
  });
  it("averages the two middle values for an even count", () => {
    expect(median([10, 20])).toBe(15);
    expect(median([10, 20, 30, 40])).toBe(25);
  });
  it("returns the middle value for an odd count", () => {
    expect(median([30, 10, 20])).toBe(20);
  });
  it("does not mutate the input array", () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/lib/leaderboard.test.ts`
Expected: FAIL, `median` is not exported.

- [ ] **Step 3: Implement**: append to `apps/web/src/lib/leaderboard.ts`:

```ts
/**
 * Median of a list of numbers. Returns null for an empty list. Used for the
 * seed-stats aggregate ("median score X"). Pure; does not mutate the input.
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npx vitest run src/lib/leaderboard.test.ts`
Expected: PASS (16 tests total, 11 existing + 5 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/leaderboard.ts src/lib/leaderboard.test.ts
git commit -m "feat(leaderboard): add median() helper for seed stats"
```

---

### Task 2: `seedStats` singleton table + migration

**Files:**
- Modify: `apps/web/src/db/schema.ts`
- Create: migration via `drizzle-kit generate`

- [ ] **Step 1: Add the table**: in `apps/web/src/db/schema.ts`, after the `audits` table block (before `monitoredDomains`), add:

```ts
/**
 * Singleton row holding the seed-audit aggregate stat shown on the leaderboard
 * ("We audited N well-known pSEO sites; M passed; median X"). Recomputed by the
 * seed-leaderboard Inngest function. `id` is always the literal "singleton".
 */
export const seedStats = pgTable("seed_stats", {
  id: text("id").primaryKey().default("singleton"),
  auditedCount: integer("audited_count").notNull().default(0),
  passedCount: integer("passed_count").notNull().default(0),
  medianRisk: integer("median_risk"),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
});
```

(`pgTable`, `text`, `integer`, `timestamp` are already imported in this file.)

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new `0017_*.sql` creating `seed_stats` + `0017_snapshot.json` + updated `_journal.json`. If drizzle-kit prompts create-vs-rename, choose CREATE (new table).

- [ ] **Step 3: Verify the SQL**

Run: `git status --short src/db/migrations`
Open the new `0017_*.sql`; confirm it only `CREATE TABLE "seed_stats" (...)` with the four columns + PK. If anything destructive appears, STOP and report BLOCKED.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/db/migrations
git commit -m "feat(db): add seed_stats singleton table"
```

---

### Task 3: Curated seed-site list

**Files:**
- Create: `apps/web/src/data/seed-sites.ts`

- [ ] **Step 1: Create the list**

Create `apps/web/src/data/seed-sites.ts`:

```ts
/**
 * Curated list of well-known programmatic-SEO sites the leaderboard seeds with.
 * Each is audited FOR REAL by the seed-leaderboard Inngest function; clean ones
 * (risk < 40) appear with a "Notable" chip, failing ones are never named and
 * only feed the aggregate stat. This is editorial input: review/expand before
 * running a seed pass.
 *
 * SCALING NOTE: the seed-leaderboard function audits these in one Inngest run
 * (maxDuration 300s ≈ 6–8 sites/run, resumable across retries). To seed dozens,
 * switch to event fan-out (one "seed/host.requested" event per host). Not built
 * yet: keep this list small until then.
 */
export interface SeedSite {
  host: string;
  /** Optional grouping label for future category sub-lists; unused today. */
  category?: string;
}

export const SEED_SITES: SeedSite[] = [
  { host: "zapier.com", category: "integrations-directory" },
  { host: "nomadlist.com", category: "travel-data" },
  { host: "wise.com", category: "fintech-rates" },
  { host: "tripadvisor.com", category: "travel-directory" },
  { host: "indeed.com", category: "jobs" },
  { host: "g2.com", category: "software-reviews" },
];
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/data/seed-sites.ts
git commit -m "feat(leaderboard): curated seed-site starter list"
```

---

### Task 4: `seedLeaderboard` Inngest function + registration + trigger script

**Files:**
- Create: `apps/web/src/inngest/functions/seed-leaderboard.ts`
- Modify: `apps/web/src/app/api/inngest/route.ts`
- Create: `apps/web/scripts/seed-leaderboard.ts`

- [ ] **Step 1: Create the function**

Create `apps/web/src/inngest/functions/seed-leaderboard.ts`:

```ts
import { and, eq, isNotNull, lt, desc, ne } from "drizzle-orm";
import { inngest } from "@/lib/inngest";
import { db } from "@/db";
import { audits, seedStats } from "@/db/schema";
import { publicSlug } from "@/lib/slug";
import { executeAuditInProcess } from "@/inngest/functions/run-audit";
import { LEADERBOARD_RISK_MAX, median } from "@/lib/leaderboard";
import { SEED_SITES } from "@/data/seed-sites";
import { auditLog } from "@/lib/audit-log";

/** Failing seeds expire fast; clean seeds get extended to permanent at completion (Plan 1). */
const SEED_EXPIRY_DAYS = 7;
/** Sample budget per seed audit, matches the free-tier ceiling. */
const SEED_SAMPLE_SIZE = 100;

/**
 * Seeds the leaderboard by running real audits on the curated SEED_SITES list.
 * Triggered manually via `inngest.send({ name: "seed/leaderboard.requested" })`
 * (see scripts/seed-leaderboard.ts). Per host: supersede the prior seed row,
 * insert a fresh public source="seed" audit, run it in-process. Finally recompute
 * the seed_stats singleton.
 */
export const seedLeaderboard = inngest.createFunction(
  { id: "seed-leaderboard", retries: 1, concurrency: { limit: 4 } },
  { event: "seed/leaderboard.requested" },
  async ({ step }) => {
    for (const site of SEED_SITES) {
      const url = `https://${site.host}`;
      await step.run(`seed-${site.host}`, async () => {
        // Supersede any prior seed row for this URL so we keep one live entry
        // per host: expire it now (expire-reports cleans its storage, and the
        // most-recent-per-host leaderboard query stops showing it).
        await db
          .update(audits)
          .set({ expiresAt: new Date() })
          .where(and(eq(audits.source, "seed"), eq(audits.sourceUrl, url)));

        const [row] = await db
          .insert(audits)
          .values({
            slug: publicSlug(),
            userId: null,
            anonSessionId: null,
            sourceUrl: url,
            status: "queued",
            isPublic: true,
            source: "seed",
            expiresAt: new Date(Date.now() + SEED_EXPIRY_DAYS * 86_400_000),
          })
          .returning({ id: audits.id });

        await executeAuditInProcess({
          auditId: row.id,
          url,
          plan: "free",
          sampleSize: SEED_SAMPLE_SIZE,
        });
        return { host: site.host, auditId: row.id };
      });
    }

    await step.run("recompute-seed-stats", async () => {
      // Most-recent completed seed audit per host (DISTINCT ON needs host-first order).
      const rows = await db
        .selectDistinctOn([audits.host], { host: audits.host, risk: audits.risk })
        .from(audits)
        .where(
          and(
            eq(audits.source, "seed"),
            eq(audits.status, "completed"),
            isNotNull(audits.host),
            isNotNull(audits.risk),
          ),
        )
        .orderBy(audits.host, desc(audits.createdAt));

      const risks = rows.map((r) => r.risk!).filter((r): r is number => r != null);
      const auditedCount = risks.length;
      const passedCount = risks.filter((r) => r < LEADERBOARD_RISK_MAX).length;
      const med = median(risks);
      const computedAt = new Date();

      await db
        .insert(seedStats)
        .values({
          id: "singleton",
          auditedCount,
          passedCount,
          medianRisk: med == null ? null : Math.round(med),
          computedAt,
        })
        .onConflictDoUpdate({
          target: seedStats.id,
          set: {
            auditedCount,
            passedCount,
            medianRisk: med == null ? null : Math.round(med),
            computedAt,
          },
        });

      auditLog("seed.stats.recomputed", { auditedCount, passedCount, medianRisk: med });
      return { auditedCount, passedCount };
    });
  },
);
```

Note: the unused imports `lt`/`ne` above are NOT needed, include only `and, eq, isNotNull, desc` from `drizzle-orm`. (Remove `lt, ne` when writing the file.)

- [ ] **Step 2: Add the audit-log event type**

In `apps/web/src/lib/audit-log.ts`, add to the `AuditLogEvent` union (next to other event strings):

```ts
  | "seed.stats.recomputed"
```

- [ ] **Step 3: Register the function**: in `apps/web/src/app/api/inngest/route.ts`:

Add the import after the other function imports:
```ts
import { seedLeaderboard } from "@/inngest/functions/seed-leaderboard";
```
Add `seedLeaderboard` to the `functions: [...]` array in the `serve({...})` call.

- [ ] **Step 4: Create the trigger script**

Create `apps/web/scripts/seed-leaderboard.ts`:

```ts
/**
 * Manually trigger a leaderboard seeding pass:
 *   npx tsx apps/web/scripts/seed-leaderboard.ts
 * Sends the Inngest event the seed-leaderboard function listens for. Requires
 * INNGEST_EVENT_KEY in env (and the Inngest dev server running locally, or
 * production credentials).
 */
import { inngest } from "../src/lib/inngest";

async function main() {
  await inngest.send({ name: "seed/leaderboard.requested", data: {} });
  console.log("Sent seed/leaderboard.requested, watch the Inngest dashboard for progress.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors. (If TS flags the `onConflictDoUpdate` target type, confirm `seedStats.id` is the PK, it is.)

- [ ] **Step 6: Commit**

```bash
git add src/inngest/functions/seed-leaderboard.ts src/app/api/inngest/route.ts scripts/seed-leaderboard.ts src/lib/audit-log.ts
git commit -m "feat(leaderboard): seed-leaderboard Inngest function + trigger script"
```

---

### Task 5: Select `source` + render "Notable" chip

**Files:**
- Modify: `apps/web/src/app/leaderboard/page.tsx`

- [ ] **Step 1: Select `source` in the query**

In the `selectDistinctOn([audits.host], { ... })` field map, add:
```ts
      source: audits.source,
```
(next to `host: audits.host`).

- [ ] **Step 2: Render the chip on seeded cards**

In the card `<article>` for each row (the block that renders the rank badge `{ i + 1 }` and `<SiteThumbnail .../>`), add a "Notable" chip when `r.source === "seed"`. Immediately after the rank-badge `<span>` (the one with `{ i + 1 }`), add:

```tsx
                  { r.source === "seed" && (
                    <span className="absolute left-3 top-3 z-10 inline-flex items-center rounded-[8px] bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-primary shadow-sm">
                      Notable
                    </span>
                  ) }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Manual check**

`npm run dev` → `/leaderboard`. If seed rows exist, clean ones show a "Notable" chip top-left. (Empty DB → nothing to show; the query change is type-safe regardless.)

- [ ] **Step 5: Commit**

```bash
git add src/app/leaderboard/page.tsx
git commit -m "feat(leaderboard): Notable chip on seeded clean entries"
```

---

### Task 6: Render the seed-stats aggregate sentence

**Files:**
- Modify: `apps/web/src/app/leaderboard/page.tsx`

- [ ] **Step 1: Fetch the singleton**

Add the import near the top:
```ts
import { seedStats } from "@/db/schema";
```
(extend the existing `import { audits } from "@/db/schema";` to `import { audits, seedStats } from "@/db/schema";`).

Inside `Leaderboard()`, after the `deduped` computation, add:
```ts
  const [stats] = await db.select().from(seedStats).limit(1);
```

- [ ] **Step 2: Render the sentence in the methodology section**

In the one-paragraph methodology `<p>` (the "Leaderboard methodology in one paragraph:" block), append this sentence before the closing `</p>`, inside the same paragraph, after the existing text:

```tsx
          { stats && stats.auditedCount > 0 ? (
            <>
              { " " }To bootstrap the board we also audited{ " " }
              <span className="text-foreground">{ stats.auditedCount }</span> well-known
              programmatic-SEO sites; <span className="text-foreground">{ stats.passedCount }</span>{ " " }
              landed in the A/B band{ stats.medianRisk !== null ? <> (median score { stats.medianRisk })</> : null }.
              Only the clean ones are named here.
            </>
          ) : null }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Manual check**

`npm run dev` → `/leaderboard`. With a populated `seed_stats` row, the methodology paragraph ends with the "we also audited N… M passed (median X)" sentence. With no row, the sentence is absent (no crash).

- [ ] **Step 5: Commit**

```bash
git add src/app/leaderboard/page.tsx
git commit -m "feat(leaderboard): show seed-audit aggregate stat in methodology"
```

---

## Final verification

- [ ] **Gate**

Run: `npx vitest run src/lib/leaderboard.test.ts && npx tsc --noEmit -p tsconfig.json`
Expected: lib tests PASS (16), typecheck clean. (Do NOT block on the repo's pre-existing flaky integration tests.)

- [ ] **Diff scope**

Run: `git diff --name-only main`
Expected only: `src/lib/leaderboard.ts(+test)`, `src/db/schema.ts`, `src/db/migrations/0017_*`, `src/data/seed-sites.ts`, `src/inngest/functions/seed-leaderboard.ts`, `src/app/api/inngest/route.ts`, `scripts/seed-leaderboard.ts`, `src/lib/audit-log.ts`, `src/app/leaderboard/page.tsx`, and this plan.

---

## Self-review notes (author)

**Spec coverage (§7):** real audits via `executeAuditInProcess` → Task 4. `source="seed"` rows → Task 4 (column from Plan 1). Clean named as "Notable" → Task 5. Failing never named → enforced by Plan 1's clean-only query (no extra work) + only the aggregate counts them. Aggregate snapshot (`seedStats`, decoupled from row expiry) → Tasks 2 + 4 + 6. Failing seeds short expiry / clean seeds permanent → Task 4 (7d default; permanence inherited from Plan 1 completion logic). Supersede prior seed rows → Task 4 step.

**Deferred-dependency check:** No references to `leaderboardClaims`, badges, or verification (Plan 3). `median`/`LEADERBOARD_RISK_MAX` come from the Plan-1 lib.

**Type consistency:** `seedStats` columns (`id`, `auditedCount`, `passedCount`, `medianRisk`, `computedAt`) are referenced identically in Tasks 2, 4, 6. `median(): number | null` is consumed in Task 4 with a `Math.round` + null guard before storing the integer `medianRisk`. `audits.source` (Plan 1) selected in Task 5 and filtered in Task 4.

**Constraint honesty:** the maxDuration / list-size limit is documented in both the plan header and `seed-sites.ts`, with the fan-out scaling path called out rather than silently capped.
