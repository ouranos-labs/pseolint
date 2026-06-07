# Remote MCP Server — Design Spec

**Date:** 2026-06-07
**Status:** Approved (design), pending spec review
**Scope:** Add a remote (Streamable HTTP) MCP endpoint for pseolint, hosted in `apps/web`, alongside the existing published stdio package `@pseolint/mcp`.

---

## 1. Goal & motivation

pseolint already ships a free, open-source **stdio** MCP server (`@pseolint/mcp`) exposing four tools. A remote endpoint adds two things the stdio package cannot:

1. **Zero-install acquisition.** A Claude / Cursor / VS Code user pastes one URL — no Node, no `npx`, no config file beyond the URL. This is the "symptom front door" positioning applied to the MCP distribution channel.
2. **A seam for SaaS-only capability.** The one tool that costs real money (`orchestrate_audit`, managed Anthropic) and any future SaaS-grounded surface (monitoring, GSC fix queue) can ride an authenticated channel with the existing Polar billing.

Because the three read-only tools are **already free and open-source**, exposing them anonymously over HTTP surrenders **no moat** — it is pure top-of-funnel reach. The paid tool stays gated.

### v1 boundary (locked)

- **In:** remote endpoint serving the **three read-only tools** (`audit_site`, `explain_score`, `check_page_technical`), anonymous + rate-limited, plus **API-key auth scaffolding** so an authenticated identity is recognized.
- **Out (deferred, with clean seams):** remote `orchestrate_audit`, OAuth 2.1 + authorization-server metadata, Polar metering over MCP, SSE streaming, multi-region session affinity.

---

## 2. Architecture & hosting

A single **stateless Streamable HTTP** endpoint, implemented as a Next.js App Router route handler inside `apps/web`, deployed on Vercel with the rest of the app.

- **Public URL:** `https://pseolint.dev/mcp` (route at `apps/web/src/app/mcp/route.ts`). Chosen over `/api/mcp` for a friendlier paste target; both are equally easy to implement.
- **Runtime:** `export const runtime = "nodejs"` — `@pseolint/core` performs filesystem + network I/O and the MCP SDK is Node-oriented; edge is not viable.
- **Duration:** `export const maxDuration = 60` (read-only audits are sample-capped at `MCP_SAMPLE_CAP = 50` pages and finish well within this; the long-running `orchestrate` is intentionally not on this path).
- **Stateless transport:** per the MCP best-practices guidance for remote servers, each `POST` instantiates a fresh `McpServer` + `StreamableHTTPServerTransport` configured **without** a session id (JSON responses, no SSE, no server-held session state). This is the documented serverless pattern — no sticky routing required, scales horizontally for free.
- **No new transport dependency:** we use the MCP SDK's `StreamableHTTPServerTransport` directly rather than adding `mcp-handler`, so the route reuses our own tool factory (section 3) and we keep full control of auth/rate-limit interception.

### Request lifecycle

```
POST /mcp
  │
  ├─ rate-limit check  (Upstash; per-key if Bearer present, else per-IP)
  │     └─ over limit → 429 (JSON-RPC-shaped error + Retry-After)
  ├─ auth resolve      (Bearer present? verify via better-auth apiKey → identity; invalid → 401)
  ├─ build McpServer    (registerReadOnlyTools(server))
  ├─ StreamableHTTPServerTransport (stateless)
  └─ handle JSON-RPC → JSON response
```

`GET /mcp` and `DELETE /mcp` return `405` (no SSE stream, no session teardown in stateless mode). A minimal capability/health response is acceptable on `GET` if a client probes it, but is not required by the stateless spec.

---

## 3. Shared tool factory (DRY)

Today all four tools are registered inside `createServer()` in `@pseolint/mcp` (`packages/mcp/src/server.ts`). To avoid duplicating ~450 lines of tool definitions in the web app, refactor registration into reusable functions:

```ts
// packages/mcp/src/server.ts  (exported)
export function registerReadOnlyTools(server: McpServer): void { /* audit_site, explain_score, check_page_technical */ }
export function registerOrchestrateTool(server: McpServer): void { /* orchestrate_audit */ }

export function createServer(): McpServer {
  const server = new McpServer({ name: "pseolint", version });
  registerReadOnlyTools(server);
  registerOrchestrateTool(server);
  return server;
}
```

- `startMcpServer()` (stdio) is unchanged — still registers **all four** via `createServer()`.
- The remote route calls **only** `registerReadOnlyTools(server)` for v1.
- All existing helpers (`zodShape`, `truncateText`, `friendlyError`, schemas, `buildExplanation`, etc.) stay private to the module; only the two registration functions and the existing `createServer` become part of the public surface.

