# pseolint SaaS MVP Design

**Status:** Draft, 2026-04-19
**Author:** philippe.kam27@gmail.com + Claude (Opus 4.7)
**Motivation:** The OSS `pseolint@0.2.1` is feature-complete for solo CLI use. Turning it into a hosted product opens a revenue channel and a distribution surface (public shareable report URLs → organic acquisition) that the CLI alone can't provide. Zero existing audience, the product must acquire through its own viral loop, not a launch audience.

## Goal

Ship a minimal audit-as-a-service: user pastes a URL, gets a shareable HTML report within 2 minutes. Free tier drives viral loop via public report URLs. $19/mo paid tier unlocks AI triage, per-user generosity caps, and permanent private history. Target: first paying customer within 14 days of v1 going live.

## Non-Goals (v1)

- **Scheduled audits / monitoring.** Deferred: the one-shot audit wedge must validate first.
- **Email/Slack alerts on regression.** v2, gated on monitoring feature.
- **Team accounts / RBAC.** Target is solo operators; agencies are v1.1+.
- **Public API.** v3.
- **GitHub Action distribution.** Exists in OSS; hosted version deferred.
- **Headless browser rendering (`--render`).** SSRF/XSS blast radius too wide for v1; users who need rendered pages run the CLI.
- **Custom rules editor.** v3.
- **White-label / custom branding.** v3.
- **Account dashboard / history page.** Deferred to v1.1: post-audit email is the v1 UX.
- **Multi-site overview dashboard.** v1.1+.
- **Usage-based or overage billing.** Flat subscription with hard rate-limits is simpler to reason about.

## Architecture

Serverless-forward, 6 vendors, each doing one thing:

```
Browser ── Vercel (Next.js) ──┬── /api/audits (POST) ── enqueue ──► Inngest (durable worker)
                              │                                         │
                              │                                         ▼
                              │                                     pseolint@0.2.1 (+ SSRF fetch override)
                              │                                         │
                              ├── /api/checkout ── Polar.sh              │
                              ├── /api/webhooks/polar ◄── Polar          │
                              ├── /api/auth/** ─► Better Auth ─► Neon + Resend (magic link)
                              ├── /r/<uuid> ── signed URL ──► Cloudflare R2
                              └── /leaderboard ── Drizzle query ──► Neon
                                                                         │
                                                              ▼          ▼
                                                        R2 (HTML report) + Neon (audit row, via Drizzle)
```

### Vendor map

| Layer | Service | Integration shape |
|---|---|---|
| Frontend + API routes | Vercel (Next.js 15 App Router) | Ship as `apps/web/` in the existing monorepo |
| Background jobs | Inngest (durable execution, 10 min/step) | Inngest SDK in API route + `serve` function at `app/api/inngest/route.ts` |
| Database | **Neon** (serverless Postgres) | Connection pooling via `@neondatabase/serverless`; branch-per-preview on Vercel |
| ORM / migrations | **Drizzle** | Schema-first TypeScript; `drizzle-kit` for migrations; end-to-end typed queries |
| Auth | **Better Auth** (magic-link + Google OAuth) | Auth tables live in OUR Postgres via Drizzle; no auth data owned by a third party |
| Report storage | **Cloudflare R2** (S3-compatible) | Public bucket for anonymous/free reports; signed URLs for paid-private |
| Transactional email | Resend | `resend` SDK; templates as React Email components; Better Auth delivers magic links through it |
| Bot gating | Cloudflare Turnstile (free) | Widget on audit form, server-side token verify on `/api/audits` |
| Payments | Polar.sh | Merchant-of-record: handles global VAT/tax. `@polar-sh/sdk` |
| Audit engine | `pseolint@0.2.1` (npm) | Programmatic import: `import { auditSource, formatHtml } from "pseolint"` inside Inngest function |

### Repository layout

The SaaS lives in the existing monorepo as a new app:

