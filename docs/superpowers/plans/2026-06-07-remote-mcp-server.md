# Remote MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a remote, zero-install Streamable HTTP MCP endpoint (`https://pseolint.dev/mcp`) serving pseolint's three read-only audit tools anonymously, with self-managed API-key auth scaffolding and Upstash rate limiting, hosted inside `apps/web`.

**Architecture:** A Next.js App Router route at `app/api/[transport]/route.ts` wraps the Vercel `mcp-handler` adapter (stateless, SSE disabled). The wrapper resolves identity (anonymous or hashed-API-key) and applies an Upstash sliding-window rate limit before delegating to the adapter, which builds a fresh SDK `McpServer` per request via a tool factory reused verbatim from `@pseolint/mcp`. API keys live in a self-managed `mcp_api_key` table (no better-auth `apiKey` plugin, it doesn't exist in better-auth 1.6.14).

**Tech Stack:** TypeScript, Next.js (App Router), `@modelcontextprotocol/sdk@^1.29`, `mcp-handler@^1.1`, `@pseolint/core`, `@pseolint/mcp` (workspace), drizzle-orm/postgres, `@upstash/ratelimit` + `@upstash/redis`, vitest, bun + turbo.

**Spec:** `docs/superpowers/specs/2026-06-07-pseolint-remote-mcp-server-design.md`

---

## File Structure

| File | Responsibility |
| --- | --- |
| `packages/mcp/src/server.ts` (modify) | Extract `registerReadOnlyTools` / `registerOrchestrateTool` from `createServer` |
| `packages/mcp/src/index.ts` (modify) | Re-export the two new functions |
| `packages/mcp/tests/factory.test.ts` (create) | Assert the factory registers the right tool sets |
| `apps/web/package.json` (modify) | Add deps |
| `apps/web/next.config.ts` (modify) | `/mcp → /api/mcp` rewrite + serverExternalPackages |
| `apps/web/src/db/schema.ts` (modify) | `mcpApiKeys` table |
| `apps/web/src/db/migrations/*` (create) | Generated migration for the table |
| `apps/web/src/lib/mcp-keys.ts` (create) | Token gen/hash + key CRUD against the table |
| `apps/web/src/lib/mcp-keys.test.ts` (create) | Unit tests for the pure crypto/format helpers |
| `apps/web/src/lib/mcp-auth.ts` (create) | `resolveMcpIdentity(req)` + `McpIdentity` type |
| `apps/web/src/lib/mcp-auth.test.ts` (create) | Identity resolution branches |
| `apps/web/src/lib/mcp-rate-limit.ts` (create) | Upstash limiters + `checkMcpRateLimit(identity)` |
| `apps/web/src/lib/mcp-rate-limit.test.ts` (create) | Bucket selection + over-limit |
| `apps/web/src/app/api/[transport]/route.ts` (create) | The MCP endpoint wrapper |
| `apps/web/src/app/api/[transport]/route.test.ts` (create) | Protocol wiring, 401, 405, 429 |
| `apps/web/src/app/api/mcp-keys/route.ts` (create) | Session-guarded key CRUD for the dashboard |
| `apps/web/src/app/api/mcp-keys/route.test.ts` (create) | CRUD + unauthenticated 401 |
| `apps/web/src/components/dashboard/mcp-keys-card.tsx` (create) | Dashboard UI to mint/list/revoke keys (no unit test: repo has no React test harness) |
| `packages/mcp/server.json` (modify) | Add `remotes` entry |
| `packages/mcp/README.md` (modify) | Document the remote endpoint |

---

## Task 1: Extract reusable tool factory in `@pseolint/mcp`

**Files:**
- Modify: `packages/mcp/src/server.ts`
- Modify: `packages/mcp/src/index.ts`
- Test: `packages/mcp/tests/factory.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/mcp/tests/factory.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

// Keep the real SCORED_CATEGORY_KEYS but stub the heavy engine entrypoints so
// this test stays a pure registration check (mirrors server.test.ts).
vi.mock("@pseolint/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pseolint/core")>();
  return {
    ...actual,
    auditSource: vi.fn(),
    orchestrate: vi.fn(),
    formatJson: vi.fn(() => "{}"),
    formatConsole: vi.fn(() => ""),
  };
});

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReadOnlyTools, registerOrchestrateTool, createServer } from "../src/server.js";
import { connect } from "./helpers.js";

async function toolNames(server: McpServer): Promise<string[]> {
  const client = await connect(server);
  const { tools } = await client.listTools();
  return tools.map((t) => t.name).sort();
}

describe("tool factory", () => {
  it("registerReadOnlyTools registers exactly the 3 read-only tools", async () => {
    const server = new McpServer({ name: "t", version: "0.0.0" });
    registerReadOnlyTools(server);
    expect(await toolNames(server)).toEqual([
      "pseolint_audit_site",
      "pseolint_check_page_technical",
      "pseolint_explain_score",
    ]);
  });

  it("registerOrchestrateTool registers only the orchestrate tool", async () => {
    const server = new McpServer({ name: "t", version: "0.0.0" });
    registerOrchestrateTool(server);
    expect(await toolNames(server)).toEqual(["pseolint_orchestrate_audit"]);
  });

  it("createServer still registers all 4 tools", async () => {
    expect(await toolNames(createServer())).toEqual([
      "pseolint_audit_site",
      "pseolint_check_page_technical",
      "pseolint_explain_score",
      "pseolint_orchestrate_audit",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/mcp && bun run test factory`
Expected: FAIL, `registerReadOnlyTools` / `registerOrchestrateTool` are not exported.

- [ ] **Step 3: Refactor `server.ts` to extract the factory functions**

In `packages/mcp/src/server.ts`, change the `createServer` function (currently starting at `export function createServer(): McpServer {`). Replace the single function with three exported functions. **Move the existing `server.registerTool(...)` blocks verbatim**, do not rewrite their bodies:

```ts
/** Register the three read-only audit tools (safe for anonymous/remote use). */
export function registerReadOnlyTools(server: McpServer): void {
  // MOVE HERE, unchanged: the three existing server.registerTool(...) calls for
  //   "pseolint_audit_site", "pseolint_explain_score", "pseolint_check_page_technical"
}

/** Register the AI-orchestrated audit tool (costs money; gate behind auth when remote). */
export function registerOrchestrateTool(server: McpServer): void {
  // MOVE HERE, unchanged: the existing server.registerTool(...) call for
  //   "pseolint_orchestrate_audit"
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "pseolint", version });
  registerReadOnlyTools(server);
  registerOrchestrateTool(server);
  return server;
}
```

The four `server.registerTool(...)` blocks (lines ~335–670 in the current file) move into the two functions; everything else in the module (helpers, schemas, constants, `startMcpServer`) stays exactly as-is. `startMcpServer` continues to call `createServer()`.

- [ ] **Step 4: Export the new functions from the package entrypoint**

Edit `packages/mcp/src/index.ts`:

```ts
export { startMcpServer, createServer, registerReadOnlyTools, registerOrchestrateTool } from "./server.js";
```

- [ ] **Step 5: Run the new test + the full mcp suite + lint + build**

Run: `cd packages/mcp && bun run test && bun run lint && bun run build`
Expected: PASS, new factory test green, all existing tests (`server.test.ts`, `integration.test.ts`, caps tests) still green, `tsc --noEmit` clean, and `dist/` rebuilt with the new exports. The build matters: `apps/web` imports `@pseolint/mcp` via its `exports` → `dist/index.js`, so downstream web tests (Task 7) need a fresh `dist`.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/src/server.ts packages/mcp/src/index.ts packages/mcp/tests/factory.test.ts
git commit -m "refactor(mcp): extract registerReadOnlyTools/registerOrchestrateTool factory"
```

---

## Task 2: Add `apps/web` dependencies + Next config

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/next.config.ts`

- [ ] **Step 1: Add dependencies**

In `apps/web/package.json`, add to `"dependencies"` (keep alphabetical-ish ordering as the file already is):

```jsonc
"@modelcontextprotocol/sdk": "^1.29.0",
"@pseolint/mcp": "workspace:*",
"@upstash/ratelimit": "^2.0.5",
"@upstash/redis": "^1.34.3",
"mcp-handler": "^1.1.0",
```

- [ ] **Step 2: Install**

Run (from repo root): `bun install`
Expected: resolves and writes `bun.lock`. A peer-dependency warning for `mcp-handler` wanting `@modelcontextprotocol/sdk@1.26.0` against our `^1.29.0` is **expected and accepted** (mcp-handler imports the SDK as a peer; our 1.29 is used).

- [ ] **Step 3: Add the rewrite + mark server-external packages**

Edit `apps/web/next.config.ts` to:

```ts
import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["pseolint", "@pseolint/core", "@pseolint/mcp", "mcp-handler"],
  experimental: { serverActions: { bodySizeLimit: "1mb" } },
  async rewrites() {
    return [{ source: "/mcp", destination: "/api/mcp" }];
  },
};

export default config;
```

- [ ] **Step 4: Verify the app still typechecks**

Run: `cd apps/web && bun run typecheck`
Expected: PASS (no usages yet; this just confirms deps resolve and config is valid TS).

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/next.config.ts bun.lock
git commit -m "chore(web): add mcp-handler, upstash, @pseolint/mcp deps + /mcp rewrite"
```

---

## Task 3: Add the `mcp_api_key` table

**Files:**
- Modify: `apps/web/src/db/schema.ts`
- Create: `apps/web/src/db/migrations/<generated>_*.sql` (via drizzle-kit)

- [ ] **Step 1: Add the table definition**

Append to `apps/web/src/db/schema.ts` (the file already imports `pgTable, text, timestamp, uuid, index` from `drizzle-orm/pg-core`; `users` is defined as `pgTable("user", { id: text("id").primaryKey(), ... })`):

```ts
export const mcpApiKeys = pgTable(
  "mcp_api_key",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("mcp_api_key_user_idx").on(t.userId)],
);
```

> If `uuid` is not already imported in `schema.ts`, it is (line 1 imports `uuid`). `defaultRandom()` maps to `gen_random_uuid()`.

- [ ] **Step 2: Generate the migration**

Run: `cd apps/web && bun run db:generate`
Expected: drizzle-kit writes a new SQL file under `src/db/migrations/` creating `mcp_api_key` with the unique index on `key_hash` and the `user_id` index. Inspect it to confirm it only adds the new table (no destructive changes to existing tables).

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/db/schema.ts apps/web/src/db/migrations
git commit -m "feat(web): add mcp_api_key table"
```

