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

- **Public URL & routing:** advertised as `https://pseolint.dev/mcp`. `mcp-handler` derives its endpoints from a dynamic `[transport]` segment, so the route lives at **`apps/web/src/app/api/[transport]/route.ts`** with `basePath: "/api"` → canonical endpoint `/api/mcp`. A `next.config.ts` rewrite maps the friendly `/mcp` → `/api/mcp`. We deliberately avoid a **root-level** `app/[transport]/route.ts`: at the app root a dynamic `[transport]` segment would capture every unknown single-segment path (e.g. `/typo`) and hand it to the MCP handler instead of Next's styled 404 — bad on a marketing site with many top-level routes and short-link namespaces (`/a`, `/m`, `/o`, `/r`). Mounting under `/api` confines the dynamic segment to the API namespace. `/api/mcp` is the guaranteed-working endpoint; `/mcp` is the advertised alias via rewrite (smoke-tested; if the rewrite misbehaves, fall back to advertising `/api/mcp`).
- **Runtime:** `export const runtime = "nodejs"` — `@pseolint/core` performs filesystem + network I/O and the MCP SDK is Node-oriented; edge is not viable.
- **Stateless config:** `createMcpHandler(register, { serverInfo }, { basePath: "/api", maxDuration: 60, disableSse: true, verboseLogs: false })`. `disableSse: true` reflects that SSE is dropped from the current MCP spec; with no session id generator the handler is stateless. `mcp-handler` defaults `redisUrl` to `process.env.REDIS_URL || process.env.KV_URL` (now present) — harmless with SSE disabled; not required for stateless streamable-HTTP request/response.
- **Duration:** `export const maxDuration = 60` (read-only audits are sample-capped at `MCP_SAMPLE_CAP = 50` pages and finish well within this; the long-running `orchestrate` is intentionally not on this path).
- **Transport adapter — `mcp-handler`:** the SDK's `StreamableHTTPServerTransport` is coupled to Node `req`/`res` and does not fit Next.js App Router's Web `Request`/`Response`. We use **`mcp-handler@^1.1.0`** (the Vercel-maintained Next.js MCP adapter) to bridge that gap. Its `createMcpHandler(register, options, config)` calls our `register` callback with a fresh SDK `McpServer` per request — so `registerReadOnlyTools(server)` (section 3) is reused verbatim. In **stateless** mode (no Redis configured) it handles one JSON-RPC request → one JSON response, which is exactly our need; SSE/notifications are simply disabled.
  - **Peer-dep note:** `mcp-handler@1.1.0` declares `@modelcontextprotocol/sdk` peer at exactly `1.26.0`; the repo uses `^1.29.0`. `mcp-handler` imports the SDK as a peer, so the installed `1.29.x` is what actually runs — the pin is an over-strict declaration that produces an install warning we accept (bun does not hard-fail peer mismatches). The plan adds `@modelcontextprotocol/sdk@^1.29.0` explicitly to `apps/web` so a single, known SDK copy is resolved.
  - **Transitive `redis` dep:** `mcp-handler` pulls in node-`redis` for its optional SSE/session store. We never configure it (stateless), so it is dead weight at runtime but harmless. Our rate limiting uses Upstash independently (section 5).
- **Auth/rate-limit interception:** the exported `POST` is a thin wrapper — it runs `resolveMcpIdentity` + the Upstash rate-limit check first, then delegates to the `mcp-handler` handler. This keeps cross-cutting concerns outside the adapter and fully under our control.

### Request lifecycle

```
POST /mcp  (our wrapper)
  │
  ├─ auth resolve      (Bearer present? verifyMcpKey → identity; invalid → 401)
  ├─ rate-limit check  (Upstash; per-key if authed, else per-IP)
  │     └─ over limit → 429 (JSON-RPC-shaped error + Retry-After)
  └─ delegate → mcp-handler (createMcpHandler(registerReadOnlyTools), stateless)
        └─ fresh McpServer per request → handle JSON-RPC → JSON response
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

### Mechanism — self-managed hashed key table

> **Library reality check:** the installed `better-auth@1.6.14` does **not** ship an `apiKey` plugin (its plugin set is `magic-link`, `bearer`, `mcp`, `jwt`, `organization`, … — no `api-key`). It *does* ship an official **`mcp` plugin** (`withMcpAuth`, `oAuthDiscoveryMetadata`, OIDC provider metadata) — but that is the heavier OAuth 2.1 flow we deliberately deferred. So v1 implements keys directly with a small hashed-token table; the better-auth `mcp` plugin is reserved for the OAuth-later phase (§9).

A single new drizzle table `mcp_api_key`:

| column | type | notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `userId` | text → `user.id` (cascade delete) | owner |
| `name` | text | user-supplied label |
| `prefix` | text | first 8 chars of the token, shown in the dashboard for identification |
| `keyHash` | text unique | `sha256(token)` hex — the token itself is never stored |
| `lastUsedAt` | timestamp null | best-effort, updated on use |
| `createdAt` | timestamp | |
| `revokedAt` | timestamp null | soft-delete; a revoked key fails verification |

Token format: `pseo_` + 32 url-safe random bytes (`crypto.randomBytes(32)` → base64url). 256 bits of entropy makes `sha256` storage safe without a slow KDF (brute-force is infeasible; no slow hash needed for high-entropy random secrets — unlike user passwords).

Three small server-only helpers in `apps/web/src/lib/mcp-keys.ts`:

```ts
createMcpKey(userId: string, name: string): Promise<{ token: string; prefix: string }>  // returns plaintext token ONCE
verifyMcpKey(token: string): Promise<{ userId: string } | null>                          // sha256 lookup, ignores revoked
listMcpKeys(userId: string): Promise<Array<{ id: string; name: string; prefix: string; createdAt: Date; lastUsedAt: Date | null }>>
revokeMcpKey(userId: string, id: string): Promise<void>                                  // sets revokedAt; scoped to owner
```

This deliberately does **not** touch `auth.ts` / the better-auth schema mapping — keys live in their own table, independent of the better-auth session machinery.

### Route guard

A helper `resolveMcpIdentity(req): Promise<McpIdentity>` in `apps/web/src/lib/mcp-auth.ts`:

```ts
type McpIdentity =
  | { kind: "key"; userId: string }
  | { kind: "anon"; ip: string };
