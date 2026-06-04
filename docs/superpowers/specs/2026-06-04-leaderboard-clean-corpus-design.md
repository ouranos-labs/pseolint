# Leaderboard → Permanent Clean-Corpus + Seeding — Design Spec

**Date:** 2026-06-04
**Status:** Approved (brainstorm), pending implementation plan
**Area:** `apps/web` — leaderboard, audit lifecycle, result pages, ownership/claims

## Problem

The leaderboard is barren. Today the listing query (`apps/web/src/app/leaderboard/page.tsx`) gates only on `isPublic = true ∧ completed ∧ host ∧ risk present ∧ pageCount ≥ 5 ∧ expiresAt > now`. Anonymous audits *do* qualify — but anonymous audits get `expiresAt = addDays(1)` (`apps/web/src/app/api/audits/route.ts:285`), so they flicker onto the board for 24h and then expire and vanish. Free accounts persist 30 days; Pro never expires.

Two missed opportunities:
1. **No durable SEO corpus.** Every clean audit is a potential permanent, indexable `/r/[slug]` + leaderboard entry, but anonymous ones (the bulk of acquisition traffic) evaporate in a day.
2. **No cold-start content.** New visitors see an empty or near-empty board, which undercuts virality, benchmarking, and conversion.

## Goals

Turn the leaderboard into a large, persistent, high-quality public directory that serves four purposes simultaneously:
- **SEO surface** for pseolint (indexable corpus that grows on its own).
- **Virality / social proof** (a full, shareable board).
- **Competitive benchmarking** (operators compare against peers).
- **Conversion lever** (the board funnels anonymous auditors into accounts).

## Non-negotiable principles

- **Clean-only public listings.** Only passing sites (`risk < 40`) are ever *named* publicly. This dissolves the defamation/abuse surface: a clean listing cannot be weaponized against a competitor, and it keeps the "cleanest pSEO sites on record" brand intact.
- **Real audits only.** Every score — including seeded entries — is an actual engine run, dated and reproducible. No hand-assigned scores. This protects the "stable, repeatable results" credibility claim.
- **Owner control via claim.** Any listed site can be claimed by its verified owner, who can then customize, pin, or hide (instant takedown) the entry.

## Key decisions (from brainstorm)

| Decision | Choice |
|---|---|
| Listing policy | Hall of fame — clean only (`risk < 40`). Failing/thin audits still get a private `/r/[slug]` result page, but no public listing. |
| Retention for clean public audits | **Permanent archive.** Show audit date; re-audit supersedes. |
| Ownership / abuse model | **Two-tier (Approach A):** open clean board + *optional* verified claim that unlocks perks and control. Verification never gates *appearing* (that would shrink the corpus). |
| Conversion hooks | All four: verified badge+embed, monitoring upsell, claim-to-customize/pin, re-audit/improve CTA. |
| Seeding | **Hybrid:** system runs real audits on a curated list of known pSEO sites. Clean → named as "Notable". Failing → **never named**, feed an aggregate editorial stat only. |

## Architecture

### 0. Indexability flip (the core SEO enabler) — REQUIRED

This is the load-bearing change the rest of the SEO goal depends on, and it reverses a deliberate existing decision.

Today **every** `/r/[slug]` report page is `robots: { index: false, follow: false }` (`apps/web/src/app/r/[slug]/page.tsx:50–52`), with the explicit rationale "Reports describe third-party sites; we never want them indexed by search engines." With clean-only listings that blanket rule is no longer appropriate — but it must be relaxed *surgically*, not removed:

> A `/r/[slug]` page is set `index: true, follow: true` **only when it is leaderboard-eligible** (clean ∧ public ∧ listed ∧ not hidden ∧ not an expired/failing seed). Every other report — private, failing, thin, expired, owner-only, anon-ephemeral — keeps `index: false, follow: false`.

The clean-only gate is exactly what makes this defensible: we only ask Google to index pages that say a named site is *clean*. `generateMetadata` already loads the row; it computes eligibility and chooses the robots directive. Listing without this flip yields an internal directory of `noindex` pages — i.e. no organic SEO surface at all, which is the whole point.

Public-surface copy on these pages stays **verdict/grade-based, never numeric** (consistent with the existing v0.4 "no 84/100 in public/screenshot surfaces" rule).

### 1. Eligibility (explicit rule)

