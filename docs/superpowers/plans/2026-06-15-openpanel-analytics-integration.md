# OpenPanel Analytics Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the self-hosted OpenPanel instance into pseolint.dev with a typed, full-funnel, cookieless, first-party product-analytics event catalog (client + server), anonymous→account identity stitching, and honest privacy/terms copy.

**Architecture:** One bounded module at `apps/web/src/lib/analytics/` with a deliberate seam: generic transport (`op-transport.server.ts`, `op-transport.client.tsx`, portable, no pseolint event names) vs. app catalog + bindings (`events.ts`, `track.server.ts`, `use-analytics.ts`). Server events use `next/server`'s `after()` so they never add response latency; Inngest/webhook contexts await directly. Everything is a **no-op when env keys are absent** (dev/CI safe).

**Tech Stack:** Next.js (App Router), TypeScript, `@openpanel/nextjs` (client) + `@openpanel/sdk` (server), Drizzle, better-auth, Inngest, Polar, Bun, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-15-openpanel-analytics-integration-design.md`

**Working directory:** all `bun`/`bunx` commands run from `apps/web/` unless stated. Branch: `main` (per user instruction, all work lands on main).

---

## File Structure

**New (analytics module, `apps/web/src/lib/analytics/`):**
- `events.ts`: `AnalyticsEvent` discriminated union + `AuditBlockReason` + pure `toTrackArgs()` helper. App-only catalog. (Portable? No.)
- `op-transport.server.ts`: `getAnalyticsClient()` singleton, `trackRaw`/`identifyRaw`/`aliasRaw`, `__resetAnalyticsClient()`. Generic server transport. (Portable.)
- `track.server.ts`: typed `trackServer`/`identifyServer`/`aliasServer`. App glue.
- `op-transport.client.tsx`: `<AnalyticsProvider>`. Generic client transport. (Portable.)
- `use-analytics.ts`: `useAnalytics()` typed hook. App glue.
- `track-view.tsx`: `<TrackView event=...>` render-nothing client component that fires one event on mount (for view events from server pages). App glue.
- `record-sign-in.ts`: `recordSignIn(userId)` identity-stitch glue called from the auth session hook. App glue.

**New (client click wrapper):**
- `apps/web/src/components/analytics/tracked-link.tsx`: `<TrackedLink event href>` client `<Link>` that fires a typed event on click.

**New (tests):**
- `apps/web/src/lib/analytics/events.test.ts`
- `apps/web/src/lib/analytics/op-transport.server.test.ts`
- `apps/web/src/lib/analytics/track.server.test.ts`
- `apps/web/src/lib/analytics/record-sign-in.test.ts`

**Modified:**
- `apps/web/src/lib/env.ts`: three optional OpenPanel keys.
- `apps/web/.env.example`, `apps/web/.env`: document/add keys.
- `apps/web/src/app/layout.tsx`: mount `<AnalyticsProvider>` with profileId.
- `apps/web/src/lib/auth.ts`: call `recordSignIn` in `session.create.after`.
- `apps/web/src/app/api/audits/route.ts`: `audit_created` + `audit_blocked`.
- `apps/web/src/inngest/functions/run-audit.ts`: `audit_completed` + `audit_failed`.
- `apps/web/src/app/api/webhooks/polar/route.ts`: `subscription_started` + `subscription_canceled`.
- `apps/web/src/app/api/checkout/route.ts`: `checkout_redirected`.
- `apps/web/src/components/landing/landing-form.tsx`: `audit_form_engaged`, `audit_submitted`, `audit_submit_failed`.
- `apps/web/src/app/signin/signin-client.tsx`: `signin_started`.
- `apps/web/src/app/pricing/pricing-client.tsx`: `checkout_started`.
- Secondary surfaces (Phase D): `app/api/integrations/gsc/callback/route.ts`, `app/api/audits/[id]/export/[format]/route.ts`, content pages (rules/symptoms/tools/leaderboard), nav upgrade link.
- `apps/web/src/app/privacy/page.tsx`, `apps/web/src/app/terms/page.tsx`: copy rewrite.

---

## PHASE A: Foundation (deps, env, module, tests)

### Task A1: Install dependencies + env keys

**Files:**
- Modify: `apps/web/package.json` (via `bun add`)
- Modify: `apps/web/src/lib/env.ts:77-102`
- Modify: `apps/web/.env.example`
- Modify: `apps/web/.env`

- [ ] **Step 1: Install the two SDKs**

Run (from `apps/web/`):
```bash
bun add @openpanel/nextjs @openpanel/sdk
```
Expected: both added to `apps/web/package.json` `dependencies`, no error.

- [ ] **Step 2: Add the three optional env keys to the schema**

In `apps/web/src/lib/env.ts`, inside `const envSchema = z.object({ ... })`, add after the `IP_HASH_SALT` line (line 101):
```ts
  IP_HASH_SALT: z.string().min(16),
  OPENPANEL_CLIENT_ID: z.string().min(1).optional(),
  OPENPANEL_CLIENT_SECRET: z.string().min(1).optional(),
  OPENPANEL_API_URL: z.string().url().optional(),
});
```
(Keep the existing closing `});`, i.e. the three new lines go before it.)

- [ ] **Step 3: Document in `.env.example`**

Append to `apps/web/.env.example`:
```
# OpenPanel (self-hosted product analytics). Optional: omit to disable analytics (no-op).
OPENPANEL_CLIENT_ID=
OPENPANEL_CLIENT_SECRET=
OPENPANEL_API_URL=https://api-openpanel.philippekam.dev
```

- [ ] **Step 4: Add the API URL to `.env`** (the two keys already exist there)

Add to `apps/web/.env`:
```
OPENPANEL_API_URL=https://api-openpanel.philippekam.dev
```

- [ ] **Step 5: Typecheck**

Run (from `apps/web/`): `bun run typecheck`
Expected: PASS (no type errors).

- [ ] **Step 6: Commit**

```bash
# Bun's lockfile lives at the workspace ROOT (../../bun.lock), not in apps/web.
git add apps/web/package.json apps/web/src/lib/env.ts apps/web/.env.example
git -C ../.. add bun.lock 2>/dev/null || true
git commit -m "feat(analytics): add OpenPanel deps + optional env keys"
```
(Note: `.env` is git-ignored, do not stage it. `git add bun.lock` is best-effort: if the file is named `bun.lockb` or is unchanged, the `|| true` keeps the step from failing.)

---

### Task A2: Event catalog (`events.ts`)

**Files:**
- Create: `apps/web/src/lib/analytics/events.ts`
- Test: `apps/web/src/lib/analytics/events.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/analytics/events.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { toTrackArgs, type AnalyticsEvent } from "./events";

