# Leaderboard Claims + Conversion: Implementation Plan (Plan 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. Tasks are grouped into **waves**; tasks within a wave touch disjoint files and may be implemented by parallel agents. Tasks in a later wave depend on earlier waves.

**Goal:** Let a site owner claim their leaderboard listing by proving ownership (GSC fast-path or DNS TXT), unlocking owner control (hide/customize/pin), an embeddable verified badge (followed backlink), and a "verified ✓" mark, turning the board into a signup + backlink engine, with nofollow-until-verified as the abuse guard.

**Architecture:** Verification reuses existing primitives, `lib/domain-verify.ts` (DNS TXT) and `gsc.ts` `listSites`/`pickBestGscProperty` (GSC). DNS claim tokens are **deterministic** (`HMAC(secret, userId:host)`) so no pending-claim state is stored; the `leaderboardClaims` table holds only *verified* claims (one row per host). A claims helper centralizes lookup so the leaderboard query, the report page, and the badge endpoint all read the same source of truth.

**Tech Stack:** Next.js (App Router, RSC + server actions + route handlers), Drizzle ORM, Node `crypto`/`dns`, Vitest.

**Scope note:** Plan 3 of 3 from `docs/superpowers/specs/2026-06-04-leaderboard-clean-corpus-design.md` (§5–§8). Builds on Plans 1 & 2 (merged). Monitoring & re-audit CTAs already exist on `/r/[slug]` (`MonitorDomainButton`, `ReauditButton`), so this plan does NOT rebuild them, it adds claim, badge, owner-control, verified-chip, and nofollow-until-verified.

**Conventions:** Commands from `apps/web`. Tests `npx vitest run <path>`; typecheck `npx tsc --noEmit -p tsconfig.json`. Branch `feat/leaderboard-claims` from `main`. Reuse `BETTER_AUTH_SECRET` (already in env) for HMAC.

---

## WAVE 1: independent foundations (parallelizable: Tasks 1, 2 touch disjoint files)

### Task 1: `leaderboardClaims` schema + migration

**Files:** `apps/web/src/db/schema.ts`; migration via `drizzle-kit generate`.

- [ ] **Step 1**: In `schema.ts`, after the `seedStats` table, add:

```ts
/**
 * Verified ownership claims for leaderboard hosts. One row per host = claimed.
 * Absence = unclaimed. Only VERIFIED claims live here (DNS or GSC); pending DNS
 * challenges are stateless (deterministic token, see lib/leaderboard-claims.ts).
 */
export const leaderboardClaims = pgTable("leaderboard_claim", {
  host: text("host").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
  method: text("method").$type<"dns" | "gsc">().notNull(),
  ogTitleOverride: text("og_title_override"),
  ogDescriptionOverride: text("og_description_override"),
  pinnedAuditId: uuid("pinned_audit_id"),
  isHidden: boolean("is_hidden").notNull().default(false),
}, (t) => ({
  userIdx: index("leaderboard_claim_user_idx").on(t.userId),
}));
```

(`pgTable`, `text`, `timestamp`, `uuid`, `boolean`, `index`, `users` are all already imported/defined in this file, verify.)

- [ ] **Step 2**: `npm run db:generate` → expect `0018_*.sql` creating `leaderboard_claim`. If prompted create-vs-rename, choose CREATE.
- [ ] **Step 3**: Open the `0018_*.sql`; confirm only `CREATE TABLE "leaderboard_claim"` (+ FK + index). If destructive, STOP/BLOCKED.
- [ ] **Step 4**: `npx tsc --noEmit -p tsconfig.json` → clean.
- [ ] **Step 5**: Commit:
```bash
git add src/db/schema.ts src/db/migrations
git commit -m "feat(db): add leaderboard_claim table"
```

### Task 2: SVG badge endpoint

**Files:** Create `apps/web/src/app/api/badge/[host]/route.ts`.

This is independent of the claims table (it renders from the host's current grade). It links/embeds regardless; the "only claimed hosts get a badge" gating is enforced in the UI (Task 7), not here, anyone can fetch a badge SVG, which is fine (it's public info).

- [ ] **Step 1**: Create `apps/web/src/app/api/badge/[host]/route.ts`:

```ts
import { NextRequest } from "next/server";
import { and, eq, gt, isNotNull, lt, sql, desc } from "drizzle-orm";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { LEADERBOARD_RISK_MAX, LEADERBOARD_MIN_PAGES } from "@/lib/leaderboard";
import { gradeOf } from "@/lib/grade";

export const runtime = "nodejs";
export const revalidate = 600;

/** Minimal SVG badge: "pseolint · Grade A". Verdict/grade only, never a numeric risk. */
function badgeSvg(host: string, grade: string): string {
  const label = "pseolint";
  const value = `Grade ${grade}`;
  // Fixed-width pill; widths tuned for ≤ ~6-char value.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="148" height="20" role="img" aria-label="${label}: ${value}">
  <rect width="78" height="20" fill="#1f2328"/>
  <rect x="78" width="70" height="20" fill="#0a7d33"/>
  <g fill="#fff" font-family="Verdana,Geneva,sans-serif" font-size="11">
    <text x="8" y="14">${label}</text>
    <text x="86" y="14">${value}</text>
  </g>
</svg>`;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ host: string }> }) {
  const { host } = await ctx.params;
  const decoded = decodeURIComponent(host).toLowerCase();

  // Most-recent eligible (clean, public, listed) audit for this host.
  const [row] = await db
    .select({ risk: audits.risk })
    .from(audits)
    .where(
      and(
        eq(audits.host, decoded),
        eq(audits.isPublic, true),
        eq(audits.status, "completed"),
        isNotNull(audits.risk),
        lt(audits.risk, LEADERBOARD_RISK_MAX),
        gt(audits.expiresAt, new Date()),
        sql`${audits.pageCount} >= ${LEADERBOARD_MIN_PAGES}`,
      ),
    )
    .orderBy(desc(audits.createdAt))
    .limit(1);

  if (!row || row.risk === null) {
    return new Response("Not found", { status: 404 });
  }

  const grade = gradeOf(row.risk).letter;
  return new Response(badgeSvg(decoded, grade), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=600, s-maxage=600",
    },
  });
}
```

NOTE: confirm `gradeOf` (in `@/lib/grade`) returns an object with a `.letter` field, read `apps/web/src/lib/grade.ts` first. If the letter accessor differs (e.g. `.grade`), adjust. If `gradeOf` doesn't expose a letter, derive: `risk<20?"A":risk<40?"B":...`.

- [ ] **Step 2**: `npx tsc --noEmit -p tsconfig.json` → clean.
- [ ] **Step 3**: Commit:
```bash
git add src/app/api/badge
git commit -m "feat(leaderboard): SVG badge endpoint for clean hosts"
```

---

## WAVE 2: claims helper (depends on Task 1)

### Task 3: `lib/leaderboard-claims.ts` (+ tests)

**Files:** Create `apps/web/src/lib/leaderboard-claims.ts` and `apps/web/src/lib/leaderboard-claims.test.ts`.

- [ ] **Step 1 (TDD)**: Create `apps/web/src/lib/leaderboard-claims.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { claimToken } from "./leaderboard-claims";

describe("claimToken", () => {
  it("is deterministic per (userId, host)", () => {
    expect(claimToken("u1", "example.com")).toBe(claimToken("u1", "example.com"));
  });
  it("differs by user and by host", () => {
    expect(claimToken("u1", "example.com")).not.toBe(claimToken("u2", "example.com"));
    expect(claimToken("u1", "example.com")).not.toBe(claimToken("u1", "other.com"));
  });
  it("is host-case-insensitive", () => {
    expect(claimToken("u1", "Example.com")).toBe(claimToken("u1", "example.com"));
  });
  it("is a short hex string", () => {
    expect(claimToken("u1", "example.com")).toMatch(/^[0-9a-f]{16}$/);
  });
});
```

- [ ] **Step 2**: `npx vitest run src/lib/leaderboard-claims.test.ts` → FAIL (module missing).

- [ ] **Step 3**: Create `apps/web/src/lib/leaderboard-claims.ts`:

```ts
import "server-only";
import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { leaderboardClaims } from "@/db/schema";
import { env } from "@/lib/env";
import { verifyTxtName, verifyDomainToken } from "@/lib/domain-verify";
import { loadGscTokens, listSites, pickBestGscProperty } from "@/lib/gsc";