> Applying the migration to the live DB (`bun run db:migrate`) is an operational step performed at deploy time, not part of this code task.

---

## Task 4: API-key helpers (`mcp-keys.ts`)

**Files:**
- Create: `apps/web/src/lib/mcp-keys.ts`
- Test: `apps/web/src/lib/mcp-keys.test.ts`

- [ ] **Step 1: Write the failing test (pure helpers only)**

Create `apps/web/src/lib/mcp-keys.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateMcpToken, hashMcpToken, mcpTokenPrefix, TOKEN_RE } from "./mcp-keys";

describe("mcp token helpers", () => {
  it("generates a prefixed, high-entropy, url-safe token", () => {
    const a = generateMcpToken();
    const b = generateMcpToken();
    expect(a).toMatch(TOKEN_RE);
    expect(a.startsWith("pseo_")).toBe(true);
    expect(a).not.toEqual(b); // random
    expect(a.length).toBeGreaterThan(40);
  });

  it("hashes deterministically and differs per token", () => {
    const t = generateMcpToken();
    expect(hashMcpToken(t)).toEqual(hashMcpToken(t));
    expect(hashMcpToken(t)).not.toEqual(hashMcpToken(generateMcpToken()));
    expect(hashMcpToken(t)).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });

  it("prefix is the first 8 chars of the token body for display", () => {
    const t = "pseo_abcdefghIJKLMNOP";
    expect(mcpTokenPrefix(t)).toBe("abcdefgh");
  });

  it("TOKEN_RE rejects malformed tokens", () => {
    expect(TOKEN_RE.test("nope")).toBe(false);
    expect(TOKEN_RE.test("pseo_")).toBe(false);
    expect(TOKEN_RE.test("pseo_with space")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && bun run test mcp-keys`