```
pseolint/
├── packages/         ← existing: core, cli, mcp, action
└── apps/
    └── web/          ← NEW: Next.js app
        ├── app/
        │   ├── page.tsx                       ← landing
        │   ├── a/[id]/page.tsx                ← audit progress + report
        │   ├── r/[uuid]/page.tsx              ← public report view
        │   ├── leaderboard/page.tsx           ← top-scored public audits
        │   ├── pricing/page.tsx
        │   ├── privacy/page.tsx               ← GDPR privacy policy
        │   ├── terms/page.tsx
        │   └── api/
        │       ├── audits/route.ts            ← POST: enqueue audit
        │       ├── audits/[id]/route.ts       ← GET: status polling
        │       ├── audits/[id]/visibility/route.ts ← PATCH: toggle public/private (paid)
        │       ├── checkout/route.ts          ← POST: create Polar checkout
        │       ├── webhooks/polar/route.ts    ← Polar events
        │       ├── auth/[...all]/route.ts     ← Better Auth handler (magic link, OAuth, session)
        │       ├── account/route.ts           ← DELETE: GDPR data deletion
        │       └── inngest/route.ts           ← Inngest serve endpoint
        ├── lib/
        │   ├── db.ts                          ← Drizzle client (Neon)
        │   ├── auth.ts                        ← Better Auth config
        │   ├── r2.ts                          ← R2 client + signed URL helpers
        │   ├── inngest.ts
        │   ├── polar.ts
        │   ├── resend.ts
        │   ├── ssrf.ts                        ← URL validation
        │   ├── rate-limit.ts                  ← IP + target-domain + user limits
        │   └── turnstile.ts                   ← bot verification
        ├── db/
        │   ├── schema.ts                      ← Drizzle schema (all tables)
        │   └── migrations/                    ← drizzle-kit output
        ├── inngest/
        │   └── functions/
        │       ├── run-audit.ts               ← audit worker
        │       ├── expire-reports.ts          ← scheduled: delete expired R2 objects
        │       └── cleanup-rate-limits.ts     ← scheduled: daily GC
        ├── components/                        ← shadcn/ui + custom
        └── emails/                            ← React Email templates (magic link, audit complete)
```

Rationale for monorepo placement:
- pseolint engine changes + SaaS changes ship together.
- Single `bun install` resolves all workspaces.
- Existing turbo pipeline extends naturally (`turbo run build --filter=web`).

### Data model (Drizzle schema, `db/schema.ts`)

Better Auth manages `users`, `sessions`, `accounts`, `verifications` tables via its own schema export (imported into `db/schema.ts`). Application-specific tables live alongside:

```ts
import { pgTable, uuid, text, integer, boolean, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./auth-schema";  // re-exported from Better Auth

export const userProfiles = pgTable("user_profiles", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  polarCustomerId: text("polar_customer_id").unique(),
  plan: text("plan").$type<"free" | "pro">().notNull().default("free"),
  planExpiresAt: timestamp("plan_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const audits = pgTable("audits", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),  // null = anonymous
  anonSessionId: text("anon_session_id"),  // cookie-bound, for anonymous audits
  sourceUrl: text("source_url").notNull(),
  status: text("status").$type<"queued" | "running" | "completed" | "failed">().notNull().default("queued"),
  isPublic: boolean("is_public").notNull().default(true),
  score: integer("score"),
  pageCount: integer("page_count"),
  findingCount: integer("finding_count"),
  triageRootCauseCount: integer("triage_root_cause_count"),
  triageCostUsd: numeric("triage_cost_usd", { precision: 10, scale: 4 }),
  storageKey: text("storage_key"),  // R2 object key
  errorMessage: text("error_message"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => ({
  userIdx: index("audits_user_idx").on(t.userId),
  publicLeaderboardIdx: index("audits_leaderboard_idx").on(t.isPublic, t.status, t.score),
  expiresIdx: index("audits_expires_idx").on(t.expiresAt),
}));

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),  // 'ip:<sha256>:<yyyy-mm-dd>' or 'domain:<host>:<yyyy-mm-dd>' or 'pro:<userId>:<yyyy-mm-dd>'
  count: integer("count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const webhookEvents = pgTable("webhook_events", {
  eventId: text("event_id").primaryKey(),     // Polar event id
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});
```

