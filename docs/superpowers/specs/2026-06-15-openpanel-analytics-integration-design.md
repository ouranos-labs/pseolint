# OpenPanel analytics integration — design

**Date:** 2026-06-15
**Status:** Approved (brainstorming) — ready for implementation plan
**Scope:** `apps/web` only
**Author:** pseolint / Ouranos Labs

---

## 1. Goal

Integrate the user's **self-hosted OpenPanel** instance (`https://api-openpanel.philippekam.dev`) into `pseolint.dev` with an **exhaustive, typed product-analytics event catalog** covering the full funnel — acquisition, the core audit flow, activation, monetization, engagement, and top-of-funnel content.

Tracking is **full-funnel + identity**: client SDK for UI interactions and pageviews, server SDK for authoritative lifecycle/revenue events, with anonymous visitors stitched to their account on sign-in.

The integration must be **cookieless and first-party**, and the live `/privacy` + `/terms` copy must be rewritten to describe it honestly (the current copy promises zero analytics, which this breaks).

Environment keys are already present in `apps/web/.env`:
- `OPENPANEL_CLIENT_ID=…`
- `OPENPANEL_CLIENT_SECRET=…`

This spec adds `OPENPANEL_API_URL`.

## 2. Why OpenPanel fits the brand (and how it conflicted)

The live `/privacy` page currently makes absolute promises that any analytics tool would break:

- *"No behavioral tracking."*
- *"No third-party analytics SDK."*
- *"No Google Analytics, Segment, Mixpanel, FB pixel, LinkedIn pixel, or similar. No cross-site identifiers."*
- *"No analytics cookies — We set no analytics or tracking cookies."*
- *"We do not embed third-party trackers."*

These were a **trust-signal positioning choice**, not a legal constraint. The reconciliation: OpenPanel self-hosted on the user's own `api-openpanel.philippekam.dev` is **first-party** (not third-party), and OpenPanel is **cookieless by default** — it identifies sessions via a privacy-preserving **daily-rotating hash of IP + user-agent**, persisting nothing past 24h. This is *the same technique pseolint already discloses for rate limiting* ("SHA-256 hashed IP + 30-day rotating salt"), so it extends the existing privacy story instead of contradicting it.

**Decision:** keep the *spirit* (no third-party ad tracking, no cross-site identifiers, no data sold) and drop the *absolutism* (zero analytics of any kind). Update the copy. No consent banner (legitimate interest, cookieless — consistent with the current "strictly-necessary cookies only" posture).

## 3. Module architecture

All integration logic lives in one small, well-bounded module: **`apps/web/src/lib/analytics/`**. Every call site elsewhere is a one-liner against this module.

The module is split along a deliberate **seam: generic transport vs. app-specific catalog**. The transport files are pseolint-agnostic (no product event names) and are the exact unit that lifts into a private `packages/analytics` *if and when a second `apps/` app appears* (see §3.5). The catalog + typed bindings stay in the app forever.

| File | Layer | Portable? |
|---|---|---|
| `op-transport.server.ts` | generic server transport — OpenPanel singleton + raw `track`/`identify`/`alias` | ✅ future package |
| `op-transport.client.tsx` | generic client transport — `<AnalyticsProvider>` (wraps `OpenPanelComponent`) + raw track passthrough | ✅ future package |
| `events.ts` | pseolint.dev event catalog (the `AnalyticsEvent` union) | ❌ app-only |
| `track.server.ts` | typed server bindings: `trackServer` / `identifyServer` / `aliasServer` (catalog → transport) | ❌ app glue |
| `use-analytics.ts` | typed client hook: `useAnalytics()` (catalog → transport) | ❌ app glue |

Call sites only ever import `track.server.ts` (server) or `use-analytics.ts` (client) — they never touch the transport directly.

### 3.1 `events.ts` — the single source of truth (app catalog)

A **discriminated union** is the canonical event catalog. Adding a call site without adding to the union is a compile error; every event's payload is typed in exactly one place. This is what makes "exhaustive" *enforceable* rather than aspirational.

