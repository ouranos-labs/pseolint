# Leaderboard Clean-Corpus Core: Implementation Plan (Plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make clean public audits (incl. anonymous) persist permanently and become search-indexable, fix the leaderboard's supersede semantics, and reconcile the now-false retention copy, so the board stops evaporating and starts compounding as an SEO corpus.

**Architecture:** Extract the eligibility + robots rules into one pure, unit-tested module (`lib/leaderboard.ts`) and reuse it in three places: the audit-completion step (to extend `expiresAt`), the leaderboard query (to gate + order), and the report page's `generateMetadata` (to flip `index`/`follow`). No new tables in this plan, permanence rides the existing `expiresAt` lever; a single `audits.source` column is added now so Plans 2–3 don't need a second migration.

**Tech Stack:** Next.js (App Router, RSC), Drizzle ORM (Postgres/Neon), Inngest, Vitest.

**Scope note:** This is Plan 1 of 3 from `docs/superpowers/specs/2026-06-04-leaderboard-clean-corpus-design.md`. Plan 2 = seeding pipeline + aggregate stat; Plan 3 = claims/verification + conversion hooks (badge, customize/pin/hide, monitoring & re-audit CTAs, nofollow-until-verified). Spec §6–§8 are intentionally NOT in this plan. Until claims ship (Plan 3), outbound links keep their current `rel`, and takedown is the existing manual route.

**Conventions:** All commands run from `apps/web`. Tests: `npx vitest run <path>`. Typecheck: `npx tsc --noEmit -p tsconfig.json`. Work on branch `feat/leaderboard-clean-corpus` (already created).

---

### Task 1: Pure eligibility + robots module (single source of truth)

**Files:**
- Create: `apps/web/src/lib/leaderboard.ts`
- Test: `apps/web/src/lib/leaderboard.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/leaderboard.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  LEADERBOARD_RISK_MAX,
  LEADERBOARD_MIN_PAGES,
  PERMANENT_EXPIRES_AT,
  isLeaderboardEligible,
  reportRobots,
} from "./leaderboard";

const base = {
  isPublic: true,
  status: "completed" as const,
  host: "example.com" as string | null,
  pageCount: 10 as number | null,
  risk: 20 as number | null,
};

describe("isLeaderboardEligible", () => {
  it("accepts a clean, public, completed audit over the page floor", () => {
    expect(isLeaderboardEligible(base)).toBe(true);
  });
  it("rejects risk at or above the max (boundary: 40 is out)", () => {
    expect(isLeaderboardEligible({ ...base, risk: LEADERBOARD_RISK_MAX })).toBe(false);
    expect(isLeaderboardEligible({ ...base, risk: LEADERBOARD_RISK_MAX - 1 })).toBe(true);
  });
  it("rejects null risk", () => {
    expect(isLeaderboardEligible({ ...base, risk: null })).toBe(false);
  });
  it("rejects private audits", () => {
    expect(isLeaderboardEligible({ ...base, isPublic: false })).toBe(false);
  });
  it("rejects non-completed audits", () => {
    expect(isLeaderboardEligible({ ...base, status: "running" })).toBe(false);
  });
  it("rejects missing host", () => {
    expect(isLeaderboardEligible({ ...base, host: null })).toBe(false);
  });
  it("enforces the page floor (boundary: 5 in, 4 out)", () => {
    expect(isLeaderboardEligible({ ...base, pageCount: LEADERBOARD_MIN_PAGES })).toBe(true);
    expect(isLeaderboardEligible({ ...base, pageCount: LEADERBOARD_MIN_PAGES - 1 })).toBe(false);
    expect(isLeaderboardEligible({ ...base, pageCount: null })).toBe(false);
  });
});

describe("reportRobots", () => {
  it("indexes + follows eligible reports", () => {
    expect(reportRobots(base)).toEqual({ index: true, follow: true });
  });
  it("noindexes everything else", () => {
    expect(reportRobots({ ...base, isPublic: false })).toEqual({ index: false, follow: false });
    expect(reportRobots({ ...base, risk: 90 })).toEqual({ index: false, follow: false });
  });
});

describe("PERMANENT_EXPIRES_AT", () => {
  it("is the far-future sentinel Postgres can serialize", () => {
    expect(PERMANENT_EXPIRES_AT).toBe("9999-12-31T23:59:59.999Z");
    expect(Number.isNaN(new Date(PERMANENT_EXPIRES_AT).getTime())).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/leaderboard.test.ts`