Expected: FAIL, `./mcp-keys` has no exports.

- [ ] **Step 3: Implement `mcp-keys.ts`**

Create `apps/web/src/lib/mcp-keys.ts`:

```ts
import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { mcpApiKeys } from "@/db/schema";

/** `pseo_` + base64url(32 random bytes). 256 bits of entropy. */
export const TOKEN_RE = /^pseo_[A-Za-z0-9_-]{43}$/;

export function generateMcpToken(): string {
  return "pseo_" + randomBytes(32).toString("base64url");
}

/** sha256 hex of the full token. High-entropy random ⇒ fast hash is safe (no KDF needed). */
export function hashMcpToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** First 8 chars of the token body (after the `pseo_` prefix), for dashboard display. */
export function mcpTokenPrefix(token: string): string {
  return token.slice(5, 13);
}

export interface McpKeySummary {
  id: string;
  name: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

/** Create a key for `userId`. Returns the plaintext token ONCE, it is never recoverable after. */
export async function createMcpKey(userId: string, name: string): Promise<{ token: string; prefix: string }> {
  const token = generateMcpToken();
  const prefix = mcpTokenPrefix(token);
  await db.insert(mcpApiKeys).values({
    userId,
    name: name.slice(0, 100) || "MCP key",
    prefix,
    keyHash: hashMcpToken(token),
  });
  return { token, prefix };
}

/** Verify a presented token. Returns the owning userId, or null if unknown/revoked/malformed. */
export async function verifyMcpKey(token: string): Promise<{ userId: string } | null> {
  if (!TOKEN_RE.test(token)) return null;
  const [row] = await db
    .select({ id: mcpApiKeys.id, userId: mcpApiKeys.userId })
    .from(mcpApiKeys)
    .where(and(eq(mcpApiKeys.keyHash, hashMcpToken(token)), isNull(mcpApiKeys.revokedAt)))
    .limit(1);
  if (!row) return null;
  // Best-effort last-used stamp; ignore failures so verification never blocks on it.
  void db.update(mcpApiKeys).set({ lastUsedAt: new Date() }).where(eq(mcpApiKeys.id, row.id)).catch(() => {});
  return { userId: row.userId };
}

export async function listMcpKeys(userId: string): Promise<McpKeySummary[]> {
  return db
    .select({
      id: mcpApiKeys.id,
      name: mcpApiKeys.name,
      prefix: mcpApiKeys.prefix,
      createdAt: mcpApiKeys.createdAt,
      lastUsedAt: mcpApiKeys.lastUsedAt,
    })
    .from(mcpApiKeys)
    .where(and(eq(mcpApiKeys.userId, userId), isNull(mcpApiKeys.revokedAt)));
}

/** Soft-revoke a key. Scoped to the owner so users cannot revoke each other's keys. */
export async function revokeMcpKey(userId: string, id: string): Promise<void> {
  await db
    .update(mcpApiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(mcpApiKeys.id, id), eq(mcpApiKeys.userId, userId)));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && bun run test mcp-keys`