```ts
export type AnalyticsEvent =
  // ── Audit funnel ─────────────────────────────
  | { name: "audit_form_engaged"; props?: Record<string, never> }
  | { name: "audit_submitted"; props: { host: string; force: boolean; source: "landing" | "cta" } }
  | { name: "audit_submit_failed"; props: { status: number; code?: string } }
  | { name: "audit_created"; props: { host: string; cached: boolean; authed: boolean } }
  | { name: "audit_blocked"; props: { reason: AuditBlockReason; status: number } }
  | { name: "audit_completed"; props: { host: string; score: number; pageCount: number; findingCount: number; durationMs: number; classification: string | null; truncated: boolean; authed: boolean } }
  | { name: "audit_failed"; props: { host: string; reason: string } }
  | { name: "report_viewed"; props: { slug: string; cached: boolean } }
  | { name: "report_exported"; props: { format: string } }
  // ── Accounts ─────────────────────────────────
  | { name: "signin_started"; props: { method: "magic_link" | "google" } }
  | { name: "signed_in"; props: { isNewUser: boolean } }
  // ── Monetization ─────────────────────────────
  | { name: "upgrade_clicked"; props: { source: "nav" | "pricing" | "limit_block" | "report" } }
  | { name: "checkout_started"; props: { interval: "monthly" | "yearly" } }
  | { name: "checkout_redirected"; props: { interval: "monthly" | "yearly" } }
  | { name: "subscription_started"; props: { interval: "monthly" | "yearly" | "unknown"; intent: string | null } }
  | { name: "subscription_canceled"; props: { immediate: boolean } }
  // ── Engagement ───────────────────────────────
  | { name: "monitoring_domain_added"; props: { host: string } }
  | { name: "manifest_created"; props?: Record<string, never> }
  | { name: "integration_connect_clicked"; props: { provider: "gsc" | "webflow" | "wordpress" } }
  | { name: "gsc_connected"; props?: Record<string, never> }
  | { name: "mcp_key_created"; props?: Record<string, never> }
  | { name: "triage_action"; props: { action: string } }
  // ── Top-of-funnel content ────────────────────
  | { name: "tool_viewed"; props: { tool: string } }
  | { name: "tool_run"; props: { tool: string } }
  | { name: "rule_viewed"; props: { ruleId: string } }
  | { name: "symptom_viewed"; props: { symptom: string } }
  | { name: "leaderboard_entry_clicked"; props: { host: string } }
  | { name: "cta_clicked"; props: { location: string } };

export type AuditBlockReason =
  | "session_limit" | "domain_limit" | "daily_limit"
  | "invalid_url" | "private_url" | "bot_check"
  | "paused" | "origin_unreachable" | "origin_degraded";
```

Plain pageviews are **not** in the union — they are emitted automatically by `trackScreenViews` (see 3.3). The catalog is deliberately *actions + server lifecycle*. High-volume background cron events (per-run GSC sync, monitor-domain cron) are intentionally **excluded** as noise.

### 3.2 Server transport + typed bindings (`import "server-only"`)

`op-transport.server.ts` owns the generic, pseolint-agnostic half — a lazy singleton `OpenPanel` from `@openpanel/sdk` built from `env()`, plus raw `trackRaw(name, props, profileId)` / `identifyRaw` / `aliasRaw`. `track.server.ts` is the thin app layer that types those calls against the `AnalyticsEvent` union (`trackServer` / `identifyServer` / `aliasServer`). Shown together for readability — the `getClient` half is the portable bit:

```ts
import "server-only";
import { OpenPanel } from "@openpanel/sdk";
import { env } from "@/lib/env";
import type { AnalyticsEvent } from "./events";

let client: OpenPanel | null | undefined;

function getClient(): OpenPanel | null {
  if (client !== undefined) return client;
  const e = env();
  if (!e.OPENPANEL_CLIENT_ID || !e.OPENPANEL_CLIENT_SECRET) {
    client = null; // unconfigured → no-op everywhere
    return client;
  }
  client = new OpenPanel({
    clientId: e.OPENPANEL_CLIENT_ID,
    clientSecret: e.OPENPANEL_CLIENT_SECRET,
    apiUrl: e.OPENPANEL_API_URL, // self-hosted instance
  });
  return client;
}

export async function trackServer(event: AnalyticsEvent, opts: { profileId?: string } = {}): Promise<void> {
  const op = getClient();
  if (!op) return;
  try {
    await op.track(event.name, { ...(event.props ?? {}), ...(opts.profileId ? { profileId: opts.profileId } : {}) });
  } catch { /* analytics must never break a request */ }
}

export async function identifyServer(payload: { profileId: string; email?: string; properties?: Record<string, unknown> }): Promise<void> { /* getClient()?.identify(...) guarded */ }
export async function aliasServer(payload: { profileId: string; alias: string }): Promise<void> { /* getClient()?.alias(...) guarded */ }
```