`userProfiles` is separated from Better Auth's `users` because Better Auth owns its schema shape. Our subscription/plan data lives in a sibling table keyed by the same user id.

### Authorization (no RLS: app-layer enforcement)

Authorization happens in every API route and server component that reads or mutates data. Every query is either:

- **Unauthenticated-safe** (e.g., `SELECT ... WHERE is_public = true AND status = 'completed' AND expires_at > now()` for public leaderboard / report views), or
- **User-scoped** via a helper `requireSession()` that asserts `session.userId` and every subsequent query is narrowed `WHERE user_id = <session.userId>` or `anon_session_id = <cookieSessionId>`.

Integration tests (mandatory) assert that:

- User A cannot read/update user B's audits via any endpoint.
- Unauthenticated requests cannot read private (`is_public = false`) audits.
- Unauthenticated requests cannot mutate any data.
- `rate_limits` and `webhook_events` are never exposed to the HTTP surface.

Dropping RLS means **no DB-level safety net for a bug in route authorization**, tests are load-bearing. This is an explicit trade-off for end-to-end typed queries + the cleaner Drizzle/Better Auth stack.

### Audit request flow (happy path)

1. **Browser →** `POST /api/audits` with `{ url, turnstileToken }`.
2. **API route:**
   - Verify Turnstile token (`fetch https://challenges.cloudflare.com/turnstile/v0/siteverify`). Reject if invalid.
   - Resolve session via Better Auth (`auth.api.getSession({ headers })`). If none → anonymous path; read/issue a `pseolint_anon` cookie (signed 128-bit random id) to key the anonymous session.
   - Hash the request IP (SHA-256 with server-side salt): never store raw IP.
   - Check rate limits via the Drizzle helper `bumpRateLimit`:
     - Anonymous: `anon:<anonSessionId>:<date>` (limit 1/session) + `domain:<host>:<date>` (limit 3 globally).
     - Authenticated free: `free:<userId>:<date>` (limit 3).
     - Authenticated pro: `pro:<userId>:<date>` (limit 50 AI-triage audits).
   - Validate URL with `ssrf.ts`: parse, reject non-HTTP(S), resolve DNS, reject private/loopback/link-local/cloud-metadata ranges.
   - Insert `audits` row via Drizzle with `status='queued'`, `expiresAt` set per tier (24h anon, 30d free, null pro).
   - Enqueue `inngest.send({ name: "audit/requested", data: { auditId, url, plan } })`.
   - Return `{ auditId, reportUrl: '/a/<id>' }` (202 Accepted).