Expected: PASS (pure-helper tests; db functions are exercised in route tests via mocking).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/mcp-keys.ts apps/web/src/lib/mcp-keys.test.ts
git commit -m "feat(web): self-managed MCP API key helpers (gen/hash/CRUD)"
```

---

## Task 5: Identity resolution (`mcp-auth.ts`)

**Files:**
- Create: `apps/web/src/lib/mcp-auth.ts`
- Test: `apps/web/src/lib/mcp-auth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/mcp-auth.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./mcp-keys", () => ({ verifyMcpKey: vi.fn() }));

import { verifyMcpKey } from "./mcp-keys";
import { resolveMcpIdentity } from "./mcp-auth";

const verify = vi.mocked(verifyMcpKey);

function req(headers: Record<string, string>): Request {
  return new Request("https://pseolint.dev/api/mcp", { method: "POST", headers });
}

describe("resolveMcpIdentity", () => {
  beforeEach(() => verify.mockReset());

  it("returns anon identity with client IP when no Authorization header", async () => {
    const id = await resolveMcpIdentity(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }));
    expect(id).toEqual({ kind: "anon", ip: "203.0.113.7" });
    expect(verify).not.toHaveBeenCalled();
  });

  it("returns key identity for a valid Bearer token", async () => {
    verify.mockResolvedValue({ userId: "user_123" });
    const id = await resolveMcpIdentity(req({ authorization: "Bearer pseo_validtoken" }));
    expect(id).toEqual({ kind: "key", userId: "user_123" });
    expect(verify).toHaveBeenCalledWith("pseo_validtoken");
  });

  it("returns invalid for a Bearer token that fails verification", async () => {
    verify.mockResolvedValue(null);
    const id = await resolveMcpIdentity(req({ authorization: "Bearer pseo_bad" }));
    expect(id).toEqual({ kind: "invalid" });
  });

  it("treats a non-Bearer Authorization header as invalid", async () => {
    const id = await resolveMcpIdentity(req({ authorization: "Basic abc" }));
    expect(id).toEqual({ kind: "invalid" });
    expect(verify).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && bun run test mcp-auth`
Expected: FAIL, `./mcp-auth` has no exports.

- [ ] **Step 3: Implement `mcp-auth.ts`**

Create `apps/web/src/lib/mcp-auth.ts`:

```ts
import "server-only";
import { clientIp } from "@/lib/ip";
import { verifyMcpKey } from "@/lib/mcp-keys";

export type McpIdentity =
  | { kind: "key"; userId: string }
  | { kind: "anon"; ip: string }
  | { kind: "invalid" };

/**
 * Resolve the caller's identity from the request.
 * - No Authorization header  → anonymous (rate-limited by IP).
 * - `Bearer <valid token>`   → authenticated key identity.
 * - Anything else / bad key  → invalid (route maps to HTTP 401).
 */
export async function resolveMcpIdentity(req: Request): Promise<McpIdentity> {
  const header = req.headers.get("authorization");
  if (!header) return { kind: "anon", ip: clientIp(req) };

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return { kind: "invalid" };

  const result = await verifyMcpKey(match[1].trim());
  return result ? { kind: "key", userId: result.userId } : { kind: "invalid" };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && bun run test mcp-auth`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/mcp-auth.ts apps/web/src/lib/mcp-auth.test.ts
git commit -m "feat(web): resolveMcpIdentity (anon / key / invalid)"
```

---

## Task 6: Rate limiting (`mcp-rate-limit.ts`)

**Files:**
- Create: `apps/web/src/lib/mcp-rate-limit.ts`
- Test: `apps/web/src/lib/mcp-rate-limit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/mcp-rate-limit.test.ts`. We inject a fake limiter pair so no network/Redis is touched:

```ts
import { describe, it, expect, vi } from "vitest";
import { checkMcpRateLimit } from "./mcp-rate-limit";
import type { McpIdentity } from "./mcp-auth";

function fakeLimiter(allow: boolean) {
  return {
    limit: vi.fn(async (key: string) => ({
      success: allow,
      limit: 20,
      remaining: allow ? 19 : 0,
      reset: 1_000,
      pending: Promise.resolve(),
      _key: key,
    })),
  };
}

describe("checkMcpRateLimit", () => {
  it("uses the anon limiter keyed by hashed IP", async () => {
    const anon = fakeLimiter(true);
    const keyed = fakeLimiter(true);
    const id: McpIdentity = { kind: "anon", ip: "203.0.113.7" };
    const r = await checkMcpRateLimit(id, { anon: anon as never, keyed: keyed as never });
    expect(r.success).toBe(true);
    expect(anon.limit).toHaveBeenCalledTimes(1);
    expect(anon.limit.mock.calls[0][0]).toMatch(/^mcp:anon:[0-9a-f]{24}$/);
    expect(keyed.limit).not.toHaveBeenCalled();
  });

  it("uses the keyed limiter keyed by userId for authenticated calls", async () => {
    const anon = fakeLimiter(true);
    const keyed = fakeLimiter(true);
    const id: McpIdentity = { kind: "key", userId: "user_123" };
    await checkMcpRateLimit(id, { anon: anon as never, keyed: keyed as never });
    expect(keyed.limit).toHaveBeenCalledWith("mcp:key:user_123");
    expect(anon.limit).not.toHaveBeenCalled();
  });

  it("returns success:false with a Retry-After when over the limit", async () => {
    const anon = fakeLimiter(false);
    const id: McpIdentity = { kind: "anon", ip: "203.0.113.7" };
    const r = await checkMcpRateLimit(id, { anon: anon as never, keyed: fakeLimiter(true) as never });
    expect(r.success).toBe(false);
    expect(r.retryAfterSeconds).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && bun run test mcp-rate-limit`
Expected: FAIL, `./mcp-rate-limit` has no exports.

- [ ] **Step 3: Implement `mcp-rate-limit.ts`**

Create `apps/web/src/lib/mcp-rate-limit.ts`:

```ts
import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { hashIp } from "@/lib/ip";
import type { McpIdentity } from "@/lib/mcp-auth";

/** Minimal shape we depend on, lets tests inject fakes without a live Redis. */
export interface LimiterLike {
  limit(key: string): Promise<{ success: boolean; reset: number }>;
}

export interface Limiters {
  anon: LimiterLike;
  keyed: LimiterLike;
}

// Lazily built so importing this module never requires Upstash env at load time
// (keeps unit tests and `next build` happy). `Redis.fromEnv()` reads
// KV_REST_API_URL / KV_REST_API_TOKEN (provisioned via the Vercel/Upstash integration).
let cached: Limiters | undefined;
function defaultLimiters(): Limiters {
  if (cached) return cached;
  const redis = Redis.fromEnv();
  cached = {
    anon: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, "10 m"), prefix: "mcp" }),
    keyed: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(200, "10 m"), prefix: "mcp" }),
  };
  return cached;
}

export interface RateResult {
  success: boolean;
  retryAfterSeconds: number;
}

/**
 * Apply the rate limit for an identity. Anonymous → per-hashed-IP bucket;
 * authenticated → per-userId bucket. `invalid` identities never reach here
 * (the route rejects them with 401 first).
 */
export async function checkMcpRateLimit(
  identity: McpIdentity,
  limiters: Limiters = defaultLimiters(),
): Promise<RateResult> {
  let res: { success: boolean; reset: number };
  if (identity.kind === "key") {
    res = await limiters.keyed.limit(`mcp:key:${identity.userId}`);
  } else if (identity.kind === "anon") {
    res = await limiters.anon.limit(`mcp:anon:${hashIp(identity.ip)}`);
  } else {
    return { success: true, retryAfterSeconds: 0 }; // unreachable; defensive
  }
  const retryAfterSeconds = Math.max(0, Math.ceil((res.reset - Date.now()) / 1000));
  return { success: res.success, retryAfterSeconds };
}
```

> `Ratelimit`'s real `limit()` returns more fields than `LimiterLike` declares; the wider type is structurally assignable to the narrower one, so passing real limiters compiles. The `prefix: "mcp"` plus our explicit `mcp:anon:` / `mcp:key:` key naming keeps buckets namespaced.

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && bun run test mcp-rate-limit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/mcp-rate-limit.ts apps/web/src/lib/mcp-rate-limit.test.ts
git commit -m "feat(web): Upstash sliding-window rate limit for MCP endpoint"
```

---

## Task 7: The MCP endpoint route

**Files:**
- Create: `apps/web/src/app/api/[transport]/route.ts`
- Test: `apps/web/src/app/api/[transport]/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/api/[transport]/route.test.ts`. We mock auth + rate-limit (unit-level) and assert wrapper behavior; the `mcp-handler` delegate is exercised for `tools/list` (no core engine needed):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/mcp-auth", () => ({ resolveMcpIdentity: vi.fn() }));
vi.mock("@/lib/mcp-rate-limit", () => ({ checkMcpRateLimit: vi.fn() }));

import { resolveMcpIdentity } from "@/lib/mcp-auth";
import { checkMcpRateLimit } from "@/lib/mcp-rate-limit";
import { POST, GET, DELETE, OPTIONS } from "./route";

const auth = vi.mocked(resolveMcpIdentity);
const rl = vi.mocked(checkMcpRateLimit);

function mcpPost(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://pseolint.dev/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify(body),
  });
}

// A self-contained `initialize` request, valid stateless-mode entrypoint.
// (Tool-count is asserted in Task 1's factory test; here we only verify the
// wrapper correctly delegates a valid MCP request to mcp-handler.)
const initReq = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } },
};

describe("POST /api/mcp wrapper", () => {
  beforeEach(() => {
    auth.mockReset();
    rl.mockReset();
    auth.mockResolvedValue({ kind: "anon", ip: "203.0.113.7" });
    rl.mockResolvedValue({ success: true, retryAfterSeconds: 0 });
  });

  it("returns 401 for an invalid API key without calling the rate limiter", async () => {
    auth.mockResolvedValue({ kind: "invalid" });
    const res = await POST(mcpPost(initReq, { authorization: "Bearer pseo_bad" }));
    expect(res.status).toBe(401);
    expect(rl).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After when rate limited", async () => {
    rl.mockResolvedValue({ success: false, retryAfterSeconds: 42 });
    const res = await POST(mcpPost(initReq));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
  });

  it("delegates a valid initialize request to mcp-handler", async () => {
    const res = await POST(mcpPost(initReq));
    expect(res.status).toBe(200);
    const text = await res.text();
    // mcp-handler may answer as JSON or an SSE frame; serverInfo appears either way.
    expect(text).toContain("protocolVersion");
    expect(text).toContain("pseolint");
  });
});

describe("method guards & CORS", () => {
  it("GET → 405", async () => {
    expect((await GET()).status).toBe(405);
  });
  it("DELETE → 405", async () => {
    expect((await DELETE()).status).toBe(405);
  });
  it("OPTIONS → 204 with permissive CORS", async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
```

> The test imports must include `OPTIONS`: `import { POST, GET, DELETE, OPTIONS } from "./route";`.

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && bun run test transport`
Expected: FAIL, `./route` does not exist. (Filtering by the substring `transport` avoids the regex-special `[ ]` in the path; it uniquely matches `app/api/[transport]/route.test.ts`.)

> This test imports `@pseolint/mcp` (→ `dist/index.js`). Ensure Task 1 Step 5's `bun run build` ran so the package is built with `registerReadOnlyTools` exported.

- [ ] **Step 3: Implement the route**

Create `apps/web/src/app/api/[transport]/route.ts`:

```ts
import { createMcpHandler } from "mcp-handler";
import { registerReadOnlyTools } from "@pseolint/mcp";
import { resolveMcpIdentity } from "@/lib/mcp-auth";
import { checkMcpRateLimit } from "@/lib/mcp-rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const mcpHandler = createMcpHandler(
  (server) => {
    registerReadOnlyTools(server);
  },
  { serverInfo: { name: "pseolint", version: "remote" } },
  { basePath: "/api", maxDuration: 60, disableSse: true, verboseLogs: false },
);

/** JSON-RPC-shaped error body so MCP clients surface auth/limit failures cleanly. */
function jsonRpcError(status: number, message: string, code: number, headers?: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }),
    { status, headers: { "content-type": "application/json", "x-content-type-options": "nosniff", ...headers } },
  );
}