- **No-op when unconfigured** (dev/CI): `client = null`, every call returns immediately. Never throws, never adds latency.
- All calls wrapped so analytics failures cannot break a request.

### 3.3 Client transport + typed hook

`op-transport.client.tsx` owns the generic `<AnalyticsProvider>` (wrapping `OpenPanelComponent`) and a raw track passthrough; `use-analytics.ts` is the app layer typing it to the catalog. Shown together — the `AnalyticsProvider` is the portable bit:

```tsx
"use client";
import { OpenPanelComponent, useOpenPanel } from "@openpanel/nextjs";
import type { AnalyticsEvent } from "./events";

export function AnalyticsProvider({ clientId, apiUrl, profileId }: { clientId?: string; apiUrl?: string; profileId?: string }) {
  if (!clientId) return null; // unconfigured → render nothing
  return (
    <OpenPanelComponent
      clientId={clientId}
      apiUrl={apiUrl}
      profileId={profileId}
      trackScreenViews
      trackOutgoingLinks
    />
  );
}

export function useAnalytics(): { track: (event: AnalyticsEvent) => void } {
  const op = useOpenPanel();
  return { track: (event) => op.track(event.name, event.props ?? {}) };
}
```

- `clientId` / `apiUrl` / `profileId` are read **server-side** in the root layout via `env()` + session, and passed as **props** — no `NEXT_PUBLIC_` rename needed, keeps the env names the user already set. (`clientId` is a public write key; serializing it to the client is expected.)
- `useAnalytics().track` constrains the client to the same `AnalyticsEvent` union as the server.

### 3.4 Root layout wiring (`src/app/layout.tsx`)

The root layout is already an async server component that fetches `session` and `plan`. Add:

```tsx
const e = env();
const profileId = session?.user.id ?? (await getAnonSessionId()) ?? undefined;
// …
<AnalyticsProvider clientId={e.OPENPANEL_CLIENT_ID} apiUrl={e.OPENPANEL_API_URL} profileId={profileId} />
```

`getAnonSessionId()` (from `lib/session.ts`) is **read-only** and safe in an RSC render pass (it never writes the cookie).

### 3.5 Future extraction (deferred — not built now)

When a second `apps/` app actually needs analytics, extraction is a mechanical lift:

1. Create `packages/analytics/` with `"private": true` (excluded from `changeset publish` — it never goes to npm) and a `package.json` exposing two entrypoints: `./server` (`op-transport.server.ts`) and `./client` (`op-transport.client.tsx`).
2. Move the two `op-transport.*` files in; leave `events.ts`, `track.server.ts`, `use-analytics.ts` in each app (every app keeps its own catalog).
3. Point each app's `track.server.ts` / `use-analytics.ts` at `@pseolint/analytics/server` and `/client`.

This is explicitly **out of scope for this implementation** — we build the seam, not the package. Designing the shared API against two real consumers beats guessing it against one.

## 4. Identity model (cookieless)

**Approved: reuse the existing anon-session id, alias to the user on sign-in.** Full funnel, still zero analytics cookies.

| Visitor state | Client `profileId` | Server `profileId` |
|---|---|---|
| Anonymous, no audit yet | none → OpenPanel's cookieless IP+UA hash | n/a |
| Anonymous, has run an audit | existing `pseolint_anon` id (read-only) | the audit's `audits.anonSessionId` (already persisted) |
| Signed in | `user.id` | `user.id` |

