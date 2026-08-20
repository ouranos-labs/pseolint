# pseolint v1.1: UX Coherence Reframe

**Status:** Approved
**Date:** 2026-04-22
**Supersedes (partially):** `2026-04-21-pseolint-pro-reframe-design.md`, tiering, IA, nav, and the audit↔monitor bridge. The underlying data model (findings_state, integrations, upload_tokens, alerts_dedup, lastFullRunAt) is preserved and extended, not replaced.

## 1. Problem

The v1 Pro reframe shipped the monitoring infrastructure (scheduler, findings_state, fix queue, weekly digest, integrations panel) but the UX around it is incoherent:

- No bridge between `/` (one-shot audit) and `/dashboard` (monitoring). A user runs an audit, lands on `/r/:uuid`, and has no way to promote that domain into monitoring.
- No onboarding. A Pro user pays, lands on an empty dashboard, and has nothing to do: no "Add domain" action.
- Nav flattens sub-sections of the dashboard (Queue, Integrations) into peers of marketing pages (Leaderboard, Pricing).
- Queue is orphaned from the portfolio: no way to filter by domain or drill into a domain's findings.
- Report page (`/r/:uuid`) is unaware of auth state: anon, free, and Pro see the same CTAs (none).
- Free tier in-product experience is invisible: signed-in free users get no dashboard at all.
- Public URLs expose raw database UUIDs.

## 2. Goals

1. Every signed-in user has a coherent home that matches their tier.
2. The audit → monitor flow is a single intent-preserving path, not a context switch.
3. Pro users get a per-domain workspace so the dashboard has a destination beyond the portfolio row.
4. Free tier has enough in-product value to create a Pro upsell moment.
5. Public URLs stop exposing database PKs.

## 3. Non-goals

- Team seats / multi-user orgs (future).
- Run-diff view (`compare a=… b=…`): deferred to v1.2.
- Per-finding history timeline: deferred to v1.2.
- Native Webflow / WordPress integrations: already scoped to v1.1/v1.2 in prior spec; unchanged here.
- SSO / SAML / beyond existing magic-link + Google.

## 4. Tiering

| | Anon | Free (signed-in) | Pro ($19/mo) |
|---|---|---|---|
| Pages per audit (web UI) | 50 | 200 | unlimited |
| Audits per day | 3 per IP | unlimited | unlimited |
| Report retention | 24h | 30d | forever |
| Personal history |: | yes (last 30d) | yes (forever, all domains) |
| AI triage in web UI |: | 1 per calendar month | always on |
| Monitoring (scheduled audits) |: |: | unlimited domains |
| Fix queue |: |: | yes |
| Integrations (GSC, GH Action, tokens) |: |: | yes |
| Private hosted reports + PDF export |: |: | yes |

**CLI + GitHub Action:** always free, no caps, no account required. Pro removes the ops burden (managed AI, hosted infra) for users who don't want to self-host.

## 5. Information architecture

**Public (anon + signed-out):**
- `/`: landing + audit form (hero)
- `/r/:slug`: audit report
- `/pricing`
- `/leaderboard`
- `/privacy`, `/terms`
- `/signin`

**Signed-in, all tiers:**
- `/dashboard`: tier-aware home (see §7)
- `/dashboard/settings/account`: email, timezone, delete account
- `/dashboard/settings/billing`: current plan summary + link to Polar portal

**Pro only:**
- `/dashboard/:slug`: per-domain workspace
- `/dashboard/:slug/settings`: cadence (read-only v1), alert threshold override, GSC property binding
- `/dashboard/queue`: cross-portfolio triage
- `/dashboard/integrations`: GSC, GitHub Action recipe, daily diff-audit, Webflow/WordPress placeholders
- `/dashboard/settings/tokens`: upload token management
- `/dashboard/settings/alerts`: org-wide alert defaults

**Logo / home routing:** anon → `/`; signed-in → `/dashboard`. The same rule applies to the sign-in redirect, Polar checkout success URL, and any "home" button.

**URL slugs:** every public-facing entity gets a short nanoid(10) slug distinct from its database UUID, indexed unique. Routes only use slugs; database PKs stay internal.

## 6. Navigation (two-layer)

