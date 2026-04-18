# pseolint SaaS MVP Design

**Status:** Draft — 2026-04-19
**Author:** philippe.kam27@gmail.com + Claude (Opus 4.7)
**Motivation:** The OSS `pseolint@0.2.1` is feature-complete for solo CLI use. Turning it into a hosted product opens a revenue channel and a distribution surface (public shareable report URLs → organic acquisition) that the CLI alone can't provide. Zero existing audience — the product must acquire through its own viral loop, not a launch audience.

## Goal

Ship a minimal audit-as-a-service: user pastes a URL, gets a shareable HTML report within 2 minutes. Free tier drives viral loop via public report URLs. $19/mo paid tier unlocks AI triage, per-user generosity caps, and permanent private history. Target: first paying customer within 14 days of v1 going live.

## Non-Goals (v1)

- **Scheduled audits / monitoring.** Deferred — the one-shot audit wedge must validate first.
- **Email/Slack alerts on regression.** v2, gated on monitoring feature.
- **Team accounts / RBAC.** Target is solo operators; agencies are v1.1+.
- **Public API.** v3.
- **GitHub Action distribution.** Exists in OSS; hosted version deferred.
- **Headless browser rendering (`--render`).** SSRF/XSS blast radius too wide for v1; users who need rendered pages run the CLI.
- **Custom rules editor.** v3.
- **White-label / custom branding.** v3.
- **Account dashboard / history page.** Deferred to v1.1 — post-audit email is the v1 UX.
- **Multi-site overview dashboard.** v1.1+.
- **Usage-based or overage billing.** Flat subscription with hard rate-limits is simpler to reason about.

## Architecture

Serverless-forward, 6 vendors, each doing one thing:

```
Browser → Vercel (Next.js) ─┬─ /api/audits (POST) ── enqueue ──► Inngest (durable worker)
                            │                                       │
                            │                                       ▼
                            │                                   pseolint@0.2.1
                            │                                       │
                            ├─ /api/checkout ── Polar.sh            │
                            ├─ /api/webhooks/polar ◄── Polar ──┐    │
                            ├─ /api/auth/magic-link ─► Supabase Auth (email sent via Resend)
                            └─ /r/<uuid>                            │
                                                                    ▼
                                                     Supabase Storage (HTML report)
                                                            + Supabase Postgres (audit row)
```

### Vendor map

| Layer | Service | Integration shape |
|---|---|---|
| Frontend + API routes | Vercel (Next.js 15 App Router) | Ship as `apps/web/` in the existing monorepo |
| Background jobs | Inngest (durable execution, 10 min/step) | Inngest SDK in API route + Inngest `serve` function mounted at `app/api/inngest/route.ts` |
| Database | Supabase Postgres | `@supabase/supabase-js` client, RLS policies |
| Auth | Supabase Auth (magic link via Resend SMTP) | `@supabase/auth-helpers-nextjs` |
| Report storage | Supabase Storage (R2-compatible) | Public bucket for free reports; signed URLs for paid-private |
| Transactional email | Resend | `resend` SDK; templates as React Email components |
| Bot gating | Cloudflare Turnstile (free) | Widget on audit form, server-side token verify on `/api/audits` |
| Payments | Polar.sh | Merchant-of-record — handles global VAT/tax. `@polar-sh/sdk` |
| Audit engine | `pseolint@0.2.1` (npm) | Programmatic import: `import { auditSource, formatHtml } from "pseolint"` inside Inngest function |

### Repository layout

The SaaS lives in the existing monorepo as a new app:

```
pseolint/
├── packages/         ← existing: core, cli, mcp, action
└── apps/
    └── web/          ← NEW: Next.js app
        ├── app/
        │   ├── page.tsx                  ← landing
        │   ├── a/[id]/page.tsx           ← audit progress + report
        │   ├── r/[uuid]/page.tsx         ← public report view
        │   ├── pricing/page.tsx          ← pricing + CTA
        │   ├── privacy/page.tsx          ← GDPR privacy policy
        │   ├── terms/page.tsx
        │   └── api/
        │       ├── audits/route.ts       ← POST: enqueue audit
        │       ├── audits/[id]/route.ts  ← GET: status polling
        │       ├── checkout/route.ts     ← POST: create Polar checkout
        │       ├── webhooks/polar/route.ts  ← Polar events
        │       ├── auth/callback/route.ts   ← magic-link return
        │       ├── account/route.ts      ← DELETE: GDPR data deletion
        │       └── inngest/route.ts      ← Inngest serve endpoint
        ├── lib/
        │   ├── supabase.ts
        │   ├── inngest.ts
        │   ├── polar.ts
        │   ├── resend.ts
        │   ├── ssrf.ts                   ← URL validation
        │   ├── rate-limit.ts             ← IP + target-domain limits
        │   └── turnstile.ts              ← bot verification
        ├── inngest/
        │   └── functions/
        │       └── run-audit.ts          ← the audit worker
        ├── components/                   ← shadcn/ui + custom
        ├── emails/                       ← React Email templates
        └── db/
            └── migrations/               ← Supabase SQL
```