3. **Browser →** `/a/<id>` renders a progress shell that polls `GET /api/audits/<id>` every 2s.
4. **Inngest worker** (runs as a Vercel serverless function invoked via Inngest's durable execution, 10 min hard budget per step):
   - Update row to `status='running'` via Drizzle.
   - Invoke `auditSource(url, { sampleSize: <tier-cap>, ai: { enabled: plan === 'pro', maxCostUsd: 0.50 } })`. The SSRF wrapper is installed as a `fetch` override in the worker bootstrap.
   - Catch + map error kinds to user-facing `errorMessage`.
   - Render HTML via `formatHtml(summary)`.
   - Upload to R2 at `reports/<uuid>.html` using the S3 SDK.
   - Update row: `status='completed'`, persist `score / pageCount / findingCount / storageKey / completedAt`, copy triage fields.
   - If authenticated: send completion email via Resend (`AuditCompleteEmail`).
5. **Browser poll** sees `status='completed'`, redirects to `/r/<uuid>` which streams the HTML report from R2.
6. **Public `/r/<uuid>` page** served by Next.js server component: reads `audits` row, respects `isPublic`; for public rows, streams the R2 object via a 5-minute signed URL; for private rows, requires a session matching `userId` (403 otherwise).

### Authentication flow (Better Auth)

Two login methods: **magic link** (universal) and **Google OAuth** (one-click for devs). No passwords. No GitHub OAuth in v1 (deferred to v1.1 per scope cut).

Better Auth configured (`lib/auth.ts`):

```ts
import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import { sendMagicLinkEmail } from "./resend";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  socialProviders: {
    google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! },
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => sendMagicLinkEmail(email, url),
      expiresIn: 60 * 15,  // 15 minutes
    }),
  ],
  session: {
    cookieCache: { enabled: true, maxAge: 60 * 5 },  // 5-min session-cache to reduce DB reads
  },
});
```

Flow, **new user, magic link:**

1. User clicks "Sign in" on any page → `/signin` form.
2. Enters email → Better Auth's `signIn.magicLink()` → email sent via Resend.
3. User clicks link (single-use, 15 min TTL, HMAC-signed) → `/api/auth/magic-link/verify` → session cookie set → redirect target.
4. First-time user: Better Auth inserts `users` row; our app inserts `userProfiles` row with `plan='free'`.

Flow, **Google OAuth:**

1. Click "Continue with Google" → Better Auth OAuth flow → Google consent → callback.
2. Session cookie set. Same first-time-user profile insertion.

Flow, **upgrade to Pro:**

1. `/pricing` → "Upgrade" → `POST /api/checkout` (requires session).
2. Creates Polar checkout session with `customer_email = session.user.email` → redirect to Polar.
3. On success, Polar redirects back to `/a/<id>?upgraded=1`.
4. Polar webhook `subscription.created` → `/api/webhooks/polar` verifies signature → upserts `userProfiles.polarCustomerId` and `plan='pro'` atomically.
5. Email confirmation via Resend.

### Payments flow (Polar.sh)

- **Products:** one subscription product with two prices: `monthly $19 USD` and `yearly $180 USD`.
- **Checkout creation** via Polar SDK with `customer_email` pre-filled.
- **Webhooks handled:** `subscription.created`, `subscription.updated`, `subscription.canceled`.
- **Idempotency:** each event's `id` is written to `webhook_events` table before processing; duplicate events short-circuit.
- **Signature verification:** Polar signs webhooks with a shared secret; `webhooks/polar/route.ts` uses `@polar-sh/sdk`'s built-in verifier.
- **Cancellation:** `plan_expires_at` set to period end; user retains Pro access until that date, then row transitions to `plan='free'` via a nightly cron (Inngest scheduled function) or on next API call: whichever first.

### Rate limiting

Atomic increment via a Drizzle `INSERT ... ON CONFLICT DO UPDATE ... RETURNING count` to avoid TOCTOU races:

```ts
import { rateLimits } from "@/db/schema";
import { sql } from "drizzle-orm";

export async function bumpRateLimit(key: string, limit: number): Promise<{ allowed: boolean; count: number }> {
  const expires = startOfNextUtcDay();
  const [{ count }] = await db
    .insert(rateLimits)
    .values({ key, count: 1, expiresAt: expires })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });
  return { allowed: count <= limit, count };
}
```

Keys:
- `anon:<anonSessionId>:<yyyy-mm-dd>`: limit **1** (anonymous, per cookie-bound session)
- `domain:<lower(host)>:<yyyy-mm-dd>`: limit **3** (global, applies to anonymous + free)
- `free:<userId>:<yyyy-mm-dd>`: limit **3**
- `pro:<userId>:<yyyy-mm-dd>`: limit **50** (only AI-triage audits count here)

Cleanup (Inngest scheduled function, runs daily at 02:00 UTC): `DELETE FROM rate_limits WHERE expires_at < now()`.

### SSRF defense (defense-in-depth)

Three layers:

1. **Application layer: `ssrf-req-filter`-backed URL check at ingress AND on every outgoing fetch inside the worker.** The library:
   - Parses URL, rejects non-HTTP(S) schemes.
   - Resolves DNS A/AAAA.
   - Rejects private, loopback, link-local, multicast, cloud-metadata (`169.254.169.254`, etc.), broadcast ranges.
   - Supports IPv6 edge cases (`::1`, `::ffff:127.0.0.1`, `fe80::/10`).
2. **Redirect re-validation.** pseolint's HTTP cache follows redirects; we install a `fetch` override in the worker bootstrap that routes every `fetch` through the SSRF check, re-resolving DNS on each hop. This catches DNS rebinding.
3. **Runtime sandbox.** Inngest's default execution environment runs our function as an HTTP POST to our Vercel endpoint (which in turn invokes the audit worker code on Vercel's serverless infrastructure). Vercel serverless functions have no VPC access to private networks by default. If our application-layer guards have a bug, the blast radius is limited to the public internet surface. We explicitly **do not** place any secrets for other org services in the worker's environment.