/**
 * Deterministic DNS-claim token for (userId, host). Stateless: we recompute it
 * on verify rather than storing a pending challenge. HMAC over the auth secret
 * so it's unguessable but reproducible. Host is lowercased for stability.
 */
export function claimToken(userId: string, host: string): string {
  return createHmac("sha256", env().BETTER_AUTH_SECRET)
    .update(`${userId}:${host.toLowerCase()}`)
    .digest("hex")
    .slice(0, 16);
}

/** The DNS TXT record name + value the user must publish to claim via DNS. */
export function dnsClaimInstructions(userId: string, host: string): { name: string; value: string } {
  return { name: verifyTxtName(host), value: claimToken(userId, host) };
}

/** Verify a DNS claim by checking the deterministic token at _pseolint-verify.<host>. */
export async function verifyDnsClaim(userId: string, host: string): Promise<boolean> {
  return verifyDomainToken(host, claimToken(userId, host));
}

/**
 * GSC fast-path: true when the user's connected GSC account controls a property
 * covering `host`. Reuses listSites + pickBestGscProperty. Returns false on no
 * tokens / no match / API error (caller falls back to DNS).
 */
export async function verifyGscClaim(userId: string, host: string): Promise<boolean> {
  try {
    const tokens = await loadGscTokens(userId);
    if (!tokens) return false;
    const sites = await listSites(userId);
    return pickBestGscProperty(sites, host) !== null;
  } catch {
    return false;
  }
}

export type Claim = typeof leaderboardClaims.$inferSelect;

/** Fetch the claim row for a host (null = unclaimed). */
export async function getClaim(host: string): Promise<Claim | null> {
  const [row] = await db
    .select()
    .from(leaderboardClaims)
    .where(eq(leaderboardClaims.host, host.toLowerCase()))
    .limit(1);
  return row ?? null;
}

/** True when host has a verified claim owned by userId. */
export async function isClaimedBy(host: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ host: leaderboardClaims.host })
    .from(leaderboardClaims)
    .where(and(eq(leaderboardClaims.host, host.toLowerCase()), eq(leaderboardClaims.userId, userId)))
    .limit(1);
  return !!row;
}
```

- [ ] **Step 4**: `npx vitest run src/lib/leaderboard-claims.test.ts` → PASS. Then `npx tsc --noEmit -p tsconfig.json` → clean.
- [ ] **Step 5**: Commit:
```bash
git add src/lib/leaderboard-claims.ts src/lib/leaderboard-claims.test.ts
git commit -m "feat(leaderboard): claims helper (deterministic DNS token + GSC fast-path)"
```

---

## WAVE 3: server actions (depends on Tasks 1, 3)

### Task 4: claim server actions

**Files:** Create `apps/web/src/app/leaderboard/claim-actions.ts`.

- [ ] **Step 1**: Create `apps/web/src/app/leaderboard/claim-actions.ts`:

```ts
"use server";

import { and, eq } from "drizzle-orm";
import { getRequiredSession } from "@/lib/session";
import { db } from "@/db";
import { leaderboardClaims, audits } from "@/db/schema";
import {
  claimToken, dnsClaimInstructions, verifyDnsClaim, verifyGscClaim,
} from "@/lib/leaderboard-claims";
import { revalidatePath } from "next/cache";

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, "");
}

/** Show the DNS TXT record the caller must publish to claim `host`. */
export async function getDnsClaimInstructionsAction(host: string) {
  const session = await getRequiredSession();
  return dnsClaimInstructions(session.user.id, normalizeHost(host));
}

/**
 * Attempt to claim `host`. Tries the GSC fast-path first, then DNS. On success,
 * upserts a verified leaderboard_claim row owned by the caller.
 */
