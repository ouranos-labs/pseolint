/**
 * Tenant boundary on the two account-scoped MCP tools, against a real Postgres.
 *
 * `pseolint_list_audits` and `pseolint_get_audit` hand an API key the contents
 * of stored reports, and the only thing standing between key A and account B's
 * findings is a `where(eq(audits.userId, userId))` clause. A JS db stub can
 * only assert its own reimplementation of that predicate: it passes just as
 * happily when the real clause is missing. Only a database answers whether the
 * SQL actually scopes.
 *
 * Shape of every case: seed an audit owned by user A, run the tool AS user B,
 * assert B sees nothing, then run it as A and assert A does see it. The second
 * half matters as much as the first, since a predicate matching nothing would
 * pass the attacker check trivially.
 *
 * SAFETY: every case runs in a transaction that is always rolled back (see
 * tests/util/action-db.ts). Gated on RUN_DB_INTEGRATION_TESTS=1 like the other
 * DB-backed suites; `bun run lint` still typechecks it when skipped.
 */
import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RUN_DB_INTEGRATION } from "../util/db-integration";

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  const { makeDbProxy } = await import("../util/db-proxy");
  return { ...actual, db: makeDbProxy(actual.db) };
});

// Object storage is not what this suite asserts; the row lookup is. A constant
// summary means a leak would surface as a successful read, not an R2 miss.
const SUMMARY = JSON.stringify({
  verdict: "caution",
  risk: 44,
  headline: "leaked",
  pageCount: 1,
  templates: [],
  categories: { integrity: { grade: "C", issues: 1 } },
  issues: { blockers: [], shouldFix: [], informational: [] },
});
vi.mock("@/lib/r2", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/r2")>()),
  fetchSummaryJson: async () => SUMMARY,
}));

const { withRollback } = await import("../util/action-db");
const { audits } = await import("@/db/schema");
const { registerAccountTools } = await import("@/lib/mcp-account-tools");

type Tx = import("../util/action-db").Tx;
type Handler = (args: Record<string, unknown>) => Promise<{
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}>;

/** The tools as they are registered for `userId`, i.e. what that API key can call. */
function as(userId: string): { list: Handler; get: Handler } {
  const found = new Map<string, Handler>();
  const server = {
    registerTool: (name: string, _config: unknown, handler: Handler) => found.set(name, handler),
  };
  registerAccountTools(server as unknown as McpServer, userId);
  return { list: found.get("pseolint_list_audits")!, get: found.get("pseolint_get_audit")! };
}

const uniq = () => Math.random().toString(36).slice(2, 10);

async function seedAudit(tx: Tx, userId: string, host = "owned.test") {
  const slug = `a_${uniq()}`;
  const [row] = await tx
    .insert(audits)
    .values({
      slug,
      userId,
      host,
      sourceUrl: `https://${host}`,
      status: "completed",
      risk: 44,
      verdict: "caution",
      storageKey: `reports/${slug}.json`,
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    })
    .returning({ id: audits.id, slug: audits.slug });
  return row;
}

describe.skipIf(!RUN_DB_INTEGRATION)("MCP account tools scope by owner", () => {
  describe("pseolint_list_audits", () => {
    it("never lists another account's audits", async () => {
      await withRollback(2, async ({ tx, users: [owner, attacker] }) => {
        const audit = await seedAudit(tx, owner);

        const seen = await as(attacker).list({ limit: 50 });
        expect(seen.structuredContent!.count).toBe(0);
        expect(seen.content[0].text).not.toContain(audit.slug);

        const mine = await as(owner).list({ limit: 50 });
        expect(mine.structuredContent!.count).toBe(1);
        expect(mine.content[0].text).toContain(audit.slug);
      });
    });

    it("keeps the host filter inside the owner's rows", async () => {
      await withRollback(2, async ({ tx, users: [owner, attacker] }) => {
        const audit = await seedAudit(tx, owner, "target.test");

        // Attacker knows the host and asks for it directly.
        const seen = await as(attacker).list({ host: "target.test", limit: 50 });
        expect(seen.structuredContent!.count).toBe(0);

        const mine = await as(owner).list({ host: "target.test", limit: 50 });
        expect((mine.structuredContent!.audits as { slug: string }[])[0].slug).toBe(audit.slug);
      });
    });

    it("excludes rows that never completed", async () => {
      await withRollback(1, async ({ tx, users: [owner] }) => {
        const done = await seedAudit(tx, owner);
        await tx.insert(audits).values({
          slug: `a_${uniq()}`,
          userId: owner,
          sourceUrl: "https://running.test",
          status: "running",
          expiresAt: new Date(Date.now() + 3600 * 1000),
        });

        const mine = await as(owner).list({ limit: 50 });
        expect((mine.structuredContent!.audits as { slug: string }[]).map((a) => a.slug)).toEqual([
          done.slug,
        ]);
      });
    });

    it("honours the limit", async () => {
      await withRollback(1, async ({ tx, users: [owner] }) => {
        await seedAudit(tx, owner);
        await seedAudit(tx, owner);
        await seedAudit(tx, owner);

        expect((await as(owner).list({ limit: 2 })).structuredContent!.count).toBe(2);
      });
    });
  });

  describe("pseolint_get_audit", () => {
    it("refuses to read another account's report, even with the exact slug", async () => {
      await withRollback(2, async ({ tx, users: [owner, attacker] }) => {
        const audit = await seedAudit(tx, owner);

        const stolen = await as(attacker).get({ slug: audit.slug });
        expect(stolen.isError).toBe(true);
        expect(stolen.structuredContent).toBeUndefined();
        expect(stolen.content[0].text).not.toContain("leaked"); // no report body leaked
        // Same wording as a slug that does not exist at all: no enumeration.
        expect(stolen.content[0].text).toContain("on this account");

        const mine = await as(owner).get({ slug: audit.slug });
        expect(mine.isError).toBeUndefined();
        expect(mine.structuredContent!.risk).toBe(44);
        expect(mine.content[0].text).toContain("leaked");
      });
    });
  });
});