Expected: FAIL, `Cannot find module './leaderboard'`.

- [ ] **Step 3: Write the module**

Create `apps/web/src/lib/leaderboard.ts`:

```ts
/**
 * Single source of truth for leaderboard eligibility and the search-indexability
 * of /r/[slug] report pages. Imported by run-audit (retention), the leaderboard
 * query (gating + ordering), and r/[slug] generateMetadata (robots directive).
 *
 * Eligibility = "may a clean, public audit be NAMED publicly and indexed?".
 * Spec: docs/superpowers/specs/2026-06-04-leaderboard-clean-corpus-design.md §0–§3.
 */

/** Risk strictly below this is leaderboard-eligible (A/B bands). Tunable. */
export const LEADERBOARD_RISK_MAX = 40;

/** Too-small samples produce volatile rankings, exclude below this. */
export const LEADERBOARD_MIN_PAGES = 5;

/**
 * Far-future expiry sentinel. JS max date (year 275760) does NOT round-trip
 * through Postgres timestamptz, so we use this value (already used for Pro
 * audits in api/audits/route.ts).
 */
export const PERMANENT_EXPIRES_AT = "9999-12-31T23:59:59.999Z";

export interface EligibilityInput {
  isPublic: boolean;
  status: string;
  host: string | null;
  pageCount: number | null;
  risk: number | null;
}

/** True when a completed audit is clean + public enough to be listed and indexed. */
export function isLeaderboardEligible(a: EligibilityInput): boolean {
  return (
    a.isPublic &&
    a.status === "completed" &&
    a.host !== null &&
    a.host.length > 0 &&
    a.pageCount !== null &&
    a.pageCount >= LEADERBOARD_MIN_PAGES &&
    a.risk !== null &&
    a.risk < LEADERBOARD_RISK_MAX
  );
}

/**
 * Robots directive for a /r/[slug] page. Only leaderboard-eligible reports are
 * indexed; every private/failing/thin/expired report stays noindex,nofollow
 * (the historical default). expiresAt is intentionally NOT an input here:
 * eligible audits have their expiry extended to PERMANENT_EXPIRES_AT, and an
 * expired row never reaches this function (the page renders ExpiredState first).
 */
export function reportRobots(a: EligibilityInput): { index: boolean; follow: boolean } {
  const ok = isLeaderboardEligible(a);
  return { index: ok, follow: ok };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/leaderboard.test.ts`
Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/leaderboard.ts src/lib/leaderboard.test.ts
git commit -m "feat(leaderboard): pure eligibility + robots module with tests"
```

---

### Task 2: Add `audits.source` column + migration

**Files:**
- Modify: `apps/web/src/db/schema.ts` (audits table, around line 60–104)
- Create: migration via `drizzle-kit generate` (writes `src/db/migrations/0016_*.sql` + snapshot)

- [ ] **Step 1: Add the column to the schema**

In `apps/web/src/db/schema.ts`, inside the `audits` pgTable definition, add the `source` column next to `isPublic` (line 66). Insert after the `isPublic` line:

```ts
  source: text("source").$type<"user" | "seed">().notNull().default("user"),
```

(`text` is already imported in this file, it is used by adjacent columns.)

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: drizzle-kit prints a new migration (e.g. `0016_*.sql`) containing `ALTER TABLE "audit" ADD COLUMN "source" text DEFAULT 'user' NOT NULL;` and updates `src/db/migrations/meta/_journal.json`.

- [ ] **Step 3: Verify the generated SQL**

Run: `git status --short src/db/migrations`
Expected: a new `0016_*.sql` and `0016_snapshot.json` are listed. Open the `.sql` and confirm it only adds the `source` column (no destructive statements). If it contains anything else, stop and investigate.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/db/migrations
git commit -m "feat(db): add audits.source (user|seed) for leaderboard seeding"
```