The worker also pins DNS resolution: after `ssrf-req-filter` validates an IP, the `fetch` is made to that IP directly (with `Host` header preserved) so the DNS can't rebind between check and fetch.

### Report access control

- **Anonymous + Free tier:** `isPublic = true` by default. `/r/<uuid>` viewable by anyone with the link. R2 object is served via the server component through a 5-minute signed URL (not direct bucket access); this limits scrape-at-scale and lets us attach our own headers (e.g., `X-Frame-Options`).
- **Pro tier:** `isPublic = false` by default. `/r/<uuid>` requires a session where `session.userId === audit.userId`. Owner can toggle `isPublic = true` via `PATCH /api/audits/<id>/visibility`.
- **Expiry:** `expire-reports` Inngest scheduled function (daily, 03:00 UTC) scans `audits WHERE expiresAt < now() AND storageKey IS NOT NULL`, deletes the R2 object, nulls `storageKey`, sets `status='expired'`.

### Leaderboard (viral loop #2)

Public page at `/leaderboard` shows the top 100 scored audits with `isPublic = true AND status = 'completed' AND expiresAt > now()`, sorted by `score ASC` (low score = "cleanest" site). Table columns: rank, domain (hostname-only, not full URL, to reduce PII sensitivity), score, pageCount, age.

Purpose: second viral-loop mechanism beyond shareable report URLs. Visitors see scores of real sites → run their own → share their placement. Cost: one SQL query per page load + Next.js ISR with 10-minute revalidation. Zero additional infra.

Guardrails:
- **Opt-out via robots-style flag:** `PATCH /api/audits/<id>/visibility` with `{ isPublic: false }` removes from leaderboard (also from public report access).
- **Domain deduping:** only the most recent audit per hostname appears on the leaderboard to prevent spam.
- **Minimum page count:** skip audits with `pageCount < 5` to filter out trivially-perfect tiny sites.

### Security hardening checklist

| Item | Measure |
|---|---|
| SSRF | Three-layer defense above |
| XSS in report | pseolint's HTML formatter already escapes (`escapeHtml` on label, rationale, narrative, ruleIds, URLs, messages): tested |
| CSRF on state-changing endpoints | Next.js same-site cookie default + explicit `Origin` header check on `/api/*` POSTs |
| Clickjacking | `X-Frame-Options: DENY` (helmet.js middleware: suggested in security guidance) |
| Content sniffing | `X-Content-Type-Options: nosniff` |
| HSTS | `Strict-Transport-Security` for 1y on production |
| Webhook replay | Polar signature verify + `webhook_events` idempotency table |
| Magic link leak | 15 min TTL, single-use, delivered via Resend (proper SPF/DKIM) |
| IP storage | SHA-256 + server-side salt: never store raw IPs |
| API keys in client | All keys in Vercel env; only `NEXT_PUBLIC_*` visible client-side (Turnstile site-key, Better Auth public base URL: both safe to expose) |
| Authorization bypass | No RLS: integration tests assert that every endpoint correctly scopes by `session.userId` or `anonSessionId`. Test matrix: each endpoint × each role (anon, free user A, free user B, pro user A) × allowed/denied resources |
| Rate limiting | IP + domain + user counters; Turnstile on all free audits |
| Open redirect | Reject URLs containing fragments that could be used for phishing; validate post-auth redirects against allowlist |
| Dependency CVEs | GitHub Dependabot + weekly `bun audit` in CI |
| GDPR | Privacy policy from day 1; `DELETE /api/account` removes user + all audits + report objects |