describe("toTrackArgs", () => {
  it("returns [name, props] for an event with props", () => {
    const e: AnalyticsEvent = { name: "audit_submitted", props: { host: "x.com", force: false, source: "landing" } };
    expect(toTrackArgs(e)).toEqual(["audit_submitted", { host: "x.com", force: false, source: "landing" }]);
  });

  it("returns [name, {}] for a propless event", () => {
    const e: AnalyticsEvent = { name: "audit_form_engaged" };
    expect(toTrackArgs(e)).toEqual(["audit_form_engaged", {}]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/analytics/events.test.ts`
Expected: FAIL, cannot find module `./events`.

- [ ] **Step 3: Create `events.ts`**

Create `apps/web/src/lib/analytics/events.ts`:
```ts
/**
 * The single source of truth for pseolint.dev analytics events.
 *
 * Adding a tracking call site without adding to this union is a compile error;
 * every event's payload is typed here in exactly one place. Plain pageviews are
 * NOT in this union: they are emitted automatically by `trackScreenViews` on
 * the client provider.
 */
export type AuditBlockReason =
  | "session_limit" | "domain_limit" | "daily_limit"
  | "invalid_url" | "private_url" | "bot_check"
  | "paused" | "origin_unreachable" | "origin_degraded";

export type AnalyticsEvent =
  // ── Audit funnel ─────────────────────────────
  | { name: "audit_form_engaged"; props?: undefined }
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
  | { name: "manifest_created"; props?: undefined }
  | { name: "integration_connect_clicked"; props: { provider: "gsc" | "webflow" | "wordpress" } }
  | { name: "gsc_connected"; props?: undefined }
  | { name: "mcp_key_created"; props?: undefined }
  | { name: "triage_action"; props: { action: string } }
  // ── Top-of-funnel content ────────────────────
  | { name: "tool_viewed"; props: { tool: string } }
  | { name: "tool_run"; props: { tool: string } }
  | { name: "rule_viewed"; props: { ruleId: string } }
  | { name: "symptom_viewed"; props: { symptom: string } }
  | { name: "leaderboard_entry_clicked"; props: { host: string } }
  | { name: "cta_clicked"; props: { location: string } };

/** Normalize an event into the (name, properties) pair both SDKs accept. */
export function toTrackArgs(event: AnalyticsEvent): [string, Record<string, unknown>] {
  return [event.name, (("props" in event && event.props) ? event.props : {}) as Record<string, unknown>];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/analytics/events.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/analytics/events.ts apps/web/src/lib/analytics/events.test.ts
git commit -m "feat(analytics): typed event catalog"
```

---

### Task A3: Server transport (`op-transport.server.ts`)

**Files:**
- Create: `apps/web/src/lib/analytics/op-transport.server.ts`
- Test: `apps/web/src/lib/analytics/op-transport.server.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/analytics/op-transport.server.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const trackMock = vi.fn();
const identifyMock = vi.fn();
const aliasMock = vi.fn();
vi.mock("@openpanel/sdk", () => ({
  OpenPanel: vi.fn().mockImplementation(() => ({ track: trackMock, identify: identifyMock, alias: aliasMock })),
}));

import { OpenPanel } from "@openpanel/sdk";
import { __resetEnvCache } from "@/lib/env";
import { getAnalyticsClient, trackRaw, __resetAnalyticsClient } from "./op-transport.server";

const OP = vi.mocked(OpenPanel);

function setKeys(on: boolean): void {
  if (on) {
    process.env.OPENPANEL_CLIENT_ID = "cid";
    process.env.OPENPANEL_CLIENT_SECRET = "csecret";
    process.env.OPENPANEL_API_URL = "https://op.example.com";
  } else {
    delete process.env.OPENPANEL_CLIENT_ID;
    delete process.env.OPENPANEL_CLIENT_SECRET;
    delete process.env.OPENPANEL_API_URL;
  }
  __resetEnvCache();
  __resetAnalyticsClient();
}

beforeEach(() => {
  trackMock.mockReset();
  OP.mockClear();
});

describe("op-transport.server", () => {
  it("is a no-op when keys are unset (no client constructed)", async () => {
    setKeys(false);
    expect(getAnalyticsClient()).toBeNull();
    await trackRaw("audit_created", { host: "x.com" }, "user_1");
    expect(OP).not.toHaveBeenCalled();
    expect(trackMock).not.toHaveBeenCalled();
  });

  it("constructs the client once and forwards name, props, and profileId", async () => {
    setKeys(true);
    await trackRaw("audit_created", { host: "x.com", cached: false }, "user_1");
    await trackRaw("audit_failed", { host: "x.com" });
    expect(OP).toHaveBeenCalledTimes(1); // singleton
    expect(OP).toHaveBeenCalledWith({ clientId: "cid", clientSecret: "csecret", apiUrl: "https://op.example.com" });
    expect(trackMock).toHaveBeenNthCalledWith(1, "audit_created", { host: "x.com", cached: false, profileId: "user_1" });
    expect(trackMock).toHaveBeenNthCalledWith(2, "audit_failed", { host: "x.com" });
  });

  it("never throws when the SDK throws", async () => {
    setKeys(true);
    trackMock.mockImplementationOnce(() => { throw new Error("network"); });
    await expect(trackRaw("audit_created", { host: "x.com" }, "u")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/analytics/op-transport.server.test.ts`
Expected: FAIL, cannot find module `./op-transport.server`.

- [ ] **Step 3: Create `op-transport.server.ts`**

Create `apps/web/src/lib/analytics/op-transport.server.ts`:
```ts
import "server-only";
import { OpenPanel } from "@openpanel/sdk";
import { env } from "@/lib/env";

/**
 * Generic OpenPanel server transport: no pseolint event names live here. This
 * is the file that lifts into a private `packages/analytics` when a second
 * apps/ app needs analytics (see spec §3.5). Lazy singleton so unconfigured
 * environments construct nothing.
 */
let client: OpenPanel | null | undefined;

export function getAnalyticsClient(): OpenPanel | null {
  if (client !== undefined) return client;
  const e = env();
  if (!e.OPENPANEL_CLIENT_ID || !e.OPENPANEL_CLIENT_SECRET) {
    client = null;
    return client;
  }
  client = new OpenPanel({
    clientId: e.OPENPANEL_CLIENT_ID,
    clientSecret: e.OPENPANEL_CLIENT_SECRET,
    ...(e.OPENPANEL_API_URL ? { apiUrl: e.OPENPANEL_API_URL } : {}),
  });
  return client;
}

/** Test-only: drop the memoized client so env changes take effect. */
export function __resetAnalyticsClient(): void {
  client = undefined;
}

export async function trackRaw(
  name: string,
  properties: Record<string, unknown>,
  profileId?: string,
): Promise<void> {
  const op = getAnalyticsClient();
  if (!op) return;
  try {
    await Promise.resolve(op.track(name, { ...properties, ...(profileId ? { profileId } : {}) }));
  } catch {
    /* analytics must never break a request */
  }
}

export async function identifyRaw(payload: {
  profileId: string;
  email?: string;
  properties?: Record<string, unknown>;
}): Promise<void> {
  const op = getAnalyticsClient();
  if (!op) return;
  try {
    await Promise.resolve(op.identify(payload));
  } catch {
    /* swallow */
  }
}

export async function aliasRaw(payload: { profileId: string; alias: string }): Promise<void> {
  const op = getAnalyticsClient();
  if (!op) return;
  try {
    await Promise.resolve(op.alias(payload));
  } catch {
    /* swallow */
  }
}
```

> **Verify against installed types:** open `node_modules/@openpanel/sdk` types and confirm `alias`'s payload field names are `{ profileId, alias }`. If the installed version names them differently (e.g. `{ profileId, previousId }`), adjust `aliasRaw`'s `payload` shape and the call in `record-sign-in.ts` (Task B2) to match. The test mocks the SDK so it won't catch a field-name mismatch.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/analytics/op-transport.server.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/analytics/op-transport.server.ts apps/web/src/lib/analytics/op-transport.server.test.ts
git commit -m "feat(analytics): server transport with no-op guard"
```

---

### Task A4: Typed server bindings (`track.server.ts`)

**Files:**
- Create: `apps/web/src/lib/analytics/track.server.ts`
- Test: `apps/web/src/lib/analytics/track.server.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/analytics/track.server.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const trackRaw = vi.fn();
const identifyRaw = vi.fn();
const aliasRaw = vi.fn();
vi.mock("./op-transport.server", () => ({ trackRaw, identifyRaw, aliasRaw }));

import { trackServer, identifyServer, aliasServer } from "./track.server";

beforeEach(() => { trackRaw.mockReset(); identifyRaw.mockReset(); aliasRaw.mockReset(); });

describe("track.server bindings", () => {
  it("forwards a catalog event's name + props + profileId to trackRaw", async () => {
    await trackServer(
      { name: "audit_completed", props: { host: "x.com", score: 42, pageCount: 10, findingCount: 3, durationMs: 1000, classification: "directory", truncated: false, authed: true } },
      { profileId: "user_9" },
    );
    expect(trackRaw).toHaveBeenCalledWith(
      "audit_completed",
      { host: "x.com", score: 42, pageCount: 10, findingCount: 3, durationMs: 1000, classification: "directory", truncated: false, authed: true },
      "user_9",
    );
  });

  it("passes undefined profileId for a propless event with no opts", async () => {
    await trackServer({ name: "gsc_connected" });
    expect(trackRaw).toHaveBeenCalledWith("gsc_connected", {}, undefined);
  });

  it("delegates identify and alias", async () => {
    await identifyServer({ profileId: "u", email: "a@b.com", properties: { plan: "pro" } });
    await aliasServer({ profileId: "u", alias: "anon123" });
    expect(identifyRaw).toHaveBeenCalledWith({ profileId: "u", email: "a@b.com", properties: { plan: "pro" } });
    expect(aliasRaw).toHaveBeenCalledWith({ profileId: "u", alias: "anon123" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/analytics/track.server.test.ts`
Expected: FAIL, cannot find module `./track.server`.

- [ ] **Step 3: Create `track.server.ts`**

Create `apps/web/src/lib/analytics/track.server.ts`:
```ts
import "server-only";
import { trackRaw, identifyRaw, aliasRaw } from "./op-transport.server";
import { toTrackArgs, type AnalyticsEvent } from "./events";

/** Typed server-side tracking. App glue binding the catalog to the transport. */
export function trackServer(event: AnalyticsEvent, opts: { profileId?: string } = {}): Promise<void> {
  const [name, props] = toTrackArgs(event);
  return trackRaw(name, props, opts.profileId);
}

export function identifyServer(payload: {
  profileId: string;
  email?: string;
  properties?: Record<string, unknown>;
}): Promise<void> {
  return identifyRaw(payload);
}

export function aliasServer(payload: { profileId: string; alias: string }): Promise<void> {
  return aliasRaw(payload);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/analytics/track.server.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/analytics/track.server.ts apps/web/src/lib/analytics/track.server.test.ts
git commit -m "feat(analytics): typed server bindings"
```

---

### Task A5: Client transport + hook + view/link helpers

No new unit tests (repo has no jsdom/React-render test setup; the pure mapping is already covered by `events.test.ts`). Verification is `bun run typecheck`.

**Files:**
- Create: `apps/web/src/lib/analytics/op-transport.client.tsx`
- Create: `apps/web/src/lib/analytics/use-analytics.ts`
- Create: `apps/web/src/lib/analytics/track-view.tsx`
- Create: `apps/web/src/components/analytics/tracked-link.tsx`

- [ ] **Step 1: Create `op-transport.client.tsx`**
```tsx
"use client";
import { OpenPanelComponent } from "@openpanel/nextjs";

/**
 * Generic OpenPanel client transport: portable, no pseolint event names.
 * Renders nothing when unconfigured. trackScreenViews emits pageviews
 * automatically; trackOutgoingLinks emits outbound-link clicks.
 */
export function AnalyticsProvider({
  clientId,
  apiUrl,
  profileId,
}: {
  clientId?: string;
  apiUrl?: string;
  profileId?: string;
}) {
  if (!clientId) return null;
  return (
    <OpenPanelComponent
      clientId={clientId}
      {...(apiUrl ? { apiUrl } : {})}
      {...(profileId ? { profileId } : {})}
      trackScreenViews
      trackOutgoingLinks
    />
  );
}
```

- [ ] **Step 2: Create `use-analytics.ts`**
```ts
"use client";
import { useOpenPanel } from "@openpanel/nextjs";
import { toTrackArgs, type AnalyticsEvent } from "./events";

/** Typed client tracking. The provider sets profileId globally, so callers
 *  only pass the event. */
export function useAnalytics(): { track: (event: AnalyticsEvent) => void } {
  const op = useOpenPanel();
  return {
    track: (event) => {
      const [name, props] = toTrackArgs(event);
      op.track(name, props);
    },
  };
}
```

- [ ] **Step 3: Create `track-view.tsx`**
```tsx
"use client";
import { useEffect, useRef } from "react";
import { useAnalytics } from "./use-analytics";
import type { AnalyticsEvent } from "./events";

/** Render-nothing helper: fires one event on mount. Lets server pages emit a
 *  typed view event without a bespoke client island. */
export function TrackView({ event }: { event: AnalyticsEvent }) {
  const { track } = useAnalytics();
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    track(event);
    // Fire once on mount; event identity intentionally excluded from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
```

- [ ] **Step 4: Create `components/analytics/tracked-link.tsx`**
```tsx
"use client";
import Link from "next/link";
import type { ComponentProps } from "react";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import type { AnalyticsEvent } from "@/lib/analytics/events";

/** A next/link that fires a typed event on click before navigating. */
export function TrackedLink({
  event,
  onClick,
  ...props
}: ComponentProps<typeof Link> & { event: AnalyticsEvent }) {
  const { track } = useAnalytics();
  return (
    <Link
      {...props}
      onClick={(e) => {
        track(event);
        onClick?.(e);
      }}
    />
  );
}
```

- [ ] **Step 5: Typecheck**

Run (from `apps/web/`): `bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**
```bash
git add apps/web/src/lib/analytics/op-transport.client.tsx apps/web/src/lib/analytics/use-analytics.ts apps/web/src/lib/analytics/track-view.tsx apps/web/src/components/analytics/tracked-link.tsx
git commit -m "feat(analytics): client provider, typed hook, view/link helpers"
```

---

## PHASE B: Identity wiring

### Task B1: Mount the provider in the root layout

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Add imports**

In `apps/web/src/app/layout.tsx`, add to the import block (after line 9):
```ts
import { env } from "@/lib/env";
import { getAnonSessionId } from "@/lib/session";
import { AnalyticsProvider } from "@/lib/analytics/op-transport.client";
```

- [ ] **Step 2: Compute profileId and render the provider**

In `RootLayout`, after the `const plan = ...` line (line 79), add:
```ts
  const e = env();
  const profileId = session?.user.id ?? (await getAnonSessionId()) ?? undefined;
```
Then inside `<body>`, immediately after the opening `<body ...>` tag's first child (place it right before `<SiteNav .../>`), add:
```tsx
        <AnalyticsProvider clientId={e.OPENPANEL_CLIENT_ID} apiUrl={e.OPENPANEL_API_URL} profileId={profileId} />
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add apps/web/src/app/layout.tsx
git commit -m "feat(analytics): mount provider in root layout with profileId"
```

---

### Task B2: Sign-in identity stitch (`record-sign-in.ts` + auth hook)

**Files:**
- Create: `apps/web/src/lib/analytics/record-sign-in.ts`
- Test: `apps/web/src/lib/analytics/record-sign-in.test.ts`
- Modify: `apps/web/src/lib/auth.ts:44-52`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/analytics/record-sign-in.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieGet = vi.fn();
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: cookieGet })) }));

const identifyServer = vi.fn();
const aliasServer = vi.fn();
const trackServer = vi.fn();
vi.mock("./track.server", () => ({ identifyServer, aliasServer, trackServer }));

const getPlan = vi.fn();
vi.mock("@/lib/plan", () => ({ getPlan }));

const selectChain = { from: () => selectChain, where: () => selectChain, limit: vi.fn() };
vi.mock("@/db", () => ({ db: { select: () => selectChain }, schema: {} }));
vi.mock("@/db/schema", () => ({ users: {} }));

import { recordSignIn } from "./record-sign-in";

beforeEach(() => {
  cookieGet.mockReset(); identifyServer.mockReset(); aliasServer.mockReset();
  trackServer.mockReset(); getPlan.mockReset(); selectChain.limit.mockReset();
});

describe("recordSignIn", () => {
  it("identifies, aliases the anon id, and tracks signed_in (new user)", async () => {
    cookieGet.mockReturnValue({ value: "abcdefghijklmnopqrstu" }); // 21 chars
    getPlan.mockResolvedValue("free");
    selectChain.limit.mockResolvedValue([{ email: "a@b.com", createdAt: new Date() }]);

    await recordSignIn("user_1");

    expect(identifyServer).toHaveBeenCalledWith({ profileId: "user_1", email: "a@b.com", properties: { plan: "free" } });
    expect(aliasServer).toHaveBeenCalledWith({ profileId: "user_1", alias: "abcdefghijklmnopqrstu" });
    expect(trackServer).toHaveBeenCalledWith({ name: "signed_in", props: { isNewUser: true } }, { profileId: "user_1" });
  });

  it("skips alias when there is no anon cookie, and marks returning user", async () => {
    cookieGet.mockReturnValue(undefined);
    getPlan.mockResolvedValue("pro");
    selectChain.limit.mockResolvedValue([{ email: "a@b.com", createdAt: new Date(Date.now() - 5 * 86_400_000) }]);

    await recordSignIn("user_2");

    expect(aliasServer).not.toHaveBeenCalled();
    expect(trackServer).toHaveBeenCalledWith({ name: "signed_in", props: { isNewUser: false } }, { profileId: "user_2" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/analytics/record-sign-in.test.ts`
Expected: FAIL, cannot find module `./record-sign-in`.

- [ ] **Step 3: Create `record-sign-in.ts`**

Create `apps/web/src/lib/analytics/record-sign-in.ts`:
```ts
import "server-only";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getPlan } from "@/lib/plan";
import { identifyServer, aliasServer, trackServer } from "./track.server";

const ANON_COOKIE = "pseolint_anon";
const NEW_USER_WINDOW_MS = 60_000;

/**
 * Stitch a freshly-signed-in user to their prior anonymous activity and emit
 * signed_in. Called from better-auth's session.create.after, BEFORE
 * claimAnonAudits clears the anon cookie (so the alias still has the id).
 * isNewUser is a 60s-createdAt heuristic: approximate by design; analytics,
 * not authorization. Never throws (sign-in must not depend on analytics).
 */
export async function recordSignIn(userId: string): Promise<void> {
  try {
    const store = await cookies();
    const anonId = store.get(ANON_COOKIE)?.value;
    const [u] = await db
      .select({ email: users.email, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const isNewUser = u?.createdAt
      ? Date.now() - new Date(u.createdAt).getTime() < NEW_USER_WINDOW_MS
      : false;
    const plan = await getPlan(userId);

    await identifyServer({ profileId: userId, email: u?.email, properties: { plan } });
    if (anonId && /^[a-zA-Z0-9_-]{21}$/.test(anonId)) {
      await aliasServer({ profileId: userId, alias: anonId });
    }
    await trackServer({ name: "signed_in", props: { isNewUser } }, { profileId: userId });
  } catch {
    /* analytics must never block sign-in */
  }
}
```

> **Verify field names:** confirm `users.createdAt` and `users.email` exist in `apps/web/src/db/schema.ts` (better-auth defaults). `users.email` is already used in `api/webhooks/polar/route.ts`. If `createdAt` is named differently, adjust the select.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/analytics/record-sign-in.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire into the auth session hook**

In `apps/web/src/lib/auth.ts`, add the import after line 8:
```ts
import { recordSignIn } from "@/lib/analytics/record-sign-in";
```
Then change the `session.create.after` hook (lines 45-51) so `recordSignIn` runs first:
```ts
      create: {
        after: async (session) => {
          await recordSignIn(session.userId);
          await claimAnonAudits(session.userId);
        },
      },
```

- [ ] **Step 6: Typecheck + run the analytics suite**

Run: `bun run typecheck`
Expected: PASS.
Run: `bunx vitest run src/lib/analytics/`
Expected: PASS (all analytics tests).

- [ ] **Step 7: Commit**
```bash
git add apps/web/src/lib/analytics/record-sign-in.ts apps/web/src/lib/analytics/record-sign-in.test.ts apps/web/src/lib/auth.ts
git commit -m "feat(analytics): anon->account identity stitch on sign-in"
```

---

## PHASE C: Primary funnel events

### Task C1: Audit API route: `audit_created` + `audit_blocked`

**Files:**
- Modify: `apps/web/src/app/api/audits/route.ts`

Instrument the high-value funnel frictions. Intentionally **not** instrumented: blocklist (403), email-not-verified (403), Pro-cooldown (429), in-flight (429), invalid-body (the client already emits `audit_submit_failed` for those). `origin_degraded` is not a block (the audit proceeds), so no event.

- [ ] **Step 1: Add imports**

After line 23 in `apps/web/src/app/api/audits/route.ts`:
```ts
import { after } from "next/server";
import { trackServer } from "@/lib/analytics/track.server";
import type { AuditBlockReason } from "@/lib/analytics/events";
```

- [ ] **Step 2: Add a block helper after the session is resolved**

Immediately after `const sessionTrusted = !!session?.user.emailVerified;` (line 102), add:
```ts
  // Best-effort attribution: sessioned callers by user id; anon block events
  // ride OpenPanel's cookieless hash (the anon cookie may not exist yet here).
  const blockProfileId = session?.user.id;
  const trackBlocked = (reason: AuditBlockReason, status: number): void => {
    after(() => trackServer({ name: "audit_blocked", props: { reason, status } }, { profileId: blockProfileId }));
  };
```

- [ ] **Step 3: Tag each block return**

Add the matching `trackBlocked(...)` call on the line BEFORE each of these existing `return NextResponse.json(...)` statements (match by the reason string already in the adjacent `auditLog`):

| Existing log reason / location | Insert before its return |
|---|---|
| `mode !== "normal"` (503, line ~82) | `trackBlocked("paused", 503);` |
| `bot_check_failed` (400, line ~107) | `trackBlocked("bot_check", 400);` |
| `ssrf` (400, line ~115) | `trackBlocked("private_url", 400);` |
| per_host (429, line ~205) | `trackBlocked("domain_limit", 429);` |
| Pro `per_host` (429, line ~243) | `trackBlocked("domain_limit", 429);` |
| Pro `per_user_host` (429, line ~249) | `trackBlocked("domain_limit", 429);` |
| Pro `per_user` (429, line ~261) | `trackBlocked("daily_limit", 429);` |
| Free `per_user` (429, line ~270) | `trackBlocked("daily_limit", 429);` |
| Free `per_user_host` (429, line ~277) | `trackBlocked("domain_limit", 429);` |
| anon `per_anon` (429, line ~292) | `trackBlocked("session_limit", 429);` |
| anon `per_anon_host` (429, line ~300) | `trackBlocked("domain_limit", 429);` |
| anon `per_ip` (429, line ~315) | `trackBlocked("session_limit", 429);` |
| anon `per_ip_host` (429, line ~326) | `trackBlocked("domain_limit", 429);` |
| `origin_unreachable` (503, line ~370) | `trackBlocked("origin_unreachable", 503);` |

Example (the bot-check block becomes):
```ts
    if (!turnstileToken || !(await verifyTurnstileToken(turnstileToken, ip))) {
      auditLog("audit.request.rejected", { reason: "bot_check_failed", url });
      trackBlocked("bot_check", 400);
      return NextResponse.json({ error: "Bot check failed" }, { status: 400 });
    }
```

- [ ] **Step 4: Tag the cached/deduped success return**

In the dedupe block, before `return NextResponse.json({ auditId: cached.id, reportUrl: ... cached: true }, ...)` (line ~179):
```ts
      after(() => trackServer({ name: "audit_created", props: { host, cached: true, authed: !!session } }, { profileId: session?.user.id }));
```

- [ ] **Step 5: Tag the fresh-audit success return**

Before the final `return NextResponse.json({ auditId: row.id, reportUrl: `/a/${row.id}` }, { status: 202 });` (line ~401):
```ts
  after(() => trackServer(
    { name: "audit_created", props: { host, cached: false, authed: !!userId } },
    { profileId: userId ?? anonSessionId ?? undefined },
  ));
```

- [ ] **Step 6: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**
```bash
git add apps/web/src/app/api/audits/route.ts
git commit -m "feat(analytics): audit_created + audit_blocked on the audit API"
```

---

### Task C2: Audit pipeline: `audit_completed` + `audit_failed`

**Files:**
- Modify: `apps/web/src/inngest/functions/run-audit.ts`

- [ ] **Step 1: Add imports**

After line 17 in `apps/web/src/inngest/functions/run-audit.ts`:
```ts
import { trackServer } from "@/lib/analytics/track.server";
```

- [ ] **Step 2: Resolve analytics profile + host at the top of `executeAudit`**

After `const startedAt = Date.now();` (line 128), add:
```ts
  const analyticsHost = (() => {
    try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return "unknown"; }
  })();
  const [analyticsOwner] = await db
    .select({ userId: audits.userId, anonSessionId: audits.anonSessionId })
    .from(audits)
    .where(eq(audits.id, auditId))
    .limit(1);
  const analyticsProfileId = analyticsOwner?.userId ?? analyticsOwner?.anonSessionId ?? undefined;
  const analyticsAuthed = !!analyticsOwner?.userId;
```

- [ ] **Step 3: Emit `audit_failed` in the catch block**

In the `catch (e)` block, after `auditLog("audit.failed", { auditId, err: msg, ms: Date.now() - startedAt });` (line ~280):
```ts
    await trackServer(
      { name: "audit_failed", props: { host: analyticsHost, reason: msg.slice(0, 200) } },
      { profileId: analyticsProfileId },
    );
```

- [ ] **Step 4: Emit `audit_completed` after the completion log**

After `auditLog("audit.completed", { auditId, risk: summary.risk, pageCount: summary.pageCount, findingCount, ms: Date.now() - startedAt });` (line ~416):
```ts
  await trackServer(
    {
      name: "audit_completed",
      props: {
        host: analyticsHost,
        score: summary.risk,
        pageCount: summary.pageCount,
        findingCount,
        durationMs: Date.now() - startedAt,
        classification: summary.siteClassification ?? null,
        truncated: summary.truncated ?? false,
        authed: analyticsAuthed,
      },
    },
    { profileId: analyticsProfileId },
  );
```

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**
```bash
git add apps/web/src/inngest/functions/run-audit.ts
git commit -m "feat(analytics): audit_completed + audit_failed in the audit pipeline"
```

---

### Task C3: Polar webhook: `subscription_started` + `subscription_canceled`

**Files:**
- Modify: `apps/web/src/app/api/webhooks/polar/route.ts`

- [ ] **Step 1: Add import**

After line 8 in `apps/web/src/app/api/webhooks/polar/route.ts`:
```ts
import { trackServer } from "@/lib/analytics/track.server";
```

- [ ] **Step 2: Emit `subscription_started` on first transition to active**

Inside the `subscription.created || updated || active` block, after the `userProfiles` upsert (after line 75, still inside the `if`), add:
```ts
    if (event.type !== "subscription.updated" && plan === "pro") {
      const interval =
        event.data.recurringInterval === "month" ? "monthly"
        : event.data.recurringInterval === "year" ? "yearly"
        : "unknown";
      const md = (event.data.metadata ?? {}) as Record<string, string>;
      await trackServer(
        { name: "subscription_started", props: { interval, intent: md.intent ?? null } },
        { profileId: u.id },
      );
    }
```

> **Verify field name:** confirm the recurring-interval field on the Polar subscription event (`event.data.recurringInterval`, values `"month"`/`"year"`). If the installed `@polar-sh/sdk` names it differently, adjust the mapping; fall back to `"unknown"` keeps it safe.

- [ ] **Step 3: Emit `subscription_canceled`**

Inside the `subscription.canceled || revoked` block, inside `if (u) { ... }`, after the plan update branches (after line 119), add:
```ts
      await trackServer(
        { name: "subscription_canceled", props: { immediate } },
        { profileId: u.id },
      );
```
(`immediate` is already defined in that block as `event.type === "subscription.revoked"`.)

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/app/api/webhooks/polar/route.ts
git commit -m "feat(analytics): subscription_started + subscription_canceled"
```

---

### Task C4: Checkout route: `checkout_redirected`

**Files:**
- Modify: `apps/web/src/app/api/checkout/route.ts`

- [ ] **Step 1: Add imports**

After line 5 in `apps/web/src/app/api/checkout/route.ts`:
```ts
import { after } from "next/server";
import { trackServer } from "@/lib/analytics/track.server";
```

- [ ] **Step 2: Emit before returning the checkout URL**

After `const { url } = await createCheckoutSession({ ... });` (line 33), before `return NextResponse.json({ url });`:
```ts
  after(() => trackServer(
    { name: "checkout_redirected", props: { interval: body.data.interval } },
    { profileId: session.user.id },
  ));
```

- [ ] **Step 3: Typecheck + commit**

Run: `bun run typecheck` → PASS.
```bash
git add apps/web/src/app/api/checkout/route.ts
git commit -m "feat(analytics): checkout_redirected"
```

---

### Task C5: Landing form: `audit_form_engaged`, `audit_submitted`, `audit_submit_failed`

**Files:**
- Modify: `apps/web/src/components/landing/landing-form.tsx`

- [ ] **Step 1: Add the hook + a host helper**

In `apps/web/src/components/landing/landing-form.tsx`, add the import (after line 12):
```ts
import { useAnalytics } from "@/lib/analytics/use-analytics";
```
Inside `LandingForm()`, after `const router = useRouter();` (line 59):
```ts
  const { track } = useAnalytics();
  const engagedRef = useRef(false);
```
(Add `useRef` to the existing `react` import on line 2: `import { useState, useEffect, useRef, type ReactNode } from "react";`.)
Add this helper near the other module-scope helpers at the bottom of the file (e.g. after `normalizeUrl`):
```ts
function hostOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return "unknown"; }
}
```

- [ ] **Step 2: `audit_form_engaged` on first focus**

Change the input's `onFocus` (line 240) from:
```tsx
                  onFocus={ () => setTurnstileArmed(true) }
```
to:
```tsx
                  onFocus={ () => {
                    setTurnstileArmed(true);
                    if (!engagedRef.current) { engagedRef.current = true; track({ name: "audit_form_engaged" }); }
                  } }
```

- [ ] **Step 3: `audit_submitted` right before the fetch**

In `submit()`, immediately before `const res = await fetch("/api/audits", {` (line 167):
```ts
      track({ name: "audit_submitted", props: { host: hostOf(normalized), force, source: "landing" } });
```

- [ ] **Step 4: `audit_submit_failed` on a non-OK response**

In `submit()`, inside the `else` after the `res.ok` block, change the failure parse (line 185) to capture and track:
```ts
      const { error, code } = await res.json().catch(() => ({ error: "Unknown error" }));
      track({ name: "audit_submit_failed", props: { status: res.status, code: typeof code === "string" ? code : undefined } });
      setErr(mapApiError(res.status, String(error ?? "Unknown error"), code));
```

- [ ] **Step 5: Typecheck + commit**

Run: `bun run typecheck` → PASS.
```bash
git add apps/web/src/components/landing/landing-form.tsx
git commit -m "feat(analytics): landing form funnel events"
```

---

### Task C6: Sign-in + pricing client events

**Files:**
- Modify: `apps/web/src/app/signin/signin-client.tsx`
- Modify: `apps/web/src/app/pricing/pricing-client.tsx`

- [ ] **Step 1: `signin_started` in signin-client**

In `signin-client.tsx`, add import after line 5:
```ts
import { useAnalytics } from "@/lib/analytics/use-analytics";
```
Inside `SigninClient()`, after the `useState` declarations (line 12):
```ts
  const { track } = useAnalytics();
```
In the magic-link `onSubmit`, after `setSubmitting(true);` (line 43):
```ts
                  track({ name: "signin_started", props: { method: "magic_link" } });
```
In the Google button `onClick` (line 84), make it:
```tsx
                onClick={() => {
                  track({ name: "signin_started", props: { method: "google" } });
                  authClient.signIn.social({ provider: "google", callbackURL: "/dashboard" });
                }}
```

- [ ] **Step 2: `checkout_started` in pricing-client**

In `pricing-client.tsx`, add import after line 6:
```ts
import { useAnalytics } from "@/lib/analytics/use-analytics";
```
Inside `PricingInner()`, after `const auditSlug = search.get("audit");` (line 96):
```ts
  const { track } = useAnalytics();
```
In `go(interval)`, after `setLoading(interval);` (line 99):
```ts
    track({ name: "checkout_started", props: { interval } });
```

- [ ] **Step 3: Typecheck + commit**

Run: `bun run typecheck` → PASS.
```bash
git add apps/web/src/app/signin/signin-client.tsx apps/web/src/app/pricing/pricing-client.tsx
git commit -m "feat(analytics): signin_started + checkout_started"
```

---

## PHASE D: Secondary surfaces

These reuse `<TrackView>` (view events from server pages), `<TrackedLink>` (click events), and the established server pattern (`after(() => trackServer(...))`).

> **Note on specificity:** the reusable helpers (`TrackView`, `TrackedLink`, `useAnalytics`, `trackServer`) are fully defined in Phases A–C. The Phase D files were **not** read line-by-line while authoring this plan, so each Phase D step begins with a "read the file, locate the success/click point" action and then applies the exact one-liner shown. This phase is the exhaustive long-tail; Phases A–C already deliver the high-value funnel end-to-end and can ship independently. Implement Phase D file-by-file, committing per file group.

### Task D1: Server secondary events: `gsc_connected`, `report_exported`

**Files:**
- Modify: `apps/web/src/app/api/integrations/gsc/callback/route.ts`
- Modify: `apps/web/src/app/api/audits/[id]/export/[format]/route.ts`

- [ ] **Step 1: Read both routes**

Run: open each file and locate (a) the success path in the GSC callback (after the OAuth token exchange + DB persist, right before the redirect back to the dashboard), and (b) the point in the export route where the export is confirmed produced (right before returning the file/redirect), plus how it resolves the current user (`requireSession`/`getOptionalSession`).

- [ ] **Step 2: GSC `gsc_connected`**

Add imports at the top of `gsc/callback/route.ts`:
```ts
import { after } from "next/server";
import { trackServer } from "@/lib/analytics/track.server";
```
On the success path, before the redirect that signals a connected integration (use the authenticated user id resolved in that handler as `profileId`):
```ts
  after(() => trackServer({ name: "gsc_connected" }, { profileId: userId }));
```
(Replace `userId` with the variable the handler already holds for the signed-in user.)

- [ ] **Step 3: Export `report_exported`**

Add the same two imports to `audits/[id]/export/[format]/route.ts`. Before the successful export response, using the `format` route param and the resolved user id:
```ts
  after(() => trackServer({ name: "report_exported", props: { format } }, { profileId: userId }));
```
(If the handler does not already bind a `userId`, derive it from the session it loads; if exports are allowed anonymously, pass `profileId: undefined`.)

- [ ] **Step 4: Typecheck + commit**

Run: `bun run typecheck` → PASS.
```bash
git add apps/web/src/app/api/integrations/gsc/callback/route.ts "apps/web/src/app/api/audits/[id]/export/[format]/route.ts"
git commit -m "feat(analytics): gsc_connected + report_exported"
```

---

### Task D2: View events on content pages

**Files (server components, drop in `<TrackView>`):**
- Modify: `apps/web/src/app/rules/[ruleId]/page.tsx`
- Modify: `apps/web/src/app/symptoms/[symptom]/page.tsx`
- Modify: `apps/web/src/app/tools/[tool]/page.tsx`
- Modify: report page (`apps/web/src/app/r/[slug]/page.tsx` and/or `apps/web/src/app/a/[id]/page.tsx`)

> These four files currently have **uncommitted edits in the working tree** (the rules-explainer work). Coordinate: apply these one-line additions on top of the current file state; do not revert existing changes.

- [ ] **Step 1: rules page**

In `app/rules/[ruleId]/page.tsx`, add:
```tsx
import { TrackView } from "@/lib/analytics/track-view";
```
In the returned JSX (top level), add (using the page's resolved `ruleId` param):
```tsx
      <TrackView event={{ name: "rule_viewed", props: { ruleId } }} />
```

- [ ] **Step 2: symptoms page**

In `app/symptoms/[symptom]/page.tsx`, add the import and:
```tsx
      <TrackView event={{ name: "symptom_viewed", props: { symptom } }} />
```

- [ ] **Step 3: tools page**

In `app/tools/[tool]/page.tsx`, add the import and:
```tsx
      <TrackView event={{ name: "tool_viewed", props: { tool } }} />
```
(Use the page's tool slug variable.)

- [ ] **Step 4: report page `report_viewed`**

In the report page server component, read the `cached` search param (the form sets `?cached=1`) and the `slug`, then add:
```tsx
      <TrackView event={{ name: "report_viewed", props: { slug, cached: cachedParam === "1" } }} />
```

- [ ] **Step 5: Typecheck + commit**

Run: `bun run typecheck` → PASS.
```bash
git add "apps/web/src/app/rules/[ruleId]/page.tsx" "apps/web/src/app/symptoms/[symptom]/page.tsx" "apps/web/src/app/tools/[tool]/page.tsx" "apps/web/src/app/r/[slug]/page.tsx"
git commit -m "feat(analytics): rule/symptom/tool/report view events"
```

---

### Task D3: Click/action events: upgrade, tool_run, leaderboard, dashboard surfaces

**Files:**
- Modify: `apps/web/src/app/layout.tsx` (nav Upgrade → `TrackedLink`, `upgrade_clicked {source:"nav"}`)
- Modify: `apps/web/src/app/tools/[tool]/tool-form.tsx` (`tool_run`)
- Modify: leaderboard rows (`leaderboard_entry_clicked`)
- Modify: `apps/web/src/components/audit/monitor-domain-button.tsx` (`monitoring_domain_added`)
- Modify: manifests UI (`manifest_created`), mcp-keys UI (`mcp_key_created`), dashboard integrations page (`integration_connect_clicked`), dashboard findings UI (`triage_action`)

- [ ] **Step 1: Nav upgrade link**

In `app/layout.tsx`, import `TrackedLink` and replace the nav Upgrade `<Link href="/pricing" ...>Upgrade</Link>` (lines 120-125) with:
```tsx
            <TrackedLink
              href="/pricing"
              event={{ name: "upgrade_clicked", props: { source: "nav" } }}
              className="ml-1 hidden h-8 items-center rounded-[18px] border border-primary/40 bg-primary/10 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/15 sm:inline-flex"
            >
              Upgrade
            </TrackedLink>
```
(`SiteNav` is a server component rendering a client `TrackedLink`, fine.)

- [ ] **Step 2: tool_run**

In `tools/[tool]/tool-form.tsx` (client), add `useAnalytics` and fire on a successful run:
```ts
      track({ name: "tool_run", props: { tool } });
```
(Place at the start of the run handler; pass the tool slug the form already knows.)

- [ ] **Step 3: leaderboard_entry_clicked**

On each leaderboard row link, use `TrackedLink` with `event={{ name: "leaderboard_entry_clicked", props: { host } }}`. If rows are server-rendered `<Link>`s, swap to `TrackedLink`.

- [ ] **Step 4: monitoring_domain_added / manifest_created / mcp_key_created / integration_connect_clicked / triage_action**

Each is a client component performing an action. Add `useAnalytics` and fire on success:
- `monitor-domain-button.tsx`: after the add succeeds → `track({ name: "monitoring_domain_added", props: { host } })`.
- manifests create UI: after create succeeds → `track({ name: "manifest_created" })`.
- mcp-keys create UI: after key create succeeds → `track({ name: "mcp_key_created" })`.
- `dashboard/integrations/page.tsx` connect buttons: on click → `track({ name: "integration_connect_clicked", props: { provider } })` (provider ∈ gsc|webflow|wordpress). If a button is in a server component, wrap with a small client control or `TrackedLink`.
- dashboard findings action UI (caller of `_actions/findings.ts`): on action → `track({ name: "triage_action", props: { action } })`.
- `cta_clicked`: the landing page's secondary "Audit my site: free" anchors and the final CTA section (`landing-form.tsx`, already has `track` from C5) and the pricing "Try free audit" link: add `track({ name: "cta_clicked", props: { location } })` on click (`location` ∈ e.g. `"hero_secondary"`, `"final_cta"`, `"pricing_try_free"`). This retires the last unused catalog member.

- [ ] **Step 5: Typecheck + commit**

Run: `bun run typecheck` → PASS.
```bash
git add -A apps/web/src
git commit -m "feat(analytics): secondary click/action events"
```

---

## PHASE E: Privacy + terms copy

### Task E1: Rewrite the analytics/cookies copy

**Files:**
- Modify: `apps/web/src/app/privacy/page.tsx`
- Modify: `apps/web/src/app/terms/page.tsx`

- [ ] **Step 1: Privacy: data-collected answer (line ~33)**

Change the trailing sentence `... No raw IPs, no card data, no behavioral tracking.` to:
```
... No raw IPs, no card data. Product analytics is first-party, self-hosted, and cookieless (see Analytics below).
```

- [ ] **Step 2: Privacy: Analytics item (line ~115)**

Replace the `Analytics` item value with:
```
Aggregate request logs (route, status, response time) retained 30 days for debugging and capacity planning. Product analytics via OpenPanel, self-hosted on our own infrastructure (api-openpanel.philippekam.dev), first-party and cookieless: sessions are counted via a privacy-preserving daily-rotating hash of IP + user-agent, the same technique we use for rate limiting, with nothing persisted past 24 hours. No third-party analytics service, no cross-site identifiers, no advertising. Data is never sold or shared. Legal basis: legitimate interest.
```

- [ ] **Step 3: Privacy: "No behavioral tracking" item (line ~121)**

Replace its value with (and consider retitling the key to "No third-party / cross-site tracking"):
```
No third-party or cross-site tracking. No Google Analytics, Segment, Mixpanel, FB pixel, LinkedIn pixel, or similar. No cross-site identifiers. Our product analytics is first-party and runs on our own servers.
```

- [ ] **Step 4: Privacy: "No analytics cookies" item (line ~171)**

Keep the key; clarify the value:
```
Our analytics is cookieless, we set no analytics or tracking cookies. We reuse the strictly-necessary anonymous session identifier as a first-party analytics profile key, setting no additional cookie.
```

- [ ] **Step 5: Terms**

Open `app/terms/page.tsx`, find the analytics/tracking line, and align it with the above (first-party, self-hosted, cookieless; drop any absolute "no analytics" claim).

- [ ] **Step 6: Typecheck + commit**

Run: `bun run typecheck` → PASS.
```bash
git add apps/web/src/app/privacy/page.tsx apps/web/src/app/terms/page.tsx
git commit -m "docs(privacy): describe first-party cookieless OpenPanel analytics"
```

---

## PHASE F: Verification

### Task F1: Full suite + build

- [ ] **Step 1: Run the full web test suite**

Run (from `apps/web/`): `bun run test`
Expected: PASS (all existing + new analytics tests; no regressions).

- [ ] **Step 2: Typecheck the whole app**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Production build (catches RSC/client boundary + `after()` usage errors)**

Run: `bun run build`
Expected: build succeeds. (Build runs with `NEXT_PHASE=phase-production-build`; OpenPanel keys are optional so the build needs no analytics env.)

- [ ] **Step 4: Manual smoke (configured env): optional but recommended**

With `OPENPANEL_CLIENT_ID/SECRET/API_URL` set in `.env`, run `bun run dev`, load `/`, submit an audit, and confirm in the OpenPanel dashboard that `screen_view`, `audit_submitted`, and `audit_created` arrive; sign in and confirm `signed_in` + identify. With the keys removed, confirm the app runs and emits nothing.

- [ ] **Step 5: Final commit (if any verification fixups were needed)**
```bash
git add -A apps/web/src
git commit -m "test(analytics): verification fixups"
```

---

## Acceptance criteria (from spec §11)

1. Configured: pageviews + `audit_submitted`/`audit_created`/`audit_completed` flow; sign-in emits `signed_in` + identify + alias; subsequent events attribute to `user.id`; a Pro purchase emits `subscription_started`.
2. Unconfigured: app builds and runs unchanged: no network calls, no thrown errors, provider renders nothing.
3. `/privacy` + `/terms` accurately describe the analytics; no remaining absolute "no analytics SDK / no behavioral tracking" claims.
4. `bun run test` + `bun run typecheck` + `bun run build` all green.