```

- Reads `Authorization: Bearer <token>`.
- **Present:** `verifyMcpKey(token)`. Valid → `{ kind: "key", userId }`. Invalid/revoked → the route responds `401` (HTTP 401 + a JSON-RPC error body so MCP clients surface it cleanly).
- **Absent:** `{ kind: "anon", ip: clientIp(req) }`.

In v1 **both identities may call the three read-only tools.** The guard's job is to (a) reject malformed/invalid keys early and (b) select the rate-limit bucket. Seam for phase 2: remote `orchestrate` registration will assert `identity.kind === "key"`, resolve the plan via existing `getPlan(userId)`, and meter via Polar before running — no change to read-only behaviour.

### Dashboard affordance (minimal)

A "MCP keys" card in the existing dashboard settings area, backed by a small route (`apps/web/src/app/api/mcp-keys/route.ts`, session-guarded via `requireSession`):

- `POST` → `createMcpKey`, returns the plaintext token **once** (copy-to-clipboard) with a paste-ready client config snippet (`{"url": "https://pseolint.dev/mcp", "headers": {"Authorization": "Bearer <token>"}}`).
- `GET` → `listMcpKeys` (prefix + name + created date; never the full token).
- `DELETE` → `revokeMcpKey`.

Scope guard: no team keys, no scoped permissions, no expiry UI in v1 — personal keys are sufficient to validate the authenticated channel.

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
- `apps/web/src/app/api/[transport]/route.ts` — the endpoint (POST wrapper: auth + rate-limit → `mcp-handler`; GET/DELETE 405).
- `apps/web/next.config.ts` — add a `/mcp → /api/mcp` rewrite (modify).
- `apps/web/src/lib/mcp-rate-limit.ts` — Upstash limiter wrappers + bucket selection.
- `apps/web/src/lib/mcp-auth.ts` — `resolveMcpIdentity(req)` + `McpIdentity` type.
- `apps/web/src/lib/mcp-keys.ts` — `createMcpKey` / `verifyMcpKey` / `listMcpKeys` / `revokeMcpKey`.
- `apps/web/src/app/api/mcp-keys/route.ts` — session-guarded key CRUD for the dashboard.
- Dashboard MCP-keys UI component.
- `apps/web/src/db/migrations/<n>_mcp_api_key.sql` — the `mcp_api_key` table migration (generated by `drizzle-kit`).
- Unit tests under `apps/web/src/lib/*.test.ts` (mirrors existing co-located convention) and route/factory tests.

**Modified**
- `packages/mcp/src/server.ts` — extract `registerReadOnlyTools` / `registerOrchestrateTool` (additive; `createServer`/`startMcpServer` behaviour unchanged).
- `packages/mcp/src/index.ts` — export the new functions.
- `apps/web/src/db/schema.ts` — add the `mcpApiKeys` table definition.
- `apps/web/package.json` — add `@pseolint/mcp` (workspace), `mcp-handler`, `@modelcontextprotocol/sdk@^1.29.0`, `@upstash/ratelimit`, `@upstash/redis`.
- `packages/mcp/server.json` — add `remotes` entry (registry publish deferred).
- Docs: `packages/mcp/README.md` + a short "Remote MCP" page/section on the site documenting the URL and key flow.

> `apps/web/src/lib/auth.ts` is **not** modified — keys are self-managed and independent of better-auth.

**Deliberately unchanged**
- Published `@pseolint/mcp` on npm (no release required for v1).
- stdio server behaviour and its four-tool surface.
- Existing postgres rate-limiter and audit-submission paths.
- Core SSRF guard (already correct for this use).

---

## 9. Phase 2 seams (not built now)

- **Remote `orchestrate`:** the async machinery already exists — `/api/orchestrate` inserts an `orchestrator_session` row and dispatches an Inngest event; `/api/orchestrate/[id]` polls. Remote orchestrate becomes: an authed MCP tool that kicks off the same job and returns a session id, plus a second `orchestrate_status` MCP tool that polls — gated to `identity.kind === "key"` and metered via the existing tier budget logic (`TIER_MAX_BUDGET`, `DAILY_SESSION_LIMIT`).
- **OAuth 2.1:** better-auth already ships the **`mcp` plugin** (`withMcpAuth`, `oAuthDiscoveryMetadata`, OIDC provider metadata) in the installed version — the OAuth path is largely a matter of enabling it and adding a `kind: "oauth"` arm to `McpIdentity`. The `resolveMcpIdentity` seam normalizes identity so downstream code stays auth-mechanism-agnostic; the key path and OAuth path coexist.

---

## 10. Open questions resolved

| Question | Resolution |
| --- | --- |
| Purpose | Tiered: anonymous read-only (acquisition) + authed paid tool (deferred) |
| Auth mechanism | Self-managed hashed API-key table now (better-auth 1.6.14 has no apiKey plugin); better-auth `mcp` plugin reserved for OAuth-later |
| v1 scope | 3 read-only tools + auth scaffolding; orchestrate deferred |
| Public URL | `/mcp` |
| Rate-limit store | Upstash Redis (newly provisioned) |