export async function claimHostAction(host: string): Promise<{ ok: true; method: "gsc" | "dns" } | { error: string }> {
  const session = await getRequiredSession();
  const userId = session.user.id;
  const h = normalizeHost(host);

  // Guard: only allow claiming a host that actually has a public completed audit.
  const [exists] = await db
    .select({ id: audits.id })
    .from(audits)
    .where(and(eq(audits.host, h), eq(audits.isPublic, true), eq(audits.status, "completed")))
    .limit(1);
  if (!exists) return { error: "No public audit exists for this site yet." };

  let method: "gsc" | "dns" | null = null;
  if (await verifyGscClaim(userId, h)) method = "gsc";
  else if (await verifyDnsClaim(userId, h)) method = "dns";
  if (!method) {
    return { error: "Ownership not verified. Connect Google Search Console for this property, or publish the DNS TXT record and try again." };
  }

  await db
    .insert(leaderboardClaims)
    .values({ host: h, userId, method, verifiedAt: new Date() })
    .onConflictDoUpdate({
      target: leaderboardClaims.host,
      // Re-claim by the same owner refreshes method/time; a different user
      // cannot steal an existing claim (guard below).
      set: { method, verifiedAt: new Date() },
      where: eq(leaderboardClaims.userId, userId),
    });

  // If the conflict row is owned by someone else, the WHERE blocked the update,
  // detect by reading back.
  const [claim] = await db.select({ userId: leaderboardClaims.userId }).from(leaderboardClaims).where(eq(leaderboardClaims.host, h)).limit(1);
  if (!claim || claim.userId !== userId) return { error: "This site is already claimed by another account." };

  revalidatePath("/leaderboard");
  revalidatePath(`/r/`);
  return { ok: true, method };
}

/** Owner-only: update display overrides / pin / hide. */
export async function updateClaimAction(input: {
  host: string;
  ogTitleOverride?: string | null;
  ogDescriptionOverride?: string | null;
  pinnedAuditId?: string | null;
  isHidden?: boolean;
}): Promise<{ ok: true } | { error: string }> {
  const session = await getRequiredSession();
  const h = normalizeHost(input.host);
  const [claim] = await db.select().from(leaderboardClaims).where(eq(leaderboardClaims.host, h)).limit(1);
  if (!claim || claim.userId !== session.user.id) return { error: "You don't own this listing." };

  await db.update(leaderboardClaims).set({
    ...(input.ogTitleOverride !== undefined ? { ogTitleOverride: input.ogTitleOverride } : {}),
    ...(input.ogDescriptionOverride !== undefined ? { ogDescriptionOverride: input.ogDescriptionOverride } : {}),
    ...(input.pinnedAuditId !== undefined ? { pinnedAuditId: input.pinnedAuditId } : {}),
    ...(input.isHidden !== undefined ? { isHidden: input.isHidden } : {}),
  }).where(eq(leaderboardClaims.host, h));

  revalidatePath("/leaderboard");
  return { ok: true };
}
```

NOTE: confirm `getRequiredSession` is exported from `@/lib/session` (it is, used by indexing-actions.ts). Confirm `onConflictDoUpdate` supports a `where` clause in this Drizzle version; if not, replace the upsert with: read existing row → if none insert → if owned by caller update → else return "already claimed". Read another action file (e.g. `dashboard/domain-actions.ts`) for the established session/error pattern and mirror it.

- [ ] **Step 2**: `npx tsc --noEmit -p tsconfig.json` → clean.
- [ ] **Step 3**: Commit:
```bash
git add src/app/leaderboard/claim-actions.ts
git commit -m "feat(leaderboard): claim + owner-control server actions"
```

---

## WAVE 4: surfaces (depends on Tasks 1, 3, 4; Tasks 5 & 6 BOTH edit leaderboard/page.tsx → do sequentially, not parallel)

### Task 5: leaderboard query: apply claims (verified chip, hide, overrides, pin)

**Files:** `apps/web/src/app/leaderboard/page.tsx`.

- [ ] **Step 1**: After the `deduped` rows are fetched, load claims for the visible hosts and apply them:

Add import:
```ts
import { leaderboardClaims } from "@/db/schema";
import { inArray } from "drizzle-orm";
```
After `deduped` is computed (and before JSON-LD), add:
```ts
  const hosts = deduped.map((r: Row) => r.host).filter((h): h is string => !!h);
  const claims = hosts.length
    ? await db.select().from(leaderboardClaims).where(inArray(leaderboardClaims.host, hosts))
    : [];
  const claimByHost = new Map(claims.map((c) => [c.host, c]));
  // Drop hidden listings; apply OG overrides for display.
  const visible = deduped
    .filter((r: Row) => !claimByHost.get(r.host ?? "")?.isHidden)
    .map((r: Row) => {
      const c = claimByHost.get(r.host ?? "");
      return {
        ...r,
        ogTitle: c?.ogTitleOverride ?? r.ogTitle,
        ogDescription: c?.ogDescriptionOverride ?? r.ogDescription,
        verified: !!c,
      };
    });