### Consumption from `apps/web` — no npm republish

`apps/web` adds `"@pseolint/mcp": "workspace:*"` to its dependencies. The workspace dependency resolves locally and Vercel bundles the compiled package — **the npm-published `@pseolint/mcp` does not need a new release for v1.** Republishing the stdio package with the exported factory is an additive minor (`0.7.0`), deliberately **deferred** to respect the version-parity rule (no package jumps ahead of core `0.6.4`); the remote server does not depend on it being published.

> Constraint check: `@modelcontextprotocol/sdk` and `zod` are already shared versions across the monorepo (`^1.29.0`, `^4.x`). `apps/web` already depends on `zod ^4.3.6`, so no version conflict is introduced.

---

## 4. Auth scaffolding (API key now, OAuth-ready)

### Mechanism

`better-auth` currently loads only the `magicLink` plugin (`apps/web/src/lib/auth.ts`). Add the official **`apiKey` plugin**:

```ts
import { apiKey } from "better-auth/plugins";
// plugins: [ magicLink({...}), apiKey() ]
```

This requires three coordinated changes (the drizzle adapter in `auth.ts` maps each table explicitly, so the new table must be wired in all three places):

1. a new drizzle schema definition + migration for the `apikey` table,
2. registering it in the `drizzleAdapter({ schema: { …, apikey: schema.apikeys } })` mapping in `auth.ts`,
3. adding the `apiKey()` plugin to the `plugins` array.

It then gives us server-side verification of a presented key → `{ userId }`.

### Route guard

A helper `resolveMcpIdentity(req): Promise<McpIdentity>`:

- Reads `Authorization: Bearer <key>`.
- **Present:** verify via the better-auth apiKey API. Valid → `{ kind: "key", userId, plan }` (plan via existing `getPlan`). Invalid/expired → respond `401` (JSON-RPC error `-32001`-style payload + HTTP 401).
- **Absent:** `{ kind: "anon", ip: clientIp(req) }`.

In v1 **both identities may call the three read-only tools.** The guard's job is to (a) reject malformed keys early and (b) select the rate-limit bucket. The seam for phase 2: remote `orchestrate` registration will assert `identity.kind === "key"` and meter via Polar before running — no change to read-only behaviour.

### Dashboard affordance (minimal)

A "Create / revoke MCP key" control in the existing dashboard settings area:

- Calls the better-auth apiKey create/list/revoke endpoints.
- Shows the key **once** on creation (copy-to-clipboard), with paste-ready client config snippet (`{"url": "https://pseolint.dev/mcp", "headers": {"Authorization": "Bearer <key>"}}`).
- Lists existing keys (prefix + created date) with a revoke action.

Scope guard: no team keys, no scoped permissions, no key expiry UI in v1 — a single personal key per user is sufficient to validate the authenticated channel.

---

## 5. Abuse control & SSRF

### Rate limiting — Upstash

Use `@upstash/ratelimit` + `@upstash/redis`. The provisioned Vercel/Upstash env vars (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, …) are read automatically by `@upstash/redis`'s env detection.

- **Anonymous:** sliding window keyed by `mcp:anon:${hashIp(ip)}` — tight (e.g. 20 tool calls / 10 min, final numbers tuned in implementation).
- **Authenticated:** sliding window keyed by `mcp:key:${userId}` — looser (e.g. 200 / 10 min).
- Over limit → HTTP `429` with `Retry-After`, body a JSON-RPC error so MCP clients surface it cleanly.
- The existing postgres limiter (`rateLimits` table, `reserveAnonAuditSlot`, `bumpRateLimit`) is **left as-is** for the web audit-submission path; the MCP endpoint uses Upstash exclusively. Rationale: MCP traffic is higher-frequency and Redis sliding windows are the right tool; mixing the two stores is acceptable because they govern disjoint surfaces.

A thin `apps/web/src/lib/mcp-rate-limit.ts` wraps the two limiter instances and the bucket-selection logic, so the route handler stays declarative.

### SSRF

No new SSRF surface logic is needed: **every tool already runs `safeMode: "saas"`** in `@pseolint/core`, which enables DNS-validated private-range blocking (`guardSsrf`), capped `maxFetchBytes`, and robots.txt honoring. The remote endpoint widens the *volume* of attacker-controlled targets, mitigated by:

- the unchanged in-tool SSRF guard (the actual defense),
- rate limits bounding request volume,
- `apps/web` already depending on `ssrf-req-filter` for the existing audit path (defense-in-depth precedent; the MCP path relies on core's `guardSsrf`).

### Response hardening

Standard security headers on the route response (`Content-Type: application/json`, `X-Content-Type-Options: nosniff`, no caching of tool results). CORS: permit cross-origin POST so browser-based MCP clients can reach the endpoint (`Access-Control-Allow-Origin` per MCP client needs; tuned in implementation — default permissive for an unauthenticated read-only public endpoint, revisited if/when keys carry sensitive scope).

---

## 6. Registry listing

Add a remote entry to `packages/mcp/server.json`:

```json
"remotes": [
  { "type": "streamable-http", "url": "https://pseolint.dev/mcp" }
]
```

**Caveat:** the MCP Registry validates *remote* URLs against domain ownership, which is a separate proof from the `io.github.ouranos-labs` GitHub namespace already used for the npm package. Re-publishing the registry entry with the remote is therefore a **follow-step, not a v1 blocker** — the endpoint is fully usable (paste-the-URL) whether or not it is listed in the registry. Track the domain-verification requirement as a separate task.

---

## 7. Testing

Reuse the existing MCP test harness (fixtures, mocks of `@pseolint/core`) where possible.

| Area | Test |
| --- | --- |
| Factory | `registerReadOnlyTools` registers exactly the 3 tools; `createServer` still registers 4 |
| Route happy path | For each read-only tool: drive `POST /mcp` with a real MCP `Client` over an in-process transport (or crafted JSON-RPC bodies) → `initialize`, `tools/list`, `tools/call` succeed; `structuredContent` validates |
| Auth | anonymous request to a read-only tool succeeds; malformed/invalid Bearer → 401; valid key → identity resolved, call succeeds |
| Rate limit | bucket exhaustion → 429 with `Retry-After` (Upstash limiter mocked/faked in test) |
| Stateless | two sequential POSTs do not leak state (fresh server per request) |
| Method guard | `GET`/`DELETE` → 405 |

Integration smoke (manual / CI optional): MCP Inspector against a local `next dev` instance.

---

## 8. Components touched / created

**Created**
- `apps/web/src/app/mcp/route.ts` — the endpoint (POST handler, method guards).
- `apps/web/src/lib/mcp-rate-limit.ts` — Upstash limiter wrappers + bucket selection.
- `apps/web/src/lib/mcp-auth.ts` — `resolveMcpIdentity(req)`.
- Dashboard MCP-key UI (component + minimal server actions / route).
- `apps/web/src/db/migrations/<n>_apikey.sql` — better-auth apiKey table migration.
- Route + unit tests under `apps/web/tests` (or co-located per app convention).

**Modified**
- `packages/mcp/src/server.ts` — extract `registerReadOnlyTools` / `registerOrchestrateTool` (additive; `createServer`/`startMcpServer` behaviour unchanged).
- `packages/mcp/src/index.ts` — export the new functions.
- `apps/web/package.json` — add `@pseolint/mcp` (workspace), `@upstash/ratelimit`, `@upstash/redis`.
- `apps/web/src/lib/auth.ts` — add `apiKey()` plugin.
- `packages/mcp/server.json` — add `remotes` entry (registry publish deferred).
- Docs: `packages/mcp/README.md` + a short "Remote MCP" page/section on the site documenting the URL and key flow.

**Deliberately unchanged**
- Published `@pseolint/mcp` on npm (no release required for v1).
- stdio server behaviour and its four-tool surface.
- Existing postgres rate-limiter and audit-submission paths.
- Core SSRF guard (already correct for this use).

---

## 9. Phase 2 seams (not built now)

- **Remote `orchestrate`:** the async machinery already exists — `/api/orchestrate` inserts an `orchestrator_session` row and dispatches an Inngest event; `/api/orchestrate/[id]` polls. Remote orchestrate becomes: an authed MCP tool that kicks off the same job and returns a session id, plus a second `orchestrate_status` MCP tool that polls — gated to `identity.kind === "key"` and metered via the existing tier budget logic (`TIER_MAX_BUDGET`, `DAILY_SESSION_LIMIT`).
- **OAuth 2.1:** layer authorization-server metadata + PKCE on top of the key path without removing it; the `resolveMcpIdentity` seam already normalizes identity so downstream code is auth-mechanism-agnostic.

---

## 10. Open questions resolved

| Question | Resolution |
| --- | --- |
| Purpose | Tiered: anonymous read-only (acquisition) + authed paid tool (deferred) |
| Auth mechanism | API key (better-auth apiKey plugin) now; OAuth-ready seam |
| v1 scope | 3 read-only tools + auth scaffolding; orchestrate deferred |
| Public URL | `/mcp` |
| Rate-limit store | Upstash Redis (newly provisioned) |