Rationale for monorepo placement:
- pseolint engine changes + SaaS changes ship together.
- Single `bun install` resolves all workspaces.
- Existing turbo pipeline extends naturally (`turbo run build --filter=web`).

### Data model

Four Postgres tables, strict RLS.

```sql
-- users: one row per authenticated account. Anonymous audits have no user row.
create table public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  polar_customer_id text unique,
  plan text not null default 'free',     -- 'free' | 'pro'
  plan_expires_at timestamptz,            -- null for free, lifetime for cancelled-at-period-end
  created_at timestamptz not null default now()
);

-- audits: one row per audit run. user_id null = anonymous (free tier).
create table public.audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  source_url text not null,
  status text not null default 'queued',  -- 'queued' | 'running' | 'completed' | 'failed'
  is_public boolean not null default true, -- anonymous audits public; paid default private
  score int,
  page_count int,
  finding_count int,
  triage_root_cause_count int,
  triage_cost_usd numeric(10, 4),
  storage_path text,                       -- path in Supabase Storage bucket
  error_message text,
  expires_at timestamptz not null,         -- 30d for free, null for paid
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- rate_limits: daily counters for anonymous abuse prevention.
create table public.rate_limits (
  key text primary key,                    -- 'ip:<hash>:<date>' or 'domain:<host>:<date>'
  count int not null default 0,
  expires_at timestamptz not null          -- garbage-collected by cron
);

-- webhook_events: idempotency for Polar webhook replays.
create table public.webhook_events (
  event_id text primary key,               -- Polar event id
  processed_at timestamptz not null default now()
);
```

### RLS policies

- `users`: user can read/update only their own row (`auth.uid() = id`).
- `audits`: owner can read/update own; anyone can read rows where `is_public = true AND status = 'completed' AND expires_at > now()`.
- `rate_limits`: service-role only.
- `webhook_events`: service-role only.

### Audit request flow (happy path)

1. **Browser →** `POST /api/audits` with `{ url, turnstileToken }`.
2. **API route:**
   - Verify Turnstile token (`fetch https://challenges.cloudflare.com/turnstile/v0/siteverify`). Reject if invalid.
   - Resolve requesting user via Supabase session cookie. If none → anonymous path.
   - Hash the request IP (SHA-256 with server-side salt) — never store raw IP.
   - Check rate limits: IP-hash (anonymous) or user (authenticated); and target-domain (anonymous only).
   - Validate URL with `ssrf.ts`: parse, reject non-HTTP(S), resolve DNS, reject private/loopback/link-local/cloud-metadata ranges.
   - Create `audits` row with `status='queued'`, `expires_at = now() + 30d` (free) or `null` (paid).
   - Enqueue `Inngest.send({ name: "audit/requested", data: { auditId, url, plan } })`.
   - Return `{ auditId, reportUrl: '/a/<id>' }` (202 Accepted).
