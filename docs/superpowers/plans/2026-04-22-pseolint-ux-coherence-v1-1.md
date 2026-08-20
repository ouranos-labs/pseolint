# pseolint v1.1 UX Coherence: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the v1.1 UX coherence reframe, tier-aware dashboard home, two-layer nav, audit↔monitor bridge with intent-preserving checkout, per-domain workspace, and public slugs replacing raw DB UUIDs.

**Architecture:** Additive schema changes (slugs on `audits` + `monitoredDomains`, `usage_log`, `alert_defaults`, `monitoredDomains.removedAt`). Server actions for add-domain / re-audit / snooze-dismiss. New routes: `/dashboard/:slug`, `/dashboard/:slug/settings`, `/dashboard/settings/{account,billing,alerts}`. Report route migrates from `/r/[uuid]` to `/r/[slug]`. Navigation split into global top-bar + dashboard sub-nav. No engine or rule changes, `@pseolint/core` unchanged.

**Tech Stack:** Next.js 16 App Router, Drizzle + Postgres (Neon), Inngest crons, Better Auth, Polar checkout/webhooks, nanoid for slugs, React Server Components + server actions, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-04-22-pseolint-ux-coherence-design.md`

---

## Task 1: Schema migration: slugs, soft-delete, usage_log, alert_defaults

**Files:**
- Modify: `apps/web/src/db/schema.ts`
- Generate: `apps/web/src/db/migrations/0004_*.sql` (via `drizzle-kit generate`)
- Create: `apps/web/src/lib/slug.ts`

- [ ] **Step 1: Write the slug helper + test**

Create `apps/web/src/lib/slug.ts`:

```ts
import { customAlphabet } from "nanoid";

// URL-safe alphabet, no look-alikes (no 0/O, 1/l/I)
const ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

const generate = customAlphabet(ALPHABET, 10);

/**
 * Public slug: 10 chars, URL-safe, ~58 bits of entropy.
 * Use for audit + monitored-domain public identifiers.
 */
export function publicSlug(): string {
  return generate();
}
```

Create `apps/web/tests/unit/slug.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { publicSlug } from "@/lib/slug";

describe("publicSlug", () => {
  it("produces 10-char strings", () => {
    expect(publicSlug()).toHaveLength(10);
  });
  it("uses only safe alphabet (no 0/O/1/l/I)", () => {
    for (let i = 0; i < 1000; i++) {
      expect(publicSlug()).toMatch(/^[2-9a-kmnp-zA-HJ-NP-Z]{10}$/);
    }
  });
  it("is unique across 10k draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) seen.add(publicSlug());
    expect(seen.size).toBe(10_000);
  });
});
```

- [ ] **Step 2: Run the test, verify it passes**

Run: `cd apps/web && bunx vitest run tests/unit/slug.test.ts`
Expected: 3 pass.

- [ ] **Step 3: Add columns + tables to schema**

Edit `apps/web/src/db/schema.ts`. Add `slug` column to audits and monitoredDomains, add `removedAt` to monitoredDomains, add two new tables. Use patches:

In `audits` definition (around line 58), add `slug` and a unique index:

```ts
export const audits = pgTable("audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),          // NEW
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  // ...rest unchanged
}, (t) => ({
  userIdx: index("audit_user_idx").on(t.userId),
  anonIdx: index("audit_anon_idx").on(t.anonSessionId),
  leaderboardIdx: index("audit_leaderboard_idx").on(t.isPublic, t.status, t.score),
  expiresIdx: index("audit_expires_idx").on(t.expiresAt),
  slugIdx: uniqueIndex("audit_slug_uniq").on(t.slug),  // NEW
}));
```

In `monitoredDomains` (line 81), add `slug` and `removedAt`:

```ts
export const monitoredDomains = pgTable("monitored_domain", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),            // NEW
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sourceUrl: text("source_url").notNull(),
  host: text("host").notNull(),
  cadence: text("cadence").$type<"weekly" | "daily">().notNull().default("weekly"),
  paused: boolean("paused").notNull().default(false),
  alertEmail: text("alert_email"),
  alertThreshold: integer("alert_threshold").notNull().default(10),
  lastAuditId: uuid("last_audit_id"),
  lastScore: integer("last_score"),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastFullRunAt: timestamp("last_full_run_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull().defaultNow(),
  removedAt: timestamp("removed_at", { withTimezone: true }),   // NEW
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index("monitored_user_idx").on(t.userId),
  nextRunIdx: index("monitored_next_run_idx").on(t.nextRunAt, t.paused),
  userDomainUniq: uniqueIndex("monitored_user_domain_uniq").on(t.userId, t.host),
  slugIdx: uniqueIndex("monitored_slug_uniq").on(t.slug),  // NEW
}));
```

Append two new tables at end of file:

```ts
export const usageLog = pgTable("usage_log", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"ai_triage">().notNull(),
  monthYyyymm: text("month_yyyymm").notNull(),   // e.g. "2026-04"
  count: integer("count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: uniqueIndex("usage_log_pk").on(t.userId, t.kind, t.monthYyyymm),
}));

export const alertDefaults = pgTable("alert_default", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  scoreDropThreshold: integer("score_drop_threshold").notNull().default(10),
  recipientEmails: text("recipient_emails").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}));
```

- [ ] **Step 4: Generate + patch migration for slug backfill**

Run: `cd apps/web && bun run db:generate`
Expected: a new migration file `src/db/migrations/0004_*.sql` is created.

**Open the generated file** and inject a backfill BEFORE the NOT NULL constraint on `slug`. Drizzle typically emits `ADD COLUMN slug text NOT NULL`, we need to split that into ADD NULL → backfill → SET NOT NULL. Replace the auto-emitted statements for both `audit` and `monitored_domain` slug columns with:

```sql
-- Backfill slugs for existing audits
ALTER TABLE "audit" ADD COLUMN "slug" text;
UPDATE "audit" SET "slug" = substr(replace(gen_random_uuid()::text, '-', ''), 1, 10) WHERE "slug" IS NULL;
ALTER TABLE "audit" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "audit_slug_uniq" ON "audit" USING btree ("slug");

-- Backfill slugs for existing monitored domains
ALTER TABLE "monitored_domain" ADD COLUMN "slug" text;
UPDATE "monitored_domain" SET "slug" = substr(replace(gen_random_uuid()::text, '-', ''), 1, 10) WHERE "slug" IS NULL;
ALTER TABLE "monitored_domain" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "monitored_slug_uniq" ON "monitored_domain" USING btree ("slug");
```

The uuid-based backfill produces 10-char hex slugs for existing rows (adequate entropy for pre-launch data; new rows use the nicer nanoid alphabet).

Rename the migration file to `0004_ux_coherence_foundation.sql` for clarity.

- [ ] **Step 5: Apply migration + verify**

Run: `cd apps/web && bun run db:migrate`
Expected: `[✓] migrations applied successfully!`

Run (in psql or a one-off script): verify `SELECT count(*) FROM audit WHERE slug IS NULL;` → 0 and same for `monitored_domain`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/db/schema.ts apps/web/src/db/migrations/ apps/web/src/lib/slug.ts apps/web/tests/unit/slug.test.ts
git commit -m "feat(web): schema foundations for UX coherence, slugs, soft-delete, usage_log, alert_defaults"
```

---

## Task 2: Generate slugs on insert; default insert helpers

**Files:**
- Modify: `apps/web/src/app/api/audits/route.ts` (POST handler: audit creation)
- Modify: all other call sites that insert into `audits` or `monitoredDomains` (see Step 1 to locate)

- [ ] **Step 1: Find every audit + monitoredDomain insert**

Run:
```bash
grep -rn "db.insert(audits)" apps/web/src --include='*.ts' --include='*.tsx'
grep -rn "db.insert(monitoredDomains)" apps/web/src --include='*.ts' --include='*.tsx'
```
Enumerate every match. Expected: 1–3 files for audits (at minimum `/api/audits/route.ts`), 0–1 for monitoredDomains (there may be none yet; add-domain action in Task 8 will introduce the first one).

- [ ] **Step 2: Write a test that a freshly created audit has a slug**

Create `apps/web/tests/integration/audit-slug.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { publicSlug } from "@/lib/slug";
import { eq } from "drizzle-orm";

describe("audit slug on insert", () => {
  it("every new audit row has a non-null 10-char slug", async () => {
    const slug = publicSlug();
    const expires = new Date(Date.now() + 24 * 3600 * 1000);
    const [row] = await db.insert(audits).values({
      slug, sourceUrl: "https://example.com", status: "queued", expiresAt: expires,
    }).returning();
    expect(row.slug).toHaveLength(10);
    expect(row.slug).toBe(slug);
    await db.delete(audits).where(eq(audits.id, row.id));
  });
});
```

- [ ] **Step 3: Update every insert to pass a slug**

For each enumerated file, add `slug: publicSlug(),` to the `.values({...})` call. Import `publicSlug` from `@/lib/slug`.

Example (in `apps/web/src/app/api/audits/route.ts`):