**Top bar, global, persistent on every page:**
- Anon: logo · Pricing · Leaderboard · GitHub · Sign in
- Signed-in: logo · account menu (avatar → Settings / Billing / Sign out). Marketing links (Pricing, Leaderboard, GitHub) move to the footer.

**Dashboard sub-nav, only under `/dashboard/*`:** left sidebar on desktop, collapsible top tabs on mobile.
- Free: *History* only (home).
- Pro: *Portfolio · Queue · Integrations · Settings*.
- When inside a per-domain workspace, the sub-nav is replaced by breadcrumbs: `Portfolio / example.com / Settings`.

The marketing top-bar is not rendered inside `/dashboard/*` on narrow viewports (mobile); desktop keeps both layers for continuity.

## 7. Home states

### 7.1 `/dashboard` (free tier)
- **Header:** "Your audits" + compact "Upgrade to monitoring" dismissible banner.
- **Hero:** audit form: URL input + "Run audit" button (same engine as `/`, honoring the 200-page cap).
- **Below:** list of this user's last 30 days of audits. Columns: URL, score, findings, run-at, actions (View → `/r/:slug`, Share copy-link).
- **AI triage teaser:** on each row, a "✨ Explain fixes" button. Triage is always run inline during the audit for Pro (`ai.enabled=true`). For free, the button calls a new `POST /api/audits/:slug/triage` endpoint that loads the stored summary, runs triage once, persists the result back to the audit row (`triageRootCauseCount`, `triageCostUsd`) and increments the `usage_log` counter. First click in a calendar month works; subsequent calls reject with 402 + paywall modal.
- **Empty state:** illustration + "Run your first audit" CTA pointing at the hero form.

### 7.2 `/dashboard` (Pro tier)
- **Header:** "Portfolio" + "+ Add domain" button.
- **Portfolio strip:** as today. One row per monitored domain: domain, score trend sparkline (last 14 days), open findings count, last audit timestamp, GSC-connected indicator, row-level "Re-audit now" + overflow menu (Remove from monitoring).
- **Empty state (first-time Pro user):** hero-sized add-domain card with URL input + "Start monitoring →". Copy: "We'll run a full audit immediately, then check daily for changes."
- **Row action: "+ Add domain":** URL input (normalized to origin), "Start monitoring" submits → creates `monitoredDomain` row, enqueues initial full audit, redirects to `/dashboard/:slug`.