3. **Browser →** `/a/<id>` renders a progress shell that polls `GET /api/audits/<id>` every 2s.
4. **Inngest worker** (runs as a Vercel serverless function invoked via Inngest's durable execution, 10 min hard budget per step):
   - Update row to `status='running'`.
   - Invoke `auditSource(url, { sampleSize: 50, ai: { enabled: plan === 'pro', maxCostUsd: 0.50 } })`. The SSRF wrapper is installed as a `fetch` override in the worker bootstrap.
   - Catch + map error kinds to user-facing `error_message`.
   - Render HTML via `formatHtml(summary)`.
   - Upload to `reports/<uuid>.html` in Supabase Storage.
   - Update row: `status='completed'`, persist `score / page_count / finding_count / storage_path / completed_at`, copy triage fields.
   - If authenticated: send completion email via Resend (`AuditCompleteEmail`).
5. **Browser poll** sees `status='completed'`, redirects to `/r/<uuid>` which streams the HTML report from Storage.
6. **Public `/r/<uuid>` page** served by Next.js server component: reads `audits` row, respects `is_public`, returns 404 if expired or private-without-session.

### Authentication flow

Magic-link only (no passwords, no OAuth in v1).

1. `/pricing` has "Upgrade" button → `POST /api/checkout` with user email.
2. If email not in `users`, pre-create user row with `plan='free'`.
3. Create Polar checkout session → redirect to Polar-hosted payment page.
4. On success, Polar redirects to `/a/<id>?upgraded=1` (or `/` if no audit in flight).
5. Polar webhook fires `subscription.created` → `/api/webhooks/polar` verifies signature → upsert `users.polar_customer_id` and `plan='pro'`.
6. For login (existing user): `POST /api/auth/magic-link` with email → Supabase sends magic link → user clicks → session cookie set → redirect to `/`.
7. All magic links are single-use, 15 min TTL (Supabase defaults).

### Payments flow (Polar.sh)

- **Products:** one subscription product with two prices — `monthly $19 USD` and `yearly $180 USD`.
- **Checkout creation** via Polar SDK with `customer_email` pre-filled.
- **Webhooks handled:** `subscription.created`, `subscription.updated`, `subscription.canceled`.
- **Idempotency:** each event's `id` is written to `webhook_events` table before processing; duplicate events short-circuit.
- **Signature verification:** Polar signs webhooks with a shared secret; `webhooks/polar/route.ts` uses `@polar-sh/sdk`'s built-in verifier.
- **Cancellation:** `plan_expires_at` set to period end; user retains Pro access until that date, then row transitions to `plan='free'` via a nightly cron (Inngest scheduled function) or on next API call — whichever first.

### Rate limiting

Atomic increment via a Postgres function to avoid TOCTOU races:

```sql
create or replace function public.bump_rate_limit(p_key text, p_limit int, p_expires timestamptz)
returns table(allowed boolean, cnt int)
language plpgsql security definer as $$
begin
  insert into public.rate_limits as rl (key, count, expires_at)
    values (p_key, 1, p_expires)
    on conflict (key) do update
      set count = rl.count + 1
    returning rl.count into cnt;
  allowed := cnt <= p_limit;
  return next;
end $$;
```

```ts
async function bumpRateLimit(key: string, limit: number): Promise<{ allowed: boolean; count: number }> {
  const expires = startOfNextUtcDay();
  const { data, error } = await supabase.rpc("bump_rate_limit", { p_key: key, p_limit: limit, p_expires: expires });
  if (error) throw error;
  return { allowed: data[0].allowed, count: data[0].cnt };
}
```

Keys:
- `free:ip:<sha256(ip + salt)>:<yyyy-mm-dd>` — limit 3
- `free:domain:<lower(host)>:<yyyy-mm-dd>` — limit 3
- `pro:user:<uuid>:<yyyy-mm-dd>` — limit 50 AI-triage audits

Cleanup (Inngest scheduled function, runs daily at 02:00 UTC): `DELETE FROM rate_limits WHERE expires_at < now()`.

### SSRF defense (defense-in-depth)

Three layers:

1. **Application layer — `ssrf-req-filter`-backed URL check at ingress AND on every outgoing fetch inside the worker.** The library:
   - Parses URL, rejects non-HTTP(S) schemes.
   - Resolves DNS A/AAAA.
   - Rejects private, loopback, link-local, multicast, cloud-metadata (`169.254.169.254`, etc.), broadcast ranges.
   - Supports IPv6 edge cases (`::1`, `::ffff:127.0.0.1`, `fe80::/10`).
2. **Redirect re-validation.** pseolint's HTTP cache follows redirects; we install a `fetch` override in the worker bootstrap that routes every `fetch` through the SSRF check, re-resolving DNS on each hop. This catches DNS rebinding.
3. **Runtime sandbox.** Inngest's default execution environment runs our function as an HTTP POST to our Vercel endpoint (which in turn invokes the audit worker code on Vercel's serverless infrastructure). Vercel serverless functions have no VPC access to private networks by default. If our application-layer guards have a bug, the blast radius is limited to the public internet surface. We explicitly **do not** place any secrets for other org services in the worker's environment.

The worker also pins DNS resolution: after `ssrf-req-filter` validates an IP, the `fetch` is made to that IP directly (with `Host` header preserved) so the DNS can't rebind between check and fetch.

### Report access control

- **Free tier (anonymous):** `is_public = true` by default. `/r/<uuid>` is viewable by anyone with the link. Storage object is in a public bucket; URL is unguessable (122-bit UUIDv4).
- **Paid tier:** `is_public = false` by default. `/r/<uuid>` requires a valid session cookie belonging to `audits.user_id`. Owner can toggle `is_public = true` via `PATCH /api/audits/<id>`.
- **Expiry:** nightly cron scans `audits` where `expires_at < now()`, deletes the Storage object, nulls `storage_path`, updates `status='expired'`.

### Security hardening checklist