> Note: applying the migration to a live DB (`npm run db:migrate`) is a deploy step, not part of this task. The column has a default so it is backfill-safe.

---

### Task 3: Extend `expiresAt` to permanent for eligible audits at completion

**Files:**
- Modify: `apps/web/src/inngest/functions/run-audit.ts` (the `mark-completed` step, lines 290–319)

- [ ] **Step 1: Import the helper**

At the top of `apps/web/src/inngest/functions/run-audit.ts`, add to the imports:

```ts
import { isLeaderboardEligible, PERMANENT_EXPIRES_AT } from "@/lib/leaderboard";
```

- [ ] **Step 2: Compute eligibility before the update**

Replace the block starting at `const completedAt = new Date();` (line 290) down to the start of `await runStep("mark-completed", ...)` with:

```ts
  const completedAt = new Date();
  const findingCount =
    summary.issues.blockers.length +
    summary.issues.shouldFix.length +
    summary.issues.informational.length;

  // Read current visibility so we can decide permanence. Clean public audits,
  // including anonymous ones, get their expiry extended to the far-future
  // sentinel so the listing + /r/[slug] page persist as an SEO corpus entry.
  // Non-eligible audits keep the tier expiry set at creation (anon 1d / free 30d).
  const [vis] = await db
    .select({ isPublic: audits.isPublic })
    .from(audits)
    .where(eq(audits.id, auditId))
    .limit(1);
  const eligible = isLeaderboardEligible({
    isPublic: vis?.isPublic ?? false,
    status: "completed",
    host,
    pageCount: summary.pageCount,
    risk: summary.risk,
  });

  await runStep("mark-completed", async () => {
    await db.update(audits).set({
      status: "completed",
      risk: summary.risk,
      pageCount: summary.pageCount,
      findingCount,
      host,
      ogTitle: og.title,
      ogDescription: og.description,
      ogImageUrl: og.image,
      triageRootCauseCount: summary.triage?.rootCauses.length ?? null,
      triageCostUsd: summary.triage?.estimatedCostUsd != null ? String(summary.triage.estimatedCostUsd) : null,
      siteClassification: summary.siteClassification ?? null,
      scrapePlan: summary.scrapePlan ?? null,
      storageKey: jsonKey,
      completedAt,
      // Permanence for eligible audits only; omit the key otherwise so the
      // creation-time tier expiry is preserved.
      ...(eligible ? { expiresAt: new Date(PERMANENT_EXPIRES_AT) } : {}),
    }).where(eq(audits.id, auditId));
  });
```