```ts
import { publicSlug } from "@/lib/slug";
// ...
const [audit] = await db.insert(audits).values({
  slug: publicSlug(),      // NEW
  userId,
  anonSessionId,
  sourceUrl,
  expiresAt,
  // ...
}).returning();
```

- [ ] **Step 4: Run integration test + typecheck**

Run: `cd apps/web && bunx vitest run tests/integration/audit-slug.test.ts && bun run typecheck`
Expected: test passes (if DATABASE_URL points to a real DB; otherwise it skips with a clear DB-unavailable error); typecheck passes.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): populate public slug on audit + monitored-domain inserts"
```

---

## Task 3: Route migration: `/r/[uuid]` → `/r/[slug]`

**Files:**
- Rename: `apps/web/src/app/r/[uuid]/page.tsx` → `apps/web/src/app/r/[slug]/page.tsx`
- Modify: every callsite that links to `/r/...` (use grep to find)
- Modify: every API route that resolves an audit by URL param

- [ ] **Step 1: Find all references to `/r/` URL construction**

Run:
```bash
grep -rn '/r/' apps/web/src --include='*.ts' --include='*.tsx' | grep -v node_modules
```
Expected matches: page.tsx files, share-link builders, email templates that include report links. List them.

- [ ] **Step 2: Rename the route folder + param**

```bash
cd apps/web/src/app/r
mv "[uuid]" "[slug]"
```

In the new `page.tsx`, change the param type + lookup. The current file uses `params.uuid`; change to `params.slug` and query `audits.slug`:

```tsx
export default async function ReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [audit] = await db.select().from(audits).where(eq(audits.slug, slug)).limit(1);
  if (!audit) notFound();
  // rest of page unchanged
}
```

- [ ] **Step 3: Update all link builders**

Replace every `/r/${audit.id}` / `/r/${a.id}` with `/r/${audit.slug}` / `/r/${a.slug}`. Query sites must `SELECT slug FROM audit` instead of (or in addition to) `id`.

Common locations:
- `apps/web/src/app/dashboard/page.tsx` (admin table / future history)
- `apps/web/src/app/leaderboard/page.tsx`
- `apps/web/src/emails/*.tsx` if they include links
- `apps/web/src/inngest/functions/run-audit.ts` if it emits any report URL in logs or events

- [ ] **Step 4: Update any `/api/audits/[id]/route.ts` consumers if they're called with slugs from the client**

Inspect `apps/web/src/app/api/audits/[id]/route.ts`. If called from client pages that previously passed `audit.id`, either (a) keep it as UUID-by-id and only expose `slug` in the URL bar, or (b) switch it to slug lookup too. Decision: keep internal API at `/api/audits/:id` using UUID (internal), only the public `/r/:slug` surfaces use slug. Ensure no client page passes `audit.slug` to the internal API.

- [ ] **Step 5: Typecheck + build**

Run: `cd apps/web && bun run typecheck && bun run build`
Expected: typecheck passes; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "refactor(web): public report URLs use slug, not database UUID"
```

---

## Task 4: Anon IP rate limit + per-tier page cap

**Files:**
- Modify: `apps/web/src/app/api/audits/route.ts` (POST: anon & free audit submission)
- Create: `apps/web/src/lib/ip.ts`
- Create: `apps/web/src/lib/audit-limits.ts`

- [ ] **Step 1: IP resolver helper**

Create `apps/web/src/lib/ip.ts`:

```ts
import { createHash } from "node:crypto";

/**
 * Resolve client IP from Vercel / X-Forwarded-For headers, falling back to "unknown".
 * Only the first forwarded hop is trusted.
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 24);
}
```

- [ ] **Step 2: Tier + limit helpers**

Create `apps/web/src/lib/audit-limits.ts`:

```ts
import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { hashIp } from "@/lib/ip";
import { and, eq, gte, sql } from "drizzle-orm";

export const PAGE_CAP = { anon: 50, free: 200, pro: Number.MAX_SAFE_INTEGER } as const;
export const ANON_DAILY_CAP = 3;

export function pageCapFor(tier: "anon" | "free" | "pro"): number {
  return PAGE_CAP[tier];
}

/**
 * Atomically increment today's anon audit counter for the given IP, return new count.
 * Rejects (returns null) if already at cap.
 */
export async function reserveAnonAuditSlot(ip: string): Promise<number | null> {
  const day = new Date().toISOString().slice(0, 10);        // YYYY-MM-DD
  const key = `anon:audit:${hashIp(ip)}:${day}`;
  const expires = new Date(Date.now() + 25 * 3600 * 1000);  // 25h

  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, expiresAt: expires })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: { count: sql`${rateLimits.count} + 1` },
      where: sql`${rateLimits.count} < ${ANON_DAILY_CAP}`,
    })
    .returning({ count: rateLimits.count });

  // If conflict + where-guard rejected the update, nothing is returned.
  if (!row) return null;
  return row.count;
}
```

- [ ] **Step 3: Wire into audit POST**

In `apps/web/src/app/api/audits/route.ts`, at the top of the POST handler, after body parsing:

```ts
import { clientIp } from "@/lib/ip";
import { reserveAnonAuditSlot, pageCapFor, ANON_DAILY_CAP } from "@/lib/audit-limits";
// ...
const tier: "anon" | "free" | "pro" = session ? (profile?.plan === "pro" ? "pro" : "free") : "anon";

if (tier === "anon") {
  const slot = await reserveAnonAuditSlot(clientIp(req));
  if (slot === null) {
    return NextResponse.json(
      { error: `Anon audits limited to ${ANON_DAILY_CAP} per day. Sign in for unlimited.` },
      { status: 429 },
    );
  }
}

const requestedSampleSize = Math.min(body.data.sampleSize ?? 200, pageCapFor(tier));
```

Pass `requestedSampleSize` to the Inngest event payload / `executeAudit` call instead of the prior value.

- [ ] **Step 4: Test the rate limit helper**

Create `apps/web/tests/integration/audit-rate-limit.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { reserveAnonAuditSlot, ANON_DAILY_CAP } from "@/lib/audit-limits";
import { hashIp } from "@/lib/ip";
import { like } from "drizzle-orm";

const IP = "203.0.113.42";

describe("anon audit rate limit", () => {
  beforeEach(async () => {
    await db.delete(rateLimits).where(like(rateLimits.key, `anon:audit:${hashIp(IP)}:%`));
  });

  it("allows up to the cap and rejects beyond", async () => {
    for (let i = 1; i <= ANON_DAILY_CAP; i++) {
      const count = await reserveAnonAuditSlot(IP);
      expect(count).toBe(i);
    }
    expect(await reserveAnonAuditSlot(IP)).toBeNull();
  });
});
```

Run: `cd apps/web && bunx vitest run tests/integration/audit-rate-limit.test.ts`
Expected: pass (if DATABASE_URL set; otherwise skip with connect error).

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): anon IP rate limit (3/day) and per-tier page cap (50/200/∞)"
```

---

## Task 5: AI triage metering + POST /api/audits/:slug/triage

**Files:**
- Create: `apps/web/src/lib/usage.ts`
- Create: `apps/web/src/app/api/audits/[slug]/triage/route.ts`

- [ ] **Step 1: Usage helper with atomic monthly increment**

Create `apps/web/src/lib/usage.ts`:

```ts
import { db } from "@/db";
import { usageLog } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

const FREE_AI_TRIAGE_MONTHLY = 1;

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Atomic check-and-increment of monthly AI triage quota for a free user.
 * Returns { ok: true, remaining } on success, { ok: false, used } on quota hit.
 */
export async function reserveFreeTriageSlot(userId: string): Promise<
  | { ok: true; remaining: number }
  | { ok: false; used: number }
> {
  const month = currentMonth();
  const [row] = await db
    .insert(usageLog)
    .values({ userId, kind: "ai_triage", monthYyyymm: month, count: 1 })
    .onConflictDoUpdate({
      target: [usageLog.userId, usageLog.kind, usageLog.monthYyyymm],
      set: { count: sql`${usageLog.count} + 1`, updatedAt: new Date() },
      where: sql`${usageLog.count} < ${FREE_AI_TRIAGE_MONTHLY}`,
    })
    .returning({ count: usageLog.count });

  if (!row) {
    const [existing] = await db
      .select({ count: usageLog.count })
      .from(usageLog)
      .where(
        and(
          eq(usageLog.userId, userId),
          eq(usageLog.kind, "ai_triage"),
          eq(usageLog.monthYyyymm, month),
        ),
      )
      .limit(1);
    return { ok: false, used: existing?.count ?? FREE_AI_TRIAGE_MONTHLY };
  }

  return { ok: true, remaining: FREE_AI_TRIAGE_MONTHLY - row.count };
}
```

- [ ] **Step 2: Triage endpoint**

Create `apps/web/src/app/api/audits/[slug]/triage/route.ts`:

```ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { audits, userProfiles } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { reserveFreeTriageSlot } from "@/lib/usage";
import { getSummary } from "@/lib/r2";
import { triage, type AuditSummary } from "@pseolint/core";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  let session;
  try { session = await requireSession(); } catch (r) { return r as Response; }

  const { slug } = await params;
  const [audit] = await db.select().from(audits).where(eq(audits.slug, slug)).limit(1);
  if (!audit) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (audit.userId !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [profile] = await db
    .select({ plan: userProfiles.plan })
    .from(userProfiles)
    .where(eq(userProfiles.userId, session.user.id))
    .limit(1);
  const isPro = profile?.plan === "pro";

  if (!isPro) {
    const slot = await reserveFreeTriageSlot(session.user.id);
    if (!slot.ok) {
      return NextResponse.json(
        { error: "monthly AI triage quota reached", used: slot.used },
        { status: 402 },
      );
    }
  }

  if (!audit.storageKey) {
    return NextResponse.json({ error: "audit not yet complete" }, { status: 409 });
  }

  const summary: AuditSummary = JSON.parse(await getSummary(audit.storageKey.replace(/\.html$/, ".json")));
  const triaged = await triage(summary, { maxCostUsd: 0.50 });

  await db.update(audits).set({
    triageRootCauseCount: triaged.rootCauses.length,
    triageCostUsd: String(triaged.estimatedCostUsd ?? 0),
  }).where(eq(audits.id, audit.id));

  return NextResponse.json({ triage: triaged });
}
```

**Note:** `triage` and `getSummary` may need small additions. Verify: (a) `@pseolint/core` exports a `triage(summary, opts)` function; if it only runs inside `auditSource`, factor it out into an exported helper during this task. (b) `@/lib/r2` has a `getSummary(key)` helper to fetch JSON from R2; if not, add it alongside existing `uploadSummary`.

- [ ] **Step 3: Test the usage helper**

Create `apps/web/tests/integration/usage.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { usageLog, users } from "@/db/schema";
import { reserveFreeTriageSlot } from "@/lib/usage";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

describe("free AI triage monthly quota", () => {
  const userId = `test-${nanoid(8)}`;

  beforeEach(async () => {
    await db.insert(users).values({
      id: userId, email: `${userId}@test.local`, name: "test", emailVerified: true,
    }).onConflictDoNothing();
    await db.delete(usageLog).where(eq(usageLog.userId, userId));
  });

  it("allows first call, rejects second", async () => {
    const first = await reserveFreeTriageSlot(userId);
    expect(first).toEqual({ ok: true, remaining: 0 });
    const second = await reserveFreeTriageSlot(userId);
    expect(second.ok).toBe(false);
  });
});
```