### Error handling

All errors fail closed:

| Scenario | Behavior |
|---|---|
| Turnstile verify fails | 400 with generic "bot check failed" |
| SSRF-rejected URL | 400 with "URL appears to be internal or unreachable" |
| Rate limit exceeded | 429 with `Retry-After` header + friendly page |
| Inngest worker throws unrecoverable | Update `audits.status = 'failed'`, `error_message` = user-safe text, email user if authenticated |
| pseolint internal throw | Caught, logged to Inngest console with full stack, user sees generic "audit failed: please retry" |
| Polar webhook bad signature | 400, logged, no side effects |
| Magic link expired/used | Redirect to `/` with error toast |
| Neon or R2 down | API returns 503 with `Retry-After`; UI shows maintenance message |
| AI triage fails | Audit still completes (non-AI report); paid user sees a note "AI triage unavailable for this run" |

### Testing strategy

- **Unit tests:** SSRF validator (all edge cases in the OWASP list), rate-limit logic, webhook signature verify, email template rendering.
- **Integration tests (authorization matrix):** spawn a Better Auth test harness with three roles: anon, free user A, free user B, pro user A. For every read/write endpoint, assert the intended allow/deny decision against each role and each target resource (own / other-user / public / private). Also assert that expiry cron deletes R2 objects and nulls `storageKey`.
- **E2E tests (Playwright):** full flow: anon user pastes URL → audit completes → report visible. Paid flow skipped in CI (Polar is third-party; use a mock checkout route for tests).
- **Load test:** k6 script hitting `/api/audits` at 10 RPS to verify rate limits hold.
- **SSRF smoke:** deploy-time check that hitting `http://169.254.169.254/` from the Inngest worker is rejected.

### Pricing and limits summary

Three-tier friction ladder to maximize email capture without killing the viral-loop entry point:

| Feature | Anonymous (no auth) | Free (email auth) | Pro ($19/mo or $180/yr) |
|---|---|---|---|
| Audits per day | **1 per session** (IP-bound) | 3 per user | 50 AI-triage audits/user |
| Target-domain rate limit | 3/day global | 3/day global |: |
| AI triage |: |: | ✓ |
| Page cap per audit | 50 | 50 | 200 |
| Report retention | 24 hours | 30 days | Permanent |
| Report default visibility | Public | Public | **Private (toggleable)** |
| Shareable URL | ✓ | ✓ | ✓ |
| Report history UI |: (v1.1 for Free+Pro) |: (v1.1) |, (v1.1) |
| Re-run existing audit |: | ✓ | ✓ |
| Turnstile bot gate | ✓ | ✓ (first audit only) |: |
| PDF export |: |: | ✓ |
| Post-audit email notification |: | ✓ | ✓ |
| API access |: | (|) (v3) |

**Anonymous tier rationale:** lets a cold visitor reach the "see your score" moment with zero friction, that's the hook. One audit per session with a 24-hour report link nudges them toward email signup for anything more.

**Free tier rationale:** email capture is the entire point. Without it, zero-audience growth is impossible (no nurture sequence, no retargeting). Magic-link + Google OAuth keeps the email-gate conversion-friendly.

### Observability

- **Inngest dashboard** for audit job status, retries, failures.
- **Vercel Analytics** (free tier) for page-level traffic.
- **Neon query insights** for slow queries and connection saturation.
- **Polar dashboard** for MRR, churn, failed charges.
- **Cloudflare R2 metrics** for storage usage and request volume.
- **Sentry** (optional, defer to v1.1 if noise) for runtime errors.

### Launch checklist (must be done before accepting payments)