(This preserves every existing field in the `.set()`, the only additions are the `vis` read, the `eligible` computation, and the conditional `expiresAt` spread. The explanatory comments at lines 307–315 are condensed into the new comment above; do not lose the `siteClassification` / `scrapePlan` fields.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Sanity-check the lib tests still pass**

Run: `npx vitest run src/lib/leaderboard.test.ts`
Expected: PASS (no behavior change, just confirming the import target is stable).

- [ ] **Step 5: Commit**

```bash
git add src/inngest/functions/run-audit.ts
git commit -m "feat(audit): persist clean public audits permanently at completion"
```

---

### Task 4: Leaderboard query: clean-only gate + most-recent supersede

**Files:**
- Modify: `apps/web/src/app/leaderboard/page.tsx` (query, lines 83–112)

- [ ] **Step 1: Import the constants**

At the top of `apps/web/src/app/leaderboard/page.tsx`, add:

```ts
import { LEADERBOARD_RISK_MAX, LEADERBOARD_MIN_PAGES } from "@/lib/leaderboard";
```

Also add `lt` to the existing `drizzle-orm` import (line 5 currently imports `and, eq, gt, isNotNull, sql`):

```ts
import { and, eq, gt, lt, isNotNull, sql } from "drizzle-orm";
```

- [ ] **Step 2: Add the risk gate and switch ordering to most-recent-per-host**

Replace the `.where(...)` and `.orderBy(...)` of the query (lines 97–108) with:

```ts
    .where(
      and(
        eq(audits.isPublic, true),
        eq(audits.status, "completed"),
        isNotNull(audits.risk),
        lt(audits.risk, LEADERBOARD_RISK_MAX),
        isNotNull(audits.host),
        gt(audits.expiresAt, new Date()),
        sql`${audits.pageCount} >= ${LEADERBOARD_MIN_PAGES}`,
      ),
    )
    // Most-recent audit per host wins (DISTINCT ON needs host-first ordering).
    // This supersedes older scores: a re-audit replaces the prior entry, and a
    // site that degrades below the bar drops off. Re-sorted by risk for display.
    .orderBy(audits.host, sql`${audits.createdAt} DESC`)
    .limit(100);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open `http://localhost:3000/leaderboard`.
Expected: the page renders; any listed card has a grade in the A or B band (risk < 40). If you have a known failing public audit, confirm its host is absent. (If the DB is empty locally, the empty-state renders, that's acceptable; the gate is verified by the lib tests + typecheck.)

- [ ] **Step 5: Commit**

```bash
git add src/app/leaderboard/page.tsx
git commit -m "feat(leaderboard): clean-only gate + most-recent-per-host supersede"
```

---

### Task 5: Flip `/r/[slug]` robots to index eligible reports only

**Files:**
- Modify: `apps/web/src/app/r/[slug]/page.tsx` (`generateMetadata`, lines 43–69)

- [ ] **Step 1: Import the helper**

At the top of `apps/web/src/app/r/[slug]/page.tsx`, add:

```ts
import { reportRobots } from "@/lib/leaderboard";
```

- [ ] **Step 2: Replace the hardcoded noindex with an eligibility-gated directive**

In `generateMetadata`, replace lines 50–53:

```ts
  // Reports describe third-party sites; we never want them indexed by search
  // engines or aggregated into Slack/Twitter previews with a verdict baked in.
  const robots: Metadata["robots"] = { index: false, follow: false };
  if (!row || !isReady(row)) return { title: "Audit not found · pseolint", robots };
```

with:

```ts
  // Only leaderboard-eligible reports (clean + public + over the page floor)
  // are indexable, they assert a NAMED site is clean, which is defensible.
  // Every other report (private, failing, thin, not-ready) stays noindex.
  if (!row || !isReady(row)) {
    return { title: "Audit not found · pseolint", robots: { index: false, follow: false } };
  }
  const robots: Metadata["robots"] = reportRobots(row);
```

(`row` is the full audit row from `findAudit`, so it already carries `isPublic`, `status`, `host`, `pageCount`, `risk`, the fields `EligibilityInput` needs.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors. (If TS complains that the row's `status` is a wider/narrower type than `EligibilityInput.status: string`, it will not, `string` accepts the enum.)

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. For a clean public audit, view source of `/r/<slug>` and confirm `<meta name="robots" content="index, follow">` (or absence of noindex). For a private or failing one, confirm `noindex`.

- [ ] **Step 5: Commit**

```bash
git add src/app/r/[slug]/page.tsx
git commit -m "feat(report): index eligible clean reports, keep others noindex"
```

---

### Task 6: Reconcile now-false retention copy on `/r/[slug]`

**Files:**
- Modify: `apps/web/src/app/r/[slug]/page.tsx` (anon CTA ~256–273, About blurb ~341–356, `ExpiredState` ~908–942)

Clean anonymous audits no longer auto-delete, so the "auto-deletes in Nh / live for 24 hours" copy is false for them. Branch the copy on eligibility.

- [ ] **Step 1: Compute an `eligible` flag in the page body**

In the default `Page` component, after the `isReady(row)` guard (line 94) and before `fetchSummaryJson`, add:

```ts
  // Eligible = this report is permanent + publicly listed (see lib/leaderboard).
  // Drives retention copy below: eligible reports never auto-delete.
  const { isLeaderboardEligible } = await import("@/lib/leaderboard");
  const eligible = isLeaderboardEligible(row);
```

(Use a static import instead if preferred: add `isLeaderboardEligible` to the Task 5 import line `import { reportRobots, isLeaderboardEligible } from "@/lib/leaderboard";` and drop the dynamic `await import` here. Either is fine; prefer the static import.)

- [ ] **Step 2: Rewrite the anon retention CTA**

Replace the anon block (lines 256–273, the `{ !session && ownedByAnon ? (...) : null }` JSX) with:

```tsx
      { !session && ownedByAnon ? (
        eligible ? (
          <div className="mt-6 flex flex-wrap items-start gap-4 rounded-[22px] border border-success/25 bg-success/5 p-5 sm:flex-nowrap sm:items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                This site made the public leaderboard.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Its report is kept permanently. Sign in (free) to run more audits and unlock private reports.
              </p>
            </div>
            <Link
              href={ `/signin?callbackUrl=${encodeURIComponent(`/r/${slug}`)}` }
              className="inline-flex h-10 shrink-0 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Sign in
            </Link>
          </div>
        ) : (
          <div className="mt-6 flex flex-wrap items-start gap-4 rounded-[22px] border border-primary/25 bg-primary/5 p-5 sm:flex-nowrap sm:items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                This report auto-deletes in { hoursUntil(row.expiresAt) }h.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Sign in (free) to keep it permanently, run more audits, and unlock private reports.
              </p>
            </div>
            <Link
              href={ `/signin?callbackUrl=${encodeURIComponent(`/r/${slug}`)}` }
              className="inline-flex h-10 shrink-0 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Save this report
            </Link>
          </div>
        )
      ) : null }
```

- [ ] **Step 3: Fix the "About this audit" auto-delete blurb**

Replace the retention sentence in the About section (lines 343–355). Change the conditional that currently reads:

```tsx
          Report auto-deletes{ " " }
          { ownedByAnon
            ? "in 24 hours"
            : ownedByUser
              ? "after 30 days"
              : "within its retention window" }
          .
```

to:

```tsx
          { eligible
            ? "This report is kept permanently because the site is on the public leaderboard."
            : (
              <>
                Report auto-deletes{ " " }
                { ownedByAnon ? "in 24 hours" : ownedByUser ? "after 30 days" : "within its retention window" }
                .
              </>
            ) }
```

- [ ] **Step 4: Soften the `ExpiredState` copy (defensive only)**

`ExpiredState` only renders for already-expired rows (eligible rows never expire), so its copy is not user-facing for clean sites. No change required, but if touched, leave the existing "Anonymous reports live for 24 hours" text, it is accurate for the rows that actually reach this state. Skip.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`. As an anonymous visitor on a clean public audit you own (anon-session), confirm the green "made the public leaderboard / kept permanently" copy. On a failing anon audit, confirm the original "auto-deletes in Nh / Save this report" copy.

- [ ] **Step 7: Commit**

```bash
git add src/app/r/[slug]/page.tsx
git commit -m "fix(report): retention copy reflects permanent clean-audit listings"
```

---

### Task 7: Update leaderboard methodology prose

**Files:**
- Modify: `apps/web/src/app/leaderboard/page.tsx` (methodology `<p>` ~234–244 and the "How sites end up on this leaderboard" section ~289–309)

The current prose says anonymous entries fall off after 24h and that listings are "the most recent audit per domain" while the old query took lowest-risk. Both are now wrong/right respectively; align the copy with the shipped behavior (clean-only, permanent, most-recent supersede).

- [ ] **Step 1: Rewrite the one-paragraph methodology block**

Replace the paragraph at lines 234–244 (`Leaderboard methodology in one paragraph: ...`) with:

```tsx
      <p className="mt-12 max-w-2xl text-sm text-muted-foreground">
        Leaderboard methodology in one paragraph: the ranking is rebuilt every 10 minutes from
        completed public audits, deduplicated by hostname so a domain occupies exactly one slot,
        the most recent audit per domain wins, so a re-audit supersedes the prior score. Only sites
        scoring in the A or B band (risk below 40) are listed; audits below the 5-page floor are
        excluded because too-small samples produce volatile rankings. Pages marked private by their
        owner never appear, regardless of score. A clean public audit (including an anonymous one) 
        is kept permanently and shown with the date it was scored; if a site is re-audited and slips
        below the bar, it drops off the board. The board first shipped on March 15, 2026 alongside the
        v0.4.0 engine cut, and the scoring weights were last rebalanced on April 21, 2026 when the AEO
        category landed.
      </p>
```

- [ ] **Step 2: Rewrite the "How sites end up on this leaderboard" body**

Replace the two paragraphs at lines 293–308 with:

```tsx
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Any audit a user runs with{ " " }
          <span className="font-mono text-foreground">isPublic = true</span> is listed once it
          completes, crosses the 5-page minimum, and scores in the A or B band (risk below 40).
          Free-tier audits cost $0 and default to public, that&rsquo;s the trade for unlimited
          one-shot acquisition runs, capped at 3 audits per browser per 24-hour window. Audits that
          score below the bar still produce a full report at their own URL; they just aren&rsquo;t
          listed publicly. Pro plans start at $19/mo, default to private, and stay private unless an
          operator flips the visibility toggle.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Listings are deduplicated by hostname, the most recent audit per domain shows, and
          rankings refresh every ten minutes. A clean public listing is kept permanently; re-auditing
          a site supersedes its previous entry. If you ran a public audit you didn&rsquo;t mean to
          share, mark it private from your dashboard and it disappears at the next revalidation.
        </p>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open `/leaderboard`, read the methodology + "How sites end up" sections. Confirm no remaining "fall off after 24 hours" or "anonymous entries" claims, and that clean-only + permanence + supersede are described.

- [ ] **Step 5: Commit**

```bash
git add src/app/leaderboard/page.tsx
git commit -m "docs(leaderboard): methodology copy reflects clean-only permanence"
```

---

## Final verification

- [ ] **Run the full test + typecheck gate**

Run: `npx vitest run && npx tsc --noEmit -p tsconfig.json`
Expected: tests PASS, typecheck clean.

- [ ] **Confirm the diff touches only the intended files**

Run: `git diff --name-only main`
Expected: `src/lib/leaderboard.ts`, `src/lib/leaderboard.test.ts`, `src/db/schema.ts`, `src/db/migrations/0016_*`, `src/inngest/functions/run-audit.ts`, `src/app/leaderboard/page.tsx`, `src/app/r/[slug]/page.tsx`, and this plan/spec doc.

---

## Self-review notes (author)

**Spec coverage (Plan 1 portion):** §0 indexability → Task 5. §1 eligibility constant → Task 1. §2 retention → Task 3. §3 supersede + query fix → Task 4. §4 `audits.source` → Task 2 (the `leaderboardClaims` table is deferred to Plan 3 by design). §9 copy → Tasks 4/6/7. §5–§8 (claims, conversion, seeding, nofollow-until-verified, takedown valve) are explicitly deferred to Plans 2–3 and called out in the scope note.

**Deferred-dependency check:** Nothing in Plan 1 references `leaderboardClaims`, badges, or seed rows. The `audits.source` column is added now but only read starting in Plan 2, safe (defaulted, unused).

**Type consistency:** `isLeaderboardEligible` / `reportRobots` / `EligibilityInput` names and the `PERMANENT_EXPIRES_AT` string are used identically in Tasks 1, 3, 5, 6. The audit row from `findAudit` (`typeof audits.$inferSelect`) structurally satisfies `EligibilityInput`.