Run: `cd apps/web && bunx vitest run tests/integration/usage.test.ts`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web packages/core
git commit -m "feat(web): AI triage metering + POST /api/audits/:slug/triage endpoint"
```

---

## Task 6: Nav: split top-bar + dashboard sub-nav shell

**Files:**
- Modify: `apps/web/src/app/layout.tsx` (top-bar: anon vs signed-in variants; marketing links to footer for signed-in)
- Create: `apps/web/src/app/dashboard/layout.tsx` (dashboard sub-nav shell)
- Create: `apps/web/src/components/dashboard/sidebar.tsx`

- [ ] **Step 1: Update `app/layout.tsx` top-bar**

Modify `SiteNav`: when `signedIn === true`, hide Pricing/Leaderboard/GitHub from the top nav and replace the "Dashboard" pill with an avatar dropdown menu (Settings / Billing / Sign out).

```tsx
function SiteNav({ signedIn, email }: { signedIn: boolean; email?: string }) {
  return (
    <nav className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
        <Link href={signedIn ? "/dashboard" : "/"} className="flex items-center gap-2.5 text-sm">
          <NavRing size={30} title="pseolint" />
          <span className="font-semibold tracking-tight">pseolint</span>
          <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">v0.2.1</span>
        </Link>
        <div className="flex items-center gap-1 text-sm">
          {signedIn ? (
            <AccountMenu email={email ?? ""} />
          ) : (
            <>
              <Link href="/pricing" className="rounded-[12px] px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground">Pricing</Link>
              <Link href="/leaderboard" className="rounded-[12px] px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground">Leaderboard</Link>
              <a href="https://github.com/ouranos-labs/pseolint" target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="inline-grid h-8 w-8 place-items-center rounded-[12px] text-muted-foreground transition-colors hover:text-foreground">
                <GitHubMark />
              </a>
              <Link href="/signin" className="ml-2 inline-flex h-8 items-center rounded-[18px] bg-primary px-3.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90">Sign in</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
```

Create `AccountMenu` component inline or in a separate file. It's a dropdown with `Settings` → `/dashboard/settings/account`, `Billing` → `/dashboard/settings/billing`, `Sign out` → server action or `/api/auth/sign-out`.

Pass `email` from the root layout:

```ts
const session = await getOptionalSession();
// ...
<SiteNav signedIn={!!session} email={session?.user.email} />
```

Keep marketing links in the `SiteFooter` (already present there for Pricing, Leaderboard, Privacy, Terms).

- [ ] **Step 2: Dashboard sub-nav shell**

Create `apps/web/src/components/dashboard/sidebar.tsx`:

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

type Item = { href: string; label: string };

const PRO_ITEMS: Item[] = [
  { href: "/dashboard", label: "Portfolio" },
  { href: "/dashboard/queue", label: "Queue" },
  { href: "/dashboard/integrations", label: "Integrations" },
  { href: "/dashboard/settings/account", label: "Settings" },
];

const FREE_ITEMS: Item[] = [
  { href: "/dashboard", label: "History" },
  { href: "/dashboard/settings/account", label: "Settings" },
];

export function DashboardSidebar({ plan }: { plan: "free" | "pro" }) {
  const pathname = usePathname();
  const items = plan === "pro" ? PRO_ITEMS : FREE_ITEMS;
  return (
    <aside className="hidden w-56 shrink-0 border-r border-border/60 px-4 py-6 md:block">
      <ul className="flex flex-col gap-1">
        {items.map((it) => {
          const active = pathname === it.href || (it.href !== "/dashboard" && pathname.startsWith(it.href));
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className={cn(
                  "block rounded-[12px] px-3 py-2 text-sm transition-colors",
                  active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
                )}
              >
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
```

Create `apps/web/src/app/dashboard/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getOptionalSession } from "@/lib/session";
import { db } from "@/db";
import { userProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DashboardSidebar } from "@/components/dashboard/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getOptionalSession();
  if (!session) redirect("/signin?next=/dashboard");
  const [profile] = await db
    .select({ plan: userProfiles.plan })
    .from(userProfiles)
    .where(eq(userProfiles.userId, session.user.id))
    .limit(1);
  const plan = (profile?.plan === "pro" ? "pro" : "free") as "free" | "pro";
  return (
    <div className="mx-auto flex max-w-6xl gap-6 px-5">
      <DashboardSidebar plan={plan} />
      <div className="min-w-0 flex-1 py-6">{children}</div>
    </div>
  );
}
```

- [ ] **Step 3: Remove old inline dashboard nav**

Any `/dashboard/*` page that rendered its own nav strip, remove it; the shell now handles it. Existing files to inspect: `/dashboard/page.tsx`, `/dashboard/queue/page.tsx`, `/dashboard/integrations/page.tsx`, `/dashboard/settings/tokens/page.tsx`. Leave their content untouched; strip only duplicated breadcrumb/nav markup.

Also: the `SiteNav` (top-bar) previously rendered Queue/Integrations pills for signed-in users, remove those lines (Step 1 already drops them under the AccountMenu branch).

- [ ] **Step 4: Typecheck + build**

Run: `cd apps/web && bun run typecheck && bun run build`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): two-layer nav, global top-bar + dashboard sidebar"
```

---

## Task 7: Plan resolver + tier-aware dashboard home

**Files:**
- Create: `apps/web/src/lib/plan.ts`
- Modify: `apps/web/src/app/dashboard/page.tsx`
- Create: `apps/web/src/components/dashboard/audit-form.tsx`
- Create: `apps/web/src/components/dashboard/history-list.tsx`
- Create: `apps/web/src/components/dashboard/add-domain-card.tsx`

- [ ] **Step 1: Plan resolver helper**

Create `apps/web/src/lib/plan.ts`:

```ts
import { db } from "@/db";
import { userProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";

export type Plan = "free" | "pro";

export async function getPlan(userId: string): Promise<Plan> {
  const [p] = await db
    .select({ plan: userProfiles.plan, expires: userProfiles.planExpiresAt })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  if (!p) return "free";
  if (p.plan === "pro" && (!p.expires || p.expires > new Date())) return "pro";
  return "free";
}
```

- [ ] **Step 2: Free history list component**

Create `apps/web/src/components/dashboard/history-list.tsx` (server component):

```tsx
import Link from "next/link";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

export async function HistoryList({ userId }: { userId: string }) {
  const rows = await db
    .select({
      slug: audits.slug, sourceUrl: audits.sourceUrl, score: audits.score,
      findingCount: audits.findingCount, completedAt: audits.completedAt, status: audits.status,
    })
    .from(audits)
    .where(eq(audits.userId, userId))
    .orderBy(desc(audits.createdAt))
    .limit(30);

  if (!rows.length) {
    return (
      <div className="rounded-[22px] border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
        No audits yet, run your first one above.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border/60 rounded-[22px] border border-border/60">
      {rows.map((r) => (
        <li key={r.slug} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
          <div className="min-w-0 flex-1">
            <div className="truncate text-foreground">{r.sourceUrl}</div>
            <div className="font-mono text-[11px] text-muted-foreground">
              {r.status === "completed" && r.completedAt ? new Date(r.completedAt).toISOString().slice(0, 16).replace("T", " ") : r.status}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono tabular-nums text-foreground">{r.score ?? "; "}</span>
            <span className="text-xs text-muted-foreground">{r.findingCount ?? 0} findings</span>
            <Link href={`/r/${r.slug}`} className="rounded-[12px] bg-secondary px-3 py-1 text-xs hover:bg-secondary/80">View</Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Inline audit form (shared by `/` and free dashboard)**

Create `apps/web/src/components/dashboard/audit-form.tsx` (client component) that wraps the existing audit submission logic. If there's already a component used on `/`, export it from its current location and re-use; otherwise extract:

```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AuditForm({ defaultUrl }: { defaultUrl?: string }) {
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/audits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? `Failed (${res.status})`);
      setLoading(false);
      return;
    }
    const { slug } = await res.json();
    window.location.assign(`/r/${slug}`);
  }

  return (
    <form onSubmit={submit} className="flex w-full gap-2">
      <Input type="url" required placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} className="flex-1" />
      <Button type="submit" disabled={loading || !url}>{loading ? "Starting…" : "Run audit"}</Button>
      {error && <span className="ml-3 text-xs text-destructive">{error}</span>}
    </form>
  );
}
```

(Adjust the response shape depending on what `POST /api/audits` currently returns, it may return `{ id }` or `{ slug }`. Ensure it returns `slug` after Task 2.)

- [ ] **Step 4: Add-domain card (Pro empty state + header button target)**

Create `apps/web/src/components/dashboard/add-domain-card.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addDomainAction } from "@/app/dashboard/actions";

export function AddDomainCard({ variant = "hero" }: { variant?: "hero" | "compact" }) {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await addDomainAction(url);
      if (!res.ok) { setErr(res.error); return; }
      router.push(`/dashboard/${res.slug}?welcome=1`);
    });
  }

  if (variant === "compact") {
    return (
      <form onSubmit={submit} className="flex gap-2">
        <Input type="url" required placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} className="w-64" />
        <Button type="submit" disabled={pending || !url}>{pending ? "Adding…" : "+ Add domain"}</Button>
        {err && <span className="ml-2 self-center text-xs text-destructive">{err}</span>}
      </form>
    );
  }

  return (
    <section className="rounded-[28px] border border-border/70 bg-card/40 p-8 text-center backdrop-blur-sm">
      <h2 className="text-xl font-medium text-foreground">Add your first domain</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        We'll run a full audit immediately, then check daily for changes.
      </p>
      <form onSubmit={submit} className="mx-auto mt-6 flex max-w-xl gap-2">
        <Input type="url" required placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} className="flex-1" />
        <Button type="submit" disabled={pending || !url}>{pending ? "Starting audit…" : "Start monitoring →"}</Button>
      </form>
      {err && <p className="mt-3 text-xs text-destructive">{err}</p>}
    </section>
  );
}
```

- [ ] **Step 5: Tier-aware dashboard page**

Rewrite `apps/web/src/app/dashboard/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getOptionalSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { AuditForm } from "@/components/dashboard/audit-form";
import { HistoryList } from "@/components/dashboard/history-list";
import { AddDomainCard } from "@/components/dashboard/add-domain-card";
import { PortfolioStrip } from "@/components/dashboard/portfolio-strip";

export default async function DashboardHome() {
  const session = await getOptionalSession();
  if (!session) redirect("/signin?next=/dashboard");
  const plan = await getPlan(session.user.id);

  if (plan === "free") {
    return (
      <div className="flex flex-col gap-8">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-medium text-foreground">Your audits</h1>
          <a href="/pricing" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
            Upgrade to monitoring →
          </a>
        </div>
        <section className="rounded-[22px] border border-border/60 bg-card/40 p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Run a new audit</h2>
          <AuditForm />
        </section>
        <HistoryList userId={session.user.id} />
      </div>
    );
  }

  return <ProDashboard userId={session.user.id} />;
}

async function ProDashboard({ userId }: { userId: string }) {
  // Delegate to existing portfolio-strip component; add empty-state branch.
  // The PortfolioStrip component should accept `userId` and render either
  // the existing portfolio table (if rows > 0) or <AddDomainCard variant="hero" />.
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium text-foreground">Portfolio</h1>
        <AddDomainCard variant="compact" />
      </div>
      <PortfolioStrip userId={userId} />
    </div>
  );
}
```

Update / ensure `PortfolioStrip` (already exists from prior work under `/components/dashboard/` or inlined in `page.tsx`) handles the empty state by rendering `<AddDomainCard variant="hero" />`.

- [ ] **Step 6: Typecheck + build**

Run: `cd apps/web && bun run typecheck && bun run build`
Expected: both pass (the `addDomainAction` reference will break, expected; Task 8 adds it).

Actually the build will fail until Task 8 lands. Mark a `// @ts-expect-error, addDomainAction added in Task 8` where imported, or skip this step's verification and defer to Task 8's build gate.

- [ ] **Step 7: Commit (allow-failing verify)**

```bash
git add apps/web
git commit -m "feat(web): tier-aware dashboard home, history for free, portfolio for Pro"
```

---

## Task 8: Add-domain server action + remove-domain action

**Files:**
- Create: `apps/web/src/app/dashboard/actions.ts`
- Modify: `apps/web/src/inngest/functions/monitor-domains.ts` (respect `removedAt` soft-delete)

- [ ] **Step 1: Action shell**

Create `apps/web/src/app/dashboard/actions.ts`:

```ts
"use server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { monitoredDomains, audits } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { publicSlug } from "@/lib/slug";
import { assertSafeUrl } from "@/lib/ssrf";
import { inngest } from "@/lib/inngest";

function originOf(rawUrl: string): { host: string; origin: string } {
  const u = new URL(rawUrl);
  return { host: u.host, origin: `${u.protocol}//${u.host}` };
}

export async function addDomainAction(
  rawUrl: string,
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  let session;
  try { session = await requireSession(); } catch { return { ok: false, error: "not signed in" }; }

  try {
    await assertSafeUrl(rawUrl);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "invalid URL" };
  }

  const { host, origin } = originOf(rawUrl);

  const [existing] = await db
    .select({ slug: monitoredDomains.slug, removedAt: monitoredDomains.removedAt })
    .from(monitoredDomains)
    .where(and(eq(monitoredDomains.userId, session.user.id), eq(monitoredDomains.host, host)))
    .limit(1);

  let slug: string;
  if (existing) {
    if (existing.removedAt) {
      await db.update(monitoredDomains)
        .set({ removedAt: null, sourceUrl: origin })
        .where(and(eq(monitoredDomains.userId, session.user.id), eq(monitoredDomains.host, host)));
    }
    slug = existing.slug;
  } else {
    slug = publicSlug();
    await db.insert(monitoredDomains).values({
      slug, userId: session.user.id, sourceUrl: origin, host,
      cadence: "daily", nextRunAt: new Date(),
    });
  }

  const auditSlug = publicSlug();
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  const [audit] = await db.insert(audits).values({
    slug: auditSlug, userId: session.user.id, sourceUrl: origin,
    status: "queued", expiresAt, isPublic: false,
  }).returning({ id: audits.id });

  await inngest.send({
    name: "audit/requested",
    data: { auditId: audit.id, url: origin, plan: "pro", sampleSize: 500, mode: "full" },
  });

  return { ok: true, slug };
}

export async function removeDomainAction(domainSlug: string): Promise<{ ok: true } | { ok: false; error: string }> {
  let session;
  try { session = await requireSession(); } catch { return { ok: false, error: "not signed in" }; }

  const res = await db.update(monitoredDomains)
    .set({ removedAt: new Date() })
    .where(and(
      eq(monitoredDomains.slug, domainSlug),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    ))
    .returning({ id: monitoredDomains.id });

  if (!res.length) return { ok: false, error: "not found" };
  return { ok: true };
}

export async function reAuditNowAction(domainSlug: string): Promise<{ ok: true; auditSlug: string } | { ok: false; error: string }> {
  let session;
  try { session = await requireSession(); } catch { return { ok: false, error: "not signed in" }; }

  const [dom] = await db.select({ id: monitoredDomains.id, sourceUrl: monitoredDomains.sourceUrl })
    .from(monitoredDomains)
    .where(and(
      eq(monitoredDomains.slug, domainSlug),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    )).limit(1);
  if (!dom) return { ok: false, error: "not found" };

  const auditSlug = publicSlug();
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  const [audit] = await db.insert(audits).values({
    slug: auditSlug, userId: session.user.id, sourceUrl: dom.sourceUrl,
    status: "queued", expiresAt, isPublic: false,
  }).returning({ id: audits.id });

  await inngest.send({
    name: "audit/requested",
    data: { auditId: audit.id, url: dom.sourceUrl, plan: "pro", sampleSize: 500, mode: "full" },
  });

  return { ok: true, auditSlug };
}
```

- [ ] **Step 2: Honor `removedAt` in the monitoring cron**

Modify `apps/web/src/inngest/functions/monitor-domains.ts`, in the domain-selection query, add `and(isNull(monitoredDomains.removedAt), ...)` to every `where(...)` that fetches domains for scheduling. Locate every `db.select().from(monitoredDomains)` or `db.update(monitoredDomains)` and make sure removed rows are excluded.

- [ ] **Step 3: Typecheck + build**

Run: `cd apps/web && bun run typecheck && bun run build`
Expected: both pass.

- [ ] **Step 4: Test add-domain**

Create `apps/web/tests/integration/add-domain.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/db";
import { users, monitoredDomains } from "@/db/schema";
import { addDomainAction } from "@/app/dashboard/actions";
import { eq } from "drizzle-orm";

// TODO: this requires mocking requireSession(). Skip if no session mock available in harness;
// the core logic (dedup + reactivate soft-deleted) is exercised here via a helper export.

describe.skip("addDomainAction (requires session mock)", () => {
  it("creates a new monitored domain with a slug", async () => { /* ... */ });
  it("reactivates a soft-deleted domain", async () => { /* ... */ });
});
```

(Action tests that require session mocking are deferred; the logic is simple enough that manual test via UI is acceptable for v1.1.)

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add/remove/re-audit domain server actions; respect soft-delete in cron"
```

---

## Task 9: Report page `/r/:slug`: context-aware CTA strip

**Files:**
- Modify: `apps/web/src/app/r/[slug]/page.tsx`
- Create: `apps/web/src/components/report/cta-strip.tsx`

- [ ] **Step 1: CTA strip component**

Create `apps/web/src/components/report/cta-strip.tsx`:

```tsx
import Link from "next/link";

type Ctx =
  | { kind: "anon"; auditSlug: string; domain: string }
  | { kind: "free_own"; auditSlug: string; domain: string }
  | { kind: "free_other"; auditSlug: string; domain: string }
  | { kind: "pro_own_monitored"; auditSlug: string; domain: string; domainSlug: string }
  | { kind: "pro_own_unmonitored"; auditSlug: string; domain: string }
  | { kind: "pro_other"; auditSlug: string; domain: string };

export function ReportCtaStrip(ctx: Ctx) {
  const base = "rounded-[18px] border border-border/70 bg-card/40 p-4 backdrop-blur-sm";
  const primary = "inline-flex h-9 items-center rounded-[14px] bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90";
  const secondary = "inline-flex h-9 items-center rounded-[14px] border border-border-strong px-4 text-xs font-medium text-foreground hover:bg-secondary";

  switch (ctx.kind) {
    case "anon":
      return (
        <div className={`${base} flex items-center justify-between gap-3`}>
          <p className="text-xs text-muted-foreground">
            Save this audit to your history, <Link href={`/signin?next=/r/${ctx.auditSlug}`} className="text-foreground underline-offset-4 hover:underline">sign in</Link>.
          </p>
          <Link href={`/pricing?intent=monitor&audit=${ctx.auditSlug}`} className={primary}>
            Monitor this domain with Pro →
          </Link>
        </div>
      );
    case "free_own":
    case "free_other":
      return (
        <div className={`${base} flex items-center justify-between gap-3`}>
          <p className="text-xs text-muted-foreground">
            {ctx.kind === "free_own" ? "Saved to your history." : "Want to track this yourself? Run it from your dashboard."}
          </p>
          <Link href={`/pricing?intent=monitor&audit=${ctx.auditSlug}`} className={primary}>
            Monitor this domain →
          </Link>
        </div>
      );
    case "pro_own_monitored":
      return (
        <div className={`${base} flex items-center justify-between gap-3 border-primary/30 bg-primary/5`}>
          <p className="text-xs text-foreground">Already in your portfolio.</p>
          <Link href={`/dashboard/${ctx.domainSlug}`} className={primary}>Open in dashboard →</Link>
        </div>
      );
    case "pro_own_unmonitored":
      return (
        <div className={`${base} flex items-center justify-between gap-3`}>
          <p className="text-xs text-muted-foreground">Not currently monitored.</p>
          <AddToMonitoringButton domain={ctx.domain} className={primary} />
        </div>
      );
    case "pro_other":
      return (
        <div className={`${base} flex items-center justify-between gap-3`}>
          <p className="text-xs text-muted-foreground">Shared report, not one of your monitored domains.</p>
          <AddToMonitoringButton domain={ctx.domain} className={secondary} />
        </div>
      );
  }
}

"use client";
function AddToMonitoringButton({ domain, className }: { domain: string; className: string }) {
  // Client island, calls addDomainAction with the audit's origin, routes to /dashboard/:slug on success.
  // Implementation mirrors AddDomainCard (variant="compact") logic, but pre-filled + single-click.
  return (
    <form
      action={async () => {
        "use server";
        const { addDomainAction } = await import("@/app/dashboard/actions");
        return addDomainAction(domain);
      }}
    >
      <button type="submit" className={className}>+ Add to monitoring</button>
    </form>
  );
}
```

Note: the `AddToMonitoringButton` with server-action import inside `action={...}` is a bit unusual, it's cleaner to extract the button into a separate client component that calls the server action via `useTransition`. See the `AddDomainCard` shape (Task 7, Step 4) for the pattern.

- [ ] **Step 2: Resolve context on the server + render**

In `apps/web/src/app/r/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/db";
import { audits, monitoredDomains } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { ReportCtaStrip } from "@/components/report/cta-strip";

export default async function ReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [audit] = await db.select().from(audits).where(eq(audits.slug, slug)).limit(1);
  if (!audit) notFound();

  const domain = new URL(audit.sourceUrl).host;
  const session = await getOptionalSession();

  let ctxKind:
    | "anon" | "free_own" | "free_other"
    | "pro_own_monitored" | "pro_own_unmonitored" | "pro_other";
  let domainSlug: string | undefined;

  if (!session) {
    ctxKind = "anon";
  } else {
    const plan = await getPlan(session.user.id);
    const isOwn = audit.userId === session.user.id;
    if (plan === "free") {
      ctxKind = isOwn ? "free_own" : "free_other";
    } else {
      if (!isOwn) {
        ctxKind = "pro_other";
      } else {
        const [dom] = await db
          .select({ slug: monitoredDomains.slug })
          .from(monitoredDomains)
          .where(and(
            eq(monitoredDomains.userId, session.user.id),
            eq(monitoredDomains.host, domain),
            isNull(monitoredDomains.removedAt),
          ))
          .limit(1);
        if (dom) {
          ctxKind = "pro_own_monitored";
          domainSlug = dom.slug;
        } else {
          ctxKind = "pro_own_unmonitored";
        }
      }
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <div className="mb-6">
        <ReportCtaStrip {...({ kind: ctxKind, auditSlug: slug, domain: audit.sourceUrl, domainSlug } as Parameters<typeof ReportCtaStrip>[0])} />
      </div>
      {/* existing report body render, iframe or HTML injection */}
    </main>
  );
}
```

The existing report body rendering (iframe of R2-hosted HTML, or polling state for in-progress audits) stays unchanged, this task only adds the top CTA strip.

- [ ] **Step 3: Build**

Run: `cd apps/web && bun run typecheck && bun run build`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): context-aware CTA strip on /r/:slug, tier × ownership × monitoring state"
```

---

## Task 10: Intent-preserving checkout

**Files:**
- Modify: `apps/web/src/app/pricing/page.tsx` (read `?intent=monitor&audit=…`, forward to checkout)
- Modify: `apps/web/src/app/api/checkout/route.ts` (accept + forward intent + auditSlug as metadata)
- Modify: `apps/web/src/lib/polar.ts` (pass metadata to checkout creation)
- Modify: `apps/web/src/app/api/webhooks/polar/route.ts` (read metadata on subscription.created; if intent=monitor, bind domain + trigger initial audit)

- [ ] **Step 1: Pricing page forwards query**

In `apps/web/src/app/pricing/page.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
// ...existing imports

type Interval = "monthly" | "yearly";

export default function Pricing() {
  const [loading, setLoading] = useState<Interval | null>(null);
  const search = useSearchParams();
  const intent = search.get("intent");     // "monitor" | null
  const auditSlug = search.get("audit");   // slug | null

  const go = async (interval: Interval) => {
    setLoading(interval);
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interval, intent, auditSlug }),
    });
    // ...rest unchanged
  };
  // ...rest of page unchanged; optionally show a subtle "Monitoring this.audit's domain after checkout" banner if intent=monitor
}
```

- [ ] **Step 2: Checkout route accepts intent**

In `apps/web/src/app/api/checkout/route.ts`:

```ts
const Body = z.object({
  interval: z.enum(["monthly", "yearly"]),
  intent: z.enum(["monitor"]).optional(),
  auditSlug: z.string().min(8).max(32).optional(),
});
// ...
const { url } = await createCheckoutSession({
  productId,
  customerEmail: session.user.email,
  successUrl: `${env().BETTER_AUTH_URL}/dashboard?welcome=1`,
  metadata: {
    intent: body.data.intent ?? "",
    auditSlug: body.data.auditSlug ?? "",
    userId: session.user.id,       // needed on webhook to match subscription to user
  },
});
```

- [ ] **Step 3: Polar helper accepts metadata**

In `apps/web/src/lib/polar.ts`, update `createCheckoutSession` signature + body:

```ts
export async function createCheckoutSession(opts: {
  productId: string;
  customerEmail: string;
  successUrl: string;
  metadata?: Record<string, string>;
}): Promise<{ url: string }> {
  const res = await polar.checkouts.create({
    productId: opts.productId,
    customerEmail: opts.customerEmail,
    successUrl: opts.successUrl,
    metadata: opts.metadata,    // NEW, Polar checkout API accepts a metadata map
  });
  return { url: res.url };
}
```

Verify by running: `grep -rn "createCheckoutSession" apps/web/src`, only one caller (the checkout route), already updated.

- [ ] **Step 4: Webhook reads metadata on new subscription**

In `apps/web/src/app/api/webhooks/polar/route.ts`, after the existing `subscription.created | subscription.updated` plan update:

```ts
if (event.type === "subscription.created") {
  const md = event.data.metadata ?? {};
  if (md.intent === "monitor" && md.auditSlug && md.userId) {
    try {
      const { addDomainAction } = await import("@/app/dashboard/actions");
      const [audit] = await db.select({ sourceUrl: audits.sourceUrl, userId: audits.userId })
        .from(audits).where(eq(audits.slug, md.auditSlug)).limit(1);
      if (audit && audit.userId === md.userId) {
        // Impersonation-safe: addDomainAction calls requireSession(), but we're in a webhook.
        // Call the underlying DB+inngest logic directly via a dedicated helper:
        await ensureMonitoredDomainForUser(md.userId, audit.sourceUrl);
      }
    } catch (e) {
      console.error("[webhook] monitor-intent binding failed:", e);
      // Don't fail the webhook; the user can add the domain manually from dashboard.
    }
  }
}
```

Add `ensureMonitoredDomainForUser` helper to `apps/web/src/app/dashboard/actions.ts` (or a new `lib/monitoring.ts` since actions.ts is server-only):

```ts
// apps/web/src/lib/monitoring.ts
"use server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { monitoredDomains, audits } from "@/db/schema";
import { publicSlug } from "@/lib/slug";
import { inngest } from "@/lib/inngest";

export async function ensureMonitoredDomainForUser(userId: string, rawUrl: string) {
  const u = new URL(rawUrl);
  const host = u.host;
  const origin = `${u.protocol}//${u.host}`;

  const [existing] = await db.select({ id: monitoredDomains.id })
    .from(monitoredDomains)
    .where(and(eq(monitoredDomains.userId, userId), eq(monitoredDomains.host, host)))
    .limit(1);

  if (existing) {
    await db.update(monitoredDomains).set({ removedAt: null })
      .where(eq(monitoredDomains.id, existing.id));
    return;
  }

  await db.insert(monitoredDomains).values({
    slug: publicSlug(), userId, sourceUrl: origin, host,
    cadence: "daily", nextRunAt: new Date(),
  });

  const auditSlug = publicSlug();
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  const [audit] = await db.insert(audits).values({
    slug: auditSlug, userId, sourceUrl: origin,
    status: "queued", expiresAt, isPublic: false,
  }).returning({ id: audits.id });

  await inngest.send({
    name: "audit/requested",
    data: { auditId: audit.id, url: origin, plan: "pro", sampleSize: 500, mode: "full" },
  });
}
```

Then the webhook calls `ensureMonitoredDomainForUser(md.userId, audit.sourceUrl)`.

- [ ] **Step 5: Build + commit**

Run: `cd apps/web && bun run typecheck && bun run build`
Expected: both pass.

```bash
git add apps/web
git commit -m "feat(web): intent-preserving checkout, bind domain + trigger audit on subscription.created"
```

---

## Task 11: Per-domain workspace `/dashboard/:slug`: header + timeline + findings

**Files:**
- Create: `apps/web/src/app/dashboard/[slug]/page.tsx`
- Create: `apps/web/src/components/dashboard/workspace-header.tsx`
- Create: `apps/web/src/components/dashboard/timeline-strip.tsx`
- Create: `apps/web/src/components/dashboard/findings-panel.tsx`

- [ ] **Step 1: Page + ownership check**

Create `apps/web/src/app/dashboard/[slug]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/db";
import { monitoredDomains, audits, findingsState } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { WorkspaceHeader } from "@/components/dashboard/workspace-header";
import { TimelineStrip } from "@/components/dashboard/timeline-strip";
import { FindingsPanel } from "@/components/dashboard/findings-panel";

export default async function DomainWorkspace({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getOptionalSession();
  if (!session) redirect("/signin");
  const plan = await getPlan(session.user.id);
  if (plan !== "pro") redirect("/pricing");

  const { slug } = await params;
  const [domain] = await db.select().from(monitoredDomains)
    .where(and(
      eq(monitoredDomains.slug, slug),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    )).limit(1);
  if (!domain) notFound();

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const [timelineRuns, openFindings] = await Promise.all([
    db.select({
      slug: audits.slug, score: audits.score, status: audits.status,
      completedAt: audits.completedAt, findingCount: audits.findingCount,
    }).from(audits)
      .where(and(
        eq(audits.userId, session.user.id),
        eq(audits.sourceUrl, domain.sourceUrl),
        gte(audits.createdAt, since),
      ))
      .orderBy(desc(audits.createdAt))
      .limit(60),
    db.select().from(findingsState)
      .where(and(
        eq(findingsState.domainId, domain.id),
        eq(findingsState.status, "open"),
      ))
      .orderBy(desc(findingsState.rankScore))
      .limit(200),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <WorkspaceHeader domain={domain} runs={timelineRuns} />
      <TimelineStrip runs={timelineRuns} />
      <FindingsPanel domainId={domain.id} findings={openFindings} />
    </div>
  );
}
```

- [ ] **Step 2: Header component**

Create `apps/web/src/components/dashboard/workspace-header.tsx`:

```tsx
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { reAuditNowAction, removeDomainAction } from "@/app/dashboard/actions";

type Run = { slug: string; score: number | null; completedAt: Date | null };

export function WorkspaceHeader({ domain, runs }: { domain: { slug: string; host: string; sourceUrl: string; lastScore: number | null }; runs: Run[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const completed = runs.filter((r) => r.score != null);
  const prev = completed[1]?.score ?? null;
  const current = domain.lastScore ?? completed[0]?.score ?? null;
  const delta = current != null && prev != null ? current - prev : null;

  function reaudit() {
    start(async () => {
      const res = await reAuditNowAction(domain.slug);
      if (!res.ok) { alert(res.error); return; }
      router.refresh();
    });
  }
  function remove() {
    if (!confirm(`Stop monitoring ${domain.host}? History is preserved.`)) return;
    start(async () => {
      const res = await removeDomainAction(domain.slug);
      if (!res.ok) { alert(res.error); return; }
      router.push("/dashboard");
    });
  }

  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border/60 pb-5">
      <div>
        <nav className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <a href="/dashboard" className="hover:text-foreground">Portfolio</a>
          <span>/</span>
          <span className="text-foreground">{domain.host}</span>
        </nav>
        <h1 className="text-2xl font-medium text-foreground">{domain.host}</h1>
        <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
          <span className="tabular-nums text-3xl font-mono text-foreground">{current ?? "; "}</span>
          {delta != null && (
            <span className={delta >= 0 ? "text-primary" : "text-destructive"}>
              {delta >= 0 ? "+" : ""}{delta}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={reaudit} disabled={pending}>{pending ? "Starting…" : "Re-audit now"}</Button>
        <a href={`/dashboard/${domain.slug}/settings`} className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm hover:bg-secondary">Settings</a>
        <button onClick={remove} disabled={pending} className="inline-flex h-10 items-center rounded-[14px] border border-destructive/50 px-4 text-sm text-destructive hover:bg-destructive/10">Remove</button>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Timeline strip**

Create `apps/web/src/components/dashboard/timeline-strip.tsx`:

```tsx
import Link from "next/link";

type Run = {
  slug: string; score: number | null; status: "queued" | "running" | "completed" | "failed" | "expired";
  completedAt: Date | null;
};

export function TimelineStrip({ runs }: { runs: Run[] }) {
  if (!runs.length) {
    return <p className="text-xs text-muted-foreground">No runs yet, the initial audit is queued.</p>;
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Last 30 days</h2>
      <ol className="flex flex-wrap gap-1.5">
        {runs.map((r, idx) => {
          const prevScore = runs[idx + 1]?.score ?? null;
          const delta = r.score != null && prevScore != null ? r.score - prevScore : null;
          const hue = delta == null ? "bg-muted" : delta >= 0 ? "bg-primary/70" : "bg-destructive/70";
          const title = `${r.status === "completed" ? `Score ${r.score}` : r.status}${delta != null ? ` (${delta >= 0 ? "+" : ""}${delta})` : ""}${r.completedAt ? ` · ${new Date(r.completedAt).toLocaleString()}` : ""}`;
          return (
            <li key={r.slug}>
              <Link href={`/r/${r.slug}`} title={title} className={`block h-6 w-3 rounded-sm ${hue} opacity-80 hover:opacity-100`} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}
```

- [ ] **Step 4: Findings panel (reuse existing snooze/dismiss logic from queue)**

Create `apps/web/src/components/dashboard/findings-panel.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { snoozeFindingAction, dismissFindingAction } from "@/app/dashboard/queue/actions";

type Finding = {
  id: string;
  ruleId: string;
  severityLatest: "info" | "warning" | "error" | "critical";
  affectedPageCount: number;
  rankScore: string;
  ruleMessageLatest: string;
  representativeUrl: string | null;
  status: "open" | "snoozed" | "dismissed";
};

const SEV_ORDER = ["critical", "error", "warning", "info"] as const;

export function FindingsPanel({ findings }: { domainId: string; findings: Finding[] }) {
  const [showSuppressed, setShowSuppressed] = useState(false);
  const groups = SEV_ORDER.map((s) => ({ sev: s, rows: findings.filter((f) => f.severityLatest === s && (showSuppressed || f.status === "open")) }));

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Open findings</h2>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={showSuppressed} onChange={(e) => setShowSuppressed(e.target.checked)} />
          Show suppressed
        </label>
      </div>
      {groups.map((g) => g.rows.length > 0 && (
        <div key={g.sev} className="mb-5">
          <h3 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">{g.sev}</h3>
          <ul className="divide-y divide-border/60 rounded-[22px] border border-border/60">
            {g.rows.map((f) => <FindingRow key={f.id} f={f} />)}
          </ul>
        </div>
      ))}
      {groups.every((g) => !g.rows.length) && (
        <p className="text-sm text-muted-foreground">No open findings. Nice.</p>
      )}
    </section>
  );
}

function FindingRow({ f }: { f: Finding }) {
  const [pending, start] = useTransition();
  return (
    <li className="flex items-start gap-3 px-5 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <code className="font-mono text-xs text-muted-foreground">{f.ruleId}</code>
          <span className="text-xs text-muted-foreground">· {f.affectedPageCount} pages · rank {Number(f.rankScore).toFixed(0)}</span>
        </div>
        <p className="mt-1 text-foreground">{f.ruleMessageLatest}</p>
        {f.representativeUrl && <p className="mt-1 truncate text-xs text-muted-foreground">{f.representativeUrl}</p>}
      </div>
      <div className="flex items-center gap-1">
        <button disabled={pending} onClick={() => start(() => snoozeFindingAction(f.id))} className="rounded-[10px] px-2 py-1 text-xs text-muted-foreground hover:bg-secondary">Snooze 7d</button>
        <button disabled={pending} onClick={() => start(() => dismissFindingAction(f.id))} className="rounded-[10px] px-2 py-1 text-xs text-muted-foreground hover:bg-secondary">Dismiss</button>
      </div>
    </li>
  );
}
```

Verify `snoozeFindingAction` / `dismissFindingAction` already exist from the prior reframe (they were in `/dashboard/queue/actions.ts` per completed Task 14). If they don't take an `id` param, adjust accordingly.

- [ ] **Step 5: Build**

Run: `cd apps/web && bun run typecheck && bun run build`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): per-domain workspace, header, timeline strip, findings panel"
```

---

## Task 12: Per-domain settings `/dashboard/:slug/settings`

**Files:**
- Create: `apps/web/src/app/dashboard/[slug]/settings/page.tsx`
- Create: `apps/web/src/app/dashboard/[slug]/settings/actions.ts`

- [ ] **Step 1: Page with alert threshold + GSC binding**

Create `apps/web/src/app/dashboard/[slug]/settings/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { monitoredDomains, integrations } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { updateDomainSettingsAction } from "./actions";

export default async function DomainSettings({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getOptionalSession();
  if (!session) redirect("/signin");
  if ((await getPlan(session.user.id)) !== "pro") redirect("/pricing");

  const { slug } = await params;
  const [domain] = await db.select().from(monitoredDomains)
    .where(and(
      eq(monitoredDomains.slug, slug),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    )).limit(1);
  if (!domain) notFound();

  const gscConns = await db.select().from(integrations)
    .where(and(eq(integrations.userId, session.user.id), eq(integrations.kind, "gsc")));

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex items-center gap-2 text-xs text-muted-foreground">
        <a href="/dashboard" className="hover:text-foreground">Portfolio</a>
        <span>/</span>
        <a href={`/dashboard/${domain.slug}`} className="hover:text-foreground">{domain.host}</a>
        <span>/</span>
        <span className="text-foreground">Settings</span>
      </nav>
      <h1 className="text-xl font-medium">Settings, {domain.host}</h1>

      <form action={updateDomainSettingsAction} className="flex flex-col gap-5 rounded-[22px] border border-border/60 p-5">
        <input type="hidden" name="domainSlug" value={domain.slug} />

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Cadence</span>
          <span className="text-xs text-muted-foreground">Daily diff-audit · Weekly full re-audit</span>
          <span className="text-[11px] text-muted-foreground">(editable in a future release)</span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Alert threshold</span>
          <span className="text-xs text-muted-foreground">Score drop that triggers an email. Leave blank to inherit account default (10).</span>
          <input name="alertThreshold" type="number" min={1} defaultValue={domain.alertThreshold} className="mt-1 w-32 rounded-[10px] border border-border-strong bg-background px-3 py-2 text-sm" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Alert email override</span>
          <span className="text-xs text-muted-foreground">Leave blank to use your account default.</span>
          <input name="alertEmail" type="email" defaultValue={domain.alertEmail ?? ""} className="mt-1 rounded-[10px] border border-border-strong bg-background px-3 py-2 text-sm" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">GSC property</span>
          <span className="text-xs text-muted-foreground">Bind a Search Console property to rank findings by traffic.</span>
          <select name="gscIntegrationId" defaultValue="" className="mt-1 rounded-[10px] border border-border-strong bg-background px-3 py-2 text-sm">
            <option value=""> (none) </option>
            {gscConns.map((c) => <option key={c.id} value={c.id}>GSC ({c.scope ?? c.id.slice(0, 8)})</option>)}
          </select>
        </label>

        <button type="submit" className="inline-flex h-10 w-fit items-center rounded-[14px] bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Save</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Action with ownership check**

Create `apps/web/src/app/dashboard/[slug]/settings/actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { monitoredDomains } from "@/db/schema";
import { requireSession } from "@/lib/session";

export async function updateDomainSettingsAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const slug = String(formData.get("domainSlug") ?? "");
  if (!slug) throw new Error("missing domain slug");

  const alertThreshold = Number(formData.get("alertThreshold") ?? 10);
  const alertEmailRaw = String(formData.get("alertEmail") ?? "").trim();
  const alertEmail = alertEmailRaw.length ? alertEmailRaw : null;
  // gscIntegrationId binding: out of scope for v1.1 storage, defer to a follow-up once the
  // `monitoredDomains.gscIntegrationId` column is added (flagged in spec §14).

  await db.update(monitoredDomains).set({ alertThreshold, alertEmail })
    .where(and(
      eq(monitoredDomains.slug, slug),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    ));

  revalidatePath(`/dashboard/${slug}/settings`);
}
```

- [ ] **Step 3: Build + commit**

Run: `cd apps/web && bun run typecheck && bun run build`
Expected: both pass.

```bash
git add apps/web
git commit -m "feat(web): per-domain settings page, alert threshold, alert email, GSC binding stub"
```

---

## Task 13: Queue domain filter + deep-link

**Files:**
- Modify: `apps/web/src/app/dashboard/queue/page.tsx`

- [ ] **Step 1: Read `?filter=domain=:slug&since=:auditSlug` query**

In `apps/web/src/app/dashboard/queue/page.tsx`, accept `searchParams`:

```tsx
export default async function QueuePage({ searchParams }: { searchParams: Promise<{ filter?: string; since?: string; page?: string }> }) {
  const sp = await searchParams;
  const domainFilterSlug = parseDomainFilter(sp.filter);  // helper below
  // ...
}

function parseDomainFilter(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/^domain=(.+)$/);
  return m ? m[1] : null;
}
```

In the findings-state query, if `domainFilterSlug` set, resolve it to a `domainId` and `and(eq(findingsState.domainId, domainId), ...)`.

- [ ] **Step 2: Add a filter chip to the UI**

Above the queue list, render a chip when filtered:

```tsx
{domainFilterSlug && (
  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1 text-xs">
    <span className="text-muted-foreground">Filtered to</span>
    <span className="font-mono text-foreground">{domainFilterSlug}</span>
    <a href="/dashboard/queue" className="text-muted-foreground hover:text-foreground">×</a>
  </div>
)}
```

- [ ] **Step 3: Build + commit**

Run: `cd apps/web && bun run typecheck && bun run build`
Expected: both pass.

```bash
git add apps/web
git commit -m "feat(web): queue domain filter + deep-link support"
```

---

## Task 14: Account / billing / alerts settings pages

**Files:**
- Create: `apps/web/src/app/dashboard/settings/account/page.tsx`
- Create: `apps/web/src/app/dashboard/settings/billing/page.tsx`
- Create: `apps/web/src/app/dashboard/settings/alerts/page.tsx`
- Create: `apps/web/src/app/dashboard/settings/actions.ts` (shared)
- Modify: existing `apps/web/src/app/dashboard/settings/tokens/page.tsx` (unchanged content; confirm path still resolves under new nav)

- [ ] **Step 1: Account page**

Create `apps/web/src/app/dashboard/settings/account/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getOptionalSession } from "@/lib/session";
import { deleteAccountAction } from "../actions";

export default async function AccountSettings() {
  const session = await getOptionalSession();
  if (!session) redirect("/signin");
  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <h1 className="text-xl font-medium">Account</h1>
      <div className="rounded-[22px] border border-border/60 p-5">
        <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="text-foreground">{session.user.email}</dd>
          <dt className="text-muted-foreground">Signed in</dt>
          <dd className="font-mono text-xs text-foreground">{session.session.id.slice(0, 8)}…</dd>
        </dl>
      </div>
      <div className="rounded-[22px] border border-destructive/40 p-5">
        <h2 className="text-sm font-medium text-destructive">Delete account</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Permanently deletes your account, all audits, monitored domains, and history.
          Billing is canceled on next period boundary.
        </p>
        <form action={deleteAccountAction} className="mt-4">
          <input name="confirm" placeholder="Type DELETE" className="rounded-[10px] border border-destructive/50 bg-background px-3 py-2 text-sm" />
          <button type="submit" className="ml-2 inline-flex h-9 items-center rounded-[14px] bg-destructive px-3 text-xs font-medium text-destructive-foreground">Delete account</button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Billing page**

Create `apps/web/src/app/dashboard/settings/billing/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getOptionalSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { db } from "@/db";
import { userProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { env } from "@/lib/env";

export default async function BillingSettings() {
  const session = await getOptionalSession();
  if (!session) redirect("/signin");
  const plan = await getPlan(session.user.id);
  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, session.user.id)).limit(1);

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <h1 className="text-xl font-medium">Billing</h1>
      <div className="rounded-[22px] border border-border/60 p-5">
        <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">Plan</dt>
          <dd className="font-medium text-foreground capitalize">{plan}</dd>
          {profile?.planExpiresAt && (
            <>
              <dt className="text-muted-foreground">{plan === "pro" ? "Renews" : "Expires"}</dt>
              <dd className="text-foreground">{new Date(profile.planExpiresAt).toLocaleDateString()}</dd>
            </>
          )}
        </dl>
        {plan === "free" ? (
          <a href="/pricing" className="mt-4 inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Upgrade to Pro →</a>
        ) : (
          <a href={`${env().POLAR_CUSTOMER_PORTAL_URL ?? "https://polar.sh/account"}`} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm hover:bg-secondary">Manage in Polar →</a>
        )}
      </div>
    </div>
  );
}
```

(If `POLAR_CUSTOMER_PORTAL_URL` isn't in env, add it to `apps/web/src/lib/env.ts` as an optional string.)

- [ ] **Step 3: Alerts page**

Create `apps/web/src/app/dashboard/settings/alerts/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { alertDefaults } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { updateAlertDefaultsAction } from "../actions";

export default async function AlertSettings() {
  const session = await getOptionalSession();
  if (!session) redirect("/signin");
  if ((await getPlan(session.user.id)) !== "pro") redirect("/pricing");

  const [row] = await db.select().from(alertDefaults).where(eq(alertDefaults.userId, session.user.id)).limit(1);
  const recipients = (row?.recipientEmails ?? []).join(", ");

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <h1 className="text-xl font-medium">Alert defaults</h1>
      <form action={updateAlertDefaultsAction} className="flex flex-col gap-5 rounded-[22px] border border-border/60 p-5">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Score drop threshold</span>
          <span className="text-xs text-muted-foreground">Triggers email when any monitored domain's score drops by this much.</span>
          <input name="scoreDropThreshold" type="number" min={1} defaultValue={row?.scoreDropThreshold ?? 10} className="mt-1 w-32 rounded-[10px] border border-border-strong bg-background px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Recipient emails</span>
          <span className="text-xs text-muted-foreground">Comma-separated. Leave blank to use your signed-in email.</span>
          <input name="recipientEmails" defaultValue={recipients} className="mt-1 rounded-[10px] border border-border-strong bg-background px-3 py-2 text-sm" />
        </label>
        <button type="submit" className="inline-flex h-10 w-fit items-center rounded-[14px] bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Save</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Shared actions**

Create `apps/web/src/app/dashboard/settings/actions.ts`:

```ts
"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { alertDefaults, users } from "@/db/schema";
import { requireSession } from "@/lib/session";

export async function updateAlertDefaultsAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const threshold = Math.max(1, Number(formData.get("scoreDropThreshold") ?? 10));
  const raw = String(formData.get("recipientEmails") ?? "");
  const emails = raw.split(",").map((s) => s.trim()).filter(Boolean);

  await db.insert(alertDefaults).values({
    userId: session.user.id, scoreDropThreshold: threshold, recipientEmails: emails,
  }).onConflictDoUpdate({
    target: alertDefaults.userId,
    set: { scoreDropThreshold: threshold, recipientEmails: emails, updatedAt: new Date() },
  });

  revalidatePath("/dashboard/settings/alerts");
}

export async function deleteAccountAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const confirm = String(formData.get("confirm") ?? "");
  if (confirm !== "DELETE") throw new Error("confirm by typing DELETE");
  await db.delete(users).where(eq(users.id, session.user.id));
  redirect("/?deleted=1");
}
```

- [ ] **Step 5: Build + commit**

Run: `cd apps/web && bun run typecheck && bun run build`
Expected: both pass.

```bash
git add apps/web
git commit -m "feat(web): account / billing / alerts settings pages + shared actions"
```

---

## Task 15: Pricing page: read intent, show intent banner, forward to checkout

**Files:**
- Modify: `apps/web/src/app/pricing/page.tsx`

- [ ] **Step 1: Small intent banner**

This step is a pure UI polish on top of Task 10, which already added `useSearchParams` + forwarding. Add a one-line banner above the plan cards when `intent === "monitor"`:

```tsx
{intent === "monitor" && auditSlug && (
  <div className="mt-6 rounded-[18px] border border-primary/30 bg-primary/10 px-5 py-3 text-xs text-foreground">
    After checkout we'll start monitoring the domain from <a className="font-mono underline-offset-4 hover:underline" href={`/r/${auditSlug}`}>this audit</a>.
  </div>
)}
```

- [ ] **Step 2: Build + commit**

Run: `cd apps/web && bun run typecheck && bun run build`
Expected: both pass.

```bash
git add apps/web/src/app/pricing/page.tsx
git commit -m "feat(web): pricing page, intent-preserving banner"
```

---

## Task 16: Manual QA pass + wire-up validation

**Files:** none (verification only)

- [ ] **Step 1: Start dev server + click through every flow**

Run `bun run dev` in `apps/web`. Confirm:

1. Anon audit at `/` → submit → lands on `/r/:slug` with short slug in URL bar → CTA strip shows "sign in" + "Monitor with Pro".
2. Sign in with magic link → redirects to `/dashboard`. Free user sees hero audit form + (empty) history.
3. Run an audit from free dashboard → new row in history, `/r/:slug` shows "Monitor this domain →".
4. Click "Monitor" → lands on `/pricing?intent=monitor&audit=…` with intent banner.
5. Click Subscribe (in dev, use Polar sandbox) → after checkout, redirected to `/dashboard?welcome=1`. Pro user now has the domain auto-added + initial audit running.
6. Portfolio row → "Re-audit now" → new audit queued.
7. Click portfolio row → lands on `/dashboard/:slug` workspace. Header + timeline + findings render.
8. Workspace → Settings → update threshold → save → reload shows persisted value.
9. Workspace → Remove → confirm → redirected to `/dashboard`, domain gone from portfolio.
10. `/dashboard/queue` → filter chip via `?filter=domain=<slug>` works.
11. Top-bar shows only account menu + logo for signed-in. Marketing links in footer only.
12. Sidebar sub-nav highlights active section.

- [ ] **Step 2: Document any failures inline in this plan**

If any step fails, add a comment to this plan noting the issue + remediation. No silent fixes, tracked as follow-up tasks.

- [ ] **Step 3: Commit QA notes (if any)**

```bash
git add docs/superpowers/plans/2026-04-22-pseolint-ux-coherence-v1-1.md
git commit -m "docs: v1.1 QA notes"
```

---

## Out of scope (deferred)

- Run-diff view
- Per-finding history timeline
- GSC integration per-domain wiring (stub dropdown only)
- Private hosted reports (unlisted toggle): future
- Welcome banner auto-dismiss logic: polling strategy during implementation