- Privacy policy + Terms of Service drafted and linked from footer
- Polar tax info configured (merchant-of-record setup)
- Resend domain verified (SPF + DKIM)
- Turnstile site key + secret set in Vercel env
- **Authorization integration tests passing** (User A cannot access User B; anon cannot access private; anon cannot mutate)
- SSRF smoke test passing (outbound to `169.254.169.254` rejected, redirect-to-private rejected)
- Neon connection pooler configured + Drizzle migrations applied to prod DB
- R2 bucket created, public-read disabled, signed-URL access verified
- Inngest function live with scheduled jobs for `expire-reports` and `cleanup-rate-limits`
- Better Auth OAuth provider configured (Google client id + secret) and magic-link email template reviewed via mail-tester.com
- Polar webhook endpoint deployed and signature-verified; `webhook_events` idempotency tested with replay
- `DELETE /api/account` GDPR endpoint tested (removes user, profile, audits, R2 objects)

### Out of scope: explicit non-goals for v1

1. **Monitoring / scheduled audits.** Once per-audit UX lands, v1.1 adds "check this URL daily, email on regression."
2. **Account dashboard / audit history list.** Post-audit email is the UX. If paid users request it, v1.1.
3. **Team accounts.** Single-user accounts only. Agency pricing deferred.
4. **GitHub Action for SaaS.** OSS action exists; SaaS-backed action is v2.
5. **Real-time progress indicator.** Polling every 2s is good enough; WebSockets deferred.
6. **Headless browser rendering.** `--render` in SaaS would massively expand attack surface; v1 audits static HTML only.
7. **Custom rule configuration.** Users run the CLI locally for that.
8. **Multi-site portfolio view.**
9. **White-label reports.**
10. **On-premise / self-hosted option.** The OSS engine is the self-hosted option.

## Appendix: rejected alternatives

- **Cloudflare Workers end-to-end.** pseolint uses Node-only APIs (`fs/promises`); running in Workers would require a rewrite. Rejected: too much OSS churn for infra savings.
- **Stripe instead of Polar.** Stripe is more battle-tested but makes the founder handle VAT/sales tax in 170+ jurisdictions. Polar's merchant-of-record model is the single biggest reason to pick it for a solo indie SaaS.
- **Supabase (Postgres + Auth + Storage).** Fast to bootstrap but: (a) RLS is foot-guny, (b) Supabase's email delivery to magic-link inboxes is unreliable (spam folder), (c) couples auth to a third party. Swapped to Neon + Drizzle + Better Auth + R2 for type-safe queries, owned auth data, and independent email delivery via Resend.
- **Prisma instead of Drizzle.** Prisma's query engine is a runtime binary and its migrations feel heavy. Drizzle is a pure-TypeScript query builder with first-class schema inference: better fit for edge/serverless and faster cold starts.
- **NextAuth instead of Better Auth.** NextAuth is battle-tested but its customization story for magic-link UX and multi-provider setup is clunky. Better Auth is the modern successor with a cleaner plugin model.
- **Anonymous-only free tier (no email capture).** Would kill zero-audience growth. Replaced with three-tier ladder: Anonymous (1 audit per session, 24h link) → Free (email-gated, 3/day) → Pro.
- **Per-audit pricing ($1/audit).** Every audit becomes a friction point. Subscription aligns with "audit whenever I deploy" mental model.
- **No free tier.** Kills the viral loop (no shareable public reports). Rejected.
- **No paid tier at launch.** Delays revenue validation by weeks. Rejected.
- **Building the monitoring feature as v1 instead.** Monitoring requires the user already believes the product catches real issues. Audit-first establishes belief; monitoring converts it to retention. Order matters.
- **Renaming the product for the SaaS.** Considered names like *CleanMyPSEO* (CleanMyMac-style). Deferred: `pseolint` stays the product name for v1 to preserve continuity with the OSS package. Revisit after launch if positioning needs a distinct consumer-facing brand.
- **Concierge/Phase-0 validation.** User explicitly chose to commit to building; this path is noted in brainstorm notes but not executed.