### 7.3 `/dashboard/:slug` (Pro per-domain workspace)
- **Header:** domain (linkified), score (big) + 14-day sparkline, "Re-audit now" primary button, overflow menu (Settings, Remove from monitoring, Copy public report link).
- **Timeline strip:** last 30 days of runs: dots per run, color-coded by score delta from prior run. Hover → tooltip with run date, score, findings count, link to `/r/:runSlug`.
- **Current findings:** grouped by severity (Critical → Error → Warning → Info). Each finding row: rule name, affected pages count, representative URL, CMS-rewritten message, actions (Snooze 7d / Dismiss, Explain with AI). Suppressed (snoozed + dismissed) behind a toggle.
- **Fix context:** small "Rank score: X" per finding when GSC is connected (shows why it's prioritized).

### 7.4 `/dashboard/:slug/settings`
- **Cadence:** read-only v1: "Daily diff-audit · Weekly full re-audit". Future: editable.
- **Alert threshold:** override the org default (score drop ≥ N, default 10). Empty = inherit.
- **GSC binding:** select property from connected GSC. Empty = disabled.
- **Danger zone:** "Remove from monitoring" (soft-delete, preserves history).

## 8. Report page `/r/:slug`: context-aware CTAs

Report body unchanged. Top CTA strip varies by (auth state, audit ownership, monitoring state):

- **Anon:** "Keep this in history: sign in" (secondary) + "Monitor this domain with Pro" (primary). "Monitor" link: `/pricing?intent=monitor&audit=:slug`.
- **Free, own audit:** "Save to history" (already saved, shown as satisfied state) + "Monitor this domain" primary → `/pricing?intent=monitor&audit=:slug`.
- **Free, someone else's audit (shared link):** "Run this audit yourself" (opens `/dashboard` hero form pre-filled) + "Monitor this domain with Pro" (same as anon).
- **Pro, own audit of a monitored domain:** banner "Already in your portfolio →" linking to `/dashboard/:domainSlug` + "Re-audit now" on workspace.
- **Pro, own audit of a *not*-monitored domain:** "+ Add to monitoring" primary → same add-domain flow as portfolio, pre-filled with the audit's origin.
- **Pro, someone else's audit:** "Run this audit yourself" + "+ Add to monitoring".

Reports always remain publicly shareable via `/r/:slug`. "Private hosted reports" for Pro (in pricing copy) refers to a future feature where Pro users can toggle a report to unlisted (requires auth, still linkable). Not in scope for this spec.

## 9. Canonical flows

### Flow A: Anon audit
`/` → submit audit form → submit validates IP rate limit (3/day) → enqueue audit with `anonSessionId` + 24h `expiresAt` → redirect to `/r/:slug` with polling to completion → anon CTAs (see §8).

### Flow B: Free audit
`/dashboard` (or `/`) → submit audit form → enqueue with `userId` + 30d `expiresAt` → redirect to `/r/:slug` with polling → free CTAs. Audit appears in `/dashboard` history list.

### Flow C: Monitor-this-domain (intent-preserving checkout)
User on `/r/:slug` hits "Monitor this domain" → `/pricing?intent=monitor&audit=:slug`. Pricing page checkout buttons carry intent forward: Polar checkout created with `metadata.intent="monitor"`, `metadata.auditSlug=:slug`. On webhook success:
1. Read `metadata.auditSlug`, resolve audit → normalize `sourceUrl` to origin.
2. Create `monitoredDomain` row for that user + origin (or reuse if exists).
3. Enqueue initial full audit.
4. Redirect success URL → `/dashboard/:newDomainSlug?welcome=1`.

Welcome state: small banner "Initial audit running… we'll email you when it's ready." Banner dismisses when audit completes or after 5 min poll timeout.

### Flow D: Pay-first
User on `/pricing` → Subscribe (no intent) → Polar checkout → webhook → redirect `/dashboard?welcome=1`. Empty-state hero prompts "Add your first domain". Same add-domain flow as portfolio button.

### Flow E: Pro re-audit on demand
User hits "Re-audit now" on portfolio row or workspace header → enqueue full audit for that domain → toast "Audit started, ~2 min" with link to `/dashboard/:slug`. Timeline strip refreshes on completion (server-sent event or poll).

### Flow F: Fix queue triage
`/dashboard/queue` shows findings ranked by severity × pages (× log₁(GSC impressions) if connected). Domain filter chip in header (also respected via `?filter=domain=<slug>` for deep-linking). Snooze / dismiss per row. Link from each row → `/dashboard/:slug#finding-<id>` for context.

### Flow G: Alert email → fix
Monitoring alert email body deep-links to `/dashboard/queue?filter=domain=<slug>&since=<runSlug>`, queue filtered to the specific domain and runs since the triggering audit. User triages from there.

## 10. Data changes

### Additive columns / tables
- `monitoredDomains.slug text unique not null`: nanoid(10), URL-safe. Populated on insert. Migration backfills existing rows.
- `monitoredDomains.removedAt timestamptz`: soft delete. Queries filter by `removedAt is null`.
- `audits.slug text unique not null`: nanoid(10), URL-safe. Replaces `audits.id` in all routes `/r/:slug`. Migration backfills existing rows; `audits.id` stays as internal PK.

### New table: `usage_log`
Enforces the free-tier AI triage monthly cap.

```
usage_log (
  user_id text references user(id) on delete cascade,
  kind text,            -- 'ai_triage'
  month_yyyymm text,    -- e.g. '2026-04'
  count integer not null default 0,
  primary key (user_id, kind, month_yyyymm)
)
```

Query: `select count from usage_log where user_id=? and kind='ai_triage' and month_yyyymm=current_month`. Enforce `count < 1` for free tier before dispatching triage.

### New table: `alert_defaults`
Org-wide alert threshold defaults. Single row per user for v1.

```
alert_defaults (
  user_id text primary key references user(id) on delete cascade,
  score_drop_threshold integer not null default 10,
  recipient_emails text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

Per-domain overrides live on a new `monitored_domain_alerts` table (future); v1 uses org defaults only.

### Anon rate limiting
Reuse existing `rate_limit` table. Key pattern: `anon:audit:<sha256(ip)>:<yyyy-mm-dd>`. Increment on anon audit submit; reject at count ≥ 3. TTL 25h. Source IP resolution: trust `x-forwarded-for` only in prod behind Vercel (see `src/lib/ip.ts` if present, otherwise add).

### New API: `POST /api/audits/:slug/triage`
Used by the free-tier "Explain fixes" button. Auth: session required, audit must be owned by session user. Flow: load audit summary from R2 → run `triage()` from `@pseolint/core` → persist result → increment `usage_log(user_id, 'ai_triage', month_yyyymm)`. Atomic guard: transaction around count check + increment. Return updated triage payload (inline to avoid re-fetch). 402 when monthly quota exhausted.

### Intent-preserving checkout
Polar checkout creation reads `?intent=monitor&audit=:slug` from `/pricing` query, passes both as `metadata`. Webhook handler branches on `metadata.intent`.

### No-ops for existing schema
`findings_state`, `integrations`, `gsc_page_metrics`, `upload_tokens`, `alerts_dedup`, `monitored_domains.last_full_run_at`, unchanged.

## 11. Page-by-page delta summary

| Page | State today | After this spec |
|---|---|---|
| `/` | Audit form hero + marketing sections | Same, no change (anon-focused) |
| `/r/:uuid` | Report, no CTA | `/r/:slug`, context-aware CTA strip |
| `/pricing` | Subscribe buttons | Add `?intent=monitor&audit=` plumbing |
| `/dashboard` | Portfolio strip (Pro only) + empty for free | Tier-aware: free = history + audit form; Pro = portfolio + "+ Add" |
| `/dashboard/queue` | Cross-portfolio list | Add domain filter chip + deep-link query params |
| `/dashboard/integrations` | GSC + GH Action + tokens + placeholders | Unchanged |
| `/dashboard/settings/tokens` | Token management | Unchanged (already at this path; grouped under Settings in new sub-nav) |
| `/dashboard/:slug` |: (new) | Per-domain workspace: timeline, findings, actions |
| `/dashboard/:slug/settings` |: (new) | Per-domain alert/GSC overrides |
| `/dashboard/settings/account` |: (new) | Email, timezone, delete |
| `/dashboard/settings/billing` |: (new) | Plan + Polar portal link |
| `/dashboard/settings/alerts` |: (new) | Org alert defaults |

## 12. Security considerations

- **Slug enumeration:** nanoid(10) = ~60 bits of entropy; not brute-forceable. Slugs are treated as bearer capabilities for anon sharing (same as today with UUIDs).
- **Ownership checks:** every `/dashboard/:slug`, `/dashboard/:slug/settings`, and action on a finding verifies `monitoredDomains.userId = session.userId`. Resolve slug → row, compare userId, 404 on mismatch.
- **Intent checkout:** `metadata.auditSlug` is trusted only after verifying the audit belongs to the same user (or is anon and the user owns the new subscription: in which case we attach the audit's origin, not the audit itself).
- **IP rate limit:** sha256 hash of IP before storing in `rate_limit.key`: no raw IPs at rest.
- **AI triage metering:** enforce server-side on triage dispatch, not client-side on button visibility.
- **Soft delete:** `removedAt` prevents hard deletion leaking into history; cascade deletes still apply if the user deletes their account.

## 13. Rollout

1. Data migration: add slugs, backfill, then switch routes. Old UUID routes 301 to new slug for one release (URL rewrites only, not recommended for secret reports).
2. Nav split: ship top-bar changes + dashboard sub-nav together.
3. Free dashboard: ships independently, no Pro user impact.
4. Per-domain workspace: hardest piece; ship last.
5. Intent-preserving checkout: shippable independently once slug routes land.

Feature flagging is not needed, the new UX is a coherent whole; shipping pieces separately would create half-states worse than today.

## 14. Open questions deferred

- **AI triage teaser UX:** 1/month is generous enough to hit; metering UI (remaining count shown in-page?) not specified in v1: start with quiet enforcement + paywall modal, iterate.
- **Portfolio sort:** default order when user has 10+ domains? v1: most-recently-audited first. Add toggle later.
- **Mobile dashboard:** sub-nav collapses to top tabs. Per-domain workspace timeline strip may need horizontal scroll; detail pass during implementation.