**Fresh-visitor nuance:** the `pseolint_anon` cookie is only created on first audit submit (`getOrCreateAnonSessionId` in the audits route — it can't run in an RSC render pass). So a brand-new visitor's pre-audit pageviews are attributed under OpenPanel's cookieless IP+UA hash, and only once they run an audit do client + server share the `pseolint_anon` profile id. This is an accepted, minor best-effort gap for pre-audit anonymous pageviews; we do **not** eagerly create the cookie for all visitors (that would set the functional cookie more broadly for no funnel value). The high-value funnels — audit → sign-up → purchase — are fully stitched via the `alias` chain.

- **Sign-in stitch** happens in `lib/auth.ts` → `databaseHooks.session.create.after`, right beside the existing `claimAnonAudits(session.userId)` call. We add:
  - `identifyServer({ profileId: userId, email, properties: { plan } })`
  - `aliasServer({ profileId: userId, alias: anonId })` — **before** `claimAnonAudits` deletes the `pseolint_anon` cookie / nulls `audits.anonSessionId`. The anon id is read the same way `claimAnonAudits` reads it (`cookies().get("pseolint_anon")`).
  - `signed_in { isNewUser }` event. (`signed_up` = `signed_in` with `isNewUser: true` — no separate event.)
- **Anonymous server lifecycle events** (e.g. an anon `audit_completed` firing minutes later from Inngest, where the worker's IP ≠ the visitor's) attribute via the audit row's `anonSessionId`. The sign-in `alias` later connects that history to the account.

**Privacy effect:** we set **zero new cookies** for analytics — the "no analytics cookies / no consent banner" claim stays literally true. We only *reuse* the pre-existing strictly-necessary `pseolint_anon` identifier server-side as a first-party profile key. This nuance is disclosed in the rewritten `/privacy` copy (§6).

**Runtime note:** server events from API routes use Next.js `import { after } from "next/server"` so the `track` POST never adds latency to the user-facing response. Inngest functions and the Polar webhook are already background contexts — they `await` directly.

## 5. Event catalog → concrete call sites

### Client (`useAnalytics()` / auto)
| Event | File | Trigger |
|---|---|---|
| `screen_view` (auto) | `op-transport.client.tsx` | `trackScreenViews` on route change |
| `link_out` (auto) | `provider.tsx` | `trackOutgoingLinks` on external clicks |
| `audit_form_engaged` | `components/landing/landing-form.tsx` | first focus of URL input (the existing `onFocus` that arms Turnstile) |
| `audit_submitted` | `landing-form.tsx` | on `submit()` after validation passes |
| `audit_submit_failed` | `landing-form.tsx` | non-OK fetch response (status + `code`) |
| `report_viewed` | report page (`/r/[slug]`, `/a/[id]`) | on mount (`cached` from query) |
| `signin_started` | `app/signin/signin-client.tsx` | magic-link / Google button click |
| `upgrade_clicked` | `layout.tsx` nav Upgrade, `pricing-client.tsx`, error CTAs in `landing-form.tsx` | click (`source`) |
| `checkout_started` | `app/pricing/pricing-client.tsx` | before redirect to `/api/checkout` |
| `monitoring_domain_added` | `components/audit/monitor-domain-button.tsx` | success |
| `manifest_created` | `app/dashboard/manifests/*` | success |
| `integration_connect_clicked` | `app/dashboard/integrations/page.tsx` | connect button (`provider`) |
| `mcp_key_created` | mcp-keys UI | success |
| `triage_action` | `app/dashboard/_actions/findings.ts` caller UI | finding action |
| `tool_viewed` / `tool_run` | `app/tools/[tool]/tool-form.tsx` | mount / run |
| `rule_viewed` | `app/rules/[ruleId]/page.tsx` (client island) | mount |
| `symptom_viewed` | `app/symptoms/[symptom]/*` | mount |
| `leaderboard_entry_clicked` | `app/leaderboard/*` | row click |
| `cta_clicked` | hero/footer CTAs | click (`location`) |

### Server (`trackServer(..., { profileId })`)
| Event | File | Trigger |
|---|---|---|
| `audit_created` | `app/api/audits/route.ts` | successful POST (incl. `cached`/deduped + `authed`) |
| `audit_blocked` | `app/api/audits/route.ts` | each 400/429/503/origin-* early return (`reason`, `status`) |
| `audit_completed` | `inngest/functions/run-audit.ts` `executeAudit` | end of run (line ~416), props from `summary` + `host`; `profileId` = userId or audit `anonSessionId` |
| `audit_failed` | `run-audit.ts` `executeAudit` catch (line ~275) | failure |
| `report_exported` | `app/api/audits/[id]/export/[format]/route.ts` | export |
| `signed_in` (+identify/alias) | `lib/auth.ts` session hook | session create |
| `checkout_redirected` | `app/api/checkout/route.ts` | redirect issued |
| `subscription_started` | `app/api/webhooks/polar/route.ts` | `subscription.created` / `.active` (profileId = matched `users.id`) |
| `subscription_canceled` | `polar/route.ts` | `subscription.canceled` (immediate=false) / `.revoked` (immediate=true) |
| `gsc_connected` | `app/api/integrations/gsc/callback/route.ts` | OAuth success |

## 6. Privacy + terms copy rewrite

**`src/app/privacy/page.tsx`** — rewrite these items to describe OpenPanel honestly:

- **Data-collected answer** (line ~33): replace "No raw IPs, no card data, no behavioral tracking." with language covering first-party, self-hosted, cookieless product analytics.
- **"Analytics"** item (line ~115): describe OpenPanel — *self-hosted on our own infrastructure (`api-openpanel.philippekam.dev`), first-party, cookieless (daily-rotating IP+UA hash, nothing persisted past 24h — the same technique used for rate limiting), used for product analytics (which features get used, funnel conversion). Legal basis: legitimate interest.*
- **"No behavioral tracking"** item (line ~121): reframe → *"No third-party / cross-site tracking. No Google Analytics, Segment, Mixpanel, FB/LinkedIn pixels. Our product analytics is first-party and runs on our own servers; data is never sold or shared."*
- **"No analytics cookies"** item (line ~171): keep — **still literally true** (we set zero cookies for analytics). Optionally clarify: *"Our analytics is cookieless; we reuse the strictly-necessary anonymous session identifier as a first-party profile key, setting no additional cookie."*
- **"Third-party cookies from embeds"** / processor list: note self-hosting means **no third-party analytics processor**.

**`src/app/terms/page.tsx`** — patch the single analytics line to match.

**Landing copy** (`landing-form.tsx` line ~320, *"Analytics-safe — audit runs won't touch your GA, PostHog, Mixpanel…"*): **leave as-is** — it's a claim about pseolint's *crawler* not executing the audited site's analytics, which remains true.

## 7. Env + config

**`src/lib/env.ts`** — add to `envSchema` (all optional; analytics is a no-op without them):

```ts
OPENPANEL_CLIENT_ID: z.string().min(1).optional(),
OPENPANEL_CLIENT_SECRET: z.string().min(1).optional(),
OPENPANEL_API_URL: z.string().url().optional(),
```

No dev/build fallbacks needed (optional keys; integration degrades to no-op).

**`.env.example`** — document all three:

```
# OpenPanel (self-hosted product analytics). Optional — omit to disable analytics.
OPENPANEL_CLIENT_ID=
OPENPANEL_CLIENT_SECRET=
OPENPANEL_API_URL=https://api-openpanel.philippekam.dev
```

**`.env`** — add `OPENPANEL_API_URL=https://api-openpanel.philippekam.dev` (the two keys already exist).

## 8. Dependencies

```
pnpm --filter web add @openpanel/nextjs @openpanel/sdk
```

(`@openpanel/nextjs` for the client component + hook; `@openpanel/sdk` for the server client. The repo uses pnpm workspaces — match the existing install convention.)

## 9. Testing

- **`analytics/events.test.ts`** — runtime sanity that representative catalog entries build the expected `{ name, props }` payload; type-level coverage is implicit in the union.
- **`analytics/track.server.test.ts`** — `trackServer` / `identifyServer` / `aliasServer` are safe **no-ops when unconfigured** (transport's `getClient` returns null — no throw, no client constructed); when configured (env mocked), they forward `profileId` and props correctly to a mocked `OpenPanel`.
- **`op-transport.client.tsx`** — `AnalyticsProvider` renders `null` when `clientId` is absent.
- Existing suites must stay green (`vitest`).

## 10. Out of scope (YAGNI)

- **Extracting `packages/analytics`** — deferred until a second `apps/` app actually needs it; we build the seam now, not the package (§3.5).
- Consent banner / cookie-consent UI (cookieless + legitimate interest → not required).
- High-volume background cron events (per-run GSC sync, monitor-domain cron, leaderboard seeding).
- Server-side dashboards / custom OpenPanel funnels (configured in the OpenPanel UI, not in this repo).
- Session replay, heatmaps (OpenPanel doesn't do these; not wanted).
- Backfill / historical import.

## 11. Acceptance criteria

1. With env keys set, visiting `pseolint.dev` sends pageviews to `api-openpanel.philippekam.dev`; submitting the landing form emits `audit_submitted` (client) and `audit_created` (server); a completed audit emits `audit_completed` (server) attributed to the visitor's anon id; signing in emits `signed_in` + `identify` + `alias`, and subsequent events attribute to `user.id`; a Pro purchase emits `subscription_started`.
2. With env keys **unset**, the app builds and runs exactly as today — no network calls, no thrown errors, provider renders nothing.
3. `/privacy` and `/terms` accurately describe the analytics; no remaining text claims "no analytics SDK" / "no behavioral tracking" in absolute terms.
4. `vitest` green; no new type errors.