export async function POST(req: Request): Promise<Response> {
  const identity = await resolveMcpIdentity(req);
  if (identity.kind === "invalid") {
    return jsonRpcError(401, "Invalid or revoked API key.", -32001);
  }

  const limit = await checkMcpRateLimit(identity);
  if (!limit.success) {
    return jsonRpcError(429, "Rate limit exceeded. Slow down and retry.", -32002, {
      "retry-after": String(limit.retryAfterSeconds),
    });
  }

  return mcpHandler(req);
}

const methodNotAllowed = () =>
  new Response("Method Not Allowed. POST a JSON-RPC request to this Streamable HTTP endpoint.", {
    status: 405,
    headers: { allow: "POST, OPTIONS" },
  });

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;

/** Permissive CORS preflight, the endpoint is an unauthenticated, read-only public surface. */
export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization, mcp-protocol-version",
      "access-control-max-age": "86400",
    },
  });
}
```

> CORS only matters for browser-based MCP clients; native clients (Claude Desktop, Cursor) don't enforce it. We keep the preflight permissive per the spec. If you later need CORS headers on the actual tool responses (not just preflight), wrap `mcpHandler(req)`'s `Response` to add `access-control-allow-origin`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && bun run test transport`
Expected: PASS. If the `initialize` delegate assertion fails because `mcp-handler` returns a different framing (e.g. an SSE `data:` frame), read the actual `text` from the failure and adjust the assertion, `protocolVersion` and `pseolint` will be present in whatever envelope it uses. The 401/429/405/OPTIONS assertions don't touch `mcp-handler` and must pass as written.

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/[transport]/route.ts apps/web/src/app/api/[transport]/route.test.ts
git commit -m "feat(web): remote MCP Streamable HTTP endpoint (auth + rate limit + mcp-handler)"
```

---

## Task 8: Dashboard key-management API

**Files:**
- Create: `apps/web/src/app/api/mcp-keys/route.ts`
- Test: `apps/web/src/app/api/mcp-keys/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/api/mcp-keys/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getOptionalSession: vi.fn() }));
vi.mock("@/lib/mcp-keys", () => ({
  createMcpKey: vi.fn(),
  listMcpKeys: vi.fn(),
  revokeMcpKey: vi.fn(),
}));