> An audit is **leaderboard-eligible** when:
> `isPublic ∧ status = "completed" ∧ host present ∧ pageCount ≥ 5 ∧ risk < LEADERBOARD_RISK_MAX`

`LEADERBOARD_RISK_MAX = 40` (A/B bands). Defined as a named constant so it's tunable; A-only (`< 20`) is a future knob, not now.

### 2. Retention via `expiresAt` (no new retention column)

Eligibility and result-page lifetime stay fused through `expiresAt` — this is deliberate: one lever keeps both the `/r/[slug]` page alive and the listing visible, so a listing can never point at an expired (404) result page.

At audit completion in `apps/web/src/inngest/functions/run-audit.ts`, after risk is known:
- If the audit is **leaderboard-eligible**, set `expiresAt` to the far-future sentinel `new Date("9999-12-31T23:59:59.999Z")` (the same value Pro already uses — chosen because JS max date doesn't round-trip through Postgres `timestamptz`). This makes clean public audits permanent **regardless of tier**, including anonymous.
- If **not eligible** (failing, thin, or private), keep the tier default already set at creation (anon 1 day, free 30 days, Pro far-future).

Implication: anonymous failing audits still expire in 24h (their `/r/slug` page is ephemeral); anonymous *clean* audits become permanent. `expire-reports.ts` continues to delete storage for expired audits — unchanged, and now correctly leaves clean entries alone.

### 3. Supersede semantics + correctness fix

The current query is `DISTINCT ON (host) … ORDER BY host, risk, createdAt`, which selects the **lowest-risk audit ever** per host. The methodology prose claims "most recent audit per domain." These contradict, and "lowest-risk-ever" is gameable (audit clean once, let the site rot, keep the trophy).

**Fix:** order by `host, createdAt DESC` so the **most-recent** audit per host wins. Combined with the `risk < 40` gate this yields honest supersede: a re-audit replaces the prior score, and a site that degrades below the bar **drops off** the board. Resolves the bug and the gaming vector together.

After the DISTINCT ON pass, JS re-sorts by risk ascending for display order (as today).

### 4. Schema changes (one migration)

- **`audits.source`** — enum-typed text `"user" | "seed"`, `NOT NULL DEFAULT 'user'`. Marks system-seeded entries (for the "Notable" chip and to exclude them from user-facing rate-limit accounting).
- **`leaderboardClaims`** — new table, one row per claimed host:
  - `host` text PRIMARY KEY (or unique)
  - `userId` text → `users.id` (cascade)
  - `verifiedAt` timestamptz NOT NULL
  - `method` text `"dns" | "gsc"`
  - `ogTitleOverride` text nullable
  - `ogDescriptionOverride` text nullable
  - `pinnedAuditId` uuid nullable → `audits.id`
  - `isHidden` boolean NOT NULL DEFAULT false (owner takedown)
  - index on `userId`

Absence of a row = unclaimed.

### 5. Verification / claim flow

`/r/[slug]` and leaderboard cards show a **"Claim this site"** CTA for unclaimed hosts. Claiming is account-gated (the signup wall) and requires proving ownership of the host:
- **GSC fast-path:** if the user has a connected GSC integration (`integrations` kind `"gsc"`) whose property covers the host, claim is instant.
- **DNS TXT fallback:** present `pseolint-verify=<token>`; user adds the TXT record; verify server-side. No Google dependency.

On success, insert/update the `leaderboardClaims` row.

### 6. Conversion hooks (all map onto the claim)

1. **Verified badge + embed** — claimed hosts get an embeddable snippet linking back to their `/r/[slug]`. Badge copy is **grade/verdict-based, not numeric** ("Audited clean · Grade A" / "Ready"), to honour the existing rule that no numeric `risk` appears on public/screenshot surfaces. Every embed is a *followed* backlink → compounding SEO. Unclaimed sites see a "claim to get your badge" teaser.
2. **Monitoring upsell** — CTA "Track this score, get alerted if it drops" routes into the existing `monitoredDomains` / Pro flow.
3. **Claim to customize/pin** — claimed owner sets `ogTitleOverride` / `ogDescriptionOverride` (card copy), `pinnedAuditId` (which audit displays), and `isHidden` (instant takedown).
4. **Re-audit / improve CTA** — sites *near* the bar (risk 40–55, just off the board) see "Fix N findings and re-audit to make the board" on their result page → pulls re-runs and signups.

### 7. Seeding pipeline (hybrid)

- Curated list in a versioned repo file: `apps/web/src/data/seed-sites.ts` (hosts + optional category). Reviewed in PRs; not a DB free-for-all.
- An **Inngest function** (manual trigger + optional monthly cron) audits each seed host **for real** through the normal pipeline, with `source = "seed"`, `userId = null`, `isPublic = true`.
- **Clean** (`risk < 40`) → listed with a subtle **"Notable"** chip; claimable by the real owner like any unclaimed entry.
- **Failing** → **never named.** Excluded from listing (same clean-only gate) and instead counted into an **aggregate stat** rendered in the methodology section: *"We audited N well-known pSEO sites; M passed; median score X."* Cold-start credibility with zero named-brand exposure.
- Since seeded audits are created by the Inngest function (not `route.ts`), the function sets the initial `expiresAt` itself: clean seeds inherit the eligibility→permanence extension at completion like any audit; **failing seeds get a short default expiry (e.g. 7 days)** so their unnamed result pages don't accumulate storage.
- The **aggregate stat is a snapshot written by the seeding run** (e.g. a small `seedStats` singleton row: `auditedCount`, `passedCount`, `medianRisk`, `computedAt`), not computed from live audit rows. This decouples the headline number from individual result-page expiry, so failing seeds can expire without losing the "N audited / M passed" credibility figure.

### 8. Abuse controls

- **Clean-only** → no defamation surface.
- **`rel="nofollow ugc"`** on every outbound link to an audited site **until the host is claimed+verified** → kills backlink-farming via mass clean submissions. A verified owner's badge link is followed (earned).
- **Per-anon-session & per-IP cap on distinct hosts listed per day** (reuse `bumpRateLimit`) → kills board-padding.
- **Takedown:** owner claims → `isHidden = true` removes instantly; plus a lightweight no-account takedown form as backstop.

### 9. UI / copy changes

- Leaderboard query: add `risk < 40`, switch to most-recent-per-host, left-join `leaderboardClaims` to render "verified ✓" / "Notable" chips, apply OG overrides and `pinnedAuditId`, and exclude `isHidden`.
- Empty-state retained but will rarely render post-seed.
- Methodology prose (`leaderboard/page.tsx` ~234–308) rewritten: it currently states "anonymous entries fall off after 24 hours" and "most recent audit per domain" inconsistently. New copy describes clean-only permanence, supersede, seeding + the aggregate stat, and the claim flow.
- **`/r/[slug]` retention copy must be reconciled** — several strings assume the old fixed windows and become false for clean-anon-permanent audits:
  - The anon "This report auto-deletes in Nh · Save this report" CTA (`r/[slug]/page.tsx:256–273`): for an *eligible* (clean) anon audit, it no longer auto-deletes, so the pitch flips to a leaderboard/claim framing ("This site is on the public leaderboard — sign in to claim it, get your badge, and monitor it"). For *non-eligible* anon audits the 24h "save it" pitch stays.
  - The "About this audit" auto-delete blurb (`:343–349`) and `ExpiredState` copy (`:908–925`) must branch on eligibility rather than hard-coding "24 hours / 30 days".

## Out of scope (YAGNI)

Public user profiles, historical score charts on the board, paid placement, category sub-leaderboards.

## Affected files (indicative, not exhaustive)

- `apps/web/src/app/leaderboard/page.tsx` — query, chips, overrides, methodology copy, aggregate stat
- `apps/web/src/app/api/audits/route.ts` — (no retention change at creation; permanence is applied post-completion)
- `apps/web/src/inngest/functions/run-audit.ts` — extend `expiresAt` when eligible
- `apps/web/src/db/schema.ts` + new migration — `audits.source`, `leaderboardClaims`
- `apps/web/src/app/r/[slug]/page.tsx` — **eligibility-gated `index`/`follow` in `generateMetadata`** (the SEO enabler), claim CTA, badge teaser, re-audit CTA, nofollow logic, and reconciled retention copy (anon CTA / About blurb / ExpiredState)
- new: claim verification action(s) (DNS TXT + GSC fast-path), badge embed endpoint, seed list + seeding Inngest function, takedown form

## Open questions / defaults chosen

- **Threshold** = `risk < 40` (A/B). Tunable constant.
- **Near-the-bar CTA band** = risk 40–55. Tunable.
- **Seed cron cadence** = monthly + manual trigger. Start manual-only if simpler.
- **DNS TXT vs GSC** — both supported; GSC is the fast-path when already connected.