```
Then replace subsequent uses of `deduped` in the render/JSON-LD with `visible` (the mapped list). (`pinnedAuditId` is a deeper change, out of scope for this task; note it as a future refinement. The dedup already shows most-recent; pinning a specific older audit would require a per-host override in the query. Skip pin enforcement here; the column exists and `updateClaimAction` can set it, but the query honoring it is deferred.)

- [ ] **Step 2**: In the card render, add a "verified ✓" chip when `r.verified` (alongside the "Notable" chip from Plan 2):
```tsx
                  { r.verified && (
                    <span className="absolute left-3 bottom-3 z-10 inline-flex items-center gap-0.5 rounded-[8px] bg-success/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-success shadow-sm">
                      ✓ verified
                    </span>
                  ) }
```
(Adjust the `Row` type usage: the mapped `visible` items have `verified`; update the `.map` callback parameter type accordingly, or let inference handle it.)

- [ ] **Step 3**: `npx tsc --noEmit -p tsconfig.json` → clean.
- [ ] **Step 4**: Commit:
```bash
git add src/app/leaderboard/page.tsx
git commit -m "feat(leaderboard): apply claims, verified chip, hide, OG overrides"
```

### Task 6: claim CTA + verified mark + nofollow-until-verified on `/r/[slug]`

**Files:** `apps/web/src/app/r/[slug]/page.tsx`; create `apps/web/src/components/report/claim-cta.tsx`.

- [ ] **Step 1**: Create a client component `apps/web/src/components/report/claim-cta.tsx` that:
  - takes `{ host: string; claimed: boolean; ownedByViewer: boolean }`,
  - if `claimed && ownedByViewer`: shows a "✓ You own this listing: get your badge" block linking to `/api/badge/<host>` with copy-embed snippet,
  - if `!claimed`: shows a "Claim this site" button that calls `claimHostAction(host)` (from `@/app/leaderboard/claim-actions`) in a transition, and on `{ error }` shows the DNS instructions via `getDnsClaimInstructionsAction(host)` (record name + value to publish, then "Verify" retries `claimHostAction`),
  - uses `toast` (sonner) for feedback. Mirror the structure/styling of an existing client action component (e.g. `components/report/visibility-toggle.tsx`). Keep numeric risk OFF any public-facing copy.

  Full reference implementation:
```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { claimHostAction, getDnsClaimInstructionsAction } from "@/app/leaderboard/claim-actions";
import { toast } from "sonner";