import { getOptionalSession } from "@/lib/session";
import { createMcpKey, listMcpKeys, revokeMcpKey } from "@/lib/mcp-keys";
import { GET, POST, DELETE } from "./route";

const sess = vi.mocked(getOptionalSession);
const create = vi.mocked(createMcpKey);
const list = vi.mocked(listMcpKeys);
const revoke = vi.mocked(revokeMcpKey);

function jsonReq(method: string, body?: unknown): Request {
  return new Request("https://pseolint.dev/api/mcp-keys", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  sess.mockReset();
  create.mockReset();
  list.mockReset();
  revoke.mockReset();
  sess.mockResolvedValue({ user: { id: "user_123" } } as never);
});

describe("/api/mcp-keys", () => {
  it("401s when unauthenticated", async () => {
    sess.mockResolvedValue(null as never);
    expect((await GET()).status).toBe(401);
    expect((await POST(jsonReq("POST", { name: "x" }))).status).toBe(401);
  });

  it("POST creates a key and returns the plaintext token once", async () => {
    create.mockResolvedValue({ token: "pseo_secret", prefix: "secretpf" });
    const res = await POST(jsonReq("POST", { name: "My laptop" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ token: "pseo_secret", prefix: "secretpf" });
    expect(create).toHaveBeenCalledWith("user_123", "My laptop");
  });

  it("GET lists the caller's keys", async () => {
    list.mockResolvedValue([
      { id: "k1", name: "Laptop", prefix: "abcd1234", createdAt: new Date(0), lastUsedAt: null },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).keys).toHaveLength(1);
    expect(list).toHaveBeenCalledWith("user_123");
  });

  it("DELETE revokes a key scoped to the caller", async () => {
    const res = await DELETE(jsonReq("DELETE", { id: "k1" }));
    expect(res.status).toBe(200);
    expect(revoke).toHaveBeenCalledWith("user_123", "k1");
  });

  it("DELETE 400s without an id", async () => {
    expect((await DELETE(jsonReq("DELETE", {}))).status).toBe(400);
    expect(revoke).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && bun run test "api/mcp-keys"`
Expected: FAIL, `./route` does not exist.

- [ ] **Step 3: Implement the route**

Create `apps/web/src/app/api/mcp-keys/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getOptionalSession } from "@/lib/session";
import { createMcpKey, listMcpKeys, revokeMcpKey } from "@/lib/mcp-keys";

export const runtime = "nodejs";

const createSchema = z.object({ name: z.string().min(1).max(100).default("MCP key") });
const deleteSchema = z.object({ id: z.string().min(1) });

async function requireUserId(): Promise<string | null> {
  const session = await getOptionalSession();
  return session?.user?.id ?? null;
}

export async function GET(): Promise<Response> {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ keys: await listMcpKeys(userId) });
}

export async function POST(req: Request): Promise<Response> {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { token, prefix } = await createMcpKey(userId, parsed.data.name);
  return NextResponse.json({ token, prefix }, { status: 201 });
}

export async function DELETE(req: Request): Promise<Response> {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = deleteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await revokeMcpKey(userId, parsed.data.id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && bun run test "api/mcp-keys"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/mcp-keys/route.ts apps/web/src/app/api/mcp-keys/route.test.ts
git commit -m "feat(web): dashboard MCP key CRUD API (session-guarded)"
```

---

## Task 9: Dashboard MCP-keys card (UI)

**Files:**
- Create: `apps/web/src/components/dashboard/mcp-keys-card.tsx`

> **No vitest component test here.** The repo has no React unit-test harness (no `jsdom`/`happy-dom`, no `@testing-library/jest-dom`, no `user-event`, and zero existing `*.test.tsx`); UI is covered by Playwright e2e. Introducing a jsdom setup for one card is out of scope for v1. This task verifies via typecheck + production build + the Task 11 manual smoke. If you want automated coverage, add a Playwright spec under `apps/web/tests/` following the existing e2e pattern: optional, not required.
>
> Match the existing card components in `apps/web/src/components/dashboard/` for styling: read one neighbouring card first and mirror its container/markup conventions.

- [ ] **Step 1: Implement the card**

Create `apps/web/src/components/dashboard/mcp-keys-card.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";

interface KeySummary {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const ENDPOINT = "https://pseolint.dev/mcp";

export function McpKeysCard() {
  const [keys, setKeys] = useState<KeySummary[]>([]);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/mcp-keys");
    if (res.ok) setKeys((await res.json()).keys ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createKey() {
    setBusy(true);
    try {
      const res = await fetch("/api/mcp-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "MCP key" }),
      });
      if (res.ok) {
        setNewToken((await res.json()).token);
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    await fetch("/api/mcp-keys", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await refresh();
  }

  return (
    <section className="rounded-lg border p-6">
      <h2 className="text-lg font-semibold">MCP access keys</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Connect Claude, Cursor, or any MCP client to <code>{ENDPOINT}</code>. Anonymous use is rate-limited; a key
        raises your limits and (soon) unlocks the orchestrate tool.
      </p>

      {newToken && (
        <div className="mt-4 rounded-md bg-muted p-4 text-sm">
          <p className="font-medium">Copy this token now, it won&apos;t be shown again:</p>
          <pre className="mt-2 overflow-x-auto rounded bg-background p-2">{newToken}</pre>
          <p className="mt-2">Client config:</p>
          <pre className="mt-1 overflow-x-auto rounded bg-background p-2">
{JSON.stringify({ url: ENDPOINT, headers: { Authorization: `Bearer ${newToken}` } }, null, 2)}
          </pre>
        </div>
      )}

      <button
        type="button"
        onClick={createKey}
        disabled={busy}
        className="mt-4 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create key"}
      </button>

      <ul className="mt-4 space-y-2">
        {keys.map((k) => (
          <li key={k.id} className="flex items-center justify-between text-sm">
            <span>
              <code>pseo_{k.prefix}…</code> · {k.name}
            </span>
            <button type="button" onClick={() => revoke(k.id)} className="text-destructive underline">
              Revoke
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

> The Tailwind utility classes above (`text-muted-foreground`, `bg-muted`, `text-destructive`, etc.) follow the existing design tokens: if a neighbouring dashboard card uses different class names, match those instead.

- [ ] **Step 2: Mount the card on the dashboard settings page**

Find the dashboard settings/account page (likely `apps/web/src/app/dashboard/.../page.tsx`, locate the page that renders account-level cards). Import and render `<McpKeysCard />` alongside the existing cards. Verify by reading the page after editing that the JSX is well-formed.

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/dashboard/mcp-keys-card.tsx apps/web/src/app/dashboard
git commit -m "feat(web): dashboard MCP keys card"
```

---

## Task 10: Registry manifest + docs

**Files:**
- Modify: `packages/mcp/server.json`
- Modify: `packages/mcp/README.md`

- [ ] **Step 1: Add the remote entry to `server.json`**

In `packages/mcp/server.json`, add a top-level `remotes` array (sibling of `packages`):

```json
"remotes": [
  { "type": "streamable-http", "url": "https://pseolint.dev/mcp" }
]
```

- [ ] **Step 2: Validate the manifest still parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('packages/mcp/server.json','utf8')); console.log('valid json')"`
Expected: prints `valid json`.

> Re-publishing to the MCP Registry is deferred (remote URLs need separate domain-ownership proof). This step only updates the source manifest; do not run `mcp-publisher publish` as part of this plan.

- [ ] **Step 3: Document the remote endpoint in the README**

In `packages/mcp/README.md`, add a "Remote server (hosted)" section near the top of the usage docs:

```markdown
## Remote server (hosted, zero-install)

Prefer not to install anything? Point your MCP client at the hosted endpoint:

    https://pseolint.dev/mcp

It serves the three read-only audit tools (`pseolint_audit_site`, `pseolint_explain_score`,
`pseolint_check_page_technical`) with no signup, anonymous use is rate-limited. Create an
API key in your pseolint.dev dashboard and send it as `Authorization: Bearer <key>` to raise
your limits. The AI-orchestrated `pseolint_orchestrate_audit` tool is available only via the
stdio package (below) or the CLI for now.

Example client config:

    { "url": "https://pseolint.dev/mcp", "headers": { "Authorization": "Bearer <key>" } }
```

- [ ] **Step 4: Commit**

```bash
git add packages/mcp/server.json packages/mcp/README.md
git commit -m "docs(mcp): advertise hosted remote endpoint + server.json remotes"
```

---

## Task 11: Full-build integration + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Run the whole monorepo test suite**

Run (repo root): `bun run test` (or `turbo run test`)
Expected: PASS across `@pseolint/core`, `@pseolint/mcp`, and `apps/web`, including all new tests.

- [ ] **Step 2: Typecheck + lint the whole repo**

Run: `turbo run lint`
Expected: PASS (`tsc --noEmit` clean everywhere). Resolve any cross-package type drift before proceeding.

- [ ] **Step 3: Production build of the web app**

Run: `cd apps/web && bun run build`
Expected: `next build` succeeds. Confirm the build output lists the `/api/[transport]` route. The `mcp-handler` peer-dep warning may reappear, it is non-fatal.

- [ ] **Step 4: Manual MCP Inspector smoke test (local)**

In one terminal: `cd apps/web && bun run dev`
In another: `npx @modelcontextprotocol/inspector`, connect with transport **Streamable HTTP** to `http://localhost:3000/mcp`.
Expected: `initialize` succeeds; `tools/list` shows exactly the 3 read-only tools; calling `pseolint_check_page_technical` with a public URL returns a result (this exercises the real engine + SSRF guard end-to-end). Also confirm `http://localhost:3000/api/mcp` works directly (the canonical path) and that the `/mcp` rewrite reaches the same handler.

- [ ] **Step 5: Rate-limit + auth smoke (optional, requires Upstash env locally)**

With `KV_REST_API_URL`/`KV_REST_API_TOKEN` set, hammer `POST /mcp` past 20 calls in 10 min from one IP and confirm a `429` with `Retry-After`. Send `Authorization: Bearer pseo_bogus` and confirm `401`.

- [ ] **Step 6: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "test: verify remote MCP server end-to-end"
```

---

## Notes & decisions carried from the spec

- **No npm republish:** `apps/web` consumes `@pseolint/mcp` via `workspace:*`; the published stdio package is untouched. Bumping it to expose the factory is a deferred additive-minor.
- **`auth.ts` untouched:** keys are self-managed (better-auth 1.6.14 has no `apiKey` plugin); its `mcp` plugin is reserved for the OAuth-later phase.
- **`/api/mcp` is canonical; `/mcp` is the advertised alias** via `next.config` rewrite. If the rewrite misbehaves under load, advertise `/api/mcp` directly (server.json + README).
- **Orchestrate stays off the remote path in v1.** Phase-2 reuses the existing Inngest job + `/api/orchestrate/[id]` polling, gated to `identity.kind === "key"`.
- **SSRF** relies on core's existing `safeMode: "saas"` guard inside the tools: no new SSRF code here.