| Item | Measure |
|---|---|
| SSRF | Three-layer defense above |
| XSS in report | pseolint's HTML formatter already escapes (`escapeHtml` on label, rationale, narrative, ruleIds, URLs, messages) — tested |
| CSRF on state-changing endpoints | Next.js same-site cookie default + explicit `Origin` header check on `/api/*` POSTs |
| Clickjacking | `X-Frame-Options: DENY` (helmet.js middleware — suggested in security guidance) |
| Content sniffing | `X-Content-Type-Options: nosniff` |
| HSTS | `Strict-Transport-Security` for 1y on production |
| Webhook replay | Polar signature verify + `webhook_events` idempotency table |
| Magic link leak | 15 min TTL, single-use, delivered via Resend (proper SPF/DKIM) |
| IP storage | SHA-256 + server-side salt — never store raw IPs |
| API keys in client | All keys in Vercel env; only `NEXT_PUBLIC_*` visible client-side (Turnstile site-key, Supabase anon-key — both safe to expose) |
| RLS bypass | Integration tests assert that anon cannot read another user's audits and cannot mutate `rate_limits` |
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
| pseolint internal throw | Caught, logged to Inngest console with full stack, user sees generic "audit failed — please retry" |
| Polar webhook bad signature | 400, logged, no side effects |
| Magic link expired/used | Redirect to `/` with error toast |
| Supabase down | API returns 503 with `Retry-After`; UI shows maintenance message |
| AI triage fails | Audit still completes (non-AI report); paid user sees a note "AI triage unavailable for this run" |

### Testing strategy

- **Unit tests:** SSRF validator (all edge cases in the OWASP list), rate-limit logic, webhook signature verify, email template rendering.
- **Integration tests:** RLS policies — spawn two anon sessions, assert neither can access the other's data. Assert that an unauth session can read public but not private audits. Assert that cron properly expires rows.
- **E2E tests (Playwright):** full flow — anon user pastes URL → audit completes → report visible. Paid flow skipped in CI (Polar is third-party; use a mock checkout route for tests).
- **Load test:** k6 script hitting `/api/audits` at 10 RPS to verify rate limits hold.
- **SSRF smoke:** deploy-time check that hitting `http://169.254.169.254/` from the Inngest worker is rejected.

### Pricing and limits summary

| Feature | Free | Pro ($19/mo or $180/yr) |
|---|---|---|
| Audits per day | 3 per IP + 3 per target domain | 50 AI-triage audits/day/user |
| AI triage | — | ✓ |
| Page cap per audit | 50 | 200 |
| Report retention | 30 days | Permanent |
| Report default visibility | Public | Private (toggleable) |
| Shareable URL | ✓ | ✓ |
| PDF export | — | ✓ |
| Email notifications | — | ✓ |
| API access | — | — (v3) |

### Observability

- **Inngest dashboard** for audit job status, retries, failures.
- **Vercel Analytics** (free tier) for page-level traffic.
- **Supabase Logs** for RLS denials and query errors.
- **Polar dashboard** for MRR, churn, failed charges.
- **Sentry** (optional, defer to v1.1 if noise) for runtime errors.

### Launch checklist (must be done before accepting payments)

- Privacy policy + Terms of Service drafted and linked from footer
- Polar tax info configured (merchant-of-record setup)
- Resend domain verified (SPF + DKIM)
- Turnstile site key + secret set in Vercel env
- Supabase RLS policies tested against unauthorized access
- SSRF smoke test passing
- Inngest function live
- Magic-link email template reviewed for deliverability (spam-score check via mail-tester.com)
- Polar webhook endpoint deployed and signature-verified
- `DELETE /api/account` GDPR endpoint tested

### Out of scope — explicit non-goals for v1

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

## Appendix — rejected alternatives

- **Cloudflare Workers end-to-end.** pseolint uses Node-only APIs (`fs/promises`); running in Workers would require a rewrite. Rejected — too much OSS churn for infra savings.
- **Stripe instead of Polar.** Stripe is more battle-tested but makes the founder handle VAT/sales tax in 170+ jurisdictions. Polar's merchant-of-record model is the single biggest reason to pick it for a solo indie SaaS.
- **Supabase email instead of Resend.** Supabase's default email sender has poor deliverability reputation; magic links end up in spam. Resend with verified domain solves this.
- **Per-audit pricing ($1/audit).** Simpler than subscription but every audit becomes a friction point. Subscription aligns with "audit whenever I deploy" mental model.
- **No free tier.** Kills the viral loop (no shareable public reports). Rejected.
- **No paid tier at launch.** Delays revenue validation by weeks. Rejected.
- **Building the monitoring feature as v1 instead.** Monitoring requires the user already believes the product catches real issues. Audit-first establishes belief; monitoring converts it to retention. Order matters.
- **Concierge/Phase-0 validation.** User explicitly chose to commit to building; this path is noted in brainstorm notes but not executed.