export function ClaimCta({ host, claimed, ownedByViewer }: { host: string; claimed: boolean; ownedByViewer: boolean }) {
  const [pending, start] = useTransition();
  const [dns, setDns] = useState<{ name: string; value: string } | null>(null);

  if (claimed && ownedByViewer) {
    const badge = `${typeof window !== "undefined" ? window.location.origin : ""}/api/badge/${encodeURIComponent(host)}`;
    const snippet = `<a href="https://pseolint.dev/leaderboard"><img src="${badge}" alt="Audited clean by pseolint" /></a>`;
    return (
      <div className="mt-6 rounded-[22px] border border-success/25 bg-success/5 p-5">
        <p className="text-sm font-medium text-foreground">✓ You own this listing.</p>
        <p className="mt-1 text-xs text-muted-foreground">Embed your verified badge, it links back to the leaderboard:</p>
        <pre className="mt-2 overflow-x-auto rounded-[10px] border border-border/60 bg-background/60 p-2 font-mono text-[11px] text-muted-foreground">{snippet}</pre>
      </div>
    );
  }
  if (claimed) return null; // claimed by someone else, no CTA

  function attempt() {
    start(async () => {
      const res = await claimHostAction(host);
      if ("ok" in res) { toast.success(`Verified via ${res.method.toUpperCase()}, listing claimed.`); location.reload(); }
      else {
        toast.error(res.error);
        if (!dns) setDns(await getDnsClaimInstructionsAction(host));
      }
    });
  }

  return (
    <div className="mt-6 rounded-[22px] border border-primary/25 bg-primary/5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Is this your site?</p>
          <p className="mt-1 text-xs text-muted-foreground">Claim it to manage the listing, get a verified badge, and a followed backlink.</p>
        </div>
        <button type="button" disabled={pending} onClick={attempt}
          className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {pending ? "Verifying…" : "Claim this site"}
        </button>
      </div>
      {dns && (
        <div className="mt-3 rounded-[10px] border border-border/60 bg-background/60 p-3 text-xs text-muted-foreground">
          <p>Add this DNS TXT record, then click “Claim this site” again:</p>
          <p className="mt-1 font-mono text-foreground">{dns.name}</p>
          <p className="font-mono text-foreground">{dns.value}</p>
          <p className="mt-1">(Or connect Google Search Console for this property for instant verification.)</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2**: In `apps/web/src/app/r/[slug]/page.tsx`:
  - Import the claims helper + component:
```ts
import { getClaim } from "@/lib/leaderboard-claims";
import { ClaimCta } from "@/components/report/claim-cta";
```
  - In `Page`, after `eligible` is computed and `host` is known, load the claim and ownership:
```ts
  const claim = row.host ? await getClaim(row.host) : null;
  const claimedByViewer = !!(claim && session?.user.id && claim.userId === session.user.id);
```
  - Render `<ClaimCta host={row.host ?? host} claimed={!!claim} ownedByViewer={claimedByViewer} />` only when `eligible` (claiming only makes sense for listed clean sites): place it near the existing CTA strip.
  - **nofollow-until-verified:** the outbound link to the audited site (currently `rel="noreferrer noopener"`, around line 220) becomes followed only when claimed+verified:
```tsx
          rel={ claim ? "noreferrer noopener" : "nofollow noreferrer noopener" }
```

- [ ] **Step 3**: `npx tsc --noEmit -p tsconfig.json` → clean.
- [ ] **Step 4**: Commit:
```bash
git add src/app/r/[slug]/page.tsx src/components/report/claim-cta.tsx
git commit -m "feat(report): claim CTA, verified badge embed, nofollow-until-verified"
```

---

## Final verification
- [ ] `npx vitest run src/lib/leaderboard.test.ts src/lib/leaderboard-claims.test.ts` → all pass.
- [ ] `npx tsc --noEmit -p tsconfig.json` → clean.
- [ ] `git diff --name-only main` → only the files listed across the tasks (+ unrelated carried WIP).

## Self-review notes (author)
**Spec coverage:** §5 verification (GSC fast-path + DNS) → Task 3 (reuses domain-verify + gsc). §6 conversion: badge+embed → Tasks 2 + 6; customize/pin/hide → Task 4 (+ query honors hide/OG in Task 5; pin column set but query-enforcement deferred, noted); monitoring/re-audit CTAs already exist (not rebuilt). §8 abuse: nofollow-until-verified → Task 6; takedown via `isHidden` → Tasks 4 + 5; clean-only + caps from Plans 1–2.
**Deferred/known:** `pinnedAuditId` is stored and settable but the leaderboard query does not yet substitute the pinned audit (most-recent still wins), explicitly deferred. A dashboard surface for `updateClaimAction` (hide/customize UI) is not built; the action exists and the report-page owner block can be extended later.
**Type consistency:** `claimToken(userId, host)`, `getClaim`, `isClaimedBy`, `verifyDnsClaim`, `verifyGscClaim` used consistently across Tasks 3/4/6. `leaderboardClaims` columns referenced identically in Tasks 1/4/5. HMAC uses `env().BETTER_AUTH_SECRET`.
**Parallelism:** Wave 1 (T1 schema ‖ T2 badge) disjoint files. Wave 2 (T3) needs T1. Wave 3 (T4) needs T1+T3. Wave 4 (T5, T6) need T1+T3+T4; T5 and T6 are NOT parallel with each other only because both… actually they touch different files (T5=leaderboard/page.tsx, T6=r/[slug] + new component) so T5 ‖ T6 IS safe.
